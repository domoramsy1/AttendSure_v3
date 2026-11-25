// AttendSure Mobile - Auth Service (JWT Standardized)
// File: D:\AttendSure_V3\mobile\src\services\authService.ts

/**
 * AttendSure - Authentication Storage & Session API Service
 * File: mobile/src/services/authService.ts
 */

import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  apiClient,
  clearStoredAuthTokens,
  readStoredAccessToken,
  saveAuthTokens,
} from '../api/client';
import { ENDPOINTS } from '../api/endpoints';
import { cleanText, getFriendlyErrorMessage } from '../constants/theme';

export interface UserAccount {
  id: number;
  username: string;
  email: string;
  full_name: string;
  employee_id?: string;
  role: string;
}

export interface AuthResponse {
  access: string;
  refresh?: string;
  token?: string;
  user: UserAccount;
}

const USER_KEY = 'attendsure_user_data';

function stripControlChars(value: string): string {
  return String(value || '').replace(/[\u0000-\u001F\u007F]/g, '').trim();
}

export const getStoredToken = async (): Promise<string | null> => {
  const token = await readStoredAccessToken();
  return token ? stripControlChars(token) : null;
};

export const storeAuthSession = async (
  accessToken: string,
  user: UserAccount,
  refreshToken?: string | null
): Promise<void> => {
  const safeToken = stripControlChars(accessToken);
  if (!safeToken) return;
  await saveAuthTokens(safeToken, refreshToken);
  await AsyncStorage.setItem(USER_KEY, JSON.stringify(user)).catch(() => {});
};

export const getStoredUser = async (): Promise<UserAccount | null> => {
  const raw = await AsyncStorage.getItem(USER_KEY).catch(() => null);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as UserAccount;
  } catch {
    return null;
  }
};

export const clearAuthSession = async (): Promise<void> => {
  await clearStoredAuthTokens();
  await AsyncStorage.removeItem(USER_KEY).catch(() => {});
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
