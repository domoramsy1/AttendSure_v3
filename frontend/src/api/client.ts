import axios from 'axios';

const apiClient = axios.create({
  baseURL: 'http://localhost:8000/api',
  timeout: 10000,
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

// Color-coded response interceptor
apiClient.interceptors.response.use(
  (response) => {
    const method = response.config.method?.toUpperCase();
    const url = response.config.url;
    const status = response.status;

    // Green badge for OK responses
    console.log(
      `%c[✓ OK ${status}] ${method} ${url}`,
      'color: #059669; font-weight: bold; background: #ecfdf5; padding: 2px 6px; border-radius: 4px; border: 1px solid #a7f3d0;'
    );
    return response;
  },
  (error) => {
    const method = error.config?.method?.toUpperCase();
    const url = error.config?.url;
    const status = error.response?.status || 'NET_ERR';
    const errorMsg = error.response?.data?.detail || error.response?.data?.error || error.message;

    // Red badge for Errors & Bugs
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