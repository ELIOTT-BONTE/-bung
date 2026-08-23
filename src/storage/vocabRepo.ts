/**
 * The vocabulary store.
 *
 * This module is where the exposure/mastery rule is enforced, and it is
 * enforced by the shape of the API rather than by discipline in the callers:
 *
 *   - `recordExposure` accepts no grade and no outcome. It can only ever touch
 *     `exposureCount`, `lastExposedAt` and `skillContexts`.
 *   - `recordMasteryAttempt` is the only function that writes `srs` or
 *     `masteryLevel`, and it demands a `MasteryAttempt`, whose `exerciseType`
 *     union contains active-recall and production events only.
 *
 * Mastery itself is never incremented in place: every attempt appends to
 * `srsReviewLog` and the level is recomputed from that log.
 */

import { deriveMastery, initialSrsState, schedule, type MasteryEvent } from '../srs';
import { getDb } from './db';
import { newId, normalizeTerm } from './ids';
import {
  DEFAULT_LANGUAGE,
  type LanguageCode,
  type MasteryAttempt,
  type SkillContext,
  type SrsReviewLogEntry,
  type VocabDraft,
  type VocabEntry,
} from './types';

export interface UpsertOptions {
  language?: LanguageCode;
  now?: number;
  /** Overwrite an existing definition when the new one is non-empty. */
  refreshDefinition?: boolean;
}

export interface UpsertResult {
  entry: VocabEntry;
  created: boolean;
}

function draftToEntry(draft: VocabDraft, language: LanguageCode, now: number): VocabEntry {
  return {
    id: newId(),
    language,
    term: draft.term,
    normalizedTerm: normalizeTerm(draft.term),
    definition: draft.definition,
    partOfSpeech: draft.partOfSpeech,
    determiner: draft.determiner ?? null,
    pluralForm: draft.pluralForm ?? null,
    firstSeenAt: now,
    // A freshly saved word has been seen zero times *as exposure*; the caller
    // records the exposure that surfaced it, so it is never double counted.
    exposureCount: 0,
    lastExposedAt: null,
    skillContexts: [],
    srs: initialSrsState(now),
    masteryLevel: 0,
    masteryEventCount: 0,
    notes: draft.notes ?? null,
  };
}

function withContext(contexts: readonly SkillContext[], context: SkillContext): SkillContext[] {
  return contexts.includes(context) ? [...contexts] : [...contexts, context];
}

export async function listVocab(): Promise<VocabEntry[]> {
  const db = await getDb();
  return db.getAll('vocab');
}

export async function getVocab(id: string): Promise<VocabEntry | undefined> {
  const db = await getDb();
  return db.get('vocab', id);
}

export async function getVocabMany(ids: readonly string[]): Promise<VocabEntry[]> {
  const db = await getDb();
  const tx = db.transaction('vocab', 'readonly');
  const store = tx.objectStore('vocab');
  const entries = await Promise.all(ids.map((id) => store.get(id)));
  await tx.done;
  return entries.filter((entry): entry is VocabEntry => entry !== undefined);
}

export async function findVocabByTerm(term: string): Promise<VocabEntry | undefined> {
  const db = await getDb();
  return db.getFromIndex('vocab', 'by-normalized-term', normalizeTerm(term));
}

/**
 * Saves drafts that are not in the store yet and returns every matching entry.
 * Deliberately does not touch counters or scheduling state — saving a word is
 * bookkeeping, not evidence of anything.
 */
export async function upsertVocabDrafts(
  drafts: readonly VocabDraft[],
  options: UpsertOptions = {},
): Promise<UpsertResult[]> {
  const { language = DEFAULT_LANGUAGE, now = Date.now(), refreshDefinition = false } = options;
  const db = await getDb();
  const tx = db.transaction('vocab', 'readwrite');
  const store = tx.objectStore('vocab');
  const index = store.index('by-normalized-term');
  const results: UpsertResult[] = [];

  for (const draft of drafts) {
    if (draft.term.trim() === '') continue;
    const existing = await index.get(normalizeTerm(draft.term));

    if (!existing) {
      const entry = draftToEntry(draft, language, now);
      await store.put(entry);
      results.push({ entry, created: true });
      continue;
    }

    // Fill in anything we did not have before. A noun that was stored without
    // its determiner cannot happen (see vocabDraft.ts), but an older entry may
    // predate a better definition.
    const merged: VocabEntry = {
      ...existing,
      definition:
        refreshDefinition && draft.definition !== '' ? draft.definition : existing.definition || draft.definition,
      determiner: existing.determiner ?? draft.determiner ?? null,
      pluralForm: existing.pluralForm ?? draft.pluralForm ?? null,
      notes: existing.notes ?? draft.notes ?? null,
    };

    if (
      merged.definition !== existing.definition ||
      merged.determiner !== existing.determiner ||
      merged.pluralForm !== existing.pluralForm ||
      merged.notes !== existing.notes
    ) {
      await store.put(merged);
    }

    results.push({ entry: merged, created: false });
  }

  await tx.done;
  return results;
}

/**
 * Passive encounter: the word appeared in a generated passage, or was shown as
 * the front of a flashcard.
 *
 * There is no grade parameter and no outcome parameter, because exposure is
 * not an assessment. This function cannot raise mastery and does not write to
 * `srsReviewLog`.
 */
export async function recordExposure(
  vocabIds: readonly string[],
  context: SkillContext,
  now: number = Date.now(),
): Promise<void> {
  if (vocabIds.length === 0) return;

  const db = await getDb();
  const tx = db.transaction('vocab', 'readwrite');
  const store = tx.objectStore('vocab');

  for (const id of new Set(vocabIds)) {
    const entry = await store.get(id);
    if (!entry) continue;
    await store.put({
      ...entry,
      exposureCount: entry.exposureCount + 1,
      lastExposedAt: now,
      skillContexts: withContext(entry.skillContexts, context),
    });
  }

  await tx.done;
}

export interface MasteryAttemptResult {
  entry: VocabEntry;
  logEntry: SrsReviewLogEntry;
  masteryBefore: number;
  masteryAfter: number;
  masteryIncreased: boolean;
  passed: boolean;
}

/**
 * Records an evaluated active-recall or production attempt.
 *
 * The only path to a new SRS state or a new mastery level. It appends the
 * attempt to `srsReviewLog`, advances the schedule with the pure SM-2 function
 * and recomputes mastery from the full log for that word.
 */
export async function recordMasteryAttempt(attempt: MasteryAttempt): Promise<MasteryAttemptResult> {
  const now = attempt.reviewedAt ?? Date.now();
  const db = await getDb();
  const tx = db.transaction(['vocab', 'srsReviewLog'], 'readwrite');
  const vocabStore = tx.objectStore('vocab');
  const logStore = tx.objectStore('srsReviewLog');

  const entry = await vocabStore.get(attempt.vocabId);
  if (!entry) {
    await tx.done;
    throw new Error(`Cannot record a review for unknown vocab id ${attempt.vocabId}`);
  }

  const previousRows = await logStore.index('by-vocab-id').getAll(attempt.vocabId);
  const scheduled = schedule(entry.srs, attempt.grade, now);

  const event: MasteryEvent = {
    reviewedAt: now,
    exerciseType: attempt.exerciseType,
    grade: attempt.grade,
    correct: attempt.correct,
  };

  const masteryBefore = entry.masteryLevel;
  const masteryAfter = deriveMastery([...previousRows, event]);

  const logEntry: SrsReviewLogEntry = {
    id: newId(),
    vocabId: entry.id,
    language: entry.language,
    reviewedAt: now,
    exerciseType: attempt.exerciseType,
    grade: attempt.grade,
    correct: attempt.correct,
    sourceMode: attempt.sourceMode,
    sourceId: attempt.sourceId ?? null,
    srsBefore: entry.srs,
    srsAfter: scheduled.state,
    masteryBefore,
    masteryAfter,
  };

  const updated: VocabEntry = {
    ...entry,
    srs: scheduled.state,
    masteryLevel: masteryAfter,
    masteryEventCount: entry.masteryEventCount + 1,
    skillContexts: withContext(entry.skillContexts, attempt.sourceMode),
  };

  await Promise.all([vocabStore.put(updated), logStore.put(logEntry), tx.done]);

  return {
    entry: updated,
    logEntry,
    masteryBefore,
    masteryAfter,
    masteryIncreased: masteryAfter > masteryBefore,
    passed: scheduled.passed,
  };
}

export async function getDueVocab(
  now: number = Date.now(),
  limit = 20,
): Promise<VocabEntry[]> {
  const db = await getDb();
  const due = await db.getAllFromIndex('vocab', 'by-due-at', IDBKeyRange.upperBound(now));
  // Oldest due first, then least-mastered, so backlog does not starve.
  return due
    .sort((a, b) => a.srs.dueAt - b.srs.dueAt || a.masteryLevel - b.masteryLevel)
    .slice(0, limit);
}

export async function countDueVocab(now: number = Date.now()): Promise<number> {
  const db = await getDb();
  return db.countFromIndex('vocab', 'by-due-at', IDBKeyRange.upperBound(now));
}

/** Terms fed to the passage generator so it leans on what the learner knows. */
export async function getKnownTerms(limit = 60): Promise<string[]> {
  const all = await listVocab();
  return all
    .sort((a, b) => b.masteryLevel - a.masteryLevel || b.exposureCount - a.exposureCount)
    .slice(0, limit)
    .map((entry) => entry.term);
}

export interface VocabStats {
  total: number;
  due: number;
  /** Seen at least once but never yet recalled or produced. */
  exposedOnly: number;
  mastered: number;
  totalExposures: number;
  masteryEvents: number;
  byMastery: number[];
}

export async function getVocabStats(now: number = Date.now()): Promise<VocabStats> {
  const all = await listVocab();
  const byMastery = [0, 0, 0, 0, 0, 0];

  let due = 0;
  let exposedOnly = 0;
  let mastered = 0;
  let totalExposures = 0;
  let masteryEvents = 0;

  for (const entry of all) {
    byMastery[Math.max(0, Math.min(5, entry.masteryLevel))] += 1;
    if (entry.srs.dueAt <= now) due += 1;
    if (entry.masteryEventCount === 0 && entry.exposureCount > 0) exposedOnly += 1;
    if (entry.masteryLevel >= 4) mastered += 1;
    totalExposures += entry.exposureCount;
    masteryEvents += entry.masteryEventCount;
  }

  return { total: all.length, due, exposedOnly, mastered, totalExposures, masteryEvents, byMastery };
}

export async function deleteVocab(id: string): Promise<void> {
  const db = await getDb();
  const tx = db.transaction(['vocab', 'srsReviewLog'], 'readwrite');
  const logStore = tx.objectStore('srsReviewLog');
  const rows = await logStore.index('by-vocab-id').getAllKeys(id);
  await Promise.all([
    tx.objectStore('vocab').delete(id),
    ...rows.map((key) => logStore.delete(key)),
    tx.done,
  ]);
}
