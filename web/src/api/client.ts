/**
 * AttendSure Web API Client - Direct Host Resolution
 * File: web/src/api/client.ts
 */

import axios, { type InternalAxiosRequestConfig, AxiosError } from 'axios';
import rootEndpoints from '../../../endpoints.json';

const resolveBaseUrl = (): string => {
  if (typeof window !== 'undefined') {
    const { protocol, hostname, port } = window.location;

    // Local development on Vite port 5173
    if (port === '5173' || hostname === 'localhost' || hostname === '127.0.0.1') {
      return `${protocol}//${hostname}:8000`;
    }

    // Cloudflare Tunnel or Custom Domain
    if (hostname.includes('trycloudflare.com') || hostname.includes('attendsure.com.ph')) {
      if (!port || port === '80' || port === '443') {
        return `${protocol}//${hostname}`;
      }
      return `${protocol}//${hostname}:8000`;
    }
  }

  // Fallback to active Cloudflare tunnel
  if (rootEndpoints.active_tunnel_url) {
    return rootEndpoints.active_tunnel_url.trim().replace(/\/+$/, '').replace(/\/api$/i, '');
  }

  return 'http://127.0.0.1:8000';
};

const apiClient = axios.create({
  timeout: 10000,
  headers: {
    'Content-Type': 'application/json',
  },
});

apiClient.interceptors.request.use(
  (config: InternalAxiosRequestConfig) => {
    config.baseURL = resolveBaseUrl();

    // Prevent duplicate /api/ prefixes and directory traversal
    let requestPath = config.url || '';
    if (!requestPath.startsWith('http://') && !requestPath.startsWith('https://')) {
      const cleaned = requestPath
        .replace(/^\/+/, '')
        .replace(/\.\.\//g, '')
        .replace(/^(api\/)+/i, '');
      config.url = `/api/${cleaned}`;
    }

    // Attach token with CRLF injection guard
    const rawToken =
      localStorage.getItem('attendsure_token') ||
      localStorage.getItem('auth_token') ||
      localStorage.getItem('token');

    if (rawToken && config.headers && !config.headers.Authorization) {
      const sanitizedToken = rawToken.trim().replace(/[\r\n]/g, '');
      config.headers.Authorization = `Token ${sanitizedToken}`;
    }

    return config;
  },
  (error) => Promise.reject(error)
);

apiClient.interceptors.response.use(
  (response) => response,
  (error: AxiosError) => {
    const isLoginEndpoint =
      error.config?.url?.includes('/auth/login/') ||
      error.config?.url?.includes('/token/');

    if (error.response?.status === 401 && !isLoginEndpoint) {
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