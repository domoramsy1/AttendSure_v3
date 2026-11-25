/**
 * AttendSure - Centralized Clipboard Utility & Copy Feedback Hook
 * File: web/src/utils/clipboard.ts
 */

import { useCallback, useEffect, useRef, useState } from 'react';

export const copyTextToClipboard = async (text: string): Promise<boolean> => {
  const cleanText = String(text || '').trim();
  if (!cleanText) return false;

  if (
    typeof navigator !== 'undefined' &&
    navigator.clipboard?.writeText &&
    (typeof window === 'undefined' || window.isSecureContext)
  ) {
    try {
      await navigator.clipboard.writeText(cleanText);
      return true;
    } catch {
      // Fall through to offscreen textarea copy on non-HTTPS LAN origins or denied clipboard permissions
    }
  }

  if (typeof document !== 'undefined') {
    const textArea = document.createElement('textarea');
    textArea.value = cleanText;
    textArea.setAttribute('readonly', '');
    textArea.style.position = 'fixed';
    textArea.style.left = '-999999px';
    textArea.style.top = '-999999px';
    document.body.appendChild(textArea);
    textArea.focus();
    textArea.select();
    let copied: boolean;
    try {
      copied = document.execCommand('copy');
    } catch {
      copied = false;
    }
    textArea.remove();
    return copied;
  }

  return false;
};

export function useCopyFeedback(timeoutMs = 2000) {
  const [copiedKey, setCopiedKey] = useState<string | null>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const reset = useCallback(() => {
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
    setCopiedKey(null);
  }, []);

  useEffect(() => {
    return () => {
      if (timerRef.current) {
        clearTimeout(timerRef.current);
        timerRef.current = null;
      }
    };
  }, []);

  const markCopied = useCallback(
    (key = 'default') => {
      setCopiedKey(key);
      if (timerRef.current) clearTimeout(timerRef.current);
      timerRef.current = setTimeout(() => {
        setCopiedKey((prev) => (prev === key ? null : prev));
        timerRef.current = null;
      }, timeoutMs);
    },
    [timeoutMs]
  );

  const copy = useCallback(
    async (text: string, key = text): Promise<boolean> => {
      const ok = await copyTextToClipboard(text);
      if (ok) {
        markCopied(key);
      }
      return ok;
    },
    [markCopied]
  );

  return {
    copiedKey,
    copied: copiedKey !== null,
    copy,
    markCopied,
    reset,
  };
}
