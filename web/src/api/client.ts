/**
 * AttendSure Web API Client
 * File: web/src/api/client.ts
 */

import axios, { type InternalAxiosRequestConfig } from 'axios';

const CLOUDFLARE_HOST = 'https://sing-happened-plastics-wish.trycloudflare.com';

const resolveBaseHost = (): string => {
  if (typeof window !== 'undefined') {
    const { hostname, protocol } = window.location;
    if (hostname === 'localhost' || hostname === '127.0.0.1') {
      return `${protocol}//${hostname}:8000`;
    }
  }
  return CLOUDFLARE_HOST;
};

export const apiClient = axios.create({
  baseURL: resolveBaseHost(),
  timeout: 15000,
  headers: {
    'Content-Type': 'application/json',
  },
});

apiClient.interceptors.request.use(
  (config: InternalAxiosRequestConfig) => {
    config.baseURL = resolveBaseHost();

    // Prevent duplicate /api/api/
    let requestPath = config.url || '';
    if (!requestPath.startsWith('http://') && !requestPath.startsWith('https://')) {
      const cleaned = requestPath.replace(/^\/+/, '').replace(/^(api\/)+/i, '');
      config.url = `/api/${cleaned}`;
    }

    const token =
      localStorage.getItem('attendsure_token') ||
      localStorage.getItem('auth_token') ||
      localStorage.getItem('token');

    if (token && token.trim() !== '' && config.headers && !config.headers.Authorization) {
      config.headers.Authorization = `Token ${token.trim()}`;
    }
    return config;
  },
  (error) => Promise.reject(error)
);

apiClient.interceptors.response.use(
  (response) => response,
  (error) => {
    const isLoginEndpoint =
      error.config?.url?.includes('/auth/login/') ||
      error.config?.url?.includes('/token/');

    if (error.response && error.response.status === 401 && !isLoginEndpoint) {
      localStorage.removeItem('attendsure_token');
      localStorage.removeItem('attendsure_username');
      localStorage.removeItem('attendsure_faculty_name');
      localStorage.removeItem('attendsure_role');
      localStorage.removeItem('attendsure_user_photo');

      if (typeof window !== 'undefined') {
        window.dispatchEvent(new CustomEvent('attendsure:auth-expired'));
      }
    }
    return Promise.reject(error);
  }
);

export default apiClient;