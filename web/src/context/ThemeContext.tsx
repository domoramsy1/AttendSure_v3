// AttendSure Web - Theme Context
// File: D:\AttendSure_V3\web\src\context\ThemeContext.tsx

/**
 * AttendSure - Theme Context & CSS Variable Engine
 * File: web/src/context/ThemeContext.tsx
 */

import React, { createContext, useContext, useState, useEffect, useMemo, useCallback } from 'react';
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

  const setThemeMode = useCallback((nextMode: ThemeMode) => {
    setMode(nextMode);
    try {
      localStorage.setItem(STORAGE_KEY, nextMode);
    } catch {
      // Ignore storage quota errors
    }
  }, []);

  const toggleTheme = useCallback(() => {
    setMode((prev) => {
      const order: ThemeMode[] = ['light', 'dark', 'high-contrast'];
      const next = order[(order.indexOf(prev) + 1) % order.length];
      try {
        localStorage.setItem(STORAGE_KEY, next);
      } catch {
        // Ignore storage quota errors
      }
      return next;
    });
  }, []);

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
    root.style.setProperty('--bg-input', tokens.bgInput);
    root.style.setProperty('--text-primary', tokens.textPrimary);
    root.style.setProperty('--text-secondary', tokens.textSecondary);
    root.style.setProperty('--text-muted', tokens.textMuted);
    root.style.setProperty('--on-primary', tokens.onPrimary);
    root.style.setProperty('--dark-surface', tokens.darkSurface);
    root.style.setProperty('--dark-text', tokens.darkText);
    root.style.setProperty('--border-subtle', tokens.borderSubtle);
    root.style.setProperty('--border-input', tokens.borderInput);
    root.style.setProperty('--border-strong', tokens.borderStrong);
    root.style.setProperty('--brand-primary', brand.primary);
    root.style.setProperty('--brand-button-bg', brand.buttonBg);
    root.style.setProperty('--brand-success', brand.success);
    root.style.setProperty('--brand-warning', brand.warning);
    root.style.setProperty('--brand-danger', brand.danger);
    root.style.setProperty('--success', tokens.success);
    root.style.setProperty('--warning', tokens.warning);
    root.style.setProperty('--danger', tokens.danger);
    root.style.setProperty('--success-bg', tokens.successBg);
    root.style.setProperty('--warning-bg', tokens.warningBg);
    root.style.setProperty('--danger-bg', tokens.dangerBg);
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
  }, [toggleTheme]);

  const contextValue = useMemo<ThemeContextValue>(
    () => ({ mode, setThemeMode, toggleTheme, tokens, brand, fonts: FONTS, radius: RADIUS, ui }),
    [mode, setThemeMode, toggleTheme, tokens, brand, ui]
  );

  return (
    <ThemeContext.Provider value={contextValue}>
      {children}
    </ThemeContext.Provider>
  );
};

export const useTheme = (): ThemeContextValue => {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error('useTheme must be used inside ThemeProvider');
  return ctx;
};
