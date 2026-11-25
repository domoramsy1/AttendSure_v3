// AttendSure Mobile - Profile Settings Screen
// File: D:\AttendSure_V3\mobile\src\screens\ProfileSettingsScreen.tsx

/**
 * AttendSure Mobile - Teacher Profile & Digital ID Pass
 * File: mobile/src/screens/ProfileSettingsScreen.tsx
 */

import React, { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  RefreshControl,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import QRCode from 'react-native-qrcode-svg';
import { Image } from 'expo-image';
import { useAuth } from '../context/AuthContext';
import { useThemeMode } from '../context/ThemeContext';
import { apiClient } from '../api/client';
import { ENDPOINTS } from '../api/endpoints';
import { getServerBaseUrl } from '../services/configService';
import {
  cleanText,
  getFriendlyErrorMessage,
  QR_COLORS,
  type ThemePalette,
} from '../constants/theme';
import { confirmAction, isCanceledError, resolveMediaUrl } from '../utils/helpers';

const PROFILE_CACHE_KEY = 'attendsure_cached_teacher_profile';

interface LiveTeacherProfile {
  id: number;
  employee_id: string;
  first_name: string;
  last_name: string;
  full_name: string;
  position: string;
  department: string;
  contact_number?: string;
  email?: string;
  photo_url?: string | null;
  photo?: string | null;
  bound_device_id?: string | null;
  has_bound_device?: boolean;
  device_bound_at?: string | null;
}

interface ExtendedSessionUser {
  id?: number | string;
  username?: string;
  name?: string;
  full_name?: string;
  first_name?: string;
  last_name?: string;
  employee_id?: string;
  teacher_id?: string | number | null;
  role?: string;
  device_id?: string;
  bound_device_id?: string | null;
  has_bound_device?: boolean;
}

export const ProfileSettingsScreen: React.FC = () => {
  const navigation = useNavigation();
  const { user, logout } = useAuth();
  const { palette, fonts } = useThemeMode();
  const styles = useMemo(() => createStyles(palette, fonts), [palette, fonts]);

  const [profile, setProfile] = useState<LiveTeacherProfile | null>(null);
  const [serverBase, setServerBase] = useState<string>('');
  const [photoError, setPhotoError] = useState<boolean>(false);
  const [loading, setLoading] = useState<boolean>(true);
  const [refreshing, setRefreshing] = useState<boolean>(false);
  const [errorBanner, setErrorBanner] = useState<string | null>(null);
  const [qrTimestamp, setQrTimestamp] = useState<number>(Date.now());

  const isMountedRef = useRef<boolean>(true);
  const abortRef = useRef<AbortController | null>(null);

  const fetchProfile = useCallback(async (fromCacheFirst = false) => {
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    if (fromCacheFirst) {
      try {
        const [cached, base] = await Promise.all([
          AsyncStorage.getItem(PROFILE_CACHE_KEY),
          getServerBaseUrl(),
        ]);
        if (isMountedRef.current && !controller.signal.aborted) {
          if (base) setServerBase(base);
          if (cached) setProfile(JSON.parse(cached));
        }
      } catch {}
    }

    try {
      const res = await apiClient.get<LiveTeacherProfile>(ENDPOINTS.CURRENT_USER, {
        timeout: 8000,
        signal: controller.signal,
      });
      if (!isMountedRef.current || controller.signal.aborted) return;
      if (res.data) {
        setProfile(res.data);
        setErrorBanner(null);
        AsyncStorage.setItem(PROFILE_CACHE_KEY, JSON.stringify(res.data)).catch(() => {});
      }
    } catch (err: unknown) {
      if (!isMountedRef.current || isCanceledError(err)) return;
      setErrorBanner(getFriendlyErrorMessage(err, 'Showing saved profile details.'));
    } finally {
      if (isMountedRef.current) {
        setLoading(false);
        setRefreshing(false);
      }
    }
  }, []);

  useEffect(() => {
    isMountedRef.current = true;
    void fetchProfile(true);
    return () => {
      isMountedRef.current = false;
      abortRef.current?.abort();
    };
  }, [fetchProfile]);

  useEffect(() => {
    const timer = setInterval(() => {
      if (isMountedRef.current) {
        setQrTimestamp(Date.now());
      }
    }, 60000);
    return () => clearInterval(timer);
  }, []);

  const onRefresh = () => {
    setRefreshing(true);
    setQrTimestamp(Date.now());
    void fetchProfile(false);
  };

  const handleLogout = () => {
    confirmAction('Sign Out', 'Sign out of AttendSure on this device?', 'Sign Out', () => void logout());
  };

  const sessionUser = user as ExtendedSessionUser | null;
  const sessionFullName =
    sessionUser?.full_name ||
    sessionUser?.name ||
    `${sessionUser?.first_name || ''} ${sessionUser?.last_name || ''}`.trim();
  const displayName = cleanText(
    sessionFullName || profile?.full_name || sessionUser?.username || 'Teacher',
    120
  );
  const displayId = cleanText(
    profile?.employee_id ||
      sessionUser?.employee_id ||
      (sessionUser?.teacher_id ? String(sessionUser.teacher_id) : '') ||
      '—',
    40
  );
  const displayPosition = cleanText(profile?.position || sessionUser?.role || 'Teacher', 80);
  const displayDept = cleanText(profile?.department || '—', 80);
  const boundDeviceId =
    profile?.bound_device_id || sessionUser?.device_id || sessionUser?.bound_device_id || null;
  const isDeviceLinked = Boolean(
    profile?.has_bound_device || sessionUser?.has_bound_device || boundDeviceId
  );

  const safePhoto = resolveMediaUrl(
    user?.photo_url ?? user?.photo ?? profile?.photo_url ?? profile?.photo,
    serverBase
  );

  useEffect(() => {
    setPhotoError(false);
  }, [safePhoto]);

  const teacherPassPayload = JSON.stringify({
    app: 'ATTENDSURE_TEACHER_PASS',
    emp_id: displayId,
    name: displayName,
    ts: qrTimestamp,
    dev_id: boundDeviceId ? cleanText(boundDeviceId, 16).slice(0, 8) : 'UNLINKED',
  });

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <View style={styles.appBar}>
        <TouchableOpacity
          onPress={() => navigation.goBack()}
          style={styles.backButton}
          accessibilityLabel="Go back"
        >
          <Ionicons name="arrow-back" size={20} color={palette.textPrimary} />
        </TouchableOpacity>
        <Text style={styles.appBarTitle}>Teacher Profile &amp; Pass</Text>
        <View style={{ width: 36 }} />
      </View>

      <ScrollView
        contentContainerStyle={styles.scrollContent}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            colors={[palette.primary]}
            tintColor={palette.primary}
          />
        }
        showsVerticalScrollIndicator={false}
      >
        {errorBanner ? (
          <View style={styles.noticeBanner}>
            <Ionicons name="information-circle-outline" size={16} color={palette.warning} />
            <Text style={styles.noticeBannerText}>{errorBanner}</Text>
          </View>
        ) : null}

        <View style={styles.profileCard}>
          <View style={styles.avatarContainer}>
            {safePhoto && !photoError ? (
              <Image
                source={{ uri: safePhoto }}
                style={styles.avatarImage}
                contentFit="cover"
                onError={() => setPhotoError(true)}
              />
            ) : (
              <Ionicons name="person" size={40} color={palette.primary} />
            )}
          </View>

          <Text style={styles.profileName}>{displayName}</Text>
          <Text style={styles.profileRole}>{displayPosition}</Text>
          {displayDept !== '—' ? <Text style={styles.profileDept}>{displayDept}</Text> : null}

          <View style={styles.badgeRow}>
            <View style={styles.idBadge}>
              <Ionicons name="card-outline" size={13} color={palette.primary} />
              <Text style={styles.idBadgeText}>ID: {displayId}</Text>
            </View>

            <View
              style={[
                styles.statusBadge,
                isDeviceLinked ? styles.statusActive : styles.statusPending,
              ]}
            >
              <Ionicons
                name={isDeviceLinked ? 'shield-checkmark' : 'shield-outline'}
                size={13}
                color={isDeviceLinked ? palette.success : palette.warning}
              />
              <Text
                style={[
                  styles.statusBadgeText,
                  { color: isDeviceLinked ? palette.success : palette.warning },
                ]}
              >
                {isDeviceLinked ? 'Device Linked' : 'Not Linked'}
              </Text>
            </View>
          </View>
        </View>

        <View style={styles.qrCard}>
          <View style={styles.qrHeader}>
            <Ionicons name="qr-code-outline" size={20} color={palette.primary} />
            <Text style={styles.qrCardTitle}>Digital Teacher ID Pass</Text>
          </View>
          <Text style={styles.qrSubtitle}>
            Verify daily teacher attendance using Phone Fingerprint / Biometric &amp; Campus GPS
            inside this app.
          </Text>

          <View style={styles.qrWrapper}>
            {loading && !profile ? (
              <ActivityIndicator size="large" color={palette.primary} />
            ) : (
              <QRCode
                value={teacherPassPayload}
                size={180}
                color={QR_COLORS.foreground}
                backgroundColor={QR_COLORS.background}
              />
            )}
          </View>

          <View style={styles.qrFooter}>
            <Ionicons name="sync-outline" size={13} color={palette.textMuted} />
            <Text style={styles.qrFooterText}>
              Refreshes every 60 seconds to prevent screenshot reuse
            </Text>
          </View>
        </View>

        <TouchableOpacity
          style={styles.logoutButton}
          onPress={handleLogout}
          activeOpacity={0.85}
        >
          <Ionicons name="log-out-outline" size={18} color={palette.onPrimary} />
          <Text style={styles.logoutText}>Sign Out of Device</Text>
        </TouchableOpacity>
      </ScrollView>
    </SafeAreaView>
  );
};

const createStyles = (palette: ThemePalette, fonts: ReturnType<typeof useThemeMode>['fonts']) =>
  StyleSheet.create({
    container: { flex: 1, backgroundColor: palette.background },
    appBar: {
      height: 54,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingHorizontal: 16,
      backgroundColor: palette.surface,
      borderBottomWidth: 1,
      borderBottomColor: palette.border,
    },
    backButton: {
      width: 36,
      height: 36,
      borderRadius: 10,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: palette.surfaceSubtle,
      borderWidth: 1,
      borderColor: palette.border,
    },
    appBarTitle: { fontSize: fonts.md, fontWeight: fonts.weight.extrabold, color: palette.textPrimary },
    scrollContent: { padding: 16, gap: 14, paddingBottom: 60 },
    noticeBanner: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
      padding: 10,
      borderRadius: 10,
      backgroundColor: palette.warningLight,
      borderWidth: 1,
      borderColor: palette.warning,
    },
    noticeBannerText: { flex: 1, fontSize: fonts.xs, color: palette.textPrimary },
    profileCard: {
      backgroundColor: palette.surface,
      borderRadius: 14,
      padding: 18,
      alignItems: 'center',
      borderWidth: 1,
      borderColor: palette.border,
    },
    avatarContainer: {
      width: 76,
      height: 76,
      borderRadius: 38,
      backgroundColor: palette.primarySoft,
      overflow: 'hidden',
      alignItems: 'center',
      justifyContent: 'center',
      marginBottom: 10,
      borderWidth: 2,
      borderColor: palette.primary,
    },
    avatarImage: { width: '100%', height: '100%' },
    profileName: {
      fontSize: fonts.lg,
      fontWeight: fonts.weight.extrabold,
      color: palette.textPrimary,
      textAlign: 'center',
    },
    profileRole: {
      fontSize: fonts.sm,
      fontWeight: fonts.weight.bold,
      color: palette.primary,
      marginTop: 2,
    },
    profileDept: { fontSize: fonts.xs, color: palette.textSecondary, marginTop: 1 },
    badgeRow: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'center', gap: 6, marginTop: 12 },
    idBadge: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 4,
      paddingVertical: 4,
      paddingHorizontal: 8,
      backgroundColor: palette.primarySoft,
      borderRadius: 6,
      borderWidth: 1,
      borderColor: palette.border,
    },
    idBadgeText: { fontSize: fonts.xs, fontWeight: fonts.weight.bold, color: palette.primary },
    statusBadge: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 4,
      paddingVertical: 4,
      paddingHorizontal: 8,
      borderRadius: 6,
      borderWidth: 1,
    },
    statusActive: { backgroundColor: palette.successLight, borderColor: palette.success },
    statusPending: { backgroundColor: palette.warningLight, borderColor: palette.warning },
    statusBadgeText: { fontSize: fonts.xs, fontWeight: fonts.weight.bold },
    qrCard: {
      backgroundColor: palette.surface,
      borderRadius: 14,
      padding: 18,
      alignItems: 'center',
      borderWidth: 1,
      borderColor: palette.border,
    },
    qrHeader: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 4 },
    qrCardTitle: { fontSize: fonts.md, fontWeight: fonts.weight.extrabold, color: palette.textPrimary },
    qrSubtitle: {
      fontSize: fonts.xs,
      color: palette.textSecondary,
      textAlign: 'center',
      marginBottom: 14,
      lineHeight: 16,
    },
    qrWrapper: {
      padding: 14,
      backgroundColor: QR_COLORS.background,
      borderRadius: 12,
      borderWidth: 1,
      borderColor: palette.borderStrong,
      alignItems: 'center',
      justifyContent: 'center',
      minHeight: 208,
    },
    qrFooter: { flexDirection: 'row', alignItems: 'center', gap: 5, marginTop: 12 },
    qrFooterText: { fontSize: fonts.xs, color: palette.textSecondary, textAlign: 'center' },
    logoutButton: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 6,
      paddingVertical: 13,
      borderRadius: 12,
      backgroundColor: palette.dangerBg,
      marginTop: 4,
    },
    logoutText: { fontSize: fonts.sm, fontWeight: fonts.weight.extrabold, color: palette.onPrimary },
  });

export default ProfileSettingsScreen;
