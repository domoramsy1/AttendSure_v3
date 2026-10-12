// mobile/src/context/AuthContext.tsx

import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { apiClient } from '../api/client';

export interface UserAccount {
  id?: number;
  user_id?: number;
  username: string;
  first_name?: string;
  last_name?: string;
  full_name?: string;
  faculty_name?: string;
  faculty_id?: string;
  email?: string;
  role?: string;
  contact_number?: string;
  qr_token?: string;
  bound_device_id?: string;
  school_name?: string;
  division?: string;
  department?: string;
  is_superuser?: boolean;
}

interface AuthContextType {
  user: UserAccount | null;
  token: string | null;
  isLoading: boolean;
  deviceIdentity: { deviceId: string };
  login: (username: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
  updateUser: (updatedFields: Partial<UserAccount>) => Promise<void>;
  refreshUser: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType>({} as AuthContextType);

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<UserAccount | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(true);

  const deviceIdentity = {
    deviceId: user?.bound_device_id || '',
  };

  // 1. Startup: Test stored token against Django before permitting entry
  useEffect(() => {
    const loadSession = async () => {
      try {
        const storedToken = await AsyncStorage.getItem('auth_token');
        if (!storedToken) {
          setUser(null);
          setToken(null);
          return;
        }

        // Validate token with Django database
        const res = await apiClient.get('/api/me/', {
          headers: { Authorization: `Token ${storedToken}` },
        });

        if (res.data && res.data.username) {
          setToken(storedToken);
          setUser(res.data);
          await AsyncStorage.setItem('auth_user', JSON.stringify(res.data));
        } else {
          throw new Error('Unverified session token');
        }
      } catch {
        // Clear unverified/stale sessions so user stays on Login
        await AsyncStorage.removeItem('auth_token');
        await AsyncStorage.removeItem('auth_user');
        setToken(null);
        setUser(null);
      } finally {
        setIsLoading(false);
      }
    };

    loadSession();
  }, []);

  // 2. Strict Database Verification
  const login = async (username: string, password: string) => {
    // This MUST reject if Django rejects the credentials
    const res = await apiClient.post('/api/auth/login/', {
      username: username.trim(),
      password: password.trim(),
    });

    const receivedToken = res.data?.token;
    const userData = res.data?.user;

    // Fail immediately if the backend did not confirm a user
    if (!receivedToken || !userData || !userData.username) {
      throw new Error('Server rejected credentials: User not found in database.');
    }

    // Only set state after receiving a valid 200 OK from Django
    setToken(receivedToken);
    setUser(userData);
    await AsyncStorage.setItem('auth_token', receivedToken);
    await AsyncStorage.setItem('auth_user', JSON.stringify(userData));
  };

  const logout = async () => {
    setToken(null);
    setUser(null);
    await AsyncStorage.removeItem('auth_token');
    await AsyncStorage.removeItem('auth_user');
  };

  const updateUser = async (updatedFields: Partial<UserAccount>) => {
    setUser((prev) => {
      if (!prev) return null;
      const firstName = updatedFields.first_name ?? prev.first_name ?? '';
      const lastName = updatedFields.last_name ?? prev.last_name ?? '';
      const fullName = `${firstName} ${lastName}`.trim() || prev.username;

      const merged: UserAccount = {
        ...prev,
        ...updatedFields,
        faculty_name: fullName,
        full_name: fullName,
      };

      AsyncStorage.setItem('auth_user', JSON.stringify(merged));
      return merged;
    });
  };

  const refreshUser = useCallback(async () => {
    try {
      const res = await apiClient.get('/api/me/');
      if (res.data) {
        await updateUser(res.data);
      }
    } catch {
      // Ignore background refresh errors
    }
  }, []);

  return (
    <AuthContext.Provider
      value={{
        user,
        token,
        isLoading,
        deviceIdentity,
        login,
        logout,
        updateUser,
        refreshUser,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => useContext(AuthContext);