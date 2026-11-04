/**
 * AttendSure - Centralized Design Tokens
 * File: web/src/theme/tokens.ts
 */

export const brandColors = {
  primary: '#5C97CD',      // Official AttendSure Blue
  secondary: '#FF9929',    // DepEd Accent Orange
  success: '#10B981',      // Verification Green
  danger: '#EF4444',       // Alert Red
  warning: '#F59E0B',      // Caution Amber
  info: '#3B82F6',         // Information Blue
};

export const themeTokens = {
  light: {
    bgCanvas: '#F6F8FB',
    bgSurface: '#FFFFFF',
    bgSurfaceSubtle: '#F1F5F9',
    bgSurfaceHover: '#EBF3FA',
    borderSubtle: '#EDF2F7',
    borderStrong: '#CBD5E1',
    textPrimary: '#0F172A',
    textSecondary: '#64748B',
    textMuted: '#94A3B8',
    primaryLight: 'rgba(92, 151, 205, 0.12)',
    primaryHover: '#4A82B5',
    cardShadow: '0 4px 20px -2px rgba(15, 23, 42, 0.04)',
    heroGradient: 'linear-gradient(180deg, rgba(92, 151, 205, 0.14) 0%, rgba(255, 255, 255, 0) 100%)',
  },
  dark: {
    bgCanvas: '#0B0F19',
    bgSurface: '#111827',
    bgSurfaceSubtle: '#1F2937',
    bgSurfaceHover: '#283548',
    borderSubtle: '#1F2937',
    borderStrong: '#374151',
    textPrimary: '#F9FAFB',
    textSecondary: '#9CA3AF',
    textMuted: '#6B7280',
    primaryLight: 'rgba(92, 151, 205, 0.22)',
    primaryHover: '#7CAEDD',
    cardShadow: '0 4px 20px -2px rgba(0, 0, 0, 0.40)',
    heroGradient: 'linear-gradient(180deg, rgba(92, 151, 205, 0.20) 0%, rgba(17, 24, 39, 0) 100%)',
  },
};

export type ThemeMode = 'light' | 'dark' | 'system';
export type ResolvedTheme = 'light' | 'dark';

// Legacy compatibility for Button.tsx, FormControls.tsx, and AuthPage.tsx
export const theme = {
  colors: {
    ...brandColors,
    ...themeTokens.light,
    surface: '#FFFFFF',
    surfaceSubtle: '#F1F5F9',
    dangerLight: 'rgba(239, 68, 68, 0.12)',
    successLight: 'rgba(16, 185, 129, 0.12)',
    warningLight: 'rgba(245, 158, 11, 0.12)',
    infoLight: 'rgba(59, 130, 246, 0.12)',
    textWhite: '#FFFFFF',
    text: '#0F172A',
    border: '#E2E8F0',
    background: '#FFFFFF',
  },
  radius: {
    none: '0px',
    xs: '4px',
    sm: '6px',
    md: '8px',
    lg: '12px',
    xl: '16px',
    full: '9999px',
  },
  shadows: {
    none: 'none',
    sm: '0 1px 2px 0 rgba(0, 0, 0, 0.05)',
    md: '0 4px 6px -1px rgba(0, 0, 0, 0.1), 0 2px 4px -1px rgba(0, 0, 0, 0.06)',
    lg: '0 10px 15px -3px rgba(0, 0, 0, 0.1), 0 4px 6px -2px rgba(0, 0, 0, 0.05)',
    xl: '0 20px 25px -5px rgba(0, 0, 0, 0.1), 0 10px 10px -5px rgba(0, 0, 0, 0.04)',
    card: '0 4px 20px -2px rgba(15, 23, 42, 0.04)',
  },
  ...themeTokens.light,
  brand: brandColors,
  tokens: themeTokens,
};

export default theme;