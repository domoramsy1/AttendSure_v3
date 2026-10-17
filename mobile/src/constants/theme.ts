// AttendSure - Official Design Tokens & Theme System
// File: mobile/src/constants/theme.ts

export const COLORS = {
  // Brand Identity (AttendSure Official Blue: #004b87)
  primary: '#004b87',
  primaryDark: '#003460',
  primaryHover: '#003866',
  primaryLight: '#e6f0fa',
  primaryBorder: '#b8d6f0',

  // Accent Blue
  accent: '#0284c7',
  accentLight: '#f0f9ff',

  // Status Colors
  success: '#059669',
  successDark: '#047857',
  successLight: '#ecfdf5',
  warning: '#d97706',
  warningDark: '#b45309',
  warningLight: '#fffbeb',
  danger: '#dc2626',
  dangerDark: '#b91c1c',
  dangerLight: '#fef2f2',
  purple: '#6d28d9',
  purpleLight: '#f5f3ff',

  // Neutral Surfaces & Structural Borders
  background: '#f8fafc',
  surface: '#ffffff',
  surfaceSubtle: '#f1f5f9',
  border: '#e2e8f0',
  borderDark: '#cbd5e1',
  borderStrong: '#94a3b8',

  // Typography Tokens
  text: '#0f172a',
  textPrimary: '#0f172a',
  textSecondary: '#64748b',
  textMuted: '#94a3b8',
  white: '#ffffff',
  black: '#000000',
};

export const SPACING = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 20,
  xxl: 24,
  xxxl: 32,
};

export const BORDER_RADIUS = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 20,
  full: 9999,
};

export const TYPOGRAPHY = {
  sizes: {
    xs: 10,
    sm: 12,
    md: 14,
    lg: 16,
    xl: 18,
    xxl: 22,
    display: 28,
  },
  weights: {
    regular: '400' as const,
    medium: '500' as const,
    semibold: '600' as const,
    bold: '700' as const,
    heavy: '800' as const,
  },
};

// Unified theme object exported for components
export const theme = {
  colors: COLORS,
  spacing: SPACING,
  borderRadius: BORDER_RADIUS,
  radii: BORDER_RADIUS,
  roundness: 14,
  typography: TYPOGRAPHY,
};

export default theme;