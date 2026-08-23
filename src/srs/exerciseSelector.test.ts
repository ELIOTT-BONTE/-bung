import { describe, expect, it } from 'vitest';
import {
  PRODUCTION_PROBABILITY_BY_MASTERY,
  assignExercises,
  productionProbability,
  selectExerciseType,
} from './exerciseSelector';
import { MASTERY_MAX } from './types';

/** Deterministic stand-in for Math.random. */
function sequence(values: number[]): () => number {
  let index = 0;
  return () => values[index++ % values.length];
}

describe('productionProbability', () => {
  it('never asks a word the learner has never recalled to be produced', () => {
    expect(productionProbability(0)).toBe(0);
  });

  it('increases monotonically with mastery', () => {
    for (let level = 1; level <= MASTERY_MAX; level += 1) {
      expect(productionProbability(level)).toBeGreaterThan(productionProbability(level - 1));
    }
  });

  it('clamps levels outside the scale', () => {
    expect(productionProbability(-2)).toBe(PRODUCTION_PROBABILITY_BY_MASTERY[0]);
    expect(productionProbability(42)).toBe(PRODUCTION_PROBABILITY_BY_MASTERY[MASTERY_MAX]);
  });
});

describe('selectExerciseType', () => {
  it('always picks a flashcard at mastery zero, whatever the rng returns', () => {
    for (const value of [0, 0.001, 0.5, 0.999]) {
      expect(selectExerciseType(0, () => value)).toBe('flashcard');
    }
  });

  it('picks production when the draw lands under the threshold', () => {
    expect(selectExerciseType(3, () => 0.1)).toBe('sentence-production');
    expect(selectExerciseType(3, () => 0.9)).toBe('flashcard');
  });

  it('leans towards production for high-mastery words over many draws', () => {
    const draws = Array.from({ length: 100 }, (_, i) => i / 100);
    const rng = sequence(draws);
    const picks = draws.map(() => selectExerciseType(MASTERY_MAX, rng));
    const production = picks.filter((pick) => pick === 'sentence-production').length;

    expect(production).toBeGreaterThan(80);
  });

  it('leans towards flashcards for low-mastery words over many draws', () => {
    const draws = Array.from({ length: 100 }, (_, i) => i / 100);
    const rng = sequence(draws);
    const picks = draws.map(() => selectExerciseType(1, rng));
    const flashcards = picks.filter((pick) => pick === 'flashcard').length;

    expect(flashcards).toBeGreaterThan(75);
  });
});

describe('assignExercises', () => {
  it('assigns one exercise per item using each item mastery', () => {
    const items = [
      { term: 'Bahnhof', mastery: 0 },
      { term: 'Zug', mastery: 5 },
    ];
    const assigned = assignExercises(items, (item) => item.mastery, () => 0.5);

    expect(assigned).toEqual([
      { item: items[0], exerciseType: 'flashcard' },
      { item: items[1], exerciseType: 'sentence-production' },
    ]);
  });
});
