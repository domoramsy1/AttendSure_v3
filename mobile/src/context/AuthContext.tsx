// AttendSure Mobile - Auth Context (JWT Access + Refresh Standardized)
// File: D:\AttendSure_V3\mobile\src\context\AuthContext.tsx

/**
 * AttendSure Mobile - Authentication Context & Session Manager
 * Stores JWT access & refresh tokens securely in expo-secure-store with silent refresh
 * and per-device refresh token revocation on sign-out.
 * File: mobile/src/context/AuthContext.tsx
 */

import React, { createContext, useContext, useState, useEffect, useCallback, useRef } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  apiClient,
  clearStoredAuthTokens,
  getValidAccessToken,
  isJwtString,
  onAuthExpired,
  readStoredRefreshToken,
  saveAuthTokens,
} from '../api/client';
import { ENDPOINTS } from '../api/endpoints';
import { stopPassivePresenceTracking } from '../services/backgroundLocation';

const USER_CACHE_KEY = 'attendsure_user_profile';
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
  has_asymmetric_key?: boolean;
  onboarding_completed?: boolean;
  onboarding_completed_at?: string | null;
  onboarding_version?: number;
  current_onboarding_version?: number;
  needs_onboarding?: boolean;
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
  updateSessionToken: (nextAccessToken: string, nextRefreshToken?: string | null) => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

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

  const onboardingCompleted = Boolean(raw.onboarding_completed);
  const onboardingVersion = Number(raw.onboarding_version ?? 0);
  const currentOnboardingVersion = Number(raw.current_onboarding_version ?? 1);
  const needsOnboarding =
    raw.needs_onboarding !== undefined && raw.needs_onboarding !== null
      ? Boolean(raw.needs_onboarding)
      : !onboardingCompleted || onboardingVersion < currentOnboardingVersion;

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
    has_asymmetric_key: Boolean(raw.has_asymmetric_key),
    onboarding_completed: onboardingCompleted,
    onboarding_completed_at: raw.onboarding_completed_at ?? null,
    onboarding_version: onboardingVersion,
    current_onboarding_version: currentOnboardingVersion,
    needs_onboarding: needsOnboarding,
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
      const validAccess = await getValidAccessToken(false);
      if (!validAccess || !isJwtString(validAccess)) {
        if (isMountedRef.current) {
          setUser(null);
          setToken(null);
        }
        return;
      }

      const res = await apiClient.get(ENDPOINTS.CURRENT_USER, { signal: controller.signal });
      if (isMountedRef.current && res.data && (res.data.id || res.data.username)) {
        const normalized = normalizeUserPayload(res.data);
        const latestAccess = (await getValidAccessToken(false)) || validAccess;
        setUser(normalized);
        setToken(latestAccess);
        await AsyncStorage.setItem(USER_CACHE_KEY, JSON.stringify(normalized));
      }
    } catch (err: unknown) {
      const anyErr = err as { response?: { status?: number }; code?: string };
      if (anyErr?.code === 'ERR_CANCELED') return;
      const status = anyErr?.response?.status;
      if (status === 401 || status === 403) {
        await clearStoredAuthTokens();
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
        const storedAccess = await getValidAccessToken(false);
        const cachedUserStr = await AsyncStorage.getItem(USER_CACHE_KEY);

        if (isMountedRef.current && storedAccess && isJwtString(storedAccess) && cachedUserStr) {
          setToken(storedAccess);
          setUser(normalizeUserPayload(JSON.parse(cachedUserStr)));
          setLoading(false);
          void refreshUser();
          return;
        }

        if (storedAccess && isJwtString(storedAccess)) {
          await refreshUser();
        } else if (storedAccess) {
          // Migrate legacy non-JWT sessions cleanly by prompting a fresh JWT sign-in
          await clearStoredAuthTokens();
        }
      } catch {
        await clearStoredAuthTokens();
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
      clearStoredAuthTokens().finally(() => {
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
    // Standardized on JWT access + refresh tokens
    const receivedAccess: string | undefined = d.access || d.token;
    const receivedRefresh: string | undefined = d.refresh;
    const rawUser: Record<string, any> | undefined = d.user || (d.id || d.user_id ? d : undefined);

    if (!receivedAccess || !isJwtString(receivedAccess) || !rawUser) {
      throw new Error('Invalid response received from authentication server.');
    }

    const roleCheck = String(rawUser.role || d.role || '').trim().toUpperCase();
    if (roleCheck && !ALLOWED_ROLES.has(roleCheck)) {
      throw new Error('Only teacher and school leader accounts are allowed in AttendSure.');
    }

    const normalizedUser = normalizeUserPayload({ ...d, ...rawUser });
    await saveAuthTokens(receivedAccess, receivedRefresh);
    await AsyncStorage.setItem(USER_CACHE_KEY, JSON.stringify(normalizedUser));

    setToken(receivedAccess);
    setUser(normalizedUser);

    refreshUser().catch(() => {});
  };

  const logout = async (): Promise<void> => {
    await stopPassivePresenceTracking().catch(() => {});
    const refresh = await readStoredRefreshToken().catch(() => null);

    // LogoutView allows revoking the device's refresh token even if the access token expired
    await apiClient
      .post(ENDPOINTS.LOGOUT, {
        ...(refresh ? { refresh } : {}),
      })
      .catch(() => {});

    await clearStoredAuthTokens();
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

  const updateSessionToken = async (
    nextAccessToken: string,
    nextRefreshToken?: string | null
  ): Promise<void> => {
    if (!nextAccessToken) return;
    await saveAuthTokens(nextAccessToken, nextRefreshToken);
    setToken(nextAccessToken);
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
