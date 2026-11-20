/**
 * AttendSure - Zero-Lag SWR Data Hook (Instant Cache Hydration + Keep-Previous-Data)
 * File: web/src/hooks/useApiResource.ts
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import apiClient, { peekApiCache, subscribeApiCache } from '../api/client';
import { extractApiError } from '../api/routes';

export function useApiResource<T>(
  endpoint: string,
  initialValue: T,
  params?: Record<string, unknown>
) {
  const paramsKey = JSON.stringify(params || {});
  const stableParams = useMemo<Record<string, unknown> | undefined>(
    () => (paramsKey === '{}' ? undefined : JSON.parse(paramsKey)),
    [paramsKey]
  );

  const initialCached = useMemo(
    () => peekApiCache<T>(endpoint, stableParams),
    [endpoint, stableParams]
  );

  const [data, setData] = useState<T>(() =>
    initialCached !== undefined ? initialCached : initialValue
  );
  const [loading, setLoading] = useState<boolean>(() => initialCached === undefined);
  const [refreshing, setRefreshing] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  const hasDataRef = useRef<boolean>(initialCached !== undefined);
  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    return subscribeApiCache(endpoint, stableParams, (freshPayload) => {
      hasDataRef.current = true;
      setData(freshPayload as T);
      setLoading(false);
      setRefreshing(false);
    });
  }, [endpoint, stableParams]);

  const reload = useCallback(
    async (silent = false, bypassCache = false) => {
      abortRef.current?.abort();
      const controller = new AbortController();
      abortRef.current = controller;

      const warmHit = !bypassCache ? peekApiCache<T>(endpoint, stableParams) : undefined;
      if (warmHit !== undefined) {
        hasDataRef.current = true;
        setData(warmHit);
        setLoading(false);
      } else if (!silent && !hasDataRef.current) {
        setLoading(true);
      } else {
        setRefreshing(true);
      }

      setError(null);

      try {
        const reqParams = bypassCache
          ? { ...(stableParams || {}), nocache: 1 }
          : stableParams;
        const res = await apiClient.get<T>(endpoint, {
          params: reqParams,
          signal: controller.signal,
        });
        hasDataRef.current = true;
        setData(res.data);
      } catch (err: unknown) {
        const anyErr = err as { name?: string; code?: string };
        if (anyErr?.name === 'CanceledError' || anyErr?.code === 'ERR_CANCELED') return;
        setError(extractApiError(err, 'Unable to load records.'));
      } finally {
        if (!controller.signal.aborted) {
          setLoading(false);
          setRefreshing(false);
        }
      }
    },
    [endpoint, stableParams]
  );

  useEffect(() => {
    void reload(hasDataRef.current, false);
    return () => {
      abortRef.current?.abort();
    };
  }, [reload]);

  return { data, setData, loading, refreshing, error, reload };
}