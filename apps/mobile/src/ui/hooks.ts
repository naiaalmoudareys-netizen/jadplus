/** Screen helpers: a clock that ticks, and loading data with refresh. */
import { useCallback, useEffect, useState } from 'react';
import { ApiError } from '../api/client.js';

/** The current time, updated every `everyMs` so countdowns stay right. */
export function useNow(everyMs = 15_000): number {
  const [now, setNow] = useState(Date.now);
  useEffect(() => {
    const id = setInterval(() => {
      setNow(Date.now());
    }, everyMs);
    return () => {
      clearInterval(id);
    };
  }, [everyMs]);
  return now;
}

export interface Loaded<T> {
  readonly data: T | null;
  readonly error: string | null;
  readonly loading: boolean;
  readonly reload: () => Promise<void>;
}

/** Loads data on open, again every `refreshMs` (no push notifications yet), and on demand. */
export function useLoad<T>(load: () => Promise<T>, refreshMs: number | null = null): Loaded<T> {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const reload = useCallback(async () => {
    setLoading(true);
    try {
      setData(await load());
      setError(null);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Something went wrong. Please try again.');
    } finally {
      setLoading(false);
    }
  }, [load]);
  useEffect(() => {
    void reload();
    if (refreshMs === null) return undefined;
    const id = setInterval(() => void reload(), refreshMs);
    return () => {
      clearInterval(id);
    };
  }, [reload, refreshMs]);
  return { data, error, loading, reload };
}
