/**
 * AttendSure - Mobile Server Discovery & URL Security Service
 * File: mobile/src/services/configService.ts
 */

import { Platform } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';

export const SERVER_URL_STORAGE_KEY = 'attendsure_server_base_url';
const CACHE_TTL_MS = 2 * 60 * 1000;

export const ENDPOINTS = {
  health: '/health/db/',
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
    heartbeat: '/telemetry/heartbeat/',
    geofenceStatus: '/geofence/',
  },
  reports: {
    dtr: '/dtr/',
    sf1: (sectionId: number | string) => `/reports/sf1/${sectionId}/`,
    sf2: (sectionId: number | string) => `/reports/sf2/${sectionId}/`,
    sf4: '/reports/sf4/',
  },
};

export function cleanUrl(rawUrl?: string | null): string {
  if (!rawUrl || typeof rawUrl !== 'string') {
    return Platform.OS === 'android' ? 'http://10.0.2.2:8000' : 'http://127.0.0.1:8000';
  }
  let trimmed = rawUrl.trim().replace(/\/+$/, '').replace(/\/api$/i, '').replace(/\/+$/, '');
  if (!/^https?:\/\//i.test(trimmed)) {
    trimmed = `http://${trimmed}`;
  }
  return trimmed;
}

export const sanitizeUrl = cleanUrl;

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

function loadRootEndpoints(): { active_tunnel_url?: string; lan_servers?: string[]; production_domain?: string } {
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

  // 1. Local Wi-Fi LAN servers first (fastest direct connection on school Wi-Fi)
  if (Array.isArray(rootEndpoints.lan_servers)) {
    for (const lan of rootEndpoints.lan_servers) {
      if (lan && typeof lan === 'string') {
        candidates.push(cleanUrl(lan));
      }
    }
  }

  // 2. Environment variable from mobile/.env
  const envUrl = process.env.EXPO_PUBLIC_API_BASE_URL;
  if (envUrl && envUrl.trim().length > 0) {
    candidates.push(cleanUrl(envUrl));
  }

  // 3. Dynamic laptop IP from Expo Metro bundler
  const metroIp = getMetroHostIp();
  if (metroIp) {
    candidates.push(cleanUrl(`http://${metroIp}:8000`));
  }

  // 4. Public Cloudflare Tunnel (ignore 127.0.0.1/localhost on physical phones)
  if (rootEndpoints.active_tunnel_url) {
    const tunnel = cleanUrl(rootEndpoints.active_tunnel_url);
    const isLoopback = tunnel.includes('127.0.0.1') || tunnel.includes('localhost');
    if (!isNativeMobile || !isLoopback) {
      candidates.push(tunnel);
    }
  }

  // 5. Production school domain
  if (rootEndpoints.production_domain) {
    candidates.push(cleanUrl(rootEndpoints.production_domain));
  }

  // 6. Web/Emulator fallback only
  if (!isNativeMobile) {
    candidates.push('http://127.0.0.1:8000');
  }

  return Array.from(new Set(candidates.filter((u) => Boolean(u && isValidServerUrl(u)))));
}

export function getDefaultBaseUrl(): string {
  return getCandidateServers()[0] || (Platform.OS === 'android' ? 'http://10.0.2.2:8000' : 'http://127.0.0.1:8000');
}

export const DEFAULT_SERVER_URL = getDefaultBaseUrl();

let cachedUrl: string | null = null;
let lastCacheTime = 0;

export function invalidateServerCache(): void {
  cachedUrl = null;
  lastCacheTime = 0;
}

export async function resolveFastestServer(): Promise<string> {
  const candidates = getCandidateServers();
  if (candidates.length === 0) {
    cachedUrl = getDefaultBaseUrl();
    return cachedUrl;
  }

  const probeServer = async (targetUrl: string): Promise<string> => {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 2200);
    try {
      const res = await fetch(`${targetUrl}/api/health/db/`, {
        method: 'GET',
        headers: { Accept: 'application/json' },
        signal: controller.signal,
      });
      clearTimeout(timeoutId);
      if (res.status >= 200 && res.status < 500) return targetUrl;
      throw new Error(`Status ${res.status}`);
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
    const stored = await AsyncStorage.getItem(SERVER_URL_STORAGE_KEY).catch(() => null);
    const fallback = stored && isValidServerUrl(stored) ? cleanUrl(stored) : candidates[0];
    cachedUrl = fallback;
    return fallback;
  }
}

export async function getServerBaseUrl(): Promise<string> {
  if (cachedUrl && Date.now() - lastCacheTime < CACHE_TTL_MS) {
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
  } catch {
    return false;
  }
}

export async function resetServerBaseUrl(): Promise<void> {
  await AsyncStorage.removeItem(SERVER_URL_STORAGE_KEY).catch(() => {});
  invalidateServerCache();
}

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
    const response = await fetch(`${target}/api/health/db/`, {
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
    return {
      ok: false,
      message: isAbort ? 'Connection timed out. Checking alternative route...' : 'Cannot reach server. Verify network connection.',
      pingMs,
    };
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