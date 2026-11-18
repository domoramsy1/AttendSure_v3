/**
 * AttendSure Mobile - Master Colors, Fonts, Reusable Styles & Security
 * File: mobile/src/constants/theme.ts
 */

import { StyleSheet, Platform } from 'react-native';

export type ThemeMode = 'light' | 'dark' | 'high-contrast';

const FONT_SIZES = {
  xxs: 10,
  xs: 11,
  sm: 12.5,
  base: 13.5,
  md: 14.5,
  lg: 17,
  xl: 22,
  xxl: 26,
};

const FONT_WEIGHTS = {
  regular: '400' as const,
  medium: '500' as const,
  semibold: '600' as const,
  semiBold: '600' as const,
  bold: '700' as const,
  extrabold: '800' as const,
  extraBold: '800' as const,
  black: '900' as const,
};

// Supports both `fonts.xxs` AND `fonts.size.xxs`, plus `fonts.weight` AND `fonts.weights`
export const FONTS = {
  ...FONT_SIZES,
  size: FONT_SIZES,
  sizes: FONT_SIZES,
  mono: Platform.select({ ios: 'Menlo', android: 'monospace', default: 'monospace' }),
  weight: FONT_WEIGHTS,
  weights: FONT_WEIGHTS,
};

export const SPACING = { xs: 4, sm: 8, md: 14, lg: 20, xl: 28 };
export const RADIUS = { sm: 8, md: 12, lg: 16, xl: 24, full: 9999 };

export interface ThemePalette {
  mode: ThemeMode;
  isDark: boolean;
  primary: string;
  primaryDark: string;
  primarySoft: string;
  secondary: string;
  background: string;
  surface: string;
  surfaceSubtle: string;
  headerBg: string;
  headerSurface: string;
  textPrimary: string;
  textSecondary: string;
  textMuted: string;
  border: string;
  borderStrong: string;
  success: string;
  successLight: string;
  warning: string;
  warningLight: string;
  danger: string;
  dangerLight: string;
  info: string;
  infoLight: string;
}

export const PALETTES: Record<ThemeMode, ThemePalette> = {
  light: {
    mode: 'light',
    isDark: false,
    primary: '#004b87',
    primaryDark: '#003460',
    primarySoft: '#dbe4ff',
    secondary: '#0284c7',
    background: '#f4f6fb',
    surface: '#ffffff',
    surfaceSubtle: '#f8fafc',
    headerBg: '#004b87',
    headerSurface: 'rgba(255, 255, 255, 0.18)',
    textPrimary: '#0f172a',
    textSecondary: '#475569',
    textMuted: '#64748b',
    border: '#e2e8f0',
    borderStrong: '#cbd5e1',
    success: '#059669',
    successLight: '#dcfce7',
    warning: '#d97706',
    warningLight: '#fef3c7',
    danger: '#dc2626',
    dangerLight: '#fee2e2',
    info: '#0284c7',
    infoLight: '#e0f2fe',
  },
  dark: {
    mode: 'dark',
    isDark: true,
    primary: '#38bdf8',
    primaryDark: '#0284c7',
    primarySoft: 'rgba(56, 189, 248, 0.18)',
    secondary: '#60a5fa',
    background: '#0b1120',
    surface: '#1e293b',
    surfaceSubtle: '#0f172a',
    headerBg: '#1e3a8a',
    headerSurface: 'rgba(255, 255, 255, 0.12)',
    textPrimary: '#f8fafc',
    textSecondary: '#cbd5e1',
    textMuted: '#94a3b8',
    border: '#334155',
    borderStrong: '#475569',
    success: '#22c55e',
    successLight: 'rgba(34, 197, 94, 0.18)',
    warning: '#f59e0b',
    warningLight: 'rgba(245, 158, 11, 0.18)',
    danger: '#f87171',
    dangerLight: 'rgba(239, 68, 68, 0.2)',
    info: '#38bdf8',
    infoLight: 'rgba(56, 189, 248, 0.18)',
  },
  'high-contrast': {
    mode: 'high-contrast',
    isDark: false,
    primary: '#002b4d',
    primaryDark: '#001a33',
    primarySoft: '#dbeafe',
    secondary: '#004b87',
    background: '#ffffff',
    surface: '#ffffff',
    surfaceSubtle: '#f1f5f9',
    headerBg: '#002b4d',
    headerSurface: 'rgba(255, 255, 255, 0.25)',
    textPrimary: '#000000',
    textSecondary: '#0f172a',
    textMuted: '#334155',
    border: '#0f172a',
    borderStrong: '#000000',
    success: '#047857',
    successLight: '#d1fae5',
    warning: '#b45309',
    warningLight: '#fef3c7',
    danger: '#b91c1c',
    dangerLight: '#fee2e2',
    info: '#004b87',
    infoLight: '#dbeafe',
  },
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
      backgroundColor: p.primary,
      height: 44,
      borderRadius: RADIUS.md,
      paddingHorizontal: SPACING.md,
      gap: 6,
    },
    buttonPrimaryText: { color: '#ffffff', fontSize: FONTS.sm, fontWeight: FONTS.weight.extrabold },
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

export const isSafeUrl = (url?: string | null): url is string => {
  if (!url || typeof url !== 'string') return false;
  const clean = url.trim().toLowerCase();
  if (!clean || ['null', 'undefined', 'none'].includes(clean)) return false;
  if (clean.startsWith('javascript:') || clean.startsWith('vbscript:') || clean.startsWith('file:')) return false;
  if (clean.startsWith('data:') && !clean.startsWith('data:image/')) return false;
  return clean.startsWith('http://') || clean.startsWith('https://') || clean.startsWith('/') || clean.startsWith('data:image/');
};

export const cleanText = (val?: string | null, maxLen = 200): string => {
  if (!val) return '';
  return String(val).replace(/[\r\n\t<>]/g, ' ').trim().slice(0, maxLen);
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