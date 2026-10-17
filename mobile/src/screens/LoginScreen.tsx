// mobile/src/screens/LoginScreen.tsx

import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TextInput,
  TouchableOpacity,
  ActivityIndicator,
  Alert,
  ScrollView,
  KeyboardAvoidingView,
  Platform,
  StatusBar,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import AsyncStorage from '@react-native-async-storage/async-storage';

import { useAuth } from '../context/AuthContext';
import defaultApiClient, { apiClient as namedClient } from '../api/client';
import { registerPushTokenWithBackend } from '../services/pushService';
import { startPassivePresenceTracking } from '../services/backgroundLocation';
import { getOrCreateDeviceUuid } from '../services/deviceService';

const client = defaultApiClient || namedClient;

const fallbackLogo = require('../../assets/attendsure-logo.svg');
const CACHED_SCHOOL_PROFILE_KEY = 'attendsure_cached_school_profile';

interface PublicSchoolProfile {
  school_id?: string;
  school_name?: string;
  division?: string;
  region?: string;
  school_logo?: string | null;
  left_logo?: string | null;
}

const showAlert = (title: string, message: string) => {
  if (Platform.OS === 'web' && typeof window !== 'undefined') {
    window.alert(`${title}: ${message}`);
  } else {
    Alert.alert(title, message);
  }
};

export const LoginScreen: React.FC = () => {
  const { login } = useAuth();

  const [username, setUsername] = useState<string>('');
  const [password, setPassword] = useState<string>('');
  const [showPassword, setShowPassword] = useState<boolean>(false);
  const [submitting, setSubmitting] = useState<boolean>(false);

  const [schoolInfo, setSchoolInfo] = useState<PublicSchoolProfile | null>(null);
  const [serverReachable, setServerReachable] = useState<boolean | null>(null);
  const [deviceUuid, setDeviceUuid] = useState<string>('');
  const [devicePlatform] = useState<string>(
    `${Platform.OS.toUpperCase()} (${Platform.Version || 'OS'})`
  );

  // Fast data fetching: Loads cached profile immediately, then syncs with server
  const loadSchoolProfile = useCallback(async () => {
    try {
      const cached = await AsyncStorage.getItem(CACHED_SCHOOL_PROFILE_KEY);
      if (cached) {
        setSchoolInfo(JSON.parse(cached));
      }
    } catch {
      // Continue to network fetch if local cache is empty
    }

    try {
      const res = await client.get('/api/settings/school/', { timeout: 3500 });
      if (res && res.data) {
        setSchoolInfo(res.data);
        setServerReachable(true);
        await AsyncStorage.setItem(CACHED_SCHOOL_PROFILE_KEY, JSON.stringify(res.data));
      }
    } catch {
      setServerReachable(false);
    }
  }, []);

  useEffect(() => {
    getOrCreateDeviceUuid().then(setDeviceUuid);
    loadSchoolProfile();
  }, [loadSchoolProfile]);

  const handleLogin = async () => {
    const cleanUsername = username.trim();
    const cleanPassword = password.trim();

    if (!cleanUsername || !cleanPassword) {
      showAlert('Missing Credentials', 'Please enter your username and password.');
      return;
    }

    setSubmitting(true);
    try {
      // 1. Authenticate with backend database
      await login(cleanUsername, cleanPassword);

      // 2. Automatically start live background GPS tracking (Zero button clicks needed)
      startPassivePresenceTracking().catch((gpsErr) => {
        console.warn('[LoginScreen] Background GPS start notice:', gpsErr?.message || gpsErr);
      });

      // 3. Register device push token for Gate turnstile wake-up signals
      registerPushTokenWithBackend().catch((pushErr) => {
        console.warn('[LoginScreen] Push token registration notice:', pushErr?.message || pushErr);
      });
    } catch (err: any) {
      const serverError =
        err?.response?.data?.error ||
        err?.response?.data?.detail ||
        (err?.code === 'ECONNABORTED' || err?.code === 'ERR_NETWORK' || err?.message?.includes('Network Error')
          ? 'Cannot reach AttendSure server. Please check your internet connection.'
          : err?.message || 'Authentication failed. Please verify your credentials.');
      showAlert('Login Failed', serverError);
    } finally {
      setSubmitting(false);
    }
  };

  const logoSource =
    schoolInfo?.school_logo || schoolInfo?.left_logo
      ? { uri: (schoolInfo.school_logo || schoolInfo.left_logo) as string }
      : fallbackLogo;

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar barStyle="dark-content" backgroundColor="#f8fafc" />

      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <ScrollView
          contentContainerStyle={styles.scrollContent}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          {/* Top Bar with Live Server Status */}
          <View style={styles.topUtilityBar}>
            <View
              style={[
                styles.connectionPill,
                serverReachable === true
                  ? styles.pillOnline
                  : serverReachable === false
                  ? styles.pillOffline
                  : styles.pillChecking,
              ]}
            >
              <View
                style={[
                  styles.statusDot,
                  {
                    backgroundColor:
                      serverReachable === true
                        ? '#16a34a'
                        : serverReachable === false
                        ? '#dc2626'
                        : '#d97706',
                  },
                ]}
              />
              <Text
                style={[
                  styles.connectionPillText,
                  {
                    color:
                      serverReachable === true
                        ? '#15803d'
                        : serverReachable === false
                        ? '#b91c1c'
                        : '#b45309',
                  },
                ]}
              >
                {serverReachable === true
                  ? 'DATABASE ONLINE'
                  : serverReachable === false
                  ? 'SERVER UNREACHABLE'
                  : 'CONNECTING TO CLOUD...'}
              </Text>
            </View>
          </View>

          {/* Institutional Branding Header */}
          <View style={styles.brandSection}>
            <Image source={logoSource} style={styles.logoImage} contentFit="contain" />
            <Text style={styles.schoolNameText}>
              {schoolInfo?.school_name || 'AttendSure Campus Portal'}
            </Text>
            {schoolInfo?.division || schoolInfo?.school_id ? (
              <Text style={styles.schoolSubText}>
                {[
                  schoolInfo?.school_id ? `School ID: ${schoolInfo.school_id}` : '',
                  schoolInfo?.division || '',
                ]
                  .filter(Boolean)
                  .join(' • ')}
              </Text>
            ) : (
              <Text style={styles.schoolSubText}>
                IoT Gate & Classroom Attendance Management System
              </Text>
            )}
          </View>

          {/* Login Form Card */}
          <View style={styles.loginCard}>
            <Text style={styles.cardHeaderTitle}>FACULTY & ADMIN SIGN IN</Text>

            <View style={styles.fieldGroup}>
              <Text style={styles.fieldLabel}>Username / Employee ID</Text>
              <View style={styles.inputBox}>
                <Ionicons name="person-outline" size={18} color="#64748b" style={{ marginRight: 10 }} />
                <TextInput
                  style={styles.textInput}
                  placeholder="Enter your registered username"
                  placeholderTextColor="#94a3b8"
                  value={username}
                  onChangeText={setUsername}
                  autoCapitalize="none"
                  autoCorrect={false}
                />
              </View>
            </View>

            <View style={styles.fieldGroup}>
              <Text style={styles.fieldLabel}>Password</Text>
              <View style={styles.inputBox}>
                <Ionicons
                  name="lock-closed-outline"
                  size={18}
                  color="#64748b"
                  style={{ marginRight: 10 }}
                />
                <TextInput
                  style={styles.textInput}
                  placeholder="Enter your password"
                  placeholderTextColor="#94a3b8"
                  value={password}
                  onChangeText={setPassword}
                  secureTextEntry={!showPassword}
                  autoCapitalize="none"
                />
                <TouchableOpacity onPress={() => setShowPassword((prev) => !prev)}>
                  <Ionicons
                    name={showPassword ? 'eye-off-outline' : 'eye-outline'}
                    size={18}
                    color="#64748b"
                  />
                </TouchableOpacity>
              </View>
            </View>

            <TouchableOpacity
              style={[styles.loginBtn, submitting && { opacity: 0.65 }]}
              onPress={handleLogin}
              disabled={submitting}
              activeOpacity={0.85}
            >
              {submitting ? (
                <ActivityIndicator size="small" color="#ffffff" />
              ) : (
                <>
                  <Ionicons name="shield-checkmark-outline" size={18} color="#ffffff" />
                  <Text style={styles.loginBtnText}>Log In</Text>
                </>
              )}
            </TouchableOpacity>
          </View>

          {/* Hardware Identity Card for Telemetry Binding */}
          <View style={styles.hardwareCard}>
            <View style={styles.hardwareHeader}>
              <Ionicons name="hardware-chip-outline" size={15} color="#004b87" />
              <Text style={styles.hardwareTitle}>REGISTERED HARDWARE IDENTITY</Text>
            </View>
            <View style={styles.hardwareRow}>
              <Text style={styles.hardwareKey}>Runtime Platform:</Text>
              <Text style={styles.hardwareVal}>{devicePlatform}</Text>
            </View>
            <View style={styles.hardwareRow}>
              <Text style={styles.hardwareKey}>Hardware UUID:</Text>
              <Text style={styles.hardwareVal}>{deviceUuid || 'Initializing...'}</Text>
            </View>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f8fafc' },
  scrollContent: {
    flexGrow: 1,
    paddingHorizontal: 20,
    paddingVertical: 16,
    justifyContent: 'center',
  },
  topUtilityBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 20,
  },
  connectionPill: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 6,
    paddingHorizontal: 12,
    borderRadius: 14,
    borderWidth: 1,
    gap: 6,
  },
  pillOnline: { backgroundColor: '#dcfce7', borderColor: '#bbf7d0' },
  pillOffline: { backgroundColor: '#fef2f2', borderColor: '#fecaca' },
  pillChecking: { backgroundColor: '#fffbeb', borderColor: '#fde68a' },
  statusDot: { width: 7, height: 7, borderRadius: 3.5 },
  connectionPillText: { fontSize: 10, fontWeight: '800', letterSpacing: 0.4 },
  brandSection: { alignItems: 'center', marginBottom: 24 },
  logoImage: { width: 68, height: 68, borderRadius: 14, marginBottom: 12 },
  schoolNameText: {
    fontSize: 19,
    fontWeight: '900',
    color: '#003460',
    textAlign: 'center',
    letterSpacing: -0.3,
  },
  schoolSubText: { fontSize: 11.5, color: '#64748b', textAlign: 'center', marginTop: 4 },
  loginCard: {
    backgroundColor: '#ffffff',
    borderRadius: 18,
    padding: 20,
    borderWidth: 1,
    borderColor: '#e2e8f0',
    marginBottom: 16,
  },
  cardHeaderTitle: {
    fontSize: 11,
    fontWeight: '800',
    color: '#004b87',
    letterSpacing: 0.5,
    marginBottom: 14,
  },
  fieldGroup: { marginBottom: 14 },
  fieldLabel: { fontSize: 11.5, fontWeight: '700', color: '#334155', marginBottom: 6 },
  inputBox: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#f8fafc',
    borderWidth: 1.2,
    borderColor: '#cbd5e1',
    borderRadius: 12,
    paddingHorizontal: 12,
    height: 46,
  },
  textInput: { flex: 1, fontSize: 13.5, color: '#0f172a' },
  loginBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#004b87',
    height: 48,
    borderRadius: 12,
    marginTop: 6,
    gap: 8,
  },
  loginBtnText: { color: '#ffffff', fontSize: 13.5, fontWeight: '800' },
  hardwareCard: {
    backgroundColor: '#f1f5f9',
    borderRadius: 14,
    padding: 14,
    borderWidth: 1,
    borderColor: '#e2e8f0',
  },
  hardwareHeader: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 8 },
  hardwareTitle: { fontSize: 9.5, fontWeight: '800', color: '#004b87', letterSpacing: 0.4 },
  hardwareRow: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 3 },
  hardwareKey: { fontSize: 10.5, fontWeight: '600', color: '#64748b' },
  hardwareVal: { fontSize: 10.5, fontWeight: '800', color: '#334155' },
});

export default LoginScreen;