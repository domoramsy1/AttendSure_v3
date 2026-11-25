// AttendSure Mobile - Main Tab Navigator
// File: D:\AttendSure_V3\mobile\src\navigation\MainTabNavigator.tsx

/**
 * AttendSure Mobile - Main 5-Tab Navigator (Teachers & School Leaders Only)
 * File: mobile/src/navigation/MainTabNavigator.tsx
 */

import React, { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import {
  View,
  StyleSheet,
  TouchableOpacity,
  Text,
  Platform,
  ScrollView,
  RefreshControl,
  ActivityIndicator,
  TextInput,
  DeviceEventEmitter,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { apiClient } from '../api/client';
import { ENDPOINTS } from '../api/endpoints';
import { useAuth } from '../context/AuthContext';
import { useThemeMode } from '../context/ThemeContext';
import { getFriendlyErrorMessage, type ThemePalette } from '../constants/theme';
import { canScanStudentQr, canViewTab, canViewTeacherDirectory } from '../utils/permissions';
import { isCanceledError, showNotice } from '../utils/helpers';
import {
  startScheduleAlarmLoop,
  stopScheduleAlarmLoop,
  type AlarmToneKind,
} from '../services/soundService';
import {
  buildTestMobileAlarm,
  evaluateDueMobileAlarm,
  fireOptionalLocalAlert,
  getLocalDateStamp,
  getMobileAlarmsEnabled,
  markMobileAlarmDismissed,
  type MobileAlarmEvent,
  type MobileAlarmPeriod,
  type MobileAlarmSnapshot,
} from '../services/scheduleAlarmService';
import ScheduleAlarmModal from '../components/common/ScheduleAlarmModal';

import DashboardScreen from '../screens/DashboardScreen';
import ScannerScreen from '../screens/ScannerScreen';
import GeofenceStatusScreen from '../screens/GeofenceStatusScreen';
import GatePassScreen from '../screens/GatePassScreen';
import MenuScreen from '../screens/MenuScreen';
import CalendarScreen from '../screens/CalendarScreen';
import ReportsScreen from '../screens/ReportsScreen';
import SettingsScreen from '../screens/SettingsScreen';
import AdvisoryMatrixScreen from '../screens/AdvisoryMatrixScreen';
import StudentsScreen from '../screens/StudentsScreen';
import TeachersScreen from '../screens/TeachersScreen';
import SchedulesScreen from '../screens/SchedulesScreen';
import UsersScreen from '../screens/UsersScreen';
import SardoSafetyScreen from '../screens/SardoSafetyScreen';
import UserManualScreen from '../screens/UserManualScreen';
import DTRReportView, { DTRReportData } from '../components/reports/DTRReportView';
import OnboardingGuideModal from '../components/help/OnboardingGuideModal';
import { resolveUserProfileKey } from '../components/help/manualContent';

export type TabType =
  | 'home'
  | 'scanner'
  | 'geofence'
  | 'gate_pass'
  | 'menu'
  | 'class_list'
  | 'students'
  | 'teachers'
  | 'schedules'
  | 'users'
  | 'reports'
  | 'calendar'
  | 'settings'
  | 'sardo_safety'
  | 'help'
  | 'dtr';

export const MainTabNavigator: React.FC = () => {
  const insets = useSafeAreaInsets();
  const { user } = useAuth();
  const { palette, fonts } = useThemeMode();
  const styles = useMemo(() => createStyles(palette, fonts), [palette, fonts]);
  const [activeTab, setActiveTab] = useState<TabType>('home');
  const [isTourOpen, setIsTourOpen] = useState<boolean>(false);
  const autoTourPromptedRef = useRef<string | null>(null);

  const userProfileKey = useMemo(
    () =>
      resolveUserProfileKey(
        user?.role || user?.system_role,
        user?.can_handle_classes ?? user?.can_teach ?? true
      ),
    [user?.role, user?.system_role, user?.can_handle_classes, user?.can_teach]
  );

  useEffect(() => {
    if (!user) {
      autoTourPromptedRef.current = null;
      setIsTourOpen(false);
      return;
    }
    const tourKey = `${user.id}:${user.current_onboarding_version ?? 1}`;
    if (user.needs_onboarding === true && autoTourPromptedRef.current !== tourKey) {
      autoTourPromptedRef.current = tourKey;
      setIsTourOpen(true);
    }
  }, [user]);

  useEffect(() => {
    const openTourSub = DeviceEventEmitter.addListener('attendsure:open-onboarding-tour', () => {
      setIsTourOpen(true);
    });
    const openManualSub = DeviceEventEmitter.addListener('attendsure:open-user-manual', () => {
      setActiveTab('help');
    });
    return () => {
      openTourSub.remove();
      openManualSub.remove();
    };
  }, []);

  useEffect(() => {
    if (!canViewTab(user, activeTab)) {
      setActiveTab('home');
    }
  }, [user, activeTab]);

  // Foreground + background campus GPS tracking is managed centrally by TeacherDutyLocationProvider

  const [dtrMonth, setDtrMonth] = useState<number>(new Date().getMonth() + 1);
  const [dtrYear, setDtrYear] = useState<number>(new Date().getFullYear());
  const [dtrTeachers, setDtrTeachers] = useState<Array<{ id: number; full_name: string; employee_id?: string }>>([]);
  const [selectedDtrTeacherId, setSelectedDtrTeacherId] = useState<number | null>(null);
  const [dtrRegularHours, setDtrRegularHours] = useState<string>('8:00 AM - 12:00 PM / 1:00 PM - 5:00 PM');
  const [dtrSaturdayHours, setDtrSaturdayHours] = useState<string>('As Required');
  const [dtrData, setDtrData] = useState<DTRReportData | null>(null);
  const [dtrLoading, setDtrLoading] = useState<boolean>(false);
  const [dtrSubmitting, setDtrSubmitting] = useState<boolean>(false);
  const allowDtrSwitcher = canViewTeacherDirectory(user);

  const isMounted = useRef<boolean>(true);
  const dtrAbortRef = useRef<AbortController | null>(null);

  const [alarmsEnabled, setAlarmsEnabled] = useState<boolean>(true);
  const alarmsEnabledRef = useRef<boolean>(true);
  alarmsEnabledRef.current = alarmsEnabled;

  const [activeAlarm, setActiveAlarm] = useState<MobileAlarmEvent | null>(null);
  const activeAlarmRef = useRef<MobileAlarmEvent | null>(null);
  activeAlarmRef.current = activeAlarm;

  const alarmSnapshotRef = useRef<MobileAlarmSnapshot>({
    dutyStartTime: '',
    dutyEndTime: '',
    isTimedInToday: false,
    periods: [],
  });
  const alarmSnoozeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const triggerMobileAlarm = useCallback((ev: MobileAlarmEvent) => {
    if (!isMounted.current) return;
    setActiveAlarm(ev);
    startScheduleAlarmLoop(ev.kind);
    fireOptionalLocalAlert(ev.title, `${ev.timeLabel} — ${ev.detail}`);
  }, []);

  const handleDismissAlarm = useCallback(() => {
    stopScheduleAlarmLoop();
    if (alarmSnoozeTimerRef.current) {
      clearTimeout(alarmSnoozeTimerRef.current);
      alarmSnoozeTimerRef.current = null;
    }
    const current = activeAlarmRef.current;
    if (current && !current.id.startsWith('TEST_')) {
      void markMobileAlarmDismissed(getLocalDateStamp(), current.id);
    }
    setActiveAlarm(null);
  }, []);

  const handleSnoozeAlarm = useCallback(() => {
    stopScheduleAlarmLoop();
    const current = activeAlarmRef.current;
    setActiveAlarm(null);
    if (!current) return;
    if (alarmSnoozeTimerRef.current) {
      clearTimeout(alarmSnoozeTimerRef.current);
    }
    alarmSnoozeTimerRef.current = setTimeout(() => {
      alarmSnoozeTimerRef.current = null;
      if (isMounted.current && alarmsEnabledRef.current) {
        triggerMobileAlarm({ ...current, subtitle: `${current.subtitle} (Snoozed)` });
      }
    }, 5 * 60 * 1000);
  }, [triggerMobileAlarm]);

  useEffect(() => {
    void getMobileAlarmsEnabled().then((enabled) => {
      if (isMounted.current) setAlarmsEnabled(enabled);
    });

    const toggleSub = DeviceEventEmitter.addListener(
      'attendsure:alarms-enabled-changed',
      (payload?: { enabled?: boolean }) => {
        const next = payload?.enabled !== false;
        setAlarmsEnabled(next);
        if (!next) {
          stopScheduleAlarmLoop();
          if (alarmSnoozeTimerRef.current) {
            clearTimeout(alarmSnoozeTimerRef.current);
            alarmSnoozeTimerRef.current = null;
          }
          setActiveAlarm(null);
        }
      }
    );

    const testSub = DeviceEventEmitter.addListener(
      'attendsure:test-alarm',
      (payload?: { kind?: AlarmToneKind }) => {
        const kind: AlarmToneKind = payload?.kind || 'TIME_IN';
        triggerMobileAlarm(buildTestMobileAlarm(kind));
      }
    );

    return () => {
      toggleSub.remove();
      testSub.remove();
      stopScheduleAlarmLoop();
      if (alarmSnoozeTimerRef.current) {
        clearTimeout(alarmSnoozeTimerRef.current);
        alarmSnoozeTimerRef.current = null;
      }
    };
  }, [triggerMobileAlarm]);

  useEffect(() => {
    if (!user || !alarmsEnabled) {
      stopScheduleAlarmLoop();
      return;
    }
    let active = true;
    const controller = new AbortController();

    const syncAlarmData = async () => {
      try {
        const [campusRes, classesRes] = await Promise.allSettled([
          apiClient.get<{
            duty_start_time?: string;
            duty_end_time?: string;
            teacher_list?: Array<{
              teacher_id?: number;
              user_id?: number;
              is_clocked_in?: boolean;
              time_in?: string | null;
              time_out?: string | null;
            }>;
          }>(ENDPOINTS.CAMPUS_OVERVIEW, { signal: controller.signal }),
          canScanStudentQr(user)
            ? apiClient.get<
                | Array<{
                    id: number;
                    subject_code?: string;
                    subject_title?: string;
                    subject_name?: string;
                    section_name?: string;
                    room_number?: string;
                    room?: string;
                    start_time?: string;
                    end_time?: string;
                    day_of_week?: string;
                  }>
                | { results?: Array<Record<string, unknown>> }
              >(ENDPOINTS.ATTENDANCE_CLASSES, {
                params: { summary: 1 },
                signal: controller.signal,
              })
            : Promise.resolve({ data: [] }),
        ]);

        if (!active || controller.signal.aborted) return;

        let dutyStartTime = '';
        let dutyEndTime = '';
        let isTimedInToday = false;

        if (campusRes.status === 'fulfilled' && campusRes.value?.data) {
          const campus = campusRes.value.data;
          const ownTeacher = Array.isArray(campus.teacher_list)
            ? campus.teacher_list.find(
                (t) =>
                  (user.teacher_id && Number(t.teacher_id) === Number(user.teacher_id)) ||
                  (user.id && Number(t.user_id) === Number(user.id))
              )
            : undefined;

          if (ownTeacher || String(user.role || '').toUpperCase() === 'TEACHER') {
            dutyStartTime = String(campus.duty_start_time || '');
            dutyEndTime = String(campus.duty_end_time || '');
            isTimedInToday = Boolean(
              ownTeacher?.is_clocked_in || (ownTeacher?.time_in && !ownTeacher?.time_out)
            );
          }
        }

        let periods: MobileAlarmPeriod[] = [];
        if (classesRes.status === 'fulfilled' && classesRes.value?.data) {
          const rawData = classesRes.value.data;
          const rawList = Array.isArray(rawData)
            ? rawData
            : Array.isArray((rawData as { results?: unknown[] }).results)
              ? (rawData as { results: Array<Record<string, unknown>> }).results
              : [];
          periods = rawList
            .filter((item) => Boolean(item && item.start_time))
            .map((item) => ({
              id: Number(item.id || 0),
              subject_code: String(item.subject_code || ''),
              subject_name: String(item.subject_title || item.subject_name || item.subject_code || 'Class Period'),
              section_name: String(item.section_name || ''),
              room: String(item.room_number || item.room || ''),
              start_time: String(item.start_time || ''),
              end_time: String(item.end_time || ''),
              day_of_week: String(item.day_of_week || 'ALL_WEEKDAYS'),
            }));
        }

        alarmSnapshotRef.current = {
          dutyStartTime,
          dutyEndTime,
          isTimedInToday,
          periods,
        };
      } catch {
        // Ignore transient network errors while syncing alarm schedule
      }
    };

    const tickEvaluate = async () => {
      if (!active || activeAlarmRef.current || !alarmsEnabledRef.current) return;
      const due = await evaluateDueMobileAlarm(alarmSnapshotRef.current, new Date());
      if (due && active && !activeAlarmRef.current) {
        triggerMobileAlarm(due);
      }
    };

    void syncAlarmData().then(() => void tickEvaluate());
    const syncInterval = setInterval(() => void syncAlarmData(), 5 * 60 * 1000);
    const tickInterval = setInterval(() => void tickEvaluate(), 15 * 1000);
    const attUpdateSub = DeviceEventEmitter.addListener('attendsure:attendance-updated', () => {
      void syncAlarmData();
    });

    return () => {
      active = false;
      controller.abort();
      clearInterval(syncInterval);
      clearInterval(tickInterval);
      attUpdateSub.remove();
    };
  }, [user, alarmsEnabled, triggerMobileAlarm]);

  const fetchDTR = useCallback(
    async (silent = false) => {
      dtrAbortRef.current?.abort();
      const controller = new AbortController();
      dtrAbortRef.current = controller;

      if (!silent && isMounted.current) setDtrLoading(true);
      const cacheKey = `attendsure_dtr_menu_${selectedDtrTeacherId || 'self'}_${dtrMonth}_${dtrYear}`;

      try {
        const cached = await AsyncStorage.getItem(cacheKey);
        if (cached && isMounted.current && !controller.signal.aborted) {
          setDtrData(JSON.parse(cached));
        }
      } catch {}

      try {
        const params: Record<string, number> = { month: dtrMonth, year: dtrYear };
        if (allowDtrSwitcher && selectedDtrTeacherId) {
          params.teacher_id = selectedDtrTeacherId;
        }
        const [res, teachersRes] = await Promise.allSettled([
          apiClient.get<DTRReportData>(ENDPOINTS.EMPLOYEE_DTR, {
            params,
            signal: controller.signal,
          }),
          allowDtrSwitcher && dtrTeachers.length === 0
            ? apiClient.get(ENDPOINTS.TEACHERS_DROPDOWN, { signal: controller.signal })
            : Promise.resolve(null),
        ]);
        if (isMounted.current && !controller.signal.aborted) {
          if (teachersRes.status === 'fulfilled' && teachersRes.value?.data) {
            const rawT = teachersRes.value.data;
            setDtrTeachers(Array.isArray(rawT) ? rawT : Array.isArray(rawT?.results) ? rawT.results : []);
          }
          if (res.status === 'fulfilled' && res.value?.data) {
            const payload = res.value.data;
            setDtrData(payload);
            if (payload.regular_days_hours) setDtrRegularHours(payload.regular_days_hours);
            if (payload.saturdays_hours) setDtrSaturdayHours(payload.saturdays_hours);
            await AsyncStorage.setItem(cacheKey, JSON.stringify(payload)).catch(() => {});
          }
        }
      } catch (err: unknown) {
        if (isCanceledError(err)) return;
      } finally {
        if (isMounted.current && !silent) {
          setDtrLoading(false);
        }
      }
    },
    [dtrMonth, dtrYear, allowDtrSwitcher, selectedDtrTeacherId, dtrTeachers.length]
  );

  useEffect(() => {
    isMounted.current = true;
    return () => {
      isMounted.current = false;
      dtrAbortRef.current?.abort();
    };
  }, []);

  useEffect(() => {
    if (activeTab === 'dtr') {
      void fetchDTR(false);
    }
    return () => {
      dtrAbortRef.current?.abort();
    };
  }, [activeTab, fetchDTR]);

  const handleSubmitDtr = async (action: 'SUBMIT_DTR' | 'APPROVE_DEPT_HEAD' = 'SUBMIT_DTR') => {
    if (!dtrData || dtrSubmitting) return;
    setDtrSubmitting(true);
    try {
      const encodedTeacherId = encodeURIComponent(String(dtrData.teacher_id));
      await apiClient.post(`${ENDPOINTS.EMPLOYEE_DTR}${encodedTeacherId}/`, {
        action,
        teacher_id: dtrData.teacher_id,
        month: dtrData.month_number,
        year: dtrData.year,
        regular_days_hours: dtrRegularHours.trim() || dtrData.regular_days_hours,
        saturdays_hours: dtrSaturdayHours.trim() || dtrData.saturdays_hours,
      });
      showNotice(
        action === 'APPROVE_DEPT_HEAD' ? 'Approved' : 'Submitted',
        action === 'APPROVE_DEPT_HEAD'
          ? 'Daily Time Record approved and verified.'
          : 'Your Daily Time Record has been sent to your Department Head.'
      );
      void fetchDTR(true);
    } catch (err: unknown) {
      showNotice(
        'Unable to Update DTR',
        getFriendlyErrorMessage(err, 'Could not submit Daily Time Record right now.')
      );
    } finally {
      if (isMounted.current) setDtrSubmitting(false);
    }
  };

  const renderSubHeader = (title: string, subtitle: string, backTarget: TabType = 'menu') => (
    <View style={[styles.subHeader, { paddingTop: Math.max(insets.top, 14) }]}>
      <View style={styles.subHeaderTop}>
        <TouchableOpacity
          style={styles.backCircle}
          onPress={() => setActiveTab(backTarget)}
          activeOpacity={0.75}
          accessibilityLabel="Go back"
        >
          <Ionicons name="arrow-back" size={20} color={palette.onPrimary} />
        </TouchableOpacity>
        <View style={styles.subHeaderTextWrap}>
          <Text style={styles.subHeaderEyebrow}>ACCOUNT &amp; TOOLS</Text>
          <Text style={styles.subHeaderTitle} numberOfLines={1}>
            {title}
          </Text>
          <Text style={styles.subHeaderSubtitle} numberOfLines={1}>
            {subtitle}
          </Text>
        </View>
      </View>
    </View>
  );

  const allowStudentQr = canScanStudentQr(user);

  // Strict 5-Tab Bottom Dock: Overview, Scanner/Time In/Out, Geofence, Passes, Account
  const navItems: Array<{
    key: TabType;
    label: string;
    icon: keyof typeof Ionicons.glyphMap;
    activeIcon: keyof typeof Ionicons.glyphMap;
  }> = useMemo(
    () => [
      { key: 'home', label: 'Overview', icon: 'home-outline', activeIcon: 'home' },
      {
        key: 'scanner',
        label: allowStudentQr ? 'Scanner' : 'Time In/Out',
        icon: allowStudentQr ? 'scan-outline' : 'finger-print-outline',
        activeIcon: allowStudentQr ? 'scan' : 'finger-print',
      },
      { key: 'geofence', label: 'Geofence', icon: 'navigate-outline', activeIcon: 'navigate' },
      { key: 'gate_pass', label: 'Passes', icon: 'clipboard-outline', activeIcon: 'clipboard' },
      { key: 'menu', label: 'Account', icon: 'person-outline', activeIcon: 'person' },
    ],
    [allowStudentQr]
  );

  const accountSubTabs: TabType[] = [
    'menu',
    'class_list',
    'students',
    'teachers',
    'schedules',
    'users',
    'settings',
    'sardo_safety',
    'calendar',
    'dtr',
    'reports',
    'help',
  ];
  const resolvedNavKey: TabType = accountSubTabs.includes(activeTab) ? 'menu' : activeTab;

  return (
    <View style={styles.container}>
      <View style={styles.screenContainer}>
        {activeTab === 'home' && <DashboardScreen onNavigate={setActiveTab} />}
        {activeTab === 'scanner' && <ScannerScreen />}
        {activeTab === 'geofence' && <GeofenceStatusScreen onNavigate={setActiveTab} />}
        {activeTab === 'gate_pass' && <GatePassScreen />}
        {activeTab === 'menu' && <MenuScreen onSelectScreen={setActiveTab} />}

        {activeTab === 'class_list' && canViewTab(user, 'class_list') && (
          <View style={styles.subScreenFill}>
            {renderSubHeader('Class List & Matrix', 'Adviser & subject attendance tracking', 'menu')}
            <AdvisoryMatrixScreen />
          </View>
        )}
        {activeTab === 'students' && canViewTab(user, 'students') && (
          <View style={styles.subScreenFill}>
            {renderSubHeader('Students Directory', 'Add, edit, enroll and view QR ID passes', 'menu')}
            <StudentsScreen />
          </View>
        )}
        {activeTab === 'teachers' && canViewTab(user, 'teachers') && (
          <View style={styles.subScreenFill}>
            {renderSubHeader('Teachers', 'Manage teacher profiles and bound phones', 'menu')}
            <TeachersScreen />
          </View>
        )}
        {activeTab === 'schedules' && canViewTab(user, 'schedules') && (
          <View style={styles.subScreenFill}>
            {renderSubHeader('Academic Setup & Schedules', 'Sections, subjects and class periods', 'menu')}
            <SchedulesScreen />
          </View>
        )}
        {activeTab === 'users' && canViewTab(user, 'users') && (
          <View style={styles.subScreenFill}>
            {renderSubHeader('User Accounts & Roles', 'Create, update and manage login accounts', 'menu')}
            <UsersScreen />
          </View>
        )}
        {activeTab === 'reports' && canViewTab(user, 'reports') && (
          <View style={styles.subScreenFill}>
            {renderSubHeader('DepEd School Forms', 'SF1, SF2, SF4 and Form 48 records', 'menu')}
            <ReportsScreen embedded />
          </View>
        )}
        {activeTab === 'calendar' && (
          <View style={styles.subScreenFill}>
            {renderSubHeader('School Calendar', 'Suspensions, holidays and schedules', 'menu')}
            <CalendarScreen />
          </View>
        )}
        {activeTab === 'settings' && (
          <View style={styles.subScreenFill}>
            {renderSubHeader('Settings & School Setup', 'Profile, logos, alarms, maintenance & logs', 'menu')}
            <SettingsScreen />
          </View>
        )}
        {activeTab === 'sardo_safety' && canViewTab(user, 'sardo_safety') && (
          <View style={styles.subScreenFill}>
            {renderSubHeader('SARDO & Campus Safety', 'Early-warning, roll-call & division export', 'menu')}
            <SardoSafetyScreen />
          </View>
        )}
        {activeTab === 'help' && (
          <View style={styles.subScreenFill}>
            {renderSubHeader('User Manual & Help', 'Everyday step-by-step guides & quick fixes', 'menu')}
            <UserManualScreen onStartTour={() => setIsTourOpen(true)} />
          </View>
        )}
        {activeTab === 'dtr' && (
          <View style={styles.subScreenFill}>
            {renderSubHeader('Daily Time Record', 'Civil Service Form No. 48', 'menu')}
            <ScrollView
              contentContainerStyle={styles.subScreenScroll}
              showsVerticalScrollIndicator={false}
              refreshControl={
                <RefreshControl
                  refreshing={dtrLoading}
                  onRefresh={() => void fetchDTR(false)}
                  colors={[palette.primary]}
                  tintColor={palette.primary}
                />
              }
            >
              {/* Leader Teacher Switcher (Parity with Web DTRTab) */}
              {allowDtrSwitcher && dtrTeachers.length > 0 && (
                <View style={styles.dtrControlsCard}>
                  <Text style={styles.dtrControlsLabel}>INSPECT TEACHER DTR</Text>
                  <ScrollView
                    horizontal
                    nestedScrollEnabled
                    showsHorizontalScrollIndicator={false}
                    style={{ flexGrow: 0, flexShrink: 0 }}
                    contentContainerStyle={{ gap: 8, paddingVertical: 4, alignItems: 'center' }}
                  >
                    <TouchableOpacity
                      style={[
                        styles.dtrChip,
                        selectedDtrTeacherId === null && styles.dtrChipActive,
                      ]}
                      onPress={() => setSelectedDtrTeacherId(null)}
                    >
                      <Text
                        style={[
                          styles.dtrChipText,
                          selectedDtrTeacherId === null && styles.dtrChipTextActive,
                        ]}
                      >
                        My DTR
                      </Text>
                    </TouchableOpacity>
                    {dtrTeachers.map((t) => {
                      const active = selectedDtrTeacherId === t.id;
                      return (
                        <TouchableOpacity
                          key={t.id}
                          style={[styles.dtrChip, active && styles.dtrChipActive]}
                          onPress={() => setSelectedDtrTeacherId(t.id)}
                        >
                          <Text style={[styles.dtrChipText, active && styles.dtrChipTextActive]}>
                            {t.full_name}
                          </Text>
                        </TouchableOpacity>
                      );
                    })}
                  </ScrollView>
                </View>
              )}

              {/* Prescribed Working Hours Inputs (Parity with Web DTRTab) */}
              {dtrData && (
                <View style={styles.dtrControlsCard}>
                  <Text style={styles.dtrControlsLabel}>PRESCRIBED WORKING HOURS</Text>
                  <TextInput
                    style={styles.dtrHoursInput}
                    value={dtrRegularHours}
                    onChangeText={setDtrRegularHours}
                    placeholder="Regular Days (e.g. 8:00 AM - 12:00 PM / 1:00 PM - 5:00 PM)"
                    placeholderTextColor={palette.textMuted}
                  />
                  <TextInput
                    style={styles.dtrHoursInput}
                    value={dtrSaturdayHours}
                    onChangeText={setDtrSaturdayHours}
                    placeholder="Saturdays (e.g. As Required)"
                    placeholderTextColor={palette.textMuted}
                  />
                  {dtrData.can_approve_dept && !dtrData.dept_head_approved && (
                    <TouchableOpacity
                      style={[styles.dtrApproveBtn, dtrSubmitting && { opacity: 0.65 }]}
                      disabled={dtrSubmitting}
                      onPress={() => void handleSubmitDtr('APPROVE_DEPT_HEAD')}
                    >
                      <Ionicons name="shield-checkmark-outline" size={16} color={palette.onPrimary} />
                      <Text style={styles.dtrApproveBtnText}>Approve DTR (Dept Head / Principal)</Text>
                    </TouchableOpacity>
                  )}
                </View>
              )}

              {dtrLoading && !dtrData ? (
                <View style={styles.loadingBox}>
                  <ActivityIndicator size="small" color={palette.primary} />
                  <Text style={styles.loadingText}>Loading attendance records...</Text>
                </View>
              ) : (
                <DTRReportView
                  data={
                    dtrData
                      ? {
                          ...dtrData,
                          regular_days_hours: dtrRegularHours,
                          saturdays_hours: dtrSaturdayHours,
                        }
                      : null
                  }
                  selectedMonth={dtrMonth}
                  selectedYear={dtrYear}
                  onMonthChange={(m, y) => {
                    setDtrMonth(m);
                    setDtrYear(y);
                  }}
                  submitting={dtrSubmitting}
                  onSubmit={() => void handleSubmitDtr('SUBMIT_DTR')}
                  onRefreshNeeded={() => void fetchDTR(true)}
                />
              )}
            </ScrollView>
          </View>
        )}
      </View>

      {/* Floating 5-Tab Bottom Navigation Dock */}
      <View
        style={[
          styles.floatingDockWrapper,
          { paddingBottom: Math.max(insets.bottom, 10) },
        ]}
        pointerEvents="box-none"
      >
        <View style={styles.floatingDock} pointerEvents="auto">
          {navItems.map((item) => {
            const isFocused = resolvedNavKey === item.key;
            return (
              <TouchableOpacity
                key={item.key}
                onPress={() => setActiveTab(item.key)}
                activeOpacity={0.8}
                style={[styles.navPillBtn, isFocused && styles.navPillBtnActive]}
                accessibilityRole="tab"
                accessibilityState={{ selected: isFocused }}
                accessibilityLabel={item.label}
              >
                <Ionicons
                  name={isFocused ? item.activeIcon : item.icon}
                  size={20}
                  color={isFocused ? palette.primary : palette.textMuted}
                />
                {isFocused && (
                  <Text style={styles.navPillText} numberOfLines={1}>
                    {item.label}
                  </Text>
                )}
              </TouchableOpacity>
            );
          })}
        </View>
      </View>
      <ScheduleAlarmModal
        alarm={activeAlarm}
        onDismiss={handleDismissAlarm}
        onSnooze={handleSnoozeAlarm}
        onAction={(targetTab) => {
          handleDismissAlarm();
          setActiveTab(targetTab);
        }}
      />
      <OnboardingGuideModal
        visible={isTourOpen}
        userProfile={userProfileKey}
        onboardingVersion={Number(user?.current_onboarding_version ?? 1)}
        onClose={() => setIsTourOpen(false)}
        onOpenManual={() => setActiveTab('help')}
      />
    </View>
  );
};

const createStyles = (palette: ThemePalette, fonts: ReturnType<typeof useThemeMode>['fonts']) =>
  StyleSheet.create({
    container: { flex: 1, backgroundColor: palette.background },
    screenContainer: { flex: 1 },
    subScreenFill: { flex: 1, backgroundColor: palette.background },
    subHeader: {
      flexShrink: 0,
      backgroundColor: palette.headerBg,
      paddingHorizontal: 18,
      paddingBottom: 20,
      borderBottomLeftRadius: 28,
      borderBottomRightRadius: 28,
    },
    subHeaderTop: {
      flexDirection: 'row',
      alignItems: 'center',
    },
    subHeaderTextWrap: {
      flex: 1,
      marginLeft: 12,
    },
    backCircle: {
      width: 40,
      height: 40,
      borderRadius: 20,
      backgroundColor: palette.headerSurface,
      alignItems: 'center',
      justifyContent: 'center',
    },
    subHeaderEyebrow: {
      fontSize: fonts.xxs,
      fontWeight: fonts.weight.bold,
      color: palette.onPrimary,
      opacity: 0.8,
      letterSpacing: 0.8,
    },
    subHeaderTitle: {
      fontSize: fonts.xl,
      fontWeight: fonts.weight.extrabold,
      color: palette.onPrimary,
      marginTop: 2,
    },
    subHeaderSubtitle: {
      fontSize: fonts.sm,
      color: palette.onPrimary,
      opacity: 0.88,
      marginTop: 2,
    },
    subScreenScroll: {
      padding: 14,
      paddingBottom: 120,
      gap: 10,
    },
    dtrControlsCard: {
      backgroundColor: palette.surface,
      borderRadius: 14,
      padding: 12,
      borderWidth: 1,
      borderColor: palette.border,
      gap: 6,
    },
    dtrControlsLabel: {
      fontSize: fonts.xxs,
      fontWeight: fonts.weight.extrabold,
      color: palette.textMuted,
      letterSpacing: 0.4,
    },
    dtrChip: {
      minHeight: 34,
      justifyContent: 'center',
      alignItems: 'center',
      paddingVertical: 7,
      paddingHorizontal: 12,
      borderRadius: 9,
      backgroundColor: palette.surfaceSubtle,
      borderWidth: 1,
      borderColor: palette.border,
    },
    dtrChipActive: { backgroundColor: palette.buttonBg, borderColor: palette.buttonBg },
    dtrChipText: {
      fontSize: fonts.xs,
      lineHeight: 16,
      fontWeight: fonts.weight.bold,
      color: palette.textSecondary,
      includeFontPadding: false,
      textAlignVertical: 'center',
    },
    dtrChipTextActive: { color: palette.onPrimary },
    dtrHoursInput: {
      backgroundColor: palette.surfaceSubtle,
      borderWidth: 1,
      borderColor: palette.borderStrong,
      borderRadius: 9,
      paddingHorizontal: 10,
      height: 38,
      fontSize: fonts.xs,
      color: palette.textPrimary,
    },
    dtrApproveBtn: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 6,
      height: 40,
      borderRadius: 10,
      backgroundColor: palette.success,
      marginTop: 4,
    },
    dtrApproveBtnText: {
      color: palette.onPrimary,
      fontSize: fonts.xs,
      fontWeight: fonts.weight.extrabold,
    },
    loadingBox: {
      alignItems: 'center',
      justifyContent: 'center',
      paddingVertical: 40,
    },
    loadingText: {
      fontSize: fonts.sm,
      color: palette.textMuted,
      marginTop: 8,
    },
    floatingDockWrapper: {
      position: 'absolute',
      left: 16,
      right: 16,
      bottom: 0,
      alignItems: 'center',
    },
    floatingDock: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      width: '100%',
      backgroundColor: palette.surface,
      borderRadius: 32,
      paddingVertical: 8,
      paddingHorizontal: 10,
      borderWidth: 1,
      borderColor: palette.border,
      ...Platform.select({
        ios: {
          shadowColor: palette.shadowColor,
          shadowOffset: { width: 0, height: 8 },
          shadowOpacity: palette.isDark ? 0.35 : 0.12,
          shadowRadius: 16,
        },
        android: { elevation: 12 },
      }),
    },
    navPillBtn: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      paddingVertical: 10,
      paddingHorizontal: 12,
      borderRadius: 22,
      gap: 6,
    },
    navPillBtnActive: {
      paddingHorizontal: 14,
      backgroundColor: palette.primarySoft,
    },
    navPillText: {
      fontSize: fonts.xs,
      fontWeight: fonts.weight.extrabold,
      color: palette.primary,
    },
  });

export default MainTabNavigator;
