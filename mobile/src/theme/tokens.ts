// AttendSure Mobile - Tokens
// File: D:\AttendSure_V3\mobile\src\theme\tokens.ts

/**
 * AttendSure Mobile - Centralized Design Tokens (Synchronized with web/src/theme/tokens.ts)
 * File: mobile/src/theme/tokens.ts
 */

import { Platform } from 'react-native';

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
  buttonBg: string;
  dangerBg: string;
  onPrimary: string;
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
  warningHighlight: string;
  danger: string;
  dangerLight: string;
  info: string;
  infoLight: string;
  shadowColor: string;
}

export const PALETTES: Record<ThemeMode, ThemePalette> = {
  light: {
    mode: 'light',
    isDark: false,
    primary: '#004b87',
    primaryDark: '#003460',
    primarySoft: '#e0f2fe',
    buttonBg: '#004b87',
    dangerBg: '#dc2626',
    onPrimary: '#ffffff',
    secondary: '#0284c7',
    background: '#f8fafc',
    surface: '#ffffff',
    surfaceSubtle: '#f4f7fa',
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
    warningHighlight: '#fef08a',
    danger: '#dc2626',
    dangerLight: '#fee2e2',
    info: '#0284c7',
    infoLight: '#e0f2fe',
    shadowColor: '#0f172a',
  },
  dark: {
    mode: 'dark',
    isDark: true,
    primary: '#38bdf8',
    primaryDark: '#0284c7',
    primarySoft: 'rgba(56, 189, 248, 0.18)',
    buttonBg: '#0284c7',
    dangerBg: '#dc2626',
    onPrimary: '#ffffff',
    secondary: '#38bdf8',
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
    success: '#10b981',
    successLight: 'rgba(16, 185, 129, 0.18)',
    warning: '#f59e0b',
    warningLight: 'rgba(245, 158, 11, 0.18)',
    warningHighlight: '#fef08a',
    danger: '#f87171',
    dangerLight: 'rgba(239, 68, 68, 0.2)',
    info: '#38bdf8',
    infoLight: 'rgba(56, 189, 248, 0.18)',
    shadowColor: '#000000',
  },
  'high-contrast': {
    mode: 'high-contrast',
    isDark: false,
    primary: '#002b4d',
    primaryDark: '#001d36',
    primarySoft: '#dbeafe',
    buttonBg: '#002b4d',
    dangerBg: '#b91c1c',
    onPrimary: '#ffffff',
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
    warningHighlight: '#fef08a',
    danger: '#b91c1c',
    dangerLight: '#fee2e2',
    info: '#004b87',
    infoLight: '#dbeafe',
    shadowColor: '#000000',
  },
};

export const QR_COLORS = {
  foreground: '#003460',
  background: '#ffffff',
} as const;

export const SCANNER_OVERLAY_COLORS = {
  surface: '#0f172a',
  reticle: '#38bdf8',
  activeRing: '#22c55e',
  hintText: '#ffffff',
} as const;
