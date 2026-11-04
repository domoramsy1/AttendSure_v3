/**
 * AttendSure V3 - Institutional Theme Provider (Pure White Theme)
 * File: web/src/context/ThemeContext.tsx
 */

import React, { createContext, useContext, useEffect } from 'react';

export type Theme = 'light';

export interface ThemeTokens {
  bgApp: string;
  bgSurface: string;
  bgSurfaceSubtle: string;
  bgSurfaceHover: string;
  borderSubtle: string;
  borderStrong: string;
  textPrimary: string;
  textSecondary: string;
  textMuted: string;
  cardShadow: string;
  primaryLight: string;
}

export interface BrandColors {
  primary: string;
  primaryHover: string;
  secondary: string;
  success: string;
  warning: string;
  danger: string;
}

interface ThemeContextType {
  resolvedTheme: 'light';
  toggleTheme: () => void;
  tokens: ThemeTokens;
  brand: BrandColors;
}

const BRAND_COLORS: BrandColors = {
  primary: '#004B87',      // Official AttendSure Logo Navy
  primaryHover: '#003865',
  secondary: '#0284C7',
  success: '#10B981',
  warning: '#F59E0B',
  danger: '#EF4444',
};

const PURE_WHITE_TOKENS: ThemeTokens = {
  bgApp: '#F1F5F9',               // Soft outer frame canvas
  bgSurface: '#FFFFFF',           // Crisp white floating cards
  bgSurfaceSubtle: '#F8FAFC',     // Subdued containers and inputs
  bgSurfaceHover: '#F1F5F9',      // Active hover tone
  borderSubtle: '#E2E8F0',        // Clean institutional borders
  borderStrong: '#CBD5E1',
  textPrimary: '#0F172A',         // High contrast slate
  textSecondary: '#475569',
  textMuted: '#94A3B8',
  cardShadow: '0 4px 16px -2px rgba(15, 23, 42, 0.05), 0 2px 6px -2px rgba(15, 23, 42, 0.03)',
  primaryLight: '#EBF3FB',        // Subtle brand blue tint
};

const ThemeContext = createContext<ThemeContextType>({
  resolvedTheme: 'light',
  toggleTheme: () => {},
  tokens: PURE_WHITE_TOKENS,
  brand: BRAND_COLORS,
});

export const ThemeProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  useEffect(() => {
    const root = document.documentElement;

    // Remove any previously saved dark classes or attributes
    root.classList.remove('dark');
    root.setAttribute('data-theme', 'light');
    localStorage.removeItem('attendsure_theme');

    // Lock global CSS variables to pure white institutional colors
    root.style.setProperty('--bg-app', PURE_WHITE_TOKENS.bgApp);
    root.style.setProperty('--bg-surface', PURE_WHITE_TOKENS.bgSurface);
    root.style.setProperty('--bg-surface-subtle', PURE_WHITE_TOKENS.bgSurfaceSubtle);
    root.style.setProperty('--bg-surface-hover', PURE_WHITE_TOKENS.bgSurfaceHover);
    root.style.setProperty('--border-subtle', PURE_WHITE_TOKENS.borderSubtle);
    root.style.setProperty('--border-strong', PURE_WHITE_TOKENS.borderStrong);
    root.style.setProperty('--text-primary', PURE_WHITE_TOKENS.textPrimary);
    root.style.setProperty('--text-secondary', PURE_WHITE_TOKENS.textSecondary);
    root.style.setProperty('--text-muted', PURE_WHITE_TOKENS.textMuted);
    root.style.setProperty('--card-shadow', PURE_WHITE_TOKENS.cardShadow);
    root.style.setProperty('--primary-light', PURE_WHITE_TOKENS.primaryLight);
    root.style.setProperty('--brand-primary', BRAND_COLORS.primary);
    root.style.setProperty('--brand-secondary', BRAND_COLORS.secondary);
    root.style.setProperty('--brand-success', BRAND_COLORS.success);
    root.style.setProperty('--brand-warning', BRAND_COLORS.warning);
    root.style.setProperty('--brand-danger', BRAND_COLORS.danger);
  }, []);

  return (
    <ThemeContext.Provider
      value={{
        resolvedTheme: 'light',
        toggleTheme: () => {},
        tokens: PURE_WHITE_TOKENS,
        brand: BRAND_COLORS,
      }}
    >
      {children}
    </ThemeContext.Provider>
  );
};

export const useTheme = () => useContext(ThemeContext);