// AttendSure - Secure Mobile API Client with Automated Failover
// File: mobile/src/api/client.ts

import axios, { AxiosError, InternalAxiosRequestConfig } from 'axios';
import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  getServerBaseUrl,
  resolveFastestServer,
  invalidateServerCache,
  cleanUrl,
} from '../services/configService';

export const AUTH_TOKEN_KEY = 'attendsure_auth_token';
const LEGACY_TOKEN_KEYS = ['user_token', 'attendsure_token'];

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
    config.baseURL = cleanUrl(rawBaseUrl);

    // 2. Prevent duplicate /api/ prefixes and path traversal
    let requestPath = config.url || '';
    if (!requestPath.startsWith('http://') && !requestPath.startsWith('https://')) {
      const sanitized = requestPath
        .replace(/^\/+/, '')
        .replace(/\.\.\//g, '')
        .replace(/^(api\/)+/i, '');
      config.url = `/api/${sanitized}`;
    }

    // 3. Resolve stored authentication token
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

    // 4. Attach token with CRLF injection protection
    if (token && config.headers && !config.headers.Authorization) {
      const sanitizedToken = token.trim().replace(/[\r\n]/g, '');
      config.headers.Authorization = `Token ${sanitizedToken}`;
    }

    return config;
  },
  (error) => Promise.reject(error)
);

apiClient.interceptors.response.use(
  (response) => response,
  async (error: AxiosError) => {
    const originalRequest = error.config as InternalAxiosRequestConfig & {
      _retryCount?: number;
    };

    // Clear stored credentials on 401 Unauthorized
    if (error.response?.status === 401) {
      await AsyncStorage.multiRemove([
        AUTH_TOKEN_KEY,
        'user_token',
        'attendsure_token',
        'attendsure_user',
        'attendsure_role',
      ]);
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