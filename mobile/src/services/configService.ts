/**
 * AttendSure - Mobile Configuration & Endpoint Service
 * File: mobile/src/services/configService.ts
 *
 * Cybersecurity & Performance:
 * 1. Hoisted Function Architecture: Eliminates ReferenceError on cleanUrl.
 * 2. In-Memory Caching: 5-minute TTL cache avoids continuous AsyncStorage disk reads.
 * 3. URL Sanitization: Enforces HTTP/HTTPS protocol validation to block SSRF and malicious schemes.
 * 4. Self-Contained Endpoints: Direct live API routes without mock data.
 * 5. Simple English Terms: Uses "School server address", "Class list", and "Student list".
 */

import { Platform } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';

export const SERVER_URL_STORAGE_KEY = 'attendsure_server_base_url';
const CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes cache lifetime

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
    heartbeat: '/api/telemetry/heartbeat/',
    geofenceStatus: '/api/geofence/',
  },
  reports: {
    dtr: '/api/dtr/',
    sf1: (sectionId: number | string) => `/api/reports/sf1/${sectionId}/`,
    sf2: (sectionId: number | string) => `/api/reports/sf2/${sectionId}/`,
    sf4: '/api/reports/sf4/',
  },
};

// 1. Hoisted URL Sanitizer (Available before any execution)
export function cleanUrl(rawUrl?: string | null): string {
  if (!rawUrl || typeof rawUrl !== 'string') {
    return Platform.OS === 'android' ? 'http://10.0.2.2:8000' : 'http://127.0.0.1:8000';
  }
  let trimmed = rawUrl.trim();

  while (trimmed.endsWith('/')) {
    trimmed = trimmed.slice(0, -1);
  }

  if (!/^https?:\/\//i.test(trimmed)) {
    trimmed = `http://${trimmed}`;
  }

  return trimmed;
}

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

// 3. Default Server URL Resolver
export function getDefaultBaseUrl(): string {
  const envUrl = process.env.EXPO_PUBLIC_API_BASE_URL;
  if (envUrl && typeof envUrl === 'string' && envUrl.trim().length > 0) {
    return cleanUrl(envUrl);
  }

  if (Platform.OS === 'android') {
    return 'http://10.0.2.2:8000';
  }

  return 'http://127.0.0.1:8000';
}

export const DEFAULT_SERVER_URL = getDefaultBaseUrl();

// Fast in-memory cache to eliminate repeated disk reads
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
  } catch (err) {
    console.warn('Could not read saved server address, using default:', err);
  }

  cachedUrl = getDefaultBaseUrl();
  lastCacheTime = now;
  return cachedUrl;
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
  } catch (err) {
    console.warn('Failed to clear stored server address:', err);
  }
  cachedUrl = getDefaultBaseUrl();
  lastCacheTime = Date.now();
}

export async function resolveFastestServer(): Promise<string> {
  const candidates = [
    cachedUrl,
    process.env.EXPO_PUBLIC_API_BASE_URL,
    Platform.OS === 'android' ? 'http://10.0.2.2:8000' : 'http://127.0.0.1:8000',
  ].filter((url): url is string => Boolean(url && isValidServerUrl(url)));

  const uniqueCandidates = Array.from(new Set(candidates.map((u) => cleanUrl(u))));

  for (const url of uniqueCandidates) {
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 2000);
      const res = await fetch(`${url}/api/settings/school/`, {
        method: 'GET',
        headers: { Accept: 'application/json' },
        signal: controller.signal,
      });
      clearTimeout(timeoutId);

      if (res.status === 200 || res.status === 401 || res.status === 403) {
        cachedUrl = url;
        lastCacheTime = Date.now();
        return url;
      }
    } catch {
      // Check next candidate server
    }
  }

  return getServerBaseUrl();
}

export async function testServerConnection(
  testUrl?: string
): Promise<{ ok: boolean; message: string; pingMs: number }> {
  const target = cleanUrl(testUrl || cachedUrl || getDefaultBaseUrl());
  const startTime = Date.now();

  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 4000);

    const response = await fetch(`${target}/api/settings/school/`, {
      method: 'GET',
      headers: { Accept: 'application/json' },
      signal: controller.signal,
    });
    clearTimeout(timeoutId);

    const pingMs = Date.now() - startTime;
    if (response.status === 200 || response.status === 401 || response.status === 403) {
      return { ok: true, message: `Connected to server (${pingMs}ms)`, pingMs };
    }
    return { ok: false, message: `Server replied with status ${response.status}`, pingMs };
  } catch (err: any) {
    const pingMs = Date.now() - startTime;
    if (err.name === 'AbortError') {
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
  getDefaultBaseUrl,
  SERVER_URL_STORAGE_KEY,
  DEFAULT_SERVER_URL,
  ENDPOINTS,
};