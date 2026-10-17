// mobile/src/screens/HomeScreen.tsx

/**
 * AttendSure Mobile - Faculty Institutional Home & Live Telemetry
 * File: mobile/src/screens/HomeScreen.tsx
 *
 * Cybersecurity & Anti-Cheating:
 * 1. Perimeter Breach Alarm: Physical vibration and emergency visual modal trigger instantly upon crossing the campus boundary while on duty.
 * 2. Zero-Click Real-Time Telemetry: Automatically computes live Haversine distance from school center.
 * 3. Instant Anti-Spoof Warning: Detects and flags fake GPS applications immediately.
 * 4. Cache-First Fast Boot: Loads cached rosters, school settings, and DTR records instantly.
 * 5. Simple English Terms: Clear alerts and straightforward attendance metrics.
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
  StatusBar,
  Platform,
  Vibration,
  Modal,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import * as Location from 'expo-location';
import AsyncStorage from '@react-native-async-storage/async-storage';

import { useAuth } from '../context/AuthContext';
import { getUnsyncedCount } from '../services/offlineQueue';
import defaultApiClient, { apiClient as namedClient } from '../api/client';
import { COLORS } from '../constants/theme';

const apiClient = defaultApiClient || namedClient;
const fallbackLogo = require('../../assets/attendsure-logo.svg');

// ============================================================================
// HAVERSINE DISTANCE HELPER
// ============================================================================

function calculateDistanceMeters(
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number
): number {
  const R = 6371000.0; // Earth radius in meters
  const dLat = ((lat2 - lat1) * Math.PI) / 180.0;
  const dLon = ((lon2 - lon1) * Math.PI) / 180.0;
  const radLat1 = (lat1 * Math.PI) / 180.0;
  const radLat2 = (lat2 * Math.PI) / 180.0;

  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.sin(dLon / 2) * Math.sin(dLon / 2) * Math.cos(radLat1) * Math.cos(radLat2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

function formatDistance(meters: number): string {
  if (meters >= 1000) {
    return `${(meters / 1000).toFixed(2)} km`;
  }
  return `${Math.round(meters)} m`;
}

// ============================================================================
// TYPE DEFINITIONS
// ============================================================================

interface StudentRosterItem {
  id: number;
  lrn: string;
  qr_token?: string;
  rfid_uid?: string;
  full_name: string;
  gender?: string;
  attendance_status: string;
}

interface SectionRoster {
  schedule_id: number;
  section_id: number;
  section_name: string;
  subject_name: string;
  subject_code: string;
  room: string;
  start_time: string;
  end_time: string;
  total_students: number;
  students: StudentRosterItem[];
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
  is_loafing: boolean;
  loafing_excused: boolean;
  loafing_remarks: string;
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
  name: string;
  latitude: number | null;
  longitude: number | null;
  radius_meters: number;
  is_configured: boolean;
}

interface CalendarOverrideItem {
  id: number;
  date: string;
  type: 'SUSPENSION' | 'HOLIDAY' | 'EVENT';
  reason: string;
}

interface CampusOverviewData {
  total_students: number;
  students_present: number;
  students_on_campus: number;
  students_absent: number;
  attendance_rate: number;
  faculty_on_duty: number;
  total_faculty: number;
  gate_scans_today: number;
  kiosks_online: number;
  total_kiosks: number;
  analytics?: {
    rfid_count_today: number;
    qr_count_today: number;
    on_time_count: number;
    tardy_count: number;
    chronic_absent_count: number;
    average_latency_ms: number;
  };
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

// ============================================================================
// MAIN COMPONENT
// ============================================================================

export const HomeScreen: React.FC = () => {
  const { user, refreshUser } = useAuth();

  const [sections, setSections] = useState<SectionRoster[]>([]);
  const [schoolProfile, setSchoolProfile] = useState<SchoolProfileData | null>(null);
  const [dtrData, setDtrData] = useState<DtrSummaryData | null>(null);
  const [geofenceConfig, setGeofenceConfig] = useState<GeofenceConfigData | null>(null);
  const [todayOverride, setTodayOverride] = useState<CalendarOverrideItem | null>(null);
  const [weekendRestEnabled, setWeekendRestEnabled] = useState<boolean>(false);
  const [campusOverview, setCampusOverview] = useState<CampusOverviewData | null>(null);

  const [loading, setLoading] = useState<boolean>(true);
  const [refreshing, setRefreshing] = useState<boolean>(false);
  const [offlineCount, setOfflineCount] = useState<number>(0);
  const [lastSyncTime, setLastSyncTime] = useState<string>('');

  // Live Automatic GPS Telemetry
  const [liveCoords, setLiveCoords] = useState<LiveGpsCoords | null>(null);
  const [gpsError, setGpsError] = useState<string | null>(null);

  // Perimeter Breach Alarm State
  const [showBreachAlarm, setShowBreachAlarm] = useState<boolean>(false);
  const [alarmAcknowledged, setAlarmAcknowledged] = useState<boolean>(false);
  const lastBreachAlertTime = useRef<number>(0);

  const isMounted = useRef(true);

  const currentUser = user as Record<string, any> | null;
  const displayName =
    currentUser?.full_name ||
    `${currentUser?.first_name || ''} ${currentUser?.last_name || ''}`.trim() ||
    currentUser?.faculty_name ||
    currentUser?.username ||
    'Faculty Member';

  const employeeId =
    currentUser?.employee_id ||
    currentUser?.faculty_id ||
    dtrData?.employee_id ||
    currentUser?.username ||
    '';

  const userRole = String(currentUser?.role || currentUser?.system_role || 'FACULTY').trim().toUpperCase();

  const schoolName =
    schoolProfile?.school_name ||
    currentUser?.school_name ||
    geofenceConfig?.name ||
    'Lapasan National High School';

  const schoolSubHeader = [
    schoolProfile?.school_id ? `ID: ${schoolProfile.school_id}` : '',
    schoolProfile?.division || '',
  ]
    .filter(Boolean)
    .join(' • ');

  const logoSource =
    schoolProfile?.school_logo || schoolProfile?.left_logo
      ? { uri: (schoolProfile.school_logo || schoolProfile.left_logo) as string }
      : fallbackLogo;

  // ---------------------------------------------------------------------------
  // LIVE GPS SUBSCRIPTION (Continuous Foreground Updates)
  // ---------------------------------------------------------------------------
  useEffect(() => {
    let watcherSubscription: Location.LocationSubscription | null = null;
    let isSubscribed = true;

    const startLiveGpsTracking = async () => {
      try {
        const { status } = await Location.requestForegroundPermissionsAsync();
        if (status !== 'granted') {
          if (isSubscribed) setGpsError('Location permission required.');
          return;
        }

        const isGpsActive = await Location.hasServicesEnabledAsync();
        if (!isGpsActive) {
          if (isSubscribed) setGpsError('Phone GPS is turned off.');
          return;
        }

        if (isSubscribed) setGpsError(null);

        // Initial single fix for fast rendering
        const initial = await Location.getCurrentPositionAsync({
          accuracy: Location.Accuracy.Balanced,
        });

        if (isSubscribed && initial) {
          setLiveCoords({
            latitude: initial.coords.latitude,
            longitude: initial.coords.longitude,
            accuracy: initial.coords.accuracy,
            mocked: Boolean(initial.mocked),
            timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' }),
          });
        }

        // Live watcher updates coordinates continuously as the user moves
        watcherSubscription = await Location.watchPositionAsync(
          {
            accuracy: Location.Accuracy.Balanced,
            timeInterval: 4000, // Update every 4 seconds
            distanceInterval: 4,  // Or when moving 4 meters
          },
          (position) => {
            if (!isSubscribed) return;
            setLiveCoords({
              latitude: position.coords.latitude,
              longitude: position.coords.longitude,
              accuracy: position.coords.accuracy,
              mocked: Boolean(position.mocked),
              timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' }),
            });
            setGpsError(null);
          }
        );
      } catch (err: any) {
        if (isSubscribed) {
          setGpsError(err?.message || 'Searching for satellite GPS lock...');
        }
      }
    };

    startLiveGpsTracking();

    return () => {
      isSubscribed = false;
      if (watcherSubscription) {
        watcherSubscription.remove();
      }
    };
  }, []);

  // ---------------------------------------------------------------------------
  // REAL-TIME HAVERSINE DISTANCE COMPUTATION
  // ---------------------------------------------------------------------------
  const campusCenter = useMemo(() => {
    const lat = geofenceConfig?.latitude ?? schoolProfile?.latitude ?? 8.4858;
    const lng = geofenceConfig?.longitude ?? schoolProfile?.longitude ?? 124.6567;
    const radius = geofenceConfig?.radius_meters ?? schoolProfile?.geofence_radius_meters ?? 150;
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
    if (liveDistanceMeters === null) return null;
    return liveDistanceMeters <= campusCenter.radius;
  }, [liveDistanceMeters, campusCenter.radius]);

  // ---------------------------------------------------------------------------
  // GATE TURNSTILE STATUS
  // ---------------------------------------------------------------------------
  const todayStr = getLocalTodayStr();
  const todayDtrRow: DtrDayRow | null =
    dtrData?.rows?.find((r) => r.date_str === todayStr) || null;

  const hasTappedInToday = Boolean(todayDtrRow?.am_arrival || todayDtrRow?.pm_arrival);
  const hasTappedOutToday = Boolean(
    (todayDtrRow?.pm_departure && todayDtrRow.pm_departure !== '') ||
      (todayDtrRow?.am_departure && !todayDtrRow?.pm_arrival)
  );

  const isOfficiallyOnCampus = hasTappedInToday && !hasTappedOutToday;

  const dutyStatusLabel = hasTappedInToday
    ? hasTappedOutToday
      ? 'GATE: CHECKED OUT'
      : 'GATE: CHECKED IN'
    : 'GATE: NO SCAN TODAY';

  const dutyStatusColor = hasTappedInToday
    ? hasTappedOutToday
      ? '#d97706'
      : '#059669'
    : '#64748b';

  const dutyStatusBg = hasTappedInToday
    ? hasTappedOutToday
      ? '#fef3c7'
      : '#dcfce7'
    : '#f1f5f9';

  // ---------------------------------------------------------------------------
  // PERIMETER BREACH ALARM TRIGGER (Physical Vibration + Visual Alarm)
  // ---------------------------------------------------------------------------
  useEffect(() => {
    // Check if the user is outside the perimeter while on active duty
    if (isInsideCampusPerimeter === false && isOfficiallyOnCampus) {
      const now = Date.now();
      // Trigger alarm if not acknowledged or if 5 minutes have elapsed since last alert
      if (!alarmAcknowledged || now - lastBreachAlertTime.current > 300000) {
        setShowBreachAlarm(true);
        lastBreachAlertTime.current = now;

        // Emergency pulse vibration pattern: [wait, vibrate, wait, vibrate, wait, vibrate]
        Vibration.vibrate([0, 600, 200, 600, 200, 800]);
      }
    } else if (isInsideCampusPerimeter === true) {
      // Auto-clear alarm once teacher returns inside campus grounds
      setShowBreachAlarm(false);
      setAlarmAcknowledged(false);
      Vibration.cancel();
    }
  }, [isInsideCampusPerimeter, isOfficiallyOnCampus, alarmAcknowledged]);

  const handleDismissAlarm = () => {
    setShowBreachAlarm(false);
    setAlarmAcknowledged(true);
    Vibration.cancel();
  };

  // ---------------------------------------------------------------------------
  // FAST CACHE-FIRST INITIALIZATION
  // ---------------------------------------------------------------------------
  const loadCachedData = useCallback(async () => {
    try {
      const [cachedSchool, cachedSections, cachedDtr, cachedGeo] = await Promise.all([
        AsyncStorage.getItem('attendsure_cached_school'),
        AsyncStorage.getItem('attendsure_cached_sections'),
        AsyncStorage.getItem('attendsure_cached_dtr'),
        AsyncStorage.getItem('attendsure_cached_geofence'),
      ]);

      if (cachedSchool) setSchoolProfile(JSON.parse(cachedSchool));
      if (cachedSections) setSections(JSON.parse(cachedSections));
      if (cachedDtr) setDtrData(JSON.parse(cachedDtr));
      if (cachedGeo) setGeofenceConfig(JSON.parse(cachedGeo));
    } catch {
      // Ignore cache read errors
    }
  }, []);

  // ---------------------------------------------------------------------------
  // REMOTE DATA FETCHING
  // ---------------------------------------------------------------------------
  const loadAllDynamicData = useCallback(async () => {
    const todayDate = getLocalTodayStr();
    const now = new Date();

    const [
      rosterRes,
      schoolRes,
      dtrRes,
      geofenceRes,
      calendarRes,
      overviewRes,
    ] = await Promise.allSettled([
      apiClient.get('/classroom/roster/', { timeout: 8000 }),
      apiClient.get('/settings/school/', { timeout: 8000 }),
      apiClient.get(`/dtr/?month=${now.getMonth() + 1}&year=${now.getFullYear()}`, { timeout: 8000 }),
      apiClient.get('/geofence/', { timeout: 8000 }),
      apiClient.get('/calendar/exceptions/', { timeout: 8000 }),
      apiClient.get('/dashboard/overview/', { timeout: 8000 }),
    ]);

    if (!isMounted.current) return;

    if (rosterRes.status === 'fulfilled' && rosterRes.value.data) {
      const rosterData = Array.isArray(rosterRes.value.data)
        ? rosterRes.value.data
        : rosterRes.value.data.results || [];
      setSections(rosterData);
      AsyncStorage.setItem('attendsure_cached_sections', JSON.stringify(rosterData)).catch(() => {});
    }

    if (schoolRes.status === 'fulfilled' && schoolRes.value.data) {
      setSchoolProfile(schoolRes.value.data);
      AsyncStorage.setItem('attendsure_cached_school', JSON.stringify(schoolRes.value.data)).catch(() => {});
    }

    if (dtrRes.status === 'fulfilled' && dtrRes.value.data) {
      setDtrData(dtrRes.value.data);
      AsyncStorage.setItem('attendsure_cached_dtr', JSON.stringify(dtrRes.value.data)).catch(() => {});
    }

    if (geofenceRes.status === 'fulfilled' && geofenceRes.value.data) {
      setGeofenceConfig(geofenceRes.value.data);
      AsyncStorage.setItem('attendsure_cached_geofence', JSON.stringify(geofenceRes.value.data)).catch(() => {});
    }

    if (calendarRes.status === 'fulfilled' && calendarRes.value.data) {
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

    if (overviewRes.status === 'fulfilled' && overviewRes.value.data) {
      setCampusOverview(overviewRes.value.data);
    }

    setLastSyncTime(
      new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })
    );
    setLoading(false);
  }, []);

  const checkOfflineStorage = useCallback(async () => {
    try {
      const count = await getUnsyncedCount();
      if (isMounted.current) setOfflineCount(count);
    } catch {
      // Ignore storage check issues
    }
  }, []);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await Promise.all([loadAllDynamicData(), checkOfflineStorage(), refreshUser()]);
    if (isMounted.current) setRefreshing(false);
  }, [loadAllDynamicData, checkOfflineStorage, refreshUser]);

  useEffect(() => {
    isMounted.current = true;
    loadCachedData().then(() => {
      loadAllDynamicData();
    });
    checkOfflineStorage();
    refreshUser();

    return () => {
      isMounted.current = false;
    };
  }, [loadCachedData, loadAllDynamicData, checkOfflineStorage, refreshUser]);

  // ---------------------------------------------------------------------------
  // CLASSROOM ATTENDANCE AGGREGATION
  // ---------------------------------------------------------------------------
  const totalClasses = sections.length;

  let totalStudentsEnrolled = 0;
  let totalPresent = 0;
  let totalLate = 0;
  let totalAbsent = 0;
  let totalCutting = 0;
  let totalUnverified = 0;
  let totalUnscanned = 0;

  let totalMaleEnrolled = 0;
  let totalFemaleEnrolled = 0;
  let totalMalePresent = 0;
  let totalFemalePresent = 0;

  sections.forEach((sec) => {
    const students = sec.students || [];
    totalStudentsEnrolled += students.length;

    students.forEach((st) => {
      const status = String(st.attendance_status || 'UNSCANNED').toUpperCase();
      const gender = String(st.gender || '').trim().toUpperCase();
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
      } else if (status === 'CUTTING') {
        totalCutting += 1;
      } else if (status === 'UNVERIFIED') {
        totalUnverified += 1;
      } else {
        totalUnscanned += 1;
      }
    });
  });

  const totalAttended = totalPresent + totalLate;
  const totalAnomalies = totalCutting + totalUnverified;
  const overallRate =
    totalStudentsEnrolled > 0
      ? Math.round((totalAttended / totalStudentsEnrolled) * 100)
      : 0;

  const isWeekendToday = [0, 6].includes(new Date().getDay());

  return (
    <SafeAreaView style={styles.safeContainer} edges={['top', 'left', 'right']}>
      <StatusBar barStyle="dark-content" backgroundColor="#ffffff" />

      {/* ================================================================= */}
      {/* EMERGENCY PERIMETER BREACH ALARM MODAL                            */}
      {/* ================================================================= */}
      <Modal
        visible={showBreachAlarm}
        transparent={true}
        animationType="fade"
        onRequestClose={handleDismissAlarm}
      >
        <View style={styles.alarmModalOverlay}>
          <View style={styles.alarmModalCard}>
            <View style={styles.alarmIconCircle}>
              <Ionicons name="warning" size={38} color="#ffffff" />
            </View>

            <Text style={styles.alarmModalTitle}>PERIMETER BREACH DETECTED</Text>
            <Text style={styles.alarmModalSubtitle}>
              You have stepped outside the official campus boundary while recorded on active duty.
            </Text>

            <View style={styles.alarmMetricsBox}>
              <View style={styles.alarmMetricItem}>
                <Text style={styles.alarmMetricLabel}>CURRENT DISTANCE</Text>
                <Text style={styles.alarmMetricValue}>
                  {liveDistanceMeters !== null ? formatDistance(liveDistanceMeters) : 'Calculating...'}
                </Text>
              </View>
              <View style={styles.alarmDividerVertical} />
              <View style={styles.alarmMetricItem}>
                <Text style={styles.alarmMetricLabel}>ALLOWED BOUNDARY</Text>
                <Text style={styles.alarmMetricValue}>{campusCenter.radius} meters</Text>
              </View>
            </View>

            <Text style={styles.alarmWarningNotice}>
              DepEd CSC Form 48 regulations require physical presence on campus during duty hours. Please return within perimeter grounds or secure an approved gate pass.
            </Text>

            <TouchableOpacity
              style={styles.alarmAcknowledgeBtn}
              onPress={handleDismissAlarm}
              activeOpacity={0.85}
            >
              <Ionicons name="volume-mute-outline" size={18} color="#ffffff" />
              <Text style={styles.alarmAcknowledgeBtnText}>Acknowledge &amp; Silence Alarm</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      {/* Top Header */}
      <View style={styles.topHeader}>
        <View style={styles.brandGroup}>
          <Image source={logoSource} style={styles.schoolLogo} contentFit="contain" />
          <View style={styles.brandTextGroup}>
            <Text style={styles.schoolTitle} numberOfLines={1}>
              {schoolName}
            </Text>
            <View style={styles.subBrandRow}>
              <View style={[styles.activeDot, { backgroundColor: dutyStatusColor }]} />
              <Text style={styles.protocolText} numberOfLines={1}>
                {schoolSubHeader || `${userRole} PORTAL`}
              </Text>
            </View>
          </View>
        </View>

        <TouchableOpacity style={styles.refreshButton} onPress={onRefresh} activeOpacity={0.7}>
          <Ionicons name="refresh" size={17} color="#004b87" />
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
        {/* Anti-Cheating Alert: Fake / Mock GPS Detection */}
        {liveCoords?.mocked && (
          <View style={styles.mockAlertCard}>
            <Ionicons name="alert-circle" size={20} color="#dc2626" />
            <View style={{ flex: 1 }}>
              <Text style={styles.mockAlertTitle}>Mock GPS Application Detected</Text>
              <Text style={styles.mockAlertSub}>
                Disable fake location apps in device developer settings. Location presence is flagged.
              </Text>
            </View>
          </View>
        )}

        {/* ================================================================= */}
        {/* 1. TOP LIVE CAMPUS GEOFENCE TELEMETRY CARD (NO MANUAL BUTTONS)    */}
        {/* ================================================================= */}
        <View style={styles.liveTelemetryCard}>
          <View style={styles.telemetryCardHeader}>
            <View style={styles.telemetryHeaderLeft}>
              <View
                style={[
                  styles.pulseDot,
                  {
                    backgroundColor:
                      isInsideCampusPerimeter === true
                        ? '#16a34a'
                        : isInsideCampusPerimeter === false
                        ? '#dc2626'
                        : '#94a3b8',
                  },
                ]}
              />
              <Text style={styles.telemetryHeaderLabel}>LIVE CAMPUS GEOFENCE TELEMETRY</Text>
            </View>

            {liveCoords?.timestamp ? (
              <View style={styles.liveTimestampBadge}>
                <Ionicons name="time-outline" size={11} color="#64748b" />
                <Text style={styles.liveTimestampText}>{liveCoords.timestamp}</Text>
              </View>
            ) : null}
          </View>

          <View style={styles.telemetryMainRow}>
            <View style={{ flex: 1 }}>
              {liveDistanceMeters !== null ? (
                <>
                  <View style={styles.distanceMetricRow}>
                    <Text style={styles.distanceBigText}>
                      {formatDistance(liveDistanceMeters)}
                    </Text>
                    <Text style={styles.distanceSubUnit}>from campus center</Text>
                  </View>

                  <View style={styles.perimeterNoticeRow}>
                    <View
                      style={[
                        styles.perimeterStatusBadge,
                        {
                          backgroundColor:
                            isInsideCampusPerimeter ? '#ecfdf5' : '#fef2f2',
                          borderColor:
                            isInsideCampusPerimeter ? '#a7f3d0' : '#fecaca',
                        },
                      ]}
                    >
                      <Ionicons
                        name={isInsideCampusPerimeter ? 'checkmark-circle' : 'alert-circle'}
                        size={13}
                        color={isInsideCampusPerimeter ? '#059669' : '#dc2626'}
                      />
                      <Text
                        style={[
                          styles.perimeterStatusText,
                          { color: isInsideCampusPerimeter ? '#047857' : '#b91c1c' },
                        ]}
                      >
                        {isInsideCampusPerimeter ? 'INSIDE CAMPUS GROUNDS' : 'OUTSIDE CAMPUS BOUNDARY'}
                      </Text>
                    </View>

                    <Text style={styles.allowedRadiusText}>
                      Allowed: {campusCenter.radius}m
                    </Text>
                  </View>
                </>
              ) : (
                <View style={styles.acquiringGpsBox}>
                  <ActivityIndicator size="small" color="#0284c7" />
                  <Text style={styles.acquiringGpsText}>
                    {gpsError || 'Acquiring satellite GPS lock...'}
                  </Text>
                </View>
              )}
            </View>
          </View>

          {/* Telemetry Footer with Precision Metrics */}
          <View style={styles.telemetryFooter}>
            <View style={styles.telemetryFooterItem}>
              <Ionicons name="radio-outline" size={12} color="#64748b" />
              <Text style={styles.telemetryFooterLabel}>
                Accuracy: {liveCoords?.accuracy ? `±${Math.round(liveCoords.accuracy)}m` : 'Measuring...'}
              </Text>
            </View>

            <View style={styles.telemetryFooterItem}>
              <Ionicons name="navigate-outline" size={12} color="#64748b" />
              <Text style={styles.telemetryFooterLabel}>
                {liveCoords ? `${liveCoords.latitude.toFixed(5)}°N, ${liveCoords.longitude.toFixed(5)}°E` : 'GPS Inactive'}
              </Text>
            </View>
          </View>
        </View>

        {/* Active Calendar Override or Weekend Notice */}
        {todayOverride ? (
          <View style={styles.calendarAlertBanner}>
            <Ionicons name="calendar" size={18} color="#b91c1c" />
            <View style={{ flex: 1 }}>
              <Text style={styles.calendarAlertTitle}>
                {todayOverride.type}: {todayOverride.date}
              </Text>
              <Text style={styles.calendarAlertReason}>{todayOverride.reason}</Text>
            </View>
          </View>
        ) : isWeekendToday && weekendRestEnabled ? (
          <View style={[styles.calendarAlertBanner, { backgroundColor: '#eff6ff', borderColor: '#bfdbfe' }]}>
            <Ionicons name="sunny-outline" size={18} color="#1d4ed8" />
            <View style={{ flex: 1 }}>
              <Text style={[styles.calendarAlertTitle, { color: '#1e40af' }]}>
                Weekend Rest Day Active
              </Text>
              <Text style={[styles.calendarAlertReason, { color: '#1e3a8a' }]}>
                Classroom attendance logging is optional today.
              </Text>
            </View>
          </View>
        ) : null}

        {/* 2. Faculty Identity & Official Gate Duty Status */}
        <View style={styles.dutyCard}>
          <View style={styles.dutyTopRow}>
            <View style={styles.dutyUserMeta}>
              <Text style={styles.welcomeGreeting}>
                {dtrData?.department ? dtrData.department : userRole}
              </Text>
              <Text style={styles.facultyDisplayName} numberOfLines={1}>
                {displayName}
              </Text>
              {employeeId ? (
                <Text style={styles.empIdBadgeText}>Employee ID: {employeeId}</Text>
              ) : null}
            </View>

            <View style={[styles.dutyBadge, { backgroundColor: dutyStatusBg }]}>
              <View style={[styles.activeDot, { backgroundColor: dutyStatusColor }]} />
              <Text style={[styles.dutyBadgeText, { color: dutyStatusColor }]}>
                {dutyStatusLabel}
              </Text>
            </View>
          </View>
        </View>

        {/* 3. Offline Queue Notice */}
        {offlineCount > 0 && (
          <View style={styles.offlineWarningBanner}>
            <Ionicons name="cloud-offline" size={16} color="#b45309" />
            <Text style={styles.offlineWarningText}>
              {offlineCount} attendance record(s) queued on device. Will synchronize automatically.
            </Text>
          </View>
        )}

        {/* 4. Personal CSC Form 48 (DTR) Punches */}
        {dtrData && (
          <>
            <View style={styles.sectionHeadingRow}>
              <Text style={styles.sectionHeadingTitle}>
                CSC Form 48 Summary ({dtrData.month} {dtrData.year})
              </Text>
              <Text style={styles.syncTimestampText}>
                {dtrData.days_present} Day(s) Present
              </Text>
            </View>

            <View style={styles.dtrCard}>
              <View style={styles.dtrPunchesRow}>
                <View style={styles.dtrPunchBox}>
                  <Text style={styles.dtrPunchLabel}>AM IN</Text>
                  <Text style={styles.dtrPunchTime}>{todayDtrRow?.am_arrival || '--:--'}</Text>
                </View>
                <View style={styles.dtrPunchBox}>
                  <Text style={styles.dtrPunchLabel}>AM OUT</Text>
                  <Text style={styles.dtrPunchTime}>{todayDtrRow?.am_departure || '--:--'}</Text>
                </View>
                <View style={styles.dtrPunchBox}>
                  <Text style={styles.dtrPunchLabel}>PM IN</Text>
                  <Text style={styles.dtrPunchTime}>{todayDtrRow?.pm_arrival || '--:--'}</Text>
                </View>
                <View style={styles.dtrPunchBox}>
                  <Text style={styles.dtrPunchLabel}>PM OUT</Text>
                  <Text style={styles.dtrPunchTime}>{todayDtrRow?.pm_departure || '--:--'}</Text>
                </View>
              </View>

              <View style={styles.dtrFooterRow}>
                <Text style={styles.dtrFooterText}>
                  Monthly Undertime: {dtrData.total_undertime_hours}h {dtrData.total_undertime_minutes}m
                </Text>
                <Text
                  style={[
                    styles.dtrStatusTag,
                    {
                      color: dtrData.dept_head_approved
                        ? '#16a34a'
                        : dtrData.dtr_submitted
                        ? '#0284c7'
                        : '#64748b',
                    },
                  ]}
                >
                  {dtrData.dept_head_approved
                    ? 'APPROVED'
                    : dtrData.dtr_submitted
                    ? 'SUBMITTED'
                    : 'IN PROGRESS'}
                </Text>
              </View>
            </View>
          </>
        )}

        {/* 5. Classroom Attendance Analytics */}
        <View style={styles.sectionHeadingRow}>
          <Text style={styles.sectionHeadingTitle}>Classroom Attendance Summary</Text>
          {lastSyncTime ? (
            <Text style={styles.syncTimestampText}>Synced {lastSyncTime}</Text>
          ) : null}
        </View>

        <View style={styles.overallRateCard}>
          <View style={styles.rateHeaderRow}>
            <View style={{ flex: 1 }}>
              <Text style={styles.rateCardTitle}>Overall Student Attendance Rate</Text>
              <Text style={styles.rateCardSub}>
                {totalAttended} of {totalStudentsEnrolled} learners present across {totalClasses} scheduled class(es)
              </Text>
            </View>
            <Text style={styles.rateBigText}>{overallRate}%</Text>
          </View>

          <View style={styles.overallProgressTrack}>
            <View style={[styles.overallProgressFill, { width: `${Math.min(overallRate, 100)}%` }]} />
          </View>

          {/* Gender Breakdown Row */}
          {totalStudentsEnrolled > 0 && (
            <View style={styles.genderBreakdownRow}>
              <View style={styles.genderStatChip}>
                <Ionicons name="male" size={13} color="#0284c7" />
                <Text style={styles.genderStatText}>
                  Male: {totalMalePresent}/{totalMaleEnrolled}
                </Text>
              </View>
              <View style={styles.genderStatChip}>
                <Ionicons name="female" size={13} color="#db2777" />
                <Text style={styles.genderStatText}>
                  Female: {totalFemalePresent}/{totalFemaleEnrolled}
                </Text>
              </View>
              <View style={styles.genderStatChip}>
                <Ionicons name="hourglass-outline" size={13} color="#64748b" />
                <Text style={styles.genderStatText}>Unscanned: {totalUnscanned}</Text>
              </View>
            </View>
          )}
        </View>

        {/* Attendance Metrics Grid */}
        <View style={styles.kpiGrid}>
          <View style={styles.kpiTile}>
            <View style={[styles.kpiIconWrap, { backgroundColor: '#dcfce7' }]}>
              <Ionicons name="checkmark-circle-outline" size={16} color="#16a34a" />
            </View>
            <Text style={[styles.kpiValue, { color: '#16a34a' }]}>{totalPresent}</Text>
            <Text style={styles.kpiLabel}>Present</Text>
          </View>

          <View style={styles.kpiTile}>
            <View style={[styles.kpiIconWrap, { backgroundColor: '#fef3c7' }]}>
              <Ionicons name="time-outline" size={16} color="#d97706" />
            </View>
            <Text style={[styles.kpiValue, { color: '#d97706' }]}>{totalLate}</Text>
            <Text style={styles.kpiLabel}>Late</Text>
          </View>

          <View style={styles.kpiTile}>
            <View style={[styles.kpiIconWrap, { backgroundColor: '#fee2e2' }]}>
              <Ionicons name="close-circle-outline" size={16} color="#dc2626" />
            </View>
            <Text style={[styles.kpiValue, { color: '#dc2626' }]}>{totalAbsent}</Text>
            <Text style={styles.kpiLabel}>Absent</Text>
          </View>

          <View style={styles.kpiTile}>
            <View style={[styles.kpiIconWrap, { backgroundColor: '#fae8ff' }]}>
              <Ionicons name="shield-half-outline" size={16} color="#9333ea" />
            </View>
            <Text style={[styles.kpiValue, { color: '#9333ea' }]}>{totalAnomalies}</Text>
            <Text style={styles.kpiLabel}>Flagged</Text>
          </View>
        </View>

        {/* Gate Anomalies Warning */}
        {totalAnomalies > 0 && (
          <View style={styles.anomalyBanner}>
            <Ionicons name="warning" size={18} color="#9333ea" />
            <View style={{ flex: 1 }}>
              <Text style={styles.anomalyBannerTitle}>
                Gate Discrepancy ({totalAnomalies} Learner{totalAnomalies > 1 ? 's' : ''})
              </Text>
              <Text style={styles.anomalyBannerSub}>
                {totalCutting > 0 ? `${totalCutting} Left school grounds • ` : ''}
                {totalUnverified > 0 ? `${totalUnverified} Entered without gate scan` : ''}
              </Text>
            </View>
          </View>
        )}

        {/* 6. Scheduled Classes */}
        <View style={styles.sectionHeadingRow}>
          <Text style={styles.sectionHeadingTitle}>Scheduled Class Sessions</Text>
          <Text style={styles.classCountText}>{sections.length} Scheduled</Text>
        </View>

        {loading && sections.length === 0 ? (
          <View style={styles.loadingCard}>
            <ActivityIndicator size="small" color="#004b87" />
            <Text style={styles.loadingCardText}>Loading schedule...</Text>
          </View>
        ) : sections.length === 0 ? (
          <View style={styles.emptyClassCard}>
            <Ionicons name="school-outline" size={38} color="#94a3b8" />
            <Text style={styles.emptyClassTitle}>No Classes Scheduled</Text>
            <Text style={styles.emptyClassSub}>
              No teaching assignments are linked to your account for today.
            </Text>
          </View>
        ) : (
          sections.map((sec) => {
            const students = sec.students || [];
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
              <View key={String(sec.schedule_id)} style={styles.classScheduleCard}>
                <View style={styles.classCardHeader}>
                  <View style={{ flex: 1, marginRight: 8 }}>
                    <Text style={styles.classSubjectTitle}>
                      {[sec.subject_name, sec.section_name].filter(Boolean).join(' • ')}
                    </Text>
                    {roomAndTime ? (
                      <Text style={styles.classTimeRoomSub}>{roomAndTime}</Text>
                    ) : null}
                  </View>

                  <View style={styles.ratePill}>
                    <Text style={styles.ratePillText}>{classRate}%</Text>
                  </View>
                </View>

                <View style={styles.progressTrack}>
                  <View style={[styles.progressFill, { width: `${Math.min(classRate, 100)}%` }]} />
                </View>

                <View style={styles.classMetricsRow}>
                  <View style={styles.classMetricItem}>
                    <Text style={styles.classMetricLabel}>ENROLLED</Text>
                    <Text style={styles.classMetricVal}>{enrolledCount}</Text>
                  </View>

                  <View style={styles.classMetricItem}>
                    <Text style={[styles.classMetricLabel, { color: '#059669' }]}>PRESENT</Text>
                    <Text style={[styles.classMetricVal, { color: '#059669' }]}>{classPresent}</Text>
                  </View>

                  <View style={styles.classMetricItem}>
                    <Text style={[styles.classMetricLabel, { color: '#d97706' }]}>LATE</Text>
                    <Text style={[styles.classMetricVal, { color: '#d97706' }]}>{classLate}</Text>
                  </View>

                  <View style={styles.classMetricItem}>
                    <Text style={[styles.classMetricLabel, { color: '#9333ea' }]}>FLAGGED</Text>
                    <Text style={[styles.classMetricVal, { color: '#9333ea' }]}>{classFlagged}</Text>
                  </View>

                  <View style={styles.classMetricItem}>
                    <Text style={[styles.classMetricLabel, { color: '#dc2626' }]}>PENDING</Text>
                    <Text style={[styles.classMetricVal, { color: '#dc2626' }]}>
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

// ============================================================================
// STYLES
// ============================================================================

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
  schoolLogo: { width: 36, height: 36, borderRadius: 8 },
  brandTextGroup: { marginLeft: 10, flex: 1 },
  schoolTitle: { fontSize: 13, fontWeight: '800', color: '#003460' },
  subBrandRow: { flexDirection: 'row', alignItems: 'center', marginTop: 1, gap: 5 },
  activeDot: { width: 6, height: 6, borderRadius: 3 },
  protocolText: { fontSize: 9, fontWeight: '700', color: '#004b87', letterSpacing: 0.3 },
  refreshButton: {
    width: 34,
    height: 34,
    borderRadius: 8,
    backgroundColor: '#f1f5f9',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: '#e2e8f0',
  },
  scrollArea: { flex: 1 },
  scrollContent: { paddingHorizontal: 16, paddingTop: 12, paddingBottom: 28 },

  // Emergency Perimeter Breach Modal Styles
  alarmModalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(15, 23, 42, 0.85)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  alarmModalCard: {
    width: '100%',
    backgroundColor: '#ffffff',
    borderRadius: 20,
    padding: 24,
    alignItems: 'center',
    borderWidth: 2,
    borderColor: '#f87171',
    ...Platform.select({
      ios: {
        shadowColor: '#dc2626',
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.3,
        shadowRadius: 16,
      },
      android: { elevation: 8 },
    }),
  },
  alarmIconCircle: {
    width: 68,
    height: 68,
    borderRadius: 34,
    backgroundColor: '#dc2626',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 16,
  },
  alarmModalTitle: {
    fontSize: 16,
    fontWeight: '900',
    color: '#991b1b',
    textAlign: 'center',
    letterSpacing: 0.5,
  },
  alarmModalSubtitle: {
    fontSize: 12,
    color: '#475569',
    textAlign: 'center',
    marginTop: 6,
    lineHeight: 17,
  },
  alarmMetricsBox: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-around',
    backgroundColor: '#fef2f2',
    borderWidth: 1,
    borderColor: '#fecaca',
    borderRadius: 12,
    width: '100%',
    paddingVertical: 12,
    marginVertical: 16,
  },
  alarmMetricItem: { alignItems: 'center', flex: 1 },
  alarmDividerVertical: { width: 1, height: 28, backgroundColor: '#fca5a5' },
  alarmMetricLabel: { fontSize: 8.5, fontWeight: '800', color: '#991b1b', letterSpacing: 0.4 },
  alarmMetricValue: { fontSize: 16, fontWeight: '900', color: '#7f1d1d', marginTop: 2 },
  alarmWarningNotice: {
    fontSize: 11,
    color: '#64748b',
    textAlign: 'center',
    lineHeight: 16,
    marginBottom: 20,
  },
  alarmAcknowledgeBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: '#dc2626',
    width: '100%',
    paddingVertical: 14,
    borderRadius: 12,
  },
  alarmAcknowledgeBtnText: {
    color: '#ffffff',
    fontSize: 13,
    fontWeight: '800',
  },

  // Anti-Cheat Mock GPS Banner
  mockAlertCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#fef2f2',
    borderWidth: 1,
    borderColor: '#fca5a5',
    borderRadius: 12,
    padding: 12,
    marginBottom: 12,
    gap: 10,
  },
  mockAlertTitle: { fontSize: 11.5, fontWeight: '800', color: '#991b1b' },
  mockAlertSub: { fontSize: 10.5, color: '#b91c1c', marginTop: 1 },

  // Live Automatic Geofence Telemetry Card (Top of Screen)
  liveTelemetryCard: {
    backgroundColor: '#ffffff',
    borderRadius: 16,
    padding: 14,
    borderWidth: 1.5,
    borderColor: '#e0f2fe',
    marginBottom: 12,
    ...Platform.select({
      ios: {
        shadowColor: '#0284c7',
        shadowOffset: { width: 0, height: 3 },
        shadowOpacity: 0.08,
        shadowRadius: 8,
      },
      android: { elevation: 2.5 },
    }),
  },
  telemetryCardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 8,
  },
  telemetryHeaderLeft: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  pulseDot: { width: 8, height: 8, borderRadius: 4 },
  telemetryHeaderLabel: {
    fontSize: 9.5,
    fontWeight: '800',
    color: '#0369a1',
    letterSpacing: 0.5,
  },
  liveTimestampBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: '#f1f5f9',
    paddingHorizontal: 7,
    paddingVertical: 2,
    borderRadius: 6,
  },
  liveTimestampText: { fontSize: 9.5, color: '#475569', fontWeight: '600' },
  telemetryMainRow: { marginVertical: 4 },
  distanceMetricRow: { flexDirection: 'row', alignItems: 'baseline', gap: 6 },
  distanceBigText: {
    fontSize: 28,
    fontWeight: '900',
    color: '#003460',
    letterSpacing: -0.5,
  },
  distanceSubUnit: { fontSize: 12, fontWeight: '600', color: '#64748b' },
  perimeterNoticeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 6,
  },
  perimeterStatusBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingVertical: 3.5,
    paddingHorizontal: 8,
    borderRadius: 6,
    borderWidth: 1,
  },
  perimeterStatusText: { fontSize: 10, fontWeight: '800', letterSpacing: 0.3 },
  allowedRadiusText: { fontSize: 10.5, color: '#64748b', fontWeight: '600' },
  acquiringGpsBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingVertical: 12,
  },
  acquiringGpsText: { fontSize: 12, color: '#64748b', fontWeight: '600' },
  telemetryFooter: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 10,
    paddingTop: 8,
    borderTopWidth: 1,
    borderTopColor: '#f1f5f9',
  },
  telemetryFooterItem: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  telemetryFooterLabel: { fontSize: 9.5, color: '#64748b', fontWeight: '600' },

  // Duty Meta Card
  dutyCard: {
    backgroundColor: '#ffffff',
    borderRadius: 14,
    padding: 14,
    borderWidth: 1,
    borderColor: '#e2e8f0',
    marginBottom: 10,
  },
  dutyTopRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  dutyUserMeta: { flex: 1, marginRight: 8 },
  welcomeGreeting: { fontSize: 10, fontWeight: '700', color: '#64748b', textTransform: 'uppercase' },
  facultyDisplayName: { fontSize: 15.5, fontWeight: '800', color: '#0f172a', marginTop: 1 },
  empIdBadgeText: { fontSize: 10.5, color: '#004b87', fontWeight: '700', marginTop: 2 },
  dutyBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingVertical: 5,
    paddingHorizontal: 9,
    borderRadius: 8,
  },
  dutyBadgeText: { fontSize: 9.5, fontWeight: '800', letterSpacing: 0.3 },

  calendarAlertBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#fef2f2',
    borderRadius: 12,
    padding: 12,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: '#fecaca',
    gap: 10,
  },
  calendarAlertTitle: { fontSize: 11.5, fontWeight: '800', color: '#991b1b' },
  calendarAlertReason: { fontSize: 11, color: '#b91c1c', marginTop: 1 },

  offlineWarningBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#fffbeb',
    borderRadius: 10,
    padding: 10,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: '#fde68a',
    gap: 8,
  },
  offlineWarningText: { flex: 1, fontSize: 10.5, color: '#92400e', fontWeight: '600' },

  sectionHeadingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 14,
    marginBottom: 8,
  },
  sectionHeadingTitle: { fontSize: 12.5, fontWeight: '800', color: '#334155', letterSpacing: 0.2 },
  syncTimestampText: { fontSize: 10, fontWeight: '600', color: '#64748b' },

  dtrCard: {
    backgroundColor: '#ffffff',
    borderRadius: 14,
    padding: 12,
    borderWidth: 1,
    borderColor: '#e2e8f0',
  },
  dtrPunchesRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    backgroundColor: '#f8fafc',
    borderRadius: 10,
    paddingVertical: 8,
    paddingHorizontal: 10,
  },
  dtrPunchBox: { alignItems: 'center', flex: 1 },
  dtrPunchLabel: { fontSize: 8.5, fontWeight: '800', color: '#64748b' },
  dtrPunchTime: { fontSize: 12, fontWeight: '800', color: '#0f172a', marginTop: 2 },
  dtrFooterRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 8,
    paddingHorizontal: 4,
  },
  dtrFooterText: { fontSize: 10.5, color: '#475569', fontWeight: '600' },
  dtrStatusTag: { fontSize: 9.5, fontWeight: '800', letterSpacing: 0.3 },

  overallRateCard: {
    backgroundColor: '#ffffff',
    borderRadius: 14,
    padding: 14,
    borderWidth: 1,
    borderColor: '#e2e8f0',
    marginBottom: 10,
  },
  rateHeaderRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  rateCardTitle: { fontSize: 13, fontWeight: '700', color: '#0f172a' },
  rateCardSub: { fontSize: 10.5, color: '#64748b', marginTop: 2 },
  rateBigText: { fontSize: 26, fontWeight: '900', color: '#004b87', marginLeft: 8 },
  overallProgressTrack: {
    height: 6,
    backgroundColor: '#f1f5f9',
    borderRadius: 3,
    overflow: 'hidden',
    marginTop: 10,
  },
  overallProgressFill: { height: '100%', backgroundColor: '#004b87', borderRadius: 3 },
  genderBreakdownRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 10,
    paddingTop: 8,
    borderTopWidth: 1,
    borderTopColor: '#f1f5f9',
  },
  genderStatChip: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  genderStatText: { fontSize: 10.5, fontWeight: '700', color: '#334155' },

  kpiGrid: { flexDirection: 'row', gap: 8 },
  kpiTile: {
    flex: 1,
    backgroundColor: '#ffffff',
    borderRadius: 12,
    padding: 10,
    borderWidth: 1,
    borderColor: '#e2e8f0',
    alignItems: 'center',
  },
  kpiIconWrap: {
    width: 28,
    height: 28,
    borderRadius: 7,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 5,
  },
  kpiValue: { fontSize: 16, fontWeight: '800', color: '#0f172a' },
  kpiLabel: { fontSize: 8.5, fontWeight: '700', color: '#64748b', marginTop: 2, textAlign: 'center' },

  anomalyBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#faf5ff',
    borderRadius: 12,
    padding: 11,
    marginTop: 10,
    borderWidth: 1,
    borderColor: '#e9d5ff',
    gap: 8,
  },
  anomalyBannerTitle: { fontSize: 11, fontWeight: '800', color: '#6b21a8' },
  anomalyBannerSub: { fontSize: 10, color: '#7e22ce', marginTop: 1 },

  classCountText: { fontSize: 11, fontWeight: '700', color: '#004b87' },
  classScheduleCard: {
    backgroundColor: '#ffffff',
    borderRadius: 14,
    padding: 14,
    borderWidth: 1,
    borderColor: '#e2e8f0',
    marginBottom: 10,
  },
  classCardHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  classSubjectTitle: { fontSize: 13, fontWeight: '800', color: '#0f172a' },
  classTimeRoomSub: { fontSize: 10.5, color: '#64748b', marginTop: 1 },
  ratePill: {
    backgroundColor: '#ecfdf5',
    paddingVertical: 3,
    paddingHorizontal: 7,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: '#a7f3d0',
  },
  ratePillText: { fontSize: 9.5, fontWeight: '800', color: '#047857' },
  progressTrack: {
    height: 5,
    backgroundColor: '#f1f5f9',
    borderRadius: 2.5,
    overflow: 'hidden',
    marginVertical: 10,
  },
  progressFill: { height: '100%', backgroundColor: '#004b87', borderRadius: 2.5 },
  classMetricsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#f8fafc',
    borderRadius: 8,
    padding: 8,
  },
  classMetricItem: { alignItems: 'center' },
  classMetricLabel: { fontSize: 7.5, fontWeight: '800', color: '#64748b' },
  classMetricVal: { fontSize: 12, fontWeight: '800', color: '#0f172a', marginTop: 1 },

  loadingCard: {
    backgroundColor: '#ffffff',
    borderRadius: 12,
    padding: 24,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#e2e8f0',
  },
  loadingCardText: { fontSize: 11.5, color: '#64748b', marginTop: 8 },
  emptyClassCard: {
    backgroundColor: '#ffffff',
    borderRadius: 14,
    padding: 26,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#e2e8f0',
  },
  emptyClassTitle: { fontSize: 13.5, fontWeight: '700', color: '#0f172a', marginTop: 8 },
  emptyClassSub: {
    fontSize: 11,
    color: '#64748b',
    textAlign: 'center',
    marginTop: 3,
    lineHeight: 15,
  },
});

export default HomeScreen;