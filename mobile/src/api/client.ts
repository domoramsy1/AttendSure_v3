// AttendSure - Secure Network Client with Automatic Server Failover
// File: mobile/src/api/client.ts

import axios, { AxiosError, InternalAxiosRequestConfig } from 'axios';
import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  getServerBaseUrl,
  resolveFastestServer,
  invalidateServerCache,
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
    const activeBaseUrl = await getServerBaseUrl();
    config.baseURL = activeBaseUrl;

    let requestPath = config.url || '';
    if (!requestPath.startsWith('http://') && !requestPath.startsWith('https://')) {
      const sanitized = requestPath
        .replace(/^\/+/, '')
        .replace(/\.\.\//g, '')
        .replace(/^(api\/)+/i, '');
      config.url = `/api/${sanitized}`;
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

    if (token && config.headers) {
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
          originalRequest.baseURL = newBaseUrl;
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