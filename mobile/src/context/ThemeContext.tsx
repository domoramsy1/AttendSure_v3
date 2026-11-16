import React, { createContext, useContext, useState, useEffect, useMemo } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';

const THEME_STORAGE_KEY = 'attendsure_color_mode';

export interface ThemePalette {
  isDark: boolean;
  background: string;
  surface: string;
  surfaceSubtle: string;
  headerBg: string;
  headerSurface: string;
  primary: string;
  primarySoft: string;
  textPrimary: string;
  textSecondary: string;
  textMuted: string;
  border: string;
  pastelOrangeBg: string;
  pastelOrangeIcon: string;
  pastelYellowBg: string;
  pastelYellowIcon: string;
  pastelPurpleBg: string;
  pastelPurpleIcon: string;
  pastelBlueBg: string;
  pastelBlueIcon: string;
  pastelGreenBg: string;
  pastelGreenIcon: string;
  pastelPinkBg: string;
  pastelPinkIcon: string;
  dangerBg: string;
  dangerText: string;
}

const LIGHT_PALETTE: ThemePalette = {
  isDark: false,
  background: '#F4F6FB',
  surface: '#FFFFFF',
  surfaceSubtle: '#EEF2FF',
  headerBg: '#3B5BDB',
  headerSurface: 'rgba(255, 255, 255, 0.18)',
  primary: '#3B5BDB',
  primarySoft: '#DBE4FF',
  textPrimary: '#0F172A',
  textSecondary: '#475569',
  textMuted: '#64748B',
  border: '#E2E8F0',
  pastelOrangeBg: '#FFF4E6',
  pastelOrangeIcon: '#EA580C',
  pastelYellowBg: '#FEF9C3',
  pastelYellowIcon: '#CA8A04',
  pastelPurpleBg: '#F3E8FF',
  pastelPurpleIcon: '#7E22CE',
  pastelBlueBg: '#E0F2FE',
  pastelBlueIcon: '#0284C7',
  pastelGreenBg: '#DCFCE7',
  pastelGreenIcon: '#15803D',
  pastelPinkBg: '#FCE7F3',
  pastelPinkIcon: '#BE185D',
  dangerBg: '#FEE2E2',
  dangerText: '#DC2626',
};

const DARK_PALETTE: ThemePalette = {
  isDark: true,
  background: '#0B1120',
  surface: '#1E293B',
  surfaceSubtle: '#1E293B',
  headerBg: '#1E3A8A',
  headerSurface: 'rgba(255, 255, 255, 0.12)',
  primary: '#60A5FA',
  primarySoft: 'rgba(96, 165, 250, 0.18)',
  textPrimary: '#F8FAFC',
  textSecondary: '#CBD5E1',
  textMuted: '#94A3B8',
  border: '#334155',
  pastelOrangeBg: 'rgba(234, 88, 12, 0.16)',
  pastelOrangeIcon: '#FB923C',
  pastelYellowBg: 'rgba(202, 138, 4, 0.16)',
  pastelYellowIcon: '#FACC15',
  pastelPurpleBg: 'rgba(147, 51, 234, 0.18)',
  pastelPurpleIcon: '#C084FC',
  pastelBlueBg: 'rgba(2, 132, 199, 0.18)',
  pastelBlueIcon: '#38BDF8',
  pastelGreenBg: 'rgba(21, 128, 61, 0.18)',
  pastelGreenIcon: '#4ADE80',
  pastelPinkBg: 'rgba(190, 24, 93, 0.18)',
  pastelPinkIcon: '#F472B6',
  dangerBg: 'rgba(220, 38, 38, 0.2)',
  dangerText: '#F87171',
};

interface ThemeContextValue {
  isDark: boolean;
  palette: ThemePalette;
  toggleDarkMode: () => void;
  setDarkMode: (value: boolean) => void;
}

const ThemeContext = createContext<ThemeContextValue>({
  isDark: false,
  palette: LIGHT_PALETTE,
  toggleDarkMode: () => {},
  setDarkMode: () => {},
});

export const ThemeProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [isDark, setIsDark] = useState<boolean>(false);

  useEffect(() => {
    AsyncStorage.getItem(THEME_STORAGE_KEY)
      .then((saved) => {
        if (saved === 'dark') setIsDark(true);
      })
      .catch(() => {});
  }, []);

  const setDarkMode = (value: boolean) => {
    setIsDark(value);
    AsyncStorage.setItem(THEME_STORAGE_KEY, value ? 'dark' : 'light').catch(() => {});
  };

  const toggleDarkMode = () => setDarkMode(!isDark);

  const value = useMemo(
    () => ({
      isDark,
      palette: isDark ? DARK_PALETTE : LIGHT_PALETTE,
      toggleDarkMode,
      setDarkMode,
    }),
    [isDark]
  );

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
};

export const useThemeMode = () => useContext(ThemeContext);