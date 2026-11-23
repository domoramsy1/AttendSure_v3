/**
 * AttendSure Web API Client - Strict /api/v1/ Enforcement, SWR Cache & JWT Layer
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

// Maps any legacy unversioned path to its canonical /api/v1/ endpoint
const LEGACY_TO_V1_PREFIXES: ReadonlyArray<[RegExp, string]> = [
  [/^me\/?$/i, 'v1/accounts/me/'],
  [/^users(\/|$)/i, 'v1/accounts/users$1'],
  [/^faculties(\/|$)/i, 'v1/accounts/faculty$1'],
  [/^facultys(\/|$)/i, 'v1/accounts/faculty$1'],
  [/^faculty\/dropdown\/?$/i, 'v1/accounts/faculty/dropdown/'],
  [/^faculty\/(\d+)\/reset-device\/?$/i, 'v1/accounts/faculty/$1/reset-device/'],
  [/^faculty(\/|$)/i, 'v1/accounts/faculty$1'],
  [/^activity-logs(\/|$)/i, 'v1/accounts/audit-logs$1'],
  [/^settings\/school\/?$/i, 'v1/school/settings/'],
  [/^academic-years(\/|$)/i, 'v1/school/school-years$1'],
  [/^grade-levels(\/|$)/i, 'v1/school/grade-levels$1'],
  [/^rooms(\/|$)/i, 'v1/school/rooms$1'],
  [/^subjects(\/|$)/i, 'v1/school/subjects$1'],
  [/^sections(\/|$)/i, 'v1/school/sections$1'],
  [/^schedules(\/|$)/i, 'v1/school/periods$1'],
  [/^students(\/|$)/i, 'v1/students$1'],
  [/^gate-passes(\/|$)/i, 'v1/attendance/exit-passes$1'],
  [/^classroom\/adviser-matrix\/?$/i, 'v1/attendance/adviser-matrix/'],
  [/^classroom\/(student_list|class_list)\/?$/i, 'v1/attendance/classes/'],
  [/^geofence\/audit\/?$/i, 'v1/campus/audit/'],
  [/^geofence(\/|$)/i, 'v1/campus/boundary$1'],
  [/^enterprise\/emergency-roll-?call\/?$/i, 'v1/campus/roll-call/'],
  [/^enterprise\/sdg-impact\/?$/i, 'v1/reports/sdg-impact/'],
  [/^enterprise\/edfi-export\/?$/i, 'v1/reports/edfi-export/'],
  [/^enterprise\/sardo-early-warning\/?$/i, 'v1/reports/dropout-risk/'],
  [/^dashboard\/overview\/?$/i, 'v1/reports/dashboard/'],
  [/^system\/status\/?$/i, 'v1/reports/system-status/'],
  [/^reports(\/|$)/i, 'v1/reports$1'],
  [/^notifications(\/|$)/i, 'v1/messaging/notifications$1'],
  [/^chat\/threads\/?$/i, 'v1/messaging/threads/'],
  [/^chat\/messages\/?$/i, 'v1/messaging/messages/'],
  [/^core\/maintenance\/db-check\/?$/i, 'v1/health/db/'],
  [/^core\/maintenance\/flush-cache\/?$/i, 'v1/cache/flush/'],
  [/^core\/maintenance\/unlock-accounts\/?$/i, 'v1/accounts/unlock-accounts/'],
];

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

/**
 * Evicts cached GET entries completely so immediate post-mutation refetches
 * always read fresh database state instead of stale SWR snapshots.
 */
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
    if (port === '80' || port === '443' || port === '5173' || !port) {
      if (
        hostname.includes('attendsure.ph') ||
        hostname.includes('attendsure.com.ph') ||
        hostname.includes('trycloudflare.com')
      ) {
        return `${protocol}//${hostname}`;
      }
    }
    if (isLocalOrLanHost(hostname)) {
      return `${protocol}//${hostname}:8000`;
    }
    return port && port !== '80' && port !== '443'
      ? `${protocol}//${hostname}:${port}`
      : `${protocol}//${hostname}`;
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
    const qIdx = clean.indexOf('?');
    const pathPart = qIdx >= 0 ? clean.slice(0, qIdx) : clean;
    const queryPart = qIdx >= 0 ? clean.slice(qIdx) : '';

    let mapped = pathPart;
    for (const [pattern, replacement] of LEGACY_TO_V1_PREFIXES) {
      if (pattern.test(pathPart)) {
        mapped = pathPart.replace(pattern, replacement);
        break;
      }
    }
    clean = (mapped.startsWith('v1/') ? mapped : `v1/${mapped}`) + queryPart;
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
    'attendsure_faculty_name',
    'attendsure_role',
    'attendsure_user_id',
    'attendsure_user_photo',
    'attendsure_can_teach',
  ];
  keys.forEach((k) => localStorage.removeItem(k));
  lastWarmupUser = '';
  clearApiClientCache();
};

const apiClient = axios.create({
  timeout: Number(import.meta.env.VITE_API_TIMEOUT_MS) || 10000,
  headers: { 'Content-Type': 'application/json' },
});

apiClient.interceptors.request.use(
  (config: InternalAxiosRequestConfig) => {
    config.baseURL = resolveBaseUrl();
    config.url = normalizeApiPath(config.url || '');

    const method = (config.method || 'get').toLowerCase();
    if (method !== 'get') {
      invalidateApiCache();
    }

    if (config.headers && !config.headers.Authorization) {
      const jwtAccess = localStorage.getItem('attendsure_access')?.trim().replace(/[\r\n]/g, '');
      const legacyToken = (
        localStorage.getItem('attendsure_token') ||
        localStorage.getItem('auth_token') ||
        localStorage.getItem('token') ||
        ''
      )
        .trim()
        .replace(/[\r\n]/g, '');

      if (jwtAccess) {
        config.headers.Authorization = `Bearer ${jwtAccess}`;
      } else if (legacyToken) {
        config.headers.Authorization = `Token ${legacyToken}`;
      }
    }

    return config;
  },
  (error) => Promise.reject(error)
);

let refreshPromise: Promise<string | null> | null = null;

type RetriableConfig = InternalAxiosRequestConfig & {
  _jwtRetried?: boolean;
  _tokenRetried?: boolean;
};

apiClient.interceptors.response.use(
  (response) => {
    const method = (response.config.method || 'get').toLowerCase();
    if (method !== 'get') {
      // Clear cache AFTER mutation commits so follow-up GETs never read pre-mutation snapshots
      invalidateApiCache();
    }
    return response;
  },
  async (error: AxiosError) => {
    const originalRequest = error.config as RetriableConfig | undefined;
    const reqUrl = originalRequest?.url || '';
    const isAuthRoute = reqUrl.includes('/login/') || reqUrl.includes('/token/') || reqUrl.includes('/public-branding/');

    if (error.response?.status === 401 && originalRequest && !isAuthRoute) {
      const refreshToken = localStorage.getItem('attendsure_refresh')?.trim();
      if (refreshToken && !originalRequest._jwtRetried) {
        originalRequest._jwtRetried = true;
        if (!refreshPromise) {
          refreshPromise = axios
            .post(`${resolveBaseUrl()}/api/v1/accounts/token/refresh/`, { refresh: refreshToken }, { timeout: 6000 })
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

        const newAccess = await refreshPromise;
        if (newAccess) {
          originalRequest.headers.Authorization = `Bearer ${newAccess}`;
          return apiClient(originalRequest);
        }
      }

      const fallbackToken = localStorage.getItem('attendsure_token')?.trim();
      if (
        fallbackToken &&
        !originalRequest._tokenRetried &&
        String(originalRequest.headers?.Authorization || '').startsWith('Bearer ')
      ) {
        originalRequest._tokenRetried = true;
        localStorage.removeItem('attendsure_access');
        originalRequest.headers.Authorization = `Token ${fallbackToken}`;
        return apiClient(originalRequest);
      }

      clearStoredAuth();
      if (typeof window !== 'undefined') {
        window.dispatchEvent(new CustomEvent('attendsure:auth-expired'));
      }
    }

    return Promise.reject(error);
  }
);

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
      return withCallerAbort(Promise.resolve(hit.response as unknown as R), config?.signal as GenericAbortSignal);
    }
    if (hit && hit.staleUntil > now) {
      void fetchAndPopulateCache<T, D>(url, key, config).catch(() => {});
      return withCallerAbort(Promise.resolve(hit.response as unknown as R), config?.signal as GenericAbortSignal);
    }
  }

  return withCallerAbort(
    fetchAndPopulateCache<T, D>(url, key, config) as unknown as Promise<R>,
    config?.signal as GenericAbortSignal
  );
};

export const prefetchApiGet = (url: string, params?: Record<string, unknown>): void => {
  const hasToken = Boolean(localStorage.getItem('attendsure_access') || localStorage.getItem('attendsure_token'));
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
  const isLeader = ['ADMIN', 'SUPERADMIN', 'FACULTY_ADMIN', 'PRINCIPAL', 'DEPT_HEAD'].includes(upper);
  const now = new Date();

  const queue: Array<[string, Record<string, unknown>?]> = [
    [API_ROUTES.reports.dashboard, undefined],
    [API_ROUTES.students.metrics, undefined],
    [API_ROUTES.students.list, { page: 1, page_size: 25 }],
    [API_ROUTES.school.sections, { page_size: 300 }],
    [API_ROUTES.school.gradeLevels, { page_size: 200 }],
    [API_ROUTES.attendance.exitPasses, undefined],
    [API_ROUTES.reports.dtr, { month: now.getMonth() + 1, year: now.getFullYear() }],
    [API_ROUTES.messaging.threads, undefined],
    [API_ROUTES.reports.sdgImpact, undefined],
    [API_ROUTES.reports.dropoutRisk, undefined],
  ];

  if (canHandleClasses || isLeader) {
    queue.push([API_ROUTES.attendance.classes, undefined]);
    queue.push([API_ROUTES.attendance.classes, { summary: 1 }]);
    queue.push([API_ROUTES.attendance.adviserMatrix, undefined]);
  }

  if (isLeader) {
    queue.push([API_ROUTES.accounts.faculty, { page: 1, page_size: 25 }]);
    queue.push([API_ROUTES.accounts.facultyDropdown, undefined]);
    queue.push([API_ROUTES.school.periods, { page_size: 500 }]);
    queue.push([API_ROUTES.campus.boundary, undefined]);
    queue.push([API_ROUTES.school.settings, undefined]);
  }

  if (['ADMIN', 'SUPERADMIN', 'FACULTY_ADMIN'].includes(upper)) {
    queue.push([API_ROUTES.accounts.users, { page_size: 'ALL' }]);
  }

  queue.forEach(([endpoint, params], index) => {
    setTimeout(() => prefetchApiGet(endpoint, params), 80 + index * 90);
  });
};
export default apiClient;