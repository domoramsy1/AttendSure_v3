// D:\AttendSure_V3\web\src\api\client.ts

import axios from 'axios';

const defaultBaseUrl = typeof window !== 'undefined'
  ? `${window.location.protocol}//${window.location.hostname}:8000/api`
  : 'http://127.0.0.1:8000/api';

export const apiClient = axios.create({
  baseURL: import.meta.env.VITE_API_BASE_URL || defaultBaseUrl,
  timeout: 12000,
  headers: {
    'Content-Type': 'application/json',
  },
});

// Attach Authorization Token using AttendSure's native storage key
apiClient.interceptors.request.use(
  (config) => {
    const token =
      localStorage.getItem('attendsure_token') ||
      localStorage.getItem('auth_token') ||
      localStorage.getItem('token');

    if (token && token.trim() !== '' && !config.headers.Authorization) {
      config.headers.Authorization = `Token ${token.trim()}`;
    }
    return config;
  },
  (error) => Promise.reject(error)
);

// Intercept 401: Notify App.tsx to drop session and lock to LoginView
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

      // Triggers handleAuthExpired in App.tsx
      if (typeof window !== 'undefined') {
        window.dispatchEvent(new CustomEvent('attendsure:auth-expired'));
      }
    }
    return Promise.reject(error);
  }
);

export default apiClient;