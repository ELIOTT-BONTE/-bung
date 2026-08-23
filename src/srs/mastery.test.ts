import { describe, expect, it } from 'vitest';
import { RECOGNITION_ONLY_CAP, deriveMastery, deriveMasteryBreakdown, masteryLabel } from './mastery';
import { DAY_MS, MASTERY_MAX, type MasteryEvent, type MasteryExerciseType } from './types';

const DAY_ZERO = Date.UTC(2026, 0, 1, 8, 0, 0);

function event(
  dayOffset: number,
  exerciseType: MasteryExerciseType,
  correct: boolean,
  hourOffset = 0,
): MasteryEvent {
  return {
    reviewedAt: DAY_ZERO + dayOffset * DAY_MS + hourOffset * 3_600_000,
    exerciseType,
    grade: correct ? 4 : 1,
    correct,
  };
}

describe('deriveMastery', () => {
  it('is zero with no review events at all', () => {
    // This is the exposure case: a word seen in a passage has no log rows.
    expect(deriveMastery([])).toBe(0);
  });

  it('is zero when every attempt failed', () => {
    expect(deriveMastery([event(0, 'flashcard', false), event(1, 'flashcard', false)])).toBe(0);
  });

  it('rises one level per distinct day of correct recall', () => {
    expect(deriveMastery([event(0, 'flashcard', true)])).toBe(1);
    expect(deriveMastery([event(0, 'flashcard', true), event(1, 'flashcard', true)])).toBe(2);
  });

  it('does not reward repeating the same word many times in one day', () => {
    const sameDay = [
      event(0, 'flashcard', true, 1),
      event(0, 'flashcard', true, 2),
      event(0, 'flashcard', true, 3),
    ];
    expect(deriveMastery(sameDay)).toBe(1);
  });

  it('gives a bonus level once the learner has produced the word', () => {
    const recognitionOnly = [event(0, 'flashcard', true), event(1, 'flashcard', true)];
    const withProduction = [...recognitionOnly, event(2, 'sentence-production', true)];

    expect(deriveMastery(recognitionOnly)).toBe(2);
    // Third success day plus the production bonus.
    expect(deriveMastery(withProduction)).toBe(MASTERY_MAX - 1);
  });

  it('caps recognition-only words below the top levels', () => {
    const manyFlashcards = Array.from({ length: 8 }, (_, day) => event(day, 'flashcard', true));
    const breakdown = deriveMasteryBreakdown(manyFlashcards);

    expect(breakdown.level).toBe(RECOGNITION_ONLY_CAP);
    expect(breakdown.cappedByMissingProduction).toBe(true);
  });

  it('never exceeds the maximum', () => {
    const events = [
      ...Array.from({ length: 10 }, (_, day) => event(day, 'flashcard', true)),
      event(11, 'journal-usage', true),
    ];
    expect(deriveMastery(events)).toBe(MASTERY_MAX);
  });

  it('subtracts failures recorded after the last success', () => {
    const events = [
      event(0, 'flashcard', true),
      event(1, 'flashcard', true),
      event(2, 'comprehension-answer', true),
      event(3, 'flashcard', false),
    ];
    const breakdown = deriveMasteryBreakdown(events);

    expect(breakdown.successDays).toBe(3);
    expect(breakdown.successfulProductions).toBe(1);
    expect(breakdown.failuresSinceLastSuccess).toBe(1);
    expect(breakdown.level).toBe(3);
  });

  it('ignores failures that happened before the last success', () => {
    const events = [event(0, 'flashcard', false), event(1, 'flashcard', true)];
    expect(deriveMasteryBreakdown(events).failuresSinceLastSuccess).toBe(0);
    expect(deriveMastery(events)).toBe(1);
  });

  it('does not care what order events arrive in', () => {
    const ordered = [event(0, 'flashcard', true), event(1, 'journal-usage', true)];
    expect(deriveMastery([...ordered].reverse())).toBe(deriveMastery(ordered));
  });

  it('treats a passing grade with correct=false as a failure', () => {
    const conflicting: MasteryEvent[] = [
      { reviewedAt: DAY_ZERO, exerciseType: 'flashcard', grade: 5, correct: false },
    ];
    expect(deriveMastery(conflicting)).toBe(0);
  });
});

describe('masteryLabel', () => {
  it('labels both ends of the scale', () => {
    expect(masteryLabel(0)).toBe('New');
    expect(masteryLabel(MASTERY_MAX)).toBe('Mastered');
  });

  it('clamps out-of-range input', () => {
    expect(masteryLabel(-3)).toBe('New');
    expect(masteryLabel(99)).toBe('Mastered');
  });
});
