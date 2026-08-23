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
  getVocab,
  listReviewsForVocab,
  listComprehensionSessions,
  listJournalEntries,
  loadStarterVocab,
} from '../storage';
import {
  completeSession,
  evaluateAnswers,
  generatePassage,
  prepareStudyMaterial,
} from './comprehension/pipeline';
import { submitJournalEntry } from './journaling/pipeline';
import { buildSession, gradeFlashcard, gradeSentence, recordCardShown } from './vocab-training/session';

beforeEach(async () => {
  setActiveTier('mock');
  await clearAllData();
});

describe('text comprehension', () => {
  it('exposes every flagged word but only masters the ones an answer demonstrated', async () => {
    const passage = await generatePassage('Reisen');
    expect(passage).toContain('Zug');

    const material = await prepareStudyMaterial(passage);
    expect(material.questions).toHaveLength(3);
    expect(material.vocab.length).toBeGreaterThan(2);

    // Every stored noun carries the article and plural it was saved with.
    for (const entry of material.vocab) {
      if (entry.partOfSpeech !== 'noun') continue;
      expect(entry.determiner).toMatch(/^(der|die|das)$/);
      expect(entry.pluralForm).toBeTruthy();
    }

    // Nothing has moved yet: saving a word is bookkeeping, not evidence.
    for (const entry of material.vocab) {
      expect(entry.exposureCount).toBe(0);
      expect(entry.masteryLevel).toBe(0);
      expect(entry.masteryEventCount).toBe(0);
    }

    const answers = [
      'Der Text beschreibt eine Reise mit dem Zug nach Hamburg am Freitag.',
      '',
      '',
    ];

    const outcome = await evaluateAnswers(passage, material.questions, answers, material.vocab);
    expect(outcome.answers[0].correct).toBe(true);
    expect(outcome.answers[1].correct).toBe(false);
    expect(outcome.masteryVocabIds.length).toBeGreaterThan(0);

    const completion = await completeSession({
      theme: 'Reisen',
      passage,
      answers: outcome.answers,
      vocab: material.vocab,
      masteryVocabIds: outcome.masteryVocabIds,
    });

    expect(completion.exposedCount).toBe(material.vocab.length);
    expect(completion.masteryResults).toHaveLength(outcome.masteryVocabIds.length);

    const mastered = new Set(outcome.masteryVocabIds);
    for (const entry of material.vocab) {
      const stored = await getVocab(entry.id);
      expect(stored).toBeDefined();
      // Exposure applies to every word the passage showed.
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
    expect(sessions[0].exposedVocabIds).toHaveLength(material.vocab.length);
  });
});

describe('journaling', () => {
  it('corrects an entry, diffs it client-side and logs the corrected word as a miss', async () => {
    const review = await submitJournalEntry(
      'Ich bin müde weil mein freund den ganzen Abend geredet hat',
    );

    expect(review.correctedText).not.toBeNull();
    expect(hasChanges(review.diff)).toBe(true);
    // The comma before "weil" and the capitalised noun are both real edits.
    expect(review.correctedText).toContain('Freund');
    expect(review.correctedText).toContain(', weil');

    const corrected = review.usage.find((item) => item.entry.term === 'Freund');
    expect(corrected).toBeDefined();
    expect(corrected?.usedCorrectly).toBe(false);

    // A corrected word still logs an attempt, but a failed one: no mastery.
    const rows = await listReviewsForVocab(corrected!.entry.id);
    expect(rows).toHaveLength(1);
    expect(rows[0].exerciseType).toBe('journal-usage');
    expect(rows[0].correct).toBe(false);
    expect(corrected?.entry.masteryLevel).toBe(0);
    // Writing is production, not exposure.
    expect(corrected?.entry.exposureCount).toBe(0);

    const entries = await listJournalEntries();
    expect(entries).toHaveLength(1);
    expect(entries[0].status).toBe('reviewed');
    expect(entries[0].diff.length).toBeGreaterThan(1);
  });

  it('leaves a clean entry uncorrected and masters the words it used', async () => {
    const review = await submitJournalEntry(
      'Ich habe einen Freund in Berlin und wir sprechen oft über das Wetter.',
    );

    expect(review.correctedText).toBeNull();
    expect(hasChanges(review.diff)).toBe(false);

    const wetter = review.usage.find((item) => item.entry.term === 'Wetter');
    expect(wetter?.usedCorrectly).toBe(true);
    // Production evidence, so one success day counts double.
    expect(wetter?.entry.masteryLevel).toBe(2);

    const rows = await listReviewsForVocab(wetter!.entry.id);
    expect(rows[0].correct).toBe(true);
    expect(rows[0].exerciseType).toBe('journal-usage');
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
