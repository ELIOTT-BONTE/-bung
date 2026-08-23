import { useCallback, useEffect, useRef, useState } from 'react';

export interface AsyncState<T> {
  data: T | null;
  loading: boolean;
  error: Error | null;
  reload: () => void;
}

/**
 * Small read-only data hook for IndexedDB queries. Deliberately not a cache:
 * every screen owns its own read and calls `reload` after it writes.
 *
 * `deps` are spread into the effect dependency list; pass primitives.
 */
export function useAsync<T>(factory: () => Promise<T>, deps: readonly unknown[] = []): AsyncState<T> {
  const [data, setData] = useState<T | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);
  const [nonce, setNonce] = useState(0);

  const factoryRef = useRef(factory);
  factoryRef.current = factory;

  useEffect(() => {
    let cancelled = false;
    setLoading(true);

    factoryRef
      .current()
      .then((result) => {
        if (cancelled) return;
        setData(result);
        setError(null);
      })
      .catch((caught: unknown) => {
        if (cancelled) return;
        setError(caught instanceof Error ? caught : new Error(String(caught)));
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [nonce, ...deps]);

  const reload = useCallback(() => setNonce((value) => value + 1), []);

  return { data, loading, error, reload };
}
