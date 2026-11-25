/**
 * AttendSure Mobile - Authentication Context & Session Manager
 * File: mobile/src/context/AuthContext.tsx
 */

import React, { createContext, useContext, useState, useEffect, useCallback, useRef } from 'react';
import { Platform } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import type * as SecureStoreType from 'expo-secure-store';
import { apiClient, AUTH_TOKEN_KEY, onAuthExpired } from '../api/client';
import { ENDPOINTS } from '../api/endpoints';
import { stopPassivePresenceTracking } from '../services/backgroundLocation';

let cachedSecureStore: typeof SecureStoreType | null | undefined;
const getSecureStore = (): typeof SecureStoreType | null => {
  if (cachedSecureStore !== undefined) return cachedSecureStore;
  if (Platform.OS === 'web') {
    cachedSecureStore = null;
    return null;
  }
  try {
    // Lazy require avoids startup crashes if native SecureStore is missing in the runtime
    cachedSecureStore = require('expo-secure-store') as typeof SecureStoreType;
  } catch {
    cachedSecureStore = null;
  }
  return cachedSecureStore;
};

const USER_CACHE_KEY = 'attendsure_user_profile';
const REFRESH_TOKEN_KEY = 'attendsure_refresh_token';
const ALLOWED_ROLES = new Set(['ADMIN', 'PRINCIPAL', 'DEPT_HEAD', 'TEACHER']);

export interface AuthenticatedUser {
  id: number;
  username: string;
  first_name: string;
  last_name: string;
  middle_name?: string;
  suffix?: string;
  full_name: string;
  teacher_name?: string;
  teacher_id?: number | string | null;
  employee_id?: string;
  email: string;
  role: string;
  system_role?: string;
  position?: string;
  department?: string | null;
  division?: string | null;
  contact_number?: string;
  photo?: string | null;
  photo_url?: string | null;
  school_name?: string;
  qr_token?: string | null;
  bound_device_id?: string | null;
  has_bound_device?: boolean;
  has_biometric_enrolled?: boolean;
  can_handle_classes: boolean;
  can_teach: boolean;
  is_superuser: boolean;
  is_staff: boolean;
}

interface AuthContextType {
  user: AuthenticatedUser | null;
  token: string | null;
  loading: boolean;
  isLoading: boolean;
  login: (username: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
  refreshUser: () => Promise<void>;
  updateUser: (updatedFields: Partial<AuthenticatedUser>) => Promise<void>;
  updateSessionToken: (nextToken: string) => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

const saveTokenSafely = async (token: string): Promise<void> => {
  await AsyncStorage.setItem(AUTH_TOKEN_KEY, token);
  const store = getSecureStore();
  if (store) {
    try {
      await store.setItemAsync(AUTH_TOKEN_KEY, token);
    } catch {}
  }
};

const readTokenSafely = async (): Promise<string | null> => {
  const store = getSecureStore();
  if (store) {
    try {
      const secureToken = await store.getItemAsync(AUTH_TOKEN_KEY);
      if (secureToken) return secureToken;
    } catch {}
  }
  return AsyncStorage.getItem(AUTH_TOKEN_KEY);
};

const clearTokenSafely = async (): Promise<void> => {
  await AsyncStorage.multiRemove([
    AUTH_TOKEN_KEY,
    REFRESH_TOKEN_KEY,
    USER_CACHE_KEY,
    'user_token',
    'attendsure_token',
    'attendsure_user',
    'attendsure_role',
    'attendsure_teacher_on_duty',
  ]);
  const store = getSecureStore();
  if (store) {
    try {
      await store.deleteItemAsync(AUTH_TOKEN_KEY);
    } catch {}
    try {
      await store.deleteItemAsync(REFRESH_TOKEN_KEY);
    } catch {}
  }
};

const normalizeUserPayload = (raw: Record<string, any>): AuthenticatedUser => {
  const rawRole = String(raw.role || raw.system_role || 'TEACHER').trim().toUpperCase();
  const role = ALLOWED_ROLES.has(rawRole) ? rawRole : 'TEACHER';
  const fullName =
    String(raw.full_name || raw.teacher_name || '').trim() ||
    `${raw.first_name || ''} ${raw.last_name || ''}`.trim() ||
    String(raw.username || '');

  const canHandle =
    raw.can_handle_classes !== undefined && raw.can_handle_classes !== null
      ? Boolean(raw.can_handle_classes)
      : raw.can_teach !== undefined && raw.can_teach !== null
        ? Boolean(raw.can_teach)
        : true;

  return {
    id: Number(raw.id ?? raw.user_id ?? 0),
    username: String(raw.username || ''),
    first_name: String(raw.first_name || ''),
    last_name: String(raw.last_name || ''),
    middle_name: raw.middle_name || '',
    suffix: raw.suffix || '',
    full_name: fullName,
    teacher_name: fullName,
    teacher_id: raw.teacher_id ?? null,
    employee_id: raw.employee_id || '',
    email: String(raw.email || ''),
    role,
    system_role: role,
    position: raw.position || '',
    department: raw.department ?? null,
    division: raw.division ?? null,
    contact_number: raw.contact_number || '',
    photo: raw.photo_url ?? raw.photo ?? null,
    photo_url: raw.photo_url ?? raw.photo ?? null,
    school_name: raw.school_name || '',
    qr_token: raw.qr_token ?? null,
    bound_device_id: raw.bound_device_id ?? null,
    has_bound_device: Boolean(raw.has_bound_device ?? raw.bound_device_id),
    has_biometric_enrolled: Boolean(raw.has_biometric_enrolled ?? raw.biometric_enrolled),
    can_handle_classes: canHandle,
    can_teach: canHandle,
    is_superuser: Boolean(raw.is_superuser),
    is_staff: Boolean(raw.is_staff),
  };
};

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<AuthenticatedUser | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const isRefreshingRef = useRef<boolean>(false);
  const isMountedRef = useRef<boolean>(true);
  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
      abortRef.current?.abort();
    };
  }, []);

  const refreshUser = useCallback(async () => {
    if (isRefreshingRef.current) return;
    isRefreshingRef.current = true;
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    try {
      const storedToken = await readTokenSafely();
      if (!storedToken) {
        if (isMountedRef.current) {
          setUser(null);
          setToken(null);
        }
        return;
      }

      const res = await apiClient.get(ENDPOINTS.CURRENT_USER, { signal: controller.signal });
      if (isMountedRef.current && res.data && (res.data.id || res.data.username)) {
        const normalized = normalizeUserPayload(res.data);
        setUser(normalized);
        setToken(storedToken);
        await AsyncStorage.setItem(USER_CACHE_KEY, JSON.stringify(normalized));
      }
    } catch (err: unknown) {
      const anyErr = err as { response?: { status?: number }; code?: string };
      if (anyErr?.code === 'ERR_CANCELED') return;
      const status = anyErr?.response?.status;
      if (status === 401 || status === 403) {
        await clearTokenSafely();
        if (isMountedRef.current) {
          setUser(null);
          setToken(null);
        }
      }
    } finally {
      isRefreshingRef.current = false;
    }
  }, []);

  useEffect(() => {
    const restoreSession = async () => {
      try {
        const storedToken = await readTokenSafely();
        const cachedUserStr = await AsyncStorage.getItem(USER_CACHE_KEY);

        if (isMountedRef.current && storedToken && cachedUserStr) {
          setToken(storedToken);
          setUser(normalizeUserPayload(JSON.parse(cachedUserStr)));
          setLoading(false);
          // Refresh profile silently in background so startup never blocks offline
          void refreshUser();
          return;
        }

        if (storedToken) {
          await refreshUser();
        }
      } catch {
        await clearTokenSafely();
        if (isMountedRef.current) {
          setUser(null);
          setToken(null);
        }
      } finally {
        if (isMountedRef.current) {
          setLoading(false);
        }
      }
    };

    void restoreSession();

    const unsubscribeAuthExpired = onAuthExpired(() => {
      void stopPassivePresenceTracking();
      clearTokenSafely().finally(() => {
        if (isMountedRef.current) {
          setToken(null);
          setUser(null);
        }
      });
    });

    return () => {
      unsubscribeAuthExpired();
    };
  }, [refreshUser]);

  const login = async (username: string, password: string): Promise<void> => {
    const cleanUsername = username.replace(/[\r\n\t]/g, '').trim();
    const cleanPassword = password.replace(/[\r\n\t]/g, '').trim();

    if (!cleanUsername || !cleanPassword) {
      throw new Error('Please enter both username and password.');
    }

    const res = await apiClient.post(ENDPOINTS.LOGIN, {
      username: cleanUsername,
      password: cleanPassword,
    });

    const d = res.data || {};
    // Prefer durable DRF auth token (matches LogoutView & ChangePasswordView rotation); fall back to JWT access
    const receivedToken: string | undefined = d.token || d.access || d.key;
    const receivedRefresh: string | undefined = d.refresh;
    const rawUser: Record<string, any> | undefined = d.user || (d.id || d.user_id ? d : undefined);

    if (!receivedToken || !rawUser) {
      throw new Error('Invalid response received from authentication server.');
    }

    const roleCheck = String(rawUser.role || d.role || '').trim().toUpperCase();
    if (roleCheck && !ALLOWED_ROLES.has(roleCheck)) {
      throw new Error('Only teacher and school leader accounts are allowed in AttendSure.');
    }

    const normalizedUser = normalizeUserPayload({ ...d, ...rawUser });
    await saveTokenSafely(receivedToken);
    if (receivedRefresh) {
      await AsyncStorage.setItem(REFRESH_TOKEN_KEY, receivedRefresh).catch(() => {});
    }
    await AsyncStorage.setItem(USER_CACHE_KEY, JSON.stringify(normalizedUser));

    setToken(receivedToken);
    setUser(normalizedUser);

    refreshUser().catch(() => {});
  };

  const logout = async (): Promise<void> => {
    await stopPassivePresenceTracking().catch(() => {});
    const refresh = await AsyncStorage.getItem(REFRESH_TOKEN_KEY).catch(() => null);
    await apiClient.post(ENDPOINTS.LOGOUT, refresh ? { refresh } : {}).catch(() => {});
    await clearTokenSafely();
    setToken(null);
    setUser(null);
  };

  const updateUser = async (updatedFields: Partial<AuthenticatedUser>): Promise<void> => {
    if (!user) return;
    const nextUser = { ...user, ...updatedFields };
    if ('photo_url' in updatedFields && !('photo' in updatedFields)) {
      nextUser.photo = updatedFields.photo_url ?? null;
    } else if ('photo' in updatedFields && !('photo_url' in updatedFields)) {
      nextUser.photo_url = updatedFields.photo ?? null;
    }
    setUser(nextUser);
    await AsyncStorage.setItem(USER_CACHE_KEY, JSON.stringify(nextUser));
  };

  const updateSessionToken = async (nextToken: string): Promise<void> => {
    if (!nextToken) return;
    await saveTokenSafely(nextToken);
    setToken(nextToken);
  };

  return (
    <AuthContext.Provider
      value={{
        user,
        token,
        loading,
        isLoading: loading,
        login,
        logout,
        refreshUser,
        updateUser,
        updateSessionToken,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = (): AuthContextType => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};

export default AuthContext;
