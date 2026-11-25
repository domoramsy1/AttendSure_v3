// AttendSure Mobile - Dashboard Screen
// File: D:\AttendSure_V3\mobile\src\screens\DashboardScreen.tsx

/**
 * AttendSure Mobile - Teacher Home Dashboard
 * File: mobile/src/screens/DashboardScreen.tsx
 */

import React, { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  RefreshControl,
  ActivityIndicator,
  Platform,
  Vibration,
  DeviceEventEmitter,
  AppState,
  type AppStateStatus,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import { Ionicons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import AsyncStorage from '@react-native-async-storage/async-storage';

import { useAuth } from '../context/AuthContext';
import { useThemeMode } from '../context/ThemeContext';
import { useTeacherDutyLocation } from '../context/TeacherDutyLocationContext';
import { AttendSureLogo } from '../branding/BrandLogos';
import { apiClient } from '../api/client';
import { ENDPOINTS } from '../api/endpoints';
import { getServerBaseUrl } from '../services/configService';
import { getUnsyncedCount, syncOfflineQueue } from '../services/offlineQueue';
import { format12HourTime } from '../services/telemetryService';
import { type ThemePalette } from '../constants/theme';
import { TabType } from '../navigation/MainTabNavigator';
import { canViewClassList } from '../utils/permissions';
import {
  calculateDistanceMeters,
  formatDistanceMeters,
  resolveMediaUrl,
} from '../utils/helpers';
import CampusAlertModal from '../components/dashboard/CampusAlertModal';
import DutyRightNowCard from '../components/dashboard/DutyRightNowCard';
import DashboardQuickActions from '../components/dashboard/DashboardQuickActions';
import CampusLocationCard from '../components/dashboard/CampusLocationCard';
import DashboardDtrAndKpiSection from '../components/dashboard/DashboardDtrAndKpiSection';

interface StudentItem {
  id: number;
  lrn: string;
  qr_token?: string;
  full_name: string;
  gender?: string;
  attendance_status: string;
}

interface SectionItem {
  schedule_id: number;
  section_id: number;
  section_name: string;
  subject_name: string;
  subject_code: string;
  room: string;
  start_time: string;
  end_time: string;
  total_students: number;
  students: StudentItem[];
}

interface SchoolProfileData {
  school_id?: string;
  school_name?: string;
  division?: string;
  region?: string;
  school_logo?: string | null;
  left_logo?: string | null;
  latitude?: number | null;
  longitude?: number | null;
  geofence_radius_meters?: number | null;
}

interface DtrDayRow {
  day: number;
  date_str: string;
  day_of_week: string;
  is_weekend: boolean;
  am_arrival: string;
  am_departure: string;
  pm_arrival: string;
  pm_departure: string;
  undertime_hours: string;
  undertime_minutes: string;
}

interface DtrSummaryData {
  teacher_id: number;
  teacher_name: string;
  employee_id: string;
  department: string;
  month: string;
  year: number;
  days_present: number;
  total_undertime_hours: number;
  total_undertime_minutes: number;
  dtr_submitted: boolean;
  dept_head_approved: boolean;
  today_date?: string;
  is_clocked_in_today?: boolean;
  has_timed_out_today?: boolean;
  rows: DtrDayRow[];
}

interface CalendarOverrideItem {
  id: number;
  date: string;
  type: 'SUSPENSION' | 'HOLIDAY' | 'EVENT';
  reason: string;
}

interface DashboardProps {
  onNavigate?: (tab: TabType) => void;
}

const getLocalTodayStr = (): string => {
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, '0');
  const d = String(now.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
};

const getGreeting = (): string => {
  const hour = new Date().getHours();
  if (hour < 12) return 'Good morning';
  if (hour < 17) return 'Good afternoon';
  return 'Good evening';
};

export const DashboardScreen: React.FC<DashboardProps> = ({ onNavigate }) => {
  const { user, refreshUser } = useAuth();
  const { palette, fonts, isDark } = useThemeMode();
  const {
    liveCoords,
    gpsError,
    boundary: sharedBoundary,
    liveTeachers,
    isOnDuty: sharedIsOnDuty,
    hasTimedOutToday: sharedHasTimedOut,
    refreshCampusOverview,
  } = useTeacherDutyLocation();
  const styles = useMemo(() => createStyles(palette, fonts), [palette, fonts]);

  const [sections, setSections] = useState<SectionItem[]>([]);
  const [schoolProfile, setSchoolProfile] = useState<SchoolProfileData | null>(null);
  const [dtrData, setDtrData] = useState<DtrSummaryData | null>(null);
  const [todayOverride, setTodayOverride] = useState<CalendarOverrideItem | null>(null);
  const [weekendRestEnabled, setWeekendRestEnabled] = useState<boolean>(false);

  const [refreshing, setRefreshing] = useState<boolean>(false);
  const [isOnline, setIsOnline] = useState<boolean>(true);
  const [isSyncingQueue, setIsSyncingQueue] = useState<boolean>(false);
  const [offlineCount, setOfflineCount] = useState<number>(0);
  const [lastSyncTime, setLastSyncTime] = useState<string>('');
  const [serverBase, setServerBase] = useState<string>('');
  const [logoFailed, setLogoFailed] = useState<boolean>(false);
  const [avatarFailed, setAvatarFailed] = useState<boolean>(false);

  const [showCampusAlertModal, setShowCampusAlertModal] = useState<boolean>(false);
  const [campusAlertAcknowledged, setCampusAlertAcknowledged] = useState<boolean>(false);
  const lastCampusAlertTimestamp = useRef<number>(0);

  const isMounted = useRef<boolean>(true);
  const abortControllerRef = useRef<AbortController | null>(null);
  const appStateRef = useRef<AppStateStatus>(
    (AppState.currentState as AppStateStatus | null | undefined) || 'active'
  );
  const [isAppActive, setIsAppActive] = useState<boolean>(
    (AppState.currentState || 'active') === 'active'
  );

  const currentUser = user as Record<string, any> | null;
  const allowClassViews = canViewClassList(user);
  const displayName =
    currentUser?.full_name ||
    `${currentUser?.first_name || ''} ${currentUser?.last_name || ''}`.trim() ||
    currentUser?.teacher_name ||
    currentUser?.username ||
    '';

  const employeeId =
    currentUser?.employee_id ||
    (currentUser?.teacher_id ? String(currentUser.teacher_id) : '') ||
    dtrData?.employee_id ||
    currentUser?.username ||
    '';

  const schoolName =
    schoolProfile?.school_name ||
    currentUser?.school_name ||
    sharedBoundary?.campus_name ||
    'AttendSure';

  const schoolSubHeader = [
    schoolProfile?.school_id ? `School ID: ${schoolProfile.school_id}` : '',
    schoolProfile?.division || '',
  ]
    .filter(Boolean)
    .join(' • ');

  const greetingText = useMemo(() => getGreeting(), []);

  const rawUserPhoto =
    currentUser?.photo_url ||
    currentUser?.photo ||
    currentUser?.avatar_url ||
    currentUser?.avatar ||
    null;
  const resolvedUserPhoto = resolveMediaUrl(rawUserPhoto, serverBase);

  const rawLogoPath = schoolProfile?.school_logo || schoolProfile?.left_logo || null;
  const resolvedLogoUri = resolveMediaUrl(rawLogoPath, serverBase);

  useEffect(() => {
    setAvatarFailed(false);
  }, [resolvedUserPhoto]);

  useEffect(() => {
    setLogoFailed(false);
  }, [resolvedLogoUri]);

  const todayStr = getLocalTodayStr();
  const todayDtrRow: DtrDayRow | null =
    dtrData?.rows?.find((r) => r.date_str === todayStr) || null;

  const isOverviewForToday = !sharedBoundary?.today_date || sharedBoundary.today_date === todayStr;
  const ownOverviewRow = useMemo(() => {
    if (!isOverviewForToday || !Array.isArray(liveTeachers)) return null;
    return (
      liveTeachers.find(
        (row) =>
          (currentUser?.id !== undefined &&
            row?.user_id !== undefined &&
            Number(row.user_id) === Number(currentUser.id)) ||
          (currentUser?.teacher_id !== undefined &&
            Number(row?.teacher_id ?? row?.id) === Number(currentUser.teacher_id))
      ) || null
    );
  }, [isOverviewForToday, liveTeachers, currentUser?.id, currentUser?.teacher_id]);

  const isDtrForToday =
    Boolean(dtrData) && (!dtrData?.today_date || dtrData.today_date === todayStr);
  const overviewClockedIn =
    typeof ownOverviewRow?.is_clocked_in === 'boolean' ? ownOverviewRow.is_clocked_in : null;
  const overviewTimedOut =
    typeof ownOverviewRow?.has_timed_out === 'boolean' ? ownOverviewRow.has_timed_out : null;
  const dtrClockedIn =
    isDtrForToday && typeof dtrData?.is_clocked_in_today === 'boolean'
      ? dtrData.is_clocked_in_today
      : null;
  const dtrTimedOut =
    isDtrForToday && typeof dtrData?.has_timed_out_today === 'boolean'
      ? dtrData.has_timed_out_today
      : null;

  const hasCheckedOutToday =
    dtrTimedOut !== null
      ? dtrTimedOut
      : overviewTimedOut !== null
        ? overviewTimedOut
        : sharedHasTimedOut;
  const isOfficiallyOnDuty =
    !hasCheckedOutToday &&
    (overviewClockedIn !== null
      ? overviewClockedIn
      : dtrClockedIn !== null
        ? dtrClockedIn
        : sharedIsOnDuty);
  const hasCheckedInToday =
    isOfficiallyOnDuty ||
    hasCheckedOutToday ||
    Boolean(todayDtrRow?.am_arrival || todayDtrRow?.pm_arrival);

  const campusCenter = useMemo(() => {
    const lat = sharedBoundary?.latitude ?? schoolProfile?.latitude ?? null;
    const lng = sharedBoundary?.longitude ?? schoolProfile?.longitude ?? null;
    const radius =
      sharedBoundary?.radius_meters ?? schoolProfile?.geofence_radius_meters ?? null;
    return { lat, lng, radius };
  }, [sharedBoundary, schoolProfile]);

  const liveDistanceMeters = useMemo(() => {
    if (!liveCoords || campusCenter.lat === null || campusCenter.lng === null) {
      return null;
    }
    return calculateDistanceMeters(
      liveCoords.latitude,
      liveCoords.longitude,
      campusCenter.lat,
      campusCenter.lng
    );
  }, [liveCoords, campusCenter]);

  const isInsideCampusPerimeter = useMemo(() => {
    if (liveDistanceMeters === null || campusCenter.radius === null) return null;
    const driftBuffer = Math.min(Math.max(liveCoords?.accuracy || 0, 0), 35);
    return liveDistanceMeters <= campusCenter.radius + driftBuffer;
  }, [liveDistanceMeters, campusCenter.radius, liveCoords?.accuracy]);

  useEffect(() => {
    if (isInsideCampusPerimeter === false && isOfficiallyOnDuty && campusCenter.radius !== null) {
      const accuracyMargin = Math.min(Math.max(liveCoords?.accuracy || 0, 0), 35);
      const excessDistance = (liveDistanceMeters || 0) - campusCenter.radius;

      if (excessDistance <= accuracyMargin) {
        return;
      }

      const now = Date.now();
      if (!campusAlertAcknowledged || now - lastCampusAlertTimestamp.current > 300000) {
        setShowCampusAlertModal(true);
        lastCampusAlertTimestamp.current = now;
        if (Platform.OS !== 'web') {
          Vibration.vibrate([0, 150, 100, 150]);
        }
      }
    } else if (isInsideCampusPerimeter === true) {
      setShowCampusAlertModal(false);
      setCampusAlertAcknowledged(false);
    }
  }, [
    isInsideCampusPerimeter,
    isOfficiallyOnDuty,
    liveDistanceMeters,
    liveCoords,
    campusCenter.radius,
    campusAlertAcknowledged,
  ]);

  const handleDismissCampusAlert = () => {
    setShowCampusAlertModal(false);
    setCampusAlertAcknowledged(true);
  };

  const loadCachedData = useCallback(async () => {
    try {
      const results = await Promise.allSettled([
        AsyncStorage.getItem('attendsure_cached_school'),
        AsyncStorage.getItem('attendsure_cached_sections'),
        AsyncStorage.getItem('attendsure_cached_dtr'),
        getServerBaseUrl(),
      ]);

      if (!isMounted.current) return;

      const [schoolRes, sectionsRes, dtrRes, baseRes] = results;
      if (schoolRes.status === 'fulfilled' && schoolRes.value) {
        setSchoolProfile(JSON.parse(schoolRes.value));
      }
      if (sectionsRes.status === 'fulfilled' && sectionsRes.value) {
        setSections(JSON.parse(sectionsRes.value));
      }
      if (dtrRes.status === 'fulfilled' && dtrRes.value) {
        setDtrData(JSON.parse(dtrRes.value));
      }
      if (baseRes.status === 'fulfilled' && baseRes.value) {
        setServerBase(baseRes.value);
      }
    } catch {}
  }, []);

  const normalizeClasses = (rawList: any[]): SectionItem[] =>
    rawList.map((item: any, idx: number) => ({
      schedule_id: item.schedule_id || item.id || idx + 1,
      section_id: item.section_id || item.section?.id || item.id || 0,
      section_name: item.section_name || item.section?.name || item.name || '',
      subject_name: item.subject_name || item.subject?.name || item.subject_title || '',
      subject_code: item.subject_code || item.subject?.code || '',
      room: item.room || item.room_number || item.room?.name || '',
      start_time: typeof item.start_time === 'string' ? item.start_time : '',
      end_time: typeof item.end_time === 'string' ? item.end_time : '',
      total_students: Array.isArray(item.students)
        ? item.students.length
        : Number(item.total_students) || 0,
      students: Array.isArray(item.students) ? item.students : [],
    }));

  const flushOfflineRecords = useCallback(async () => {
    try {
      if (isMounted.current) setIsSyncingQueue(true);
      const res = await syncOfflineQueue();
      const updatedCount = await getUnsyncedCount();
      if (isMounted.current) {
        setOfflineCount(updatedCount);
        if (res.synced > 0) {
          setIsOnline(true);
        }
      }
    } catch {
      // Keep unsynced count intact until next retry
    } finally {
      if (isMounted.current) setIsSyncingQueue(false);
    }
  }, []);

  // Fetch relatively static school branding and holiday overrides on mount / manual pull-to-refresh only
  const loadStaticSchoolData = useCallback(async () => {
    const todayDate = getLocalTodayStr();
    const [schoolRes, calendarRes] = await Promise.allSettled([
      apiClient.get(ENDPOINTS.SCHOOL_PROFILE, { timeout: 6000 }),
      apiClient.get(ENDPOINTS.HOLIDAYS, { timeout: 6000 }),
    ]);
    if (!isMounted.current) return;

    if (schoolRes.status === 'fulfilled' && schoolRes.value?.data) {
      setSchoolProfile(schoolRes.value.data);
      AsyncStorage.setItem(
        'attendsure_cached_school',
        JSON.stringify(schoolRes.value.data)
      ).catch(() => {});
    }

    if (calendarRes.status === 'fulfilled' && calendarRes.value?.data) {
      const calPayload = calendarRes.value.data;
      const list: CalendarOverrideItem[] = Array.isArray(calPayload)
        ? calPayload
        : Array.isArray(calPayload?.results)
        ? calPayload.results
        : [];
      if (typeof calPayload?.weekend_rest_enabled === 'boolean') {
        setWeekendRestEnabled(calPayload.weekend_rest_enabled);
      }
      const matched = list.find((item) => item.date === todayDate) || null;
      setTodayOverride(matched);
    }
  }, []);

  // Poll only live attendance & DTR summaries (campus overview comes from TeacherDutyLocationContext)
  const loadAllDynamicData = useCallback(async () => {
    abortControllerRef.current?.abort();
    const controller = new AbortController();
    abortControllerRef.current = controller;

    const now = new Date();

    const [classListRes, dtrRes] = await Promise.allSettled([
      allowClassViews
        ? apiClient.get(ENDPOINTS.ATTENDANCE_CLASSES, { signal: controller.signal, timeout: 6000 })
        : Promise.resolve({ data: [] }),
      apiClient.get(ENDPOINTS.EMPLOYEE_DTR, {
        params: { month: now.getMonth() + 1, year: now.getFullYear() },
        signal: controller.signal,
        timeout: 6000,
      }),
    ]);

    if (!isMounted.current || controller.signal.aborted) return;

    let anySuccess = false;

    if (classListRes.status === 'fulfilled' && classListRes.value?.data) {
      anySuccess = true;
      const rawPayload = classListRes.value.data;
      const rawList = Array.isArray(rawPayload)
        ? rawPayload
        : Array.isArray(rawPayload?.results)
        ? rawPayload.results
        : [];
      const normalized = normalizeClasses(rawList);
      setSections(normalized);
      AsyncStorage.setItem('attendsure_cached_sections', JSON.stringify(normalized)).catch(
        () => {}
      );
    }

    if (dtrRes.status === 'fulfilled' && dtrRes.value?.data) {
      anySuccess = true;
      setDtrData(dtrRes.value.data);
      AsyncStorage.setItem('attendsure_cached_dtr', JSON.stringify(dtrRes.value.data)).catch(
        () => {}
      );
    }

    setIsOnline(anySuccess);

    const count = await getUnsyncedCount();
    if (!isMounted.current || controller.signal.aborted) return;

    setOfflineCount(count);
    if (count > 0) {
      void flushOfflineRecords();
    }

    setLastSyncTime(format12HourTime(new Date()));
  }, [flushOfflineRecords, allowClassViews]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await Promise.allSettled([
      loadAllDynamicData(),
      loadStaticSchoolData(),
      flushOfflineRecords(),
      refreshUser(),
      refreshCampusOverview(),
    ]);
    if (isMounted.current) setRefreshing(false);
  }, [
    loadAllDynamicData,
    loadStaticSchoolData,
    flushOfflineRecords,
    refreshUser,
    refreshCampusOverview,
  ]);

  useEffect(() => {
    const appSub = AppState.addEventListener('change', (nextState: AppStateStatus) => {
      const wasInactive = appStateRef.current !== 'active';
      appStateRef.current = nextState;
      const activeNow = nextState === 'active';
      setIsAppActive(activeNow);
      if (wasInactive && activeNow && isMounted.current) {
        void loadAllDynamicData();
      }
    });
    return () => appSub.remove();
  }, [loadAllDynamicData]);

  useEffect(() => {
    isMounted.current = true;
    void loadCachedData().then(() => {
      if (isMounted.current) {
        void loadStaticSchoolData();
        void loadAllDynamicData();
      }
    });
    void refreshUser();

    const sub = DeviceEventEmitter.addListener('attendsure:attendance-updated', () => {
      if (isMounted.current) void loadAllDynamicData();
    });

    return () => {
      isMounted.current = false;
      abortControllerRef.current?.abort();
      sub.remove();
    };
  }, [loadCachedData, loadStaticSchoolData, loadAllDynamicData, refreshUser]);

  // Pause the 30-second live refresh loop when the app moves into the background
  useEffect(() => {
    if (!isAppActive) return;
    const livePoll = setInterval(() => {
      if (isMounted.current && appStateRef.current === 'active') {
        void loadAllDynamicData();
      }
    }, 30000);
    return () => clearInterval(livePoll);
  }, [isAppActive, loadAllDynamicData]);

  const safeSections = Array.isArray(sections) ? sections : [];

  let totalStudentsEnrolled = 0;
  let totalPresent = 0;
  let totalLate = 0;
  let totalExcused = 0;
  let totalAbsent = 0;
  let totalNeedsReview = 0;

  // Deduplicate students across periods so daily totals are never double-counted
  const uniqueStudentsMap = new Map<string, StudentItem>();
  const statusPriority: Record<string, number> = {
    PRESENT: 5,
    LATE: 4,
    TARDY: 4,
    EXCUSED: 4,
    CUTTING: 3,
    UNVERIFIED: 2,
    ABSENT: 1,
    UNSCANNED: 0,
  };

  safeSections.forEach((sec) => {
    const students = Array.isArray(sec?.students) ? sec.students : [];
    students.forEach((st) => {
      const key = String(st?.id ?? st?.lrn ?? st?.full_name ?? '');
      if (!key) return;
      const existing = uniqueStudentsMap.get(key);
      if (!existing) {
        uniqueStudentsMap.set(key, st);
      } else {
        const prevScore =
          statusPriority[String(existing.attendance_status || 'UNSCANNED').toUpperCase()] ?? 0;
        const nextScore =
          statusPriority[String(st.attendance_status || 'UNSCANNED').toUpperCase()] ?? 0;
        if (nextScore > prevScore) {
          uniqueStudentsMap.set(key, st);
        }
      }
    });
  });

  const uniqueStudents = Array.from(uniqueStudentsMap.values());
  totalStudentsEnrolled = uniqueStudents.length;

  uniqueStudents.forEach((st) => {
    const status = String(st?.attendance_status || 'UNSCANNED').toUpperCase();
    if (status === 'PRESENT') {
      totalPresent += 1;
    } else if (status === 'LATE' || status === 'TARDY') {
      totalLate += 1;
    } else if (status === 'EXCUSED') {
      totalExcused += 1;
    } else if (status === 'ABSENT') {
      totalAbsent += 1;
    } else if (status === 'CUTTING' || status === 'UNVERIFIED') {
      totalNeedsReview += 1;
    }
  });

  const totalAttended = totalPresent + totalLate + totalExcused;
  const overallRate =
    totalStudentsEnrolled > 0
      ? Math.round((totalAttended / totalStudentsEnrolled) * 100)
      : 0;

  const isWeekendToday = [0, 6].includes(new Date().getDay());

  return (
    <SafeAreaView style={styles.safeContainer} edges={['top', 'left', 'right']}>
      <StatusBar style={isDark ? 'light' : 'dark'} />

      {/* Campus Boundary Notice Modal */}
      <CampusAlertModal
        visible={showCampusAlertModal}
        liveDistanceMeters={liveDistanceMeters}
        radiusMeters={campusCenter.radius}
        onDismiss={handleDismissCampusAlert}
      />

      {/* Top Header */}
      <View style={styles.topHeader}>
        <View style={styles.brandGroup}>
          {resolvedLogoUri && !logoFailed ? (
            <Image
              source={{ uri: resolvedLogoUri }}
              style={styles.schoolLogo}
              contentFit="contain"
              onError={() => setLogoFailed(true)}
            />
          ) : (
            <AttendSureLogo size={34} />
          )}
          <View style={styles.brandTextGroup}>
            <Text style={styles.schoolTitle} numberOfLines={1}>
              {schoolName}
            </Text>
            {schoolSubHeader ? (
              <View style={styles.subBrandRow}>
                <View
                  style={[
                    styles.activeDot,
                    { backgroundColor: isOnline ? palette.success : palette.textMuted },
                  ]}
                />
                <Text style={styles.schoolSubText} numberOfLines={1}>
                  {schoolSubHeader}
                </Text>
              </View>
            ) : null}
          </View>
        </View>

        <TouchableOpacity
          style={styles.refreshButton}
          onPress={() => void onRefresh()}
          activeOpacity={0.7}
          accessibilityLabel="Refresh records"
        >
          <Ionicons name="sync-outline" size={16} color={palette.primary} />
        </TouchableOpacity>
      </View>

      <ScrollView
        style={styles.scrollArea}
        contentContainerStyle={styles.scrollContent}
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
        {/* Mock Location Notice */}
        {liveCoords?.mocked && (
          <View style={styles.locationNoticeCard}>
            <Ionicons name="alert-circle-outline" size={18} color={palette.danger} />
            <View style={{ flex: 1 }}>
              <Text style={styles.locationNoticeTitle}>Mock Location Setting Active</Text>
              <Text style={styles.locationNoticeBody}>
                A mock location option is turned on in your phone settings. Please disable it so
                your campus Time In / Out stays verified.
              </Text>
            </View>
          </View>
        )}

        {/* 1. Welcome Banner Card */}
        <View style={styles.welcomeCard}>
          <View style={styles.welcomeHeader}>
            <View style={{ flex: 1, marginRight: 10 }}>
              <Text style={styles.welcomeSub}>{greetingText},</Text>
              <Text style={styles.welcomeTitle} numberOfLines={1}>
                {displayName || 'Teacher'}
              </Text>
            </View>
            <View style={styles.avatarBox}>
              {resolvedUserPhoto && !avatarFailed ? (
                <Image
                  source={{ uri: resolvedUserPhoto }}
                  style={styles.avatarImg}
                  contentFit="cover"
                  onError={() => setAvatarFailed(true)}
                />
              ) : (
                <Ionicons name="person" size={22} color={palette.primary} />
              )}
            </View>
          </View>

          <View style={styles.progressContainer}>
            <View style={styles.progressTopRow}>
              <Text style={styles.progressBadgeText}>
                {employeeId ? `ID: ${employeeId}` : 'Teacher'}
              </Text>
              <Text style={styles.progressPercent}>{overallRate}% Attendance Today</Text>
            </View>
            <View style={styles.progressBarTrack}>
              <View
                style={[
                  styles.progressBarFill,
                  { width: `${Math.min(100, Math.max(5, overallRate))}%` },
                ]}
              />
            </View>
          </View>
        </View>

        {/* 1B. 3-Second Glanceable Duty, Location & Single Next-Step Hero */}
        <DutyRightNowCard
          offlineCount={offlineCount}
          isOnline={isOnline}
          isOfficiallyOnDuty={isOfficiallyOnDuty}
          hasCheckedInToday={hasCheckedInToday}
          hasCheckedOutToday={hasCheckedOutToday}
          arrivalTime={todayDtrRow?.am_arrival || todayDtrRow?.pm_arrival}
          isInsideCampusPerimeter={isInsideCampusPerimeter}
          liveDistanceMeters={liveDistanceMeters}
          allowClassViews={allowClassViews}
          onNavigate={onNavigate}
        />

        {/* 2. Primary Classroom Summary Card (Hidden for non-teaching staff) */}
        {allowClassViews && (
          <TouchableOpacity
            style={styles.primaryStatusCard}
            onPress={() => onNavigate?.('class_list')}
            activeOpacity={0.9}
          >
            <View style={styles.statusTopRow}>
              <View style={{ flex: 1 }}>
                <Text style={styles.statusCardEyebrow}>TODAY&apos;S CLASS SUMMARY</Text>
                <Text style={styles.statusCardTitle}>
                  {totalPresent} of {totalStudentsEnrolled} Students Present
                </Text>
              </View>
              <Ionicons name="chevron-forward" size={18} color={palette.onPrimary} />
            </View>
            <View style={styles.statusFooterRow}>
              <View style={styles.statusPill}>
                <Text style={styles.statusPillText}>Needs Review: {totalNeedsReview}</Text>
              </View>
              <View style={[styles.statusPill, { backgroundColor: palette.headerSurface }]}>
                <Text style={styles.statusPillText}>
                  Campus GPS:{' '}
                  {isInsideCampusPerimeter === null
                    ? 'Locating...'
                    : isInsideCampusPerimeter
                    ? 'On Campus'
                    : `Outside (${liveDistanceMeters !== null ? formatDistanceMeters(liveDistanceMeters) : '—'})`}
                </Text>
              </View>
            </View>
          </TouchableOpacity>
        )}

        {/* 3. Quick Actions Grid & More Tools Card */}
        <DashboardQuickActions
          user={user}
          allowClassViews={allowClassViews}
          onNavigate={onNavigate}
        />

        {/* School Campus Location Card */}
        <CampusLocationCard
          isInsideCampusPerimeter={isInsideCampusPerimeter}
          liveDistanceMeters={liveDistanceMeters}
          radiusMeters={campusCenter.radius}
          timestamp={liveCoords?.timestamp}
          gpsError={gpsError}
        />

        {/* Offline Queue Banner */}
        {offlineCount > 0 && (
          <TouchableOpacity
            style={styles.offlineBufferBanner}
            onPress={() => void flushOfflineRecords()}
            disabled={isSyncingQueue}
            activeOpacity={0.8}
          >
            <View style={styles.offlineBannerLeft}>
              <Ionicons
                name={isSyncingQueue ? 'sync-outline' : 'cloud-upload-outline'}
                size={18}
                color={palette.warning}
              />
              <View style={{ flex: 1 }}>
                <Text style={styles.offlineBufferTitle}>
                  {offlineCount} {offlineCount === 1 ? 'record' : 'records'} saved safely on phone
                </Text>
                <Text style={styles.offlineBufferSubtitle}>
                  {isSyncingQueue
                    ? 'Uploading to school server now...'
                    : isOnline
                    ? 'Will sync automatically — or tap to upload now'
                    : 'Saved on phone — will sync automatically when Wi-Fi returns'}
                </Text>
              </View>
            </View>
            {isSyncingQueue ? (
              <ActivityIndicator size="small" color={palette.warning} />
            ) : (
              <View style={styles.syncNowBtn}>
                <Text style={styles.syncNowBtnText}>Upload Now</Text>
              </View>
            )}
          </TouchableOpacity>
        )}

        {/* Calendar Holiday Banner */}
        {todayOverride ? (
          <View style={styles.calendarBanner}>
            <Ionicons name="calendar-outline" size={16} color={palette.primary} />
            <View style={{ flex: 1 }}>
              <Text style={styles.calendarBannerTitle}>
                {todayOverride.type}: {todayOverride.date}
              </Text>
              <Text style={styles.calendarBannerReason}>{todayOverride.reason}</Text>
            </View>
          </View>
        ) : isWeekendToday && weekendRestEnabled ? (
          <View
            style={[
              styles.calendarBanner,
              { backgroundColor: palette.successLight, borderColor: palette.success },
            ]}
          >
            <Ionicons name="partly-sunny-outline" size={16} color={palette.success} />
            <View style={{ flex: 1 }}>
              <Text style={[styles.calendarBannerTitle, { color: palette.success }]}>
                Weekend Rest Day
              </Text>
              <Text style={[styles.calendarBannerReason, { color: palette.textPrimary }]}>
                Attendance logging is optional on scheduled rest days.
              </Text>
            </View>
          </View>
        ) : null}

        {/* DTR Summary & Student Attendance KPI Tiles */}
        <DashboardDtrAndKpiSection
          dtrData={dtrData}
          todayDtrRow={todayDtrRow}
          allowClassViews={allowClassViews}
          lastSyncTime={lastSyncTime}
          totalPresent={totalPresent}
          totalLate={totalLate}
          totalExcused={totalExcused}
          totalAbsent={totalAbsent}
          totalNeedsReview={totalNeedsReview}
        />
      </ScrollView>
    </SafeAreaView>
  );
};

const createStyles = (palette: ThemePalette, fonts: ReturnType<typeof useThemeMode>['fonts']) =>
  StyleSheet.create({
    safeContainer: { flex: 1, backgroundColor: palette.background },
    topHeader: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingHorizontal: 16,
      paddingVertical: 10,
      backgroundColor: palette.surface,
      borderBottomWidth: 1,
      borderBottomColor: palette.border,
    },
    brandGroup: { flexDirection: 'row', alignItems: 'center', flex: 1 },
    schoolLogo: { width: 34, height: 34, borderRadius: 8 },
    brandTextGroup: { marginLeft: 10, flex: 1 },
    schoolTitle: { fontSize: fonts.base, fontWeight: fonts.weight.extrabold, color: palette.textPrimary },
    subBrandRow: { flexDirection: 'row', alignItems: 'center', marginTop: 1, gap: 5 },
    activeDot: { width: 6, height: 6, borderRadius: 3 },
    schoolSubText: { fontSize: fonts.xxs, fontWeight: fonts.weight.bold, color: palette.textSecondary },
    refreshButton: {
      width: 34,
      height: 34,
      borderRadius: 10,
      backgroundColor: palette.surfaceSubtle,
      alignItems: 'center',
      justifyContent: 'center',
      borderWidth: 1,
      borderColor: palette.border,
    },
    scrollArea: { flex: 1 },
    scrollContent: { paddingHorizontal: 16, paddingTop: 12, paddingBottom: 136 },
    locationNoticeCard: {
      flexDirection: 'row',
      alignItems: 'flex-start',
      backgroundColor: palette.dangerLight,
      borderWidth: 1,
      borderColor: palette.danger,
      borderRadius: 12,
      padding: 12,
      marginBottom: 12,
      gap: 8,
    },
    locationNoticeTitle: { fontSize: fonts.sm, fontWeight: fonts.weight.extrabold, color: palette.danger },
    locationNoticeBody: { fontSize: fonts.xs, color: palette.textPrimary, marginTop: 2, lineHeight: 16 },
    welcomeCard: {
      backgroundColor: palette.headerBg,
      borderRadius: 20,
      padding: 18,
      marginBottom: 14,
      ...Platform.select({
        ios: {
          shadowColor: palette.shadowColor,
          shadowOffset: { width: 0, height: 6 },
          shadowOpacity: 0.18,
          shadowRadius: 10,
        },
        android: { elevation: 5 },
      }),
    },
    welcomeHeader: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      marginBottom: 14,
    },
    welcomeSub: { fontSize: fonts.sm, color: palette.onPrimary, opacity: 0.85, fontWeight: fonts.weight.semibold },
    welcomeTitle: { fontSize: 20, fontWeight: fonts.weight.extrabold, color: palette.onPrimary, marginTop: 2 },
    avatarBox: {
      width: 44,
      height: 44,
      borderRadius: 22,
      backgroundColor: palette.surface,
      alignItems: 'center',
      justifyContent: 'center',
      overflow: 'hidden',
    },
    avatarImg: { width: '100%', height: '100%' },
    progressContainer: { backgroundColor: palette.headerSurface, borderRadius: 12, padding: 12 },
    progressTopRow: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 6 },
    progressBadgeText: { fontSize: fonts.xs, fontWeight: fonts.weight.bold, color: palette.onPrimary },
    progressPercent: { fontSize: fonts.xs, fontWeight: fonts.weight.extrabold, color: palette.warningHighlight },
    progressBarTrack: { height: 6, backgroundColor: 'rgba(255,255,255,0.25)', borderRadius: 3, overflow: 'hidden' },
    progressBarFill: { height: '100%', backgroundColor: palette.warningHighlight, borderRadius: 3 },
    primaryStatusCard: {
      backgroundColor: palette.buttonBg,
      borderRadius: 18,
      padding: 16,
      marginBottom: 16,
      ...Platform.select({
        ios: { shadowColor: palette.shadowColor, shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.18, shadowRadius: 8 },
        android: { elevation: 4 },
      }),
    },
    statusTopRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 12 },
    statusCardEyebrow: { fontSize: fonts.xxs, fontWeight: fonts.weight.extrabold, color: palette.onPrimary, opacity: 0.82, letterSpacing: 0.5 },
    statusCardTitle: { fontSize: fonts.lg, fontWeight: fonts.weight.extrabold, color: palette.onPrimary, marginTop: 2 },
    statusFooterRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
    statusPill: { backgroundColor: 'rgba(0,0,0,0.18)', paddingHorizontal: 10, paddingVertical: 4, borderRadius: 10 },
    statusPillText: { fontSize: fonts.xs, fontWeight: fonts.weight.bold, color: palette.onPrimary },
    offlineBufferBanner: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      backgroundColor: palette.warningLight,
      borderRadius: 12,
      padding: 12,
      marginBottom: 12,
      borderWidth: 1,
      borderColor: palette.warning,
    },
    offlineBannerLeft: { flexDirection: 'row', alignItems: 'center', gap: 8, flex: 1, marginRight: 8 },
    offlineBufferTitle: { fontSize: fonts.sm, fontWeight: fonts.weight.extrabold, color: palette.textPrimary },
    offlineBufferSubtitle: { fontSize: fonts.xs, color: palette.textSecondary, marginTop: 1 },
    syncNowBtn: {
      backgroundColor: palette.buttonBg,
      paddingVertical: 6,
      paddingHorizontal: 10,
      borderRadius: 8,
    },
    syncNowBtnText: { color: palette.onPrimary, fontSize: fonts.xs, fontWeight: fonts.weight.extrabold },
    calendarBanner: {
      flexDirection: 'row',
      alignItems: 'center',
      backgroundColor: palette.primarySoft,
      borderRadius: 12,
      padding: 12,
      marginBottom: 12,
      borderWidth: 1,
      borderColor: palette.border,
      gap: 8,
    },
    calendarBannerTitle: { fontSize: fonts.sm, fontWeight: fonts.weight.extrabold, color: palette.primary },
    calendarBannerReason: { fontSize: fonts.xs, color: palette.textPrimary, marginTop: 1 },
  });

export default DashboardScreen;
