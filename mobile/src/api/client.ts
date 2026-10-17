// mobile/src/api/client.ts

import axios, { InternalAxiosRequestConfig } from 'axios';
import AsyncStorage from '@react-native-async-storage/async-storage';

export const AUTH_TOKEN_KEY = 'attendsure_auth_token';

// Primary Cloudflare Host (Base domain without trailing slash or /api)
const CLOUDFLARE_HOST = 'https://conventional-prayer-specs-boxed.trycloudflare.com';

export const apiClient = axios.create({
  baseURL: CLOUDFLARE_HOST,
  timeout: 15000,
  headers: {
    'Content-Type': 'application/json',
    Accept: 'application/json',
  },
});

apiClient.interceptors.request.use(
  async (config: InternalAxiosRequestConfig) => {
    // 1. Keep base URL clean
    config.baseURL = CLOUDFLARE_HOST;

    // 2. Prevent duplicate /api/api/ by sanitizing the path
    let requestPath = config.url || '';
    if (!requestPath.startsWith('http://') && !requestPath.startsWith('https://')) {
      // Remove any leading slashes and any duplicate /api prefixes
      const cleaned = requestPath.replace(/^\/+/, '').replace(/^(api\/)+/i, '');
      config.url = `/api/${cleaned}`;
    }

    // 3. Attach authentication token if present
    const token =
      (await AsyncStorage.getItem(AUTH_TOKEN_KEY)) ||
      (await AsyncStorage.getItem('attendsure_token'));

    if (token && config.headers) {
      config.headers.Authorization = `Token ${token.trim()}`;
    }

    return config;
  },
  (error) => Promise.reject(error)
);

apiClient.interceptors.response.use(
  (response) => response,
  async (error) => {
    if (error.response?.status === 401) {
      await AsyncStorage.multiRemove([
        AUTH_TOKEN_KEY,
        'attendsure_token',
        'attendsure_username',
        'attendsure_role',
      ]);
    }
    return Promise.reject(error);
  }
);

export default apiClient;