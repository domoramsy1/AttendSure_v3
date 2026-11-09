// D:\AttendSure_V3\mobile\src\screens\HomeScreen.tsx

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
import { apiClient } from '../api/client';
import { getServerBaseUrl } from '../services/configService';
import { getUnsyncedCount, syncOfflineQueue } from '../services/offlineQueue';
import { sendLiveHeartbeat, format12HourTime } from '../services/telemetryService';
import { startPassivePresenceTracking } from '../services/backgroundLocation';
import { COLORS } from '../constants/theme';

const fallbackLogo = require('../../assets/attendsure-logo.svg');

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

interface StudentItem {
  id: number;
  lrn: string;
  qr_token?: string;
  rfid_uid?: string;
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

const getLocalTodayStr = (): string => {
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, '0');
  const d = String(now.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
};

const getMindfulGreeting = (): { greeting: string; thought: string } => {
  const hour = new Date().getHours();
  if (hour < 12) {
    return {
      greeting: 'Good morning',
      thought: 'Presence is the highest form of dedication to your learners.',
    };
  }
  if (hour < 17) {
    return {
      greeting: 'Good afternoon',
      thought: 'Excellence in service through daily consistency and care.',
    };
  }
  return {
    greeting: 'Good evening',
    thought: 'Reflecting on a day of purpose, integrity, and mentorship.',
  };
};

export const HomeScreen: React.FC = () => {
  const { user, refreshUser } = useAuth();

  const [sections, setSections] = useState<SectionItem[]>([]);
  const [schoolProfile, setSchoolProfile] = useState<SchoolProfileData | null>(null);
  const [dtrData, setDtrData] = useState<DtrSummaryData | null>(null);
  const [geofenceConfig, setGeofenceConfig] = useState<GeofenceConfigData | null>(null);
  const [todayOverride, setTodayOverride] = useState<CalendarOverrideItem | null>(null);
  const [weekendRestEnabled, setWeekendRestEnabled] = useState<boolean>(false);

  const [loading, setLoading] = useState<boolean>(true);
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

  const [showAdvisoryModal, setShowAdvisoryModal] = useState<boolean>(false);
  const [advisoryAcknowledged, setAdvisoryAcknowledged] = useState<boolean>(false);
  const lastAdvisoryTimestamp = useRef<number>(0);

  const isMounted = useRef(true);
  const abortControllerRef = useRef<AbortController | null>(null);

  // Stationary Deadband Anchor: locks coordinates when phone is still (<6m drift)
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
    '';

  const schoolSubHeader = [
    schoolProfile?.school_id ? `School ID: ${schoolProfile.school_id}` : '',
    schoolProfile?.division || '',
  ]
    .filter(Boolean)
    .join(' • ');

  const mindfulQuote = useMemo(() => getMindfulGreeting(), []);

  const resolvePhotoUrl = useCallback((path: string | null | undefined, base: string) => {
    if (!path) return null;
    if (path.startsWith('http://') || path.startsWith('https://') || path.startsWith('data:')) {
      return path;
    }
    const cleanBase = base.replace(/\/+$/, '');
    const cleanPath = path.startsWith('/') ? path : `/${path}`;
    return `${cleanBase}${cleanPath}`;
  }, []);

  const rawUserPhoto =
    currentUser?.photo_url ||
    currentUser?.photo ||
    currentUser?.avatar_url ||
    currentUser?.avatar ||
    null;
  const resolvedUserPhoto = resolvePhotoUrl(rawUserPhoto, serverBase);

  useEffect(() => {
    startPassivePresenceTracking().catch((err) =>
      console.log('[BackgroundGPS] Startup notice:', err?.message || err)
    );
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

    // If movement is under 6 meters, lock coordinate to eliminate jitter
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
      } catch (err: any) {
        if (isSubscribed) {
          const msg = err?.message || '';
          if (msg.includes('locked') || msg.includes('mismatch') || msg.includes('403')) {
            setGpsError(msg);
            setIsOnline(false);
          }
        }
      }
    };

    const startLiveGpsTracking = async () => {
      try {
        const { status } = await Location.requestForegroundPermissionsAsync();
        if (status !== 'granted') {
          if (isSubscribed) setGpsError('Location permission needed for attendance.');
          return;
        }

        const isGpsActive = await Location.hasServicesEnabledAsync();
        if (!isGpsActive) {
          if (isSubscribed) setGpsError('Phone GPS is turned off.');
          return;
        }

        if (isSubscribed) setGpsError(null);

        const initial = await Location.getCurrentPositionAsync({
          accuracy: Location.Accuracy.High,
        });

        if (isSubscribed && initial) {
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
          transmitHeartbeat(stabilized);
        }

        watcherSubscription = await Location.watchPositionAsync(
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
              transmitHeartbeat(stabilized);
            }
          }
        );

        heartbeatIntervalTimer = setInterval(async () => {
          if (!isSubscribed) return;
          const now = Date.now();
          if (now - lastHeartbeatSent.current >= 60000) {
            try {
              const freshLoc = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.High });
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
              transmitHeartbeat(stabilized);
            } catch {
              if (anchorCoordsRef.current) {
                lastHeartbeatSent.current = now;
                const updated = { ...anchorCoordsRef.current, timestamp: format12HourTime(new Date()) };
                setLiveCoords(updated);
                transmitHeartbeat(updated);
              }
            }
          }
        }, 30000);

      } catch (err: any) {
        if (isSubscribed) {
          setGpsError(err?.message || 'Searching for GPS satellite signal...');
        }
      }
    };

    startLiveGpsTracking();

    return () => {
      isSubscribed = false;
      if (watcherSubscription) {
        watcherSubscription.remove();
      }
      if (heartbeatIntervalTimer) {
        clearInterval(heartbeatIntervalTimer);
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

  const hasTappedInToday = Boolean(todayDtrRow?.am_arrival || todayDtrRow?.pm_arrival);
  const hasTappedOutToday = Boolean(
    (todayDtrRow?.pm_departure && todayDtrRow.pm_departure !== '') ||
      (todayDtrRow?.am_departure && !todayDtrRow?.pm_arrival)
  );

  const isOfficiallyOnDuty = hasTappedInToday && !hasTappedOutToday;

  const dutyStatusLabel = hasTappedInToday
    ? hasTappedOutToday
      ? 'DONE FOR TODAY'
      : 'ACTIVE ON DUTY'
    : 'NO GATE SCAN';

  const dutyStatusColor = hasTappedInToday
    ? hasTappedOutToday
      ? '#d97706'
      : '#059669'
    : '#64748b';

  const dutyStatusBg = hasTappedInToday
    ? hasTappedOutToday
      ? '#fef3c7'
      : '#ecfdf5'
    : '#f1f5f9';

  useEffect(() => {
    if (isInsideCampusPerimeter === false && isOfficiallyOnDuty && campusCenter.radius !== null) {
      const accuracyMargin = liveCoords?.accuracy || 0;
      const excessDistance = (liveDistanceMeters || 0) - campusCenter.radius;

      if (excessDistance <= accuracyMargin) {
        return;
      }

      const now = Date.now();
      if (!advisoryAcknowledged || now - lastAdvisoryTimestamp.current > 300000) {
        setShowAdvisoryModal(true);
        lastAdvisoryTimestamp.current = now;
        Vibration.vibrate([0, 150, 100, 150]);
      }
    } else if (isInsideCampusPerimeter === true) {
      setShowAdvisoryModal(false);
      setAdvisoryAcknowledged(false);
    }
  }, [isInsideCampusPerimeter, isOfficiallyOnDuty, liveDistanceMeters, liveCoords, campusCenter.radius, advisoryAcknowledged]);

  const handleDismissAdvisory = () => {
    setShowAdvisoryModal(false);
    setAdvisoryAcknowledged(true);
  };

  const loadCachedData = useCallback(async () => {
    try {
      const [cachedSchool, cachedSections, cachedDtr, cachedGeo, activeBase] = await Promise.all([
        AsyncStorage.getItem('attendsure_cached_school'),
        AsyncStorage.getItem('attendsure_cached_sections'),
        AsyncStorage.getItem('attendsure_cached_dtr'),
        AsyncStorage.getItem('attendsure_cached_geofence'),
        getServerBaseUrl(),
      ]);

      if (cachedSchool) setSchoolProfile(JSON.parse(cachedSchool));
      if (cachedSections) setSections(JSON.parse(cachedSections));
      if (cachedDtr) setDtrData(JSON.parse(cachedDtr));
      if (cachedGeo) setGeofenceConfig(JSON.parse(cachedGeo));
      if (activeBase) setServerBase(activeBase);
    } catch {}
  }, []);

  const normalizeClasses = (rawList: any[]): SectionItem[] => {
    return rawList.map((item: any, idx: number) => ({
      schedule_id: item.schedule_id || item.id || idx + 1,
      section_id: item.section_id || item.section?.id || item.id || 0,
      section_name: item.section_name || item.section?.name || item.name || '',
      subject_name: item.subject_name || item.subject?.name || item.subject_title || '',
      subject_code: item.subject_code || item.subject?.code || '',
      room: item.room || item.room_number || item.room?.name || '',
      start_time: typeof item.start_time === 'string' ? item.start_time : '',
      end_time: typeof item.end_time === 'string' ? item.end_time : '',
      total_students: Array.isArray(item.students) ? item.students.length : Number(item.total_students) || 0,
      students: Array.isArray(item.students) ? item.students : [],
    }));
  };

  const flushOfflineRecords = useCallback(async () => {
    try {
      setIsSyncingQueue(true);
      const res = await syncOfflineQueue();
      const updatedCount = await getUnsyncedCount();
      if (isMounted.current) {
        setOfflineCount(updatedCount);
        if (res.synced > 0) {
          setIsOnline(true);
        }
      }
    } catch (err) {
      console.log('[SyncQueue] Error:', err);
    } finally {
      if (isMounted.current) setIsSyncingQueue(false);
    }
  }, []);

  const loadAllDynamicData = useCallback(async () => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }
    const controller = new AbortController();
    abortControllerRef.current = controller;

    const todayDate = getLocalTodayStr();
    const now = new Date();

    const [
      classListRes,
      schoolRes,
      dtrRes,
      geofenceRes,
      calendarRes,
    ] = await Promise.allSettled([
      apiClient.get('classroom/class_list/', { signal: controller.signal, timeout: 5000 })
        .catch(() => apiClient.get('classroom/student_list/', { signal: controller.signal, timeout: 5000 }))
        .catch(() => apiClient.get('sections/', { signal: controller.signal, timeout: 5000 })),
      apiClient.get('settings/school/', { signal: controller.signal, timeout: 5000 }),
      apiClient.get(`dtr/?month=${now.getMonth() + 1}&year=${now.getFullYear()}`, { signal: controller.signal, timeout: 5000 }),
      apiClient.get('geofence/', { signal: controller.signal, timeout: 5000 }),
      apiClient.get('calendar/exceptions/', { signal: controller.signal, timeout: 5000 }),
    ]);

    if (!isMounted.current) return;

    if (classListRes.status === 'fulfilled' && classListRes.value?.data) {
      const rawPayload = classListRes.value.data;
      const rawList = Array.isArray(rawPayload)
        ? rawPayload
        : Array.isArray(rawPayload?.results)
        ? rawPayload.results
        : [];
      const normalized = normalizeClasses(rawList);
      setSections(normalized);
      AsyncStorage.setItem('attendsure_cached_sections', JSON.stringify(normalized)).catch(() => {});
    }

    if (schoolRes.status === 'fulfilled' && schoolRes.value?.data) {
      setSchoolProfile(schoolRes.value.data);
      AsyncStorage.setItem('attendsure_cached_school', JSON.stringify(schoolRes.value.data)).catch(() => {});
    }

    if (dtrRes.status === 'fulfilled' && dtrRes.value?.data) {
      setDtrData(dtrRes.value.data);
      AsyncStorage.setItem('attendsure_cached_dtr', JSON.stringify(dtrRes.value.data)).catch(() => {});
    }

    if (geofenceRes.status === 'fulfilled' && geofenceRes.value?.data) {
      setGeofenceConfig(geofenceRes.value.data);
      AsyncStorage.setItem('attendsure_cached_geofence', JSON.stringify(geofenceRes.value.data)).catch(() => {});
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

    const count = await getUnsyncedCount();
    setOfflineCount(count);
    if (count > 0) {
      flushOfflineRecords();
    }

    setLastSyncTime(format12HourTime(new Date()));
    setLoading(false);
  }, [flushOfflineRecords]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await Promise.all([loadAllDynamicData(), flushOfflineRecords(), refreshUser()]);
    if (isMounted.current) setRefreshing(false);
  }, [loadAllDynamicData, flushOfflineRecords, refreshUser]);

  useEffect(() => {
    isMounted.current = true;
    loadCachedData().then(() => {
      loadAllDynamicData();
    });
    refreshUser();

    return () => {
      isMounted.current = false;
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
      }
    };
  }, [loadCachedData, loadAllDynamicData, refreshUser]);

  const safeSections = Array.isArray(sections) ? sections : [];
  const totalClasses = safeSections.length;

  let totalStudentsEnrolled = 0;
  let totalPresent = 0;
  let totalLate = 0;
  let totalAbsent = 0;
  let totalNeedsReview = 0;
  let totalUnscanned = 0;

  let totalMaleEnrolled = 0;
  let totalFemaleEnrolled = 0;
  let totalMalePresent = 0;
  let totalFemalePresent = 0;

  safeSections.forEach((sec) => {
    const students = Array.isArray(sec?.students) ? sec.students : [];
    totalStudentsEnrolled += students.length;

    students.forEach((st) => {
      const status = String(st?.attendance_status || 'UNSCANNED').toUpperCase();
      const gender = String(st?.gender || '').trim().toUpperCase();
      const isMale = gender.startsWith('M');
      const isFemale = gender.startsWith('F');

      if (isMale) totalMaleEnrolled += 1;
      if (isFemale) totalFemaleEnrolled += 1;

      if (status === 'PRESENT') {
        totalPresent += 1;
        if (isMale) totalMalePresent += 1;
        if (isFemale) totalFemalePresent += 1;
      } else if (status === 'LATE' || status === 'TARDY') {
        totalLate += 1;
        if (isMale) totalMalePresent += 1;
        if (isFemale) totalFemalePresent += 1;
      } else if (status === 'ABSENT') {
        totalAbsent += 1;
      } else if (status === 'CUTTING' || status === 'UNVERIFIED') {
        totalNeedsReview += 1;
      } else {
        totalUnscanned += 1;
      }
    });
  });

  const totalAttended = totalPresent + totalLate;
  const overallRate =
    totalStudentsEnrolled > 0
      ? Math.round((totalAttended / totalStudentsEnrolled) * 100)
      : 0;

  const isWeekendToday = [0, 6].includes(new Date().getDay());

  const rawLogoPath = schoolProfile?.school_logo || schoolProfile?.left_logo;
  const resolvedLogoUri = resolvePhotoUrl(rawLogoPath, serverBase);
  const logoSource = (resolvedLogoUri && !logoFailed) ? { uri: resolvedLogoUri } : fallbackLogo;

  return (
    <SafeAreaView style={styles.safeContainer} edges={['top', 'left', 'right']}>
      <StatusBar style="dark" />

      {/* Campus Boundary Advisory Modal */}
      <Modal
        visible={showAdvisoryModal}
        transparent={true}
        animationType="fade"
        onRequestClose={handleDismissAdvisory}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalCard}>
            <View style={styles.modalIconWrap}>
              <Ionicons name="location-outline" size={32} color="#004b87" />
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
              If you are on official school business, notify your department head. Otherwise, please return to campus grounds to verify your attendance.
            </Text>

            <TouchableOpacity
              style={styles.modalConfirmBtn}
              onPress={handleDismissAdvisory}
              activeOpacity={0.85}
            >
              <Ionicons name="checkmark-outline" size={16} color="#ffffff" />
              <Text style={styles.modalConfirmBtnText}>I Understand</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      {/* Top Header */}
      <View style={styles.topHeader}>
        <View style={styles.brandGroup}>
          <Image
            source={logoSource}
            style={styles.schoolLogo}
            contentFit="contain"
            onError={() => setLogoFailed(true)}
          />
          <View style={styles.brandTextGroup}>
            <Text style={styles.schoolTitle} numberOfLines={1}>
              {schoolName || 'AttendSure'}
            </Text>
            {schoolSubHeader ? (
              <View style={styles.subBrandRow}>
                <View style={[styles.activeDot, { backgroundColor: isOnline ? '#16a34a' : '#94a3b8' }]} />
                <Text style={styles.protocolText} numberOfLines={1}>
                  {schoolSubHeader}
                </Text>
              </View>
            ) : null}
          </View>
        </View>

        <TouchableOpacity
          style={styles.refreshButton}
          onPress={onRefresh}
          activeOpacity={0.7}
          accessibilityLabel="Refresh records"
        >
          <Ionicons name="sync-outline" size={16} color="#004b87" />
        </TouchableOpacity>
      </View>

      <ScrollView
        style={styles.scrollArea}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} colors={[COLORS.primary]} />
        }
      >
        {/* Fake GPS Security Alert */}
        {liveCoords?.mocked && (
          <View style={styles.securityAlertCard}>
            <Ionicons name="alert-circle-outline" size={18} color="#dc2626" />
            <View style={{ flex: 1 }}>
              <Text style={styles.securityAlertTitle}>Fake GPS Detected</Text>
              <Text style={styles.securityAlertBody}>
                Mock location apps are running. Please turn off fake GPS in phone settings to keep official school logs valid.
              </Text>
            </View>
          </View>
        )}

        {/* 1. Educator Identity Card */}
        <View style={styles.educatorDignityCard}>
          <View style={styles.educatorHeaderRow}>
            <View style={styles.avatarContainer}>
              <View style={styles.avatarWrap}>
                {resolvedUserPhoto && !avatarFailed ? (
                  <Image
                    source={{ uri: resolvedUserPhoto }}
                    style={styles.educatorAvatar}
                    contentFit="cover"
                    onError={() => setAvatarFailed(true)}
                  />
                ) : (
                  <View style={styles.avatarFallback}>
                    <Ionicons name="person" size={20} color="#004b87" />
                  </View>
                )}
              </View>

              <View
                style={[
                  styles.onlineStatusDot,
                  { backgroundColor: isOnline ? '#16a34a' : '#94a3b8' },
                ]}
              />
            </View>

            <View style={{ flex: 1, marginLeft: 12 }}>
              <Text style={styles.greetingGreeting}>{mindfulQuote.greeting},</Text>
              <Text style={styles.educatorFullName} numberOfLines={1}>
                {displayName}
              </Text>
              <Text style={styles.educatorDesignation}>
                {employeeId ? `ID: ${employeeId}` : 'Faculty'} • <Text style={{ color: isOnline ? '#16a34a' : '#64748b', fontWeight: '800' }}>{isOnline ? 'Online' : 'Offline'}</Text>
              </Text>
            </View>

            <View style={[styles.dutyStatusPill, { backgroundColor: dutyStatusBg }]}>
              <View style={[styles.activeDot, { backgroundColor: dutyStatusColor }]} />
              <Text style={[styles.dutyStatusPillText, { color: dutyStatusColor }]}>
                {dutyStatusLabel}
              </Text>
            </View>
          </View>

          <View style={styles.quoteSeparator} />
          <Text style={styles.mindfulQuoteText}>
            "{mindfulQuote.thought}"
          </Text>
        </View>

        {/* 2. School Campus Location Card in 12-Hour AM/PM Format */}
        <View style={styles.presenceShieldCard}>
          <View style={styles.presenceCardHeader}>
            <View style={styles.presenceHeaderLeft}>
              <View
                style={[
                  styles.pulseDot,
                  {
                    backgroundColor:
                      isInsideCampusPerimeter === true
                        ? '#16a34a'
                        : isInsideCampusPerimeter === false
                        ? '#d97706'
                        : '#94a3b8',
                  },
                ]}
              />
              <Text style={styles.presenceHeaderLabel}>SCHOOL CAMPUS LOCATION</Text>
            </View>

            {liveCoords?.timestamp ? (
              <View style={styles.timestampBadge}>
                <Ionicons name="time-outline" size={11} color="#64748b" />
                <Text style={styles.timestampBadgeText}>{liveCoords.timestamp}</Text>
              </View>
            ) : null}
          </View>

          <View style={styles.presenceMainContent}>
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
                        backgroundColor: isInsideCampusPerimeter ? '#ecfdf5' : '#fffbeb',
                        borderColor: isInsideCampusPerimeter ? '#a7f3d0' : '#fde68a',
                      },
                    ]}
                  >
                    <Ionicons
                      name={isInsideCampusPerimeter ? 'checkmark-circle' : 'navigate-circle-outline'}
                      size={13}
                      color={isInsideCampusPerimeter ? '#059669' : '#d97706'}
                    />
                    <Text
                      style={[
                        styles.perimeterBadgeText,
                        { color: isInsideCampusPerimeter ? '#047857' : '#b45309' },
                      ]}
                    >
                      {isInsideCampusPerimeter ? 'INSIDE SCHOOL GROUNDS' : 'OUTSIDE SCHOOL GROUNDS'}
                    </Text>
                  </View>

                  <Text style={styles.perimeterRadiusMeta}>
                    {campusCenter.radius !== null ? `Allowed area: ${campusCenter.radius}m` : 'Boundary unconfigured'}
                  </Text>
                </View>
              </>
            ) : (
              <View style={styles.acquiringFixBox}>
                <ActivityIndicator size="small" color="#004b87" />
                <Text style={styles.acquiringFixText}>
                  {gpsError || 'Finding satellite location...'}
                </Text>
              </View>
            )}
          </View>

          <View style={styles.presenceFooterRow}>
            <View style={styles.presenceFooterCol}>
              <Ionicons name="shield-checkmark-outline" size={12} color="#004b87" />
              <Text style={styles.presenceFooterText}>Account Protected</Text>
            </View>

            <View style={styles.presenceFooterCol}>
              <Ionicons name="radio-outline" size={12} color="#64748b" />
              <Text style={styles.presenceFooterText}>
                GPS Accuracy: {liveCoords?.accuracy ? `±${Math.round(liveCoords.accuracy)}m` : 'Measuring...'}
              </Text>
            </View>
          </View>
        </View>

        {/* 3. Offline Buffer Banner */}
        {offlineCount > 0 && (
          <TouchableOpacity
            style={styles.offlineBufferBanner}
            onPress={flushOfflineRecords}
            disabled={isSyncingQueue}
            activeOpacity={0.8}
          >
            <View style={styles.offlineBannerLeft}>
              <Ionicons
                name={isSyncingQueue ? 'sync-outline' : 'cloud-upload-outline'}
                size={18}
                color="#b45309"
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
              <ActivityIndicator size="small" color="#b45309" />
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
            <Ionicons name="calendar-outline" size={16} color="#004b87" />
            <View style={{ flex: 1 }}>
              <Text style={styles.calendarBannerTitle}>
                {todayOverride.type}: {todayOverride.date}
              </Text>
              <Text style={styles.calendarBannerReason}>{todayOverride.reason}</Text>
            </View>
          </View>
        ) : isWeekendToday && weekendRestEnabled ? (
          <View style={[styles.calendarBanner, { backgroundColor: '#f0fdf4', borderColor: '#bbf7d0' }]}>
            <Ionicons name="partly-sunny-outline" size={16} color="#16a34a" />
            <View style={{ flex: 1 }}>
              <Text style={[styles.calendarBannerTitle, { color: '#15803d' }]}>
                Weekend Rest Day
              </Text>
              <Text style={[styles.calendarBannerReason, { color: '#166534' }]}>
                Duty logging is optional during scheduled rest days.
              </Text>
            </View>
          </View>
        ) : null}

        {/* 4. DTR Card */}
        {dtrData && (
          <>
            <View style={styles.sectionHeaderRow}>
              <Text style={styles.sectionHeaderTitle}>
                Daily Time Record ({dtrData.month} {dtrData.year})
              </Text>
              <Text style={styles.sectionHeaderSub}>
                {dtrData.days_present} Days Logged
              </Text>
            </View>

            <View style={styles.dtrIntegrityCard}>
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
                        ? '#16a34a'
                        : dtrData.dtr_submitted
                        ? '#004b87'
                        : '#64748b',
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

        {/* 5. Student Attendance Today */}
        <View style={styles.sectionHeaderRow}>
          <Text style={styles.sectionHeaderTitle}>Student Attendance Today</Text>
          {lastSyncTime ? (
            <Text style={styles.sectionHeaderSub}>Updated {lastSyncTime}</Text>
          ) : null}
        </View>

        <View style={styles.analyticsCard}>
          <View style={styles.analyticsHeader}>
            <View style={{ flex: 1 }}>
              <Text style={styles.analyticsTitle}>Class Attendance Rate</Text>
              <Text style={styles.analyticsSub}>
                {totalAttended} of {totalStudentsEnrolled} students present across {totalClasses} class{totalClasses === 1 ? '' : 'es'}
              </Text>
            </View>
            <Text style={styles.analyticsRateLarge}>{overallRate}%</Text>
          </View>

          <View style={styles.analyticsProgressBarTrack}>
            <View style={[styles.analyticsProgressBarFill, { width: `${Math.min(overallRate, 100)}%` }]} />
          </View>

          {totalStudentsEnrolled > 0 && (
            <View style={styles.genderMetricsRow}>
              <View style={styles.genderMetricChip}>
                <Ionicons name="male" size={12} color="#004b87" />
                <Text style={styles.genderMetricText}>
                  Male: {totalMalePresent}/{totalMaleEnrolled}
                </Text>
              </View>
              <View style={styles.genderMetricChip}>
                <Ionicons name="female" size={12} color="#db2777" />
                <Text style={styles.genderMetricText}>
                  Female: {totalFemalePresent}/{totalFemaleEnrolled}
                </Text>
              </View>
              <View style={styles.genderMetricChip}>
                <Ionicons name="time-outline" size={12} color="#64748b" />
                <Text style={styles.genderMetricText}>Not Scanned: {totalUnscanned}</Text>
              </View>
            </View>
          )}
        </View>

        {/* Attendance Breakdown Tiles */}
        <View style={styles.kpiTileGrid}>
          <View style={styles.kpiTile}>
            <View style={[styles.kpiIconWrap, { backgroundColor: '#ecfdf5' }]}>
              <Ionicons name="checkmark-circle-outline" size={15} color="#059669" />
            </View>
            <Text style={[styles.kpiValueText, { color: '#059669' }]}>{totalPresent}</Text>
            <Text style={styles.kpiLabelText}>Present</Text>
          </View>

          <View style={styles.kpiTile}>
            <View style={[styles.kpiIconWrap, { backgroundColor: '#fef3c7' }]}>
              <Ionicons name="time-outline" size={15} color="#d97706" />
            </View>
            <Text style={[styles.kpiValueText, { color: '#d97706' }]}>{totalLate}</Text>
            <Text style={styles.kpiLabelText}>Late</Text>
          </View>

          <View style={styles.kpiTile}>
            <View style={[styles.kpiIconWrap, { backgroundColor: '#fee2e2' }]}>
              <Ionicons name="close-circle-outline" size={15} color="#dc2626" />
            </View>
            <Text style={[styles.kpiValueText, { color: '#dc2626' }]}>{totalAbsent}</Text>
            <Text style={styles.kpiLabelText}>Absent</Text>
          </View>

          <View style={styles.kpiTile}>
            <View style={[styles.kpiIconWrap, { backgroundColor: '#f1f5f9' }]}>
              <Ionicons name="eye-outline" size={15} color="#475569" />
            </View>
            <Text style={[styles.kpiValueText, { color: '#334155' }]}>{totalNeedsReview}</Text>
            <Text style={styles.kpiLabelText}>Review</Text>
          </View>
        </View>

        {/* 6. Today's Classes List */}
        <View style={styles.sectionHeaderRow}>
          <Text style={styles.sectionHeaderTitle}>My Classes Today</Text>
          <Text style={styles.sectionCountText}>{sections.length} Assigned</Text>
        </View>

        {loading && sections.length === 0 ? (
          <View style={styles.emptyStateCard}>
            <ActivityIndicator size="small" color="#004b87" />
            <Text style={styles.emptyStateText}>Loading class schedule...</Text>
          </View>
        ) : sections.length === 0 ? (
          <View style={styles.emptyStateCard}>
            <Ionicons name="school-outline" size={32} color="#94a3b8" />
            <Text style={styles.emptyStateTitle}>No Classes Scheduled</Text>
            <Text style={styles.emptyStateText}>
              There are no classroom teaching schedules assigned to your account today.
            </Text>
          </View>
        ) : (
          safeSections.map((sec) => {
            const students = Array.isArray(sec?.students) ? sec.students : [];
            const classPresent = students.filter((s) => s.attendance_status === 'PRESENT').length;
            const classLate = students.filter((s) =>
              ['LATE', 'TARDY'].includes(String(s.attendance_status).toUpperCase())
            ).length;
            const classFlagged = students.filter((s) =>
              ['CUTTING', 'UNVERIFIED'].includes(String(s.attendance_status).toUpperCase())
            ).length;
            const classUnscanned = students.filter(
              (s) => String(s.attendance_status || 'UNSCANNED').toUpperCase() === 'UNSCANNED'
            ).length;

            const enrolledCount = students.length;
            const classRate =
              enrolledCount > 0 ? Math.round(((classPresent + classLate) / enrolledCount) * 100) : 0;

            const timeRange =
              sec.start_time && sec.end_time ? `${sec.start_time} - ${sec.end_time}` : '';
            const roomAndTime = [sec.room, timeRange].filter(Boolean).join(' • ');

            return (
              <View key={String(sec.schedule_id)} style={styles.sessionCard}>
                <View style={styles.sessionCardHeader}>
                  <View style={{ flex: 1, marginRight: 8 }}>
                    <Text style={styles.sessionSubjectTitle}>
                      {[sec.subject_name, sec.section_name].filter(Boolean).join(' • ')}
                    </Text>
                    {roomAndTime ? (
                      <Text style={styles.sessionRoomMeta}>{roomAndTime}</Text>
                    ) : null}
                  </View>

                  <View style={styles.sessionRatePill}>
                    <Text style={styles.sessionRatePillText}>{classRate}% checked</Text>
                  </View>
                </View>

                <View style={styles.sessionProgressTrack}>
                  <View style={[styles.sessionProgressFill, { width: `${Math.min(classRate, 100)}%` }]} />
                </View>

                <View style={styles.sessionMetricsRow}>
                  <View style={styles.sessionMetricCol}>
                    <Text style={styles.sessionMetricLabel}>ENROLLED</Text>
                    <Text style={styles.sessionMetricVal}>{enrolledCount}</Text>
                  </View>

                  <View style={styles.sessionMetricCol}>
                    <Text style={[styles.sessionMetricLabel, { color: '#059669' }]}>PRESENT</Text>
                    <Text style={[styles.sessionMetricVal, { color: '#059669' }]}>{classPresent}</Text>
                  </View>

                  <View style={styles.sessionMetricCol}>
                    <Text style={[styles.sessionMetricLabel, { color: '#d97706' }]}>LATE</Text>
                    <Text style={[styles.sessionMetricVal, { color: '#d97706' }]}>{classLate}</Text>
                  </View>

                  <View style={styles.sessionMetricCol}>
                    <Text style={[styles.sessionMetricLabel, { color: '#64748b' }]}>REVIEW</Text>
                    <Text style={[styles.sessionMetricVal, { color: '#475569' }]}>{classFlagged}</Text>
                  </View>

                  <View style={styles.sessionMetricCol}>
                    <Text style={[styles.sessionMetricLabel, { color: '#dc2626' }]}>PENDING</Text>
                    <Text style={[styles.sessionMetricVal, { color: '#dc2626' }]}>
                      {classUnscanned}
                    </Text>
                  </View>
                </View>
              </View>
            );
          })
        )}
      </ScrollView>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  safeContainer: { flex: 1, backgroundColor: '#f8fafc' },
  topHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 10,
    backgroundColor: '#ffffff',
    borderBottomWidth: 1,
    borderBottomColor: '#e2e8f0',
  },
  brandGroup: { flexDirection: 'row', alignItems: 'center', flex: 1 },
  schoolLogo: { width: 34, height: 34, borderRadius: 8 },
  brandTextGroup: { marginLeft: 10, flex: 1 },
  schoolTitle: { fontSize: 13, fontWeight: '800', color: '#003460' },
  subBrandRow: { flexDirection: 'row', alignItems: 'center', marginTop: 1, gap: 5 },
  activeDot: { width: 6, height: 6, borderRadius: 3 },
  protocolText: { fontSize: 10, fontWeight: '700', color: '#004b87' },
  refreshButton: {
    width: 32,
    height: 32,
    borderRadius: 8,
    backgroundColor: '#f1f5f9',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: '#e2e8f0',
  },
  scrollArea: { flex: 1 },
  scrollContent: { paddingHorizontal: 16, paddingTop: 12, paddingBottom: 28 },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(15, 23, 42, 0.75)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  modalCard: {
    width: '100%',
    backgroundColor: '#ffffff',
    borderRadius: 16,
    padding: 20,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#cbd5e1',
    ...Platform.select({
      ios: { shadowColor: '#003460', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.2, shadowRadius: 12 },
      android: { elevation: 6 },
    }),
  },
  modalIconWrap: {
    width: 54,
    height: 54,
    borderRadius: 27,
    backgroundColor: '#e0f2fe',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 12,
  },
  modalTitle: { fontSize: 16, fontWeight: '800', color: '#003460', textAlign: 'center' },
  modalSubtitle: { fontSize: 12, color: '#475569', textAlign: 'center', marginTop: 4, lineHeight: 17 },
  modalMetricsBox: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-around',
    backgroundColor: '#f8fafc',
    borderWidth: 1,
    borderColor: '#e2e8f0',
    borderRadius: 10,
    width: '100%',
    paddingVertical: 10,
    marginVertical: 12,
  },
  modalMetricCol: { alignItems: 'center', flex: 1 },
  modalMetricDivider: { width: 1, height: 24, backgroundColor: '#cbd5e1' },
  modalMetricLabel: { fontSize: 8.5, fontWeight: '800', color: '#64748b' },
  modalMetricVal: { fontSize: 15, fontWeight: '800', color: '#003460', marginTop: 1 },
  modalExplanation: { fontSize: 11, color: '#64748b', textAlign: 'center', lineHeight: 16, marginBottom: 16 },
  modalConfirmBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    backgroundColor: '#004b87',
    width: '100%',
    paddingVertical: 11,
    borderRadius: 8,
  },
  modalConfirmBtnText: { color: '#ffffff', fontSize: 13, fontWeight: '700' },
  securityAlertCard: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    backgroundColor: '#fef2f2',
    borderWidth: 1,
    borderColor: '#fca5a5',
    borderRadius: 10,
    padding: 10,
    marginBottom: 10,
    gap: 8,
  },
  securityAlertTitle: { fontSize: 11.5, fontWeight: '800', color: '#991b1b' },
  securityAlertBody: { fontSize: 10.5, color: '#b91c1c', marginTop: 2, lineHeight: 14 },
  educatorDignityCard: {
    backgroundColor: '#ffffff',
    borderRadius: 14,
    padding: 14,
    borderWidth: 1,
    borderColor: '#e2e8f0',
    marginBottom: 10,
  },
  educatorHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  avatarContainer: {
    position: 'relative',
    width: 44,
    height: 44,
  },
  avatarWrap: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: '#f1f5f9',
    borderWidth: 1.5,
    borderColor: '#004b87',
    overflow: 'hidden',
    justifyContent: 'center',
    alignItems: 'center',
  },
  educatorAvatar: {
    width: '100%',
    height: '100%',
  },
  avatarFallback: {
    width: '100%',
    height: '100%',
    backgroundColor: '#e0f2fe',
    alignItems: 'center',
    justifyContent: 'center',
  },
  onlineStatusDot: {
    position: 'absolute',
    bottom: -1,
    right: -1,
    width: 13,
    height: 13,
    borderRadius: 6.5,
    borderWidth: 2,
    borderColor: '#ffffff',
    zIndex: 10,
    elevation: 3,
  },
  greetingGreeting: { fontSize: 11, color: '#64748b', fontWeight: '600' },
  educatorFullName: { fontSize: 15, fontWeight: '800', color: '#0f172a', marginTop: 1 },
  educatorDesignation: { fontSize: 11, color: '#475569', fontWeight: '600', marginTop: 1 },
  dutyStatusPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingVertical: 4,
    paddingHorizontal: 8,
    borderRadius: 6,
    marginLeft: 6,
  },
  dutyStatusPillText: { fontSize: 9.5, fontWeight: '800', letterSpacing: 0.3 },
  quoteSeparator: {
    height: 1,
    backgroundColor: '#f1f5f9',
    marginVertical: 10,
  },
  mindfulQuoteText: {
    fontSize: 11,
    fontStyle: 'italic',
    color: '#475569',
    lineHeight: 15,
  },
  presenceShieldCard: {
    backgroundColor: '#ffffff',
    borderRadius: 14,
    padding: 14,
    borderWidth: 1.5,
    borderColor: '#e0f2fe',
    marginBottom: 10,
  },
  presenceCardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 8,
  },
  presenceHeaderLeft: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  pulseDot: { width: 8, height: 8, borderRadius: 4 },
  presenceHeaderLabel: { fontSize: 10, fontWeight: '800', color: '#0369a1', letterSpacing: 0.4 },
  timestampBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: '#f1f5f9',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
  },
  timestampBadgeText: { fontSize: 9.5, color: '#475569', fontWeight: '600' },
  presenceMainContent: { marginVertical: 4 },
  distanceValueRow: { flexDirection: 'row', alignItems: 'baseline', gap: 6 },
  distanceMetricBig: { fontSize: 26, fontWeight: '900', color: '#003460', letterSpacing: -0.5 },
  distanceMetricSub: { fontSize: 11.5, fontWeight: '600', color: '#64748b' },
  perimeterBadgeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 6,
  },
  perimeterBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingVertical: 3.5,
    paddingHorizontal: 8,
    borderRadius: 6,
    borderWidth: 1,
  },
  perimeterBadgeText: { fontSize: 9.5, fontWeight: '800', letterSpacing: 0.2 },
  perimeterRadiusMeta: { fontSize: 10.5, color: '#64748b', fontWeight: '600' },
  acquiringFixBox: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 8 },
  acquiringFixText: { fontSize: 11.5, color: '#64748b', fontWeight: '600' },
  presenceFooterRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 8,
    paddingTop: 8,
    borderTopWidth: 1,
    borderTopColor: '#f1f5f9',
  },
  presenceFooterCol: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  presenceFooterText: { fontSize: 9.5, color: '#475569', fontWeight: '600' },
  offlineBufferBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#fffbeb',
    borderRadius: 10,
    padding: 10,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: '#fde68a',
  },
  offlineBannerLeft: { flexDirection: 'row', alignItems: 'center', gap: 8, flex: 1, marginRight: 8 },
  offlineBufferTitle: { fontSize: 11.5, fontWeight: '800', color: '#92400e' },
  offlineBufferSubtitle: { fontSize: 10, color: '#b45309', marginTop: 1 },
  syncNowBtn: {
    backgroundColor: '#d97706',
    paddingVertical: 5,
    paddingHorizontal: 9,
    borderRadius: 6,
  },
  syncNowBtnText: { color: '#ffffff', fontSize: 10.5, fontWeight: '800' },
  calendarBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#eff6ff',
    borderRadius: 10,
    padding: 10,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: '#bfdbfe',
    gap: 8,
  },
  calendarBannerTitle: { fontSize: 11.5, fontWeight: '800', color: '#004b87' },
  calendarBannerReason: { fontSize: 10.5, color: '#1e3a8a', marginTop: 1 },
  sectionHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 12,
    marginBottom: 6,
  },
  sectionHeaderTitle: { fontSize: 12.5, fontWeight: '800', color: '#334155' },
  sectionHeaderSub: { fontSize: 10, fontWeight: '600', color: '#64748b' },
  sectionCountText: { fontSize: 10.5, fontWeight: '700', color: '#004b87' },
  dtrIntegrityCard: {
    backgroundColor: '#ffffff',
    borderRadius: 14,
    padding: 12,
    borderWidth: 1,
    borderColor: '#e2e8f0',
  },
  dtrGrid: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    backgroundColor: '#f8fafc',
    borderRadius: 8,
    paddingVertical: 8,
    paddingHorizontal: 8,
  },
  dtrSlot: { alignItems: 'center', flex: 1 },
  dtrSlotLabel: { fontSize: 8.5, fontWeight: '800', color: '#64748b' },
  dtrSlotTime: { fontSize: 12, fontWeight: '800', color: '#0f172a', marginTop: 2 },
  dtrCardFooter: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 8,
    paddingHorizontal: 2,
  },
  dtrFooterMeta: { fontSize: 10.5, color: '#475569', fontWeight: '600' },
  dtrApprovalBadge: { fontSize: 9.5, fontWeight: '800', letterSpacing: 0.2 },
  analyticsCard: {
    backgroundColor: '#ffffff',
    borderRadius: 14,
    padding: 12,
    borderWidth: 1,
    borderColor: '#e2e8f0',
    marginBottom: 10,
  },
  analyticsHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  analyticsTitle: { fontSize: 13, fontWeight: '800', color: '#0f172a' },
  analyticsSub: { fontSize: 10.5, color: '#64748b', marginTop: 1 },
  analyticsRateLarge: { fontSize: 24, fontWeight: '900', color: '#004b87', marginLeft: 8 },
  analyticsProgressBarTrack: {
    height: 5,
    backgroundColor: '#f1f5f9',
    borderRadius: 2.5,
    overflow: 'hidden',
    marginTop: 8,
  },
  analyticsProgressBarFill: { height: '100%', backgroundColor: '#004b87', borderRadius: 2.5 },
  genderMetricsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 8,
    paddingTop: 8,
    borderTopWidth: 1,
    borderTopColor: '#f1f5f9',
  },
  genderMetricChip: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  genderMetricText: { fontSize: 10.5, fontWeight: '700', color: '#334155' },
  kpiTileGrid: { flexDirection: 'row', gap: 6, marginBottom: 4 },
  kpiTile: {
    flex: 1,
    backgroundColor: '#ffffff',
    borderRadius: 10,
    padding: 8,
    borderWidth: 1,
    borderColor: '#e2e8f0',
    alignItems: 'center',
  },
  kpiIconWrap: {
    width: 26,
    height: 26,
    borderRadius: 6,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 4,
  },
  kpiValueText: { fontSize: 15, fontWeight: '800', color: '#0f172a' },
  kpiLabelText: { fontSize: 8.5, fontWeight: '700', color: '#64748b', marginTop: 1, textAlign: 'center' },
  sessionCard: {
    backgroundColor: '#ffffff',
    borderRadius: 12,
    padding: 12,
    borderWidth: 1,
    borderColor: '#e2e8f0',
    marginBottom: 8,
  },
  sessionCardHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  sessionSubjectTitle: { fontSize: 12.5, fontWeight: '800', color: '#0f172a' },
  sessionRoomMeta: { fontSize: 10, color: '#64748b', marginTop: 1 },
  sessionRatePill: {
    backgroundColor: '#ecfdf5',
    paddingVertical: 2.5,
    paddingHorizontal: 7,
    borderRadius: 5,
    borderWidth: 1,
    borderColor: '#a7f3d0',
  },
  sessionRatePillText: { fontSize: 9.5, fontWeight: '800', color: '#047857' },
  sessionProgressTrack: {
    height: 4,
    backgroundColor: '#f1f5f9',
    borderRadius: 2,
    overflow: 'hidden',
    marginVertical: 8,
  },
  sessionProgressFill: { height: '100%', backgroundColor: '#004b87', borderRadius: 2 },
  sessionMetricsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#f8fafc',
    borderRadius: 6,
    padding: 6,
  },
  sessionMetricCol: { alignItems: 'center' },
  sessionMetricLabel: { fontSize: 7.5, fontWeight: '800', color: '#64748b' },
  sessionMetricVal: { fontSize: 11.5, fontWeight: '800', color: '#0f172a', marginTop: 1 },
  emptyStateCard: {
    backgroundColor: '#ffffff',
    borderRadius: 12,
    padding: 24,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#e2e8f0',
  },
  emptyStateTitle: { fontSize: 13, fontWeight: '800', color: '#0f172a', marginTop: 6 },
  emptyStateText: {
    fontSize: 11,
    color: '#64748b',
    textAlign: 'center',
    marginTop: 2,
    lineHeight: 15,
  },
});

export default HomeScreen;