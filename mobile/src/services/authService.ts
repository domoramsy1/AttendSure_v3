// D:\AttendSure_V3\mobile\src\services\authService.ts

import { Platform } from 'react-native';
import * as SecureStore from 'expo-secure-store';
import { apiClient } from '../api/client';
import { ENDPOINTS } from '../api/endpoints';

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
      } catch {}
      return;
    }
    await SecureStore.setItemAsync(key, value);
  },

  async delete(key: string): Promise<void> {
    if (Platform.OS === 'web') {
      try {
        localStorage.removeItem(key);
      } catch {}
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