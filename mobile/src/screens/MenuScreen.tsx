// AttendSure Mobile - Menu Screen
// File: D:\AttendSure_V3\mobile\src\screens\MenuScreen.tsx

/**
 * AttendSure Mobile - Profile, Color Mode Switcher & School Tools
 * File: mobile/src/screens/MenuScreen.tsx
 */

import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  ScrollView,
  RefreshControl,
  DeviceEventEmitter,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useAuth } from '../context/AuthContext';
import { useThemeMode } from '../context/ThemeContext';
import { type ThemeMode } from '../constants/theme';
import { apiClient } from '../api/client';
import { ENDPOINTS } from '../api/endpoints';
import { getServerBaseUrl } from '../services/configService';
import { TabType } from '../navigation/MainTabNavigator';
import { isCanceledError, resolveMediaUrl } from '../utils/helpers';
import {
  canManageUsers,
  canScanStudentQr,
  canViewAcademicSetup,
  canViewClassList,
  canViewReports,
  canViewSf4,
  canViewTeacherDirectory,
} from '../utils/permissions';

const STATS_CACHE_KEY = 'attendsure_cached_menu_stats';

interface MenuStats {
  rate: number | null;
  scans: number;
  students: number;
  alerts: number;
  classes: number;
}

interface MenuScreenProps {
  onSelectScreen: (screen: TabType) => void;
}

export const MenuScreen: React.FC<MenuScreenProps> = ({ onSelectScreen }) => {
  const insets = useSafeAreaInsets();
  const { user, logout, refreshUser } = useAuth();
  const { mode, setThemeMode, palette, ui, fonts } = useThemeMode();

  const [tab, setTab] = useState<'INFO' | 'TOOLS' | 'ACCOUNT'>('INFO');
  const [photoError, setPhotoError] = useState(false);
  const [serverBase, setServerBase] = useState('');
  const [refreshing, setRefreshing] = useState(false);
  const [stats, setStats] = useState<MenuStats>({
    rate: null,
    scans: 0,
    students: 0,
    alerts: 0,
    classes: 0,
  });

  const isMountedRef = useRef(true);
  const abortRef = useRef<AbortController | null>(null);

  const allowClassList = canViewClassList(user);
  const allowReports = canViewReports(user);
  const allowSf4 = canViewSf4(user);
  const allowStudentQr = canScanStudentQr(user);
  const allowTeachersDir = canViewTeacherDirectory(user);
  const allowSchedules = canViewAcademicSetup(user);
  const allowUsers = canManageUsers(user);

  const loadStats = useCallback(async (fromCacheFirst = false) => {
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    if (fromCacheFirst) {
      try {
        const [cachedStats, base] = await Promise.all([
          AsyncStorage.getItem(STATS_CACHE_KEY),
          getServerBaseUrl(),
        ]);
        if (isMountedRef.current && !controller.signal.aborted) {
          if (base) setServerBase(base);
          if (cachedStats) {
            const parsed = JSON.parse(cachedStats);
            if (parsed && typeof parsed === 'object') {
              setStats({
                rate: typeof parsed.rate === 'number' ? parsed.rate : null,
                scans: Number(parsed.scans ?? 0),
                students: Number(parsed.students ?? 0),
                alerts: Number(parsed.alerts ?? 0),
                classes: Number(parsed.classes ?? 0),
              });
            }
          }
        }
      } catch {}
    }

    try {
      const [ov, cls] = await Promise.allSettled([
        apiClient.get(ENDPOINTS.DASHBOARD_OVERVIEW, { signal: controller.signal }),
        allowClassList
          ? apiClient.get(ENDPOINTS.ATTENDANCE_CLASSES, {
              params: { summary: '1' },
              signal: controller.signal,
            })
          : Promise.resolve({ data: [] }),
      ]);

      if (!isMountedRef.current || controller.signal.aborted) return;

      const d = ov.status === 'fulfilled' && ov.value?.data ? ov.value.data : null;
      const clsRaw = cls.status === 'fulfilled' ? cls.value?.data : null;
      const clsList = Array.isArray(clsRaw)
        ? clsRaw
        : Array.isArray(clsRaw?.results)
        ? clsRaw.results
        : null;

      setStats((prev) => {
        const rawRate = d?.attendance_rate;
        const parsedRate =
          rawRate !== undefined && rawRate !== null && Number.isFinite(Number(rawRate))
            ? Number(rawRate)
            : prev.rate;

        const next: MenuStats = {
          rate: parsedRate,
          scans: d ? Number(d.classroom_scans_today ?? d.scans_today ?? 0) : prev.scans,
          students: d ? Number(d.total_students ?? 0) : prev.students,
          alerts: d ? Number(d.open_loafing_incidents ?? 0) : prev.alerts,
          classes: clsList !== null ? clsList.length : prev.classes,
        };
        AsyncStorage.setItem(STATS_CACHE_KEY, JSON.stringify(next)).catch(() => {});
        return next;
      });
    } catch {
      // Keep cached values when offline
    } finally {
      if (isMountedRef.current) setRefreshing(false);
    }
  }, [allowClassList]);

  useEffect(() => {
    isMountedRef.current = true;
    void loadStats(true);
    return () => {
      isMountedRef.current = false;
      abortRef.current?.abort();
    };
  }, [loadStats]);

  const role = String(user?.role || user?.system_role || '—').toUpperCase();
  const name =
    user?.full_name ||
    `${user?.first_name || ''} ${user?.last_name || ''}`.trim() ||
    user?.username ||
    '—';
  const empId = user?.employee_id || (user?.teacher_id ? String(user.teacher_id) : '') || user?.username || '—';
  const dept = user?.department || '—';
  const email = user?.email || '—';

  const resolvedPhoto = resolveMediaUrl(user?.photo_url || user?.photo, serverBase);

  useEffect(() => {
    setPhotoError(false);
  }, [resolvedPhoto]);

  const themes: { key: ThemeMode; label: string; icon: keyof typeof Ionicons.glyphMap }[] = [
    { key: 'light', label: 'Light', icon: 'sunny-outline' },
    { key: 'dark', label: 'Dark', icon: 'moon-outline' },
    { key: 'high-contrast', label: 'Daylight', icon: 'contrast-outline' },
  ];

  const tools: {
    key: TabType;
    title: string;
    sub: string;
    icon: keyof typeof Ionicons.glyphMap;
  }[] = [
    ...(allowClassList
      ? [
          {
            key: 'students' as TabType,
            title: 'Students Directory & CRUD',
            sub: 'Add, edit, enroll students and view QR ID passes',
            icon: 'school-outline' as keyof typeof Ionicons.glyphMap,
          },
          {
            key: 'class_list' as TabType,
            title: 'Class List & Cutting Monitor',
            sub: 'Inspect enrolled students and period attendance',
            icon: 'book-outline' as keyof typeof Ionicons.glyphMap,
          },
          {
            key: 'sardo_safety' as TabType,
            title: 'SARDO & Campus Safety',
            sub: 'Dropout early-warning, emergency roll-call & division export',
            icon: 'shield-outline' as keyof typeof Ionicons.glyphMap,
          },
        ]
      : []),
    ...(allowTeachersDir
      ? [
          {
            key: 'teachers' as TabType,
            title: 'Teachers Directory',
            sub: 'Manage teacher profiles, photos and 1-to-1 bound phones',
            icon: 'people-outline' as keyof typeof Ionicons.glyphMap,
          },
        ]
      : []),
    ...(allowSchedules
      ? [
          {
            key: 'schedules' as TabType,
            title: 'Academic Setup & Schedules',
            sub: 'Periods, sections, subjects, rooms, grades, years & holidays',
            icon: 'calendar-number-outline' as keyof typeof Ionicons.glyphMap,
          },
        ]
      : []),
    ...(allowUsers
      ? [
          {
            key: 'users' as TabType,
            title: 'User Accounts & Roles',
            sub: 'Create, edit and manage teacher login accounts',
            icon: 'shield-checkmark-outline' as keyof typeof Ionicons.glyphMap,
          },
        ]
      : []),
    {
      key: 'geofence',
      title: 'Campus Geofence Status',
      sub: 'Live teacher GPS boundary and loafing alerts',
      icon: 'navigate-outline',
    },
    {
      key: 'scanner',
      title: allowStudentQr
        ? 'Student QR & Teacher Time In / Out'
        : 'Teacher Time In / Out',
      sub: allowStudentQr
        ? 'Scan student QR IDs or record Teacher Time In / Out with Phone Fingerprint & Campus GPS'
        : 'Record Teacher Time In / Out via Phone Fingerprint / Biometric & Campus GPS',
      icon: allowStudentQr ? 'scan-outline' : 'finger-print-outline',
    },
    {
      key: 'dtr',
      title: 'Daily Time Record (Form 48)',
      sub: 'View and submit monthly hours',
      icon: 'time-outline',
    },
    ...(allowReports
      ? [
          {
            key: 'reports' as TabType,
            title: allowSf4 ? 'DepEd Forms (SF1, SF2, SF4)' : 'DepEd Forms (SF1 & SF2)',
            sub: 'View official DepEd attendance forms',
            icon: 'document-text-outline' as keyof typeof Ionicons.glyphMap,
          },
        ]
      : []),
    {
      key: 'calendar',
      title: 'School Calendar',
      sub: 'Holidays and class suspensions',
      icon: 'calendar-outline',
    },
    {
      key: 'help',
      title: 'User Manual & Help',
      sub: 'Step-by-step guides, quick fixes & animated walkthrough',
      icon: 'help-circle-outline',
    },
    {
      key: 'settings',
      title: 'Settings',
      sub: 'Profile, password and color mode',
      icon: 'settings-outline',
    },
  ];

  const onRefresh = async () => {
    setRefreshing(true);
    await Promise.allSettled([loadStats(false), refreshUser()]);
    if (isMountedRef.current) setRefreshing(false);
  };

  return (
    <ScrollView
      style={ui.screen}
      contentContainerStyle={{ paddingBottom: 120 }}
      showsVerticalScrollIndicator={false}
      refreshControl={
        <RefreshControl
          refreshing={refreshing}
          onRefresh={() => void onRefresh()}
          colors={[palette.primary]}
          tintColor={palette.primary}
        />
      }
    >
      {/* Top Profile Banner */}
      <View
        style={{
          backgroundColor: palette.headerBg,
          paddingTop: Math.max(insets.top, 14),
          paddingHorizontal: 18,
          paddingBottom: 20,
          borderBottomLeftRadius: 26,
          borderBottomRightRadius: 26,
        }}
      >
        <View style={ui.rowBetween}>
          <Text
            style={{
              fontSize: fonts.xl,
              fontWeight: fonts.weight.extrabold,
              color: palette.onPrimary,
            }}
          >
            My Profile
          </Text>
          <TouchableOpacity
            onPress={() => onSelectScreen('settings')}
            style={{
              padding: 8,
              borderRadius: 18,
              backgroundColor: palette.headerSurface,
            }}
            accessibilityLabel="Open settings"
          >
            <Ionicons name="settings-outline" size={18} color={palette.onPrimary} />
          </TouchableOpacity>
        </View>

        <View style={{ alignItems: 'center', marginTop: 10 }}>
          <View
            style={{
              width: 72,
              height: 72,
              borderRadius: 36,
              backgroundColor: palette.surface,
              alignItems: 'center',
              justifyContent: 'center',
              overflow: 'hidden',
              marginBottom: 8,
            }}
          >
            {resolvedPhoto && !photoError ? (
              <Image
                source={{ uri: resolvedPhoto }}
                style={{ width: '100%', height: '100%' }}
                contentFit="cover"
                onError={() => setPhotoError(true)}
              />
            ) : (
              <Ionicons name="person" size={36} color={palette.primary} />
            )}
          </View>
          <Text
            style={{
              fontSize: 18,
              fontWeight: fonts.weight.extrabold,
              color: palette.onPrimary,
            }}
          >
            {name}
          </Text>
          <Text
            style={{
              fontSize: fonts.xs,
              color: palette.onPrimary,
              opacity: 0.85,
              marginTop: 2,
            }}
          >
            {dept !== '—' ? `${dept} • ` : ''}ID {empId}
          </Text>
        </View>

        <View
          style={{
            flexDirection: 'row',
            backgroundColor: palette.headerSurface,
            borderRadius: 14,
            paddingVertical: 10,
            marginTop: 14,
          }}
        >
          {[
            { val: String(stats.scans), lbl: 'Scans Today' },
            { val: stats.rate !== null ? `${stats.rate}%` : '—', lbl: 'Attendance' },
            { val: String(stats.classes), lbl: 'Classes' },
          ].map((s, idx) => (
            <View key={idx} style={{ flex: 1, alignItems: 'center' }}>
              <Text
                style={{
                  fontSize: 16,
                  fontWeight: fonts.weight.black,
                  color: palette.onPrimary,
                }}
              >
                {s.val}
              </Text>
              <Text
                style={{
                  fontSize: fonts.xxs,
                  color: palette.onPrimary,
                  opacity: 0.85,
                }}
              >
                {s.lbl}
              </Text>
            </View>
          ))}
        </View>
      </View>

      <View style={{ padding: 16, gap: 12 }}>
        {/* Color Mode Switcher */}
        <View style={ui.card}>
          <Text style={ui.label}>SCREEN COLOR MODE</Text>
          <View style={{ flexDirection: 'row', gap: 8, marginTop: 4 }}>
            {themes.map((t) => {
              const active = mode === t.key;
              return (
                <TouchableOpacity
                  key={t.key}
                  onPress={() => setThemeMode(t.key)}
                  style={[
                    ui.buttonSecondary,
                    {
                      flex: 1,
                      backgroundColor: active ? palette.buttonBg : palette.surfaceSubtle,
                      borderColor: active ? palette.buttonBg : palette.border,
                    },
                  ]}
                >
                  <Ionicons
                    name={t.icon}
                    size={15}
                    color={active ? palette.onPrimary : palette.textSecondary}
                  />
                  <Text
                    style={{
                      fontSize: fonts.xs,
                      fontWeight: fonts.weight.extrabold,
                      color: active ? palette.onPrimary : palette.textSecondary,
                    }}
                  >
                    {t.label}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </View>
        </View>

        {/* Section Tabs */}
        <View style={[ui.box, { flexDirection: 'row', padding: 4 }]}>
          {(['INFO', 'TOOLS', 'ACCOUNT'] as const).map((k) => {
            const active = tab === k;
            return (
              <TouchableOpacity
                key={k}
                onPress={() => setTab(k)}
                style={{
                  flex: 1,
                  paddingVertical: 8,
                  alignItems: 'center',
                  borderRadius: 8,
                  backgroundColor: active ? palette.surface : 'transparent',
                }}
              >
                <Text
                  style={{
                    fontSize: fonts.xs,
                    fontWeight: fonts.weight.extrabold,
                    color: active ? palette.primary : palette.textMuted,
                  }}
                >
                  {k}
                </Text>
              </TouchableOpacity>
            );
          })}
        </View>

        {tab === 'INFO' && (
          <View style={ui.card}>
            <Text style={ui.heading}>Teacher Details</Text>
            {[
              { k: 'NAME', v: name },
              { k: 'ID NUMBER', v: empId },
              { k: 'DEPARTMENT', v: dept },
              { k: 'EMAIL', v: email },
              { k: 'ROLE', v: role },
              { k: 'TOTAL STUDENTS', v: String(stats.students) },
              { k: 'LOAFING & CUTTING ALERTS', v: String(stats.alerts) },
            ].map((r, i) => (
              <View
                key={i}
                style={[
                  ui.rowBetween,
                  {
                    paddingVertical: 8,
                    borderBottomWidth: i === 6 ? 0 : 1,
                    borderBottomColor: palette.border,
                  },
                ]}
              >
                <Text style={ui.label}>{r.k}</Text>
                <Text
                  style={{
                    fontSize: fonts.sm,
                    fontWeight: fonts.weight.extrabold,
                    color: palette.textPrimary,
                    maxWidth: '62%',
                    textAlign: 'right',
                  }}
                  numberOfLines={1}
                >
                  {r.v}
                </Text>
              </View>
            ))}
          </View>
        )}

        {tab === 'TOOLS' && (
          <View style={{ gap: 8 }}>
            {tools.map((t) => (
              <TouchableOpacity
                key={t.key}
                style={[ui.card, ui.rowBetween, { marginBottom: 0 }]}
                onPress={() => onSelectScreen(t.key)}
              >
                <View style={[ui.rowCenter, { flex: 1 }]}>
                  <View
                    style={{
                      width: 38,
                      height: 38,
                      borderRadius: 10,
                      backgroundColor: palette.primarySoft,
                      alignItems: 'center',
                      justifyContent: 'center',
                    }}
                  >
                    <Ionicons name={t.icon} size={18} color={palette.primary} />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text
                      style={{
                        fontSize: fonts.md,
                        fontWeight: fonts.weight.extrabold,
                        color: palette.textPrimary,
                      }}
                    >
                      {t.title}
                    </Text>
                    <Text style={ui.subtext}>{t.sub}</Text>
                  </View>
                </View>
                <Ionicons name="chevron-forward" size={18} color={palette.textMuted} />
              </TouchableOpacity>
            ))}
          </View>
        )}

        {tab === 'ACCOUNT' && (
          <View style={ui.card}>
            <Text style={ui.heading}>Account Options</Text>
            <TouchableOpacity
              style={[ui.buttonSecondary, { marginBottom: 10 }]}
              onPress={() => onSelectScreen('help')}
            >
              <Ionicons name="book-outline" size={16} color={palette.primary} />
              <Text style={ui.buttonSecondaryText}>User Manual &amp; Quick Fixes</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[ui.buttonSecondary, { marginBottom: 10 }]}
              onPress={() => DeviceEventEmitter.emit('attendsure:open-onboarding-tour')}
            >
              <Ionicons name="play-circle-outline" size={16} color={palette.success} />
              <Text style={ui.buttonSecondaryText}>Replay Animated Guide</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[ui.buttonSecondary, { marginBottom: 10 }]}
              onPress={() => onSelectScreen('settings')}
            >
              <Ionicons name="key-outline" size={16} color={palette.textPrimary} />
              <Text style={ui.buttonSecondaryText}>Edit Profile &amp; Password</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[ui.buttonPrimary, { backgroundColor: palette.dangerBg }]}
              onPress={() => void logout()}
            >
              <Ionicons name="log-out-outline" size={16} color={palette.onPrimary} />
              <Text style={[ui.buttonPrimaryText, { color: palette.onPrimary }]}>Sign Out</Text>
            </TouchableOpacity>
          </View>
        )}
      </View>
    </ScrollView>
  );
};

export default MenuScreen;
