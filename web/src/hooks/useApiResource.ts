/**
 * AttendSure V3 - Reusable Fast Data Fetching Hook (with AbortController Cancellation)
 * File: web/src/hooks/useApiResource.ts
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import apiClient from '../api/client';

export function useApiResource<T>(
  endpoint: string,
  initialValue: T,
  params?: Record<string, any>
) {
  const [data, setData] = useState<T>(initialValue);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  const paramsKey = JSON.stringify(params || {});

  const reload = useCallback(
    async (silent = false) => {
      if (abortRef.current) {
        abortRef.current.abort();
      }
      const controller = new AbortController();
      abortRef.current = controller;

      if (!silent) setLoading(true);
      setError(null);

      try {
        const res = await apiClient.get(endpoint, {
          params: JSON.parse(paramsKey),
          signal: controller.signal,
        });
        setData(res.data);
      } catch (err: any) {
        if (err?.name === 'CanceledError' || err?.name === 'AbortError') return;
        setError(err?.response?.data?.error || 'Unable to load records.');
      } finally {
        if (!silent) setLoading(false);
      }
    },
    [endpoint, paramsKey]
  );

  useEffect(() => {
    reload(false);
    return () => {
      abortRef.current?.abort();
    };
  }, [reload]);

  return { data, setData, loading, error, reload };
}