// AttendSure - Secure Network Client with Automatic Server Failover
// File: mobile/src/api/client.ts

import axios, { AxiosError, InternalAxiosRequestConfig } from 'axios';
import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  getServerBaseUrl,
  resolveFastestServer,
  invalidateServerCache,
} from '../services/configService';

// Standardized Storage Keys
export const AUTH_TOKEN_KEY = 'attendsure_auth_token';
const LEGACY_TOKEN_KEYS = ['user_token', 'attendsure_token'];

// Initialize Axios with faster 8-second timeout
export const apiClient = axios.create({
  timeout: 8000,
  headers: {
    'Content-Type': 'application/json',
    Accept: 'application/json',
  },
});

// ==============================================================================
// 1. REQUEST INTERCEPTOR: DYNAMIC ENDPOINT RESOLUTION & SECURITY SANITIZATION
// ==============================================================================

apiClient.interceptors.request.use(
  async (config: InternalAxiosRequestConfig) => {
    // 1. Resolve active backend automatically (Cloudflare Tunnel, Campus LAN, or Local)
    const activeBaseUrl = await getServerBaseUrl();
    config.baseURL = activeBaseUrl;

    // 2. Sanitize request path and prevent duplicate /api/api/ prefixes
    let requestPath = config.url || '';
    if (!requestPath.startsWith('http://') && !requestPath.startsWith('https://')) {
      // Strip leading slashes, directory traversals, and duplicate api prefixes
      const sanitized = requestPath
        .replace(/^\/+/, '')
        .replace(/\.\.\//g, '')
        .replace(/^(api\/)+/i, '');
      config.url = `/api/${sanitized}`;
    }

    // 3. Attach authentication token safely
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

    if (token && config.headers) {
      // Cybersecurity: Strip CRLF characters to prevent HTTP Header Injection
      const sanitizedToken = token.trim().replace(/[\r\n]/g, '');
      config.headers.Authorization = `Token ${sanitizedToken}`;
    }

    return config;
  },
  (error) => Promise.reject(error)
);

// ==============================================================================
// 2. RESPONSE INTERCEPTOR: AUTO-FAILOVER & SESSION INTEGRITY
// ==============================================================================

apiClient.interceptors.response.use(
  (response) => response,
  async (error: AxiosError) => {
    const originalRequest = error.config as InternalAxiosRequestConfig & {
      _retryCount?: number;
    };

    // 1. Cybersecurity: Wipe stored credentials on 401 Unauthorized to stop token reuse
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

    // 2. Automatic Network Failover: Detect network switch (e.g. Wi-Fi to Mobile Data)
    const isNetworkError =
      !error.response ||
      error.code === 'ECONNABORTED' ||
      error.message.includes('Network Error') ||
      error.message.includes('timeout');

    if (isNetworkError && originalRequest) {
      originalRequest._retryCount = originalRequest._retryCount || 0;

      // Retry once by rediscovering the fastest responsive server
      if (originalRequest._retryCount < 1) {
        originalRequest._retryCount += 1;
        invalidateServerCache();

        try {
          const newBaseUrl = await resolveFastestServer();
          originalRequest.baseURL = newBaseUrl;

          // Re-issue the original request with the new active server endpoint
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