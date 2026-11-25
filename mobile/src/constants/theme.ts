/**
 * AttendSure Mobile - Master Theme Tokens, Shared Styles & Input Safety
 * File: mobile/src/constants/theme.ts
 */

import { StyleSheet, Platform } from 'react-native';
import {
  FONTS,
  SPACING,
  RADIUS,
  PALETTES,
  QR_COLORS,
  SCANNER_OVERLAY_COLORS,
  type ThemeMode,
  type ThemePalette,
} from '../theme/tokens';

export {
  FONTS,
  SPACING,
  RADIUS,
  PALETTES,
  QR_COLORS,
  SCANNER_OVERLAY_COLORS,
  type ThemeMode,
  type ThemePalette,
};

export const createUiStyles = (p: ThemePalette) =>
  StyleSheet.create({
    screen: { flex: 1, backgroundColor: p.background },
    scrollContent: { padding: SPACING.md, paddingBottom: 115, gap: SPACING.sm },
    centerBox: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24 },
    card: {
      backgroundColor: p.surface,
      borderRadius: RADIUS.lg,
      padding: SPACING.md,
      borderWidth: 1,
      borderColor: p.border,
      marginBottom: SPACING.sm,
      ...Platform.select({
        ios: { shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.05, shadowRadius: 6 },
        android: { elevation: 2 },
      }),
    },
    box: {
      backgroundColor: p.surfaceSubtle,
      borderRadius: RADIUS.md,
      padding: SPACING.sm,
      borderWidth: 1,
      borderColor: p.border,
    },
    subtleBox: {
      backgroundColor: p.surfaceSubtle,
      borderRadius: RADIUS.md,
      padding: SPACING.sm,
      borderWidth: 1,
      borderColor: p.border,
    },
    rowBetween: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
    rowCenter: { flexDirection: 'row', alignItems: 'center', gap: SPACING.sm },
    title: { fontSize: FONTS.lg, fontWeight: FONTS.weight.extrabold, color: p.textPrimary },
    heading: { fontSize: FONTS.md, fontWeight: FONTS.weight.extrabold, color: p.textPrimary, marginBottom: 6 },
    subtext: { fontSize: FONTS.xs, color: p.textSecondary },
    subtitle: { fontSize: FONTS.xs, color: p.textSecondary },
    label: { fontSize: FONTS.xs, fontWeight: FONTS.weight.bold, color: p.textSecondary, marginBottom: 4 },
    input: {
      height: 44,
      backgroundColor: p.surfaceSubtle,
      borderWidth: 1,
      borderColor: p.borderStrong,
      borderRadius: RADIUS.md,
      paddingHorizontal: 12,
      fontSize: FONTS.md,
      color: p.textPrimary,
    },
    buttonPrimary: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: p.buttonBg,
      height: 44,
      borderRadius: RADIUS.md,
      paddingHorizontal: SPACING.md,
      gap: 6,
    },
    buttonPrimaryText: { color: p.onPrimary, fontSize: FONTS.sm, fontWeight: FONTS.weight.extrabold },
    buttonSecondary: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: p.surfaceSubtle,
      borderWidth: 1,
      borderColor: p.borderStrong,
      height: 42,
      borderRadius: RADIUS.md,
      paddingHorizontal: SPACING.md,
      gap: 6,
    },
    buttonSecondaryText: { color: p.textPrimary, fontSize: FONTS.sm, fontWeight: FONTS.weight.bold },
    badge: {
      paddingHorizontal: 8,
      paddingVertical: 3,
      borderRadius: RADIUS.sm,
      alignSelf: 'flex-start',
    },
  });

export const createMobileStyles = createUiStyles;

const SAFE_RASTER_DATA_URI = /^data:image\/(png|jpeg|jpg|webp|gif);base64,/i;

export const isSafeUrl = (url?: string | null): url is string => {
  if (!url || typeof url !== 'string') return false;
  const trimmed = url.trim();
  const clean = trimmed.toLowerCase();
  if (!clean || ['null', 'undefined', 'none'].includes(clean)) return false;
  if (
    clean.startsWith('javascript:') ||
    clean.startsWith('vbscript:') ||
    clean.startsWith('file:') ||
    clean.startsWith('data:image/svg')
  ) {
    return false;
  }
  if (clean.startsWith('data:')) {
    return SAFE_RASTER_DATA_URI.test(trimmed);
  }
  if (clean.startsWith('/')) {
    return !clean.startsWith('//');
  }
  return clean.startsWith('http://') || clean.startsWith('https://');
};

export const cleanText = (val?: string | null, maxLen = 200): string => {
  if (!val) return '';
  return String(val)
    .replace(/[\u0000-\u001F\u007F<>]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, maxLen);
};

export const getFriendlyErrorMessage = (
  err: unknown,
  fallback = 'Something went wrong. Please try again.'
): string => {
  const e = err as {
    response?: { status?: number; data?: unknown };
    code?: string;
    message?: string;
  };
  const status = e?.response?.status;
  const data = e?.response?.data;

  const isUnsafeRaw = (text: string): boolean => {
    const trimmed = text.trim();
    return (
      trimmed.startsWith('<!DOCTYPE') ||
      trimmed.startsWith('<html') ||
      trimmed.includes('Traceback (most recent call last)') ||
      trimmed.includes('File "/') ||
      trimmed.length > 280
    );
  };

  if (typeof data === 'string' && data.trim() && !isUnsafeRaw(data)) {
    return data.trim();
  }

  if (data && typeof data === 'object') {
    const record = data as Record<string, unknown>;
    const candidate = record.detail || record.error || record.message;
    if (typeof candidate === 'string' && candidate.trim() && !isUnsafeRaw(candidate)) {
      return candidate.trim();
    }
    const firstVal = Object.values(record)[0];
    if (Array.isArray(firstVal) && typeof firstVal[0] === 'string' && !isUnsafeRaw(firstVal[0])) {
      return firstVal[0];
    }
    if (typeof firstVal === 'string' && firstVal.trim() && !isUnsafeRaw(firstVal)) {
      return firstVal.trim();
    }
  }

  if (status === 401) return 'Your session expired. Please sign in again.';
  if (status === 403) return 'You do not have permission to perform this action.';
  if (status === 404) return 'The requested information could not be found.';
  if (status && status >= 500) return 'The server is temporarily unavailable. Please try again shortly.';

  if (e?.code === 'ECONNABORTED' || e?.message?.toLowerCase().includes('timeout')) {
    return 'The request took too long. Please check your connection and try again.';
  }
  if (e?.message?.toLowerCase().includes('network error')) {
    return 'Cannot reach the school server. Check your Wi-Fi connection and try again.';
  }

  if (err instanceof Error && err.message && !isUnsafeRaw(err.message) && !err.message.includes('Request failed with status')) {
    return err.message;
  }

  return fallback;
};

export const COLORS = {
  ...PALETTES.light,
  primaryHover: '#003460',
  primaryLight: '#eff6ff',
  text: '#0f172a',
  borderSubtle: '#e2e8f0',
  white: '#ffffff',
};

export const theme = {
  colors: COLORS,
  spacing: SPACING,
  borderRadius: RADIUS,
  radius: RADIUS,
  typography: FONTS,
};

export default theme;