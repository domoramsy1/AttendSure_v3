// AttendSure - Mobile Authentication Service
// File: mobile/src/services/authService.ts

import { Platform } from 'react-native';
import * as SecureStore from 'expo-secure-store';
import { apiClient } from '../api/client';
import { ENDPOINTS } from '../api/endpoints';
import { AuthResponse, UserAccount } from '../types';

const TOKEN_KEY = 'attendsure_auth_token';
const USER_KEY = 'attendsure_user_data';

// Web and native safe storage adapter
const safeStorage = {
  async get(key: string): Promise<string | null> {
    if (Platform.OS === 'web') {
      try {
        return localStorage.getItem(key);
      } catch {
        return null;
      }
    }
    return await SecureStore.getItemAsync(key);
  },

  async set(key: string, value: string): Promise<void> {
    if (Platform.OS === 'web') {
      try {
        localStorage.setItem(key, value);
      } catch {
        // Fallback for private browsing
      }
      return;
    }
    await SecureStore.setItemAsync(key, value);
  },

  async delete(key: string): Promise<void> {
    if (Platform.OS === 'web') {
      try {
        localStorage.removeItem(key);
      } catch {
        // Fallback
      }
      return;
    }
    await SecureStore.deleteItemAsync(key);
  },
};

export const getStoredToken = async (): Promise<string | null> => {
  return await safeStorage.get(TOKEN_KEY);
};

export const storeAuthSession = async (token: string, user: UserAccount): Promise<void> => {
  await safeStorage.set(TOKEN_KEY, token);
  await safeStorage.set(USER_KEY, JSON.stringify(user));
  apiClient.defaults.headers.common['Authorization'] = `Token ${token}`;
};

export const getStoredUser = async (): Promise<UserAccount | null> => {
  const raw = await safeStorage.get(USER_KEY);
  if (!raw) return null;
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
};

export const clearAuthSession = async (): Promise<void> => {
  await safeStorage.delete(TOKEN_KEY);
  await safeStorage.delete(USER_KEY);
  delete apiClient.defaults.headers.common['Authorization'];
};

export const loginApi = async (username: string, password: string): Promise<AuthResponse> => {
  const response = await apiClient.post<AuthResponse>(ENDPOINTS.LOGIN, {
    username,
    password,
  });
  return response.data;
};

export const fetchCurrentProfile = async (): Promise<UserAccount> => {
  const response = await apiClient.get<UserAccount>(ENDPOINTS.CURRENT_USER);
  return response.data;
};