/**
 * AttendSure V3 - Unified API Client
 * File: frontend/src/api/client.ts
 *
 * Fixes Applied:
 * 1. RESTORED PORT 8000: Targets backend port 8000 across localhost, IP, and domain access.
 * 2. DYNAMIC PROTOCOL: Detects http: or https: dynamically from browser location.
 * 3. ZERO TS ERRORS: Cleaned up unused type imports to satisfy verbatimModuleSyntax.
 */

import axios from 'axios';

/**
 * Resolves backend API URL with port 8000:
 * - PC (localhost): http://localhost:8000/api
 * - LAN / Mobile IP (10.149.144.49): http://10.149.144.49:8000/api
 * - School Domain (lapasan.attendsure.com.ph): http://lapasan.attendsure.com.ph:8000/api
 */
const getBaseURL = (): string => {
  if (import.meta.env.VITE_API_BASE_URL) {
    return import.meta.env.VITE_API_BASE_URL;
  }
  const host = typeof window !== 'undefined' ? window.location.hostname : 'localhost';
  const protocol = typeof window !== 'undefined' ? window.location.protocol : 'http:';
  return `${protocol}//${host}:8000/api`;
};

const apiClient = axios.create({
  baseURL: getBaseURL(),
  timeout: 30000,
  headers: {
    'Content-Type': 'application/json',
  },
});

// Inject auth token on each outgoing request
apiClient.interceptors.request.use(
  (config) => {
    const token = localStorage.getItem('attendsure_token');
    if (token) {
      config.headers.Authorization = `Token ${token}`;
    }
    return config;
  },
  (error) => Promise.reject(error)
);

// Response interceptor with error logging & session expiry trigger
apiClient.interceptors.response.use(
  (response) => {
    const method = response.config.method?.toUpperCase();
    const url = response.config.url;
    const status = response.status;

    if (import.meta.env.DEV) {
      console.log(
        `%c[✓ OK ${status}] ${method} ${url}`,
        'color: #059669; font-weight: bold; background: #ecfdf5; padding: 2px 6px; border-radius: 4px; border: 1px solid #a7f3d0;'
      );
    }
    return response;
  },
  (error) => {
    const method = error.config?.method?.toUpperCase();
    const url = error.config?.url;
    const status = error.response?.status || 'NET_ERR';
    const errorMsg =
      error.response?.data?.detail ||
      error.response?.data?.error ||
      error.message ||
      'Network communication failure';

    console.error(
      `%c[✗ ERROR ${status}] ${method} ${url} -> ${errorMsg}`,
      'color: #dc2626; font-weight: bold; background: #fef2f2; padding: 2px 6px; border-radius: 4px; border: 1px solid #fecaca;'
    );

    if (error.response?.status === 401) {
      window.dispatchEvent(new CustomEvent('attendsure:auth-expired'));
    }

    return Promise.reject(error);
  }
);

export default apiClient;