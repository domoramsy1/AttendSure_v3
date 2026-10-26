// D:\AttendSure_V3\mobile\App.tsx

import React, { useEffect, useState } from 'react';
import { View, StyleSheet, Platform } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { NavigationContainer } from '@react-navigation/native';
import * as NativeSplashScreen from 'expo-splash-screen';

import { AuthProvider } from './src/context/AuthContext';
import AppNavigator from './src/navigation/AppNavigator';
import { SplashScreen } from './src/components/SplashScreen';
import { resolveFastestServer } from './src/services/configService';

// Hold native splash screen so the app doesn't flash white before JS runs
if (Platform.OS !== 'web') {
  NativeSplashScreen.preventAutoHideAsync().catch(() => {});
}

export default function App() {
  const [showSplash, setShowSplash] = useState<boolean>(true);

  useEffect(() => {
    // Faster Data Fetching: Pre-warm backend connection while radar animation plays
    resolveFastestServer().catch(() => {});
  }, []);

  const handleSplashFinish = () => {
    setShowSplash(false);
  };

  return (
    <SafeAreaProvider>
      <View style={styles.container}>
        <AuthProvider>
          {showSplash ? (
            <SplashScreen onFinish={handleSplashFinish} />
          ) : (
            <NavigationContainer>
              <AppNavigator />
            </NavigationContainer>
          )}
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