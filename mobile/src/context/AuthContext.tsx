// mobile/src/context/AuthContext.tsx

import React, { createContext, useContext, useState, useEffect, useCallback, useRef } from 'react';
import { Platform } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as SecureStore from 'expo-secure-store';
import { apiClient, AUTH_TOKEN_KEY } from '../api/client';

const USER_CACHE_KEY = 'attendsure_user_profile';

export interface AuthenticatedUser {
  id: number;
  username: string;
  first_name: string;
  last_name: string;
  full_name: string;
  faculty_name: string;
  faculty_id: string;
  email: string;
  role: string;
  system_role: string;
  contact_number?: string;
  photo?: string | null;
  school_name?: string;
  qr_token?: string | null;
  bound_device_id?: string | null;
  division?: string | null;
  department?: string | null;
  is_superuser: boolean;
  is_staff: boolean;
}

interface DeviceIdentity {
  deviceId?: string;
}

interface AuthContextType {
  user: AuthenticatedUser | null;
  token: string | null;
  loading: boolean;
  isLoading: boolean;
  deviceIdentity: DeviceIdentity | null;
  login: (username: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
  refreshUser: () => Promise<void>;
  updateUser: (updatedFields: Partial<AuthenticatedUser>) => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

const saveTokenSafely = async (token: string): Promise<void> => {
  await AsyncStorage.setItem(AUTH_TOKEN_KEY, token);
  if (Platform.OS !== 'web') {
    try {
      await SecureStore.setItemAsync(AUTH_TOKEN_KEY, token);
    } catch {
      // Ignore native keychain write errors
    }
  }
};

const clearTokenSafely = async (): Promise<void> => {
  await AsyncStorage.multiRemove([AUTH_TOKEN_KEY, USER_CACHE_KEY]);
  if (Platform.OS !== 'web') {
    try {
      await SecureStore.deleteItemAsync(AUTH_TOKEN_KEY);
    } catch {
      // Ignore native keychain delete errors
    }
  }
};

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<AuthenticatedUser | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [deviceIdentity] = useState<DeviceIdentity | null>({ deviceId: 'WEB-CLIENT-UUID' });
  const isRefreshingRef = useRef<boolean>(false);

  const refreshUser = useCallback(async () => {
    if (isRefreshingRef.current) return;
    isRefreshingRef.current = true;

    try {
      const storedToken = await AsyncStorage.getItem(AUTH_TOKEN_KEY);
      if (!storedToken) {
        setUser(null);
        setToken(null);
        return;
      }

      const res = await apiClient.get('/api/me/');
      if (res.data && res.data.id) {
        setUser(res.data);
        setToken(storedToken);
        await AsyncStorage.setItem(USER_CACHE_KEY, JSON.stringify(res.data));
      }
    } catch (err: any) {
      const status = err?.response?.status;
      if (status === 401 || status === 403) {
        await clearTokenSafely();
        setUser(null);
        setToken(null);
      }
    } finally {
      isRefreshingRef.current = false;
    }
  }, []);

  useEffect(() => {
    const restoreSession = async () => {
      try {
        const storedToken = await AsyncStorage.getItem(AUTH_TOKEN_KEY);
        const cachedUserStr = await AsyncStorage.getItem(USER_CACHE_KEY);

        if (storedToken && cachedUserStr) {
          setToken(storedToken);
          setUser(JSON.parse(cachedUserStr));
        }

        if (storedToken) {
          await refreshUser();
        }
      } catch {
        await clearTokenSafely();
        setUser(null);
        setToken(null);
      } finally {
        setLoading(false);
      }
    };

    restoreSession();
  }, [refreshUser]);

  const login = async (username: string, password: string): Promise<void> => {
    const cleanUsername = username.trim();
    const cleanPassword = password.trim();

    if (!cleanUsername || !cleanPassword) {
      throw new Error('Username and password are required.');
    }

    const res = await apiClient.post('/api/auth/login/', {
      username: cleanUsername,
      password: cleanPassword,
    });

    const receivedToken: string | undefined = res.data?.token;
    const receivedUser: AuthenticatedUser | undefined = res.data?.user;

    if (!receivedToken || !receivedUser) {
      throw new Error('Invalid response received from authentication server.');
    }

    await saveTokenSafely(receivedToken);
    await AsyncStorage.setItem(USER_CACHE_KEY, JSON.stringify(receivedUser));

    setToken(receivedToken);
    setUser(receivedUser);

    await refreshUser();
  };

  const logout = async (): Promise<void> => {
    await clearTokenSafely();
    setToken(null);
    setUser(null);
  };

  const updateUser = async (updatedFields: Partial<AuthenticatedUser>): Promise<void> => {
    if (!user) return;
    const nextUser = { ...user, ...updatedFields };
    setUser(nextUser);
    await AsyncStorage.setItem(USER_CACHE_KEY, JSON.stringify(nextUser));
  };

  return (
    <AuthContext.Provider
      value={{
        user,
        token,
        loading,
        isLoading: loading,
        deviceIdentity,
        login,
        logout,
        refreshUser,
        updateUser,
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