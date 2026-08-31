import { describe, expect, it } from 'vitest';
import { countWords, isWordToken, sentenceAround, tokenizeWords } from './tokens';

const TEXT = 'Heute war ich im Wald. Das Wetter war schön! Und dann?';
const TOKENS = tokenizeWords(TEXT);

function indexOfWord(word: string): number {
  const index = TOKENS.indexOf(word);
  if (index === -1) throw new Error(`${word} is not a token of the fixture`);
  return index;
}

describe('isWordToken', () => {
  it('accepts words a learner can look up and rejects the rest', () => {
    expect(isWordToken('Regenbögen')).toBe(true);
    expect(isWordToken('Fahrrad-Weg')).toBe(true);
    expect(isWordToken(' ')).toBe(false);
    expect(isWordToken(',')).toBe(false);
  });
});

describe('countWords', () => {
  it('counts words, not tokens', () => {
    expect(countWords(TEXT)).toBe(11);
    expect(countWords('')).toBe(0);
  });
});

describe('sentenceAround', () => {
  it('returns the sentence containing a token, not the whole text', () => {
    expect(sentenceAround(TOKENS, indexOfWord('Wetter'))).toBe('Das Wetter war schön!');
  });

  it('handles the first and last sentence, which have only one boundary', () => {
    expect(sentenceAround(TOKENS, indexOfWord('Wald'))).toBe('Heute war ich im Wald.');
    expect(sentenceAround(TOKENS, indexOfWord('dann'))).toBe('Und dann?');
  });

  it('spans every sentence a selected range touches', () => {
    const from = indexOfWord('ich');
    const to = indexOfWord('Wetter');

    expect(sentenceAround(TOKENS, from, to)).toBe(
      'Heute war ich im Wald. Das Wetter war schön!',
    );
  });

  it('does not care which end of the range is given first', () => {
    const from = indexOfWord('ich');
    const to = indexOfWord('Wetter');

    expect(sentenceAround(TOKENS, to, from)).toBe(sentenceAround(TOKENS, from, to));
  });

  it('falls back to the whole text when there is no punctuation at all', () => {
    const tokens = tokenizeWords('Ich gehe nach Hause');
    expect(sentenceAround(tokens, 2)).toBe('Ich gehe nach Hause');
  });
});
