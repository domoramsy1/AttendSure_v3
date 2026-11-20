/**
 * AttendSure Mobile - Sign-In Screen
 * File: mobile/src/screens/LoginScreen.tsx
 */

import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  View,
  Text,
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
import { useThemeMode } from '../context/ThemeContext';
import { AttendSureLogo, TechBlazerLogo } from '../branding/BrandLogos';
import { ServerConfigModal } from '../components/ServerConfigModal';
import { isSafeUrl, cleanText, getFriendlyErrorMessage } from '../constants/theme';
import { apiClient } from '../api/client';
import { resolveFastestServer, invalidateServerCache } from '../services/configService';
import { registerPushTokenWithBackend } from '../services/pushService';
import { startPassivePresenceTracking } from '../services/backgroundLocation';

const SCHOOL_CACHE_KEY = 'attendsure_cached_school_profile';
const MAX_ATTEMPTS = 5;
const LOCKOUT_MS = 30000;

interface PublicSchoolBranding {
  school_name?: string;
  school_id?: string;
  division?: string;
  school_logo?: string | null;
  left_logo?: string | null;
}

const isCanceledError = (err: unknown): boolean => {
  const e = err as { code?: string; name?: string };
  return e?.code === 'ERR_CANCELED' || e?.name === 'CanceledError' || e?.name === 'AbortError';
};

export const LoginScreen: React.FC = () => {
  const { login } = useAuth();
  const { palette, fonts, ui, isDark, toggleDarkMode } = useThemeMode();

  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);

  const [school, setSchool] = useState<PublicSchoolBranding | null>(null);
  const [serverBase, setServerBase] = useState('');
  const [status, setStatus] = useState<'ONLINE' | 'OFFLINE' | 'CHECKING'>('CHECKING');
  const [logoError, setLogoError] = useState(false);
  const [showServerModal, setShowServerModal] = useState(false);

  const passwordRef = useRef<React.ComponentRef<typeof TextInput> | null>(null);
  const attemptsRef = useRef(0);
  const lockedUntilRef = useRef(0);
  const isMountedRef = useRef(true);
  const probeAbortRef = useRef<AbortController | null>(null);

  const notify = (title: string, msg: string) => {
    if (Platform.OS === 'web' && typeof window !== 'undefined') {
      window.alert(`${title}: ${msg}`);
    } else {
      Alert.alert(title, msg);
    }
  };

  const checkServer = useCallback(async (forceReprobe = false) => {
    probeAbortRef.current?.abort();
    const controller = new AbortController();
    probeAbortRef.current = controller;

    if (isMountedRef.current) setStatus('CHECKING');
    if (forceReprobe) invalidateServerCache();

    let timeoutId: ReturnType<typeof setTimeout> | null = null;

    try {
      const cached = await AsyncStorage.getItem(SCHOOL_CACHE_KEY);
      if (cached && isMountedRef.current && !controller.signal.aborted) {
        setSchool(JSON.parse(cached));
      }

      const activeBase = await resolveFastestServer();
      if (!isMountedRef.current || controller.signal.aborted) return;
      setServerBase(activeBase);
      setLogoError(false);

      timeoutId = setTimeout(() => controller.abort(), 3500);
      const ping = await fetch(`${activeBase}/api/health/db/`, {
        method: 'GET',
        signal: controller.signal,
      });

      if (!isMountedRef.current || controller.signal.aborted) return;

      if (ping.status >= 200 && ping.status < 400) {
        setStatus('ONLINE');
        try {
          const res = await apiClient.get<PublicSchoolBranding>('school/public-branding/', {
            timeout: 3000,
            signal: controller.signal,
          });
          if (isMountedRef.current && !controller.signal.aborted && res.data) {
            setSchool(res.data);
            setLogoError(false);
            AsyncStorage.setItem(SCHOOL_CACHE_KEY, JSON.stringify(res.data)).catch(() => {});
          }
        } catch {
          // Keep cached school branding if branding endpoint is temporarily unavailable
        }
      } else {
        setStatus('OFFLINE');
      }
    } catch (err: unknown) {
      if (!isMountedRef.current) return;
      if (isCanceledError(err) && probeAbortRef.current !== controller) return;
      setStatus('OFFLINE');
    } finally {
      if (timeoutId !== null) {
        clearTimeout(timeoutId);
      }
    }
  }, []);

  useEffect(() => {
    isMountedRef.current = true;
    void checkServer(false);
    return () => {
      isMountedRef.current = false;
      probeAbortRef.current?.abort();
    };
  }, [checkServer]);

  const handleSignIn = async () => {
    if (Date.now() < lockedUntilRef.current) {
      const waitSec = Math.ceil((lockedUntilRef.current - Date.now()) / 1000);
      return notify('Please Wait', `Too many unsuccessful tries. Wait ${waitSec} seconds before trying again.`);
    }

    const userClean = cleanText(username, 150);
    const passClean = password.replace(/[\r\n\t]/g, '').trim();

    if (!userClean || !passClean) {
      return notify('Missing Information', 'Please enter your username and password.');
    }

    setLoading(true);
    try {
      await login(userClean, passClean);
      attemptsRef.current = 0;
      startPassivePresenceTracking().catch(() => {});
      registerPushTokenWithBackend().catch(() => {});
    } catch (err: unknown) {
      attemptsRef.current += 1;
      if (attemptsRef.current >= MAX_ATTEMPTS) {
        lockedUntilRef.current = Date.now() + LOCKOUT_MS;
      }
      const anyErr = err as { response?: unknown };
      const msg = !anyErr?.response
        ? 'Cannot reach the school server. Tap the settings icon at the top right to check the server address.'
        : getFriendlyErrorMessage(err, 'Incorrect username or password. Please try again.');
      notify('Sign In Failed', msg);
    } finally {
      if (isMountedRef.current) {
        setLoading(false);
      }
    }
  };

  const rawLogo = school?.school_logo || school?.left_logo || null;
  const candidateLogoUrl = rawLogo
    ? rawLogo.startsWith('http://') || rawLogo.startsWith('https://') || rawLogo.startsWith('data:')
      ? rawLogo
      : serverBase
      ? `${serverBase.replace(/\/+$/, '')}/${rawLogo.replace(/^\/+/, '')}`
      : null
    : null;
  const safeLogoUrl = isSafeUrl(candidateLogoUrl) ? candidateLogoUrl : null;

  const schoolMetaLine = [
    school?.school_id ? `School ID: ${cleanText(school.school_id, 40)}` : '',
    school?.division ? cleanText(school.division, 80) : '',
  ]
    .filter(Boolean)
    .join(' • ');

  const statusColor =
    status === 'ONLINE' ? palette.success : status === 'OFFLINE' ? palette.danger : palette.warning;
  const statusBg =
    status === 'ONLINE'
      ? palette.successLight
      : status === 'OFFLINE'
      ? palette.dangerLight
      : palette.warningLight;

  return (
    <SafeAreaView style={ui.screen}>
      <StatusBar style={isDark ? 'light' : 'dark'} />
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <ScrollView
          contentContainerStyle={{ flexGrow: 1, padding: 20, justifyContent: 'space-between' }}
          keyboardShouldPersistTaps="handled"
        >
          {/* Top Action Bar */}
          <View style={[ui.rowBetween, { marginBottom: 12 }]}>
            <TouchableOpacity
              onPress={toggleDarkMode}
              style={{
                width: 40,
                height: 40,
                borderRadius: 20,
                backgroundColor: palette.surface,
                borderWidth: 1,
                borderColor: palette.border,
                alignItems: 'center',
                justifyContent: 'center',
              }}
              accessibilityLabel="Switch color mode"
            >
              <Ionicons
                name={isDark ? 'sunny-outline' : 'moon-outline'}
                size={18}
                color={palette.primary}
              />
            </TouchableOpacity>

            <TouchableOpacity
              onPress={() => void checkServer(true)}
              style={[
                ui.badge,
                ui.rowCenter,
                {
                  backgroundColor: statusBg,
                  paddingHorizontal: 12,
                  paddingVertical: 6,
                  borderRadius: 20,
                },
              ]}
            >
              <View
                style={{ width: 7, height: 7, borderRadius: 4, backgroundColor: statusColor }}
              />
              <Text
                style={{
                  fontSize: fonts.xxs,
                  fontWeight: fonts.weight.extrabold,
                  color: statusColor,
                }}
              >
                {status === 'ONLINE'
                  ? 'SERVER ONLINE'
                  : status === 'OFFLINE'
                  ? 'OFFLINE • TAP TO RETRY'
                  : 'CONNECTING...'}
              </Text>
            </TouchableOpacity>

            <TouchableOpacity
              onPress={() => setShowServerModal(true)}
              style={{
                width: 40,
                height: 40,
                borderRadius: 20,
                backgroundColor: palette.surface,
                borderWidth: 1,
                borderColor: palette.border,
                alignItems: 'center',
                justifyContent: 'center',
              }}
              accessibilityLabel="Server settings"
            >
              <Ionicons name="settings-outline" size={18} color={palette.primary} />
            </TouchableOpacity>
          </View>

          {/* Center Brand + Sign-In Card */}
          <View style={{ marginVertical: 8 }}>
            <View style={{ alignItems: 'center', marginBottom: 20 }}>
              <View
                style={{
                  width: 92,
                  height: 92,
                  borderRadius: 46,
                  backgroundColor: palette.surface,
                  borderWidth: 2,
                  borderColor: palette.primary,
                  alignItems: 'center',
                  justifyContent: 'center',
                  marginBottom: 12,
                  overflow: 'hidden',
                  ...Platform.select({
                    ios: {
                      shadowColor: palette.primary,
                      shadowOffset: { width: 0, height: 4 },
                      shadowOpacity: 0.15,
                      shadowRadius: 8,
                    },
                    android: { elevation: 4 },
                  }),
                }}
              >
                {safeLogoUrl && !logoError ? (
                  <Image
                    source={{ uri: safeLogoUrl }}
                    style={{ width: 64, height: 64 }}
                    contentFit="contain"
                    onError={() => setLogoError(true)}
                  />
                ) : (
                  <AttendSureLogo size={58} />
                )}
              </View>
              <Text
                style={[
                  ui.title,
                  { textAlign: 'center', fontSize: 18, color: palette.textPrimary },
                ]}
              >
                {school?.school_name ? cleanText(school.school_name, 120) : 'AttendSure'}
              </Text>
              <Text style={[ui.subtext, { marginTop: 3, color: palette.textSecondary }]}>
                {schoolMetaLine || 'School Attendance System'}
              </Text>
            </View>

            {/* Sign-In Card */}
            <View style={[ui.card, { padding: 18, backgroundColor: palette.surface }]}>
              <Text
                style={[
                  ui.heading,
                  { fontSize: 16, marginBottom: 10, color: palette.textPrimary },
                ]}
              >
                Sign In
              </Text>

              <View
                style={[
                  ui.box,
                  ui.rowCenter,
                  {
                    backgroundColor: palette.primarySoft,
                    marginBottom: 16,
                    borderColor: 'transparent',
                    padding: 10,
                  },
                ]}
              >
                <Ionicons name="shield-checkmark-outline" size={18} color={palette.primary} />
                <Text
                  style={{
                    flex: 1,
                    fontSize: fonts.xs,
                    color: palette.textPrimary,
                    lineHeight: 16,
                    fontWeight: fonts.weight.medium,
                  }}
                >
                  Accounts are issued by the School Admin. Contact your school office if you need
                  help signing in.
                </Text>
              </View>

              <Text style={ui.label}>Username or Employee ID</Text>
              <View
                style={[
                  ui.input,
                  ui.rowCenter,
                  {
                    marginBottom: 14,
                    height: 48,
                    backgroundColor: palette.surfaceSubtle,
                    borderColor: palette.borderStrong,
                  },
                ]}
              >
                <Ionicons
                  name="person-outline"
                  size={18}
                  color={palette.textMuted}
                  style={{ marginRight: 8 }}
                />
                <TextInput
                  style={{ flex: 1, fontSize: fonts.md, color: palette.textPrimary }}
                  placeholder="Enter your username"
                  placeholderTextColor={palette.textMuted}
                  value={username}
                  onChangeText={setUsername}
                  autoCapitalize="none"
                  autoCorrect={false}
                  maxLength={150}
                  returnKeyType="next"
                  onSubmitEditing={() => passwordRef.current?.focus()}
                />
              </View>

              <Text style={ui.label}>Password</Text>
              <View
                style={[
                  ui.input,
                  ui.rowCenter,
                  {
                    marginBottom: 18,
                    height: 48,
                    backgroundColor: palette.surfaceSubtle,
                    borderColor: palette.borderStrong,
                  },
                ]}
              >
                <Ionicons
                  name="lock-closed-outline"
                  size={18}
                  color={palette.textMuted}
                  style={{ marginRight: 8 }}
                />
                <TextInput
                  ref={passwordRef}
                  style={{ flex: 1, fontSize: fonts.md, color: palette.textPrimary }}
                  placeholder="Enter your password"
                  placeholderTextColor={palette.textMuted}
                  value={password}
                  onChangeText={setPassword}
                  secureTextEntry={!showPassword}
                  autoCapitalize="none"
                  maxLength={128}
                  returnKeyType="go"
                  onSubmitEditing={() => void handleSignIn()}
                />
                <TouchableOpacity
                  onPress={() => setShowPassword((prev) => !prev)}
                  hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                  accessibilityLabel={showPassword ? 'Hide password' : 'Show password'}
                >
                  <Ionicons
                    name={showPassword ? 'eye-off-outline' : 'eye-outline'}
                    size={19}
                    color={palette.textMuted}
                  />
                </TouchableOpacity>
              </View>

              <TouchableOpacity
                style={[
                  ui.buttonPrimary,
                  {
                    height: 48,
                    borderRadius: 14,
                    backgroundColor: palette.buttonBg,
                  },
                  loading && { opacity: 0.65 },
                ]}
                onPress={() => void handleSignIn()}
                disabled={loading}
              >
                {loading ? (
                  <ActivityIndicator size="small" color={palette.onPrimary} />
                ) : (
                  <>
                    <Ionicons name="log-in-outline" size={19} color={palette.onPrimary} />
                    <Text
                      style={[
                        ui.buttonPrimaryText,
                        { fontSize: 15, color: palette.onPrimary },
                      ]}
                    >
                      Sign In
                    </Text>
                  </>
                )}
              </TouchableOpacity>
            </View>
          </View>

          {/* Footer Signature */}
          <View style={{ alignItems: 'center', paddingTop: 10, gap: 4 }}>
            <View style={[ui.rowCenter, { justifyContent: 'center' }]}>
              <Text style={[ui.subtext, { color: palette.textMuted }]}>System by</Text>
              <TechBlazerLogo />
            </View>
            {serverBase ? (
              <Text
                style={{ fontSize: 10, color: palette.textMuted, fontFamily: fonts.mono }}
                numberOfLines={1}
              >
                {serverBase}
              </Text>
            ) : null}
          </View>
        </ScrollView>
      </KeyboardAvoidingView>

      <ServerConfigModal
        visible={showServerModal}
        onClose={() => {
          setShowServerModal(false);
          void checkServer(true);
        }}
      />
    </SafeAreaView>
  );
};

export default LoginScreen;
