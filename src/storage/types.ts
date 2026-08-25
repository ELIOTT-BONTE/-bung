/**
 * Persisted record shapes.
 *
 * The schema is language-agnostic: every record carries a `language` code and
 * nothing about German is baked into a store name. What *is* German-specific
 * lives in optional fields (`determiner`, `pluralForm`) that only nouns fill.
 *
 * This module depends on `srs` and `diff` for their pure types only. It never
 * imports the inference layer.
 */

import type { DiffSegment } from '../diff/types';
import type { MasteryExerciseType, ReviewGrade, SrsState } from '../srs/types';

// Re-exported so consumers of a record can name its field types without
// reaching past storage into the srs layer.
export type { MasteryExerciseType, ReviewGrade, SrsState };

export type LanguageCode = string;

export const DEFAULT_LANGUAGE: LanguageCode = 'de';

/** Which mode a word was encountered or practised in. */
export type SkillContext = 'comprehension' | 'journaling' | 'vocab-training';

export type PartOfSpeech = 'noun' | 'verb' | 'adjective' | 'adverb' | 'phrase' | 'other';

/** German noun gender, carried as the article the learner has to memorise. */
export type Determiner = 'der' | 'die' | 'das';

export const DETERMINERS: readonly Determiner[] = ['der', 'die', 'das'];

export interface VocabEntry {
  id: string;
  language: LanguageCode;
  /** Dictionary form as shown to the learner, e.g. `Bahnhof` (no article). */
  term: string;
  /** Case-folded key used for de-duplication. */
  normalizedTerm: string;
  definition: string;
  partOfSpeech: PartOfSpeech;
  /** Required for nouns, null otherwise. Captured when first saved, never derived later. */
  determiner: Determiner | null;
  /** Required for nouns, null otherwise. */
  pluralForm: string | null;
  firstSeenAt: number;
  /**
   * Passive encounters only: appearing in a generated passage, or being shown
   * as the front of a flashcard. Raising this can never raise mastery.
   */
  exposureCount: number;
  lastExposedAt: number | null;
  skillContexts: SkillContext[];
  srs: SrsState;
  /**
   * Derived from `srsReviewLog`, never incremented in place. Cached on the
   * entry so it can be indexed and read without replaying the log.
   */
  masteryLevel: number;
  /** Number of logged mastery-qualifying attempts, pass or fail. */
  masteryEventCount: number;
  notes: string | null;
}

/**
 * What a caller must supply to save a word.
 *
 * A discriminated union rather than optional fields: it is a compile error to
 * save a noun without its determiner and plural, which is exactly the rule the
 * extraction prompts are written to satisfy.
 */
export type VocabDraft = NounDraft | NonNounDraft;

export interface NounDraft {
  partOfSpeech: 'noun';
  term: string;
  definition: string;
  determiner: Determiner;
  pluralForm: string;
  notes?: string | null;
}

export interface NonNounDraft {
  partOfSpeech: Exclude<PartOfSpeech, 'noun'>;
  term: string;
  definition: string;
  determiner?: null;
  pluralForm?: null;
  notes?: string | null;
}

/**
 * The only shape that can move a word's SRS state or mastery.
 *
 * `exerciseType` comes from `MasteryExerciseType`, whose members are all active
 * recall or production. There is no way to express "the learner saw this word"
 * here, so passive exposure physically cannot reach the mastery path.
 */
export interface MasteryAttempt {
  vocabId: string;
  exerciseType: MasteryExerciseType;
  grade: ReviewGrade;
  correct: boolean;
  sourceMode: SkillContext;
  /** Journal entry or comprehension session this attempt came from. */
  sourceId?: string | null;
  reviewedAt?: number;
}

export interface SrsReviewLogEntry {
  id: string;
  vocabId: string;
  language: LanguageCode;
  reviewedAt: number;
  exerciseType: MasteryExerciseType;
  grade: ReviewGrade;
  correct: boolean;
  sourceMode: SkillContext;
  sourceId: string | null;
  srsBefore: SrsState;
  srsAfter: SrsState;
  masteryBefore: number;
  masteryAfter: number;
}

export interface JournalEntry {
  id: string;
  language: LanguageCode;
  createdAt: number;
  updatedAt: number;
  originalText: string;
  /** Null when the checker found nothing to correct. */
  correctedText: string | null;
  correctionSummary: string | null;
  /** Word-level diff, computed client-side from the two plain texts. */
  diff: DiffSegment[];
  /** Vocab entries touched by this entry. */
  vocabIds: string[];
  status: 'draft' | 'reviewed';
}

export interface ComprehensionAnswerRecord {
  question: string;
  answer: string;
  correct: boolean;
  feedback: string;
  /** Terms the evaluation confirmed the answer demonstrated understanding of. */
  demonstratedTerms: string[];
}

export interface ComprehensionSession {
  id: string;
  language: LanguageCode;
  createdAt: number;
  completedAt: number | null;
  theme: string;
  passage: string;
  answers: ComprehensionAnswerRecord[];
  /** Every vocab entry the passage exposed the learner to. */
  exposedVocabIds: string[];
  /** The subset that earned a mastery-qualifying event from the answers. */
  masteryVocabIds: string[];
}

export interface AppSettings {
  /**
   * Id of the local engine used when no hosted provider can answer. Typed as a
   * string on purpose — storage does not depend on the inference layer's union;
   * the app narrows it.
   */
  activeTier: string;
  /**
   * Keys for the hosted providers, by provider id, as entered by the user. A
   * blank or absent entry means that provider is skipped. Loosely typed for the
   * same reason as `activeTier`.
   */
  apiKeys: Record<string, string>;
  firstRunCompleted: boolean;
  starterVocabLoaded: boolean;
  language: LanguageCode;
  /** Words per vocabulary training session. */
  dailyReviewTarget: number;
}

export const SETTINGS_KEY = 'app';

export const DEFAULT_SETTINGS: AppSettings = {
  activeTier: 'mock',
  apiKeys: {},
  firstRunCompleted: false,
  starterVocabLoaded: false,
  language: DEFAULT_LANGUAGE,
  dailyReviewTarget: 12,
};

export interface StoredSettings extends AppSettings {
  id: typeof SETTINGS_KEY;
}
