/**
 * App-wide settings.
 *
 * This is the one place that bridges storage and inference: it reads the saved
 * tier out of IndexedDB and pushes it into the inference layer. Neither layer
 * knows about the other.
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
import { INFERENCE_TIERS, setActiveTier, type InferenceTier } from '../inference';
import { DEFAULT_SETTINGS, getSettings, updateSettings, type AppSettings } from '../storage';

export function asInferenceTier(value: string, fallback: InferenceTier = 'mock'): InferenceTier {
  return (INFERENCE_TIERS as readonly string[]).includes(value) ? (value as InferenceTier) : fallback;
}

interface SettingsContextValue {
  settings: AppSettings;
  activeTier: InferenceTier;
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
        setActiveTier(asInferenceTier(loaded.activeTier));
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
    setActiveTier(asInferenceTier(next.activeTier));
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
