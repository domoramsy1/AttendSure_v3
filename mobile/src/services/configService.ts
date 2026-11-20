/**
 * AttendSure - Mobile Server Discovery & URL Security Service
 * File: mobile/src/services/configService.ts
 */

import { Platform } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';

export const SERVER_URL_STORAGE_KEY = 'attendsure_server_base_url';
const CUSTOM_SERVER_URL_KEY = 'attendsure_custom_server_url';
const CACHE_TTL_MS = 2 * 60 * 1000;

const DANGEROUS_SCHEME_RE = /^(javascript|data|file|vbscript|blob|about):/i;
const ANY_SCHEME_RE = /^[a-z][a-z0-9+.-]*:/i;

export const ENDPOINTS = {
  health: '/health/db/',
  auth: {
    login: '/auth/login/',
    logout: '/auth/logout/',
    userProfile: '/me/',
  },
  faculty: {
    list: '/v1/accounts/faculty/',
  },
  classroom: {
    studentList: '/students/',
    classList: '/classroom/assigned/',
    takeAttendance: '/classroom/batch-scan/',
    logs: '/classroom/logs/',
  },
  clearance: {
    list: '/gate-passes/',
  },
  telemetry: {
    heartbeat: '/geofence/check-in/',
    geofenceStatus: '/geofence/status/',
  },
  reports: {
    dtr: '/dtr/',
    sf1: (sectionId: number | string) =>
      `/reports/sf1/?section_id=${encodeURIComponent(String(sectionId))}`,
    sf2: (sectionId: number | string) =>
      `/reports/sf2/?section_id=${encodeURIComponent(String(sectionId))}`,
    sf4: '/reports/sf4/',
  },
};

function getLoopbackFallback(): string {
  return Platform.OS === 'android' ? 'http://10.0.2.2:8000' : 'http://127.0.0.1:8000';
}

function stripControlChars(value: string): string {
  return value.replace(/[\u0000-\u001F\u007F]/g, '').trim();
}

export function isValidServerUrl(url?: string | null): boolean {
  if (!url || typeof url !== 'string') return false;
  const trimmed = stripControlChars(url);
  if (!trimmed) return false;

  // Reject dangerous or non-HTTP(S) schemes BEFORE normalizing or prepending http://
  if (DANGEROUS_SCHEME_RE.test(trimmed)) return false;
  if (ANY_SCHEME_RE.test(trimmed) && !/^https?:\/\//i.test(trimmed)) {
    return false;
  }

  try {
    const normalized = /^https?:\/\//i.test(trimmed) ? trimmed : `http://${trimmed}`;
    const parsed = new URL(normalized);
    return (
      (parsed.protocol === 'http:' || parsed.protocol === 'https:') &&
      Boolean(parsed.hostname)
    );
  } catch {
    return false;
  }
}

export function cleanUrl(rawUrl?: string | null): string {
  const fallback = getLoopbackFallback();
  if (!rawUrl || typeof rawUrl !== 'string') {
    return fallback;
  }

  const sanitized = stripControlChars(rawUrl);
  if (!sanitized || DANGEROUS_SCHEME_RE.test(sanitized)) {
    return fallback;
  }
  if (ANY_SCHEME_RE.test(sanitized) && !/^https?:\/\//i.test(sanitized)) {
    return fallback;
  }

  let trimmed = sanitized
    .replace(/\/+$/, '')
    .replace(/\/api$/i, '')
    .replace(/\/+$/, '');

  if (!/^https?:\/\//i.test(trimmed)) {
    trimmed = `http://${trimmed}`;
  }

  try {
    const parsed = new URL(trimmed);
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
      return fallback;
    }
    if (!parsed.hostname) {
      return fallback;
    }
    return trimmed;
  } catch {
    return fallback;
  }
}

export const sanitizeUrl = cleanUrl;

function getMetroHostIp(): string | null {
  try {
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
  } catch {}
  return null;
}

function loadRootEndpoints(): {
  active_tunnel_url?: string;
  lan_servers?: string[];
  production_domain?: string;
} {
  try {
    return require('../../../endpoints.json');
  } catch {
    return {};
  }
}

export function getCandidateServers(): string[] {
  const candidates: string[] = [];
  const rootEndpoints = loadRootEndpoints();
  const isNativeMobile = Platform.OS === 'android' || Platform.OS === 'ios';

  // 1. Local school Wi-Fi servers first (fastest direct route on campus)
  if (Array.isArray(rootEndpoints.lan_servers)) {
    for (const lan of rootEndpoints.lan_servers) {
      if (lan && typeof lan === 'string' && isValidServerUrl(lan)) {
        candidates.push(cleanUrl(lan));
      }
    }
  }

  // 2. Environment variable from mobile/.env
  const envUrl = process.env.EXPO_PUBLIC_API_BASE_URL;
  if (envUrl && isValidServerUrl(envUrl)) {
    candidates.push(cleanUrl(envUrl));
  }

  // 3. Dynamic host IP from Expo Metro bundler during local development
  const metroIp = getMetroHostIp();
  if (metroIp && isValidServerUrl(`http://${metroIp}:8000`)) {
    candidates.push(cleanUrl(`http://${metroIp}:8000`));
  }

  // 4. Configured tunnel URL (skip loopback addresses on physical phones)
  if (rootEndpoints.active_tunnel_url && isValidServerUrl(rootEndpoints.active_tunnel_url)) {
    const tunnel = cleanUrl(rootEndpoints.active_tunnel_url);
    const isLoopback = tunnel.includes('127.0.0.1') || tunnel.includes('localhost');
    if (!isNativeMobile || !isLoopback) {
      candidates.push(tunnel);
    }
  }

  // 5. Production school domain
  if (rootEndpoints.production_domain && isValidServerUrl(rootEndpoints.production_domain)) {
    candidates.push(cleanUrl(rootEndpoints.production_domain));
  }

  // 6. Web / Emulator loopback fallback only
  if (!isNativeMobile) {
    candidates.push('http://127.0.0.1:8000');
  }

  return Array.from(new Set(candidates.filter((u) => Boolean(u && isValidServerUrl(u)))));
}

export function getDefaultBaseUrl(): string {
  return getCandidateServers()[0] || getLoopbackFallback();
}

export const DEFAULT_SERVER_URL = getDefaultBaseUrl();

let cachedUrl: string | null = null;
let lastCacheTime = 0;

export function invalidateServerCache(): void {
  cachedUrl = null;
  lastCacheTime = 0;
}

export async function resolveFastestServer(): Promise<string> {
  // Always honor an explicitly configured server URL first
  const customUrl = await AsyncStorage.getItem(CUSTOM_SERVER_URL_KEY).catch(() => null);
  const candidates = getCandidateServers();
  if (customUrl && isValidServerUrl(customUrl)) {
    const cleanedCustom = cleanUrl(customUrl);
    if (!candidates.includes(cleanedCustom)) {
      candidates.unshift(cleanedCustom);
    }
  }

  if (candidates.length === 0) {
    cachedUrl = getDefaultBaseUrl();
    return cachedUrl;
  }

  const probeServer = async (
    targetUrl: string,
    externalController?: AbortController
  ): Promise<string> => {
    const controller = externalController || new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 2200);
    try {
      const res = await fetch(`${targetUrl}/api/health/db/`, {
        method: 'GET',
        headers: { Accept: 'application/json' },
        signal: controller.signal,
      });
      if (res.status >= 200 && res.status < 400) return targetUrl;
      throw new Error(`Status ${res.status}`);
    } finally {
      clearTimeout(timeoutId);
    }
  };

  // If user manually set a custom server, try it first before failing over
  if (customUrl && isValidServerUrl(customUrl)) {
    const cleanedCustom = cleanUrl(customUrl);
    try {
      const okUrl = await probeServer(cleanedCustom);
      cachedUrl = okUrl;
      lastCacheTime = Date.now();
      return okUrl;
    } catch {
      // Fall through to race remaining candidates if custom URL is temporarily unreachable
    }
  }

  const activeControllers: AbortController[] = [];
  const abortAllProbes = () => {
    activeControllers.forEach((ctrl) => {
      try {
        ctrl.abort();
      } catch {}
    });
  };

  try {
    const fastestUrl = await Promise.any(
      candidates.map((url) => {
        const ctrl = new AbortController();
        activeControllers.push(ctrl);
        return probeServer(url, ctrl);
      })
    );
    // Cancel all losing probes immediately after the fastest responds
    abortAllProbes();
    cachedUrl = fastestUrl;
    lastCacheTime = Date.now();
    AsyncStorage.setItem(SERVER_URL_STORAGE_KEY, fastestUrl).catch(() => {});
    return fastestUrl;
  } catch {
    abortAllProbes();
    const stored =
      customUrl || (await AsyncStorage.getItem(SERVER_URL_STORAGE_KEY).catch(() => null));
    const fallback = stored && isValidServerUrl(stored) ? cleanUrl(stored) : candidates[0];
    cachedUrl = fallback;
    return fallback;
  }
}

export async function getServerBaseUrl(): Promise<string> {
  if (cachedUrl && Date.now() - lastCacheTime < CACHE_TTL_MS) {
    return cachedUrl;
  }
  const customUrl = await AsyncStorage.getItem(CUSTOM_SERVER_URL_KEY).catch(() => null);
  if (customUrl && isValidServerUrl(customUrl)) {
    cachedUrl = cleanUrl(customUrl);
    lastCacheTime = Date.now();
    return cachedUrl;
  }
  return resolveFastestServer();
}

export async function setServerBaseUrl(newUrl: string): Promise<boolean> {
  if (!isValidServerUrl(newUrl)) {
    throw new Error('Please enter a valid web address starting with http:// or https://.');
  }
  const cleaned = cleanUrl(newUrl);
  try {
    await AsyncStorage.multiSet([
      [SERVER_URL_STORAGE_KEY, cleaned],
      [CUSTOM_SERVER_URL_KEY, cleaned],
    ]);
    cachedUrl = cleaned;
    lastCacheTime = Date.now();
    return true;
  } catch {
    return false;
  }
}

export async function resetServerBaseUrl(): Promise<void> {
  await AsyncStorage.multiRemove([SERVER_URL_STORAGE_KEY, CUSTOM_SERVER_URL_KEY]).catch(
    () => {}
  );
  invalidateServerCache();
}

export async function buildApiUrl(endpoint: string): Promise<string> {
  const base = await getServerBaseUrl();
  const safePath = stripControlChars(endpoint).replace(/\.\.\//g, '');
  const cleanEndpoint = safePath.startsWith('/') ? safePath : `/${safePath}`;
  return `${base}/api${cleanEndpoint}`;
}

export async function testServerConnection(
  testUrl?: string
): Promise<{ ok: boolean; message: string; pingMs: number }> {
  if (testUrl !== undefined && !isValidServerUrl(testUrl)) {
    return {
      ok: false,
      message: 'Please enter a valid school server web address starting with http:// or https://.',
      pingMs: 0,
    };
  }

  const target = cleanUrl(testUrl || cachedUrl || getDefaultBaseUrl());
  const startTime = Date.now();
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 3000);

  try {
    const response = await fetch(`${target}/api/health/db/`, {
      method: 'GET',
      headers: { Accept: 'application/json' },
      signal: controller.signal,
    });

    const pingMs = Date.now() - startTime;
    if (response.status >= 200 && response.status < 400) {
      return { ok: true, message: `Connected to school server (${pingMs}ms)`, pingMs };
    }
    return { ok: false, message: `Server replied with status ${response.status}`, pingMs };
  } catch (err: unknown) {
    const pingMs = Date.now() - startTime;
    const isAbort =
      err !== null &&
      typeof err === 'object' &&
      'name' in err &&
      (err as { name?: string }).name === 'AbortError';
    return {
      ok: false,
      message: isAbort
        ? 'Connection timed out. Checking alternative route...'
        : 'Cannot reach school server. Verify your network connection.',
      pingMs,
    };
  } finally {
    clearTimeout(timeoutId);
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
