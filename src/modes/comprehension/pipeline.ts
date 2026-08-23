/**
 * Text comprehension orchestration.
 *
 * All model access goes through `generateText`; all persistence goes through
 * the storage repos. There is no comprehension-specific inference path and no
 * React in this file, so the flow can be reasoned about (and later tested)
 * without a DOM.
 *
 * The exposure/mastery split lives in `completeSession`:
 *   - every word the passage put in front of the learner gets an exposure
 *   - only words the evaluation says an answer demonstrated get a logged,
 *     mastery-qualifying event
 */

import {
  buildAnswerEvaluationPrompt,
  buildPassagePrompt,
  buildQuestionsAndVocabPrompt,
  generateText,
  parseAnswerEvaluations,
  parsePassage,
  parseQuestionsAndVocab,
} from '../../inference';
import {
  getKnownTerms,
  normalizeTerm,
  recordExposure,
  recordMasteryAttempt,
  saveComprehensionSession,
  toVocabDrafts,
  upsertVocabDrafts,
  type ComprehensionAnswerRecord,
  type ComprehensionSession,
  type MasteryAttemptResult,
  type RejectedVocabItem,
  type ReviewGrade,
  type VocabEntry,
} from '../../storage';

export const QUESTION_COUNT = 3;
export const VOCAB_FLAG_COUNT = 6;
export const NEW_WORD_BUDGET = 4;

/**
 * A comprehension answer is indirect evidence: the learner showed they know
 * what the word means, but did not have to produce it in isolation. Graded 4
 * rather than 5 so it advances the schedule without inflating the ease factor.
 */
const COMPREHENSION_GRADE: ReviewGrade = 4;

export async function generatePassage(theme: string): Promise<string> {
  const knownTerms = await getKnownTerms();
  const raw = await generateText(
    buildPassagePrompt({ theme, knownTerms, newWordBudget: NEW_WORD_BUDGET }),
  );
  return parsePassage(raw);
}

export interface StudyMaterial {
  questions: string[];
  /** Vocab entries saved from the passage, ready to be exposed on completion. */
  vocab: VocabEntry[];
  /** Flagged words that could not be stored, with the reason. */
  rejected: RejectedVocabItem[];
}

/**
 * Second call: questions and flagged vocabulary in one round trip. Saving the
 * words here is bookkeeping only — no counters move until the session ends.
 */
export async function prepareStudyMaterial(passage: string): Promise<StudyMaterial> {
  const raw = await generateText(
    buildQuestionsAndVocabPrompt({
      passage,
      questionCount: QUESTION_COUNT,
      vocabCount: VOCAB_FLAG_COUNT,
    }),
  );

  const { questions, vocab: extracted } = parseQuestionsAndVocab(raw);
  const { drafts, rejected } = toVocabDrafts(extracted);
  const upserted = await upsertVocabDrafts(drafts);

  return {
    questions,
    vocab: upserted.map((result) => result.entry),
    rejected,
  };
}

export interface EvaluationOutcome {
  answers: ComprehensionAnswerRecord[];
  /** Words a correct answer demonstrated understanding of. */
  masteryVocabIds: string[];
}

export async function evaluateAnswers(
  passage: string,
  questions: readonly string[],
  answers: readonly string[],
  vocab: readonly VocabEntry[],
): Promise<EvaluationOutcome> {
  const raw = await generateText(
    buildAnswerEvaluationPrompt({
      passage,
      questions,
      answers,
      trackedTerms: vocab.map((entry) => entry.term),
    }),
  );

  const evaluations = parseAnswerEvaluations(raw, questions.length);
  const byTerm = new Map(vocab.map((entry) => [normalizeTerm(entry.term), entry.id]));
  const masteryVocabIds = new Set<string>();

  const records: ComprehensionAnswerRecord[] = evaluations.map((evaluation) => {
    if (evaluation.correct) {
      for (const term of evaluation.demonstratedTerms) {
        const id = byTerm.get(normalizeTerm(term));
        if (id) masteryVocabIds.add(id);
      }
    }
    return {
      question: questions[evaluation.questionIndex] ?? '',
      answer: answers[evaluation.questionIndex] ?? '',
      correct: evaluation.correct,
      feedback: evaluation.feedback,
      demonstratedTerms: evaluation.demonstratedTerms,
    };
  });

  return { answers: records, masteryVocabIds: [...masteryVocabIds] };
}

export interface CompleteSessionInput {
  theme: string;
  passage: string;
  answers: ComprehensionAnswerRecord[];
  vocab: readonly VocabEntry[];
  masteryVocabIds: readonly string[];
}

export interface CompletionResult {
  session: ComprehensionSession;
  exposedCount: number;
  masteryResults: MasteryAttemptResult[];
}

export async function completeSession(input: CompleteSessionInput): Promise<CompletionResult> {
  const exposedVocabIds = input.vocab.map((entry) => entry.id);

  const session = await saveComprehensionSession({
    theme: input.theme,
    passage: input.passage,
    answers: input.answers,
    exposedVocabIds,
    masteryVocabIds: [...input.masteryVocabIds],
  });

  // Passive: the passage put these words in front of the learner. This call
  // cannot touch mastery — it takes no grade.
  await recordExposure(exposedVocabIds, 'comprehension');

  // Active: only the words an answer actually demonstrated.
  const masteryResults: MasteryAttemptResult[] = [];
  for (const vocabId of input.masteryVocabIds) {
    masteryResults.push(
      await recordMasteryAttempt({
        vocabId,
        exerciseType: 'comprehension-answer',
        grade: COMPREHENSION_GRADE,
        correct: true,
        sourceMode: 'comprehension',
        sourceId: session.id,
      }),
    );
  }

  return { session, exposedCount: exposedVocabIds.length, masteryResults };
}
