import { describe, expect, it } from 'vitest';
import {
  CUSTOM_PASSAGE_WORDS,
  newWordBudgetFor,
  passageLengthById,
  passageMaxTokens,
  readCustomLength,
} from './pipeline';

describe('passage options', () => {
  it('introduces fewer new words at lower CEFR bands', () => {
    expect(newWordBudgetFor('A1')).toBeLessThan(newWordBudgetFor('B1'));
    expect(newWordBudgetFor('B1')).toBeLessThan(newWordBudgetFor('C1'));
  });

  it('maps length chips to word targets', () => {
    expect(passageLengthById('short').approximateWords).toBe(80);
    expect(passageLengthById('long').approximateWords).toBe(220);
  });
});

describe('readCustomLength', () => {
  it('treats an empty field as not ready rather than wrong', () => {
    expect(readCustomLength('')).toEqual({ words: null, problem: null });
    expect(readCustomLength('   ')).toEqual({ words: null, problem: null });
  });

  it('accepts a number inside the bounds', () => {
    expect(readCustomLength('175')).toEqual({ words: 175, problem: null });
    expect(readCustomLength(' 40 ').words).toBe(CUSTOM_PASSAGE_WORDS.min);
    expect(readCustomLength('400').words).toBe(CUSTOM_PASSAGE_WORDS.max);
  });

  it('rejects anything it cannot turn into a word count', () => {
    for (const raw of ['abc', '12.5', '-30', '1e3', '20 words']) {
      const reading = readCustomLength(raw);
      expect(reading.words).toBeNull();
      expect(reading.problem).not.toBeNull();
    }
  });

  it('rejects lengths outside the bounds and says which way', () => {
    expect(readCustomLength('39')).toMatchObject({ words: null, problem: /at least 40/i });
    expect(readCustomLength('401')).toMatchObject({ words: null, problem: /400 words/ });
  });

  it('leaves room in the decode budget for the longest length it accepts', () => {
    // A ceiling below this is how a passage gets cut off mid-sentence.
    expect(passageMaxTokens(CUSTOM_PASSAGE_WORDS.max)).toBeGreaterThanOrEqual(
      CUSTOM_PASSAGE_WORDS.max * 2.4,
    );
  });
});
