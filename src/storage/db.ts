/**
 * IndexedDB schema and connection.
 *
 * All persistence is per-browser. There is no server, no sync and no export
 * beyond what the user does with their own device.
 */

import { openDB, type DBSchema, type IDBPDatabase } from 'idb';
import type {
  ComprehensionSession,
  JournalEntry,
  SrsReviewLogEntry,
  StoredSettings,
  VocabEntry,
} from './types';

export const DB_NAME = 'german-trainer';
export const DB_VERSION = 1;

export interface TrainerDB extends DBSchema {
  vocab: {
    key: string;
    value: VocabEntry;
    indexes: {
      'by-normalized-term': string;
      'by-due-at': number;
      'by-mastery': number;
      'by-language': string;
    };
  };
  journalEntries: {
    key: string;
    value: JournalEntry;
    indexes: { 'by-created-at': number };
  };
  comprehensionSessions: {
    key: string;
    value: ComprehensionSession;
    indexes: { 'by-created-at': number };
  };
  srsReviewLog: {
    key: string;
    value: SrsReviewLogEntry;
    indexes: { 'by-vocab-id': string; 'by-reviewed-at': number };
  };
  settings: {
    key: string;
    value: StoredSettings;
  };
}

export type TrainerDatabase = IDBPDatabase<TrainerDB>;

let connection: Promise<TrainerDatabase> | null = null;

export function getDb(): Promise<TrainerDatabase> {
  if (!connection) {
    connection = openDB<TrainerDB>(DB_NAME, DB_VERSION, {
      upgrade(db) {
        if (!db.objectStoreNames.contains('vocab')) {
          const vocab = db.createObjectStore('vocab', { keyPath: 'id' });
          vocab.createIndex('by-normalized-term', 'normalizedTerm', { unique: true });
          // Nested key path: lets the trainer pull due words without a scan.
          vocab.createIndex('by-due-at', 'srs.dueAt');
          vocab.createIndex('by-mastery', 'masteryLevel');
          vocab.createIndex('by-language', 'language');
        }

        if (!db.objectStoreNames.contains('journalEntries')) {
          const journal = db.createObjectStore('journalEntries', { keyPath: 'id' });
          journal.createIndex('by-created-at', 'createdAt');
        }

        if (!db.objectStoreNames.contains('comprehensionSessions')) {
          const sessions = db.createObjectStore('comprehensionSessions', { keyPath: 'id' });
          sessions.createIndex('by-created-at', 'createdAt');
        }

        if (!db.objectStoreNames.contains('srsReviewLog')) {
          const log = db.createObjectStore('srsReviewLog', { keyPath: 'id' });
          log.createIndex('by-vocab-id', 'vocabId');
          log.createIndex('by-reviewed-at', 'reviewedAt');
        }

        if (!db.objectStoreNames.contains('settings')) {
          db.createObjectStore('settings', { keyPath: 'id' });
        }
      },
      blocked() {
        console.warn('Another tab is holding an older version of the database open.');
      },
      blocking() {
        // A newer version wants in; drop this connection so it can upgrade.
        connection?.then((db) => db.close());
        connection = null;
      },
    });
  }

  return connection;
}

/** Wipes every store. Used by the "reset all data" action in Settings. */
export async function clearAllData(): Promise<void> {
  const db = await getDb();
  const tx = db.transaction(
    ['vocab', 'journalEntries', 'comprehensionSessions', 'srsReviewLog', 'settings'],
    'readwrite',
  );
  await Promise.all([
    tx.objectStore('vocab').clear(),
    tx.objectStore('journalEntries').clear(),
    tx.objectStore('comprehensionSessions').clear(),
    tx.objectStore('srsReviewLog').clear(),
    tx.objectStore('settings').clear(),
    tx.done,
  ]);
}

export function isIndexedDbAvailable(): boolean {
  return typeof indexedDB !== 'undefined';
}
