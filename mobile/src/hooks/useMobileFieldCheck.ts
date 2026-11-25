/**
 * AttendSure Mobile - Debounced & AbortController-Safe Live Field Availability Hook
 * File: mobile/src/hooks/useMobileFieldCheck.ts
 */

import { useEffect, useState } from 'react';
import { apiClient } from '../api/client';
import { ENDPOINTS } from '../api/endpoints';

export type MobileCheckFieldName =
  | 'username'
  | 'email'
  | 'employee_id'
  | 'contact_number'
  | 'lrn'
  | 'subject_code'
  | 'room_name';

export interface MobileFieldCheckOptions {
  enabled: boolean;
  field: MobileCheckFieldName;
  value: string;
  minLength?: number;
  minDigits?: number;
  formatError?: string;
  fallbackMessage?: string;
  excludeId?: number;
  excludeUserId?: number;
  excludeTeacherId?: number;
  debounceMs?: number;
}

export interface MobileFieldCheckResult {
  checking: boolean;
  warning: string;
  isTaken: boolean;
}

const IDLE_RESULT: MobileFieldCheckResult = {
  checking: false,
  warning: '',
  isTaken: false,
};

export function useMobileFieldCheck({
  enabled,
  field,
  value,
  minLength = 2,
  minDigits,
  formatError,
  fallbackMessage,
  excludeId,
  excludeUserId,
  excludeTeacherId,
  debounceMs = 320,
}: MobileFieldCheckOptions): MobileFieldCheckResult {
  const [state, setState] = useState<MobileFieldCheckResult>(IDLE_RESULT);

  useEffect(() => {
    if (!enabled) {
      setState(IDLE_RESULT);
      return;
    }

    const trimmed = String(value || '').trim();
    if (formatError) {
      setState({ checking: false, warning: formatError, isTaken: false });
      return;
    }

    if (!trimmed || trimmed.length < minLength) {
      setState(IDLE_RESULT);
      return;
    }

    if (minDigits !== undefined && trimmed.replace(/\D/g, '').length < minDigits) {
      setState(IDLE_RESULT);
      return;
    }

    const controller = new AbortController();
    const timer = setTimeout(async () => {
      setState((prev) => ({ ...prev, checking: true }));
      try {
        const params: Record<string, string | number> = {
          field,
          value: trimmed,
          nocache: 1,
        };
        if (excludeId) params.exclude_id = excludeId;
        if (excludeUserId) params.exclude_user_id = excludeUserId;
        if (excludeTeacherId) params.exclude_teacher_id = excludeTeacherId;

        const res = await apiClient.get(ENDPOINTS.VALIDATE_FIELD, {
          params,
          signal: controller.signal,
        });
        if (controller.signal.aborted) return;

        const taken = Boolean(res.data?.is_taken || res.data?.available === false);
        setState({
          checking: false,
          warning: taken
            ? String(
                res.data?.message ||
                  fallbackMessage ||
                  `This ${field.replace('_', ' ')} is already in use.`
              )
            : '',
          isTaken: taken,
        });
      } catch {
        if (!controller.signal.aborted) {
          setState(IDLE_RESULT);
        }
      }
    }, debounceMs);

    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [
    enabled,
    field,
    value,
    minLength,
    minDigits,
    formatError,
    fallbackMessage,
    excludeId,
    excludeUserId,
    excludeTeacherId,
    debounceMs,
  ]);

  return state;
}
