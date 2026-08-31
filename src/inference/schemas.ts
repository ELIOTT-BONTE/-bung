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
  ModelOutputError,
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

export interface CorrectionResult {
  /** The rewrite. Compared against the original by the caller, never trusted. */
  correctedText: string;
  /** One short English sentence, or `''` when the engine gave none. */
  summary: string;
}

export interface SentenceEvaluation {
  correct: boolean;
  /** SuperMemo 0-5 grade, clamped. */
  grade: number;
  feedback: string;
}

export interface WordLookup extends ExtractedVocabItem {
  /** What the tapped form was, e.g. `dative plural of der Regenbogen`. */
  surfaceRole: string | null;
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

/**
 * Deliberately the most tolerant parser here, because this is the one reply
 * that is still fully usable without its wrapper: an engine that ignores the
 * schema and answers in plain German has produced a perfectly good correction.
 *
 * An envelope with no rewrite in it, though, is a failure and throws. Returning
 * an empty string instead would surface as "nothing to correct", which is the
 * silent-skip this call was merged to eliminate.
 */
export function parseCorrection(raw: string): CorrectionResult {
  let record: Record<string, unknown>;
  try {
    record = asRecord(parseJsonLoose(raw), raw);
  } catch {
    const prose = cleanText(raw);
    if (prose === '') {
      throw new ModelOutputError('Correction reply was empty', raw);
    }
    return { correctedText: prose, summary: '' };
  }

  const correctedText = cleanText(asString(record.corrected));
  if (correctedText === '') {
    throw new ModelOutputError('Correction reply contained no corrected text', raw);
  }

  return { correctedText, summary: asString(record.summary) };
}

export function parseJournalVocab(raw: string): ExtractedVocabItem[] {
  const record = asRecord(parseJsonLoose(raw), raw);
  return asArray(record.vocab)
    .map(readVocabItem)
    .filter((item): item is ExtractedVocabItem => item !== null);
}

/**
 * A single word, read by the same function that reads a list entry, so the
 * lookup path cannot drift from the extraction path on what a valid noun is.
 */
export function parseWordLookup(raw: string): WordLookup {
  const record = asRecord(parseJsonLoose(raw), raw);
  const item = readVocabItem(record);
  if (!item) {
    throw new ModelOutputError('Lookup reply named no word', raw);
  }
  return { ...item, surfaceRole: asNullableString(record.surfaceRole) };
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
