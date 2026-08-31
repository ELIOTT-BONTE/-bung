import 'fake-indexeddb/auto';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import * as inference from '../../inference';
import { setActiveTier } from '../../inference';
import {
  clearAllData,
  findVocabByTerm,
  upsertVocabDrafts,
  type VocabDraft,
  type VocabEntry,
} from '../../storage';
import { addLookupToVocab, lookupDisplay, resolveLookup } from './wordLookup';

beforeEach(async () => {
  setActiveTier('mock');
  await clearAllData();
});

afterEach(() => {
  vi.restoreAllMocks();
});

async function storeBahnhof(): Promise<VocabEntry> {
  const [result] = await upsertVocabDrafts([
    {
      partOfSpeech: 'noun',
      term: 'Bahnhof',
      definition: 'train station',
      determiner: 'der',
      pluralForm: 'Bahnhöfe',
    },
  ]);
  return result.entry;
}

const BAHNHOF_DRAFT: VocabDraft = {
  partOfSpeech: 'noun',
  term: 'Bahnhof',
  definition: 'train station',
  determiner: 'der',
  pluralForm: 'Bahnhöfe',
};

describe('resolveLookup', () => {
  it('answers from the passage vocabulary without spending a call', async () => {
    const entry = await storeBahnhof();

    const resolution = await resolveLookup(
      { surface: 'Bahnhof', sentence: 'Der Bahnhof ist groß.' },
      { flagged: [{ draft: BAHNHOF_DRAFT, entry }] },
    );

    expect(resolution.kind).toBe('known');
    expect(resolution.source).toBe('passage');
  });

  it('offers a flagged word the learner does not have, rather than claiming it', async () => {
    const resolution = await resolveLookup(
      { surface: 'Bahnhof', sentence: 'Der Bahnhof ist groß.' },
      { flagged: [{ draft: BAHNHOF_DRAFT, entry: null }] },
    );

    // Described by the passage, but never taken: still the learner's call.
    expect(resolution.kind).toBe('new');
    expect(resolution.source).toBe('passage');
    expect(await findVocabByTerm('Bahnhof')).toBeUndefined();
  });

  it('answers from the store when the tapped form is the dictionary form', async () => {
    const stored = await storeBahnhof();

    const resolution = await resolveLookup({
      surface: 'Bahnhof',
      sentence: 'Der Bahnhof ist groß.',
    });

    expect(resolution.kind).toBe('known');
    expect(resolution.source).toBe('stored');
    if (resolution.kind === 'known') expect(resolution.entry.id).toBe(stored.id);
  });

  it('asks the model for an inflected form and offers it as a new word', async () => {
    const resolution = await resolveLookup({
      surface: 'Bahnhofs',
      sentence: 'Ich stehe vor dem Bahnhofs.',
    });

    expect(resolution.kind).toBe('new');
    expect(resolution.source).toBe('model');
    if (resolution.kind !== 'new') return;

    // Resolved to the dictionary form, with the two fields a noun cannot be
    // saved without.
    expect(resolution.draft.term).toBe('Bahnhof');
    expect(resolution.draft.determiner).toBe('der');
    expect(resolution.draft.pluralForm).toBe('Bahnhöfe');
    expect(lookupDisplay(resolution).form).toBe('der Bahnhof, Bahnhöfe');

    // Asking what a word means is not asking to learn it.
    expect(await findVocabByTerm('Bahnhof')).toBeUndefined();
  });

  it('recognises a stored word behind an inflected form it had to resolve', async () => {
    const stored = await storeBahnhof();

    // The surface-form checks cannot see this: "Bahnhofs" is not in the store
    // under that spelling, so only the dictionary form the model returns matches.
    const resolution = await resolveLookup({
      surface: 'Bahnhofs',
      sentence: 'Ich stehe vor dem Bahnhofs.',
    });

    expect(resolution.kind).toBe('known');
    expect(resolution.source).toBe('model');
    if (resolution.kind === 'known') expect(resolution.entry.id).toBe(stored.id);
  });

  it('still explains a noun that came back without its plural, but will not store it', async () => {
    vi.spyOn(inference, 'generateText').mockResolvedValue(
      JSON.stringify({
        term: 'Regenbogen',
        partOfSpeech: 'noun',
        determiner: 'der',
        pluralForm: '',
        definition: 'rainbow',
        surfaceRole: 'plural of der Regenbogen',
      }),
    );

    const resolution = await resolveLookup({
      surface: 'Regenbögen',
      sentence: 'Ich habe Regenbögen gesehen.',
    });

    expect(resolution.kind).toBe('unusable');
    if (resolution.kind !== 'unusable') return;
    expect(resolution.rejected.reason).toMatch(/plural/i);
    // The learner asked what a word meant, so they still get an answer.
    expect(resolution.definition).toBe('rainbow');
  });

  it('refuses an empty target rather than asking the model about nothing', async () => {
    await expect(resolveLookup({ surface: '   ', sentence: 'Egal.' })).rejects.toThrow(
      /nothing selected/i,
    );
  });
});

describe('addLookupToVocab', () => {
  it('saves the word without recording any evidence about it', async () => {
    const resolution = await resolveLookup({
      surface: 'Bahnhofs',
      sentence: 'Ich stehe vor dem Bahnhofs.',
    });
    if (resolution.kind !== 'new') throw new Error('expected a new word');

    const entry = await addLookupToVocab(resolution.draft);

    expect(entry.term).toBe('Bahnhof');
    expect(entry.exposureCount).toBe(0);
    expect(entry.masteryEventCount).toBe(0);
    expect(entry.masteryLevel).toBe(0);
  });

  it('is idempotent, so adding the same word twice does not duplicate it', async () => {
    const resolution = await resolveLookup({
      surface: 'Bahnhofs',
      sentence: 'Ich stehe vor dem Bahnhofs.',
    });
    if (resolution.kind !== 'new') throw new Error('expected a new word');

    const first = await addLookupToVocab(resolution.draft);
    const second = await addLookupToVocab(resolution.draft);

    expect(second.id).toBe(first.id);
  });
});
