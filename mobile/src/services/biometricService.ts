// AttendSure Mobile - On-Device Phone Lock & Asymmetric Ed25519 Signing Service
// File: D:\AttendSure_V3\mobile\src\services\biometricService.ts

/**
 * AttendSure Mobile - Built-In Phone Lock / Biometric & Asymmetric Keypair Service
 *
 * Uses the phone's built-in lock (Fingerprint, Face, PIN, or Pattern) via
 * `expo-local-authentication` to unlock a per-teacher Ed25519 private key stored
 * strictly in `expo-secure-store`. Only the public key, key ID, and per-action
 * digital signature ever leave the phone — zero private keys, raw face photos,
 * or biometric scans are ever sent to the server.
 *
 * File: mobile/src/services/biometricService.ts
 */

import { Platform } from 'react-native';
import { Buffer } from 'buffer';
import type * as LocalAuthenticationType from 'expo-local-authentication';
import type * as SecureStoreType from 'expo-secure-store';
import * as Crypto from 'expo-crypto';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { ed25519 } from '@noble/curves/ed25519.js';
import { sha256 } from '@noble/hashes/sha2.js';
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
  publicKeyHex?: string;
  keyAlgorithm?: 'ED25519';
  signatureHex?: string;
  nonce?: string;
  proofHash?: string;
  timestampMs?: number;
  error?: string;
}

const ED25519_PRIVATE_KEY_PREFIX = 'attendsure_ed25519_priv_';
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

function hexToBytes(hex: string): Uint8Array | null {
  const cleaned = hex.trim().toLowerCase();
  if (cleaned.length !== 64 || !/^[0-9a-f]{64}$/.test(cleaned)) {
    return null;
  }
  const out = new Uint8Array(32);
  for (let i = 0; i < 32; i += 1) {
    out[i] = parseInt(cleaned.slice(i * 2, i * 2 + 2), 16);
  }
  return out;
}

function utf8Bytes(text: string): Uint8Array {
  return Uint8Array.from(Buffer.from(text, 'utf8'));
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

/**
 * Loads or generates a per-teacher 32-byte Ed25519 private key inside SecureStore.
 * The private key never leaves the phone.
 */
async function getOrCreateTeacherEd25519PrivateKey(
  userId: string | number
): Promise<Uint8Array> {
  const storeKey = `${ED25519_PRIVATE_KEY_PREFIX}${sanitizeKeySegment(userId)}`;
  const SecureStore = getSecureStore();

  const existingSecure = SecureStore
    ? await SecureStore.getItemAsync(storeKey).catch(() => null)
    : null;
  if (existingSecure) {
    const decoded = hexToBytes(existingSecure);
    if (decoded) return decoded;
  }

  const existingFallback = await AsyncStorage.getItem(storeKey).catch(() => null);
  if (existingFallback) {
    const decoded = hexToBytes(existingFallback);
    if (decoded) {
      // Upgrade into SecureStore when available
      if (SecureStore) {
        try {
          await SecureStore.setItemAsync(storeKey, existingFallback, {
            keychainAccessible: SecureStore.AFTER_FIRST_UNLOCK_THIS_DEVICE_ONLY,
          });
          await AsyncStorage.removeItem(storeKey).catch(() => {});
        } catch {}
      }
      return decoded;
    }
  }

  const randomSeed = await Crypto.getRandomBytesAsync(32);
  const seedHex = bytesToHex(randomSeed);

  let savedToSecureStore = false;
  if (SecureStore) {
    try {
      await SecureStore.setItemAsync(storeKey, seedHex, {
        keychainAccessible: SecureStore.AFTER_FIRST_UNLOCK_THIS_DEVICE_ONLY,
      });
      savedToSecureStore = true;
    } catch {
      savedToSecureStore = false;
    }
  }
  if (!savedToSecureStore) {
    await AsyncStorage.setItem(storeKey, seedHex).catch(() => {});
  }

  return randomSeed;
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
 * Verifies the teacher using their phone's built-in Fingerprint/Face OR Screen Lock
 * (PIN / Pattern / Password), then signs `userId:deviceId:timestampMs:action[:nonce]`
 * with the phone's SecureStore Ed25519 private key.
 */
export async function verifyTeacherBiometricProof(
  userId: string | number,
  action: CheckInProofAction,
  serverChallengeNonce?: string | null
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

    const [privateKeyBytes, deviceUuid] = await Promise.all([
      getOrCreateTeacherEd25519PrivateKey(userId),
      getOrCreateDeviceUuid(),
    ]);

    const publicKeyBytes = ed25519.getPublicKey(privateKeyBytes);
    const publicKeyHex = bytesToHex(publicKeyBytes);
    const keyId = bytesToHex(sha256(publicKeyBytes));

    const timestampMs = Date.now();
    const cleanUserId = String(userId ?? '').trim();
    const cleanAction = String(action).trim().toUpperCase();
    const cleanNonce = String(serverChallengeNonce || '').trim();

    const messageParts = [cleanUserId, deviceUuid, String(timestampMs), cleanAction];
    if (cleanNonce) {
      messageParts.push(cleanNonce);
    }
    const canonicalMessage = messageParts.join(':');
    const signatureBytes = ed25519.sign(utf8Bytes(canonicalMessage), privateKeyBytes);
    const signatureHex = bytesToHex(signatureBytes);

    return {
      ok: true,
      biometricMethod,
      keyId,
      publicKeyHex,
      keyAlgorithm: 'ED25519',
      signatureHex,
      nonce: cleanNonce || undefined,
      proofHash: signatureHex.slice(0, 64),
      timestampMs,
    };
  } catch {
    return {
      ok: false,
      error: NO_LOCK_SETUP_MESSAGE,
    };
  }
}
