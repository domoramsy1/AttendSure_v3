// D:\AttendSure_V3\mobile\App.tsx

import React, { useEffect, useState, useCallback } from 'react';
import { View, StyleSheet, Platform } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { NavigationContainer } from '@react-navigation/native';
import * as SplashScreen from 'expo-splash-screen';
import { AuthProvider } from './src/context/AuthContext';
import AppNavigator from './src/navigation/AppNavigator';

// Only invoke native splash screen control on mobile devices (Android / iOS)
if (Platform.OS !== 'web') {
  try {
    SplashScreen.preventAutoHideAsync().catch(() => {});
  } catch {
    // Suppress native module initialization errors
  }
}

export default function App() {
  const [appIsReady, setAppIsReady] = useState(false);

  useEffect(() => {
    async function prepare() {
      try {
        await new Promise((resolve) => setTimeout(resolve, 350));
      } catch (e) {
        console.warn('App preparation warning:', e);
      } finally {
        setAppIsReady(true);
      }
    }
    prepare();
  }, []);

  const onLayoutRootView = useCallback(async () => {
    if (appIsReady && Platform.OS !== 'web') {
      try {
        await SplashScreen.hideAsync();
      } catch {
        // Safe fallback if splash screen was already hidden or unavailable
      }
    }
  }, [appIsReady]);

  if (!appIsReady) {
    return null;
  }

  return (
    <SafeAreaProvider>
      <View style={styles.container} onLayout={onLayoutRootView}>
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
  container: {
    flex: 1,
    backgroundColor: '#ffffff',
  },
});