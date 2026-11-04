/**
 * AttendSure Web API Client - Direct Host Resolution & Security Layer
 * File: web/src/api/client.ts
 */

import axios, { type InternalAxiosRequestConfig, AxiosError } from 'axios';
import rootEndpoints from '../../../endpoints.json';

// Detects private and local network hostnames
const isLocalOrLanNetwork = (hostname: string): boolean => {
  return (
    hostname === 'localhost' ||
    hostname === '127.0.0.1' ||
    hostname.startsWith('192.168.') ||
    hostname.startsWith('10.') ||
    hostname.startsWith('172.') ||
    hostname.endsWith('.local')
  );
};

const resolveBaseUrl = (): string => {
  // 1. Highest Priority: Explicit Vite Environment Override (.env)
  const envUrl = import.meta.env.VITE_API_URL;
  if (envUrl && typeof envUrl === 'string' && envUrl.trim()) {
    return envUrl.trim().replace(/\/+$/, '').replace(/\/api$/i, '');
  }

  // 2. Active Browser Host Detection
  if (typeof window !== 'undefined') {
    const { protocol, hostname, port } = window.location;

    // Local development or school LAN (e.g., 192.168.100.4)
    if (isLocalOrLanNetwork(hostname)) {
      return `${protocol}//${hostname}:8000`;
    }

    // Official Production Domain
    if (hostname.includes('attendsure.com.ph')) {
      if (!port || port === '80' || port === '443') {
        return `${protocol}//${hostname}`;
      }
      return `${protocol}//${hostname}:${port}`;
    }

    // Active Live Cloudflare Tunnel (only when the web page is loaded through Cloudflare)
    if (hostname.includes('trycloudflare.com')) {
      return `${protocol}//${hostname}`;
    }

    if (port && port !== '80' && port !== '443') {
      return `${protocol}//${hostname}:${port}`;
    }
    return `${protocol}//${hostname}`;
  }

  // 3. Fallback to active_tunnel_url only if not on local machine
  const tunnelUrl = rootEndpoints?.active_tunnel_url;
  if (
    tunnelUrl &&
    typeof tunnelUrl === 'string' &&
    tunnelUrl.trim() &&
    !tunnelUrl.includes('course-converted-thin-wells.trycloudflare.com')
  ) {
    return tunnelUrl.trim().replace(/\/+$/, '').replace(/\/api$/i, '');
  }

  // 4. Safe Default to Local Django Backend
  return 'http://127.0.0.1:8000';
};

const apiClient = axios.create({
  timeout: 6000, // 6-second timeout prevents interface hanging on dropped connections
  headers: {
    'Content-Type': 'application/json',
  },
});

apiClient.interceptors.request.use(
  (config: InternalAxiosRequestConfig) => {
    config.baseURL = resolveBaseUrl();

    // Cybersecurity Guard: Prevent malicious pseudo-protocol injection
    let requestPath = config.url || '';
    if (
      requestPath.startsWith('javascript:') ||
      requestPath.startsWith('vbscript:') ||
      requestPath.startsWith('data:')
    ) {
      return Promise.reject(new Error('Blocked dangerous URL protocol.'));
    }

    // Cybersecurity Guard: Prevent path traversal and enforce single /api/ prefix
    if (!requestPath.startsWith('http://') && !requestPath.startsWith('https://')) {
      const sanitized = requestPath
        .replace(/^\/+/, '')
        .replace(/\.\.\//g, '') // Strips '../' directory traversal attempts
        .replace(/^(api\/)+/i, '');
      config.url = `/api/${sanitized}`;
    }

    // Cybersecurity Guard: Attach token with CRLF injection protection
    const rawToken =
      localStorage.getItem('attendsure_token') ||
      localStorage.getItem('auth_token') ||
      localStorage.getItem('token');

    if (rawToken && config.headers && !config.headers.Authorization) {
      const sanitizedToken = rawToken.trim().replace(/[\r\n]/g, '');
      if (sanitizedToken) {
        config.headers.Authorization = `Token ${sanitizedToken}`;
      }
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

    // Automatically clear local session on authentication expiration
    if (error.response?.status === 401 && !isLoginEndpoint) {
      localStorage.removeItem('attendsure_token');
      localStorage.removeItem('auth_token');
      localStorage.removeItem('token');
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