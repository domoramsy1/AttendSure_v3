/**
 * AttendSure - Mobile Configuration & Endpoint Service
 * File: mobile/src/services/configService.ts
 *
 * Automatic Multi-Network Connection:
 * 1. Parallel Multi-Server Race: Tests public tunnel and local servers at the same time.
 * 2. Works on Any Network: Automatically uses the tunnel on mobile cellular data and LAN on school Wi-Fi.
 * 3. Sanitized Paths: Strips duplicate /api paths and prevents SSRF protocol injection.
 * 4. Zero Mock Data: Connects directly to the live backend server.
 * 5. Simple English Terms: Clear error messages and connection logs.
 */

import { Platform } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';

export const SERVER_URL_STORAGE_KEY = 'attendsure_server_base_url';
const CACHE_TTL_MS = 2 * 60 * 1000; // 2-minute cache allows quick adaptation when switching networks

// Backend API Endpoints (Normalized without leading /api so buildApiUrl handles it safely)
export const ENDPOINTS = {
  auth: {
    login: '/auth/login/',
    logout: '/auth/logout/',
    userProfile: '/me/',
  },
  classroom: {
    studentList: '/classroom/student_list/',
    classList: '/classroom/class_list/',
    takeAttendance: '/classroom/batch-scan/',
  },
  schoolGate: {
    tap: '/gate/scan/',
    logs: '/gate/logs/',
    verify: '/gate/verify/',
  },
  telemetry: {
    heartbeat: '/geofence/telemetry/',
    geofenceStatus: '/geofence/',
  },
  reports: {
    dtr: '/dtr/',
    sf1: (sectionId: number | string) => `/reports/sf1/${sectionId}/`,
    sf2: (sectionId: number | string) => `/reports/sf2/${sectionId}/`,
    sf4: '/reports/sf4/',
  },
};

// 1. URL Sanitizer: Enforces valid HTTP/HTTPS and strips duplicate /api and trailing slashes
export function cleanUrl(rawUrl?: string | null): string {
  if (!rawUrl || typeof rawUrl !== 'string') {
    return Platform.OS === 'android' ? 'http://10.0.2.2:8000' : 'http://127.0.0.1:8000';
  }
  let trimmed = rawUrl.trim();

  // Strip trailing slashes
  while (trimmed.endsWith('/')) {
    trimmed = trimmed.slice(0, -1);
  }

  // Prevent double /api/api pathing
  if (trimmed.toLowerCase().endsWith('/api')) {
    trimmed = trimmed.slice(0, -4);
  }

  while (trimmed.endsWith('/')) {
    trimmed = trimmed.slice(0, -1);
  }

  if (!/^https?:\/\//i.test(trimmed)) {
    trimmed = `http://${trimmed}`;
  }

  return trimmed;
}

export const sanitizeUrl = cleanUrl;

// 2. Protocol Validation (Guards against SSRF and script injection)
export function isValidServerUrl(url?: string | null): boolean {
  if (!url || typeof url !== 'string') return false;
  const trimmed = url.trim();

  try {
    const parsed = new URL(trimmed.startsWith('http') ? trimmed : `http://${trimmed}`);
    return parsed.protocol === 'http:' || parsed.protocol === 'https:';
  } catch {
    return false;
  }
}

// 3. Dynamically extract the laptop's IP address from Expo Metro
function getMetroHostIp(): string | null {
  try {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const Constants = require('expo-constants').default;
    const hostUri =
      Constants?.expoConfig?.hostUri ||
      Constants?.manifest?.debuggerHost ||
      Constants?.manifest2?.extra?.expoGo?.debuggerHost;

    if (hostUri && typeof hostUri === 'string') {
      const ip = hostUri.split(':')[0];
      if (ip && ip !== 'localhost' && ip !== '127.0.0.1' && !ip.includes('expo.app')) {
        return ip;
      }
    }
  } catch {
    // optional fallback
  }
  return null;
}

// 4. Safely load candidate endpoints from endpoints.json
function loadRootEndpoints(): { active_tunnel_url?: string; lan_servers?: string[]; production_domain?: string } {
  try {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    return require('../../../endpoints.json');
  } catch {
    return {};
  }
}

// 5. Gather all possible candidate servers (Works across cellular data, Wi-Fi, and tunnels)
export function getCandidateServers(): string[] {
  const candidates: string[] = [];
  const rootEndpoints = loadRootEndpoints();

  // Primary: Public Cloudflare Tunnel (works on any mobile network, cellular data, or foreign Wi-Fi)
  if (rootEndpoints.active_tunnel_url) {
    candidates.push(cleanUrl(rootEndpoints.active_tunnel_url));
  }

  // Secondary: Production school domain
  if (rootEndpoints.production_domain) {
    candidates.push(cleanUrl(rootEndpoints.production_domain));
  }

  // Tertiary: Environment variable from mobile/.env
  const envUrl = process.env.EXPO_PUBLIC_API_BASE_URL;
  if (envUrl && typeof envUrl === 'string' && envUrl.trim().length > 0) {
    candidates.push(cleanUrl(envUrl));
  }

  // Quaternary: Dynamic laptop IP address detected through Metro bundler (school Wi-Fi)
  const metroIp = getMetroHostIp();
  if (metroIp) {
    candidates.push(cleanUrl(`http://${metroIp}:8000`));
  }

  // Quaternary: Local Area Network server addresses from endpoints.json
  if (Array.isArray(rootEndpoints.lan_servers)) {
    for (const lan of rootEndpoints.lan_servers) {
      if (lan && typeof lan === 'string') {
        candidates.push(cleanUrl(lan));
      }
    }
  }

  // Emulator fallbacks (last resort)
  if (Platform.OS === 'android') {
    candidates.push('http://10.0.2.2:8000');
  } else {
    candidates.push('http://127.0.0.1:8000');
  }

  return Array.from(new Set(candidates.filter((u) => Boolean(u && isValidServerUrl(u)))));
}

export function getDefaultBaseUrl(): string {
  const candidates = getCandidateServers();
  return candidates[0] || (Platform.OS === 'android' ? 'http://10.0.2.2:8000' : 'http://127.0.0.1:8000');
}

export const DEFAULT_SERVER_URL = getDefaultBaseUrl();

let cachedUrl: string | null = null;
let lastCacheTime = 0;

export function invalidateServerCache(): void {
  cachedUrl = null;
  lastCacheTime = 0;
}

// 6. Fast Parallel Probe: races public and local addresses; fastest responsive connection wins
export async function resolveFastestServer(): Promise<string> {
  const candidates = getCandidateServers();

  if (candidates.length === 0) {
    const fallback = getDefaultBaseUrl();
    cachedUrl = fallback;
    return fallback;
  }

  const probeServer = async (targetUrl: string): Promise<string> => {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 2200); // 2.2s per probe

    try {
      const res = await fetch(`${targetUrl}/api/settings/school/`, {
        method: 'GET',
        headers: { Accept: 'application/json' },
        signal: controller.signal,
      });
      clearTimeout(timeoutId);

      // Status 200, 401, or 403 proves the Django backend is actively listening
      if (res.status >= 200 && res.status < 500) {
        return targetUrl;
      }
      throw new Error(`Probe failed with status ${res.status}`);
    } catch (err) {
      clearTimeout(timeoutId);
      throw err;
    }
  };

  try {
    const fastestUrl = await Promise.any(candidates.map((url) => probeServer(url)));
    cachedUrl = fastestUrl;
    lastCacheTime = Date.now();
    AsyncStorage.setItem(SERVER_URL_STORAGE_KEY, fastestUrl).catch(() => {});
    return fastestUrl;
  } catch {
    // If all concurrent probes fail, fall back to last known or primary candidate
    const stored = await AsyncStorage.getItem(SERVER_URL_STORAGE_KEY).catch(() => null);
    const fallback = (stored && isValidServerUrl(stored)) ? cleanUrl(stored) : candidates[0];
    cachedUrl = fallback;
    return fallback;
  }
}

/**
 * Automatically provides the active server address.
 * Re-probes if the network changed or the cache expired.
 */
export async function getServerBaseUrl(): Promise<string> {
  const now = Date.now();
  if (cachedUrl && now - lastCacheTime < CACHE_TTL_MS) {
    return cachedUrl;
  }

  return resolveFastestServer();
}

export async function setServerBaseUrl(newUrl: string): Promise<boolean> {
  if (!isValidServerUrl(newUrl)) {
    throw new Error('Please enter a valid web address starting with http:// or https://');
  }

  const cleaned = cleanUrl(newUrl);
  try {
    await AsyncStorage.setItem(SERVER_URL_STORAGE_KEY, cleaned);
    cachedUrl = cleaned;
    lastCacheTime = Date.now();
    return true;
  } catch (err) {
    console.error('Failed to save server address:', err);
    return false;
  }
}

export async function resetServerBaseUrl(): Promise<void> {
  try {
    await AsyncStorage.removeItem(SERVER_URL_STORAGE_KEY);
  } catch {}
  cachedUrl = null;
  lastCacheTime = 0;
}

/**
 * Builds a clean, absolute API URL without duplicated slashes or double /api
 */
export async function buildApiUrl(endpoint: string): Promise<string> {
  const base = await getServerBaseUrl();
  const cleanEndpoint = endpoint.startsWith('/') ? endpoint : `/${endpoint}`;
  return `${base}/api${cleanEndpoint}`;
}

export async function testServerConnection(
  testUrl?: string
): Promise<{ ok: boolean; message: string; pingMs: number }> {
  const target = cleanUrl(testUrl || cachedUrl || getDefaultBaseUrl());
  const startTime = Date.now();

  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 3000);

    const response = await fetch(`${target}/api/settings/school/`, {
      method: 'GET',
      headers: { Accept: 'application/json' },
      signal: controller.signal,
    });
    clearTimeout(timeoutId);

    const pingMs = Date.now() - startTime;
    if (response.status >= 200 && response.status < 500) {
      return { ok: true, message: `Connected to school server (${pingMs}ms)`, pingMs };
    }
    return { ok: false, message: `Server replied with status ${response.status}`, pingMs };
  } catch (err: unknown) {
    const pingMs = Date.now() - startTime;
    const isAbort = err && typeof err === 'object' && 'name' in err && err.name === 'AbortError';
    if (isAbort) {
      return { ok: false, message: 'Connection timed out. Checking alternative route...', pingMs };
    }
    return { ok: false, message: 'Cannot reach server. Verify network connection.', pingMs };
  }
}

export default {
  getServerBaseUrl,
  setServerBaseUrl,
  resetServerBaseUrl,
  resolveFastestServer,
  invalidateServerCache,
  testServerConnection,
  buildApiUrl,
  isValidServerUrl,
  cleanUrl,
  sanitizeUrl,
  getDefaultBaseUrl,
  SERVER_URL_STORAGE_KEY,
  DEFAULT_SERVER_URL,
  ENDPOINTS,
};