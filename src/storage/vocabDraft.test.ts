import { describe, expect, it } from 'vitest';
import { toVocabDraft, toVocabDrafts } from './vocabDraft';
import { formatVocabDisplay } from './vocabFormat';

describe('toVocabDraft', () => {
  it('accepts a complete noun', () => {
    expect(
      toVocabDraft({
        term: 'Bahnhof',
        partOfSpeech: 'noun',
        determiner: 'der',
        pluralForm: 'Bahnhöfe',
        definition: 'train station',
      }),
    ).toEqual({
      partOfSpeech: 'noun',
      term: 'Bahnhof',
      definition: 'train station',
      determiner: 'der',
      pluralForm: 'Bahnhöfe',
      notes: null,
    });
  });

  it('rejects a noun with no determiner rather than guessing one', () => {
    const result = toVocabDraft({
      term: 'Bahnhof',
      partOfSpeech: 'noun',
      determiner: null,
      pluralForm: 'Bahnhöfe',
      definition: 'train station',
    });
    expect(result).toEqual({ term: 'Bahnhof', reason: expect.stringContaining('determiner') });
  });

  it('rejects a noun with no plural form', () => {
    const result = toVocabDraft({
      term: 'Bahnhof',
      partOfSpeech: 'noun',
      determiner: 'der',
      pluralForm: '',
      definition: 'train station',
    });
    expect(result).toEqual({ term: 'Bahnhof', reason: expect.stringContaining('plural') });
  });

  it('treats a term that carries its article as a noun and splits them', () => {
    expect(
      toVocabDraft({
        term: 'die Wohnung',
        partOfSpeech: 'other',
        pluralForm: 'die Wohnungen',
        definition: 'flat',
      }),
    ).toMatchObject({
      partOfSpeech: 'noun',
      term: 'Wohnung',
      determiner: 'die',
      pluralForm: 'Wohnungen',
    });
  });

  it('leaves the noun fields null for other parts of speech', () => {
    expect(toVocabDraft({ term: 'warten', partOfSpeech: 'verb', definition: 'to wait' })).toEqual({
      partOfSpeech: 'verb',
      term: 'warten',
      definition: 'to wait',
      determiner: null,
      pluralForm: null,
      notes: null,
    });
  });

  it('falls back to "other" for an unrecognised part of speech', () => {
    expect(toVocabDraft({ term: 'na ja', partOfSpeech: 'particle', definition: 'well' })).toMatchObject({
      partOfSpeech: 'other',
    });
  });

  it('accepts German part-of-speech labels', () => {
    expect(
      toVocabDraft({
        term: 'Frage',
        partOfSpeech: 'Substantiv',
        determiner: 'DIE',
        pluralForm: 'Fragen',
        definition: 'question',
      }),
    ).toMatchObject({ partOfSpeech: 'noun', determiner: 'die' });
  });

  it('rejects an empty term', () => {
    expect(toVocabDraft({ term: '   ' })).toMatchObject({ reason: expect.stringContaining('No term') });
  });
});

describe('toVocabDrafts', () => {
  it('splits accepted drafts from rejected ones and de-duplicates', () => {
    const { drafts, rejected } = toVocabDrafts([
      { term: 'Zug', partOfSpeech: 'noun', determiner: 'der', pluralForm: 'Züge', definition: 'train' },
      { term: 'zug', partOfSpeech: 'noun', determiner: 'der', pluralForm: 'Züge', definition: 'train' },
      { term: 'Gleis', partOfSpeech: 'noun', definition: 'platform' },
      { term: 'warten', partOfSpeech: 'verb', definition: 'to wait' },
    ]);

    expect(drafts.map((draft) => draft.term)).toEqual(['Zug', 'warten']);
    expect(rejected).toHaveLength(1);
    expect(rejected[0].term).toBe('Gleis');
  });
});

describe('formatVocabDisplay', () => {
  it('uses the suffix short form when the plural only adds an ending', () => {
    expect(
      formatVocabDisplay({ term: 'Tisch', partOfSpeech: 'noun', determiner: 'der', pluralForm: 'Tische' }),
    ).toBe('der Tisch, -e');
  });

  it('spells out the plural when the stem changes', () => {
    expect(
      formatVocabDisplay({ term: 'Bahnhof', partOfSpeech: 'noun', determiner: 'der', pluralForm: 'Bahnhöfe' }),
    ).toBe('der Bahnhof, Bahnhöfe');
  });

  it('marks an unchanged plural with a bare dash', () => {
    expect(
      formatVocabDisplay({ term: 'Zimmer', partOfSpeech: 'noun', determiner: 'das', pluralForm: 'Zimmer' }),
    ).toBe('das Zimmer, -');
  });

  it('shows non-nouns as the bare term', () => {
    expect(
      formatVocabDisplay({ term: 'warten', partOfSpeech: 'verb', determiner: null, pluralForm: null }),
    ).toBe('warten');
  });
});
