/**
 * AttendSure Mobile - Clean Sign-In Screen
 * File: mobile/src/screens/LoginScreen.tsx
 */

import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  ActivityIndicator,
  ScrollView,
  KeyboardAvoidingView,
  Platform,
  StyleSheet,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import { Ionicons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import AsyncStorage from '@react-native-async-storage/async-storage';

import { useAuth } from '../context/AuthContext';
import { useThemeMode } from '../context/ThemeContext';
import { AttendSureLogo } from '../branding/BrandLogos';
import { cleanText, getFriendlyErrorMessage } from '../constants/theme';
import { apiClient } from '../api/client';
import { ENDPOINTS } from '../api/endpoints';
import { getServerBaseUrl } from '../services/configService';
import { isCanceledError, resolveMediaUrl, showNotice } from '../utils/helpers';

const SCHOOL_CACHE_KEY = 'attendsure_cached_school_profile';
const MAX_ATTEMPTS = 5;
const LOCKOUT_MS = 30000;

interface PublicSchoolBranding {
  school_name?: string;
  school_logo?: string | null;
  left_logo?: string | null;
}

export const LoginScreen: React.FC = () => {
  const { login } = useAuth();
  const { palette, fonts, ui, isDark } = useThemeMode();

  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [focusedField, setFocusedField] = useState<'username' | 'password' | null>(null);
  const [loading, setLoading] = useState(false);

  const [school, setSchool] = useState<PublicSchoolBranding | null>(null);
  const [serverBase, setServerBase] = useState('');
  const [logoError, setLogoError] = useState(false);

  const passwordRef = useRef<React.ComponentRef<typeof TextInput> | null>(null);
  const attemptsRef = useRef(0);
  const lockedUntilRef = useRef(0);
  const isMountedRef = useRef(true);
  const brandingAbortRef = useRef<AbortController | null>(null);

  const loadSchoolBranding = useCallback(async () => {
    brandingAbortRef.current?.abort();
    const controller = new AbortController();
    brandingAbortRef.current = controller;

    try {
      const cached = await AsyncStorage.getItem(SCHOOL_CACHE_KEY);
      if (cached && isMountedRef.current && !controller.signal.aborted) {
        setSchool(JSON.parse(cached));
      }

      const activeBase = await getServerBaseUrl();
      if (!isMountedRef.current || controller.signal.aborted) return;
      setServerBase(activeBase);
      setLogoError(false);

      const res = await apiClient.get<PublicSchoolBranding>(ENDPOINTS.PUBLIC_BRANDING, {
        timeout: 3500,
        signal: controller.signal,
      });
      if (isMountedRef.current && !controller.signal.aborted && res.data) {
        setSchool(res.data);
        setLogoError(false);
        AsyncStorage.setItem(SCHOOL_CACHE_KEY, JSON.stringify(res.data)).catch(() => {});
      }
    } catch (err: unknown) {
      if (isCanceledError(err)) return;
    }
  }, []);

  useEffect(() => {
    isMountedRef.current = true;
    void loadSchoolBranding();
    return () => {
      isMountedRef.current = false;
      brandingAbortRef.current?.abort();
    };
  }, [loadSchoolBranding]);

  const handleSignIn = async () => {
    if (Date.now() < lockedUntilRef.current) {
      const waitSec = Math.ceil((lockedUntilRef.current - Date.now()) / 1000);
      return showNotice('Please Wait', `Too many unsuccessful tries. Wait ${waitSec} seconds before trying again.`);
    }

    const userClean = cleanText(username, 150);
    const passClean = password.replace(/[\r\n\t]/g, '').trim();

    if (!userClean || !passClean) {
      return showNotice('Missing Information', 'Please enter your username and password.');
    }

    setLoading(true);
    try {
      await login(userClean, passClean);
      attemptsRef.current = 0;
    } catch (err: unknown) {
      attemptsRef.current += 1;
      if (attemptsRef.current >= MAX_ATTEMPTS) {
        lockedUntilRef.current = Date.now() + LOCKOUT_MS;
      }
      const anyErr = err as { response?: unknown };
      const msg = !anyErr?.response
        ? 'Cannot reach the school server. Check your Wi-Fi connection and try again.'
        : getFriendlyErrorMessage(err, 'Incorrect username or password. Please try again.');
      showNotice('Sign In Failed', msg);
    } finally {
      if (isMountedRef.current) {
        setLoading(false);
      }
    }
  };

  const safeLogoUrl = resolveMediaUrl(school?.school_logo || school?.left_logo, serverBase);

  const brandName = school?.school_name ? cleanText(school.school_name, 120) : 'AttendSure';

  return (
    <SafeAreaView style={ui.screen} edges={['top', 'bottom']}>
      <StatusBar style={isDark ? 'light' : 'dark'} />

      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      >
        <ScrollView
          contentContainerStyle={styles.scrollContent}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          {/* Clean Brand Header */}
          <View style={styles.brandBlock}>
            <View
              style={[
                styles.logoBadge,
                {
                  backgroundColor: palette.onPrimary,
                  borderColor: palette.primary,
                  shadowColor: palette.primary,
                },
              ]}
            >
              {safeLogoUrl && !logoError ? (
                <Image
                  source={{ uri: safeLogoUrl }}
                  style={styles.schoolLogo}
                  contentFit="contain"
                  onError={() => setLogoError(true)}
                />
              ) : (
                <AttendSureLogo size={76} style={{ borderWidth: 0 }} />
              )}
            </View>
            <Text style={[styles.brandName, { color: palette.textPrimary }]}>{brandName}</Text>
          </View>

          {/* Clean Sign-In Card */}
          <View
            style={[
              styles.formCard,
              {
                backgroundColor: palette.surface,
                borderColor: palette.border,
                shadowColor: palette.shadowColor,
              },
            ]}
          >
            <Text style={[styles.fieldLabel, { color: palette.textSecondary }]}>Username</Text>
            <View
              style={[
                styles.inputWrap,
                {
                  backgroundColor: palette.surfaceSubtle,
                  borderColor:
                    focusedField === 'username' ? palette.primary : palette.borderStrong,
                },
              ]}
            >
              <Ionicons
                name="person-outline"
                size={18}
                color={focusedField === 'username' ? palette.primary : palette.textMuted}
                style={styles.inputIcon}
              />
              <TextInput
                style={[styles.inputField, { fontSize: fonts.md, color: palette.textPrimary }]}
                placeholder="Username or Employee ID"
                placeholderTextColor={palette.textMuted}
                value={username}
                onChangeText={setUsername}
                onFocus={() => setFocusedField('username')}
                onBlur={() => setFocusedField((prev) => (prev === 'username' ? null : prev))}
                autoCapitalize="none"
                autoCorrect={false}
                maxLength={150}
                returnKeyType="next"
                onSubmitEditing={() => passwordRef.current?.focus()}
              />
            </View>

            <Text style={[styles.fieldLabel, { color: palette.textSecondary, marginTop: 16 }]}>
              Password
            </Text>
            <View
              style={[
                styles.inputWrap,
                {
                  backgroundColor: palette.surfaceSubtle,
                  borderColor:
                    focusedField === 'password' ? palette.primary : palette.borderStrong,
                },
              ]}
            >
              <Ionicons
                name="lock-closed-outline"
                size={18}
                color={focusedField === 'password' ? palette.primary : palette.textMuted}
                style={styles.inputIcon}
              />
              <TextInput
                ref={passwordRef}
                style={[styles.inputField, { fontSize: fonts.md, color: palette.textPrimary }]}
                placeholder="Password"
                placeholderTextColor={palette.textMuted}
                value={password}
                onChangeText={setPassword}
                onFocus={() => setFocusedField('password')}
                onBlur={() => setFocusedField((prev) => (prev === 'password' ? null : prev))}
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
                styles.signInBtn,
                { backgroundColor: palette.buttonBg },
                loading && { opacity: 0.65 },
              ]}
              onPress={() => void handleSignIn()}
              disabled={loading}
              activeOpacity={0.85}
            >
              {loading ? (
                <ActivityIndicator size="small" color={palette.onPrimary} />
              ) : (
                <Text style={[styles.signInText, { color: palette.onPrimary }]}>Sign In</Text>
              )}
            </TouchableOpacity>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  flex: {
    flex: 1,
  },
  scrollContent: {
    flexGrow: 1,
    justifyContent: 'center',
    paddingHorizontal: 24,
    paddingVertical: 28,
  },
  brandBlock: {
    alignItems: 'center',
    marginBottom: 28,
    paddingHorizontal: 8,
  },
  logoBadge: {
    width: 96,
    height: 96,
    borderRadius: 48,
    borderWidth: 2,
    padding: 6,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 16,
    overflow: 'hidden',
    ...Platform.select({
      ios: {
        shadowOffset: { width: 0, height: 6 },
        shadowOpacity: 0.16,
        shadowRadius: 12,
      },
      android: { elevation: 5 },
    }),
  },
  schoolLogo: {
    width: '100%',
    height: '100%',
    borderRadius: 42,
  },
  brandName: {
    fontSize: 21,
    fontWeight: '800',
    textAlign: 'center',
    letterSpacing: -0.3,
    lineHeight: 28,
  },
  formCard: {
    borderRadius: 20,
    padding: 22,
    borderWidth: 1,
    ...Platform.select({
      ios: {
        shadowOffset: { width: 0, height: 6 },
        shadowOpacity: 0.1,
        shadowRadius: 14,
      },
      android: { elevation: 3 },
    }),
  },
  fieldLabel: {
    fontSize: 12.5,
    fontWeight: '700',
    marginBottom: 7,
  },
  inputWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    height: 50,
    borderRadius: 12,
    borderWidth: 1.25,
    paddingHorizontal: 14,
  },
  inputIcon: {
    marginRight: 10,
  },
  inputField: {
    flex: 1,
  },
  signInBtn: {
    height: 52,
    borderRadius: 13,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 24,
  },
  signInText: {
    fontSize: 15.5,
    fontWeight: '800',
    letterSpacing: 0.2,
  },
});

export default LoginScreen;
