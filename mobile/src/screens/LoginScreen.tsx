// D:\AttendSure_V3\mobile\src\screens\LoginScreen.tsx

import React, { useState, useEffect, useCallback, useRef } from 'react';
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
import { apiClient } from '../api/client';
import { getServerBaseUrl } from '../services/configService';
import { registerPushTokenWithBackend } from '../services/pushService';
import { startPassivePresenceTracking } from '../services/backgroundLocation';
import { getOrCreateDeviceUuid } from '../services/deviceService';

const fallbackLogo = require('../../assets/attendsure-logo.svg');
const CACHED_SCHOOL_PROFILE_KEY = 'attendsure_cached_school_profile';

// Cybersecurity: Max failed attempts before temporary lockout
const MAX_FAILED_ATTEMPTS = 5;
const LOCKOUT_DURATION_MS = 30000;

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
  const isMounted = useRef<boolean>(true);
  const passwordInputRef = useRef<TextInput>(null);

  // Form State
  const [username, setUsername] = useState<string>('');
  const [password, setPassword] = useState<string>('');
  const [showPassword, setShowPassword] = useState<boolean>(false);
  const [submitting, setSubmitting] = useState<boolean>(false);

  // System & Network State
  const [schoolInfo, setSchoolInfo] = useState<PublicSchoolProfile | null>(null);
  const [serverBase, setServerBase] = useState<string>('');
  const [serverOnline, setServerOnline] = useState<'ONLINE' | 'OFFLINE' | 'CONNECTING'>('CONNECTING');
  const [logoFailed, setLogoFailed] = useState<boolean>(false);
  const [deviceUuid, setDeviceUuid] = useState<string>('');
  const [devicePlatform] = useState<string>(
    `${Platform.OS.toUpperCase()} (${Platform.Version || 'OS'})`
  );

  // Cybersecurity: Brute-Force Throttling
  const failedAttemptsRef = useRef<number>(0);
  const lockoutUntilRef = useRef<number>(0);

  // Helper: Safely resolve relative media URLs to full server endpoints
  const resolvePhotoUrl = useCallback((path: string | null | undefined, base: string) => {
    if (!path) return null;
    if (path.startsWith('http://') || path.startsWith('https://') || path.startsWith('data:')) {
      return path;
    }
    const cleanBase = base.replace(/\/+$/, '');
    const cleanPath = path.startsWith('/') ? path : `/${path}`;
    return `${cleanBase}${cleanPath}`;
  }, []);

  // 1. Fast Concurrent Boot: Loads cache, server URL, and hardware UUID in parallel
  const initializeLoginData = useCallback(async () => {
    try {
      const [cachedProfile, uuid, activeBase] = await Promise.all([
        AsyncStorage.getItem(CACHED_SCHOOL_PROFILE_KEY),
        getOrCreateDeviceUuid(),
        getServerBaseUrl(),
      ]);

      if (isMounted.current) {
        if (cachedProfile) setSchoolInfo(JSON.parse(cachedProfile));
        if (uuid) setDeviceUuid(uuid);
        if (activeBase) setServerBase(activeBase);
      }
    } catch {
      // Continue to live network check
    }

    // Fast 4-second live school profile verification
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 4000);

    try {
      const res = await apiClient.get('/settings/school/', {
        signal: controller.signal,
      });

      if (isMounted.current && res.data) {
        setSchoolInfo(res.data);
        setServerOnline('ONLINE');
        await AsyncStorage.setItem(CACHED_SCHOOL_PROFILE_KEY, JSON.stringify(res.data));
      }
    } catch {
      if (isMounted.current) {
        setServerOnline('OFFLINE');
      }
    } finally {
      clearTimeout(timer);
    }
  }, []);

  useEffect(() => {
    isMounted.current = true;
    initializeLoginData();

    return () => {
      isMounted.current = false;
    };
  }, [initializeLoginData]);

  // 2. Hardened Authentication Handler with Brute-Force Throttling
  const handleLogin = async () => {
    // Check brute-force lockout
    const now = Date.now();
    if (now < lockoutUntilRef.current) {
      const remainingSec = Math.ceil((lockoutUntilRef.current - now) / 1000);
      showAlert('Account Locked', `Too many failed attempts. Please wait ${remainingSec}s.`);
      return;
    }

    // Sanitize control characters to prevent injection
    const cleanUsername = username.replace(/[\r\n\t]/g, '').trim();
    const cleanPassword = password.replace(/[\r\n]/g, '').trim();

    if (!cleanUsername || !cleanPassword) {
      showAlert('Required', 'Please enter your username and password.');
      return;
    }

    if (cleanUsername.length > 150 || cleanPassword.length > 128) {
      showAlert('Invalid Input', 'Credentials exceed maximum permitted length.');
      return;
    }

    setSubmitting(true);
    try {
      // Authenticate directly with PostgreSQL
      await login(cleanUsername, cleanPassword);

      // Reset failure counter on successful login
      failedAttemptsRef.current = 0;

      // Start background services quietly without blocking navigation
      startPassivePresenceTracking().catch(() => {});
      registerPushTokenWithBackend().catch(() => {});
    } catch (err: any) {
      // Increment failure count
      failedAttemptsRef.current += 1;
      if (failedAttemptsRef.current >= MAX_FAILED_ATTEMPTS) {
        lockoutUntilRef.current = Date.now() + LOCKOUT_DURATION_MS;
      }

      // Cybersecurity: Sanitize backend error to prevent database or stack trace exposure
      const rawError = String(
        err?.response?.data?.error ||
        err?.response?.data?.detail ||
        ''
      );

      const isInternalLeak =
        rawError.includes('Traceback') ||
        rawError.includes('django') ||
        rawError.includes('psycopg') ||
        rawError.includes('SyntaxError');

      const safeMessage = isInternalLeak
        ? 'Authentication error. Please contact your school administrator.'
        : rawError ||
          (err?.code === 'ECONNABORTED' || err?.message?.includes('Network Error')
            ? 'Cannot reach server. Please check your internet connection.'
            : 'Invalid username or password.');

      showAlert('Login Failed', safeMessage);
    } finally {
      if (isMounted.current) {
        setSubmitting(false);
      }
    }
  };

  // Resolve logo source with automatic fallback to local vector asset
  const rawLogoPath = schoolInfo?.school_logo || schoolInfo?.left_logo;
  const resolvedLogoUri = resolvePhotoUrl(rawLogoPath, serverBase);
  const logoSource = (resolvedLogoUri && !logoFailed) ? { uri: resolvedLogoUri } : fallbackLogo;

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
          {/* Top Status Badge */}
          <View style={styles.topUtilityBar}>
            <View
              style={[
                styles.connectionPill,
                serverOnline === 'ONLINE'
                  ? styles.pillOnline
                  : serverOnline === 'OFFLINE'
                  ? styles.pillOffline
                  : styles.pillChecking,
              ]}
            >
              <View
                style={[
                  styles.statusDot,
                  {
                    backgroundColor:
                      serverOnline === 'ONLINE'
                        ? '#16a34a'
                        : serverOnline === 'OFFLINE'
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
                      serverOnline === 'ONLINE'
                        ? '#15803d'
                        : serverOnline === 'OFFLINE'
                        ? '#b91c1c'
                        : '#b45309',
                  },
                ]}
              >
                {serverOnline}
              </Text>
            </View>
          </View>

          {/* School Header */}
          <View style={styles.brandSection}>
            <Image
              source={logoSource}
              style={styles.logoImage}
              contentFit="contain"
              onError={() => setLogoFailed(true)}
            />
            <Text style={styles.schoolNameText}>
              {schoolInfo?.school_name || 'AttendSure'}
            </Text>
            <Text style={styles.schoolSubText}>
              {[
                schoolInfo?.school_id ? `ID: ${schoolInfo.school_id}` : '',
                schoolInfo?.division || 'Campus Portal',
              ]
                .filter(Boolean)
                .join(' • ')}
            </Text>
          </View>

          {/* Login Card */}
          <View style={styles.loginCard}>
            <Text style={styles.cardHeaderTitle}>SIGN IN</Text>

            {/* Username Field */}
            <View style={styles.fieldGroup}>
              <Text style={styles.fieldLabel}>Username</Text>
              <View style={styles.inputBox}>
                <Ionicons name="person-outline" size={18} color="#64748b" style={{ marginRight: 10 }} />
                <TextInput
                  style={styles.textInput}
                  placeholder="Username or ID"
                  placeholderTextColor="#94a3b8"
                  value={username}
                  onChangeText={setUsername}
                  autoCapitalize="none"
                  autoCorrect={false}
                  maxLength={150}
                  returnKeyType="next"
                  onSubmitEditing={() => passwordInputRef.current?.focus()}
                  blurOnSubmit={false}
                />
              </View>
            </View>

            {/* Password Field */}
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
                  ref={passwordInputRef}
                  style={styles.textInput}
                  placeholder="Password"
                  placeholderTextColor="#94a3b8"
                  value={password}
                  onChangeText={setPassword}
                  secureTextEntry={!showPassword}
                  autoCapitalize="none"
                  maxLength={128}
                  returnKeyType="go"
                  onSubmitEditing={handleLogin}
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

            {/* Login Action */}
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
                  <Ionicons name="log-in-outline" size={18} color="#ffffff" />
                  <Text style={styles.loginBtnText}>Login</Text>
                </>
              )}
            </TouchableOpacity>
          </View>

          {/* Hardware ID Footer */}
          <View style={styles.hardwareCard}>
            <View style={styles.hardwareHeader}>
              <Ionicons name="hardware-chip-outline" size={14} color="#004b87" />
              <Text style={styles.hardwareTitle}>DEVICE ID</Text>
            </View>
            <View style={styles.hardwareRow}>
              <Text style={styles.hardwareKey}>Platform:</Text>
              <Text style={styles.hardwareVal}>{devicePlatform}</Text>
            </View>
            <View style={styles.hardwareRow}>
              <Text style={styles.hardwareKey}>UUID:</Text>
              <Text style={styles.hardwareVal} numberOfLines={1}>{deviceUuid || 'Ready'}</Text>
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
    marginBottom: 16,
  },
  connectionPill: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 4,
    paddingHorizontal: 10,
    borderRadius: 12,
    borderWidth: 1,
    gap: 5,
  },
  pillOnline: { backgroundColor: '#dcfce7', borderColor: '#bbf7d0' },
  pillOffline: { backgroundColor: '#fef2f2', borderColor: '#fecaca' },
  pillChecking: { backgroundColor: '#fffbeb', borderColor: '#fde68a' },
  statusDot: { width: 6, height: 6, borderRadius: 3 },
  connectionPillText: { fontSize: 9.5, fontWeight: '800', letterSpacing: 0.4 },
  brandSection: { alignItems: 'center', marginBottom: 20 },
  logoImage: { width: 64, height: 64, borderRadius: 14, marginBottom: 10 },
  schoolNameText: {
    fontSize: 18,
    fontWeight: '900',
    color: '#003460',
    textAlign: 'center',
    letterSpacing: -0.3,
  },
  schoolSubText: { fontSize: 11, color: '#64748b', textAlign: 'center', marginTop: 3 },
  loginCard: {
    backgroundColor: '#ffffff',
    borderRadius: 16,
    padding: 18,
    borderWidth: 1,
    borderColor: '#e2e8f0',
    marginBottom: 14,
  },
  cardHeaderTitle: {
    fontSize: 11,
    fontWeight: '800',
    color: '#004b87',
    letterSpacing: 0.5,
    marginBottom: 12,
  },
  fieldGroup: { marginBottom: 12 },
  fieldLabel: { fontSize: 11, fontWeight: '700', color: '#334155', marginBottom: 5 },
  inputBox: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#f8fafc',
    borderWidth: 1,
    borderColor: '#cbd5e1',
    borderRadius: 10,
    paddingHorizontal: 12,
    height: 44,
  },
  textInput: { flex: 1, fontSize: 13, color: '#0f172a' },
  loginBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#004b87',
    height: 44,
    borderRadius: 10,
    marginTop: 4,
    gap: 6,
  },
  loginBtnText: { color: '#ffffff', fontSize: 13, fontWeight: '800' },
  hardwareCard: {
    backgroundColor: '#f1f5f9',
    borderRadius: 12,
    padding: 12,
    borderWidth: 1,
    borderColor: '#e2e8f0',
  },
  hardwareHeader: { flexDirection: 'row', alignItems: 'center', gap: 5, marginBottom: 6 },
  hardwareTitle: { fontSize: 9, fontWeight: '800', color: '#004b87', letterSpacing: 0.4 },
  hardwareRow: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 2 },
  hardwareKey: { fontSize: 10, fontWeight: '600', color: '#64748b' },
  hardwareVal: { fontSize: 10, fontWeight: '800', color: '#334155' },
});

export default LoginScreen;