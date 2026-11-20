// AttendSure - Mobile API Client with Automated Failover
// File: mobile/src/api/client.ts

import axios, { AxiosError, InternalAxiosRequestConfig } from 'axios';
import { Platform } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as SecureStore from 'expo-secure-store';
import {
  getServerBaseUrl,
  resolveFastestServer,
  invalidateServerCache,
  cleanUrl,
} from '../services/configService';

export const AUTH_TOKEN_KEY = 'attendsure_auth_token';
const LEGACY_TOKEN_KEYS = ['user_token', 'attendsure_token'];

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

async function readStoredAuthToken(): Promise<string | null> {
  if (Platform.OS !== 'web') {
    try {
      const secureToken = await SecureStore.getItemAsync(AUTH_TOKEN_KEY);
      if (secureToken) return secureToken;
    } catch {}
  }

  let token = await AsyncStorage.getItem(AUTH_TOKEN_KEY);
  if (!token) {
    for (const legacyKey of LEGACY_TOKEN_KEYS) {
      const legacyToken = await AsyncStorage.getItem(legacyKey);
      if (legacyToken) {
        token = legacyToken;
        break;
      }
    }
  }
  return token;
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

    // 3. Attach auth token ONLY to requests targeting our own AttendSure server
    if (isSameServerOrigin(requestPath, resolvedBase) && config.headers && !config.headers.Authorization) {
      const token = await readStoredAuthToken();
      if (token) {
        const sanitizedToken = token.trim().replace(/[\r\n]/g, '');
        config.headers.Authorization = `Token ${sanitizedToken}`;
      }
    }

    return config;
  },
  (error) => Promise.reject(error)
);

apiClient.interceptors.response.use(
  (response) => response,
  async (error: AxiosError) => {
    // Never retry or invalidate server cache when a request was intentionally cancelled on unmount
    if (axios.isCancel(error) || error.code === 'ERR_CANCELED') {
      return Promise.reject(error);
    }

    const originalRequest = error.config as InternalAxiosRequestConfig & {
      _retryCount?: number;
    };

    // Clear stored credentials on 401 Unauthorized (except login endpoint itself)
    if (error.response?.status === 401) {
      const reqUrl = String(originalRequest?.url || '');
      if (!reqUrl.includes('/auth/login')) {
        await AsyncStorage.multiRemove([
          AUTH_TOKEN_KEY,
          'user_token',
          'attendsure_token',
          'attendsure_user_profile',
          'attendsure_user',
          'attendsure_role',
        ]);
        if (Platform.OS !== 'web') {
          try {
            await SecureStore.deleteItemAsync(AUTH_TOKEN_KEY);
          } catch {}
        }
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