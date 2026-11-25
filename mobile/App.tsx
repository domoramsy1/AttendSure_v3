import React, { useMemo, useState } from 'react';
import {
  NavigationContainer,
  DefaultTheme,
  DarkTheme,
  type Theme as NavigationTheme,
} from '@react-navigation/native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { AuthProvider, useAuth } from './src/context/AuthContext';
import { ThemeProvider, useThemeMode } from './src/context/ThemeContext';
import AppNavigator from './src/navigation/AppNavigator';
import SplashScreen from './src/components/SplashScreen';

function AppShell() {
  const [splashDone, setSplashDone] = useState(false);
  const { loading: authLoading } = useAuth();
  const { palette, isDark } = useThemeMode();

  const navigationTheme = useMemo<NavigationTheme>(() => {
    const base = isDark ? DarkTheme : DefaultTheme;
    return {
      ...base,
      colors: {
        ...base.colors,
        primary: palette.primary,
        background: palette.background,
        card: palette.surface,
        text: palette.textPrimary,
        border: palette.border,
        notification: palette.danger,
      },
    };
  }, [isDark, palette]);

  return (
    <NavigationContainer theme={navigationTheme}>
      <AppNavigator hideLoadingSpinner={!splashDone} />
      {!splashDone && (
        <SplashScreen
          loading={authLoading}
          minDurationMs={950}
          maxDurationMs={3500}
          onFinish={() => setSplashDone(true)}
        />
      )}
    </NavigationContainer>
  );
}

export default function App() {
  return (
    <SafeAreaProvider>
      <ThemeProvider>
        <AuthProvider>
          <AppShell />
        </AuthProvider>
      </ThemeProvider>
    </SafeAreaProvider>
  );
}
