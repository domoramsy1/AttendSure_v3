// AttendSure - Automated Backend Discovery & Security Service
// File: mobile/src/services/configService.ts

import { Platform } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as SecureStore from 'expo-secure-store';

export const SERVER_URL_STORAGE_KEY = 'attendsure_server_base_url';

// ==============================================================================
// 1. CYBERSECURITY WHITELIST & ENDPOINT CANDIDATES
// ==============================================================================

// Strict regex whitelist: Only allows official school domains, Cloudflare tunnels, private LANs, and local emulators
const ALLOWED_HOST_PATTERNS = [
  /^localhost$/,
  /^127\.0\.0\.1$/, /^10\.0\.2\.2$/,                        // Android emulator host loopback
  /^10\.\d{1,3}\.\d{1,3}\.\d{1,3}$/,      // Class A private LAN (e.g. 10.16.115.49)
  /^172\.(1[6-9]|2\d|3[0-1])\.\d{1,3}\.\d{1,3}$/, // Class B private LAN (e.g. 172.20.140.221)
  /^192\.168\.\d{1,3}\.\d{1,3}$/,        // Class C private LAN
  /^[a-zA-Z0-9-]+\.trycloudflare\.com$/,  // Ephemeral secure Cloudflare tunnels
  /^[a-zA-Z0-9-]+\.attendsure\.com\.ph$/, // Production school subdomains
];

// Priority list of network routes tested automatically in parallel
const getCandidateServers = (): string[] => {
  const envUrl = process.env.EXPO_PUBLIC_API_BASE_URL?.trim();
  const candidates: string[] = [];

  // Priority 1: Environment tunnel or live production gateway (works on mobile data and external Wi-Fi)
  if (envUrl) {
    candidates.push(envUrl);
  }
  candidates.push('https://lapasan.attendsure.com.ph');

  // Priority 2: Campus Local Area Network gateways (fastest when connected to school Wi-Fi)
  candidates.push('http://172.20.141.220:8000');
  candidates.push('http://172.20.140.221:8000');
  candidates.push('http://10.16.115.49:8000');

  // Priority 3: Local device loopbacks
  if (Platform.OS === 'android') {
    candidates.push('http://10.0.2.2:8000');
  } else if (Platform.OS === 'web' && typeof window !== 'undefined' && window.location?.hostname) {
    candidates.push(`${window.location.protocol}//${window.location.hostname}:8000`);
  } else {
    candidates.push('http://127.0.0.1:8000');
  }

  return candidates;
};

// In-memory cache to prevent disk reads on every API call
let cachedServerUrl: string | null = null;
let isResolving = false;
let resolvePromise: Promise<string> | null = null;

// ==============================================================================
// 2. URL NORMALIZATION & SECURITY SANITIZATION
// ==============================================================================

/**
 * Normalizes a URL:
 * - Ensures valid http:// or https:// prefix
 * - Strips trailing slashes and accidental /api suffixes
 * - Enforces hostname whitelist to prevent redirection attacks
 */
export const normalizeServerUrl = (rawUrl: string): string => {
  let clean = rawUrl.trim().replace(/\/+$/, '');

  // Strip accidental trailing /api so endpoints like /api/me/ work properly
  if (clean.endsWith('/api')) {
    clean = clean.slice(0, -4).replace(/\/+$/, '');
  }

  if (!clean.startsWith('http://') && !clean.startsWith('https://')) {
    clean = `http://${clean}`;
  }

  try {
    const parsed = new URL(clean);
    const isPermitted = ALLOWED_HOST_PATTERNS.some((pattern) => pattern.test(parsed.hostname));

    if (!isPermitted) {
      console.warn(`[Security] Rejected unwhitelisted server hostname: ${parsed.hostname}`);
      return 'http://127.0.0.1:8000';
    }

    return `${parsed.protocol}//${parsed.host}`;
  } catch {
    return 'http://127.0.0.1:8000';
  }
};

// ==============================================================================
// 3. FASTER DATA FETCHING & AUTOMATIC MULTI-NETWORK FAILOVER
// ==============================================================================

/**
 * Fast network probe: Checks server health using an AbortController with a 2-second timeout.
 */
async function probeServer(url: string, timeoutMs = 2000): Promise<string> {
  const rootUrl = normalizeServerUrl(url);
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(`${rootUrl}/api/settings/school/`, {
      method: 'GET',
      headers: { Accept: 'application/json' },
      signal: controller.signal,
    });
    clearTimeout(timer);

    if (response.ok) {
      return rootUrl;
    }
    throw new Error(`Probe failed with status: ${response.status}`);
  } catch (error) {
    clearTimeout(timer);
    throw error;
  }
}

/**
 * Discovers the fastest healthy backend endpoint automatically across any active network.
 * Executes parallel probes so the fastest network interface wins instantly.
 */
export async function resolveFastestServer(): Promise<string> {
  if (isResolving && resolvePromise) {
    return resolvePromise;
  }

  isResolving = true;
  resolvePromise = (async () => {
    try {
      // 1. Test last-known good server first for fast startup
      const stored = await getStoredUrl();
      if (stored) {
        try {
          const verified = await probeServer(stored, 1500);
          cachedServerUrl = verified;
          return verified;
        } catch {
          // Stored route failed; proceed to parallel network discovery
        }
      }

      // 2. Parallel network race across all candidate endpoints
      const candidates = getCandidateServers();
      const probes = candidates.map((server) => probeServer(server, 2500));

      // Promise.any returns the first successfully responding server
      const fastestHealthyServer = await Promise.any(probes);

      cachedServerUrl = fastestHealthyServer;
      await persistUrl(fastestHealthyServer);
      return fastestHealthyServer;
    } catch {
      // 3. Fallback to default if all probes fail (e.g. completely offline)
      const fallback = normalizeServerUrl(
        process.env.EXPO_PUBLIC_API_BASE_URL || 'http://127.0.0.1:8000'
      );
      cachedServerUrl = fallback;
      return fallback;
    } finally {
      isResolving = false;
      resolvePromise = null;
    }
  })();

  return resolvePromise;
}

// ==============================================================================
// 4. STORAGE & CACHE MANAGEMENT
// ==============================================================================

const getStoredUrl = async (): Promise<string | null> => {
  try {
    const asyncVal = await AsyncStorage.getItem(SERVER_URL_STORAGE_KEY);
    if (asyncVal?.trim()) {
      return normalizeServerUrl(asyncVal);
    }

    if (Platform.OS !== 'web') {
      const secVal = await SecureStore.getItemAsync(SERVER_URL_STORAGE_KEY);
      if (secVal?.trim()) {
        return normalizeServerUrl(secVal);
      }
    }
  } catch {
    // Ignore storage read errors
  }
  return null;
};

const persistUrl = async (url: string): Promise<void> => {
  try {
    await AsyncStorage.setItem(SERVER_URL_STORAGE_KEY, url);
    if (Platform.OS !== 'web') {
      await SecureStore.setItemAsync(SERVER_URL_STORAGE_KEY, url);
    }
  } catch {
    // Ignore storage write errors
  }
};

/**
 * Retrieves the active server URL. Returns cached value immediately if available,
 * or runs automatic background discovery.
 */
export const getServerBaseUrl = async (): Promise<string> => {
  if (cachedServerUrl) {
    return cachedServerUrl;
  }
  return resolveFastestServer();
};

/**
 * Manually update or override backend server URL with security validation.
 */
export const setServerBaseUrl = async (newUrl: string): Promise<string> => {
  const normalized = normalizeServerUrl(newUrl);
  cachedServerUrl = normalized;
  await persistUrl(normalized);
  return normalized;
};

/**
 * Clears the cached server URL so the next request triggers automated re-discovery.
 */
export const invalidateServerCache = (): void => {
  cachedServerUrl = null;
};

/**
 * Resets storage back to default configuration.
 */
export const resetServerBaseUrl = async (): Promise<string> => {
  cachedServerUrl = null;
  try {
    await AsyncStorage.removeItem(SERVER_URL_STORAGE_KEY);
    if (Platform.OS !== 'web') {
      await SecureStore.deleteItemAsync(SERVER_URL_STORAGE_KEY);
    }
  } catch {
    // Ignore cleanup errors
  }
  return resolveFastestServer();
};

// Aliases for compatibility across the codebase
export const DEFAULT_SERVER_URL = normalizeServerUrl(
  process.env.EXPO_PUBLIC_API_BASE_URL || 'http://127.0.0.1:8000'
);
export const getApiBaseUrl = getServerBaseUrl;
export const setApiBaseUrl = setServerBaseUrl;
export const clearServerBaseUrl = resetServerBaseUrl;

export default {
  getServerBaseUrl,
  setServerBaseUrl,
  resetServerBaseUrl,
  resolveFastestServer,
  invalidateServerCache,
  normalizeServerUrl,
  DEFAULT_SERVER_URL,
};