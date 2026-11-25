/**
 * AttendSure Mobile - Complete Account, School Setup, 3 Logos, Maintenance & Audit Logs
 * File: mobile/src/screens/SettingsScreen.tsx
 *
 * 100% content parity with web/src/components/tabs/SettingsTab.tsx:
 * - Profile & Alarms (with ImageUploadField, theme switcher, test alarms, Digital ID Pass)
 * - School Setup & Official Logos (Principal Teacher picker + photo, all metadata inputs,
 *   campus geofence coords, and all 3 transparent-PNG-safe letterhead seals)
 * - System Maintenance & Live Telemetry Health (Run Cutting Audit, Clean Memory,
 *   Check Services, Unlock Locked Accounts)
 * - Audit Logs (with live search + action filters)
 */

import React, { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TextInput,
  TouchableOpacity,
  ScrollView,
  ActivityIndicator,
  Switch,
  DeviceEventEmitter,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import QRCode from 'react-native-qrcode-svg';
import { useAuth } from '../context/AuthContext';
import { useThemeMode } from '../context/ThemeContext';
import { apiClient } from '../api/client';
import { ENDPOINTS } from '../api/endpoints';
import { getServerBaseUrl } from '../services/configService';
import {
  getMobileAlarmsEnabled,
  setMobileAlarmsEnabled,
} from '../services/scheduleAlarmService';
import type { AlarmToneKind } from '../services/soundService';
import { canManageSchoolSetup, canViewAuditLogs } from '../utils/permissions';
import { confirmAction, isCanceledError, showNotice } from '../utils/helpers';
import {
  isSafeUrl,
  cleanText,
  getFriendlyErrorMessage,
  QR_COLORS,
  type ThemeMode,
  type ThemePalette,
} from '../constants/theme';
import ImageUploadField from '../components/common/ImageUploadField';
import ChipRow from '../components/common/ChipRow';
import SchoolSetupSection, {
  type PrincipalCandidate,
  type SchoolFormState,
} from '../components/settings/SchoolSetupSection';
import MaintenanceSection, {
  type MaintenanceActionKey,
  type MaintenanceHealthStats,
} from '../components/settings/MaintenanceSection';
import AuditLogsSection, {
  type AuditLogEntry,
} from '../components/settings/AuditLogsSection';

const SETTINGS_PROFILE_CACHE_KEY = 'attendsure_cached_settings_profile';

export interface ExtendedUserProfile {
  id?: number | string;
  username?: string;
  first_name?: string;
  last_name?: string;
  middle_name?: string;
  suffix?: string;
  full_name?: string;
  email?: string;
  contact_number?: string;
  phone?: string;
  position?: string;
  department?: string;
  role?: string;
  employee_id?: string;
  teacher_id?: string | number | null;
  photo?: string | null;
  photo_url?: string | null;
}

type SettingsSubTab = 'PROFILE' | 'SCHOOL' | 'MAINTENANCE' | 'LOGS';

export const SettingsScreen: React.FC = () => {
  const { user, logout, updateUser, updateSessionToken } = useAuth();
  const { palette, fonts, mode, setThemeMode } = useThemeMode();
  const styles = useMemo(() => createStyles(palette, fonts), [palette, fonts]);

  const allowSchoolSetup = canManageSchoolSetup(user);
  const allowAuditLogs = canViewAuditLogs(user);

  const [activeSubTab, setActiveSubTab] = useState<SettingsSubTab>('PROFILE');
  const [profile, setProfile] = useState<ExtendedUserProfile | null>(
    user as ExtendedUserProfile | null
  );
  const [saving, setSaving] = useState<boolean>(false);
  const [serverBase, setServerBase] = useState<string>('');
  const [alarmsEnabled, setAlarmsEnabled] = useState<boolean>(true);

  // Personal Profile fields
  const [firstName, setFirstName] = useState<string>(user?.first_name || '');
  const [middleName, setMiddleName] = useState<string>(user?.middle_name || '');
  const [lastName, setLastName] = useState<string>(user?.last_name || '');
  const [contactNumber, setContactNumber] = useState<string>(user?.contact_number || '');
  const [email, setEmail] = useState<string>(user?.email || '');
  const [currentPassword, setCurrentPassword] = useState<string>('');
  const [newPassword, setNewPassword] = useState<string>('');
  const [newPhotoBase64, setNewPhotoBase64] = useState<string | null>(null);
  const [photoPreview, setPhotoPreview] = useState<string | null>(null);
  const [photoRemoved, setPhotoRemoved] = useState<boolean>(false);

  // Admin School Setup & 3 Logos fields
  const [schoolSaving, setSchoolSaving] = useState<boolean>(false);
  const [principalCandidates, setPrincipalCandidates] = useState<PrincipalCandidate[]>([]);
  const [schoolForm, setSchoolForm] = useState<SchoolFormState>({
    school_name: '',
    school_id: '',
    academic_year: '',
    region: '',
    division: '',
    district: '',
    principal_teacher: '',
    superintendent_name: '',
    address: '',
    contact_number: '',
    email: '',
    website: '',
    latitude: '',
    longitude: '',
    geofence_radius_meters: '150',
    weekend_rest_enabled: true,
    school_logo: null,
    left_logo: null,
    right_logo: null,
  });
  const [logoUploads, setLogoUploads] = useState<{
    school_logo?: string | null;
    left_logo?: string | null;
    right_logo?: string | null;
  }>({});

  // Maintenance & Telemetry Health
  const [healthStats, setHealthStats] = useState<MaintenanceHealthStats>({
    dbStatus: 'Checking...',
    teachersTimedIn: 0,
    teachersTotal: 0,
    openAlerts: 0,
    activePasses: 0,
  });
  const [maintBusy, setMaintBusy] = useState<string | null>(null);

  // Audit Logs
  const [auditLogs, setAuditLogs] = useState<AuditLogEntry[]>([]);
  const [logsLoading, setLogsLoading] = useState<boolean>(false);
  const [logSearch, setLogSearch] = useState<string>('');
  const [logActionFilter, setLogActionFilter] = useState<string>('ALL');

  const isMountedRef = useRef<boolean>(true);
  const abortRef = useRef<AbortController | null>(null);

  const fetchProfile = useCallback(async () => {
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    try {
      const [cached, base] = await Promise.all([
        AsyncStorage.getItem(SETTINGS_PROFILE_CACHE_KEY),
        getServerBaseUrl(),
      ]);
      if (isMountedRef.current && !controller.signal.aborted) {
        if (base) setServerBase(base);
        if (cached) {
          const parsed: ExtendedUserProfile = JSON.parse(cached);
          setProfile(parsed);
          setFirstName(parsed.first_name || '');
          setMiddleName(parsed.middle_name || '');
          setLastName(parsed.last_name || '');
          setContactNumber(parsed.contact_number || parsed.phone || '');
          setEmail(parsed.email || '');
        }
      }
    } catch {}

    try {
      const res = await apiClient.get<ExtendedUserProfile>(ENDPOINTS.CURRENT_USER, {
        signal: controller.signal,
      });
      if (!isMountedRef.current || controller.signal.aborted) return;
      if (res.data) {
        setProfile(res.data);
        setFirstName(res.data.first_name || '');
        setMiddleName(res.data.middle_name || '');
        setLastName(res.data.last_name || '');
        setContactNumber(res.data.contact_number || res.data.phone || '');
        setEmail(res.data.email || '');
        AsyncStorage.setItem(SETTINGS_PROFILE_CACHE_KEY, JSON.stringify(res.data)).catch(() => {});
      }
    } catch (err: unknown) {
      if (isCanceledError(err)) return;
    }
  }, []);

  const loadSchoolConfig = useCallback(async () => {
    if (!allowSchoolSetup) return;
    try {
      const [schoolRes, teachersRes] = await Promise.allSettled([
        apiClient.get(ENDPOINTS.SCHOOL_PROFILE),
        apiClient.get(ENDPOINTS.TEACHERS_DROPDOWN),
      ]);
      if (!isMountedRef.current) return;
      if (teachersRes.status === 'fulfilled' && teachersRes.value?.data) {
        const raw = teachersRes.value.data;
        setPrincipalCandidates(Array.isArray(raw) ? raw : Array.isArray(raw?.results) ? raw.results : []);
      }
      if (schoolRes.status === 'fulfilled' && schoolRes.value?.data) {
        const s = schoolRes.value.data;
        setSchoolForm({
          school_name: String(s.school_name || ''),
          school_id: String(s.school_id || ''),
          academic_year: String(s.academic_year || s.school_year || ''),
          region: String(s.region || ''),
          division: String(s.division || ''),
          district: String(s.district || ''),
          principal_teacher: s.principal_teacher ? String(s.principal_teacher) : '',
          superintendent_name: String(s.superintendent_name || ''),
          address: String(s.address || ''),
          contact_number: String(s.contact_number || ''),
          email: String(s.email || ''),
          website: String(s.website || ''),
          latitude: s.latitude !== null && s.latitude !== undefined ? String(s.latitude) : '',
          longitude: s.longitude !== null && s.longitude !== undefined ? String(s.longitude) : '',
          geofence_radius_meters: String(s.geofence_radius_meters || 150),
          weekend_rest_enabled: s.weekend_rest_enabled !== false,
          school_logo: s.school_logo || null,
          left_logo: s.left_logo || null,
          right_logo: s.right_logo || null,
        });
        setLogoUploads({});
      }
    } catch {}
  }, [allowSchoolSetup]);

  const loadMaintenanceHealth = useCallback(async () => {
    if (!allowSchoolSetup) return;
    try {
      const [dbRes, statusRes] = await Promise.allSettled([
        apiClient.get(ENDPOINTS.HEALTH_DB),
        apiClient.get(ENDPOINTS.SYSTEM_STATUS),
      ]);
      if (!isMountedRef.current) return;
      const dbOk = dbRes.status === 'fulfilled' && dbRes.value?.status === 200;
      const st = statusRes.status === 'fulfilled' ? statusRes.value?.data || {} : {};
      setHealthStats({
        dbStatus: dbOk ? 'Connected (OK)' : 'Check Connection',
        teachersTimedIn: Number(
          st.online_teachers_today ??
            st.online_teachers ??
            st.teachers_timed_in ??
            st.teachers_present ??
            0
        ),
        teachersTotal: Number(st.active_teachers ?? st.total_teachers ?? 0),
        openAlerts: Number(st.open_loafing_incidents ?? st.open_alerts ?? 0),
        activePasses: Number(st.active_exit_passes ?? 0),
      });
    } catch {}
  }, [allowSchoolSetup]);

  const loadAuditLogs = useCallback(async () => {
    if (!allowAuditLogs) return;
    setLogsLoading(true);
    try {
      const params: Record<string, string | number> = { nocache: 1, limit: 100 };
      if (logActionFilter && logActionFilter !== 'ALL') {
        params.action = logActionFilter;
      }
      const cleanQ = cleanText(logSearch, 80);
      if (cleanQ) {
        params.search = cleanQ;
      }
      const res = await apiClient.get(ENDPOINTS.AUDIT_LOGS, { params });
      if (!isMountedRef.current || !res.data) return;
      const list = res.data.records || res.data.results || (Array.isArray(res.data) ? res.data : []);
      setAuditLogs(list.slice(0, 100));
    } catch {}
    finally {
      if (isMountedRef.current) setLogsLoading(false);
    }
  }, [allowAuditLogs, logActionFilter, logSearch]);

  useEffect(() => {
    isMountedRef.current = true;
    void getMobileAlarmsEnabled().then((val) => {
      if (isMountedRef.current) setAlarmsEnabled(val);
    });
    void fetchProfile();
    void loadSchoolConfig();
    void loadMaintenanceHealth();
    return () => {
      isMountedRef.current = false;
      abortRef.current?.abort();
    };
  }, [fetchProfile, loadSchoolConfig, loadMaintenanceHealth]);

  useEffect(() => {
    if (!allowAuditLogs) return;
    const timer = setTimeout(() => {
      void loadAuditLogs();
    }, logSearch.trim() ? 250 : 0);
    return () => clearTimeout(timer);
  }, [allowAuditLogs, loadAuditLogs, logSearch]);

  const handleToggleMobileAlarms = (nextVal: boolean) => {
    setAlarmsEnabled(nextVal);
    void setMobileAlarmsEnabled(nextVal);
    DeviceEventEmitter.emit('attendsure:alarms-enabled-changed', { enabled: nextVal });
  };

  const handleTriggerTestAlarm = (kind: AlarmToneKind) => {
    DeviceEventEmitter.emit('attendsure:test-alarm', { kind });
  };

  const handleSaveProfile = async () => {
    const cleanFirst = cleanText(firstName, 80);
    const cleanMiddle = cleanText(middleName, 80);
    const cleanLast = cleanText(lastName, 80);
    const cleanEmail = cleanText(email, 120);
    const cleanPhone = cleanText(contactNumber, 20);
    const cleanCurrentPassword = currentPassword.replace(/[\r\n\t]/g, '').trim();
    const cleanPassword = newPassword.replace(/[\r\n\t]/g, '').trim();

    if (!cleanFirst || !cleanLast) {
      showNotice('Missing Name', 'First name and last name are required.');
      return;
    }
    if (cleanEmail && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(cleanEmail)) {
      showNotice('Invalid Email', 'Please enter a valid email address.');
      return;
    }
    if (cleanPassword && cleanPassword.length < 8) {
      showNotice('Password Too Short', 'Your new password must be at least 8 characters long.');
      return;
    }
    if (cleanPassword && !cleanCurrentPassword) {
      showNotice('Current Password Required', 'Enter your current password to set a new password.');
      return;
    }

    setSaving(true);
    try {
      if (cleanPassword) {
        const pwRes = await apiClient.post<{ token?: string }>(ENDPOINTS.CHANGE_PASSWORD, {
          current_password: cleanCurrentPassword,
          new_password: cleanPassword,
        });
        if (!isMountedRef.current) return;
        if (pwRes.data?.token) {
          await updateSessionToken(pwRes.data.token);
        }
      }

      const payload: Record<string, string | boolean | null> = {
        first_name: cleanFirst,
        middle_name: cleanMiddle,
        last_name: cleanLast,
        contact_number: cleanPhone,
        email: cleanEmail,
      };
      if (photoRemoved) {
        payload.photo = null;
        payload.remove_photo = true;
      } else if (newPhotoBase64 && isSafeUrl(newPhotoBase64)) {
        payload.photo = newPhotoBase64;
      }

      const res = await apiClient.put<ExtendedUserProfile>(ENDPOINTS.CURRENT_USER, payload);
      if (!isMountedRef.current) return;

      if (res.data) {
        const nextPhoto = res.data.photo_url ?? res.data.photo ?? null;
        const normalizedProfile = { ...res.data, photo: nextPhoto, photo_url: nextPhoto };
        setProfile(normalizedProfile);
        AsyncStorage.setItem(SETTINGS_PROFILE_CACHE_KEY, JSON.stringify(normalizedProfile)).catch(() => {});
        await updateUser(normalizedProfile as Partial<NonNullable<typeof user>>);
      }

      setCurrentPassword('');
      setNewPassword('');
      setNewPhotoBase64(null);
      setPhotoPreview(null);
      setPhotoRemoved(false);
      showNotice(
        'Saved',
        cleanPassword ? 'Your profile and password have been updated.' : 'Your account details have been updated.'
      );
    } catch (err: unknown) {
      if (!isMountedRef.current) return;
      showNotice('Update Failed', getFriendlyErrorMessage(err, 'Could not save your account changes.'));
    } finally {
      if (isMountedRef.current) setSaving(false);
    }
  };

  const handleSaveSchoolConfig = async () => {
    if (!schoolForm.school_name.trim()) {
      showNotice('School Name Required', 'Please enter the official school name.');
      return;
    }
    setSchoolSaving(true);
    try {
      const lat = schoolForm.latitude.trim() ? Number(schoolForm.latitude) : undefined;
      const lng = schoolForm.longitude.trim() ? Number(schoolForm.longitude) : undefined;
      const rad = Number(schoolForm.geofence_radius_meters) || 150;

      const payload: Record<string, unknown> = {
        school_name: cleanText(schoolForm.school_name, 160),
        school_id: cleanText(schoolForm.school_id, 40),
        academic_year: cleanText(schoolForm.academic_year, 20),
        region: cleanText(schoolForm.region, 80),
        division: cleanText(schoolForm.division, 120),
        district: cleanText(schoolForm.district, 120),
        principal_teacher: schoolForm.principal_teacher ? Number(schoolForm.principal_teacher) : null,
        superintendent_name: cleanText(schoolForm.superintendent_name, 150),
        address: cleanText(schoolForm.address, 250),
        contact_number: cleanText(schoolForm.contact_number, 40),
        email: cleanText(schoolForm.email, 150),
        website: cleanText(schoolForm.website, 200),
        weekend_rest_enabled: schoolForm.weekend_rest_enabled,
        geofence_radius_meters: Math.max(20, Math.min(5000, rad)),
      };
      if (lat !== undefined && Number.isFinite(lat)) payload.latitude = lat;
      if (lng !== undefined && Number.isFinite(lng)) payload.longitude = lng;

      (['school_logo', 'left_logo', 'right_logo'] as const).forEach((key) => {
        if (key in logoUploads) {
          payload[key] = logoUploads[key];
        }
      });

      await apiClient.put(ENDPOINTS.SCHOOL_PROFILE, payload);
      showNotice('Saved', 'School profile, logos, and campus boundary saved.');
      await loadSchoolConfig();
    } catch (err: unknown) {
      showNotice('Save Failed', getFriendlyErrorMessage(err, 'Could not save school configuration.'));
    } finally {
      if (isMountedRef.current) setSchoolSaving(false);
    }
  };

  const runMaintenanceAction = async (key: MaintenanceActionKey) => {
    setMaintBusy(key);
    try {
      if (key === 'AUDIT') {
        const res = await apiClient.post(ENDPOINTS.SYSTEM_STATUS, { action: 'RUN_LOAFING_AUDIT' });
        showNotice(
          'Cutting Audit Complete',
          res.data?.message || 'Student cutting class audit finished.'
        );
      } else if (key === 'CACHE') {
        await apiClient.post(ENDPOINTS.FLUSH_CACHE);
        showNotice('Memory Cleared', 'Server cache cleared cleanly.');
      } else if (key === 'STATUS') {
        await loadMaintenanceHealth();
        showNotice('Services Checked', 'Live database and attendance services refreshed.');
      } else if (key === 'UNLOCK') {
        const res = await apiClient.post(ENDPOINTS.UNLOCK_ACCOUNTS);
        showNotice(
          'Accounts Unlocked',
          res.data?.message || 'All locked teacher accounts have been unlocked.'
        );
      }
      await loadMaintenanceHealth();
    } catch (err: unknown) {
      showNotice('Action Failed', getFriendlyErrorMessage(err, 'Could not run maintenance action.'));
    } finally {
      if (isMountedRef.current) setMaintBusy(null);
    }
  };

  const handleSignOut = () => {
    confirmAction('Sign Out', 'Sign out of AttendSure on this device?', 'Sign Out', () => void logout());
  };

  const selectedPrincipal = useMemo(
    () =>
      principalCandidates.find((p) => String(p.id) === schoolForm.principal_teacher) || null,
    [principalCandidates, schoolForm.principal_teacher]
  );

  const filteredLogs = useMemo(() => {
    const q = logSearch.trim().toLowerCase();
    return auditLogs.filter((entry) => {
      if (logActionFilter !== 'ALL' && String(entry.action || '').toUpperCase() !== logActionFilter) {
        return false;
      }
      if (!q) return true;
      return `${entry.actor_name || ''} ${entry.actor_username || ''} ${entry.user || ''} ${entry.action || ''} ${entry.action_label || ''} ${entry.module || ''} ${entry.target_model || ''} ${entry.details || ''} ${entry.ip_address || ''}`
        .toLowerCase()
        .includes(q);
    });
  }, [auditLogs, logSearch, logActionFilter]);

  const qrPayload = JSON.stringify({
    app: 'ATTENDSURE_TEACHER_PASS',
    id: cleanText(String(profile?.employee_id || profile?.username || 'TEACHER'), 40),
    name: cleanText(profile?.full_name || `${firstName} ${lastName}`.trim(), 120),
    role: cleanText(profile?.role || 'TEACHER', 30),
  });

  const displayProfilePhoto = photoRemoved
    ? null
    : newPhotoBase64 || photoPreview || profile?.photo_url || profile?.photo || null;

  const themeOptions: Array<{
    key: ThemeMode;
    label: string;
    icon: keyof typeof Ionicons.glyphMap;
  }> = [
    { key: 'light', label: 'Light', icon: 'sunny-outline' },
    { key: 'dark', label: 'Dark', icon: 'moon-outline' },
    { key: 'high-contrast', label: 'Daylight', icon: 'contrast-outline' },
  ];

  const visibleSubTabs: Array<{ key: SettingsSubTab; label: string }> = [
    { key: 'PROFILE', label: 'Profile & Alarms' },
    ...(allowSchoolSetup ? [{ key: 'SCHOOL' as SettingsSubTab, label: 'School & 3 Logos' }] : []),
    ...(allowSchoolSetup ? [{ key: 'MAINTENANCE' as SettingsSubTab, label: 'Maintenance' }] : []),
    ...(allowAuditLogs ? [{ key: 'LOGS' as SettingsSubTab, label: `Audit Logs (${auditLogs.length})` }] : []),
  ];

  const logoValueFor = (key: 'school_logo' | 'left_logo' | 'right_logo'): string | null =>
    key in logoUploads ? logoUploads[key] ?? null : schoolForm[key];

  return (
    <View style={styles.container}>
      {/* Sub-Tab Strip when Admin/Principal has extra tabs */}
      {visibleSubTabs.length > 1 && (
        <ChipRow<SettingsSubTab>
          variant="tab"
          options={visibleSubTabs}
          selected={activeSubTab}
          onSelect={setActiveSubTab}
          style={styles.subTabStrip}
          contentContainerStyle={styles.subTabRow}
        />
      )}

      <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
        {/* SUB-TAB 1: PROFILE, THEME, ALARMS & PERSONAL INFO */}
        {activeSubTab === 'PROFILE' && (
          <>
            <View style={styles.card}>
              <Text style={styles.cardTitle}>My Account Profile</Text>
              <Text style={styles.cardSubtitle}>
                {profile?.full_name || `${firstName} ${lastName}`.trim() || 'Teacher Account'} &bull;{' '}
                {profile?.position || profile?.role || 'Teacher'}
                {profile?.department ? ` • ${profile.department}` : ''}
              </Text>
              <ImageUploadField
                label="Profile Portrait Photo"
                helperText="Tap to update your portrait, then tap Save Changes below."
                value={displayProfilePhoto}
                serverBase={serverBase}
                variant="avatar"
                onChange={(dataUrl) => {
                  setNewPhotoBase64(dataUrl);
                  setPhotoPreview(dataUrl);
                  setPhotoRemoved(false);
                }}
                onRemove={() => {
                  setNewPhotoBase64(null);
                  setPhotoPreview(null);
                  setPhotoRemoved(true);
                }}
              />
            </View>

            {/* Color Mode Switcher */}
            <View style={styles.card}>
              <Text style={styles.cardTitle}>Display &amp; Color Mode</Text>
              <Text style={styles.cardSubtitle}>
                Choose a theme that is comfortable indoors or in bright daylight.
              </Text>
              <View style={styles.themeRow}>
                {themeOptions.map((opt) => {
                  const active = mode === opt.key;
                  return (
                    <TouchableOpacity
                      key={opt.key}
                      style={[styles.themeBtn, active && styles.themeBtnActive]}
                      onPress={() => setThemeMode(opt.key)}
                      activeOpacity={0.8}
                    >
                      <Ionicons
                        name={opt.icon}
                        size={15}
                        color={active ? palette.onPrimary : palette.textSecondary}
                      />
                      <Text style={[styles.themeBtnText, active && styles.themeBtnTextActive]}>
                        {opt.label}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </View>
            </View>

            {/* Schedule & Teacher Time In / Out Alarms */}
            <View style={styles.card}>
              <View style={styles.alarmHeaderRow}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.cardTitle}>Schedule &amp; Time In / Out Alarms</Text>
                  <Text style={[styles.cardSubtitle, { marginBottom: 0 }]}>
                    Play device alarm sound, vibration, and popup when it is time for Teacher Time In / Out or a class period.
                  </Text>
                </View>
                <Switch
                  value={alarmsEnabled}
                  onValueChange={handleToggleMobileAlarms}
                  trackColor={{ false: palette.borderStrong, true: palette.primary }}
                  thumbColor={palette.onPrimary}
                />
              </View>

              <View style={styles.alarmBtnRow}>
                <TouchableOpacity
                  style={[styles.alarmTestBtn, { backgroundColor: palette.successLight, borderColor: palette.success }]}
                  onPress={() => handleTriggerTestAlarm('TIME_IN')}
                  activeOpacity={0.8}
                >
                  <Ionicons name="alarm-outline" size={14} color={palette.success} />
                  <Text style={[styles.alarmTestBtnText, { color: palette.success }]}>Test Time In</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.alarmTestBtn, { backgroundColor: palette.warningLight, borderColor: palette.warning }]}
                  onPress={() => handleTriggerTestAlarm('TIME_OUT')}
                  activeOpacity={0.8}
                >
                  <Ionicons name="alarm-outline" size={14} color={palette.warning} />
                  <Text style={[styles.alarmTestBtnText, { color: palette.warning }]}>Test Time Out</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.alarmTestBtn, { backgroundColor: palette.primarySoft, borderColor: palette.primary }]}
                  onPress={() => handleTriggerTestAlarm('CLASS_PERIOD')}
                  activeOpacity={0.8}
                >
                  <Ionicons name="notifications-outline" size={14} color={palette.primary} />
                  <Text style={[styles.alarmTestBtnText, { color: palette.primary }]}>Test Class</Text>
                </TouchableOpacity>
              </View>
            </View>

            {/* Digital Teacher ID Pass */}
            <View style={styles.card}>
              <Text style={styles.cardTitle}>Digital Teacher ID Pass</Text>
              <Text style={styles.cardSubtitle}>
                Teacher Time In / Time Out uses Phone Fingerprint / Biometric &amp; Campus GPS inside this app.
              </Text>
              <View style={styles.qrContainer}>
                <View style={styles.qrQuietZone}>
                  <QRCode
                    value={qrPayload}
                    size={136}
                    color={QR_COLORS.foreground}
                    backgroundColor={QR_COLORS.background}
                  />
                </View>
              </View>
            </View>

            {/* Personal Information Form */}
            <View style={styles.card}>
              <Text style={styles.cardTitle}>Personal Information &amp; Password</Text>

              <Text style={styles.inputLabel}>First Name</Text>
              <TextInput
                style={styles.input}
                value={firstName}
                onChangeText={setFirstName}
                placeholder="Enter first name"
                placeholderTextColor={palette.textMuted}
                maxLength={80}
              />

              <Text style={styles.inputLabel}>Middle Name</Text>
              <TextInput
                style={styles.input}
                value={middleName}
                onChangeText={setMiddleName}
                placeholder="Enter middle name (optional)"
                placeholderTextColor={palette.textMuted}
                maxLength={80}
              />

              <Text style={styles.inputLabel}>Last Name</Text>
              <TextInput
                style={styles.input}
                value={lastName}
                onChangeText={setLastName}
                placeholder="Enter last name"
                placeholderTextColor={palette.textMuted}
                maxLength={80}
              />

              <Text style={styles.inputLabel}>Email Address</Text>
              <TextInput
                style={styles.input}
                value={email}
                onChangeText={setEmail}
                keyboardType="email-address"
                autoCapitalize="none"
                placeholder="Enter email address"
                placeholderTextColor={palette.textMuted}
                maxLength={120}
              />

              <Text style={styles.inputLabel}>Mobile Phone Number</Text>
              <TextInput
                style={styles.input}
                value={contactNumber}
                onChangeText={setContactNumber}
                keyboardType="phone-pad"
                placeholder="09XXXXXXXXX"
                placeholderTextColor={palette.textMuted}
                maxLength={20}
              />

              <Text style={styles.inputLabel}>Current Password (Required if changing password)</Text>
              <TextInput
                style={styles.input}
                value={currentPassword}
                onChangeText={setCurrentPassword}
                secureTextEntry
                placeholder="Enter current password"
                placeholderTextColor={palette.textMuted}
                maxLength={128}
              />

              <Text style={styles.inputLabel}>New Password (leave blank to keep current)</Text>
              <TextInput
                style={styles.input}
                value={newPassword}
                onChangeText={setNewPassword}
                secureTextEntry
                placeholder="Minimum 8 characters"
                placeholderTextColor={palette.textMuted}
                maxLength={128}
              />

              <TouchableOpacity
                style={[styles.saveBtn, saving && { opacity: 0.65 }]}
                onPress={() => void handleSaveProfile()}
                disabled={saving}
                activeOpacity={0.85}
              >
                {saving ? (
                  <ActivityIndicator size="small" color={palette.onPrimary} />
                ) : (
                  <Text style={styles.saveBtnText}>Save Profile Changes</Text>
                )}
              </TouchableOpacity>
            </View>

            <TouchableOpacity style={styles.signOutBtn} onPress={handleSignOut} activeOpacity={0.85}>
              <Ionicons name="log-out-outline" size={17} color={palette.onPrimary} />
              <Text style={styles.signOutBtnText}>Sign Out</Text>
            </TouchableOpacity>
          </>
        )}

        {/* SUB-TAB 2: ADMIN SCHOOL PROFILE, PRINCIPAL PICKER & ALL 3 LOGOS */}
        {activeSubTab === 'SCHOOL' && allowSchoolSetup && (
          <SchoolSetupSection
            schoolForm={schoolForm}
            setSchoolForm={setSchoolForm}
            principalCandidates={principalCandidates}
            selectedPrincipal={selectedPrincipal}
            serverBase={serverBase}
            logoValueFor={logoValueFor}
            onLogoChange={(key, dataUrl) => setLogoUploads((p) => ({ ...p, [key]: dataUrl }))}
            onLogoRemove={(key) => setLogoUploads((p) => ({ ...p, [key]: null }))}
            schoolSaving={schoolSaving}
            onSave={() => void handleSaveSchoolConfig()}
          />
        )}

        {/* SUB-TAB 3: SYSTEM MAINTENANCE & LIVE HEALTH */}
        {activeSubTab === 'MAINTENANCE' && allowSchoolSetup && (
          <MaintenanceSection
            healthStats={healthStats}
            maintBusy={maintBusy}
            onRunAction={(key) => void runMaintenanceAction(key)}
          />
        )}

        {/* SUB-TAB 4: AUDIT LOGS WITH SEARCH & ACTION FILTERS */}
        {activeSubTab === 'LOGS' && allowAuditLogs && (
          <AuditLogsSection
            logs={filteredLogs}
            loading={logsLoading}
            search={logSearch}
            onSearchChange={setLogSearch}
            actionFilter={logActionFilter}
            onActionFilterChange={setLogActionFilter}
            onRefresh={() => void loadAuditLogs()}
          />
        )}
      </ScrollView>
    </View>
  );
};

const createStyles = (palette: ThemePalette, fonts: ReturnType<typeof useThemeMode>['fonts']) =>
  StyleSheet.create({
    container: { flex: 1, backgroundColor: palette.background },
    subTabStrip: { flexGrow: 0, maxHeight: 50, marginTop: 10 },
    subTabRow: { paddingHorizontal: 14, gap: 6, alignItems: 'center' },
    scrollContent: { padding: 14, paddingBottom: 120, gap: 12 },
    card: {
      backgroundColor: palette.surface,
      borderRadius: 16,
      padding: 16,
      borderWidth: 1,
      borderColor: palette.border,
      gap: 8,
    },
    cardTitle: { fontSize: fonts.md, fontWeight: fonts.weight.extrabold, color: palette.textPrimary },
    cardSubtitle: { fontSize: fonts.xs, color: palette.textSecondary, lineHeight: 17 },
    themeRow: { flexDirection: 'row', gap: 8, marginTop: 4 },
    themeBtn: {
      flex: 1,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 5,
      height: 40,
      borderRadius: 10,
      backgroundColor: palette.surfaceSubtle,
      borderWidth: 1,
      borderColor: palette.border,
    },
    themeBtnActive: { backgroundColor: palette.buttonBg, borderColor: palette.buttonBg },
    themeBtnText: { fontSize: fonts.xs, fontWeight: fonts.weight.extrabold, color: palette.textSecondary },
    themeBtnTextActive: { color: palette.onPrimary },
    alarmHeaderRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
    alarmBtnRow: { flexDirection: 'row', gap: 6, marginTop: 4 },
    alarmTestBtn: {
      flex: 1,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 4,
      height: 36,
      borderRadius: 9,
      borderWidth: 1,
    },
    alarmTestBtnText: { fontSize: fonts.xxs, fontWeight: fonts.weight.extrabold },
    qrContainer: { alignItems: 'center', marginTop: 4 },
    qrQuietZone: {
      backgroundColor: QR_COLORS.background,
      padding: 12,
      borderRadius: 12,
      borderWidth: 1,
      borderColor: palette.border,
    },
    inputLabel: { fontSize: fonts.xs, fontWeight: fonts.weight.bold, color: palette.textSecondary, marginTop: 4 },
    input: {
      backgroundColor: palette.surfaceSubtle,
      borderWidth: 1,
      borderColor: palette.borderStrong,
      borderRadius: 10,
      paddingHorizontal: 12,
      height: 42,
      fontSize: fonts.sm,
      color: palette.textPrimary,
    },
    saveBtn: {
      backgroundColor: palette.buttonBg,
      borderRadius: 12,
      height: 46,
      alignItems: 'center',
      justifyContent: 'center',
      marginTop: 8,
    },
    saveBtnText: { color: palette.onPrimary, fontSize: fonts.sm, fontWeight: fonts.weight.extrabold },
    signOutBtn: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 8,
      backgroundColor: palette.dangerBg,
      borderRadius: 12,
      height: 46,
    },
    signOutBtnText: { color: palette.onPrimary, fontSize: fonts.sm, fontWeight: fonts.weight.extrabold },
  });

export default SettingsScreen;
