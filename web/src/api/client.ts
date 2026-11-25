// AttendSure Web - Client
// File: D:\AttendSure_V3\web\src\api\client.ts

/**
 * AttendSure Web API Client - Strict /api/v1/ Enforcement, Request Deduplication & JWT Layer
 * File: web/src/api/client.ts
 */

import axios, {
  AxiosError,
  CanceledError,
  type AxiosRequestConfig,
  type AxiosResponse,
  type InternalAxiosRequestConfig,
} from 'axios';
import { API_ROUTES } from './routes';

const FRESH_TTL_MS = 25_000;
const STALE_TTL_MS = 120_000;
const MAX_CACHE_ENTRIES = 150;

interface CacheEntry {
  freshUntil: number;
  staleUntil: number;
  response: AxiosResponse;
}

type CacheListener = (data: unknown) => void;

const responseCache = new Map<string, CacheEntry>();
const inflightGetMap = new Map<string, Promise<AxiosResponse>>();
const cacheListeners = new Map<string, Set<CacheListener>>();

const notifyCacheListeners = (key: string, data: unknown): void => {
  const listeners = cacheListeners.get(key);
  if (!listeners) return;
  listeners.forEach((fn) => {
    try {
      fn(data);
    } catch {
      // Isolate listener errors
    }
  });
};

const pruneCacheIfNeeded = (): void => {
  if (responseCache.size <= MAX_CACHE_ENTRIES) return;
  const oldestKey = responseCache.keys().next().value;
  if (oldestKey) responseCache.delete(oldestKey);
};

export const clearApiClientCache = (): void => {
  responseCache.clear();
  inflightGetMap.clear();
};

export const invalidateApiCache = (): void => {
  responseCache.clear();
  inflightGetMap.clear();
};

const isLocalOrLanHost = (hostname: string): boolean =>
  hostname === 'localhost' ||
  hostname === '127.0.0.1' ||
  hostname.startsWith('192.168.') ||
  hostname.startsWith('10.') ||
  hostname.startsWith('172.') ||
  hostname.endsWith('.local');

export const resolveBaseUrl = (): string => {
  const envUrl = import.meta.env.VITE_API_URL || import.meta.env.VITE_API_BASE_URL;
  if (envUrl && typeof envUrl === 'string' && envUrl.trim()) {
    return envUrl.trim().replace(/\/+$/, '').replace(/\/api(\/v1)?$/i, '');
  }

  if (typeof window !== 'undefined') {
    const { protocol, hostname, port } = window.location;
    // Standard HTTP/HTTPS ports (80/443) are served behind Nginx reverse proxy on the same origin.
    if (!port || port === '80' || port === '443') {
      return `${protocol}//${hostname}`;
    }
    if (
      hostname.includes('attendsure.ph') ||
      hostname.includes('attendsure.com.ph') ||
      hostname.includes('trycloudflare.com')
    ) {
      return `${protocol}//${hostname}`;
    }
    if (isLocalOrLanHost(hostname)) {
      return `${protocol}//${hostname}:8000`;
    }
    return `${protocol}//${hostname}:${port}`;
  }

  return 'http://127.0.0.1:8000';
};

export const normalizeApiPath = (rawUrl: string): string => {
  const trimmed = rawUrl.trim();
  if (/^(javascript|vbscript|data):/i.test(trimmed)) {
    throw new Error('Blocked unsafe URL protocol.');
  }
  if (trimmed.startsWith('http://') || trimmed.startsWith('https://')) {
    return trimmed;
  }

  let clean = trimmed
    .replace(/^\/+/, '')
    .replace(/\.\.\//g, '')
    .replace(/^(api\/)+/i, '');

  if (!clean.startsWith('v1/')) {
    clean = `v1/${clean}`;
  }

  return `/api/${clean}`;
};

const serializeParams = (params?: Record<string, unknown>): string => {
  if (!params || typeof params !== 'object') return '';
  const entries = Object.entries(params)
    .filter(([k, v]) => v !== undefined && v !== '' && k !== 'nocache' && k !== '_t' && k !== 'silent')
    .sort(([a], [b]) => a.localeCompare(b));
  return entries.length > 0 ? JSON.stringify(entries) : '';
};

export const buildApiCacheKey = (url: string, params?: Record<string, unknown>): string => {
  const normUrl = normalizeApiPath(url);
  const userScope =
    localStorage.getItem('attendsure_user_id') ||
    localStorage.getItem('attendsure_username') ||
    'guest';
  return `${userScope}:${normUrl}?${serializeParams(params)}`;
};

export function peekApiCache<T = unknown>(url: string, params?: Record<string, unknown>): T | undefined {
  const key = buildApiCacheKey(url, params);
  const hit = responseCache.get(key);
  if (!hit || hit.staleUntil <= Date.now()) return undefined;
  return hit.response.data as T;
}

export const subscribeApiCache = (
  url: string,
  params: Record<string, unknown> | undefined,
  listener: CacheListener
): (() => void) => {
  const key = buildApiCacheKey(url, params);
  let set = cacheListeners.get(key);
  if (!set) {
    set = new Set();
    cacheListeners.set(key, set);
  }
  set.add(listener);
  return () => {
    const current = cacheListeners.get(key);
    if (!current) return;
    current.delete(listener);
    if (current.size === 0) cacheListeners.delete(key);
  };
};

const clearStoredAuth = (): void => {
  const keys = [
    'attendsure_access',
    'attendsure_refresh',
    'attendsure_token',
    'auth_token',
    'token',
    'attendsure_username',
    'attendsure_teacher_name',
    'attendsure_teacher_id',
    'attendsure_role',
    'attendsure_user_id',
    'attendsure_user_photo',
    'attendsure_can_teach',
    'attendsure_is_superuser',
  ];
  keys.forEach((k) => localStorage.removeItem(k));
  lastWarmupUser = '';
  clearApiClientCache();
};

const apiClient = axios.create({
  timeout: Number(import.meta.env.VITE_API_TIMEOUT_MS) || 10000,
  headers: { 'Content-Type': 'application/json' },
});

let refreshPromise: Promise<string | null> | null = null;

const isJwtExpiringSoon = (token: string, bufferSeconds = 60): boolean => {
  try {
    const parts = token.split('.');
    if (parts.length !== 3) return false;
    const base64 = parts[1].replace(/-/g, '+').replace(/_/g, '/');
    const padded = base64.padEnd(base64.length + ((4 - (base64.length % 4)) % 4), '=');
    const payload = JSON.parse(atob(padded)) as { exp?: number };
    if (typeof payload.exp !== 'number') return false;
    return payload.exp * 1000 - Date.now() < bufferSeconds * 1000;
  } catch {
    return false;
  }
};

const refreshJwtAccessToken = (): Promise<string | null> => {
  const refreshToken = localStorage.getItem('attendsure_refresh')?.trim();
  if (!refreshToken) return Promise.resolve(null);
  if (!refreshPromise) {
    refreshPromise = axios
      .post(
        `${resolveBaseUrl()}/api/v1/accounts/token/refresh/`,
        { refresh: refreshToken },
        { timeout: 6000 }
      )
      .then((res) => {
        const nextAccess = res.data?.access as string | undefined;
        const nextRefresh = res.data?.refresh as string | undefined;
        if (nextAccess) {
          localStorage.setItem('attendsure_access', nextAccess);
          if (nextRefresh) localStorage.setItem('attendsure_refresh', nextRefresh);
          return nextAccess;
        }
        return null;
      })
      .catch(() => null)
      .finally(() => {
        refreshPromise = null;
      });
  }
  return refreshPromise;
};

apiClient.interceptors.request.use(
  async (config: InternalAxiosRequestConfig) => {
    config.baseURL = resolveBaseUrl();
    config.url = normalizeApiPath(config.url || '');

    const method = (config.method || 'get').toLowerCase();
    if (method !== 'get') {
      invalidateApiCache();
    }

    const reqUrl = config.url || '';
    const isAuthRoute =
      reqUrl.includes('/login/') ||
      reqUrl.includes('/logout/') ||
      reqUrl.includes('/token/') ||
      reqUrl.includes('/public-branding/');

    if (config.headers && !config.headers.Authorization && !isAuthRoute) {
      let jwtAccess = localStorage.getItem('attendsure_access')?.trim().replace(/[\r\n]/g, '') || '';
      if (jwtAccess && isJwtExpiringSoon(jwtAccess)) {
        const refreshed = await refreshJwtAccessToken();
        if (refreshed) {
          jwtAccess = refreshed;
        }
      }
      if (jwtAccess && jwtAccess.split('.').length === 3) {
        config.headers.Authorization = `Bearer ${jwtAccess}`;
      }
    }

    return config;
  },
  (error) => Promise.reject(error)
);

type RetriableConfig = InternalAxiosRequestConfig & {
  _jwtRetried?: boolean;
};

apiClient.interceptors.response.use(
  (response) => {
    const method = (response.config.method || 'get').toLowerCase();
    if (method !== 'get') {
      invalidateApiCache();
    }
    return response;
  },
  async (error: AxiosError) => {
    const originalRequest = error.config as RetriableConfig | undefined;
    const reqUrl = originalRequest?.url || '';
    const isAuthRoute =
      reqUrl.includes('/login/') ||
      reqUrl.includes('/logout/') ||
      reqUrl.includes('/token/') ||
      reqUrl.includes('/public-branding/');

    if (error.response?.status === 401 && originalRequest && !isAuthRoute) {
      const refreshToken = localStorage.getItem('attendsure_refresh')?.trim();
      if (refreshToken && !originalRequest._jwtRetried) {
        originalRequest._jwtRetried = true;
        const newAccess = await refreshJwtAccessToken();
        if (newAccess) {
          originalRequest.headers.Authorization = `Bearer ${newAccess}`;
          return apiClient(originalRequest);
        }
      }

      clearStoredAuth();
      if (typeof window !== 'undefined') {
        window.dispatchEvent(new CustomEvent('attendsure:auth-expired'));
      }
    }

    return Promise.reject(error);
  }
);

export const revokeCurrentDeviceSession = async (): Promise<void> => {
  const refresh = localStorage.getItem('attendsure_refresh')?.trim();
  if (!refresh) return;
  try {
    await axios.post(
      `${resolveBaseUrl()}/api/v1/accounts/logout/`,
      { refresh },
      { timeout: 5000 }
    );
  } catch {
    // Best-effort server-side refresh blacklist
  }
};

interface GenericAbortSignal {
  readonly aborted: boolean;
  addEventListener?: (type: string, listener: () => void, options?: { once?: boolean }) => void;
  removeEventListener?: (type: string, listener: () => void) => void;
}

const withCallerAbort = <R>(promise: Promise<R>, signal?: GenericAbortSignal): Promise<R> => {
  if (!signal) return promise;
  if (signal.aborted) {
    return Promise.reject(new CanceledError('canceled'));
  }
  return new Promise<R>((resolve, reject) => {
    const onAbort = () => reject(new CanceledError('canceled'));
    signal.addEventListener?.('abort', onAbort, { once: true });
    promise.then(
      (val) => {
        signal.removeEventListener?.('abort', onAbort);
        resolve(val);
      },
      (err) => {
        signal.removeEventListener?.('abort', onAbort);
        reject(err);
      }
    );
  });
};

const rawGet = apiClient.get.bind(apiClient);

const fetchAndPopulateCache = <T = unknown, D = unknown>(
  url: string,
  key: string,
  config?: AxiosRequestConfig<D>
): Promise<AxiosResponse<T>> => {
  const existing = inflightGetMap.get(key);
  if (existing) return existing as Promise<AxiosResponse<T>>;

  const sharedConfig: AxiosRequestConfig<D> = { ...(config || {}), signal: undefined };
  const req = rawGet<T, AxiosResponse<T>, D>(url, sharedConfig)
    .then((res) => {
      const now = Date.now();
      pruneCacheIfNeeded();
      responseCache.set(key, {
        freshUntil: now + FRESH_TTL_MS,
        staleUntil: now + STALE_TTL_MS,
        response: res,
      });
      notifyCacheListeners(key, res.data);
      return res;
    })
    .finally(() => {
      inflightGetMap.delete(key);
    });

  inflightGetMap.set(key, req);
  return req;
};

apiClient.get = function swrGet<T = any, R = AxiosResponse<T>, D = any>(
  url: string,
  config?: AxiosRequestConfig<D>
): Promise<R> {
  const paramsObj = (config?.params || undefined) as Record<string, unknown> | undefined;
  const forceNetwork = Boolean(paramsObj?._t || paramsObj?.nocache);
  const key = buildApiCacheKey(url, paramsObj);
  const now = Date.now();

  if (!forceNetwork) {
    const hit = responseCache.get(key);
    if (hit && hit.freshUntil > now) {
      return withCallerAbort(
        Promise.resolve(hit.response as unknown as R),
        config?.signal as GenericAbortSignal
      );
    }
    if (hit && hit.staleUntil > now) {
      void fetchAndPopulateCache<T, D>(url, key, config).catch(() => {});
      return withCallerAbort(
        Promise.resolve(hit.response as unknown as R),
        config?.signal as GenericAbortSignal
      );
    }
  }

  return withCallerAbort(
    fetchAndPopulateCache<T, D>(url, key, config) as unknown as Promise<R>,
    config?.signal as GenericAbortSignal
  );
};

export const prefetchApiGet = (url: string, params?: Record<string, unknown>): void => {
  const hasToken = Boolean(localStorage.getItem('attendsure_access'));
  if (!hasToken) return;
  const key = buildApiCacheKey(url, params);
  const hit = responseCache.get(key);
  if (hit && hit.freshUntil > Date.now()) return;
  void fetchAndPopulateCache(url, key, { params }).catch(() => {});
};

let lastWarmupUser = '';

export const warmupRoleEndpoints = (role: string, canHandleClasses: boolean): void => {
  const userScope = localStorage.getItem('attendsure_username') || '';
  if (!userScope || lastWarmupUser === userScope) return;
  lastWarmupUser = userScope;

  const upper = role.toUpperCase();
  const isLeader = ['ADMIN', 'PRINCIPAL', 'DEPT_HEAD'].includes(upper);
  const now = new Date();

  const queue: Array<[string, Record<string, unknown>?]> = [
    [API_ROUTES.reports.dashboard, undefined],
    [API_ROUTES.students.metrics, undefined],
    [API_ROUTES.students.list, { page: 1, page_size: 25 }],
    [API_ROUTES.school.sections, { page_size: 300 }],
    [API_ROUTES.school.gradeLevels, { page_size: 200 }],
    [API_ROUTES.attendance.exitPasses, undefined],
    [API_ROUTES.reports.dtr, { month: now.getMonth() + 1, year: now.getFullYear() }],
    [API_ROUTES.reports.sdgImpact, undefined],
    [API_ROUTES.reports.dropoutRisk, undefined],
  ];

  if (canHandleClasses || isLeader) {
    queue.push([API_ROUTES.attendance.classes, undefined]);
    queue.push([API_ROUTES.attendance.classes, { summary: 1 }]);
    queue.push([API_ROUTES.attendance.adviserMatrix, undefined]);
  }

  if (isLeader) {
    queue.push([API_ROUTES.accounts.teachers, { page: 1, page_size: 25 }]);
    queue.push([API_ROUTES.accounts.teachersDropdown, undefined]);
    queue.push([API_ROUTES.school.periods, { page_size: 500 }]);
    queue.push([API_ROUTES.campus.overview, undefined]);
    queue.push([API_ROUTES.campus.loafing, undefined]);
    queue.push([API_ROUTES.school.settings, undefined]);
  }

  if (upper === 'ADMIN') {
    queue.push([API_ROUTES.accounts.users, { page_size: 'ALL' }]);
  }

  queue.forEach(([endpoint, params], index) => {
    setTimeout(() => prefetchApiGet(endpoint, params), 80 + index * 90);
  });
};

export default apiClient;
