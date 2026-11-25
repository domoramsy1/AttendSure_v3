/**
 * AttendSure - Mobile Server Discovery & URL Security Service
 * File: mobile/src/services/configService.ts
 */

import { Platform } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';

export const SERVER_URL_STORAGE_KEY = 'attendsure_server_base_url';
const CUSTOM_SERVER_URL_KEY = 'attendsure_custom_server_url';
const CACHE_TTL_MS = 15 * 60 * 1000;

const DANGEROUS_SCHEME_RE = /^(javascript|data|file|vbscript|blob|about):/i;
const ANY_SCHEME_RE = /^[a-z][a-z0-9+.-]*:/i;

export const ENDPOINTS = {
  health: '/v1/health/db/',
  auth: {
    login: '/v1/accounts/login/',
    logout: '/v1/accounts/logout/',
    userProfile: '/v1/accounts/me/',
  },
  teachers: {
    list: '/v1/accounts/teachers/',
  },
  classroom: {
    studentList: '/v1/students/',
    classList: '/v1/attendance/classes/',
    scanQr: '/v1/attendance/scan/',
    offlineSync: '/v1/attendance/offline-sync/',
    logs: '/v1/attendance/records/',
  },
  clearance: {
    list: '/v1/attendance/exit-passes/',
  },
  campus: {
    overview: '/v1/campus/overview/',
    ping: '/v1/campus/ping/',
    checkIn: '/v1/campus/check-in/',
    loafing: '/v1/campus/loafing/',
  },
  reports: {
    dtr: '/v1/reports/dtr/',
    sf1: (sectionId: number | string) =>
      `/v1/reports/sf1/${encodeURIComponent(String(sectionId))}/`,
    sf2: (sectionId: number | string) =>
      `/v1/reports/sf2/${encodeURIComponent(String(sectionId))}/`,
    sf4: '/v1/reports/sf4/',
  },
};

function getLoopbackFallback(): string {
  return Platform.OS === 'android' ? 'http://10.0.2.2:8000' : 'http://127.0.0.1:8000';
}

function stripControlChars(value: string): string {
  return value.replace(/[\u0000-\u001F\u007F]/g, '').trim();
}

function normalizeAccidentalExpoUrl(raw: string): string {
  let s = stripControlChars(raw);
  // Fix accidental "http://exp://192.168.x.x:8081:8000" or "exp://192.168.x.x:8081"
  s = s.replace(/^https?:\/\/exp:\/\//i, 'http://').replace(/^exp:\/\//i, 'http://');
  s = s.replace(/:8081:8000$/i, ':8000');
  return s;
}

export function isValidServerUrl(url?: string | null): boolean {
  if (!url || typeof url !== 'string') return false;
  const trimmed = normalizeAccidentalExpoUrl(url);
  if (!trimmed) return false;

  if (DANGEROUS_SCHEME_RE.test(trimmed)) return false;
  if (ANY_SCHEME_RE.test(trimmed) && !/^https?:\/\//i.test(trimmed)) {
    return false;
  }

  try {
    const normalized = /^https?:\/\//i.test(trimmed) ? trimmed : `http://${trimmed}`;
    const parsed = new URL(normalized);
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') return false;
    if (!parsed.hostname || parsed.hostname === 'exp') return false;
    if (parsed.port && (!/^\d+$/.test(parsed.port) || Number(parsed.port) > 65535)) return false;
    return true;
  } catch {
    return false;
  }
}

export function cleanUrl(rawUrl?: string | null): string {
  const fallback = getLoopbackFallback();
  if (!rawUrl || typeof rawUrl !== 'string') {
    return fallback;
  }

  const sanitized = normalizeAccidentalExpoUrl(rawUrl);
  if (!sanitized || DANGEROUS_SCHEME_RE.test(sanitized)) {
    return fallback;
  }
  if (ANY_SCHEME_RE.test(sanitized) && !/^https?:\/\//i.test(sanitized)) {
    return fallback;
  }

  let trimmed = sanitized
    .replace(/\/+$/, '')
    .replace(/\/api(\/v1)?$/i, '')
    .replace(/\/+$/, '');

  if (!/^https?:\/\//i.test(trimmed)) {
    trimmed = `http://${trimmed}`;
  }

  try {
    const parsed = new URL(trimmed);
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
      return fallback;
    }
    if (!parsed.hostname || parsed.hostname === 'exp') {
      return fallback;
    }
    return trimmed;
  } catch {
    return fallback;
  }
}

export const sanitizeUrl = cleanUrl;

export function getMetroHostIp(): string | null {
  try {
    const Constants = require('expo-constants').default;
    const hostUri =
      Constants?.expoConfig?.hostUri ||
      Constants?.manifest2?.extra?.expoGo?.debuggerHost ||
      Constants?.manifest?.debuggerHost ||
      Constants?.linkingUri;

    if (hostUri && typeof hostUri === 'string') {
      const cleaned = hostUri.replace(/^[a-z]+:\/\//i, '');
      const ip = cleaned.split(':')[0].split('/')[0];
      if (
        ip &&
        ip !== 'localhost' &&
        ip !== '127.0.0.1' &&
        !ip.includes('expo.dev') &&
        !ip.includes('expo.app') &&
        !ip.includes('ngrok')
      ) {
        return ip;
      }
    }
  } catch {}
  return null;
}

export function getCandidateServers(): string[] {
  const candidates: string[] = [];
  const isNativeMobile = Platform.OS === 'android' || Platform.OS === 'ios';

  // 1. Live Expo Go Metro Bundler Host IP (always matches laptop's current Wi-Fi IP!)
  const metroIp = getMetroHostIp();
  if (metroIp && isValidServerUrl(`http://${metroIp}:8000`)) {
    candidates.push(cleanUrl(`http://${metroIp}:8000`));
  }

  // 2. Environment variable from mobile/.env
  const envUrl = process.env.EXPO_PUBLIC_API_BASE_URL;
  if (envUrl && isValidServerUrl(envUrl)) {
    const cleanedEnv = cleanUrl(envUrl);
    const isLoopback = cleanedEnv.includes('127.0.0.1') || cleanedEnv.includes('localhost');
    if (!isNativeMobile || !isLoopback) {
      candidates.push(cleanedEnv);
    }
  }

  // 3. Web / Android Emulator loopback fallback
  if (!isNativeMobile) {
    candidates.push('http://127.0.0.1:8000');
  } else if (Platform.OS === 'android') {
    candidates.push('http://10.0.2.2:8000');
  }

  return Array.from(new Set(candidates.filter((u) => Boolean(u && isValidServerUrl(u)))));
}

export function getDefaultBaseUrl(): string {
  return getCandidateServers()[0] || getLoopbackFallback();
}

export const DEFAULT_SERVER_URL = getDefaultBaseUrl();

let cachedUrl: string | null = null;
let lastCacheTime = 0;
let inFlightDiscoveryPromise: Promise<string> | null = null;

export function invalidateServerCache(): void {
  cachedUrl = null;
  lastCacheTime = 0;
  inFlightDiscoveryPromise = null;
}

export function markServerReachable(url?: string | null): void {
  if (url && isValidServerUrl(url)) {
    cachedUrl = cleanUrl(url);
    lastCacheTime = Date.now();
  } else if (cachedUrl) {
    lastCacheTime = Date.now();
  }
}

const LEGACY_STORAGE_PURGE_KEY = 'attendsure_v3_purged_legacy_55555';

export async function purgeLegacySchoolCacheOnce(): Promise<void> {
  try {
    const alreadyPurged = await AsyncStorage.getItem(LEGACY_STORAGE_PURGE_KEY);
    if (alreadyPurged === 'true') return;

    const cachedSchoolRaw = await AsyncStorage.getItem('attendsure_cached_school');
    const cachedProfileRaw = await AsyncStorage.getItem('attendsure_cached_school_profile');
    const combined = `${cachedSchoolRaw || ''} ${cachedProfileRaw || ''}`.toLowerCase();

    if (combined.includes('55555') || combined.includes('lapasan')) {
      await AsyncStorage.multiRemove([
        'attendsure_cached_school',
        'attendsure_cached_school_profile',
        'attendsure_cached_sections',
        'attendsure_cached_dtr',
        'attendsure_cached_geofence',
        'attendsure_offline_queue',
        'attendsure_offline_qr_scans',
        'attendsure_user_profile',
        'attendsure_user',
        'user_token',
        'attendsure_token',
        SERVER_URL_STORAGE_KEY,
        CUSTOM_SERVER_URL_KEY,
      ]);
    }

    // Also clear any broken exp:// URL saved previously in AsyncStorage
    const savedCustom = await AsyncStorage.getItem(CUSTOM_SERVER_URL_KEY);
    if (savedCustom && (savedCustom.includes('exp://') || savedCustom.includes(':8081'))) {
      await AsyncStorage.multiRemove([SERVER_URL_STORAGE_KEY, CUSTOM_SERVER_URL_KEY]);
    }

    await AsyncStorage.setItem(LEGACY_STORAGE_PURGE_KEY, 'true');
  } catch {}
}

async function runServerDiscovery(): Promise<string> {
  await purgeLegacySchoolCacheOnce();

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
    lastCacheTime = Date.now();
    return cachedUrl;
  }

  const probeServer = async (
    targetUrl: string,
    externalController?: AbortController
  ): Promise<string> => {
    const controller = externalController || new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 2800);
    try {
      const res = await fetch(`${targetUrl}/api/v1/health/db/`, {
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

  if (customUrl && isValidServerUrl(customUrl)) {
    const cleanedCustom = cleanUrl(customUrl);
    try {
      const okUrl = await probeServer(cleanedCustom);
      cachedUrl = okUrl;
      lastCacheTime = Date.now();
      return okUrl;
    } catch {
      // Fall through to auto-detected Metro LAN candidates if old custom IP changed
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
    abortAllProbes();
    cachedUrl = fastestUrl;
    lastCacheTime = Date.now();
    AsyncStorage.setItem(SERVER_URL_STORAGE_KEY, fastestUrl).catch(() => {});
    return fastestUrl;
  } catch {
    abortAllProbes();
    const fallback = candidates[0];
    cachedUrl = fallback;
    lastCacheTime = Date.now();
    return fallback;
  }
}

export async function resolveFastestServer(): Promise<string> {
  if (inFlightDiscoveryPromise) {
    return inFlightDiscoveryPromise;
  }
  const discovery = runServerDiscovery().finally(() => {
    if (inFlightDiscoveryPromise === discovery) {
      inFlightDiscoveryPromise = null;
    }
  });
  inFlightDiscoveryPromise = discovery;
  return discovery;
}

export async function getServerBaseUrl(): Promise<string> {
  if (cachedUrl && Date.now() - lastCacheTime < CACHE_TTL_MS) {
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
    const response = await fetch(`${target}/api/v1/health/db/`, {
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
        ? 'Connection timed out. Check Windows Firewall on port 8000.'
        : 'Cannot reach school server. Verify phone & laptop are on the same Wi-Fi.',
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