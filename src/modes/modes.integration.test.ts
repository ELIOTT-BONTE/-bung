/**
 * End-to-end wiring test for all three modes, run against a real IndexedDB
 * implementation and the Mock (dev) inference tier.
 *
 * The point of this file is the exposure/mastery boundary: it asserts that a
 * word seen in a passage or shown on a card gains exposure and nothing else,
 * while only an evaluated answer moves mastery and the review schedule.
 */

import 'fake-indexeddb/auto';
import { beforeEach, describe, expect, it } from 'vitest';

import { setActiveTier } from '../inference';
import { hasChanges } from '../diff';
import {
  clearAllData,
  findVocabByTerm,
  getVocab,
  listReviewsForVocab,
  listComprehensionSessions,
  listJournalEntries,
  listVocab,
  loadStarterVocab,
  type VocabEntry,
} from '../storage';
import {
  completeSession,
  evaluateAnswers,
  generatePassage,
  prepareStudyMaterial,
} from './comprehension/pipeline';
import { submitJournalEntry } from './journaling/pipeline';
import { addLookupToVocab, resolveLookup } from './shared/wordLookup';
import { buildSession, gradeFlashcard, gradeSentence, recordCardShown } from './vocab-training/session';

beforeEach(async () => {
  setActiveTier('mock');
  await clearAllData();
});

describe('text comprehension', () => {
  it('flags key vocabulary as suggestions and stores none of it', async () => {
    const passage = await generatePassage('Reisen', { level: 'B1', approximateWords: 80 });
    expect(passage).toContain('Zug');

    const material = await prepareStudyMaterial(passage, { level: 'B1' });
    expect(material.questions).toHaveLength(3);
    expect(material.vocab.length).toBeGreaterThan(2);

    for (const word of material.vocab) {
      // Every offered noun carries the article and plural it would be saved with.
      if (word.draft.partOfSpeech === 'noun') {
        expect(word.draft.determiner).toMatch(/^(der|die|das)$/);
        expect(word.draft.pluralForm).toBeTruthy();
      }

      // The learner had none of these, and reading about them did not change
      // that: a suggestion is not an entry.
      expect(word.entry).toBeNull();
      expect(await findVocabByTerm(word.draft.term)).toBeUndefined();
    }

    expect(await listVocab()).toHaveLength(0);
  });

  it('exposes the words the learner already had and masters the ones an answer demonstrated', async () => {
    const passage = await generatePassage('Reisen', { level: 'B1', approximateWords: 80 });
    const material = await prepareStudyMaterial(passage, { level: 'B1' });

    // Take the suggestions the way a learner does: tap, then add.
    const owned: VocabEntry[] = [];
    for (const word of material.vocab) {
      owned.push(await addLookupToVocab(word.draft));
    }
    expect(owned.length).toBe(material.vocab.length);
    for (const entry of owned) {
      expect(entry.exposureCount).toBe(0);
      expect(entry.masteryLevel).toBe(0);
      expect(entry.masteryEventCount).toBe(0);
    }

    const answers = [
      'Der Text beschreibt eine Reise mit dem Zug nach Hamburg am Freitag.',
      '',
      '',
    ];

    const outcome = await evaluateAnswers(
      passage,
      material.questions,
      answers,
      owned.map((entry) => ({ term: entry.term, vocabId: entry.id })),
    );
    expect(outcome.answers[0].correct).toBe(true);
    expect(outcome.answers[1].correct).toBe(false);
    expect(outcome.masteryVocabIds.length).toBeGreaterThan(0);

    const completion = await completeSession({
      theme: 'Reisen',
      passage,
      answers: outcome.answers,
      knownVocab: owned,
      masteryVocabIds: outcome.masteryVocabIds,
    });

    expect(completion.exposedCount).toBe(owned.length);
    expect(completion.masteryResults).toHaveLength(outcome.masteryVocabIds.length);

    const mastered = new Set(outcome.masteryVocabIds);
    for (const entry of owned) {
      const stored = await getVocab(entry.id);
      expect(stored).toBeDefined();
      // Exposure applies to every word the learner held and then read.
      expect(stored?.exposureCount).toBe(1);
      expect(stored?.skillContexts).toContain('comprehension');

      if (mastered.has(entry.id)) {
        expect(stored?.masteryEventCount).toBe(1);
        // One success day plus the production bonus: a comprehension answer is
        // the learner using the word, not just recognising it.
        expect(stored?.masteryLevel).toBe(2);
        expect(await listReviewsForVocab(entry.id)).toHaveLength(1);
      } else {
        // Seen, not known: exposure alone leaves mastery and the log untouched.
        expect(stored?.masteryEventCount).toBe(0);
        expect(stored?.masteryLevel).toBe(0);
        expect(await listReviewsForVocab(entry.id)).toHaveLength(0);
      }
    }

    const sessions = await listComprehensionSessions();
    expect(sessions).toHaveLength(1);
    expect(sessions[0].theme).toBe('Reisen');
    expect(sessions[0].exposedVocabIds).toHaveLength(owned.length);
  });

  it('cannot master a flagged word the learner never added', async () => {
    const passage = await generatePassage('Reisen', { level: 'B1', approximateWords: 80 });
    const material = await prepareStudyMaterial(passage, { level: 'B1' });

    const outcome = await evaluateAnswers(
      passage,
      material.questions,
      ['Der Text beschreibt eine Reise mit dem Zug nach Hamburg am Freitag.', '', ''],
      // Named to the evaluator, but held by nobody.
      material.vocab.map((word) => ({ term: word.draft.term, vocabId: null })),
    );

    expect(outcome.answers[0].correct).toBe(true);
    expect(outcome.masteryVocabIds).toEqual([]);

    const completion = await completeSession({
      theme: 'Reisen',
      passage,
      answers: outcome.answers,
      knownVocab: [],
      masteryVocabIds: [],
    });

    expect(completion.exposedCount).toBe(0);
    expect(await listVocab()).toHaveLength(0);
  });

  it('gives a looked-up word exactly one exposure and no mastery', async () => {
    const passage = await generatePassage('Reisen', { level: 'B1', approximateWords: 80 });

    const resolution = await resolveLookup({
      surface: 'Bahnhofs',
      sentence: 'Ich stehe vor dem Bahnhofs.',
    });
    if (resolution.kind !== 'new') throw new Error(`expected a new word, got ${resolution.kind}`);

    // Resolving it stored nothing; only this call does.
    expect(await listVocab()).toHaveLength(0);
    const entry = await addLookupToVocab(resolution.draft);

    // Looking a word up and filing it is not evidence of knowing it.
    expect(entry.exposureCount).toBe(0);
    expect(entry.masteryEventCount).toBe(0);
    expect(await listReviewsForVocab(entry.id)).toHaveLength(0);

    const completion = await completeSession({
      theme: 'Reisen',
      passage,
      answers: [],
      knownVocab: [],
      lookedUpVocab: [entry],
      masteryVocabIds: [],
    });
    expect(completion.exposedCount).toBe(1);

    const stored = await getVocab(entry.id);
    expect(stored?.exposureCount).toBe(1);
    expect(stored?.skillContexts).toContain('comprehension');
    expect(stored?.masteryEventCount).toBe(0);
    expect(stored?.masteryLevel).toBe(0);
    expect(await listReviewsForVocab(entry.id)).toHaveLength(0);
  });

  it('counts a word that was both already known and looked up once, not twice', async () => {
    const passage = await generatePassage('Reisen', { level: 'B1', approximateWords: 80 });
    const material = await prepareStudyMaterial(passage, { level: 'B1' });
    const entry = await addLookupToVocab(material.vocab[0].draft);

    const completion = await completeSession({
      theme: 'Reisen',
      passage,
      answers: [],
      knownVocab: [entry],
      lookedUpVocab: [entry],
      masteryVocabIds: [],
    });

    expect(completion.exposedCount).toBe(1);
    expect((await getVocab(entry.id))?.exposureCount).toBe(1);
  });
});

describe('journaling', () => {
  /** Puts a word on the learner's list the way the Add button does. */
  async function track(term: string): Promise<VocabEntry> {
    const resolution = await resolveLookup({ surface: term, sentence: `Das ist ${term}.` });
    if (resolution.kind !== 'new') throw new Error(`could not track ${term}`);
    return addLookupToVocab(resolution.draft);
  }

  it('corrects an entry and diffs it client-side, storing none of its words', async () => {
    const review = await submitJournalEntry(
      'Ich bin müde weil mein freund den ganzen Abend geredet hat',
    );

    expect(review.correctedText).not.toBeNull();
    expect(hasChanges(review.diff)).toBe(true);
    // The comma before "weil" and the capitalised noun are both real edits.
    expect(review.correctedText).toContain('Freund');
    expect(review.correctedText).toContain(', weil');

    const corrected = review.usage.find((item) => item.draft.term === 'Freund');
    expect(corrected).toBeDefined();
    expect(corrected?.usedCorrectly).toBe(false);

    // Using a word is not asking to study it: offered, not filed, not graded.
    expect(corrected?.entry).toBeNull();
    expect(await listVocab()).toHaveLength(0);
    expect(review.masteryResults).toHaveLength(0);

    const entries = await listJournalEntries();
    expect(entries).toHaveLength(1);
    expect(entries[0].status).toBe('reviewed');
    expect(entries[0].vocabIds).toHaveLength(0);
    expect(entries[0].diff.length).toBeGreaterThan(1);
  });

  it('logs a corrected use of a tracked word as a miss', async () => {
    const freund = await track('Freund');

    const review = await submitJournalEntry(
      'Ich bin müde weil mein freund den ganzen Abend geredet hat',
    );

    const corrected = review.usage.find((item) => item.draft.term === 'Freund');
    expect(corrected?.entry?.id).toBe(freund.id);
    expect(corrected?.usedCorrectly).toBe(false);

    // A corrected word still logs an attempt, but a failed one: no mastery.
    const rows = await listReviewsForVocab(freund.id);
    expect(rows).toHaveLength(1);
    expect(rows[0].exerciseType).toBe('journal-usage');
    expect(rows[0].correct).toBe(false);
    expect(corrected?.entry?.masteryLevel).toBe(0);
    // Writing is production, not exposure.
    expect(corrected?.entry?.exposureCount).toBe(0);
  });

  it('leaves a clean entry uncorrected and masters the tracked words it used', async () => {
    const wetterEntry = await track('Wetter');

    const review = await submitJournalEntry(
      'Ich habe einen Freund in Berlin und wir sprechen oft über das Wetter.',
    );

    expect(review.correctedText).toBeNull();
    expect(hasChanges(review.diff)).toBe(false);

    const wetter = review.usage.find((item) => item.draft.term === 'Wetter');
    expect(wetter?.usedCorrectly).toBe(true);
    // Production evidence, so one success day counts double.
    expect(wetter?.entry?.masteryLevel).toBe(2);

    const rows = await listReviewsForVocab(wetterEntry.id);
    expect(rows[0].correct).toBe(true);
    expect(rows[0].exerciseType).toBe('journal-usage');

    // Every other word the entry used stayed a suggestion.
    const untracked = review.usage.filter((item) => item.entry === null);
    expect(untracked.length).toBeGreaterThan(0);
    expect(await listVocab()).toHaveLength(1);
  });
});

describe('the vocabulary list', () => {
  it('is filled only by an explicit add, whatever else the learner does', async () => {
    // A whole reading session, start to finish.
    const passage = await generatePassage('Reisen', { level: 'B1', approximateWords: 80 });
    const material = await prepareStudyMaterial(passage, { level: 'B1' });
    const outcome = await evaluateAnswers(
      passage,
      material.questions,
      ['Der Text beschreibt eine Reise mit dem Zug nach Hamburg am Freitag.', '', ''],
      material.vocab.map((word) => ({ term: word.draft.term, vocabId: null })),
    );
    await completeSession({
      theme: 'Reisen',
      passage,
      answers: outcome.answers,
      knownVocab: [],
      masteryVocabIds: outcome.masteryVocabIds,
    });

    // A journal entry, corrected and reviewed.
    await submitJournalEntry('Ich bin müde weil mein freund den ganzen Abend geredet hat');

    // And a word looked up but never taken.
    await resolveLookup({ surface: 'Bahnhofs', sentence: 'Ich stehe vor dem Bahnhofs.' });

    // Every one of those paths used to be able to add a word. None may now.
    expect(await listVocab()).toHaveLength(0);
  });
});

describe('vocabulary training', () => {
  it('only offers flashcards for words that have never been recalled', async () => {
    await loadStarterVocab();
    // rng returns 0, which would pick production wherever it is allowed at all.
    const items = await buildSession(5, () => 0);

    expect(items).toHaveLength(5);
    expect(items.every((item) => item.exerciseType === 'flashcard')).toBe(true);
  });

  it('counts showing a card as exposure and grading it as mastery', async () => {
    await loadStarterVocab();
    const [item] = await buildSession(1);

    await recordCardShown(item.entry.id);
    const shown = await getVocab(item.entry.id);
    expect(shown?.exposureCount).toBe(1);
    expect(shown?.masteryLevel).toBe(0);
    expect(shown?.masteryEventCount).toBe(0);
    expect(await listReviewsForVocab(item.entry.id)).toHaveLength(0);

    const before = shown!.srs.dueAt;
    const result = await gradeFlashcard(shown!, 4);

    expect(result.passed).toBe(true);
    expect(result.masteryIncreased).toBe(true);
    expect(result.entry.masteryLevel).toBe(1);
    expect(result.entry.masteryEventCount).toBe(1);
    // The answer changed the schedule; it did not change exposure.
    expect(result.entry.srs.dueAt).toBeGreaterThan(before);
    expect(result.entry.exposureCount).toBe(1);

    const rows = await listReviewsForVocab(item.entry.id);
    expect(rows).toHaveLength(1);
    expect(rows[0].exerciseType).toBe('flashcard');
    expect(rows[0].masteryBefore).toBe(0);
    expect(rows[0].masteryAfter).toBe(1);
  });

  it('does not raise mastery for a failed flashcard', async () => {
    await loadStarterVocab();
    const [item] = await buildSession(1);
    const result = await gradeFlashcard(item.entry, 1);

    expect(result.passed).toBe(false);
    expect(result.masteryIncreased).toBe(false);
    expect(result.entry.masteryLevel).toBe(0);
    expect(result.entry.srs.lapses).toBe(1);
    // The attempt is still logged — mastery is derived from the whole history.
    expect(await listReviewsForVocab(item.entry.id)).toHaveLength(1);
  });

  it('grades a produced sentence and logs it as production', async () => {
    await loadStarterVocab();
    const [item] = await buildSession(40).then((items) =>
      items.filter((candidate) => candidate.entry.term === 'Tisch'),
    );
    expect(item).toBeDefined();

    const { evaluation, result } = await gradeSentence(
      item.entry,
      'Ich sitze jeden Morgen an diesem Tisch und trinke Kaffee.',
    );

    expect(evaluation.correct).toBe(true);
    expect(result.entry.masteryLevel).toBe(2);

    const rows = await listReviewsForVocab(item.entry.id);
    expect(rows[0].exerciseType).toBe('sentence-production');
    expect(rows[0].correct).toBe(true);
  });
});
