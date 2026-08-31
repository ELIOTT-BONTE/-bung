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
  type CefrLevel,
  parseAnswerEvaluations,
  parsePassage,
  parseQuestionsAndVocab,
} from '../../inference';
import {
  findVocabByTerm,
  getKnownTerms,
  normalizeTerm,
  recordExposure,
  recordMasteryAttempt,
  saveComprehensionSession,
  toVocabDrafts,
  type ComprehensionAnswerRecord,
  type ComprehensionSession,
  type MasteryAttemptResult,
  type RejectedVocabItem,
  type ReviewGrade,
  type VocabEntry,
} from '../../storage';
import type { FlaggedWord } from '../shared/wordLookup';

export const QUESTION_COUNT = 3;
export const VOCAB_FLAG_COUNT = 6;

export const PASSAGE_LENGTHS = [
  { id: 'short', label: 'Short', approximateWords: 80 },
  { id: 'medium', label: 'Medium', approximateWords: 140 },
  { id: 'long', label: 'Long', approximateWords: 220 },
] as const;

export type PassageLengthId = (typeof PASSAGE_LENGTHS)[number]['id'];

export function passageLengthById(id: PassageLengthId) {
  return PASSAGE_LENGTHS.find((option) => option.id === id) ?? PASSAGE_LENGTHS[1];
}

/**
 * Bounds on a hand-typed length. The floor is where there is still enough text
 * to ask three comprehension questions about; the ceiling is what the decode
 * budget below can finish without cutting off mid-sentence, and is also about
 * as much as the smallest local model holds together for.
 */
export const CUSTOM_PASSAGE_WORDS = { min: 40, max: 400 } as const;

export interface CustomLengthReading {
  /** The usable target, or null while the field cannot be acted on. */
  words: number | null;
  /** Why it cannot be acted on. Null when it is fine, or still empty. */
  problem: string | null;
}

/**
 * Reads the free-typed length field. An empty field is not an error — it is
 * simply not ready — so the UI can stay quiet until the learner types
 * something, and only complain about input it had to reject.
 */
export function readCustomLength(raw: string): CustomLengthReading {
  const trimmed = raw.trim();
  if (trimmed === '') return { words: null, problem: null };

  if (!/^\d+$/.test(trimmed)) {
    return { words: null, problem: 'Enter a whole number of words.' };
  }

  const words = Number.parseInt(trimmed, 10);
  const { min, max } = CUSTOM_PASSAGE_WORDS;

  if (words < min) {
    return { words: null, problem: `Too short to ask questions about — use at least ${min} words.` };
  }
  if (words > max) {
    return { words: null, problem: `${max} words is the most a passage can be.` };
  }

  return { words, problem: null };
}

/** How many unseen words a passage may introduce, scaled to how hard it is. */
export function newWordBudgetFor(level: CefrLevel): number {
  switch (level) {
    case 'A1':
      return 2;
    case 'A2':
      return 3;
    case 'B1':
      return 4;
    case 'B2':
      return 5;
    case 'C1':
    case 'C2':
      return 6;
  }
}

/**
 * Decode budget for a passage. German words are often more than one token, and
 * a cap that is too tight cuts the text off mid-sentence. The ceiling clears
 * `CUSTOM_PASSAGE_WORDS.max` at that ratio, so the largest length a learner can
 * ask for is one the budget can actually deliver.
 */
export function passageMaxTokens(approximateWords: number): number {
  return Math.min(1200, Math.max(280, Math.round(approximateWords * 2.4 + 80)));
}

export interface GeneratePassageOptions {
  level?: CefrLevel;
  approximateWords?: number;
}

/**
 * A comprehension answer is indirect evidence: the learner showed they know
 * what the word means, but did not have to produce it in isolation. Graded 4
 * rather than 5 so it advances the schedule without inflating the ease factor.
 */
const COMPREHENSION_GRADE: ReviewGrade = 4;

export async function generatePassage(
  theme: string,
  options: GeneratePassageOptions = {},
): Promise<string> {
  const level = options.level ?? 'A2';
  const approximateWords = options.approximateWords ?? 140;
  const knownTerms = await getKnownTerms();
  const raw = await generateText(
    buildPassagePrompt({
      theme,
      knownTerms,
      newWordBudget: newWordBudgetFor(level),
      approximateWords,
      level,
    }),
    { maxTokens: passageMaxTokens(approximateWords) },
  );
  return parsePassage(raw);
}

export interface StudyMaterial {
  questions: string[];
  /** Words the passage suggests. Suggestions only — see below. */
  vocab: FlaggedWord[];
  /** Flagged words too incomplete to offer, with the reason. */
  rejected: RejectedVocabItem[];
}

/**
 * Second call: questions and flagged vocabulary in one round trip.
 *
 * Nothing is written here. A passage flagging a word is the app's opinion about
 * what is worth learning, not the learner's decision to learn it, and their
 * vocabulary list is theirs to fill — so a flagged word stays a suggestion
 * until they tap it and add it. All this does look up is whether they already
 * have the word, because a word they own that turns up in their reading is a
 * genuine exposure and should be credited as one when the session ends.
 */
export async function prepareStudyMaterial(
  passage: string,
  options: { level?: CefrLevel } = {},
): Promise<StudyMaterial> {
  const raw = await generateText(
    buildQuestionsAndVocabPrompt({
      passage,
      questionCount: QUESTION_COUNT,
      vocabCount: VOCAB_FLAG_COUNT,
      level: options.level ?? 'A2',
    }),
  );

  const { questions, vocab: extracted } = parseQuestionsAndVocab(raw);
  const { drafts, rejected } = toVocabDrafts(extracted);

  const vocab = await Promise.all(
    drafts.map(async (draft) => ({
      draft,
      entry: (await findVocabByTerm(draft.term)) ?? null,
    })),
  );

  return { questions, vocab, rejected };
}

export interface EvaluationOutcome {
  answers: ComprehensionAnswerRecord[];
  /** Words a correct answer demonstrated understanding of. */
  masteryVocabIds: string[];
}

export interface TrackedTerm {
  term: string;
  /**
   * Null for a word the learner has not saved. It is still worth naming to the
   * evaluator — the feedback reads better when it can talk about the passage's
   * key words — but there is no entry to credit, so using it correctly earns
   * nothing. Mastery of a word they never took is not a thing we can record.
   */
  vocabId: string | null;
}

export async function evaluateAnswers(
  passage: string,
  questions: readonly string[],
  answers: readonly string[],
  tracked: readonly TrackedTerm[],
): Promise<EvaluationOutcome> {
  const raw = await generateText(
    buildAnswerEvaluationPrompt({
      passage,
      questions,
      answers,
      trackedTerms: tracked.map((item) => item.term),
    }),
  );

  const evaluations = parseAnswerEvaluations(raw, questions.length);
  const byTerm = new Map(
    tracked.flatMap((item) =>
      item.vocabId === null ? [] : [[normalizeTerm(item.term), item.vocabId] as const],
    ),
  );
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
  /**
   * Words from this passage that were already in the learner's vocabulary. Only
   * words they actually hold can be exposed — a suggestion they never took has
   * nothing to count against.
   */
  knownVocab: readonly VocabEntry[];
  /**
   * Words they looked up mid-passage and chose to save. Adding them touched no
   * counter, so this is where they finally earn their exposure — on the same
   * terms as a word they already had, no better.
   */
  lookedUpVocab?: readonly VocabEntry[];
  masteryVocabIds: readonly string[];
}

export interface CompletionResult {
  session: ComprehensionSession;
  exposedCount: number;
  masteryResults: MasteryAttemptResult[];
}

export async function completeSession(input: CompleteSessionInput): Promise<CompletionResult> {
  // A word can be both already known and looked up again, and an exposure is
  // per word, not per way of meeting it.
  const exposedVocabIds = [
    ...new Set([
      ...input.knownVocab.map((entry) => entry.id),
      ...(input.lookedUpVocab ?? []).map((entry) => entry.id),
    ]),
  ];

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
