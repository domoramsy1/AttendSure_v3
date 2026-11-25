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
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import { Ionicons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import * as Location from 'expo-location';
import AsyncStorage from '@react-native-async-storage/async-storage';

import { useAuth } from '../context/AuthContext';
import { useThemeMode } from '../context/ThemeContext';
import { AttendSureLogo } from '../branding/BrandLogos';
import { apiClient } from '../api/client';
import { ENDPOINTS } from '../api/endpoints';
import { getServerBaseUrl } from '../services/configService';
import { getUnsyncedCount, syncOfflineQueue } from '../services/offlineQueue';
import { sendLiveHeartbeat, format12HourTime, ADAPTIVE_PING_INTERVAL_MS } from '../services/telemetryService';
import { setTeacherOnDutyFlag } from '../services/backgroundLocation';
import {
  getFriendlyErrorMessage,
  type ThemePalette,
} from '../constants/theme';
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
  rows: DtrDayRow[];
}

interface GeofenceConfigData {
  campus_name?: string | null;
  name?: string | null;
  latitude: number | null;
  longitude: number | null;
  radius_meters: number | null;
  is_configured?: boolean;
}

interface CalendarOverrideItem {
  id: number;
  date: string;
  type: 'SUSPENSION' | 'HOLIDAY' | 'EVENT';
  reason: string;
}

interface LiveGpsCoords {
  latitude: number;
  longitude: number;
  accuracy: number | null;
  mocked: boolean;
  timestamp: string;
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
  const styles = useMemo(() => createStyles(palette, fonts), [palette, fonts]);

  const [sections, setSections] = useState<SectionItem[]>([]);
  const [schoolProfile, setSchoolProfile] = useState<SchoolProfileData | null>(null);
  const [dtrData, setDtrData] = useState<DtrSummaryData | null>(null);
  const [geofenceConfig, setGeofenceConfig] = useState<GeofenceConfigData | null>(null);
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

  const [liveCoords, setLiveCoords] = useState<LiveGpsCoords | null>(null);
  const [gpsError, setGpsError] = useState<string | null>(null);

  const [showCampusAlertModal, setShowCampusAlertModal] = useState<boolean>(false);
  const [campusAlertAcknowledged, setCampusAlertAcknowledged] = useState<boolean>(false);
  const lastCampusAlertTimestamp = useRef<number>(0);

  const isMounted = useRef<boolean>(true);
  const abortControllerRef = useRef<AbortController | null>(null);
  const anchorCoordsRef = useRef<LiveGpsCoords | null>(null);
  const lastHeartbeatSent = useRef<number>(0);

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
    geofenceConfig?.campus_name ||
    geofenceConfig?.name ||
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

  const hasCheckedInToday = Boolean(todayDtrRow?.am_arrival || todayDtrRow?.pm_arrival);
  const hasCheckedOutToday = Boolean(
    (todayDtrRow?.pm_departure && todayDtrRow.pm_departure !== '') ||
      (todayDtrRow?.am_departure && !todayDtrRow?.pm_arrival)
  );
  const isOfficiallyOnDuty = hasCheckedInToday && !hasCheckedOutToday;

  useEffect(() => {
    void setTeacherOnDutyFlag(isOfficiallyOnDuty);
  }, [isOfficiallyOnDuty]);

  const applyStationaryFilter = useCallback((raw: LiveGpsCoords): LiveGpsCoords => {
    const anchor = anchorCoordsRef.current;
    if (!anchor) {
      anchorCoordsRef.current = raw;
      return raw;
    }

    const displacement = calculateDistanceMeters(
      anchor.latitude,
      anchor.longitude,
      raw.latitude,
      raw.longitude
    );

    if (displacement < 6) {
      return {
        latitude: anchor.latitude,
        longitude: anchor.longitude,
        accuracy: raw.accuracy ?? anchor.accuracy,
        mocked: raw.mocked,
        timestamp: raw.timestamp,
      };
    }

    anchorCoordsRef.current = raw;
    return raw;
  }, []);

  useEffect(() => {
    let watcherSubscription: Location.LocationSubscription | null = null;
    let heartbeatIntervalTimer: ReturnType<typeof setInterval> | null = null;
    let isSubscribed = true;

    const transmitHeartbeat = async (coords: LiveGpsCoords, force = false) => {
      if (coords.mocked) {
        if (isSubscribed) {
          setGpsError(
            'A mock location setting appears to be turned on. Disable it in your phone settings to update your campus status.'
          );
        }
        return;
      }
      try {
        await sendLiveHeartbeat(coords, force);
        if (isSubscribed) {
          setIsOnline(true);
          setGpsError(null);
        }
      } catch (err: unknown) {
        if (!isSubscribed) return;
        const msg = getFriendlyErrorMessage(err, 'Could not verify your campus location right now.');
        const lower = msg.toLowerCase();
        if (lower.includes('lock') || lower.includes('mismatch') || lower.includes('permission') || lower.includes('mock')) {
          setGpsError(msg);
          setIsOnline(false);
        }
      }
    };

    const startLiveGpsTracking = async () => {
      try {
        const { status } = await Location.requestForegroundPermissionsAsync();
        if (!isSubscribed) return;
        if (status !== 'granted') {
          setGpsError('Location access is needed for Teacher Time In / Time Out.');
          return;
        }

        const isGpsActive = await Location.hasServicesEnabledAsync();
        if (!isSubscribed) return;
        if (!isGpsActive) {
          setGpsError('Phone GPS is turned off.');
          return;
        }

        setGpsError(null);

        const initial = await Location.getCurrentPositionAsync({
          accuracy: Location.Accuracy.High,
        });
        if (!isSubscribed) return;

        if (initial) {
          const rawCoords: LiveGpsCoords = {
            latitude: initial.coords.latitude,
            longitude: initial.coords.longitude,
            accuracy: initial.coords.accuracy,
            mocked: Boolean(initial.mocked),
            timestamp: format12HourTime(new Date()),
          };

          const stabilized = applyStationaryFilter(rawCoords);
          setLiveCoords(stabilized);

          lastHeartbeatSent.current = Date.now();
          void transmitHeartbeat(stabilized, true);
        }

        if (!isSubscribed) return;
        const sub = await Location.watchPositionAsync(
          {
            accuracy: Location.Accuracy.High,
            timeInterval: 5000,
            distanceInterval: 3,
          },
          (position) => {
            if (!isSubscribed) return;

            const rawCoords: LiveGpsCoords = {
              latitude: position.coords.latitude,
              longitude: position.coords.longitude,
              accuracy: position.coords.accuracy,
              mocked: Boolean(position.mocked),
              timestamp: format12HourTime(new Date()),
            };

            const stabilized = applyStationaryFilter(rawCoords);
            setLiveCoords(stabilized);
            setGpsError(null);

            const now = Date.now();
            if (now - lastHeartbeatSent.current >= ADAPTIVE_PING_INTERVAL_MS) {
              lastHeartbeatSent.current = now;
              void transmitHeartbeat(stabilized);
            }
          }
        );

        // Clean up immediately if unmounted while awaiting watchPositionAsync
        if (!isSubscribed) {
          sub.remove();
          return;
        }
        watcherSubscription = sub;

        heartbeatIntervalTimer = setInterval(async () => {
          if (!isSubscribed) return;
          const now = Date.now();
          if (now - lastHeartbeatSent.current < ADAPTIVE_PING_INTERVAL_MS) return;

          try {
            const freshLoc = await Location.getCurrentPositionAsync({
              accuracy: Location.Accuracy.High,
            });
            if (!isSubscribed) return;
            const rawCoords: LiveGpsCoords = {
              latitude: freshLoc.coords.latitude,
              longitude: freshLoc.coords.longitude,
              accuracy: freshLoc.coords.accuracy,
              mocked: Boolean(freshLoc.mocked),
              timestamp: format12HourTime(new Date()),
            };
            const stabilized = applyStationaryFilter(rawCoords);
            setLiveCoords(stabilized);
            lastHeartbeatSent.current = now;
            void transmitHeartbeat(stabilized);
          } catch {
            if (!isSubscribed) return;
            if (anchorCoordsRef.current) {
              lastHeartbeatSent.current = now;
              const updated = {
                ...anchorCoordsRef.current,
                timestamp: format12HourTime(new Date()),
              };
              setLiveCoords(updated);
              void transmitHeartbeat(updated);
            }
          }
        }, ADAPTIVE_PING_INTERVAL_MS);
      } catch (err: unknown) {
        if (isSubscribed) {
          setGpsError(getFriendlyErrorMessage(err, 'Searching for GPS signal...'));
        }
      }
    };

    void startLiveGpsTracking();

    return () => {
      isSubscribed = false;
      if (watcherSubscription) {
        watcherSubscription.remove();
        watcherSubscription = null;
      }
      if (heartbeatIntervalTimer) {
        clearInterval(heartbeatIntervalTimer);
        heartbeatIntervalTimer = null;
      }
    };
  }, [currentUser?.username, currentUser?.id, applyStationaryFilter]);

  const campusCenter = useMemo(() => {
    const lat = geofenceConfig?.latitude ?? schoolProfile?.latitude ?? null;
    const lng = geofenceConfig?.longitude ?? schoolProfile?.longitude ?? null;
    const radius = geofenceConfig?.radius_meters ?? schoolProfile?.geofence_radius_meters ?? null;
    return { lat, lng, radius };
  }, [geofenceConfig, schoolProfile]);

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
    return liveDistanceMeters <= campusCenter.radius;
  }, [liveDistanceMeters, campusCenter.radius]);

  useEffect(() => {
    if (isInsideCampusPerimeter === false && isOfficiallyOnDuty && campusCenter.radius !== null) {
      const accuracyMargin = liveCoords?.accuracy || 0;
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
        AsyncStorage.getItem('attendsure_cached_geofence'),
        getServerBaseUrl(),
      ]);

      if (!isMounted.current) return;

      const [schoolRes, sectionsRes, dtrRes, geoRes, baseRes] = results;
      if (schoolRes.status === 'fulfilled' && schoolRes.value) {
        setSchoolProfile(JSON.parse(schoolRes.value));
      }
      if (sectionsRes.status === 'fulfilled' && sectionsRes.value) {
        setSections(JSON.parse(sectionsRes.value));
      }
      if (dtrRes.status === 'fulfilled' && dtrRes.value) {
        setDtrData(JSON.parse(dtrRes.value));
      }
      if (geoRes.status === 'fulfilled' && geoRes.value) {
        setGeofenceConfig(JSON.parse(geoRes.value));
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

  const loadAllDynamicData = useCallback(async () => {
    abortControllerRef.current?.abort();
    const controller = new AbortController();
    abortControllerRef.current = controller;

    const todayDate = getLocalTodayStr();
    const now = new Date();

    const [classListRes, schoolRes, dtrRes, geofenceRes, calendarRes] =
      await Promise.allSettled([
        allowClassViews
          ? apiClient.get(ENDPOINTS.ATTENDANCE_CLASSES, { signal: controller.signal, timeout: 5000 })
          : Promise.resolve({ data: [] }),
        apiClient.get(ENDPOINTS.SCHOOL_PROFILE, { signal: controller.signal, timeout: 5000 }),
        apiClient.get(ENDPOINTS.EMPLOYEE_DTR, {
          params: { month: now.getMonth() + 1, year: now.getFullYear() },
          signal: controller.signal,
          timeout: 5000,
        }),
        apiClient.get(ENDPOINTS.CAMPUS_OVERVIEW, { signal: controller.signal, timeout: 5000 }),
        apiClient.get(ENDPOINTS.HOLIDAYS, { signal: controller.signal, timeout: 5000 }),
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

    if (schoolRes.status === 'fulfilled' && schoolRes.value?.data) {
      anySuccess = true;
      setSchoolProfile(schoolRes.value.data);
      AsyncStorage.setItem(
        'attendsure_cached_school',
        JSON.stringify(schoolRes.value.data)
      ).catch(() => {});
    }

    if (dtrRes.status === 'fulfilled' && dtrRes.value?.data) {
      anySuccess = true;
      setDtrData(dtrRes.value.data);
      AsyncStorage.setItem('attendsure_cached_dtr', JSON.stringify(dtrRes.value.data)).catch(
        () => {}
      );
    }

    if (geofenceRes.status === 'fulfilled' && geofenceRes.value?.data) {
      anySuccess = true;
      setGeofenceConfig(geofenceRes.value.data);
      AsyncStorage.setItem(
        'attendsure_cached_geofence',
        JSON.stringify(geofenceRes.value.data)
      ).catch(() => {});
    }

    if (calendarRes.status === 'fulfilled' && calendarRes.value?.data) {
      anySuccess = true;
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
    await Promise.allSettled([loadAllDynamicData(), flushOfflineRecords(), refreshUser()]);
    if (isMounted.current) setRefreshing(false);
  }, [loadAllDynamicData, flushOfflineRecords, refreshUser]);

  useEffect(() => {
    isMounted.current = true;
    void loadCachedData().then(() => {
      if (isMounted.current) {
        void loadAllDynamicData();
      }
    });
    void refreshUser();

    const sub = DeviceEventEmitter.addListener('attendsure:attendance-updated', () => {
      if (isMounted.current) void loadAllDynamicData();
    });
    const livePoll = setInterval(() => {
      if (isMounted.current) void loadAllDynamicData();
    }, 10000);

    return () => {
      isMounted.current = false;
      abortControllerRef.current?.abort();
      sub.remove();
      clearInterval(livePoll);
    };
  }, [loadCachedData, loadAllDynamicData, refreshUser]);

  const safeSections = Array.isArray(sections) ? sections : [];

  let totalStudentsEnrolled = 0;
  let totalPresent = 0;
  let totalLate = 0;
  let totalAbsent = 0;
  let totalNeedsReview = 0;

  // Deduplicate students across periods so daily totals are never double-counted
  const uniqueStudentsMap = new Map<string, StudentItem>();
  const statusPriority: Record<string, number> = {
    PRESENT: 5,
    LATE: 4,
    TARDY: 4,
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
    } else if (status === 'ABSENT') {
      totalAbsent += 1;
    } else if (status === 'CUTTING' || status === 'UNVERIFIED') {
      totalNeedsReview += 1;
    }
  });

  const totalAttended = totalPresent + totalLate;
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
