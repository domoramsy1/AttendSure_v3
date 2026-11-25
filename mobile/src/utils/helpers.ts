// AttendSure Mobile - Helpers
// File: D:\AttendSure_V3\mobile\src\utils\helpers.ts

/**
 * AttendSure Mobile - Centralized Helpers (Alerts, Confirmations, Media URLs, GPS & Initials)
 * File: mobile/src/utils/helpers.ts
 */

import { Alert, Platform } from 'react-native';
import { isSafeUrl } from '../constants/theme';

export const isCanceledError = (err: unknown): boolean => {
  const e = err as { code?: string; name?: string };
  return e?.code === 'ERR_CANCELED' || e?.name === 'CanceledError' || e?.name === 'AbortError';
};

export const showNotice = (title: string, message: string): void => {
  if (Platform.OS === 'web' && typeof window !== 'undefined') {
    window.alert(`${title}: ${message}`);
  } else {
    Alert.alert(title, message);
  }
};

export const confirmAction = (
  title: string,
  message: string,
  confirmLabel: string,
  onConfirm: () => void,
  isDestructive = true
): void => {
  if (Platform.OS === 'web' && typeof window !== 'undefined') {
    if (window.confirm(`${title}\n\n${message}`)) {
      onConfirm();
    }
    return;
  }
  Alert.alert(title, message, [
    { text: 'Cancel', style: 'cancel' },
    {
      text: confirmLabel,
      style: isDestructive ? 'destructive' : 'default',
      onPress: onConfirm,
    },
  ]);
};

export const resolveMediaUrl = (
  raw: string | null | undefined,
  serverBase: string
): string | null => {
  if (!raw || typeof raw !== 'string') return null;
  const trimmed = raw.trim();
  if (!trimmed) return null;
  const candidate =
    trimmed.startsWith('http://') || trimmed.startsWith('https://') || trimmed.startsWith('data:')
      ? trimmed
      : serverBase
        ? `${serverBase.replace(/\/+$/, '')}/${trimmed.replace(/^\/+/, '')}`
        : '';
  return isSafeUrl(candidate) ? candidate : null;
};

export const calculateDistanceMeters = (
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number
): number => {
  const R = 6371000.0;
  const dLat = ((lat2 - lat1) * Math.PI) / 180.0;
  const dLon = ((lon2 - lon1) * Math.PI) / 180.0;
  const radLat1 = (lat1 * Math.PI) / 180.0;
  const radLat2 = (lat2 * Math.PI) / 180.0;
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.sin(dLon / 2) * Math.sin(dLon / 2) * Math.cos(radLat1) * Math.cos(radLat2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return Math.round(R * c);
};

export const formatDistanceMeters = (meters: number): string => {
  if (meters >= 1000) {
    return `${(meters / 1000).toFixed(2)} km`;
  }
  return `${Math.round(meters)} m`;
};

export const getInitials = (name: string | null | undefined, fallback = 'S'): string => {
  const clean = String(name || '')
    .replace(/,/g, ' ')
    .trim();
  if (!clean) return fallback;
  const parts = clean.split(/\s+/).filter(Boolean);
  if (parts.length >= 2) {
    return `${parts[0][0]}${parts[parts.length - 1][0]}`.toUpperCase();
  }
  return parts[0].slice(0, 2).toUpperCase();
};
