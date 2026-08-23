import { getDb } from './db';
import { newId } from './ids';
import {
  DEFAULT_LANGUAGE,
  type ComprehensionAnswerRecord,
  type ComprehensionSession,
  type LanguageCode,
} from './types';

export interface SaveComprehensionSessionInput {
  theme: string;
  passage: string;
  answers: ComprehensionAnswerRecord[];
  exposedVocabIds: string[];
  masteryVocabIds: string[];
  language?: LanguageCode;
  createdAt?: number;
  completedAt?: number | null;
}

export async function saveComprehensionSession(
  input: SaveComprehensionSessionInput,
): Promise<ComprehensionSession> {
  const now = Date.now();
  const session: ComprehensionSession = {
    id: newId(),
    language: input.language ?? DEFAULT_LANGUAGE,
    createdAt: input.createdAt ?? now,
    completedAt: input.completedAt === undefined ? now : input.completedAt,
    theme: input.theme,
    passage: input.passage,
    answers: input.answers,
    exposedVocabIds: input.exposedVocabIds,
    masteryVocabIds: input.masteryVocabIds,
  };

  const db = await getDb();
  await db.put('comprehensionSessions', session);
  return session;
}

export async function listComprehensionSessions(limit = 30): Promise<ComprehensionSession[]> {
  const db = await getDb();
  const rows = await db.getAllFromIndex('comprehensionSessions', 'by-created-at');
  return rows.reverse().slice(0, limit);
}

export async function getComprehensionSession(id: string): Promise<ComprehensionSession | undefined> {
  const db = await getDb();
  return db.get('comprehensionSessions', id);
}

export async function countComprehensionSessions(): Promise<number> {
  const db = await getDb();
  return db.count('comprehensionSessions');
}

/** Themes the learner has already used, most recent first, de-duplicated. */
export async function listRecentThemes(limit = 6): Promise<string[]> {
  const sessions = await listComprehensionSessions(40);
  const themes: string[] = [];
  for (const session of sessions) {
    const theme = session.theme.trim();
    if (theme !== '' && !themes.includes(theme)) themes.push(theme);
    if (themes.length >= limit) break;
  }
  return themes;
}
