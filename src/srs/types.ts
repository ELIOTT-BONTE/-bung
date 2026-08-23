/**
 * Scheduling and mastery types. Pure data — this module imports nothing.
 */

export interface SrsState {
  /** Days until the next review. */
  interval: number;
  /** Epoch ms at which the card becomes due. */
  dueAt: number;
  /** SM-2 ease factor, floored at `MIN_EASE_FACTOR`. */
  easeFactor: number;
  /** Consecutive passing reviews; reset to 0 on a lapse. */
  repetitions: number;
  /** Lifetime count of failed reviews. */
  lapses: number;
  lastReviewedAt: number | null;
}

/** SuperMemo grade: 0-2 fail, 3-5 pass. */
export type ReviewGrade = 0 | 1 | 2 | 3 | 4 | 5;

/**
 * Every exercise type that can move mastery. All of them are active recall or
 * production; passive exposure has no member here on purpose, which is what
 * makes "exposure never raises mastery" a type-level guarantee rather than a
 * convention.
 */
export type MasteryExerciseType =
  | 'flashcard'
  | 'sentence-production'
  | 'comprehension-answer'
  | 'journal-usage';

/** Exercise types where the learner had to produce German themselves. */
export type ProductionExerciseType = Exclude<MasteryExerciseType, 'flashcard'>;

export const PRODUCTION_EXERCISE_TYPES: readonly ProductionExerciseType[] = [
  'sentence-production',
  'comprehension-answer',
  'journal-usage',
];

export function isProductionExercise(type: MasteryExerciseType): type is ProductionExerciseType {
  return type !== 'flashcard';
}

/**
 * The minimum an event needs to carry for mastery derivation. `srsReviewLog`
 * rows are a superset of this.
 */
export interface MasteryEvent {
  reviewedAt: number;
  exerciseType: MasteryExerciseType;
  grade: ReviewGrade;
  correct: boolean;
}

/** Exercise types the vocabulary trainer can schedule for a due word. */
export type TrainingExerciseType = 'flashcard' | 'sentence-production';

export const MASTERY_MAX = 5;
export const DAY_MS = 86_400_000;
