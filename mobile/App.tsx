// D:\AttendSure_V3\mobile\App.tsx

import React, { useEffect, useCallback, useState } from 'react';
import { View, StyleSheet, Platform } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { NavigationContainer } from '@react-navigation/native';
import * as SplashScreen from 'expo-splash-screen';

import { AuthProvider } from './src/context/AuthContext';
import AppNavigator from './src/navigation/AppNavigator';

// 1. Prevent splash auto-hide safely without crashing web or fast-reload sessions
SplashScreen.preventAutoHideAsync().catch(() => {
  /* Ignore failure if splash screen was already handled or running on web */
});

export default function App() {
  const [appIsReady, setAppIsReady] = useState<boolean>(false);

  useEffect(() => {
    let isMounted = true;

    async function initializeSystem() {
      try {
        // Fast startup: No artificial delays or mock waiting.
        // Initialization tasks (such as checking saved tokens) run inside AuthProvider.
      } catch (error) {
        // Log safe message without leaking internal trace details to user screens
        if (__DEV__) {
          console.warn('[Security] Startup preparation failed safely:', error);
        }
      } finally {
        if (isMounted) {
          setAppIsReady(true);
        }
      }
    }

    initializeSystem();

    return () => {
      isMounted = false;
    };
  }, []);

  // 2. Hide the splash screen safely once UI layout rendering is confirmed
  const onLayoutRootView = useCallback(async () => {
    if (appIsReady) {
      try {
        await SplashScreen.hideAsync();
      } catch {
        // Graceful fallback if already hidden
      }
    }
  }, [appIsReady]);

  if (!appIsReady) {
    return null;
  }

  return (
    <SafeAreaProvider>
      <View style={styles.rootContainer} onLayout={onLayoutRootView}>
        <AuthProvider>
          <NavigationContainer>
            <AppNavigator />
          </NavigationContainer>
        </AuthProvider>
      </View>
    </SafeAreaProvider>
  );
}

const styles = StyleSheet.create({
  rootContainer: {
    flex: 1,
    backgroundColor: '#0f172a', // Consistent theme prevent flashing during load
  },
});