/**
 * ============================================================================
 * ATTENDSURE  MOBILE - LIVE THEME CONTEXT (Light, Dark & High-Contrast)
 * File: mobile/src/context/ThemeContext.tsx
 * ============================================================================
 */

import React, { createContext, useContext, useState, useEffect, useMemo } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  PALETTES,
  FONTS,
  SPACING,
  RADIUS,
  createMobileStyles,
  type ThemeMode,
  type ThemePalette,
} from '../constants/theme';

const THEME_STORAGE_KEY = 'attendsure_color_mode';

interface ThemeContextValue {
  mode: ThemeMode;
  isDark: boolean;
  palette: ThemePalette;
  fonts: typeof FONTS;
  spacing: typeof SPACING;
  radius: typeof RADIUS;
  ui: ReturnType<typeof createMobileStyles>;
  setThemeMode: (mode: ThemeMode) => void;
  toggleDarkMode: () => void;
  setDarkMode: (value: boolean) => void;
}

const defaultPalette = PALETTES.light;

const ThemeContext = createContext<ThemeContextValue>({
  mode: 'light',
  isDark: false,
  palette: defaultPalette,
  fonts: FONTS,
  spacing: SPACING,
  radius: RADIUS,
  ui: createMobileStyles(defaultPalette),
  setThemeMode: () => {},
  toggleDarkMode: () => {},
  setDarkMode: () => {},
});

export const ThemeProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [mode, setMode] = useState<ThemeMode>('light');

  useEffect(() => {
    AsyncStorage.getItem(THEME_STORAGE_KEY)
      .then((saved) => {
        if (saved === 'dark' || saved === 'light' || saved === 'high-contrast') {
          setMode(saved);
        }
      })
      .catch(() => {});
  }, []);

  const setThemeMode = (nextMode: ThemeMode) => {
    setMode(nextMode);
    AsyncStorage.setItem(THEME_STORAGE_KEY, nextMode).catch(() => {});
  };

  const setDarkMode = (value: boolean) => setThemeMode(value ? 'dark' : 'light');

  // Cycles: Light -> Dark -> High-Contrast Daylight
  const toggleDarkMode = () => {
    const order: ThemeMode[] = ['light', 'dark', 'high-contrast'];
    const next = order[(order.indexOf(mode) + 1) % order.length];
    setThemeMode(next);
  };

  const palette = PALETTES[mode];
  const ui = useMemo(() => createMobileStyles(palette), [palette]);

  const value = useMemo(
    () => ({
      mode,
      isDark: palette.isDark,
      palette,
      fonts: FONTS,
      spacing: SPACING,
      radius: RADIUS,
      ui,
      setThemeMode,
      toggleDarkMode,
      setDarkMode,
    }),
    [mode, palette, ui]
  );

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
};

export const useThemeMode = () => useContext(ThemeContext);
export type { ThemePalette };