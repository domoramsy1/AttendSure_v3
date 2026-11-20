/**
 * AttendSure Mobile - Faculty Home Dashboard
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
  Modal,
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
import { getServerBaseUrl } from '../services/configService';
import { getUnsyncedCount, syncOfflineQueue } from '../services/offlineQueue';
import { sendLiveHeartbeat, format12HourTime } from '../services/telemetryService';
import { startPassivePresenceTracking } from '../services/backgroundLocation';
import {
  isSafeUrl,
  getFriendlyErrorMessage,
  type ThemePalette,
} from '../constants/theme';
import { TabType } from '../navigation/MainTabNavigator';

function calculateDistanceMeters(
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number
): number {
  const R = 6371000.0;
  const dLat = ((lat2 - lat1) * Math.PI) / 180.0;
  const dLon = ((lon2 - lon1) * Math.PI) / 180.0;
  const radLat1 = (lat1 * Math.PI) / 180.0;
  const radLat2 = (lat2 * Math.PI) / 180.0;

  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.sin(dLon / 2) * Math.sin(dLon / 2) * Math.cos(radLat1) * Math.cos(radLat2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return Math.round(R * c);
}

function formatDistance(meters: number): string {
  if (meters >= 1000) {
    return `${(meters / 1000).toFixed(2)} km`;
  }
  return `${Math.round(meters)} m`;
}

const isCanceledError = (err: unknown): boolean => {
  const e = err as { code?: string; name?: string };
  return e?.code === 'ERR_CANCELED' || e?.name === 'CanceledError' || e?.name === 'AbortError';
};

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
  faculty_id: number;
  faculty_name: string;
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
  name: string | null;
  latitude: number | null;
  longitude: number | null;
  radius_meters: number | null;
  is_configured: boolean;
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
  const displayName =
    currentUser?.full_name ||
    `${currentUser?.first_name || ''} ${currentUser?.last_name || ''}`.trim() ||
    currentUser?.faculty_name ||
    currentUser?.username ||
    '';

  const employeeId =
    currentUser?.employee_id ||
    currentUser?.faculty_id ||
    dtrData?.employee_id ||
    currentUser?.username ||
    '';

  const schoolName =
    schoolProfile?.school_name ||
    currentUser?.school_name ||
    geofenceConfig?.name ||
    'AttendSure';

  const schoolSubHeader = [
    schoolProfile?.school_id ? `School ID: ${schoolProfile.school_id}` : '',
    schoolProfile?.division || '',
  ]
    .filter(Boolean)
    .join(' • ');

  const greetingText = useMemo(() => getGreeting(), []);

  const resolveSafePhotoUrl = useCallback((path: string | null | undefined, base: string): string | null => {
    if (!path || typeof path !== 'string') return null;
    const trimmed = path.trim();
    if (!trimmed) return null;
    const candidate =
      trimmed.startsWith('http://') || trimmed.startsWith('https://') || trimmed.startsWith('data:')
        ? trimmed
        : base
        ? `${base.replace(/\/+$/, '')}${trimmed.startsWith('/') ? trimmed : `/${trimmed}`}`
        : '';
    return isSafeUrl(candidate) ? candidate : null;
  }, []);

  const rawUserPhoto =
    currentUser?.photo_url ||
    currentUser?.photo ||
    currentUser?.avatar_url ||
    currentUser?.avatar ||
    null;
  const resolvedUserPhoto = resolveSafePhotoUrl(rawUserPhoto, serverBase);

  const rawLogoPath = schoolProfile?.school_logo || schoolProfile?.left_logo || null;
  const resolvedLogoUri = resolveSafePhotoUrl(rawLogoPath, serverBase);

  useEffect(() => {
    setAvatarFailed(false);
  }, [resolvedUserPhoto]);

  useEffect(() => {
    setLogoFailed(false);
  }, [resolvedLogoUri]);

  useEffect(() => {
    startPassivePresenceTracking().catch(() => {});
  }, [currentUser?.username, currentUser?.id]);

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

    const transmitHeartbeat = async (coords: LiveGpsCoords) => {
      try {
        await sendLiveHeartbeat(coords);
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
          setGpsError('Location access is needed for attendance check-in.');
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
          void transmitHeartbeat(stabilized);
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
            if (now - lastHeartbeatSent.current >= 60000) {
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
          if (now - lastHeartbeatSent.current < 60000) return;

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
        }, 30000);
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
        apiClient
          .get('classroom/assigned/', { signal: controller.signal, timeout: 5000 })
          .catch((err: unknown) => {
            if (isCanceledError(err) || controller.signal.aborted) {
              throw err;
            }
            return apiClient.get('sections/', { signal: controller.signal, timeout: 5000 });
          }),
        apiClient.get('settings/school/', { signal: controller.signal, timeout: 5000 }),
        apiClient.get(
          `reports/dtr/?month=${now.getMonth() + 1}&year=${now.getFullYear()}`,
          { signal: controller.signal, timeout: 5000 }
        ),
        apiClient.get('geofence/', { signal: controller.signal, timeout: 5000 }),
        apiClient.get('calendar/exceptions/', { signal: controller.signal, timeout: 5000 }),
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
  }, [flushOfflineRecords]);

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

    return () => {
      isMounted.current = false;
      abortControllerRef.current?.abort();
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
      <Modal
        visible={showCampusAlertModal}
        transparent
        animationType="fade"
        onRequestClose={handleDismissCampusAlert}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalCard}>
            <View style={styles.modalIconWrap}>
              <Ionicons name="location-outline" size={32} color={palette.primary} />
            </View>

            <Text style={styles.modalTitle}>Outside School Area</Text>
            <Text style={styles.modalSubtitle}>
              You are signed in on duty, but your phone is currently outside the school boundary.
            </Text>

            <View style={styles.modalMetricsBox}>
              <View style={styles.modalMetricCol}>
                <Text style={styles.modalMetricLabel}>CURRENT DISTANCE</Text>
                <Text style={styles.modalMetricVal}>
                  {liveDistanceMeters !== null ? formatDistance(liveDistanceMeters) : '—'}
                </Text>
              </View>
              <View style={styles.modalMetricDivider} />
              <View style={styles.modalMetricCol}>
                <Text style={styles.modalMetricLabel}>ALLOWED BOUNDARY</Text>
                <Text style={styles.modalMetricVal}>
                  {campusCenter.radius !== null ? `${campusCenter.radius}m` : '—'}
                </Text>
              </View>
            </View>

            <Text style={styles.modalExplanation}>
              If you are on official school business, let your department head know. Otherwise,
              please return to campus grounds to verify your attendance.
            </Text>

            <TouchableOpacity
              style={styles.modalConfirmBtn}
              onPress={handleDismissCampusAlert}
              activeOpacity={0.85}
            >
              <Ionicons name="checkmark-outline" size={16} color={palette.onPrimary} />
              <Text style={styles.modalConfirmBtnText}>I Understand</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

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
              <Text style={styles.locationNoticeTitle}>Fake GPS Detected</Text>
              <Text style={styles.locationNoticeBody}>
                A mock location app is active. Please turn off fake GPS in your phone settings so
                your attendance logs stay valid.
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
                {displayName || 'Faculty Member'}
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
                {employeeId ? `ID: ${employeeId}` : 'Faculty'}
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

        {/* 2. Primary Classroom Summary Card */}
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
                Campus GPS: {isInsideCampusPerimeter ? 'On Campus' : 'Away'}
              </Text>
            </View>
          </View>
        </TouchableOpacity>

        {/* 3. Quick Actions Grid */}
        <Text style={styles.sectionHeader}>Quick Actions</Text>
        <View style={styles.gridContainer}>
          <TouchableOpacity
            style={styles.gridCard}
            onPress={() => onNavigate?.('scanner')}
            activeOpacity={0.8}
          >
            <View style={[styles.gridIconBox, { backgroundColor: palette.warningLight }]}>
              <Ionicons name="scan-outline" size={20} color={palette.warning} />
            </View>
            <Text style={styles.gridCardTitle}>Face Check-In</Text>
            <Text style={styles.gridCardSub}>Face &amp; Campus GPS</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.gridCard}
            onPress={() => onNavigate?.('gate_pass')}
            activeOpacity={0.8}
          >
            <View style={[styles.gridIconBox, { backgroundColor: palette.infoLight }]}>
              <Ionicons name="ticket-outline" size={20} color={palette.info} />
            </View>
            <Text style={styles.gridCardTitle}>Exit Passes</Text>
            <Text style={styles.gridCardSub}>Student &amp; Travel Permits</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.gridCard}
            onPress={() => onNavigate?.('class_list')}
            activeOpacity={0.8}
          >
            <View style={[styles.gridIconBox, { backgroundColor: palette.primarySoft }]}>
              <Ionicons name="people-outline" size={20} color={palette.primary} />
            </View>
            <Text style={styles.gridCardTitle}>Class List</Text>
            <Text style={styles.gridCardSub}>Enrolled Students</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.gridCard}
            onPress={() => onNavigate?.('chat')}
            activeOpacity={0.8}
          >
            <View style={[styles.gridIconBox, { backgroundColor: palette.successLight }]}>
              <Ionicons name="notifications-outline" size={20} color={palette.success} />
            </View>
            <Text style={styles.gridCardTitle}>Parent Alerts</Text>
            <Text style={styles.gridCardSub}>Push Updates &amp; Chat</Text>
          </TouchableOpacity>
        </View>

        {/* 4. More Tools Card */}
        <TouchableOpacity
          style={styles.moreToolsCard}
          onPress={() => onNavigate?.('menu')}
          activeOpacity={0.85}
        >
          <View style={styles.moreToolsLeft}>
            <View style={styles.moreToolsIconBox}>
              <Ionicons name="grid-outline" size={20} color={palette.primary} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.moreToolsTitle}>More School Tools</Text>
              <Text style={styles.moreToolsSub}>
                Daily Time Record, Calendar, School Reports &amp; Settings
              </Text>
            </View>
          </View>
          <Ionicons name="chevron-forward" size={18} color={palette.textMuted} />
        </TouchableOpacity>

        {/* School Campus Location Card */}
        <View style={styles.campusLocationCard}>
          <View style={styles.campusCardHeader}>
            <View style={styles.campusHeaderLeft}>
              <View
                style={[
                  styles.pulseDot,
                  {
                    backgroundColor:
                      isInsideCampusPerimeter === true
                        ? palette.success
                        : isInsideCampusPerimeter === false
                        ? palette.warning
                        : palette.textMuted,
                  },
                ]}
              />
              <Text style={styles.campusHeaderLabel}>SCHOOL CAMPUS LOCATION</Text>
            </View>

            {liveCoords?.timestamp ? (
              <View style={styles.timestampBadge}>
                <Ionicons name="time-outline" size={11} color={palette.textMuted} />
                <Text style={styles.timestampBadgeText}>{liveCoords.timestamp}</Text>
              </View>
            ) : null}
          </View>

          <View style={styles.campusMainContent}>
            {liveDistanceMeters !== null ? (
              <>
                <View style={styles.distanceValueRow}>
                  <Text style={styles.distanceMetricBig}>
                    {formatDistance(liveDistanceMeters)}
                  </Text>
                  <Text style={styles.distanceMetricSub}>from school grounds</Text>
                </View>

                <View style={styles.perimeterBadgeRow}>
                  <View
                    style={[
                      styles.perimeterBadge,
                      {
                        backgroundColor: isInsideCampusPerimeter
                          ? palette.successLight
                          : palette.warningLight,
                        borderColor: isInsideCampusPerimeter ? palette.success : palette.warning,
                      },
                    ]}
                  >
                    <Ionicons
                      name={
                        isInsideCampusPerimeter ? 'checkmark-circle' : 'navigate-circle-outline'
                      }
                      size={13}
                      color={isInsideCampusPerimeter ? palette.success : palette.warning}
                    />
                    <Text
                      style={[
                        styles.perimeterBadgeText,
                        { color: isInsideCampusPerimeter ? palette.success : palette.warning },
                      ]}
                    >
                      {isInsideCampusPerimeter ? 'INSIDE SCHOOL GROUNDS' : 'OUTSIDE SCHOOL GROUNDS'}
                    </Text>
                  </View>

                  <Text style={styles.perimeterRadiusMeta}>
                    {campusCenter.radius !== null
                      ? `Allowed area: ${campusCenter.radius}m`
                      : 'Boundary not set'}
                  </Text>
                </View>
              </>
            ) : (
              <View style={styles.acquiringFixBox}>
                <ActivityIndicator size="small" color={palette.primary} />
                <Text style={styles.acquiringFixText}>
                  {gpsError || 'Finding GPS location...'}
                </Text>
              </View>
            )}
          </View>
        </View>

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
                  {offlineCount} {offlineCount === 1 ? 'record' : 'records'} saved on phone
                </Text>
                <Text style={styles.offlineBufferSubtitle}>
                  {isSyncingQueue
                    ? 'Uploading to school server now...'
                    : isOnline
                    ? 'Tap here to upload now'
                    : 'Will upload when internet connects'}
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

        {/* DTR Summary Card */}
        {dtrData && (
          <>
            <View style={styles.sectionHeaderRow}>
              <Text style={styles.sectionHeaderTitle}>
                Daily Time Record ({dtrData.month} {dtrData.year})
              </Text>
              <Text style={styles.sectionHeaderSub}>{dtrData.days_present} Days Logged</Text>
            </View>

            <View style={styles.dtrSummaryCard}>
              <View style={styles.dtrGrid}>
                <View style={styles.dtrSlot}>
                  <Text style={styles.dtrSlotLabel}>AM IN</Text>
                  <Text style={styles.dtrSlotTime}>{todayDtrRow?.am_arrival || '--:--'}</Text>
                </View>
                <View style={styles.dtrSlot}>
                  <Text style={styles.dtrSlotLabel}>AM OUT</Text>
                  <Text style={styles.dtrSlotTime}>{todayDtrRow?.am_departure || '--:--'}</Text>
                </View>
                <View style={styles.dtrSlot}>
                  <Text style={styles.dtrSlotLabel}>PM IN</Text>
                  <Text style={styles.dtrSlotTime}>{todayDtrRow?.pm_arrival || '--:--'}</Text>
                </View>
                <View style={styles.dtrSlot}>
                  <Text style={styles.dtrSlotLabel}>PM OUT</Text>
                  <Text style={styles.dtrSlotTime}>{todayDtrRow?.pm_departure || '--:--'}</Text>
                </View>
              </View>

              <View style={styles.dtrCardFooter}>
                <Text style={styles.dtrFooterMeta}>
                  Undertime: {dtrData.total_undertime_hours}h {dtrData.total_undertime_minutes}m
                </Text>
                <Text
                  style={[
                    styles.dtrApprovalBadge,
                    {
                      color: dtrData.dept_head_approved
                        ? palette.success
                        : dtrData.dtr_submitted
                        ? palette.primary
                        : palette.textMuted,
                    },
                  ]}
                >
                  {dtrData.dept_head_approved
                    ? 'APPROVED BY DEPT HEAD'
                    : dtrData.dtr_submitted
                    ? 'SENT FOR REVIEW'
                    : 'LOGGING TODAY'}
                </Text>
              </View>
            </View>
          </>
        )}

        {/* Attendance Breakdown Tiles */}
        <View style={styles.sectionHeaderRow}>
          <Text style={styles.sectionHeaderTitle}>Student Attendance Today</Text>
          {lastSyncTime ? (
            <Text style={styles.sectionHeaderSub}>Updated {lastSyncTime}</Text>
          ) : null}
        </View>

        <View style={styles.kpiTileGrid}>
          <View style={styles.kpiTile}>
            <View style={[styles.kpiIconWrap, { backgroundColor: palette.successLight }]}>
              <Ionicons name="checkmark-circle-outline" size={15} color={palette.success} />
            </View>
            <Text style={[styles.kpiValueText, { color: palette.success }]}>{totalPresent}</Text>
            <Text style={styles.kpiLabelText}>Present</Text>
          </View>

          <View style={styles.kpiTile}>
            <View style={[styles.kpiIconWrap, { backgroundColor: palette.warningLight }]}>
              <Ionicons name="time-outline" size={15} color={palette.warning} />
            </View>
            <Text style={[styles.kpiValueText, { color: palette.warning }]}>{totalLate}</Text>
            <Text style={styles.kpiLabelText}>Late</Text>
          </View>

          <View style={styles.kpiTile}>
            <View style={[styles.kpiIconWrap, { backgroundColor: palette.dangerLight }]}>
              <Ionicons name="close-circle-outline" size={15} color={palette.danger} />
            </View>
            <Text style={[styles.kpiValueText, { color: palette.danger }]}>{totalAbsent}</Text>
            <Text style={styles.kpiLabelText}>Absent</Text>
          </View>

          <View style={styles.kpiTile}>
            <View style={[styles.kpiIconWrap, { backgroundColor: palette.surfaceSubtle }]}>
              <Ionicons name="eye-outline" size={15} color={palette.textSecondary} />
            </View>
            <Text style={[styles.kpiValueText, { color: palette.textPrimary }]}>
              {totalNeedsReview}
            </Text>
            <Text style={styles.kpiLabelText}>Review</Text>
          </View>
        </View>
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
    scrollContent: { paddingHorizontal: 16, paddingTop: 12, paddingBottom: 110 },
    modalOverlay: {
      flex: 1,
      backgroundColor: 'rgba(15, 23, 42, 0.75)',
      justifyContent: 'center',
      alignItems: 'center',
      padding: 20,
    },
    modalCard: {
      width: '100%',
      backgroundColor: palette.surface,
      borderRadius: 16,
      padding: 20,
      alignItems: 'center',
      borderWidth: 1,
      borderColor: palette.borderStrong,
    },
    modalIconWrap: {
      width: 54,
      height: 54,
      borderRadius: 27,
      backgroundColor: palette.primarySoft,
      justifyContent: 'center',
      alignItems: 'center',
      marginBottom: 12,
    },
    modalTitle: {
      fontSize: fonts.lg,
      fontWeight: fonts.weight.extrabold,
      color: palette.textPrimary,
      textAlign: 'center',
    },
    modalSubtitle: {
      fontSize: fonts.sm,
      color: palette.textSecondary,
      textAlign: 'center',
      marginTop: 4,
      lineHeight: 18,
    },
    modalMetricsBox: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-around',
      backgroundColor: palette.surfaceSubtle,
      borderWidth: 1,
      borderColor: palette.border,
      borderRadius: 10,
      width: '100%',
      paddingVertical: 10,
      marginVertical: 12,
    },
    modalMetricCol: { alignItems: 'center', flex: 1 },
    modalMetricDivider: { width: 1, height: 24, backgroundColor: palette.borderStrong },
    modalMetricLabel: { fontSize: 9, fontWeight: fonts.weight.extrabold, color: palette.textMuted },
    modalMetricVal: { fontSize: fonts.md, fontWeight: fonts.weight.extrabold, color: palette.textPrimary, marginTop: 2 },
    modalExplanation: {
      fontSize: fonts.xs,
      color: palette.textSecondary,
      textAlign: 'center',
      lineHeight: 16,
      marginBottom: 16,
    },
    modalConfirmBtn: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 6,
      backgroundColor: palette.buttonBg,
      width: '100%',
      paddingVertical: 12,
      borderRadius: 10,
    },
    modalConfirmBtnText: { color: palette.onPrimary, fontSize: fonts.sm, fontWeight: fonts.weight.bold },
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
          shadowColor: '#000000',
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
    progressPercent: { fontSize: fonts.xs, fontWeight: fonts.weight.extrabold, color: '#fef08a' },
    progressBarTrack: { height: 6, backgroundColor: 'rgba(255,255,255,0.25)', borderRadius: 3, overflow: 'hidden' },
    progressBarFill: { height: '100%', backgroundColor: '#fef08a', borderRadius: 3 },
    primaryStatusCard: {
      backgroundColor: palette.buttonBg,
      borderRadius: 18,
      padding: 16,
      marginBottom: 16,
      ...Platform.select({
        ios: { shadowColor: '#000000', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.18, shadowRadius: 8 },
        android: { elevation: 4 },
      }),
    },
    statusTopRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 12 },
    statusCardEyebrow: { fontSize: fonts.xxs, fontWeight: fonts.weight.extrabold, color: palette.onPrimary, opacity: 0.82, letterSpacing: 0.5 },
    statusCardTitle: { fontSize: fonts.lg, fontWeight: fonts.weight.extrabold, color: palette.onPrimary, marginTop: 2 },
    statusFooterRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
    statusPill: { backgroundColor: 'rgba(0,0,0,0.18)', paddingHorizontal: 10, paddingVertical: 4, borderRadius: 10 },
    statusPillText: { fontSize: fonts.xs, fontWeight: fonts.weight.bold, color: palette.onPrimary },
    sectionHeader: { fontSize: fonts.md, fontWeight: fonts.weight.extrabold, color: palette.textPrimary, marginBottom: 10, marginLeft: 2 },
    gridContainer: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginBottom: 16 },
    gridCard: {
      width: '48%',
      borderRadius: 16,
      padding: 14,
      backgroundColor: palette.surface,
      borderWidth: 1,
      borderColor: palette.border,
      gap: 4,
    },
    gridIconBox: { width: 36, height: 36, borderRadius: 10, alignItems: 'center', justifyContent: 'center', marginBottom: 4 },
    gridCardTitle: { fontSize: fonts.md, fontWeight: fonts.weight.extrabold, color: palette.textPrimary },
    gridCardSub: { fontSize: fonts.xs, color: palette.textSecondary, fontWeight: fonts.weight.semibold },
    moreToolsCard: {
      backgroundColor: palette.surface,
      borderRadius: 16,
      padding: 14,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      borderWidth: 1,
      borderColor: palette.border,
      marginBottom: 14,
    },
    moreToolsLeft: { flexDirection: 'row', alignItems: 'center', gap: 12, flex: 1 },
    moreToolsIconBox: { width: 40, height: 40, borderRadius: 12, backgroundColor: palette.primarySoft, alignItems: 'center', justifyContent: 'center' },
    moreToolsTitle: { fontSize: fonts.md, fontWeight: fonts.weight.extrabold, color: palette.textPrimary },
    moreToolsSub: { fontSize: fonts.xs, color: palette.textSecondary, marginTop: 2 },
    campusLocationCard: {
      backgroundColor: palette.surface,
      borderRadius: 14,
      padding: 14,
      borderWidth: 1,
      borderColor: palette.border,
      marginBottom: 12,
    },
    campusCardHeader: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      marginBottom: 8,
    },
    campusHeaderLeft: { flexDirection: 'row', alignItems: 'center', gap: 6 },
    pulseDot: { width: 8, height: 8, borderRadius: 4 },
    campusHeaderLabel: { fontSize: fonts.xxs, fontWeight: fonts.weight.extrabold, color: palette.primary, letterSpacing: 0.4 },
    timestampBadge: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 4,
      backgroundColor: palette.surfaceSubtle,
      paddingHorizontal: 6,
      paddingVertical: 2,
      borderRadius: 6,
    },
    timestampBadgeText: { fontSize: fonts.xxs, color: palette.textSecondary, fontWeight: fonts.weight.semibold },
    campusMainContent: { marginVertical: 4 },
    distanceValueRow: { flexDirection: 'row', alignItems: 'baseline', gap: 6 },
    distanceMetricBig: { fontSize: 26, fontWeight: fonts.weight.black, color: palette.textPrimary, letterSpacing: -0.5 },
    distanceMetricSub: { fontSize: fonts.xs, fontWeight: fonts.weight.semibold, color: palette.textSecondary },
    perimeterBadgeRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      flexWrap: 'wrap',
      gap: 6,
      marginTop: 6,
    },
    perimeterBadge: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 4,
      paddingVertical: 4,
      paddingHorizontal: 8,
      borderRadius: 6,
      borderWidth: 1,
    },
    perimeterBadgeText: { fontSize: fonts.xxs, fontWeight: fonts.weight.extrabold, letterSpacing: 0.2 },
    perimeterRadiusMeta: { fontSize: fonts.xs, color: palette.textSecondary, fontWeight: fonts.weight.semibold },
    acquiringFixBox: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 8 },
    acquiringFixText: { fontSize: fonts.xs, color: palette.textSecondary, fontWeight: fonts.weight.semibold, flex: 1 },
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
    sectionHeaderRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      marginTop: 12,
      marginBottom: 6,
    },
    sectionHeaderTitle: { fontSize: fonts.sm, fontWeight: fonts.weight.extrabold, color: palette.textPrimary },
    sectionHeaderSub: { fontSize: fonts.xxs, fontWeight: fonts.weight.semibold, color: palette.textMuted },
    dtrSummaryCard: {
      backgroundColor: palette.surface,
      borderRadius: 14,
      padding: 12,
      borderWidth: 1,
      borderColor: palette.border,
    },
    dtrGrid: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      backgroundColor: palette.surfaceSubtle,
      borderRadius: 8,
      paddingVertical: 8,
      paddingHorizontal: 8,
    },
    dtrSlot: { alignItems: 'center', flex: 1 },
    dtrSlotLabel: { fontSize: 9, fontWeight: fonts.weight.extrabold, color: palette.textMuted },
    dtrSlotTime: { fontSize: fonts.sm, fontWeight: fonts.weight.extrabold, color: palette.textPrimary, marginTop: 2 },
    dtrCardFooter: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      marginTop: 8,
      paddingHorizontal: 2,
    },
    dtrFooterMeta: { fontSize: fonts.xs, color: palette.textSecondary, fontWeight: fonts.weight.semibold },
    dtrApprovalBadge: { fontSize: fonts.xxs, fontWeight: fonts.weight.extrabold, letterSpacing: 0.2 },
    kpiTileGrid: { flexDirection: 'row', gap: 6, marginBottom: 4 },
    kpiTile: {
      flex: 1,
      backgroundColor: palette.surface,
      borderRadius: 12,
      padding: 10,
      borderWidth: 1,
      borderColor: palette.border,
      alignItems: 'center',
    },
    kpiIconWrap: {
      width: 28,
      height: 28,
      borderRadius: 8,
      alignItems: 'center',
      justifyContent: 'center',
      marginBottom: 4,
    },
    kpiValueText: { fontSize: fonts.md, fontWeight: fonts.weight.extrabold, color: palette.textPrimary },
    kpiLabelText: { fontSize: 9.5, fontWeight: fonts.weight.bold, color: palette.textSecondary, marginTop: 1, textAlign: 'center' },
  });

export default DashboardScreen;
