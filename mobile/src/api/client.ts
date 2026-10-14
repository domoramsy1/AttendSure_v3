// mobile/src/api/client.ts

import axios, { InternalAxiosRequestConfig } from 'axios';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { getServerBaseUrl } from '../services/configService';

export const AUTH_TOKEN_KEY = 'attendsure_auth_token';

export const apiClient = axios.create({
  timeout: 15000,
  headers: {
    'Content-Type': 'application/json',
    Accept: 'application/json',
  },
});

/**
 * Request Interceptor:
 * 1. Dynamically loads the current server base URL from storage.
 * 2. Normalizes `/api` prefixes so paths work whether baseURL ends in `/api` or not.
 * 3. Attaches the Django DRF Token from storage.
 */
apiClient.interceptors.request.use(
  async (config: InternalAxiosRequestConfig) => {
    const rawBaseUrl = await getServerBaseUrl();
    // Strip trailing slashes and any trailing `/api` so we have a clean origin host
    const cleanHost = rawBaseUrl.trim().replace(/\/+$/, '').replace(/\/api$/i, '');

    let requestPath = config.url || '';
    if (!requestPath.startsWith('http://') && !requestPath.startsWith('https://')) {
      if (!requestPath.startsWith('/')) {
        requestPath = `/${requestPath}`;
      }
      if (!requestPath.startsWith('/api/')) {
        requestPath = `/api${requestPath}`;
      }
      config.baseURL = cleanHost;
      config.url = requestPath;
    }

    const token = await AsyncStorage.getItem(AUTH_TOKEN_KEY);
    if (token && config.headers) {
      config.headers.Authorization = `Token ${token}`;
    }

    return config;
  },
  (error) => Promise.reject(error)
);

export default apiClient;