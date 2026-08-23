import { describe, expect, it } from 'vitest';
import {
  FIRST_INTERVAL_DAYS,
  INITIAL_EASE_FACTOR,
  MIN_EASE_FACTOR,
  SECOND_INTERVAL_DAYS,
  initialSrsState,
  isDue,
  schedule,
} from './sm2';
import { DAY_MS, type ReviewGrade } from './types';

const NOW = Date.UTC(2026, 0, 15, 9, 0, 0);

describe('initialSrsState', () => {
  it('makes a newly seen word due immediately with no review history', () => {
    const state = initialSrsState(NOW);
    expect(state).toEqual({
      interval: 0,
      dueAt: NOW,
      easeFactor: INITIAL_EASE_FACTOR,
      repetitions: 0,
      lapses: 0,
      lastReviewedAt: null,
    });
    expect(isDue(state, NOW)).toBe(true);
  });
});

describe('schedule', () => {
  it('uses the standard 1 then 6 day ladder for the first two passes', () => {
    const first = schedule(initialSrsState(NOW), 4, NOW);
    expect(first.state.interval).toBe(FIRST_INTERVAL_DAYS);
    expect(first.state.repetitions).toBe(1);
    expect(first.state.dueAt).toBe(NOW + FIRST_INTERVAL_DAYS * DAY_MS);

    const second = schedule(first.state, 4, NOW + DAY_MS);
    expect(second.state.interval).toBe(SECOND_INTERVAL_DAYS);
    expect(second.state.repetitions).toBe(2);
  });

  it('multiplies by the ease factor from the third pass on', () => {
    let result = schedule(initialSrsState(NOW), 4, NOW);
    result = schedule(result.state, 4, NOW);
    const third = schedule(result.state, 4, NOW);
    expect(third.state.interval).toBe(Math.round(SECOND_INTERVAL_DAYS * third.state.easeFactor));
  });

  it('raises ease on a perfect grade and lowers it on a barely-passing one', () => {
    const perfect = schedule(initialSrsState(NOW), 5, NOW);
    expect(perfect.state.easeFactor).toBeCloseTo(INITIAL_EASE_FACTOR + 0.1, 10);

    const barely = schedule(initialSrsState(NOW), 3, NOW);
    expect(barely.state.easeFactor).toBeLessThan(INITIAL_EASE_FACTOR);
  });

  it('never lets the ease factor fall below the floor', () => {
    let state = initialSrsState(NOW);
    for (let i = 0; i < 30; i += 1) {
      state = schedule(state, 3, NOW).state;
    }
    expect(state.easeFactor).toBe(MIN_EASE_FACTOR);
  });

  it.each<ReviewGrade>([0, 1, 2])('treats grade %i as a lapse', (grade) => {
    const passed = schedule(initialSrsState(NOW), 5, NOW);
    const lapsed = schedule(passed.state, grade, NOW + DAY_MS);

    expect(lapsed.passed).toBe(false);
    expect(lapsed.masteryShouldIncrease).toBe(false);
    expect(lapsed.state.repetitions).toBe(0);
    expect(lapsed.state.interval).toBe(FIRST_INTERVAL_DAYS);
    expect(lapsed.state.lapses).toBe(1);
  });

  it.each<ReviewGrade>([3, 4, 5])('treats grade %i as a pass that may raise mastery', (grade) => {
    const result = schedule(initialSrsState(NOW), grade, NOW);
    expect(result.passed).toBe(true);
    expect(result.masteryShouldIncrease).toBe(true);
  });

  it('does not mutate the state it is given', () => {
    const state = initialSrsState(NOW);
    const snapshot = { ...state };
    schedule(state, 5, NOW + DAY_MS);
    expect(state).toEqual(snapshot);
  });
});
