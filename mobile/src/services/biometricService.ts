/**
 * AttendSure Mobile - Built-In Phone Lock / Biometric & Keystore Proof Service
 * Supports both hardware biometrics (Fingerprint / Face) and Android/iOS Screen Lock
 * (PIN, Pattern, or Password) via expo-local-authentication + expo-secure-store + expo-crypto.
 * Zero biometric or passcode data ever leaves the phone's hardware security storage.
 * File: mobile/src/services/biometricService.ts
 */

import { Platform } from 'react-native';
import type * as LocalAuthenticationType from 'expo-local-authentication';
import type * as SecureStoreType from 'expo-secure-store';
import * as Crypto from 'expo-crypto';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { getOrCreateDeviceUuid } from './deviceService';

function getLocalAuth(): typeof LocalAuthenticationType | null {
  try {
    return require('expo-local-authentication') as typeof LocalAuthenticationType;
  } catch {
    return null;
  }
}

function getSecureStore(): typeof SecureStoreType | null {
  try {
    return require('expo-secure-store') as typeof SecureStoreType;
  } catch {
    return null;
  }
}

export type CheckInProofAction = 'TIME_IN' | 'TIME_OUT';

export interface PhoneLockCapability {
  ready: boolean;
  hasBiometric: boolean;
  securityLevel: number;
  modeLabel: string;
  methodCode: 'BIOMETRIC' | 'DEVICE_PIN_OR_PATTERN' | 'NONE' | 'UNSUPPORTED';
  setupMessage: string | null;
}

export interface BiometricProofResult {
  ok: boolean;
  biometricMethod?: 'BIOMETRIC' | 'DEVICE_PIN_OR_PATTERN';
  keyId?: string;
  proofHash?: string;
  timestampMs?: number;
  error?: string;
}

const BIOMETRIC_SECRET_PREFIX = 'attendsure_biometric_secret_';
const NO_LOCK_SETUP_MESSAGE =
  'No screen lock is set on this phone. Please go to your phone Settings -> Lock screen and set a PIN, Pattern, or Fingerprint first.';

function sanitizeKeySegment(userId: string | number): string {
  const cleaned = String(userId ?? 'teacher')
    .trim()
    .replace(/[^A-Za-z0-9._-]/g, '_');
  return cleaned || 'teacher';
}

function bytesToHex(bytes: Uint8Array): string {
  return Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

/**
 * Checks the enrolled phone security level using getEnrolledLevelAsync() so phones
 * without a physical fingerprint sensor (PIN / Pattern / Password only) work seamlessly.
 */
export async function checkPhoneLockCapability(): Promise<PhoneLockCapability> {
  if (Platform.OS === 'web') {
    return {
      ready: false,
      hasBiometric: false,
      securityLevel: 0,
      modeLabel: 'Mobile Phone Required',
      methodCode: 'UNSUPPORTED',
      setupMessage:
        'Teacher Time In / Time Out requires the AttendSure mobile app on a phone with a Screen Lock (PIN, Pattern, or Fingerprint).',
    };
  }

  try {
    const LocalAuthentication = getLocalAuth();
    if (!LocalAuthentication || typeof LocalAuthentication.getEnrolledLevelAsync !== 'function') {
      return {
        ready: false,
        hasBiometric: false,
        securityLevel: 0,
        modeLabel: 'Screen Lock Unavailable',
        methodCode: 'NONE',
        setupMessage: NO_LOCK_SETUP_MESSAGE,
      };
    }

    const securityLevel = await LocalAuthentication.getEnrolledLevelAsync();

    if (securityLevel === LocalAuthentication.SecurityLevel.NONE) {
      return {
        ready: false,
        hasBiometric: false,
        securityLevel,
        modeLabel: 'Screen Lock Not Set',
        methodCode: 'NONE',
        setupMessage: NO_LOCK_SETUP_MESSAGE,
      };
    }

    if (securityLevel >= LocalAuthentication.SecurityLevel.BIOMETRIC_WEAK) {
      return {
        ready: true,
        hasBiometric: true,
        securityLevel,
        modeLabel: 'Fingerprint / Biometric Ready',
        methodCode: 'BIOMETRIC',
        setupMessage: null,
      };
    }

    return {
      ready: true,
      hasBiometric: false,
      securityLevel,
      modeLabel: 'Phone PIN / Pattern Lock Ready',
      methodCode: 'DEVICE_PIN_OR_PATTERN',
      setupMessage: null,
    };
  } catch {
    return {
      ready: false,
      hasBiometric: false,
      securityLevel: 0,
      modeLabel: 'Screen Lock Not Set',
      methodCode: 'NONE',
      setupMessage: NO_LOCK_SETUP_MESSAGE,
    };
  }
}

async function getOrCreateUserBiometricSecret(userId: string | number): Promise<string> {
  const storeKey = `${BIOMETRIC_SECRET_PREFIX}${sanitizeKeySegment(userId)}`;
  const SecureStore = getSecureStore();

  const existingSecure = SecureStore
    ? await SecureStore.getItemAsync(storeKey).catch(() => null)
    : null;
  if (existingSecure && existingSecure.trim().length >= 32) {
    return existingSecure.trim();
  }

  const existingFallback = await AsyncStorage.getItem(storeKey).catch(() => null);
  if (existingFallback && existingFallback.trim().length >= 32) {
    return existingFallback.trim();
  }

  const randomBytes = await Crypto.getRandomBytesAsync(32);
  const newSecret = bytesToHex(randomBytes);

  if (SecureStore) {
    await SecureStore.setItemAsync(storeKey, newSecret, {
      keychainAccessible: SecureStore.AFTER_FIRST_UNLOCK_THIS_DEVICE_ONLY,
    }).catch(() => {});
  } else {
    await AsyncStorage.setItem(storeKey, newSecret).catch(() => {});
  }

  return newSecret;
}

function mapAuthErrorToPlainEnglish(errorCode?: string): string {
  switch (errorCode) {
    case 'user_cancel':
    case 'app_cancel':
    case 'system_cancel':
      return 'Verification was cancelled. Tap the button again when you are ready to verify.';
    case 'not_enrolled':
    case 'passcode_not_set':
      return NO_LOCK_SETUP_MESSAGE;
    case 'lockout':
      return 'Too many failed tries. Unlock your phone and try again.';
    case 'timeout':
      return 'Verification timed out. Tap the button and confirm your phone lock again.';
    default:
      return 'Identity verification did not succeed. Please confirm your phone fingerprint, PIN, or pattern and try again.';
  }
}

/**
 * Verifies the teacher using their phone's built-in Fingerprint/Biometric OR Screen Lock
 * (PIN / Pattern / Password), reads or creates the per-user SecureStore secret, and generates
 * a non-replayable SHA-256 check-in proof.
 */
export async function verifyTeacherBiometricProof(
  userId: string | number,
  action: CheckInProofAction
): Promise<BiometricProofResult> {
  if (Platform.OS === 'web') {
    return {
      ok: false,
      error:
        'Teacher Time In / Time Out requires the AttendSure mobile app on a phone with a Screen Lock (PIN, Pattern, or Fingerprint).',
    };
  }

  try {
    const LocalAuthentication = getLocalAuth();
    if (!LocalAuthentication || typeof LocalAuthentication.getEnrolledLevelAsync !== 'function') {
      return {
        ok: false,
        error: NO_LOCK_SETUP_MESSAGE,
      };
    }

    const securityLevel = await LocalAuthentication.getEnrolledLevelAsync();

    if (securityLevel === LocalAuthentication.SecurityLevel.NONE) {
      return {
        ok: false,
        error: NO_LOCK_SETUP_MESSAGE,
      };
    }

    const biometricMethod: 'BIOMETRIC' | 'DEVICE_PIN_OR_PATTERN' =
      securityLevel >= LocalAuthentication.SecurityLevel.BIOMETRIC_WEAK
        ? 'BIOMETRIC'
        : 'DEVICE_PIN_OR_PATTERN';

    // Omit cancelLabel when disableDeviceFallback is false to stay compatible with Android DEVICE_CREDENTIAL (e.g. Samsung OneUI)
    const authResult = await LocalAuthentication.authenticateAsync({
      promptMessage:
        action === 'TIME_OUT'
          ? 'Verify your identity to Time Out'
          : 'Verify your identity to Time In',
      disableDeviceFallback: false,
    });

    if (!authResult.success) {
      return {
        ok: false,
        error: mapAuthErrorToPlainEnglish(authResult.error),
      };
    }

    const [secret, deviceUuid] = await Promise.all([
      getOrCreateUserBiometricSecret(userId),
      getOrCreateDeviceUuid(),
    ]);

    const timestampMs = Date.now();
    const cleanUserId = String(userId ?? '').trim();
    const keyId = await Crypto.digestStringAsync(
      Crypto.CryptoDigestAlgorithm.SHA256,
      secret
    );
    const proofPayload = `${secret}:${cleanUserId}:${deviceUuid}:${timestampMs}:${action}`;
    const proofHash = await Crypto.digestStringAsync(
      Crypto.CryptoDigestAlgorithm.SHA256,
      proofPayload
    );

    return {
      ok: true,
      biometricMethod,
      keyId,
      proofHash,
      timestampMs,
    };
  } catch {
    return {
      ok: false,
      error: NO_LOCK_SETUP_MESSAGE,
    };
  }
}
