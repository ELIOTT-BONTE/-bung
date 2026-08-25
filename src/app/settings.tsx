/**
 * App-wide settings.
 *
 * This is the one place that bridges storage and inference: it reads the saved
 * local tier and the hosted provider keys out of IndexedDB and pushes them into
 * the inference layer. Neither layer knows about the other.
 */

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import { LOCAL_TIERS, setActiveTier, setSettingsKeys, type LocalInferenceTier } from '../inference';
import { DEFAULT_SETTINGS, getSettings, updateSettings, type AppSettings } from '../storage';

/**
 * Narrows a stored tier id to a local engine. Hosted providers are deliberately
 * not accepted: they are chain links, not a choice of engine, so a stored
 * `"mistral"` from a hand-edited database falls back rather than being honoured.
 */
export function asInferenceTier(
  value: string,
  fallback: LocalInferenceTier = 'mock',
): LocalInferenceTier {
  return (LOCAL_TIERS as readonly string[]).includes(value)
    ? (value as LocalInferenceTier)
    : fallback;
}

/** Pushes everything the inference layer needs out of a settings record. */
function applyToInference(settings: AppSettings): void {
  setActiveTier(asInferenceTier(settings.activeTier));
  setSettingsKeys(settings.apiKeys);
}

interface SettingsContextValue {
  settings: AppSettings;
  activeTier: LocalInferenceTier;
  ready: boolean;
  error: Error | null;
  update: (patch: Partial<AppSettings>) => Promise<void>;
}

const SettingsContext = createContext<SettingsContextValue | null>(null);

export function SettingsProvider({ children }: { children: ReactNode }) {
  const [settings, setSettings] = useState<AppSettings>(DEFAULT_SETTINGS);
  const [ready, setReady] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  useEffect(() => {
    let cancelled = false;

    getSettings()
      .then((loaded) => {
        if (cancelled) return;
        setSettings(loaded);
        applyToInference(loaded);
      })
      .catch((caught: unknown) => {
        if (!cancelled) setError(caught instanceof Error ? caught : new Error(String(caught)));
      })
      .finally(() => {
        if (!cancelled) setReady(true);
      });

    return () => {
      cancelled = true;
    };
  }, []);

  const update = useCallback(async (patch: Partial<AppSettings>) => {
    const next = await updateSettings(patch);
    setSettings(next);
    applyToInference(next);
  }, []);

  const value = useMemo<SettingsContextValue>(
    () => ({
      settings,
      activeTier: asInferenceTier(settings.activeTier),
      ready,
      error,
      update,
    }),
    [settings, ready, error, update],
  );

  return <SettingsContext.Provider value={value}>{children}</SettingsContext.Provider>;
}

export function useSettings(): SettingsContextValue {
  const context = useContext(SettingsContext);
  if (!context) throw new Error('useSettings must be used inside a SettingsProvider');
  return context;
}
