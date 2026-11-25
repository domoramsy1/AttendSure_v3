/**
 * AttendSure - Authentication Storage & Session API Service
 * File: mobile/src/services/authService.ts
 */

import { Platform } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import type * as SecureStoreType from 'expo-secure-store';
import { apiClient } from '../api/client';
import { ENDPOINTS } from '../api/endpoints';
import { cleanText, getFriendlyErrorMessage } from '../constants/theme';

let cachedSecureStore: typeof SecureStoreType | null | undefined;
const getSecureStore = (): typeof SecureStoreType | null => {
  if (cachedSecureStore !== undefined) return cachedSecureStore;
  if (Platform.OS === 'web') {
    cachedSecureStore = null;
    return null;
  }
  try {
    cachedSecureStore = require('expo-secure-store') as typeof SecureStoreType;
  } catch {
    cachedSecureStore = null;
  }
  return cachedSecureStore;
};

export interface UserAccount {
  id: number;
  username: string;
  email: string;
  full_name: string;
  employee_id?: string;
  role: string;
}

export interface AuthResponse {
  token: string;
  user: UserAccount;
}

const TOKEN_KEY = 'attendsure_auth_token';
const USER_KEY = 'attendsure_user_data';

function stripControlChars(value: string): string {
  return String(value || '').replace(/[\u0000-\u001F\u007F]/g, '').trim();
}

const safeStorage = {
  async get(key: string): Promise<string | null> {
    if (Platform.OS === 'web') {
      try {
        return typeof localStorage !== 'undefined' ? localStorage.getItem(key) : null;
      } catch {
        return null;
      }
    }
    const store = getSecureStore();
    if (store) {
      try {
        const val = await store.getItemAsync(key);
        if (val !== null) return val;
      } catch {}
    }
    try {
      return await AsyncStorage.getItem(key);
    } catch {
      return null;
    }
  },

  async set(key: string, value: string): Promise<void> {
    if (Platform.OS === 'web') {
      try {
        if (typeof localStorage !== 'undefined') {
          localStorage.setItem(key, value);
        }
      } catch {}
      return;
    }
    const store = getSecureStore();
    if (store) {
      try {
        await store.setItemAsync(key, value);
      } catch {}
    }
    try {
      await AsyncStorage.setItem(key, value);
    } catch {}
  },

  async delete(key: string): Promise<void> {
    if (Platform.OS === 'web') {
      try {
        if (typeof localStorage !== 'undefined') {
          localStorage.removeItem(key);
        }
      } catch {}
      return;
    }
    const store = getSecureStore();
    if (store) {
      try {
        await store.deleteItemAsync(key);
      } catch {}
    }
    try {
      await AsyncStorage.removeItem(key);
    } catch {}
  },
};

export const getStoredToken = async (): Promise<string | null> => {
  const token = await safeStorage.get(TOKEN_KEY);
  return token ? stripControlChars(token) : null;
};

export const storeAuthSession = async (token: string, user: UserAccount): Promise<void> => {
  const safeToken = stripControlChars(token);
  if (!safeToken) return;
  await safeStorage.set(TOKEN_KEY, safeToken);
  await safeStorage.set(USER_KEY, JSON.stringify(user));
  apiClient.defaults.headers.common['Authorization'] = `Token ${safeToken}`;
};

export const getStoredUser = async (): Promise<UserAccount | null> => {
  const raw = await safeStorage.get(USER_KEY);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as UserAccount;
  } catch {
    return null;
  }
};

export const clearAuthSession = async (): Promise<void> => {
  await safeStorage.delete(TOKEN_KEY);
  await safeStorage.delete(USER_KEY);
  delete apiClient.defaults.headers.common['Authorization'];
};

export const loginApi = async (
  username: string,
  password: string,
  signal?: AbortSignal
): Promise<AuthResponse> => {
  const safeUsername = cleanText(username, 150);
  const safePassword = stripControlChars(password);

  if (!safeUsername || !safePassword) {
    throw new Error('Please enter both username and password.');
  }

  try {
    const response = await apiClient.post<AuthResponse>(
      ENDPOINTS.LOGIN,
      {
        username: safeUsername,
        password: safePassword,
      },
      { signal }
    );
    return response.data;
  } catch (err: unknown) {
    throw new Error(
      getFriendlyErrorMessage(err, 'Unable to sign in. Please check your username and password.')
    );
  }
};

export const fetchCurrentProfile = async (signal?: AbortSignal): Promise<UserAccount> => {
  try {
    const response = await apiClient.get<UserAccount>(ENDPOINTS.CURRENT_USER, { signal });
    return response.data;
  } catch (err: unknown) {
    throw new Error(
      getFriendlyErrorMessage(err, 'Could not load your account profile right now.')
    );
  }
};
