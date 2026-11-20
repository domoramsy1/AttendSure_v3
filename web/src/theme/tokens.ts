/**
 * ============================================================================
 * ATTENDSURE - CENTRAL DESIGN TOKENS, REUSABLE STYLES & INPUT SAFETY
 * File: web/src/theme/tokens.ts
 * ============================================================================
 */

import type React from 'react';

export type ThemeMode = 'light' | 'dark' | 'high-contrast';

export const FONTS = {
  sans: "'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif",
  display: "'Plus Jakarta Sans', 'Inter', sans-serif",
  mono: 'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace',
  size: {
    xs: '0.68rem',
    sm: '0.76rem',
    base: '0.84rem',
    md: '0.96rem',
    lg: '1.15rem',
    xl: '1.55rem',
  },
  weight: {
    normal: 400,
    medium: 500,
    semibold: 600,
    bold: 700,
    extrabold: 800,
    black: 900,
  },
};

export const RADIUS = {
  sm: 6,
  md: 8,
  lg: 12,
  xl: 16,
  pill: 9999,
};

export interface BrandColors {
  primary: string;
  primarySoft: string;
  buttonBg: string;
  buttonHover: string;
  secondary: string;
  success: string;
  warning: string;
  danger: string;
}

export const BRAND_COLORS: Record<ThemeMode, BrandColors> = {
  light: {
    primary: '#004b87',
    primarySoft: '#e0f2fe',
    buttonBg: '#004b87',
    buttonHover: '#003a6b',
    secondary: '#0284c7',
    success: '#059669',
    warning: '#d97706',
    danger: '#dc2626',
  },
  dark: {
    primary: '#38bdf8',
    primarySoft: 'rgba(56, 189, 248, 0.16)',
    buttonBg: '#0284c7',
    buttonHover: '#0369a1',
    secondary: '#38bdf8',
    success: '#10b981',
    warning: '#f59e0b',
    danger: '#f87171',
  },
  'high-contrast': {
    primary: '#002b4d',
    primarySoft: '#dbeafe',
    buttonBg: '#002b4d',
    buttonHover: '#001d36',
    secondary: '#004b87',
    success: '#047857',
    warning: '#b45309',
    danger: '#b91c1c',
  },
};

export interface ThemeTokens {
  bgApp: string;
  bgCanvas: string;
  bgSurface: string;
  bgSurfaceSubtle: string;
  bgSurfaceHover: string;
  bgInput: string;
  textPrimary: string;
  textSecondary: string;
  textMuted: string;
  borderSubtle: string;
  borderInput: string;
  borderStrong: string;
  primaryLight: string;
  success: string;
  warning: string;
  danger: string;
  successBg: string;
  warningBg: string;
  dangerBg: string;
  successLight: string;
  warningLight: string;
  dangerLight: string;
  infoLight: string;
  cardShadow: string;
}

export const THEME_PALETTES: Record<ThemeMode, ThemeTokens> = {
  light: {
    bgApp: '#eef2f6',
    bgCanvas: '#f8fafc',
    bgSurface: '#ffffff',
    bgSurfaceSubtle: '#f4f7fa',
    bgSurfaceHover: '#edf2f7',
    bgInput: '#ffffff',
    textPrimary: '#0f172a',
    textSecondary: '#475569',
    textMuted: '#64748b',
    borderSubtle: '#e2e8f0',
    borderInput: '#cbd5e1',
    borderStrong: '#cbd5e1',
    primaryLight: 'rgba(0, 75, 135, 0.08)',
    success: '#059669',
    warning: '#d97706',
    danger: '#dc2626',
    successBg: '#ecfdf5',
    warningBg: '#fffbeb',
    dangerBg: '#fef2f2',
    successLight: 'rgba(5, 150, 105, 0.11)',
    warningLight: 'rgba(217, 119, 6, 0.12)',
    dangerLight: 'rgba(220, 38, 38, 0.10)',
    infoLight: 'rgba(2, 132, 199, 0.10)',
    cardShadow: '0 4px 20px -2px rgba(15, 23, 42, 0.06)',
  },
  dark: {
    bgApp: '#070d19',
    bgCanvas: '#0b1324',
    bgSurface: '#111c30',
    bgSurfaceSubtle: '#17243d',
    bgSurfaceHover: '#1e2f4d',
    bgInput: '#0f172a',
    textPrimary: '#f8fafc',
    textSecondary: '#cbd5e1',
    textMuted: '#94a3b8',
    borderSubtle: '#1e2f48',
    borderInput: '#334155',
    borderStrong: '#2e4466',
    primaryLight: 'rgba(56, 189, 248, 0.14)',
    success: '#10b981',
    warning: '#f59e0b',
    danger: '#f87171',
    successBg: 'rgba(16, 185, 129, 0.16)',
    warningBg: 'rgba(245, 158, 11, 0.16)',
    dangerBg: 'rgba(248, 113, 113, 0.16)',
    successLight: 'rgba(16, 185, 129, 0.16)',
    warningLight: 'rgba(245, 158, 11, 0.16)',
    dangerLight: 'rgba(248, 113, 113, 0.16)',
    infoLight: 'rgba(56, 189, 248, 0.14)',
    cardShadow: '0 8px 28px -4px rgba(0, 0, 0, 0.55)',
  },
  'high-contrast': {
    bgApp: '#dfe6ee',
    bgCanvas: '#ffffff',
    bgSurface: '#ffffff',
    bgSurfaceSubtle: '#f1f5f9',
    bgSurfaceHover: '#e2e8f0',
    bgInput: '#ffffff',
    textPrimary: '#000000',
    textSecondary: '#0f172a',
    textMuted: '#334155',
    borderSubtle: '#94a3b8',
    borderInput: '#334155',
    borderStrong: '#334155',
    primaryLight: '#dbeafe',
    success: '#047857',
    warning: '#b45309',
    danger: '#b91c1c',
    successBg: '#d1fae5',
    warningBg: '#fef3c7',
    dangerBg: '#fee2e2',
    successLight: '#d1fae5',
    warningLight: '#fef3c7',
    dangerLight: '#fee2e2',
    infoLight: '#e0f2fe',
    cardShadow: '0 0 0 1.5px #0f172a, 0 10px 24px rgba(15, 23, 42, 0.12)',
  },
};

export const createStyles = (tokens: ThemeTokens, brand: BrandColors) => ({
  card: {
    backgroundColor: tokens.bgSurface,
    borderRadius: RADIUS.xl,
    borderWidth: 1,
    borderStyle: 'solid',
    borderColor: tokens.borderSubtle,
    boxShadow: tokens.cardShadow,
    padding: '16px 18px',
  } as React.CSSProperties,

  subtleBox: {
    backgroundColor: tokens.bgSurfaceSubtle,
    borderRadius: RADIUS.lg,
    borderWidth: 1,
    borderStyle: 'solid',
    borderColor: tokens.borderSubtle,
    padding: '12px 14px',
  } as React.CSSProperties,

  label: {
    display: 'block',
    fontSize: FONTS.size.sm,
    fontWeight: FONTS.weight.bold,
    color: tokens.textSecondary,
    marginBottom: 4,
  } as React.CSSProperties,

  input: {
    width: '100%',
    padding: '8px 12px',
    borderRadius: RADIUS.sm,
    borderWidth: 1,
    borderStyle: 'solid',
    borderColor: tokens.borderStrong,
    backgroundColor: tokens.bgSurface,
    color: tokens.textPrimary,
    fontSize: FONTS.size.base,
    fontFamily: FONTS.sans,
    outline: 'none',
    boxSizing: 'border-box',
  } as React.CSSProperties,

  th: {
    padding: '9px 12px',
    fontSize: FONTS.size.xs,
    fontWeight: FONTS.weight.extrabold,
    color: tokens.textMuted,
    textTransform: 'uppercase',
    letterSpacing: '0.4px',
    backgroundColor: tokens.bgSurfaceSubtle,
    borderBottomWidth: 1,
    borderBottomStyle: 'solid',
    borderBottomColor: tokens.borderSubtle,
  } as React.CSSProperties,

  td: {
    padding: '10px 12px',
    fontSize: FONTS.size.base,
    color: tokens.textPrimary,
    borderBottomWidth: 1,
    borderBottomStyle: 'solid',
    borderBottomColor: tokens.borderSubtle,
    verticalAlign: 'middle',
  } as React.CSSProperties,

  btnSecondary: {
    display: 'inline-flex',
    alignItems: 'center',
    gap: 6,
    padding: '6px 12px',
    borderRadius: RADIUS.md,
    borderWidth: 1,
    borderStyle: 'solid',
    borderColor: tokens.borderStrong,
    backgroundColor: tokens.bgSurfaceSubtle,
    color: tokens.textPrimary,
    fontSize: FONTS.size.sm,
    fontWeight: FONTS.weight.bold,
    cursor: 'pointer',
  } as React.CSSProperties,

  btnPrimary: {
    display: 'inline-flex',
    alignItems: 'center',
    gap: 6,
    padding: '7px 14px',
    borderRadius: RADIUS.md,
    borderWidth: 0,
    borderStyle: 'none',
    borderColor: 'transparent',
    backgroundColor: brand.buttonBg,
    color: '#ffffff',
    fontSize: FONTS.size.sm,
    fontWeight: FONTS.weight.bold,
    cursor: 'pointer',
  } as React.CSSProperties,

  badge: (bg: string, color: string): React.CSSProperties => ({
    display: 'inline-flex',
    alignItems: 'center',
    gap: 4,
    padding: '3px 9px',
    borderRadius: RADIUS.pill,
    fontSize: FONTS.size.xs,
    fontWeight: FONTS.weight.extrabold,
    backgroundColor: bg,
    color,
  }),
});

const SAFE_RASTER_DATA_URI = /^data:image\/(png|jpeg|jpg|webp|gif);base64,/i;

export const isSafeImageUrl = (url?: string | null): boolean => {
  if (!url || typeof url !== 'string') return false;
  const trimmed = url.trim();
  const clean = trimmed.toLowerCase();
  if (!clean || clean === 'null' || clean === 'undefined' || clean === 'none') return false;
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
  return clean.startsWith('http://') || clean.startsWith('https://') || clean.startsWith('blob:');
};

export const sanitizeText = (text: string, maxLength = 150): string => {
  return String(text || '')
    .replace(/[\u0000-\u001F\u007F<>]/g, '')
    .trim()
    .slice(0, maxLength);
};

export const theme = {
  colors: {
    primary: 'var(--brand-button-bg, #004b87)',
    primaryHover: '#003865',
    primaryLight: 'rgba(0, 75, 135, 0.10)',
    secondary: '#0284c7',
    success: 'var(--brand-success, #059669)',
    successLight: 'rgba(16, 185, 129, 0.12)',
    warning: 'var(--brand-warning, #d97706)',
    warningLight: 'rgba(245, 158, 11, 0.12)',
    danger: 'var(--brand-danger, #dc2626)',
    dangerLight: 'rgba(239, 68, 68, 0.12)',
    surface: 'var(--bg-surface, #ffffff)',
    surfaceSubtle: 'var(--bg-surface-subtle, #f8fafc)',
    background: 'var(--bg-app, #eef2f6)',
    textPrimary: 'var(--text-primary, #0f172a)',
    textSecondary: 'var(--text-secondary, #475569)',
    textMuted: 'var(--text-muted, #64748b)',
    textWhite: '#ffffff',
    border: 'var(--border-strong, #cbd5e1)',
    borderLight: 'var(--border-subtle, #e2e8f0)',
  },
  radius: { sm: '6px', md: '8px', lg: '12px', xl: '16px', full: '9999px' },
  shadows: {
    sm: '0 2px 4px rgba(0,0,0,0.06)',
    md: '0 4px 12px rgba(0,0,0,0.08)',
    lg: '0 10px 25px rgba(0,0,0,0.12)',
  },
};