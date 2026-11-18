/**
 * ============================================================================
 * ATTENDSURE  - THEME CONTEXT & CSS VARIABLE ENGINE
 * File: web/src/context/ThemeContext.tsx
 *
 * PURPOSE:
 * Controls Light, Dark, and High-Contrast Daylight modes across the entire app.
 * Automatically updates CSS variables (--bg-surface, --text-primary, etc.)
 * and provides ready-made `ui` styles to every component.
 * ============================================================================
 */

import React, { createContext, useContext, useState, useEffect, useMemo } from 'react';
import {
  THEME_PALETTES,
  BRAND_COLORS,
  FONTS,
  RADIUS,
  createStyles,
  type ThemeMode,
  type ThemeTokens,
} from '../theme/tokens';

interface ThemeContextValue {
  mode: ThemeMode;
  setThemeMode: (mode: ThemeMode) => void;
  toggleTheme: () => void;
  tokens: ThemeTokens;
  brand: typeof BRAND_COLORS.light;
  fonts: typeof FONTS;
  radius: typeof RADIUS;
  ui: ReturnType<typeof createStyles>;
}

const ThemeContext = createContext<ThemeContextValue | undefined>(undefined);
const STORAGE_KEY = 'attendsure_theme_mode';

export const ThemeProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [mode, setMode] = useState<ThemeMode>(() => {
    const saved = localStorage.getItem(STORAGE_KEY) as ThemeMode;
    return saved && THEME_PALETTES[saved] ? saved : 'light';
  });

  const setThemeMode = (nextMode: ThemeMode) => {
    setMode(nextMode);
    localStorage.setItem(STORAGE_KEY, nextMode);
  };

  const toggleTheme = () => {
    const order: ThemeMode[] = ['light', 'dark', 'high-contrast'];
    const next = order[(order.indexOf(mode) + 1) % order.length];
    setThemeMode(next);
  };

  const tokens = THEME_PALETTES[mode];
  const brand = BRAND_COLORS[mode];
  const ui = useMemo(() => createStyles(tokens, brand), [tokens, brand]);

  // Sync CSS variables onto <html> so CSS files and common components automatically change color
  useEffect(() => {
    const root = document.documentElement;
    root.setAttribute('data-theme', mode);
    root.style.setProperty('--bg-app', tokens.bgApp);
    root.style.setProperty('--bg-canvas', tokens.bgCanvas);
    root.style.setProperty('--bg-surface', tokens.bgSurface);
    root.style.setProperty('--bg-surface-subtle', tokens.bgSurfaceSubtle);
    root.style.setProperty('--text-primary', tokens.textPrimary);
    root.style.setProperty('--text-secondary', tokens.textSecondary);
    root.style.setProperty('--text-muted', tokens.textMuted);
    root.style.setProperty('--border-subtle', tokens.borderSubtle);
    root.style.setProperty('--border-strong', tokens.borderStrong);
    root.style.setProperty('--brand-primary', brand.primary);
    root.style.setProperty('--brand-success', brand.success);
    root.style.setProperty('--brand-warning', brand.warning);
    root.style.setProperty('--brand-danger', brand.danger);
    root.style.setProperty('--card-shadow', tokens.cardShadow);
    root.style.setProperty('--font-sans', FONTS.sans);
  }, [mode, tokens, brand]);

  // Keyboard shortcut: Alt + T cycles color themes
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.altKey && e.key.toLowerCase() === 't') {
        e.preventDefault();
        toggleTheme();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [mode]);

  return (
    <ThemeContext.Provider
      value={{ mode, setThemeMode, toggleTheme, tokens, brand, fonts: FONTS, radius: RADIUS, ui }}
    >
      {children}
    </ThemeContext.Provider>
  );
};

export const useTheme = (): ThemeContextValue => {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error('useTheme must be used inside ThemeProvider');
  return ctx;
};