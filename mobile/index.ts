// AttendSure Mobile - Application Entry Point
// File: mobile/index.ts

import { Platform } from 'react-native';
import { Buffer } from 'buffer';
import * as ExpoSplashScreen from 'expo-splash-screen';
import { registerRootComponent } from 'expo';
// Register headless background GPS task before React mounts so sleeping wakeups always fire
import './src/services/backgroundLocation';
import App from './App';

if (typeof globalThis !== 'undefined' && !(globalThis as { Buffer?: typeof Buffer }).Buffer) {
  (globalThis as { Buffer?: typeof Buffer }).Buffer = Buffer;
}

if (Platform.OS !== 'web') {
  ExpoSplashScreen.preventAutoHideAsync().catch(() => {});
}

registerRootComponent(App);
