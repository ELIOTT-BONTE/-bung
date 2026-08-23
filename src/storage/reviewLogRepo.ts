/**
 * Read-only view of the review log.
 *
 * Rows are written in one place only — `vocabRepo.recordMasteryAttempt`, inside
 * the same transaction that updates the word — so that the log and the cached
 * mastery level can never disagree. Nothing here writes.
 */

import { deriveMasteryBreakdown, type MasteryBreakdown } from '../srs';
import { getDb } from './db';
import type { MasteryExerciseType, SrsReviewLogEntry } from './types';

export async function listReviewsForVocab(vocabId: string): Promise<SrsReviewLogEntry[]> {
  const db = await getDb();
  const rows = await db.getAllFromIndex('srsReviewLog', 'by-vocab-id', vocabId);
  return rows.sort((a, b) => a.reviewedAt - b.reviewedAt);
}

export async function listRecentReviews(limit = 50): Promise<SrsReviewLogEntry[]> {
  const db = await getDb();
  const rows = await db.getAllFromIndex('srsReviewLog', 'by-reviewed-at');
  return rows.reverse().slice(0, limit);
}

export async function listReviewsSince(since: number): Promise<SrsReviewLogEntry[]> {
  const db = await getDb();
  return db.getAllFromIndex('srsReviewLog', 'by-reviewed-at', IDBKeyRange.lowerBound(since));
}

/** Recomputes a word's mastery straight from its log — the source of truth. */
export async function explainMastery(vocabId: string): Promise<MasteryBreakdown> {
  return deriveMasteryBreakdown(await listReviewsForVocab(vocabId));
}

export interface ReviewTotals {
  reviews: number;
  correct: number;
  byExerciseType: Record<MasteryExerciseType, number>;
}

export async function getReviewTotals(since = 0): Promise<ReviewTotals> {
  const rows = await listReviewsSince(since);
  const byExerciseType: Record<MasteryExerciseType, number> = {
    flashcard: 0,
    'sentence-production': 0,
    'comprehension-answer': 0,
    'journal-usage': 0,
  };

  let correct = 0;
  for (const row of rows) {
    byExerciseType[row.exerciseType] += 1;
    if (row.correct) correct += 1;
  }

  return { reviews: rows.length, correct, byExerciseType };
}
