/**
 * ============================================================================
 * ATTENDSURE  - CENTRAL DESIGN TOKENS, REUSABLE STYLES & SECURITY
 * File: web/src/theme/tokens.ts
 * ============================================================================
 */

import type React from 'react';

export type ThemeMode = 'light' | 'dark' | 'high-contrast';

// 1. CENTRAL FONT FAMILIES & SIZES
export const FONTS = {
  sans: "'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif",
  display: "'Plus Jakarta Sans', 'Inter', sans-serif",
  mono: "ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace",
  size: {
    xs: '0.66rem',
    sm: '0.74rem',
    base: '0.82rem',
    md: '0.94rem',
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

// 2. CENTRAL SPACING & CORNERS
export const RADIUS = {
  sm: 6,
  md: 8,
  lg: 12,
  xl: 16,
  pill: 9999,
};

// 3. CENTRAL BRAND COLORS
export const BRAND_COLORS = {
  light: {
    primary: '#004b87',
    secondary: '#0284c7',
    success: '#059669',
    warning: '#d97706',
    danger: '#dc2626',
  },
  dark: {
    primary: '#38bdf8',
    secondary: '#0284c7',
    success: '#10b981',
    warning: '#f59e0b',
    danger: '#f87171',
  },
  'high-contrast': {
    primary: '#002b4d',
    secondary: '#004b87',
    success: '#047857',
    warning: '#b45309',
    danger: '#b91c1c',
  },
};

// 4. CENTRAL COLOR PALETTES FOR EACH MODE
export interface ThemeTokens {
  bgApp: string;
  bgCanvas: string;
  bgSurface: string;
  bgSurfaceSubtle: string;
  bgSurfaceHover: string;
  textPrimary: string;
  textSecondary: string;
  textMuted: string;
  borderSubtle: string;
  borderStrong: string;
  primaryLight: string;
  successLight: string;
  warningLight: string;
  dangerLight: string;
  infoLight: string;
  cardShadow: string;
}

export const THEME_PALETTES: Record<ThemeMode, ThemeTokens> = {
  light: {
    bgApp: '#f1f5f9',
    bgCanvas: '#f8fafc',
    bgSurface: '#ffffff',
    bgSurfaceSubtle: '#f8fafc',
    bgSurfaceHover: '#f1f5f9',
    textPrimary: '#0f172a',
    textSecondary: '#475569',
    textMuted: '#64748b',
    borderSubtle: '#e2e8f0',
    borderStrong: '#cbd5e1',
    primaryLight: 'rgba(0, 75, 135, 0.10)',
    successLight: 'rgba(16, 185, 129, 0.12)',
    warningLight: 'rgba(245, 158, 11, 0.12)',
    dangerLight: 'rgba(239, 68, 68, 0.12)',
    infoLight: 'rgba(2, 132, 199, 0.12)',
    cardShadow: '0 4px 16px -2px rgba(15, 23, 42, 0.05)',
  },
  dark: {
    bgApp: '#020617',
    bgCanvas: '#0f172a',
    bgSurface: '#1e293b',
    bgSurfaceSubtle: '#0f172a',
    bgSurfaceHover: '#334155',
    textPrimary: '#f8fafc',
    textSecondary: '#cbd5e1',
    textMuted: '#94a3b8',
    borderSubtle: '#334155',
    borderStrong: '#475569',
    primaryLight: 'rgba(56, 189, 248, 0.15)',
    successLight: 'rgba(16, 185, 129, 0.18)',
    warningLight: 'rgba(245, 158, 11, 0.18)',
    dangerLight: 'rgba(248, 113, 113, 0.18)',
    infoLight: 'rgba(56, 189, 248, 0.15)',
    cardShadow: '0 6px 20px -2px rgba(0, 0, 0, 0.45)',
  },
  'high-contrast': {
    bgApp: '#e2e8f0',
    bgCanvas: '#ffffff',
    bgSurface: '#ffffff',
    bgSurfaceSubtle: '#f1f5f9',
    bgSurfaceHover: '#e2e8f0',
    textPrimary: '#000000',
    textSecondary: '#1e293b',
    textMuted: '#334155',
    borderSubtle: '#64748b',
    borderStrong: '#0f172a',
    primaryLight: '#dbeafe',
    successLight: '#d1fae5',
    warningLight: '#fef3c7',
    dangerLight: '#fee2e2',
    infoLight: '#e0f2fe',
    cardShadow: '0 0 0 1px #0f172a',
  },
};

// 5. REUSABLE UI STYLE GENERATOR
export const createStyles = (tokens: ThemeTokens, brand: typeof BRAND_COLORS.light) => ({
  card: {
    backgroundColor: tokens.bgSurface,
    borderRadius: RADIUS.xl,
    border: `1px solid ${tokens.borderSubtle}`,
    boxShadow: tokens.cardShadow,
    padding: '16px 18px',
  } as React.CSSProperties,

  subtleBox: {
    backgroundColor: tokens.bgSurfaceSubtle,
    borderRadius: RADIUS.lg,
    border: `1px solid ${tokens.borderSubtle}`,
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
    border: `1px solid ${tokens.borderStrong}`,
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
    borderBottom: `1px solid ${tokens.borderSubtle}`,
  } as React.CSSProperties,

  td: {
    padding: '10px 12px',
    fontSize: FONTS.size.base,
    color: tokens.textPrimary,
    borderBottom: `1px solid ${tokens.borderSubtle}`,
    verticalAlign: 'middle',
  } as React.CSSProperties,

  btnSecondary: {
    display: 'inline-flex',
    alignItems: 'center',
    gap: 6,
    padding: '6px 12px',
    borderRadius: RADIUS.md,
    border: `1px solid ${tokens.borderStrong}`,
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
    border: 'none',
    backgroundColor: brand.primary,
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

// 6. CENTRAL CYBERSECURITY HELPERS
export const isSafeImageUrl = (url?: string | null): boolean => {
  if (!url || typeof url !== 'string') return false;
  const clean = url.trim().toLowerCase();
  if (!clean || clean === 'null' || clean === 'undefined' || clean === 'none') return false;
  if (clean.startsWith('javascript:') || clean.startsWith('vbscript:')) return false;
  if (clean.startsWith('data:') && !clean.startsWith('data:image/')) return false;
  return (
    clean.startsWith('http://') ||
    clean.startsWith('https://') ||
    clean.startsWith('/') ||
    clean.startsWith('data:image/') ||
    clean.startsWith('blob:')
  );
};

export const sanitizeText = (text: string, maxLength = 150): string => {
  return String(text || '').replace(/[<>]/g, '').trim().slice(0, maxLength);
};

// Backwards-compatible static export for UI primitives (Button.tsx, FormControls.tsx, AuthPage.tsx)
export const theme = {
  colors: {
    primary: 'var(--brand-primary, #004b87)',
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
    background: 'var(--bg-app, #f1f5f9)',
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