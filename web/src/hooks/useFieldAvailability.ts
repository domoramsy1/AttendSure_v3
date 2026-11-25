/**
 * AttendSure - Debounced & AbortController-Safe Live Field Availability Hook
 * File: web/src/hooks/useFieldAvailability.ts
 */

import { useEffect, useState } from 'react';
import apiClient from '../api/client';
import { API_ROUTES } from '../api/routes';

export type AvailabilityFieldName =
  | 'username'
  | 'email'
  | 'employee_id'
  | 'contact_number'
  | 'lrn'
  | 'subject_code'
  | 'room_name';

export interface FieldAvailabilityOptions {
  enabled: boolean;
  field: AvailabilityFieldName;
  value: string;
  minLength?: number;
  formatError?: string;
  fallbackMessage?: string;
  excludeId?: number;
  excludeUserId?: number;
  excludeTeacherId?: number;
  debounceMs?: number;
}

export interface FieldAvailabilityState {
  checking: boolean;
  error: string;
  isTaken: boolean;
  verified: boolean;
}

const IDLE_STATE: FieldAvailabilityState = {
  checking: false,
  error: '',
  isTaken: false,
  verified: false,
};

export function useFieldAvailability({
  enabled,
  field,
  value,
  minLength = 2,
  formatError,
  fallbackMessage,
  excludeId,
  excludeUserId,
  excludeTeacherId,
  debounceMs = 300,
}: FieldAvailabilityOptions): FieldAvailabilityState {
  const trimmed = String(value || '').trim();
  const shouldFetch = enabled && !formatError && trimmed.length >= minLength;
  const requestKey = shouldFetch
    ? JSON.stringify([
        field,
        trimmed,
        excludeId ?? null,
        excludeUserId ?? null,
        excludeTeacherId ?? null,
      ])
    : '';

  const [asyncResult, setAsyncResult] = useState<{
    key: string;
    state: FieldAvailabilityState;
  }>({ key: '', state: IDLE_STATE });

  useEffect(() => {
    if (!requestKey) return;

    const controller = new AbortController();
    const timer = setTimeout(async () => {
      setAsyncResult({ key: requestKey, state: { ...IDLE_STATE, checking: true } });
      try {
        const res = await apiClient.get(API_ROUTES.accounts.validateField, {
          params: {
            field,
            value: trimmed,
            exclude_id: excludeId,
            exclude_user_id: excludeUserId,
            exclude_teacher_id: excludeTeacherId,
            nocache: 1,
          },
          signal: controller.signal,
        });
        if (controller.signal.aborted) return;
        const taken = Boolean(res.data?.is_taken);
        setAsyncResult({
          key: requestKey,
          state: {
            checking: false,
            error: taken ? String(res.data?.message || fallbackMessage || 'Already in use.') : '',
            isTaken: taken,
            verified: !taken,
          },
        });
      } catch {
        if (!controller.signal.aborted) {
          setAsyncResult({ key: requestKey, state: IDLE_STATE });
        }
      }
    }, debounceMs);

    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [
    requestKey,
    field,
    trimmed,
    fallbackMessage,
    excludeId,
    excludeUserId,
    excludeTeacherId,
    debounceMs,
  ]);

  if (!enabled) return IDLE_STATE;
  if (formatError) {
    return { checking: false, error: formatError, isTaken: false, verified: false };
  }
  if (!requestKey) return IDLE_STATE;
  return asyncResult.key === requestKey ? asyncResult.state : IDLE_STATE;
}
