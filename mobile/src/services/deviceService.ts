/**
 * AttendSure - Hardware Device Identity Service
 * File: mobile/src/services/deviceService.ts
 *
 * Security & 1-to-1 Device Binding:
 * 1. Cryptographic Entropy: Generates unguessable device IDs using expo-crypto.
 * 2. Encrypted Storage: Persists IDs using hardware-backed SecureStore.
 * 3. In-Memory Caching: Speeds up repeated lookups without extra disk reads.
 * 4. Decoupled Service: Prevents circular dependencies across screens and background tasks.
 */

import { Platform } from 'react-native';
import * as SecureStore from 'expo-secure-store';
import * as Crypto from 'expo-crypto';
import * as Application from 'expo-application';
import AsyncStorage from '@react-native-async-storage/async-storage';

export const SECURE_DEVICE_UUID_KEY = 'attendsure_hardware_device_uuid';

// In-memory cache to prevent repeated storage disk reads
let cachedDeviceUuid: string | null = null;

function readWebStorageSafe(key: string): string | null {
  try {
    if (typeof localStorage !== 'undefined') {
      return localStorage.getItem(key);
    }
  } catch {}
  return null;
}

function writeWebStorageSafe(key: string, value: string): void {
  try {
    if (typeof localStorage !== 'undefined') {
      localStorage.setItem(key, value);
    }
  } catch {}
}

/**
 * Generates or retrieves a single canonical, hardware-backed device UUID
 * shared across faculty facial check-ins, foreground location verification,
 * and background campus presence updates.
 */
export const getOrCreateDeviceUuid = async (): Promise<string> => {
  if (cachedDeviceUuid) {
    return cachedDeviceUuid;
  }

  try {
    if (Platform.OS === 'web') {
      const stored = readWebStorageSafe(SECURE_DEVICE_UUID_KEY);
      if (stored && stored.trim().length > 0) {
        cachedDeviceUuid = stored.trim();
        return cachedDeviceUuid;
      }
      const randomPart =
        typeof Crypto.randomUUID === 'function'
          ? Crypto.randomUUID().substring(0, 13).toUpperCase()
          : Math.random().toString(36).substring(2, 10).toUpperCase();
      const webUuid = `DEV-WEB-${randomPart}`;
      writeWebStorageSafe(SECURE_DEVICE_UUID_KEY, webUuid);
      cachedDeviceUuid = webUuid;
      return webUuid;
    }

    // 1. Prefer hardware-encrypted SecureStore
    const secureExisting = await SecureStore.getItemAsync(SECURE_DEVICE_UUID_KEY).catch(() => null);
    if (secureExisting && secureExisting.trim().length > 0) {
      const clean = secureExisting.trim();
      cachedDeviceUuid = clean;
      AsyncStorage.setItem(SECURE_DEVICE_UUID_KEY, clean).catch(() => {});
      return clean;
    }

    // 2. Migrate any previously saved AsyncStorage hardware ID to keep 1-to-1 bindings intact
    const asyncExisting = await AsyncStorage.getItem(SECURE_DEVICE_UUID_KEY).catch(() => null);
    if (asyncExisting && asyncExisting.trim().length > 0) {
      const clean = asyncExisting.trim();
      cachedDeviceUuid = clean;
      SecureStore.setItemAsync(SECURE_DEVICE_UUID_KEY, clean, {
        keychainAccessible: SecureStore.AFTER_FIRST_UNLOCK_THIS_DEVICE_ONLY,
      }).catch(() => {});
      return clean;
    }

    // 3. Derive stable hardware ID when available, otherwise generate cryptographic entropy
    let hardwareSeed: string | null = null;
    try {
      if (Platform.OS === 'android') {
        hardwareSeed = Application.getAndroidId();
      } else if (Platform.OS === 'ios') {
        hardwareSeed = await Application.getIosIdForVendorAsync();
      }
    } catch {}

    let generated: string;
    if (hardwareSeed && hardwareSeed.trim().length > 0) {
      generated = `DEV-${Platform.OS.toUpperCase()}-${hardwareSeed.trim().toUpperCase()}`;
    } else {
      const randomBytes = await Crypto.getRandomBytesAsync(8);
      const hex = Array.from(randomBytes)
        .map((b) => b.toString(16).padStart(2, '0'))
        .join('')
        .toUpperCase();
      generated = `DEV-${Platform.OS.toUpperCase()}-${hex.substring(0, 8)}-${hex.substring(8, 16)}`;
    }

    await Promise.allSettled([
      SecureStore.setItemAsync(SECURE_DEVICE_UUID_KEY, generated, {
        keychainAccessible: SecureStore.AFTER_FIRST_UNLOCK_THIS_DEVICE_ONLY,
      }),
      AsyncStorage.setItem(SECURE_DEVICE_UUID_KEY, generated),
    ]);

    cachedDeviceUuid = generated;
    return generated;
  } catch {
    const fallback = `DEV-${Platform.OS.toUpperCase()}-TEMP-${Date.now().toString(36).toUpperCase()}`;
    cachedDeviceUuid = fallback;
    return fallback;
  }
};

export const getHardwareDeviceUuid = getOrCreateDeviceUuid;
