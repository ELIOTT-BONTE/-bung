import { getDb } from './db';
import { DEFAULT_SETTINGS, SETTINGS_KEY, type AppSettings, type StoredSettings } from './types';

export async function getSettings(): Promise<AppSettings> {
  const db = await getDb();
  const stored = await db.get('settings', SETTINGS_KEY);
  if (!stored) return { ...DEFAULT_SETTINGS };
  const { id: _id, ...settings } = stored;
  return { ...DEFAULT_SETTINGS, ...settings };
}

export async function updateSettings(patch: Partial<AppSettings>): Promise<AppSettings> {
  const current = await getSettings();
  const next: StoredSettings = { ...current, ...patch, id: SETTINGS_KEY };
  const db = await getDb();
  await db.put('settings', next);
  const { id: _id, ...settings } = next;
  return settings;
}
