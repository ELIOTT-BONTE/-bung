/**
 * Picks how a due word gets reviewed.
 *
 * The shape of the curve: a word the learner has never successfully recalled
 * only ever gets a flashcard — asking someone to write a sentence with a word
 * they cannot recall teaches nothing. From there, production becomes steadily
 * more likely, until a nearly-mastered word is almost always asked for
 * production.
 *
 * Pure, with the random source injected so the distribution is testable.
 */

import { MASTERY_MAX, type TrainingExerciseType } from './types';

/** Probability of "use it in a sentence" per mastery level, index = level. */
export const PRODUCTION_PROBABILITY_BY_MASTERY: readonly number[] = [0, 0.2, 0.4, 0.6, 0.8, 0.9];

export function productionProbability(masteryLevel: number): number {
  const level = Math.max(0, Math.min(MASTERY_MAX, Math.round(masteryLevel)));
  return PRODUCTION_PROBABILITY_BY_MASTERY[level];
}

export function selectExerciseType(
  masteryLevel: number,
  rng: () => number = Math.random,
): TrainingExerciseType {
  return rng() < productionProbability(masteryLevel) ? 'sentence-production' : 'flashcard';
}

export interface ScheduledExercise<T> {
  item: T;
  exerciseType: TrainingExerciseType;
}

/** Assigns an exercise type to each due word in one pass. */
export function assignExercises<T>(
  items: readonly T[],
  masteryOf: (item: T) => number,
  rng: () => number = Math.random,
): ScheduledExercise<T>[] {
  return items.map((item) => ({
    item,
    exerciseType: selectExerciseType(masteryOf(item), rng),
  }));
}
