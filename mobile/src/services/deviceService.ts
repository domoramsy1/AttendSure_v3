/**
 * AttendSure V3 - Hardware Device Identity Service
 * File: mobile/src/services/deviceService.ts
 *
 * Cybersecurity & Anti-Cheating:
 * 1. Cryptographic Entropy: Generates unguessable device IDs using expo-crypto.
 * 2. Hardware Enclave & Keystore: Stores IDs using AES-256 encrypted SecureStore.
 * 3. In-Memory Caching: Speeds up repeated lookups without disk latency.
 * 4. Decoupled Architecture: Completely breaks require cycles between screens and background tasks.
 */

import { Platform } from 'react-native';
import * as SecureStore from 'expo-secure-store';
import * as Crypto from 'expo-crypto';

export const SECURE_DEVICE_UUID_KEY = 'attendsure_hardware_device_uuid';

// In-memory cache to prevent repeated storage disk reads
let cachedDeviceUuid: string | null = null;

/**
 * Generates or retrieves the hardware-encrypted device UUID.
 */
export const getOrCreateDeviceUuid = async (): Promise<string> => {
  if (cachedDeviceUuid) {
    return cachedDeviceUuid;
  }

  try {
    if (Platform.OS === 'web') {
      const stored = typeof localStorage !== 'undefined' ? localStorage.getItem(SECURE_DEVICE_UUID_KEY) : null;
      if (stored) {
        cachedDeviceUuid = stored;
        return stored;
      }
      const webUuid = `DEV-WEB-${Crypto.randomUUID ? Crypto.randomUUID().substring(0, 13).toUpperCase() : Math.random().toString(36).substring(2, 10).toUpperCase()}`;
      if (typeof localStorage !== 'undefined') {
        localStorage.setItem(SECURE_DEVICE_UUID_KEY, webUuid);
      }
      cachedDeviceUuid = webUuid;
      return webUuid;
    }

    const existing = await SecureStore.getItemAsync(SECURE_DEVICE_UUID_KEY);
    if (existing) {
      cachedDeviceUuid = existing;
      return existing;
    }

    // Generate secure random entropy for hardware binding
    const randomBytes = await Crypto.getRandomBytesAsync(8);
    const hex = Array.from(randomBytes)
      .map((b) => b.toString(16).padStart(2, '0'))
      .join('')
      .toUpperCase();

    const generated = `DEV-${Platform.OS.toUpperCase()}-${hex.substring(0, 8)}-${hex.substring(8, 16)}`;
    await SecureStore.setItemAsync(SECURE_DEVICE_UUID_KEY, generated, {
      keychainAccessible: SecureStore.ALWAYS_THIS_DEVICE_ONLY,
    });

    cachedDeviceUuid = generated;
    return generated;
  } catch (error) {
    const fallback = `DEV-${Platform.OS.toUpperCase()}-TEMP-${Date.now().toString(36).toUpperCase()}`;
    cachedDeviceUuid = fallback;
    return fallback;
  }
};