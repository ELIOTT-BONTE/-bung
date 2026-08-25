/**
 * API keys for the hosted providers.
 *
 * Two rules shape this module.
 *
 * The inference layer imports no storage, so keys are *pushed in* from the app
 * shell the same way the active tier is — `setSettingsKeys` here mirrors
 * `setActiveLocalTier` in `index.ts`.
 *
 * Env vars are read only when `loadEnvKeys()` is called, never at import time.
 * A developer with real keys in `.env` must be able to run `npm test` without
 * the suite quietly making live, rate-limited API calls; tests simply never
 * call it.
 */

import { HOSTED_TIERS, type HostedProviderId } from './types';

export const API_KEY_ENV_VARS: Readonly<Record<HostedProviderId, string>> = {
  mistral: 'VITE_MISTRAL_API_KEY',
  gemini: 'VITE_GEMINI_API_KEY',
  groq: 'VITE_GROQ_API_KEY',
};

/** Where a resolved key came from, for the settings screen to show. */
export type ApiKeySource = 'settings' | 'env';

type KeyMap = Partial<Record<HostedProviderId, string>>;

let envKeys: KeyMap = {};
let settingsKeys: KeyMap = {};

function clean(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return trimmed === '' ? null : trimmed;
}

/**
 * Reads `VITE_*_API_KEY` out of the build-time environment. Called once by the
 * app shell.
 *
 * Note that Vite inlines these at build time, so any key present when `npm run
 * build` runs is readable by anyone who loads the deployed bundle.
 */
export function loadEnvKeys(env: Record<string, unknown> = import.meta.env): void {
  const next: KeyMap = {};
  for (const provider of HOSTED_TIERS) {
    const value = clean(env[API_KEY_ENV_VARS[provider]]);
    if (value) next[provider] = value;
  }
  envKeys = next;
}

/** Replaces the stored keys wholesale, so clearing a field clears the key. */
export function setSettingsKeys(keys: Readonly<Record<string, string>> | undefined): void {
  const next: KeyMap = {};
  for (const provider of HOSTED_TIERS) {
    const value = clean(keys?.[provider]);
    if (value) next[provider] = value;
  }
  settingsKeys = next;
}

/** A key the user typed wins over one baked into the build. */
export function resolveApiKey(provider: HostedProviderId): string | null {
  return settingsKeys[provider] ?? envKeys[provider] ?? null;
}

export function apiKeySource(provider: HostedProviderId): ApiKeySource | null {
  if (settingsKeys[provider]) return 'settings';
  if (envKeys[provider]) return 'env';
  return null;
}

export function hasApiKey(provider: HostedProviderId): boolean {
  return resolveApiKey(provider) !== null;
}

/**
 * Test seam. The settings screen's "delete all local data" reloads the page,
 * which clears this module along with everything else.
 */
export function clearApiKeys(): void {
  envKeys = {};
  settingsKeys = {};
}
