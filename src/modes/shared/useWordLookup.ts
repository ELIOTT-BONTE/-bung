/**
 * The stateful half of word lookup, kept out of both the pipeline and the panel.
 *
 * It exists mostly for two problems that only show up once a learner is really
 * reading. They tap words faster than a model answers, so every resolution is
 * guarded by a request id and a late reply for an abandoned word is dropped.
 * And they tap the same word twice, so resolutions are cached for as long as the
 * text is on screen — the second tap costs nothing.
 *
 * `added` is the reason the caller holds this rather than the panel: those
 * entries have been saved but not yet credited with an exposure, and only the
 * caller knows when its session ends.
 */

import { useCallback, useRef, useState } from 'react';
import { normalizeTerm, type VocabEntry } from '../../storage';
import {
  addLookupToVocab,
  resolveLookup,
  type FlaggedWord,
  type KnownLookup,
  type LookupResolution,
  type LookupTarget,
  type NewLookup,
} from './wordLookup';

export interface WordLookupController {
  /** What is being looked up, kept while it resolves so the panel can say so. */
  target: LookupTarget | null;
  resolution: LookupResolution | null;
  loading: boolean;
  adding: boolean;
  error: unknown;
  /** Every distinct word looked up in this text, most recent first. */
  history: LookupResolution[];
  /** Words saved from this text, for the caller to fold into its own session. */
  added: VocabEntry[];
  /** Resolutions still offering an Add button. */
  pending: NewLookup[];
  request: (target: LookupTarget) => void;
  add: (resolution: NewLookup) => void;
  addAll: () => void;
  retry: () => void;
  reset: () => void;
}

function keyFor(target: LookupTarget): string {
  return normalizeTerm(target.surface);
}

export function useWordLookup(flagged: readonly FlaggedWord[] = []): WordLookupController {
  const [target, setTarget] = useState<LookupTarget | null>(null);
  const [resolution, setResolution] = useState<LookupResolution | null>(null);
  const [loading, setLoading] = useState(false);
  const [adding, setAdding] = useState(false);
  const [error, setError] = useState<unknown>(null);
  const [history, setHistory] = useState<LookupResolution[]>([]);
  const [added, setAdded] = useState<VocabEntry[]>([]);

  const cache = useRef(new Map<string, LookupResolution>());
  const requestId = useRef(0);
  // Read through a ref so `request` does not change identity every time the
  // passage's flagged vocabulary finishes loading.
  const flaggedRef = useRef(flagged);
  flaggedRef.current = flagged;

  const remember = useCallback((next: LookupResolution) => {
    const key = keyFor(next.target);
    cache.current.set(key, next);
    setHistory((rows) => [next, ...rows.filter((row) => keyFor(row.target) !== key)]);
  }, []);

  const request = useCallback(
    (next: LookupTarget) => {
      const surface = next.surface.trim();
      if (surface === '') return;

      const id = ++requestId.current;
      setTarget(next);
      setError(null);

      const cached = cache.current.get(normalizeTerm(surface));
      if (cached) {
        setResolution(cached);
        setLoading(false);
        return;
      }

      setResolution(null);
      setLoading(true);

      void (async () => {
        try {
          const resolved = await resolveLookup(next, { flagged: flaggedRef.current });
          if (id !== requestId.current) return;
          setResolution(resolved);
          remember(resolved);
        } catch (caught) {
          if (id !== requestId.current) return;
          setError(caught);
        } finally {
          if (id === requestId.current) setLoading(false);
        }
      })();
    },
    [remember],
  );

  const save = useCallback(
    async (item: NewLookup) => {
      const entry = await addLookupToVocab(item.draft);
      const next: KnownLookup = {
        kind: 'known',
        target: item.target,
        source: item.source,
        surfaceRole: item.surfaceRole,
        entry,
      };

      remember(next);
      setAdded((rows) => (rows.some((row) => row.id === entry.id) ? rows : [...rows, entry]));
      setResolution((current) =>
        current && keyFor(current.target) === keyFor(item.target) ? next : current,
      );
    },
    [remember],
  );

  const add = useCallback(
    (item: NewLookup) => {
      setAdding(true);
      setError(null);
      void save(item)
        .catch(setError)
        .finally(() => setAdding(false));
    },
    [save],
  );

  const pending = history.filter((row): row is NewLookup => row.kind === 'new');

  const addAll = useCallback(() => {
    setAdding(true);
    setError(null);
    void (async () => {
      try {
        // Sequential on purpose: `upsertVocabDrafts` opens its own transaction,
        // and two of them racing on the same word would both see it as absent.
        for (const item of history) {
          if (item.kind === 'new') await save(item);
        }
      } catch (caught) {
        setError(caught);
      } finally {
        setAdding(false);
      }
    })();
  }, [history, save]);

  const retry = useCallback(() => {
    if (!target) return;
    cache.current.delete(keyFor(target));
    request(target);
  }, [request, target]);

  const reset = useCallback(() => {
    requestId.current += 1;
    cache.current.clear();
    setTarget(null);
    setResolution(null);
    setLoading(false);
    setAdding(false);
    setError(null);
    setHistory([]);
    setAdded([]);
  }, []);

  return {
    target,
    resolution,
    loading,
    adding,
    error,
    history,
    added,
    pending,
    request,
    add,
    addAll,
    retry,
    reset,
  };
}
