import type { DiffSegment } from '../diff/types';
import { getDb } from './db';
import { newId } from './ids';
import { DEFAULT_LANGUAGE, type JournalEntry, type LanguageCode } from './types';

export interface CreateJournalEntryInput {
  originalText: string;
  language?: LanguageCode;
  createdAt?: number;
}

/** Saved as soon as the learner submits, before any model call runs. */
export async function createJournalEntry(input: CreateJournalEntryInput): Promise<JournalEntry> {
  const now = input.createdAt ?? Date.now();
  const entry: JournalEntry = {
    id: newId(),
    language: input.language ?? DEFAULT_LANGUAGE,
    createdAt: now,
    updatedAt: now,
    originalText: input.originalText,
    correctedText: null,
    correctionSummary: null,
    diff: [],
    vocabIds: [],
    status: 'draft',
  };

  const db = await getDb();
  await db.put('journalEntries', entry);
  return entry;
}

export interface CorrectionUpdate {
  /** Null when the checker decided nothing needed changing. */
  correctedText: string | null;
  correctionSummary: string | null;
  diff: DiffSegment[];
  vocabIds: string[];
}

export async function attachCorrection(
  id: string,
  update: CorrectionUpdate,
  updatedAt: number = Date.now(),
): Promise<JournalEntry> {
  const db = await getDb();
  const existing = await db.get('journalEntries', id);
  if (!existing) throw new Error(`Unknown journal entry ${id}`);

  const updated: JournalEntry = {
    ...existing,
    ...update,
    updatedAt,
    status: 'reviewed',
  };

  await db.put('journalEntries', updated);
  return updated;
}

export async function getJournalEntry(id: string): Promise<JournalEntry | undefined> {
  const db = await getDb();
  return db.get('journalEntries', id);
}

export async function listJournalEntries(limit = 30): Promise<JournalEntry[]> {
  const db = await getDb();
  const rows = await db.getAllFromIndex('journalEntries', 'by-created-at');
  return rows.reverse().slice(0, limit);
}

export async function deleteJournalEntry(id: string): Promise<void> {
  const db = await getDb();
  await db.delete('journalEntries', id);
}

export async function countJournalEntries(): Promise<number> {
  const db = await getDb();
  return db.count('journalEntries');
}
