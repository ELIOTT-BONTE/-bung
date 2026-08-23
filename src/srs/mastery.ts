/**
 * Mastery derivation.
 *
 * Mastery is never a mutable running score. It is recomputed from the review
 * log every time a new review lands, which is what keeps the rule "passive
 * exposure can never raise mastery" true by construction: exposure produces no
 * log rows, so it cannot change the output of this function.
 *
 * The rules, in order:
 *   1. Only reviews the evaluator marked correct count as evidence.
 *   2. Repeated correct answers on the same day count once — mastery needs
 *      spacing, not repetition.
 *   3. One successful production event (a sentence, a journal usage, a
 *      comprehension answer) is worth a bonus level, because producing a word
 *      is stronger evidence than recognising it.
 *   4. Failures since the last success subtract directly.
 *   5. Recognition alone caps out at 3 of 5 — the top two levels require the
 *      learner to have produced the word at least once.
 */

import { DAY_MS, MASTERY_MAX, isProductionExercise, type MasteryEvent } from './types';
import { PASSING_GRADE } from './sm2';

export const RECOGNITION_ONLY_CAP = 3;

export interface MasteryBreakdown {
  level: number;
  /** Number of distinct days with at least one correct review. */
  successDays: number;
  successfulProductions: number;
  /** Failures recorded after the most recent success. */
  failuresSinceLastSuccess: number;
  cappedByMissingProduction: boolean;
}

function isSuccess(event: MasteryEvent): boolean {
  return event.correct && event.grade >= PASSING_GRADE;
}

/** UTC day bucket — good enough for spacing, and stable across time zones. */
function dayBucket(timestamp: number): number {
  return Math.floor(timestamp / DAY_MS);
}

export function deriveMasteryBreakdown(events: readonly MasteryEvent[]): MasteryBreakdown {
  const ordered = [...events].sort((a, b) => a.reviewedAt - b.reviewedAt);
  const successes = ordered.filter(isSuccess);

  const successDays = new Set(successes.map((event) => dayBucket(event.reviewedAt))).size;
  const successfulProductions = successes.filter((event) => isProductionExercise(event.exerciseType)).length;

  const lastSuccessAt = successes.length > 0 ? successes[successes.length - 1].reviewedAt : -Infinity;
  const failuresSinceLastSuccess = ordered.filter(
    (event) => !isSuccess(event) && event.reviewedAt > lastSuccessAt,
  ).length;

  const productionBonus = successfulProductions > 0 ? 1 : 0;
  const raw = successDays + productionBonus - failuresSinceLastSuccess;

  let level = Math.max(0, Math.min(MASTERY_MAX, raw));
  const cappedByMissingProduction = successfulProductions === 0 && level > RECOGNITION_ONLY_CAP;
  if (cappedByMissingProduction) level = RECOGNITION_ONLY_CAP;

  return {
    level,
    successDays,
    successfulProductions,
    failuresSinceLastSuccess,
    cappedByMissingProduction,
  };
}

export function deriveMastery(events: readonly MasteryEvent[]): number {
  return deriveMasteryBreakdown(events).level;
}

export const MASTERY_LABELS: readonly string[] = [
  'New',
  'Recognised',
  'Familiar',
  'Comfortable',
  'Productive',
  'Mastered',
];

export function masteryLabel(level: number): string {
  const index = Math.max(0, Math.min(MASTERY_MAX, Math.round(level)));
  return MASTERY_LABELS[index];
}
