/**
 * SM-2 scheduler, as a pure function.
 *
 * Deviations from the 1987 SuperMemo algorithm, all deliberate:
 *   - a failed review sets the interval to 1 day rather than repeating the
 *     card within the same session (there is no intra-session queue here)
 *   - the ease factor is only updated on a passing grade, so a run of failures
 *     cannot drive it below the floor faster than the floor allows
 */

import { DAY_MS, type ReviewGrade, type SrsState } from './types';

export const MIN_EASE_FACTOR = 1.3;
export const INITIAL_EASE_FACTOR = 2.5;
export const PASSING_GRADE: ReviewGrade = 3;
export const FIRST_INTERVAL_DAYS = 1;
export const SECOND_INTERVAL_DAYS = 6;

export function initialSrsState(now: number): SrsState {
  return {
    interval: 0,
    // A brand new word is due immediately: it has been seen, never recalled.
    dueAt: now,
    easeFactor: INITIAL_EASE_FACTOR,
    repetitions: 0,
    lapses: 0,
    lastReviewedAt: null,
  };
}

export function isPassing(grade: ReviewGrade): boolean {
  return grade >= PASSING_GRADE;
}

export interface ScheduleResult {
  state: SrsState;
  passed: boolean;
  /**
   * True when this review is evidence of successful active recall or
   * production. Only reviews reaching this function can be, since callers must
   * supply a `MasteryExerciseType` to get here.
   */
  masteryShouldIncrease: boolean;
}

function nextEaseFactor(easeFactor: number, grade: ReviewGrade): number {
  const adjustment = 0.1 - (5 - grade) * (0.08 + (5 - grade) * 0.02);
  return Math.max(MIN_EASE_FACTOR, easeFactor + adjustment);
}

function nextInterval(state: SrsState, easeFactor: number): number {
  if (state.repetitions === 0) return FIRST_INTERVAL_DAYS;
  if (state.repetitions === 1) return SECOND_INTERVAL_DAYS;
  return Math.max(1, Math.round(state.interval * easeFactor));
}

export function schedule(state: SrsState, grade: ReviewGrade, now: number): ScheduleResult {
  const passed = isPassing(grade);

  if (!passed) {
    return {
      state: {
        interval: FIRST_INTERVAL_DAYS,
        dueAt: now + FIRST_INTERVAL_DAYS * DAY_MS,
        easeFactor: Math.max(MIN_EASE_FACTOR, state.easeFactor - 0.2),
        repetitions: 0,
        lapses: state.lapses + 1,
        lastReviewedAt: now,
      },
      passed: false,
      masteryShouldIncrease: false,
    };
  }

  const easeFactor = nextEaseFactor(state.easeFactor, grade);
  const interval = nextInterval(state, easeFactor);

  return {
    state: {
      interval,
      dueAt: now + interval * DAY_MS,
      easeFactor,
      repetitions: state.repetitions + 1,
      lapses: state.lapses,
      lastReviewedAt: now,
    },
    passed: true,
    masteryShouldIncrease: true,
  };
}

export function isDue(state: SrsState, now: number): boolean {
  return state.dueAt <= now;
}

export function daysUntilDue(state: SrsState, now: number): number {
  return Math.ceil((state.dueAt - now) / DAY_MS);
}
