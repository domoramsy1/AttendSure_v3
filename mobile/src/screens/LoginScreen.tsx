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
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import { Ionicons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import AsyncStorage from '@react-native-async-storage/async-storage';

import { useAuth } from '../context/AuthContext';
import { apiClient } from '../api/client';
import { getServerBaseUrl } from '../services/configService';
import { registerPushTokenWithBackend } from '../services/pushService';
import { startPassivePresenceTracking } from '../services/backgroundLocation';
import { getOrCreateDeviceUuid } from '../services/deviceService';

// Direct SVG vector assets
const attendsureLogoSvg = require('../../assets/attendsure-logo.svg');
const techblazerSvg = require('../../assets/techblazer.svg');
const CACHED_SCHOOL_PROFILE_KEY = 'attendsure_cached_school_profile';

// Cybersecurity: Brute-Force lockout configuration
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
  
  // Concrete reference typed to prevent TS2339 & TS2322 in generated definitions
  const passwordInputRef = useRef<any>(null);

  // Form State
  const [username, setUsername] = useState<string>('');
  const [password, setPassword] = useState<string>('');
  const [showPassword, setShowPassword] = useState<boolean>(false);
  const [submitting, setSubmitting] = useState<boolean>(false);

  // Live System & Network State
  const [schoolInfo, setSchoolInfo] = useState<PublicSchoolProfile | null>(null);
  const [serverBase, setServerBase] = useState<string>('');
  const [serverOnline, setServerOnline] = useState<'ONLINE' | 'OFFLINE' | 'CONNECTING'>('CONNECTING');
  const [logoFailed, setLogoFailed] = useState<boolean>(false);
  const [deviceUuid, setDeviceUuid] = useState<string>('');
  const [devicePlatform] = useState<string>(
    `${Platform.OS.toUpperCase()} (${Platform.Version || 'OS'})`
  );

  // Brute-force attempt counters
  const failedAttemptsRef = useRef<number>(0);
  const lockoutUntilRef = useRef<number>(0);

  // Helper: Sanitize relative media paths to valid server URLs
  const resolvePhotoUrl = useCallback((path: string | null | undefined, base: string) => {
    if (!path) return null;
    if (path.startsWith('http://') || path.startsWith('https://') || path.startsWith('data:')) {
      return path;
    }
    const cleanBase = base.replace(/\/+$/, '');
    const cleanPath = path.startsWith('/') ? path : `/${path}`;
    return `${cleanBase}${cleanPath}`;
  }, []);

  // 1. Parallel Data Initialization (AsyncStorage + Live Backend Health)
  const initializeLoginData = useCallback(async () => {
    if (isMounted.current) {
      setServerOnline('CONNECTING');
    }

    try {
      const [cachedProfile, uuid, activeBase] = await Promise.all([
        AsyncStorage.getItem(CACHED_SCHOOL_PROFILE_KEY),
        getOrCreateDeviceUuid().catch(() => ''),
        getServerBaseUrl().catch(() => ''),
      ]);

      if (isMounted.current) {
        if (cachedProfile) {
          try {
            setSchoolInfo(JSON.parse(cachedProfile));
          } catch {
            // Ignore malformed cache
          }
        }
        if (uuid) setDeviceUuid(uuid);
        if (activeBase) setServerBase(activeBase);
      }
    } catch {
      // Continue to live check
    }

    // 3-second live server check
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 3000);

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

  // 2. Authentication with Input Sanitization & Anti-Brute-Force Guard
  const handleLogin = async () => {
    const now = Date.now();
    if (now < lockoutUntilRef.current) {
      const remainingSec = Math.ceil((lockoutUntilRef.current - now) / 1000);
      showAlert('Account Locked', `Too many failed attempts. Please wait ${remainingSec} seconds.`);
      return;
    }

    // Strip CRLF control characters to prevent header injection
    const cleanUsername = username.replace(/[\r\n\t]/g, '').trim();
    const cleanPassword = password.replace(/[\r\n]/g, '').trim();

    if (!cleanUsername || !cleanPassword) {
      showAlert('Required', 'Please enter your Employee ID or Username and Password.');
      return;
    }

    if (cleanUsername.length > 150 || cleanPassword.length > 128) {
      showAlert('Invalid Input', 'Credentials exceed the maximum permitted length.');
      return;
    }

    setSubmitting(true);
    try {
      await login(cleanUsername, cleanPassword);
      failedAttemptsRef.current = 0;

      // Start passive background services quietly
      startPassivePresenceTracking().catch(() => {});
      registerPushTokenWithBackend().catch(() => {});
    } catch (err: any) {
      failedAttemptsRef.current += 1;
      if (failedAttemptsRef.current >= MAX_FAILED_ATTEMPTS) {
        lockoutUntilRef.current = Date.now() + LOCKOUT_DURATION_MS;
      }

      const rawError = String(err?.response?.data?.error || err?.response?.data?.detail || '');
      const isInternalLeak =
        rawError.includes('Traceback') ||
        rawError.includes('django') ||
        rawError.includes('psycopg') ||
        rawError.includes('SyntaxError');

      const safeMessage = isInternalLeak
        ? 'Authentication error. Please contact your school administrator.'
        : rawError ||
          (err?.code === 'ECONNABORTED' || err?.message?.includes('Network Error')
            ? 'Cannot reach school server. Please verify your Wi-Fi or network connection.'
            : 'Invalid username or password.');

      showAlert('Login Failed', safeMessage);
    } finally {
      if (isMounted.current) {
        setSubmitting(false);
      }
    }
  };

  const rawLogoPath = schoolInfo?.school_logo || schoolInfo?.left_logo;
  const resolvedLogoUri = resolvePhotoUrl(rawLogoPath, serverBase);
  const logoSource = (resolvedLogoUri && !logoFailed) ? { uri: resolvedLogoUri } : attendsureLogoSvg;

  return (
    <SafeAreaView style={styles.container}>
      {/* Correct Expo StatusBar usage: avoids TS2769 */}
      <StatusBar style="dark" />

      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <ScrollView
          contentContainerStyle={styles.scrollContent}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          {/* Top Status Badge (Tappable to reconnect) */}
          <View style={styles.topUtilityBar}>
            <TouchableOpacity
              activeOpacity={0.75}
              onPress={initializeLoginData}
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
                {serverOnline === 'ONLINE'
                  ? 'SERVER ONLINE'
                  : serverOnline === 'OFFLINE'
                  ? 'OFFLINE • TAP TO RETRY'
                  : 'CONNECTING...'}
              </Text>
            </TouchableOpacity>
          </View>

          {/* School Header with Circular SVG Logo */}
          <View style={styles.brandSection}>
            <View style={styles.circleLogoContainer}>
              <Image
                source={logoSource}
                style={styles.logoImage}
                contentFit="contain"
                onError={() => setLogoFailed(true)}
              />
            </View>
            <Text style={styles.schoolNameText}>
              {schoolInfo?.school_name || 'Lapasan National High School'}
            </Text>
            <Text style={styles.schoolSubText}>
              {[
                schoolInfo?.school_id ? `School ID: ${schoolInfo.school_id}` : 'School ID: 55555',
                schoolInfo?.division || 'Cagayan de Oro City',
              ]
                .filter(Boolean)
                .join(' • ')}
            </Text>
          </View>

          {/* Form Card */}
          <View style={styles.loginCard}>
            <Text style={styles.cardHeaderTitle}>SIGN IN</Text>

            {/* Username Input */}
            <View style={styles.fieldGroup}>
              <Text style={styles.fieldLabel}>Employee ID / Username</Text>
              <View style={styles.inputBox}>
                <Ionicons name="person-outline" size={18} color="#64748b" style={{ marginRight: 10 }} />
                <TextInput
                  style={styles.textInput}
                  placeholder="e.g., FACULTY or Employee ID"
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

            {/* Password Input */}
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
                  placeholder="Enter your password"
                  placeholderTextColor="#94a3b8"
                  value={password}
                  onChangeText={setPassword}
                  secureTextEntry={!showPassword}
                  autoCapitalize="none"
                  maxLength={128}
                  returnKeyType="go"
                  onSubmitEditing={handleLogin}
                />
                <TouchableOpacity
                  onPress={() => setShowPassword((prev) => !prev)}
                  hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                >
                  <Ionicons
                    name={showPassword ? 'eye-off-outline' : 'eye-outline'}
                    size={18}
                    color="#64748b"
                  />
                </TouchableOpacity>
              </View>
            </View>

            {/* Submit Button */}
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
                  <Text style={styles.loginBtnText}>Sign In</Text>
                </>
              )}
            </TouchableOpacity>
          </View>

          {/* Security & TechBlazer Footer Card */}
          <View style={styles.hardwareCard}>
            <View style={styles.hardwareHeader}>
              <Ionicons name="shield-checkmark-outline" size={14} color="#004b87" />
              <Text style={styles.hardwareTitle}>DEVICE LOCK & TELEMETRY</Text>
            </View>
            <View style={styles.hardwareRow}>
              <Text style={styles.hardwareKey}>Platform:</Text>
              <Text style={styles.hardwareVal}>{devicePlatform}</Text>
            </View>
            <View style={styles.hardwareRow}>
              <Text style={styles.hardwareKey}>Hardware UUID:</Text>
              <Text style={styles.hardwareVal} numberOfLines={1}>{deviceUuid || 'Bound'}</Text>
            </View>

            <View style={styles.brandingDivider} />
            <View style={styles.techblazerBranding}>
              <Text style={styles.techblazerText}>System by</Text>
              <Image
                source={techblazerSvg}
                style={styles.techblazerLogoSmall}
                contentFit="contain"
              />
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
    paddingHorizontal: 12,
    borderRadius: 14,
    borderWidth: 1,
    gap: 6,
  },
  pillOnline: { backgroundColor: '#dcfce7', borderColor: '#bbf7d0' },
  pillOffline: { backgroundColor: '#fef2f2', borderColor: '#fecaca' },
  pillChecking: { backgroundColor: '#fffbeb', borderColor: '#fde68a' },
  statusDot: { width: 6, height: 6, borderRadius: 3 },
  connectionPillText: { fontSize: 9.5, fontWeight: '800', letterSpacing: 0.4 },

  brandSection: { alignItems: 'center', marginBottom: 20 },
  circleLogoContainer: {
    width: 104,
    height: 104,
    borderRadius: 52,
    backgroundColor: '#ffffff',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1.5,
    borderColor: '#e2e8f0',
    shadowColor: '#004b87',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.12,
    shadowRadius: 10,
    elevation: 4,
    marginBottom: 12,
    overflow: 'hidden',
  },
  logoImage: { width: 70, height: 70 },
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
    shadowColor: '#0f172a',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.04,
    shadowRadius: 6,
    elevation: 2,
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
  brandingDivider: { height: 1, backgroundColor: '#e2e8f0', marginVertical: 8 },
  techblazerBranding: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6 },
  techblazerText: { fontSize: 9.5, color: '#94a3b8', fontWeight: '600' },
  techblazerLogoSmall: { width: 70, height: 14 },
});

export default LoginScreen;