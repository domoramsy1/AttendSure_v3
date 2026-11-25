// AttendSure - Mobile API Client with JWT Refresh & Automated Failover
// File: D:\AttendSure_V3\mobile\src\api\client.ts

import axios, { AxiosError, InternalAxiosRequestConfig } from 'axios';
import { Buffer } from 'buffer';
import { Platform } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import type * as SecureStoreType from 'expo-secure-store';
import {
  getServerBaseUrl,
  resolveFastestServer,
  invalidateServerCache,
  markServerReachable,
  cleanUrl,
} from '../services/configService';

let cachedSecureStore: typeof SecureStoreType | null | undefined;
const getSecureStore = (): typeof SecureStoreType | null => {
  if (cachedSecureStore !== undefined) return cachedSecureStore;
  if (Platform.OS === 'web') {
    cachedSecureStore = null;
    return null;
  }
  try {
    cachedSecureStore = require('expo-secure-store') as typeof SecureStoreType;
  } catch {
    cachedSecureStore = null;
  }
  return cachedSecureStore;
};

export const AUTH_TOKEN_KEY = 'attendsure_auth_token';
export const REFRESH_TOKEN_KEY = 'attendsure_refresh_token';
const LEGACY_TOKEN_KEYS = ['user_token', 'attendsure_token'];
const ACCESS_REFRESH_WINDOW_SECONDS = 60;

type AuthExpiredListener = () => void;
const authExpiredListeners = new Set<AuthExpiredListener>();

export function onAuthExpired(listener: AuthExpiredListener): () => void {
  authExpiredListeners.add(listener);
  return () => {
    authExpiredListeners.delete(listener);
  };
}

function notifyAuthExpired(): void {
  authExpiredListeners.forEach((fn) => {
    try {
      fn();
    } catch {}
  });
}

function sanitizeToken(raw: string | null | undefined): string | null {
  if (!raw || typeof raw !== 'string') return null;
  const cleaned = raw.trim().replace(/[\r\n]/g, '');
  return cleaned.length > 0 ? cleaned : null;
}

export function isJwtString(token: string | null | undefined): boolean {
  const clean = sanitizeToken(token);
  return Boolean(clean && clean.split('.').length === 3);
}

export function isJwtExpiringSoon(
  token: string | null | undefined,
  bufferSeconds: number = ACCESS_REFRESH_WINDOW_SECONDS
): boolean {
  const clean = sanitizeToken(token);
  if (!clean) return true;
  const parts = clean.split('.');
  if (parts.length !== 3) return false;
  try {
    const base64 = parts[1].replace(/-/g, '+').replace(/_/g, '/');
    const pad = (4 - (base64.length % 4)) % 4;
    const decoded = Buffer.from(base64 + '='.repeat(pad), 'base64').toString('utf8');
    const payload = JSON.parse(decoded) as { exp?: number };
    if (typeof payload.exp !== 'number') return false;
    const nowSeconds = Math.floor(Date.now() / 1000);
    return payload.exp - nowSeconds <= bufferSeconds;
  } catch {
    return false;
  }
}

async function secureRead(key: string): Promise<string | null> {
  const store = getSecureStore();
  if (store) {
    try {
      const val = await store.getItemAsync(key);
      const clean = sanitizeToken(val);
      if (clean) return clean;
    } catch {}
  }
  try {
    return sanitizeToken(await AsyncStorage.getItem(key));
  } catch {
    return null;
  }
}

async function secureWrite(key: string, value: string): Promise<void> {
  const clean = sanitizeToken(value);
  if (!clean) return;
  const store = getSecureStore();
  let storedInKeychain = false;
  if (store) {
    try {
      await store.setItemAsync(key, clean, {
        keychainAccessible: store.AFTER_FIRST_UNLOCK_THIS_DEVICE_ONLY,
      });
      storedInKeychain = true;
    } catch {
      storedInKeychain = false;
    }
  }
  if (Platform.OS === 'web' || !storedInKeychain) {
    await AsyncStorage.setItem(key, clean).catch(() => {});
  } else {
    // Keep AsyncStorage clean of raw JWTs on native devices when SecureStore succeeded
    await AsyncStorage.removeItem(key).catch(() => {});
  }
}

export async function saveAuthTokens(
  accessToken: string,
  refreshToken?: string | null
): Promise<void> {
  await secureWrite(AUTH_TOKEN_KEY, accessToken);
  if (refreshToken && sanitizeToken(refreshToken)) {
    await secureWrite(REFRESH_TOKEN_KEY, refreshToken);
  }
}

export async function readStoredAccessToken(): Promise<string | null> {
  const primary = await secureRead(AUTH_TOKEN_KEY);
  if (primary) return primary;
  for (const legacyKey of LEGACY_TOKEN_KEYS) {
    const legacy = sanitizeToken(await AsyncStorage.getItem(legacyKey).catch(() => null));
    if (legacy) return legacy;
  }
  return null;
}

export async function readStoredRefreshToken(): Promise<string | null> {
  return secureRead(REFRESH_TOKEN_KEY);
}

export async function clearStoredAuthTokens(): Promise<void> {
  await AsyncStorage.multiRemove([
    AUTH_TOKEN_KEY,
    REFRESH_TOKEN_KEY,
    'user_token',
    'attendsure_token',
    'attendsure_user_profile',
    'attendsure_user',
    'attendsure_role',
    'attendsure_teacher_on_duty',
  ]).catch(() => {});

  const store = getSecureStore();
  if (store) {
    try {
      await store.deleteItemAsync(AUTH_TOKEN_KEY);
    } catch {}
    try {
      await store.deleteItemAsync(REFRESH_TOKEN_KEY);
    } catch {}
  }
}

let inFlightRefreshPromise: Promise<string | null> | null = null;

/**
 * Exchanges the stored JWT refresh token for a fresh JWT access token.
 * Deduplicates concurrent callers so only one refresh request runs at a time.
 */
export async function refreshAccessToken(): Promise<string | null> {
  if (inFlightRefreshPromise) {
    return inFlightRefreshPromise;
  }

  inFlightRefreshPromise = (async () => {
    const refreshToken = await readStoredRefreshToken();
    if (!refreshToken) return null;

    try {
      const baseUrl = cleanUrl(await getServerBaseUrl());
      if (!/^https?:\/\//i.test(baseUrl)) return null;

      const res = await axios.post<{ access?: string; refresh?: string }>(
        `${baseUrl}/api/v1/accounts/token/refresh/`,
        { refresh: refreshToken },
        {
          timeout: 8000,
          headers: {
            'Content-Type': 'application/json',
            Accept: 'application/json',
          },
        }
      );

      const nextAccess = sanitizeToken(res.data?.access);
      const nextRefresh = sanitizeToken(res.data?.refresh) || refreshToken;
      if (!nextAccess) return null;

      await saveAuthTokens(nextAccess, nextRefresh);
      return nextAccess;
    } catch {
      return null;
    } finally {
      inFlightRefreshPromise = null;
    }
  })();

  return inFlightRefreshPromise;
}

/**
 * Returns a valid JWT access token, silently refreshing when expiring soon.
 * Shared by foreground API calls and background campus GPS tasks.
 */
export async function getValidAccessToken(forceRefresh = false): Promise<string | null> {
  const access = await readStoredAccessToken();
  if (!forceRefresh && access && isJwtString(access) && !isJwtExpiringSoon(access)) {
    return access;
  }
  const refreshed = await refreshAccessToken();
  if (refreshed) return refreshed;
  return access;
}

function isSameServerOrigin(requestUrl: string, baseUrl: string): boolean {
  if (!requestUrl.startsWith('http://') && !requestUrl.startsWith('https://')) {
    return true;
  }
  try {
    return new URL(requestUrl).origin === new URL(baseUrl).origin;
  } catch {
    return false;
  }
}

function isAuthLifecyclePath(url: string): boolean {
  const lower = url.toLowerCase();
  return (
    lower.includes('/login') ||
    lower.includes('/logout') ||
    lower.includes('/token/refresh')
  );
}

export const apiClient = axios.create({
  timeout: 8000,
  headers: {
    'Content-Type': 'application/json',
    Accept: 'application/json',
  },
});

apiClient.interceptors.request.use(
  async (config: InternalAxiosRequestConfig) => {
    // 1. Resolve and sanitize base URL (guarantees no trailing slashes or /api)
    const rawBaseUrl = await getServerBaseUrl();
    const resolvedBase = cleanUrl(rawBaseUrl);
    config.baseURL = resolvedBase;

    // 2. Prevent duplicate /api/ prefixes and path traversal
    const requestPath = config.url || '';
    const isAbsoluteUrl = requestPath.startsWith('http://') || requestPath.startsWith('https://');
    if (!isAbsoluteUrl) {
      const sanitized = requestPath
        .replace(/^\/+/, '')
        .replace(/\.\.\//g, '')
        .replace(/^(api\/)+/i, '');
      config.url = `/api/${sanitized}`;
    }

    // 2B. Let Axios / React Native set the multipart boundary automatically for FormData uploads
    if (typeof FormData !== 'undefined' && config.data instanceof FormData && config.headers) {
      delete config.headers['Content-Type'];
    }

    // 3. Attach JWT Bearer token ONLY to requests targeting our own AttendSure server
    const resolvedPath = String(config.url || '');
    if (
      isSameServerOrigin(requestPath, resolvedBase) &&
      !isAuthLifecyclePath(resolvedPath) &&
      config.headers &&
      !config.headers.Authorization
    ) {
      const token = await getValidAccessToken(false);
      if (token && isJwtString(token)) {
        config.headers.Authorization = `Bearer ${token}`;
      }
    }

    return config;
  },
  (error) => Promise.reject(error)
);

apiClient.interceptors.response.use(
  (response) => {
    markServerReachable(response.config?.baseURL);
    return response;
  },
  async (error: AxiosError) => {
    // Never retry or invalidate server cache when a request was intentionally cancelled on unmount
    if (axios.isCancel(error) || error.code === 'ERR_CANCELED') {
      return Promise.reject(error);
    }

    const originalRequest = error.config as
      | (InternalAxiosRequestConfig & {
          _retryCount?: number;
          _authRefreshed?: boolean;
        })
      | undefined;

    // Silent JWT refresh on 401 Unauthorized (except login/logout/refresh endpoints)
    if (error.response?.status === 401 && originalRequest) {
      const reqUrl = String(originalRequest.url || '');
      if (!isAuthLifecyclePath(reqUrl)) {
        if (!originalRequest._authRefreshed) {
          originalRequest._authRefreshed = true;
          const freshAccess = await refreshAccessToken();
          if (freshAccess) {
            originalRequest.headers = originalRequest.headers || {};
            originalRequest.headers.Authorization = `Bearer ${freshAccess}`;
            return apiClient(originalRequest);
          }
        }

        await clearStoredAuthTokens();
        notifyAuthExpired();
      }
      return Promise.reject(error);
    }

    // Automated failover if network times out or drops
    const isNetworkError =
      !error.response ||
      error.code === 'ECONNABORTED' ||
      error.message?.includes('Network Error') ||
      error.message?.includes('timeout');

    if (isNetworkError && originalRequest) {
      originalRequest._retryCount = originalRequest._retryCount || 0;

      if (originalRequest._retryCount < 1) {
        originalRequest._retryCount += 1;
        invalidateServerCache();

        try {
          const newBaseUrl = await resolveFastestServer();
          originalRequest.baseURL = cleanUrl(newBaseUrl);
          return apiClient(originalRequest);
        } catch (discoveryError) {
          return Promise.reject(discoveryError);
        }
      }
    }

    return Promise.reject(error);
  }
);

export default apiClient;
