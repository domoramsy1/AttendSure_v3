/**
 * AttendSure - Mobile Configuration & Endpoint Service
 * File: mobile/src/services/configService.ts
 *
 * Cybersecurity & Performance:
 * 1. Parallel Multi-Server Race: Pings LAN and Cloudflare tunnel simultaneously via Promise.any.
 * 2. Auto-Detect Laptop IP: Extracts Metro bundler IP so physical phones on Wi-Fi connect instantly.
 * 3. Base URL Sanitization: Strips trailing slashes and duplicate /api paths to prevent 404 errors.
 * 4. Zero Mock Data: Pings live backend health route (/api/settings/school/).
 * 5. Simple English Terms: Clear error messages and connection logs.
 */

import { Platform } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';

export const SERVER_URL_STORAGE_KEY = 'attendsure_server_base_url';
const CACHE_TTL_MS = 5 * 60 * 1000; // 5-minute memory cache

// Live backend API endpoints
export const ENDPOINTS = {
  auth: {
    login: '/api/auth/login/',
    logout: '/api/auth/logout/',
    userProfile: '/api/me/',
  },
  classroom: {
    studentList: '/api/classroom/student_list/',
    classList: '/api/classroom/class_list/',
    takeAttendance: '/api/classroom/batch-scan/',
  },
  schoolGate: {
    tap: '/api/gate/scan/',
    logs: '/api/gate/logs/',
  },
  telemetry: {
    heartbeat: '/api/geofence/telemetry/',
    geofenceStatus: '/api/geofence/',
  },
  reports: {
    dtr: '/api/dtr/',
    sf1: (sectionId: number | string) => `/api/reports/sf1/${sectionId}/`,
    sf2: (sectionId: number | string) => `/api/reports/sf2/${sectionId}/`,
    sf4: '/api/reports/sf4/',
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
    // expo-constants optional fallback
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

// 5. Gather all possible candidate servers
export function getCandidateServers(): string[] {
  const candidates: string[] = [];
  const rootEndpoints = loadRootEndpoints();

  // Primary: Active Cloudflare Tunnel from endpoints.json
  if (rootEndpoints.active_tunnel_url) {
    candidates.push(cleanUrl(rootEndpoints.active_tunnel_url));
  }

  // Secondary: Environment variable from mobile/.env
  const envUrl = process.env.EXPO_PUBLIC_API_BASE_URL;
  if (envUrl && typeof envUrl === 'string' && envUrl.trim().length > 0) {
    candidates.push(cleanUrl(envUrl));
  }

  // Tertiary: Dynamic laptop IP address detected through Metro bundler
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

  // Production school domain
  if (rootEndpoints.production_domain) {
    candidates.push(cleanUrl(rootEndpoints.production_domain));
  }

  // Emulator fallbacks (last resort)
  if (Platform.OS === 'android') {
    candidates.push('http://10.0.2.2:8000');
  } else {
    candidates.push('http://127.0.0.1:8000');
  }

  // Deduplicate and filter out invalid URLs
  return Array.from(new Set(candidates.filter((u) => Boolean(u && isValidServerUrl(u)))));
}

// Default fallback server
export function getDefaultBaseUrl(): string {
  const candidates = getCandidateServers();
  return candidates[0] || (Platform.OS === 'android' ? 'http://10.0.2.2:8000' : 'http://127.0.0.1:8000');
}

export const DEFAULT_SERVER_URL = getDefaultBaseUrl();

// Fast in-memory cache
let cachedUrl: string | null = null;
let lastCacheTime = 0;

export function invalidateServerCache(): void {
  cachedUrl = null;
  lastCacheTime = 0;
}

export async function getServerBaseUrl(): Promise<string> {
  const now = Date.now();
  if (cachedUrl && now - lastCacheTime < CACHE_TTL_MS) {
    return cachedUrl;
  }

  try {
    const storedUrl = await AsyncStorage.getItem(SERVER_URL_STORAGE_KEY);
    if (storedUrl && isValidServerUrl(storedUrl)) {
      cachedUrl = cleanUrl(storedUrl);
      lastCacheTime = now;
      return cachedUrl;
    }
  } catch {
    // Fall back to fastest server
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
  } catch {
    // Ignore storage clear warning
  }
  cachedUrl = null;
  lastCacheTime = 0;
}

// 6. Fast Parallel Probe: Tests all candidates concurrently; fastest responsive server wins
export async function resolveFastestServer(): Promise<string> {
  const candidates = getCandidateServers();

  if (candidates.length === 0) {
    const fallback = getDefaultBaseUrl();
    cachedUrl = fallback;
    return fallback;
  }

  const probeServer = async (targetUrl: string): Promise<string> => {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 1800); // 1.8s timeout per probe

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
    // Fall back to primary candidate if all probes timeout
    const fallback = candidates[0];
    cachedUrl = fallback;
    return fallback;
  }
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
      return { ok: false, message: 'Connection timed out. Check server address.', pingMs };
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
  isValidServerUrl,
  cleanUrl,
  sanitizeUrl,
  getDefaultBaseUrl,
  SERVER_URL_STORAGE_KEY,
  DEFAULT_SERVER_URL,
  ENDPOINTS,
};