// mobile/src/services/soundService.ts

import { Vibration, Platform } from 'react-native';

let AudioModule: any = null;
let FileSystemModule: any = null;
let isAudioAvailable = false;

try {
  const expoAv = require('expo-av');
  if (expoAv && expoAv.Audio) {
    AudioModule = expoAv.Audio;
    isAudioAvailable = true;
  }
} catch {
  isAudioAvailable = false;
}

try {
  FileSystemModule = require('expo-file-system');
} catch {
  FileSystemModule = null;
}

let isAudioConfigured = false;

const configureAudio = async () => {
  if (!isAudioAvailable || !AudioModule || isAudioConfigured) return;
  try {
    await AudioModule.setAudioModeAsync({
      playsInSilentModeIOS: true,
      staysActiveInBackground: false,
      shouldDuckAndroid: true,
      playThroughEarpieceAndroid: false, // Forces audio to external speaker
    });
    isAudioConfigured = true;
  } catch {
    // Ignore audio config error
  }
};

// Reliable CDN Fallback Audio for Android MediaPlayer
const SOUND_URLS = {
  success: 'https://actions.google.com/sounds/v1/communication/beep_short.ogg',
  warning: 'https://actions.google.com/sounds/v1/alarms/alarm_clock.ogg',
  error: 'https://actions.google.com/sounds/v1/cartoon/cartoon_boing.ogg',
};

// Base64 WAV buffers for offline local caching
const BASE64_TONES = {
  success:
    'UklGRjQBAABXQVZFZm10IBAAAAABAAEAQB8AAEAfAAABAAgAZGF0YRABAACAgICAgICAgICAgICAf39/f3+AgICAgIB/f39/f4CAgICAgH9/f39/gICAgICAf39/f3+AgICAgIB/f39/f4CAgICAgH9/f39/gICAgICAf39/f3+AgICAgIB/f39/f4CAgICAgH9/f39/gICAgICAf39/f3+AgICAgIB/f39/f4CAgICAgH9/f39/gICAgICA',
  warning:
    'UklGRjQBAABXQVZFZm10IBAAAAABAAEAQB8AAEAfAAABAAgAZGF0YRABAADAwMDAwMDAwMDAwMC/v7+/v8DAwMDAwL+/v7+/wMDAwMDAv7+/v7/AwMDAwMC/v7+/v8DAwMDAwL+/v7+/wMDAwMDAv7+/v7/AwMDAwMC/v7+/v8DAwMDAwL+/v7+/wMDAwMDAv7+/v7/AwMDAwMC/v7+/v8DAwMDAwL+/v7+/wMDAwMDAv7+/v7/AwMDAwMA',
  error:
    'UklGRjQBAABXQVZFZm10IBAAAAABAAEAQB8AAEAfAAABAAgAZGF0YRABAADg4ODg4ODg4ODg4ODg39/f39/g4ODg4ODf39/f3+Dg4ODg4N/f39/f4ODg4ODg39/f39/g4ODg4ODf39/f3+Dg4ODg4N/f39/f4ODg4ODg39/f39/g4ODg4ODf39/f3+Dg4ODg4N/f39/f4ODg4ODg39/f39/g4ODg4ODf39/f3+Dg4ODg4N/f39/f4ODg4ODg',
};

const getPlayableUri = async (type: 'success' | 'warning' | 'error'): Promise<string> => {
  if (FileSystemModule && FileSystemModule.cacheDirectory) {
    try {
      const fileUri = `${FileSystemModule.cacheDirectory}attendsure_${type}.wav`;
      const fileInfo = await FileSystemModule.getInfoAsync(fileUri);
      if (!fileInfo.exists) {
        await FileSystemModule.writeAsStringAsync(fileUri, BASE64_TONES[type], {
          encoding: FileSystemModule.EncodingType.Base64,
        });
      }
      return fileUri;
    } catch {
      // Fallback to URL
    }
  }
  return SOUND_URLS[type];
};

const playSoundSafely = async (
  type: 'success' | 'warning' | 'error',
  vibratePattern: number | number[]
) => {
  // Always trigger vibration as tactile backup
  Vibration.vibrate(vibratePattern);

  if (!isAudioAvailable || !AudioModule) return;

  try {
    await configureAudio();
    const sourceUri = await getPlayableUri(type);
    const { sound } = await AudioModule.Sound.createAsync(
      { uri: sourceUri },
      { shouldPlay: true, volume: 1.0 }
    );
    sound.setOnPlaybackStatusUpdate((status: any) => {
      if (status.isLoaded && status.didJustFinish) {
        sound.unloadAsync();
      }
    });
  } catch (err) {
    console.warn(`[Audio Notice] Sound playback skipped: ${err}`);
  }
};

export const playScanSuccessSound = async () => {
  await playSoundSafely('success', 70);
};

export const playScanWarningSound = async () => {
  await playSoundSafely('warning', [0, 150, 80, 150]);
};

export const playScanErrorSound = async () => {
  await playSoundSafely('error', [0, 200, 100, 200]);
};