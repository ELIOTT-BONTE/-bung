/**
 * Shapes the app expects back from `generateText`, plus the readers that turn
 * loose model text into them. These are inference-layer types: storage does
 * its own validation before persisting anything (see `storage/vocabDraft.ts`).
 */

import {
  asArray,
  asBoolean,
  asNullableString,
  asNumber,
  asRecord,
  asString,
  cleanText,
  parseJsonLoose,
} from './parse';

export interface ExtractedVocabItem {
  term: string;
  /** Loose on purpose — storage narrows it to its own union. */
  partOfSpeech: string;
  determiner: string | null;
  pluralForm: string | null;
  definition: string;
  /** Journaling only: was the learner's own usage already correct? */
  usedCorrectly: boolean | null;
  note: string | null;
}

export interface QuestionsAndVocab {
  questions: string[];
  vocab: ExtractedVocabItem[];
}

export interface AnswerEvaluation {
  questionIndex: number;
  correct: boolean;
  feedback: string;
  /** Terms the answer showed real understanding of, verbatim from the model. */
  demonstratedTerms: string[];
}

export interface CorrectionCheck {
  needsCorrection: boolean;
  summary: string;
}

export interface SentenceEvaluation {
  correct: boolean;
  /** SuperMemo 0-5 grade, clamped. */
  grade: number;
  feedback: string;
}

function readVocabItem(value: unknown): ExtractedVocabItem | null {
  if (typeof value !== 'object' || value === null) return null;
  const record = value as Record<string, unknown>;
  const term = asString(record.term);
  if (term === '') return null;

  return {
    term,
    partOfSpeech: asString(record.partOfSpeech, 'other').toLowerCase(),
    determiner: asNullableString(record.determiner),
    pluralForm: asNullableString(record.pluralForm),
    definition: asString(record.definition),
    usedCorrectly:
      record.usedCorrectly === undefined || record.usedCorrectly === null
        ? null
        : asBoolean(record.usedCorrectly),
    note: asNullableString(record.note),
  };
}

export function parsePassage(raw: string): string {
  return cleanText(raw);
}

export function parseQuestionsAndVocab(raw: string): QuestionsAndVocab {
  const record = asRecord(parseJsonLoose(raw), raw);
  const questions = asArray(record.questions)
    .map((entry) => asString(entry))
    .filter((entry) => entry !== '');
  const vocab = asArray(record.vocab)
    .map(readVocabItem)
    .filter((item): item is ExtractedVocabItem => item !== null);

  return { questions, vocab };
}

export function parseAnswerEvaluations(raw: string, questionCount: number): AnswerEvaluation[] {
  const record = asRecord(parseJsonLoose(raw), raw);
  const parsed = new Map<number, AnswerEvaluation>();

  asArray(record.results).forEach((entry, fallbackIndex) => {
    if (typeof entry !== 'object' || entry === null) return;
    const row = entry as Record<string, unknown>;
    const index = Math.trunc(asNumber(row.questionIndex, fallbackIndex));
    parsed.set(index, {
      questionIndex: index,
      correct: asBoolean(row.correct),
      feedback: asString(row.feedback),
      demonstratedTerms: asArray(row.demonstratedTerms)
        .map((term) => asString(term))
        .filter((term) => term !== ''),
    });
  });

  // Always return one row per question so the UI never indexes into a hole.
  return Array.from({ length: questionCount }, (_, index) => {
    const found = parsed.get(index);
    if (found) return found;
    return {
      questionIndex: index,
      correct: false,
      feedback: 'The evaluator did not return a result for this answer.',
      demonstratedTerms: [],
    };
  });
}

export function parseCorrectionCheck(raw: string): CorrectionCheck {
  const record = asRecord(parseJsonLoose(raw), raw);
  return {
    needsCorrection: asBoolean(record.needsCorrection),
    summary: asString(record.summary),
  };
}

export function parseCorrection(raw: string): string {
  return cleanText(raw);
}

export function parseJournalVocab(raw: string): ExtractedVocabItem[] {
  const record = asRecord(parseJsonLoose(raw), raw);
  return asArray(record.vocab)
    .map(readVocabItem)
    .filter((item): item is ExtractedVocabItem => item !== null);
}

export function parseSentenceEvaluation(raw: string): SentenceEvaluation {
  const record = asRecord(parseJsonLoose(raw), raw);
  const correct = asBoolean(record.correct);
  const rawGrade = asNumber(record.grade, correct ? 4 : 2);
  const grade = Math.max(0, Math.min(5, Math.round(rawGrade)));
  return {
    correct,
    grade,
    feedback: asString(record.feedback),
  };
}
