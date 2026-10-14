// mobile/src/services/configService.ts

import { Platform } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as SecureStore from 'expo-secure-store';

export const SERVER_URL_STORAGE_KEY = 'attendsure_server_base_url';

// Dynamically read from .env (EXPO_PUBLIC_API_BASE_URL) or current browser host
const getDynamicDefaultUrl = (): string => {
  const envUrl = process.env.EXPO_PUBLIC_API_BASE_URL;
  if (envUrl && envUrl.trim()) {
    return envUrl.trim().replace(/\/+$/, '');
  }

  if (Platform.OS === 'web' && typeof window !== 'undefined' && window.location?.hostname) {
    return `${window.location.protocol}//${window.location.hostname}:8000/api`;
  }

  return 'http://localhost:8000/api';
};

export const DEFAULT_SERVER_URL = getDynamicDefaultUrl();

// In-memory cache to prevent repeated storage reads on every parallel API call
let cachedServerUrl: string | null = null;

/**
 * Normalizes a server URL so it always starts with http(s):// and has no trailing slash.
 */
const normalizeServerUrl = (rawUrl: string): string => {
  let clean = rawUrl.trim().replace(/\/+$/, '');
  if (!clean.startsWith('http://') && !clean.startsWith('https://')) {
    clean = `http://${clean}`;
  }
  return clean;
};

/**
 * Retrieves the active backend server URL safely across Android, iOS, and Web.
 */
export const getServerBaseUrl = async (): Promise<string> => {
  if (cachedServerUrl) {
    return cachedServerUrl;
  }

  try {
    // 1. Check AsyncStorage first (works on Web, Android, and iOS)
    const asyncStored = await AsyncStorage.getItem(SERVER_URL_STORAGE_KEY);
    if (asyncStored && asyncStored.trim()) {
      cachedServerUrl = normalizeServerUrl(asyncStored);
      return cachedServerUrl;
    }

    // 2. Only call SecureStore on native Android/iOS (never on Web)
    if (Platform.OS !== 'web') {
      const secureStored = await SecureStore.getItemAsync(SERVER_URL_STORAGE_KEY);
      if (secureStored && secureStored.trim()) {
        cachedServerUrl = normalizeServerUrl(secureStored);
        await AsyncStorage.setItem(SERVER_URL_STORAGE_KEY, cachedServerUrl);
        return cachedServerUrl;
      }
    }
  } catch (err) {
    console.warn('Could not read server URL from storage, using default:', err);
  }

  cachedServerUrl = DEFAULT_SERVER_URL;
  return cachedServerUrl;
};

/**
 * Saves a new backend server URL to storage and updates the in-memory cache immediately.
 */
export const setServerBaseUrl = async (newUrl: string): Promise<string> => {
  const normalized = normalizeServerUrl(newUrl);
  cachedServerUrl = normalized;

  try {
    await AsyncStorage.setItem(SERVER_URL_STORAGE_KEY, normalized);
    if (Platform.OS !== 'web') {
      await SecureStore.setItemAsync(SERVER_URL_STORAGE_KEY, normalized);
    }
  } catch (err) {
    console.warn('Could not persist server URL to storage:', err);
  }

  return normalized;
};

/**
 * Resets the stored server URL back to the dynamic .env default.
 */
export const resetServerBaseUrl = async (): Promise<string> => {
  cachedServerUrl = DEFAULT_SERVER_URL;
  try {
    await AsyncStorage.removeItem(SERVER_URL_STORAGE_KEY);
    if (Platform.OS !== 'web') {
      await SecureStore.deleteItemAsync(SERVER_URL_STORAGE_KEY);
    }
  } catch {
    // Ignore cleanup errors
  }
  return DEFAULT_SERVER_URL;
};

// Exports for compatibility across all screens and modals
export const getApiBaseUrl = getServerBaseUrl;
export const setApiBaseUrl = setServerBaseUrl;
export const clearServerBaseUrl = resetServerBaseUrl;

export default {
  getServerBaseUrl,
  setServerBaseUrl,
  resetServerBaseUrl,
  DEFAULT_SERVER_URL,
};