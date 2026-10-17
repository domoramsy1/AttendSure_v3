// mobile/src/screens/HomeScreen.tsx

import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  RefreshControl,
  ActivityIndicator,
  Alert,
  StatusBar,
  Platform,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import { useAuth } from '../context/AuthContext';
import { sendLiveHeartbeat } from '../services/telemetryService';
import { getUnsyncedCount } from '../services/offlineQueue';
import { apiClient } from '../api/client';
import { COLORS } from '../constants/theme';

const fallbackLogo = require('../../assets/attendsure-logo.svg');

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

const getLocalTodayStr = (): string => {
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, '0');
  const d = String(now.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
};

const showAlert = (title: string, message: string) => {
  if (Platform.OS === 'web' && typeof window !== 'undefined') {
    window.alert(`${title}: ${message}`);
  } else {
    Alert.alert(title, message);
  }
};

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
  const [telemetryLoading, setTelemetryLoading] = useState<boolean>(false);
  const [offlineCount, setOfflineCount] = useState<number>(0);
  const [lastSyncTime, setLastSyncTime] = useState<string>('');

  // Real telemetry state (null until verified against server)
  const [isInsideGeofence, setIsInsideGeofence] = useState<boolean | null>(null);
  const [lastDistanceMeters, setLastDistanceMeters] = useState<number | null>(null);
  const [lastHeartbeatTime, setLastHeartbeatTime] = useState<string>('');

  const currentUser = user as Record<string, any> | null;
  const displayName =
    currentUser?.full_name ||
    `${currentUser?.first_name || ''} ${currentUser?.last_name || ''}`.trim() ||
    currentUser?.faculty_name ||
    currentUser?.username ||
    '';

  const employeeId = currentUser?.faculty_id || dtrData?.employee_id || currentUser?.username || '';
  const userRole = String(currentUser?.role || currentUser?.system_role || '').trim().toUpperCase();

  const schoolName =
    schoolProfile?.school_name ||
    currentUser?.school_name ||
    geofenceConfig?.name ||
    '';

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

  const loadAllDynamicData = useCallback(async () => {
    const todayStr = getLocalTodayStr();
    const now = new Date();

    const [
      rosterRes,
      schoolRes,
      dtrRes,
      geofenceRes,
      calendarRes,
      overviewRes,
    ] = await Promise.allSettled([
      apiClient.get('/api/classroom/roster/'),
      apiClient.get('/api/settings/school/'),
      apiClient.get(`/api/dtr/?month=${now.getMonth() + 1}&year=${now.getFullYear()}`),
      apiClient.get('/api/geofence/'),
      apiClient.get('/api/calendar/exceptions/'),
      apiClient.get('/api/dashboard/overview/'),
    ]);

    if (rosterRes.status === 'fulfilled') {
      setSections(Array.isArray(rosterRes.value.data) ? rosterRes.value.data : []);
    }

    if (schoolRes.status === 'fulfilled' && schoolRes.value.data) {
      setSchoolProfile(schoolRes.value.data);
    }

    if (dtrRes.status === 'fulfilled' && dtrRes.value.data) {
      setDtrData(dtrRes.value.data);
    }

    if (geofenceRes.status === 'fulfilled' && geofenceRes.value.data) {
      setGeofenceConfig(geofenceRes.value.data);
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
      const matched = list.find((item) => item.date === todayStr) || null;
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
      setOfflineCount(count);
    } catch {
      // Ignore storage check error
    }
  }, []);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await Promise.all([loadAllDynamicData(), checkOfflineStorage(), refreshUser()]);
    setRefreshing(false);
  }, [loadAllDynamicData, checkOfflineStorage, refreshUser]);

  useEffect(() => {
    loadAllDynamicData();
    checkOfflineStorage();
    refreshUser();
  }, [loadAllDynamicData, checkOfflineStorage, refreshUser]);

  // ---------------------------------------------------------------------------
  // 1. REAL FACULTY GATE & DTR STATUS FOR TODAY
  // ---------------------------------------------------------------------------
  const todayStr = getLocalTodayStr();
  const todayDtrRow: DtrDayRow | null =
    dtrData?.rows?.find((r) => r.date_str === todayStr) || null;

  const hasTappedInToday = Boolean(todayDtrRow?.am_arrival || todayDtrRow?.pm_arrival);
  const hasTappedOutToday = Boolean(
    (todayDtrRow?.pm_departure && todayDtrRow.pm_departure !== '') ||
      (todayDtrRow?.am_departure && !todayDtrRow?.pm_arrival)
  );

  const dutyStatusLabel = hasTappedInToday
    ? hasTappedOutToday
      ? 'CHECKED OUT'
      : 'ON CAMPUS'
    : 'NO GATE SCAN';

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
  // 2. REAL CLASSROOM & LEARNER ANALYTICS (COMPUTED FROM DB ROSTER)
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

  // ---------------------------------------------------------------------------
  // 3. LIVE GPS GEOFENCE TELEMETRY VERIFICATION
  // ---------------------------------------------------------------------------
  const handleVerifyLocation = async () => {
    if (!employeeId) {
      showAlert('Account Error', 'No employee identifier found for this account.');
      return;
    }

    setTelemetryLoading(true);
    try {
      const result: any = await sendLiveHeartbeat(employeeId);

      if (result?.isQueuedOffline) {
        showAlert('Offline Queue', 'No network connection. GPS telemetry saved to device queue.');
      } else {
        const inside = Boolean(result?.is_inside_perimeter);
        setIsInsideGeofence(inside);
        if (typeof result?.distance_meters === 'number') {
          setLastDistanceMeters(result.distance_meters);
        }
        if (result?.server_time) {
          setLastHeartbeatTime(result.server_time);
        }
        setLastSyncTime(
          new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })
        );
        showAlert(
          inside ? 'Presence Verified' : 'Outside Geofence',
          `Distance from campus center: ${result?.distance_meters ?? 0}m (Allowed radius: ${
            geofenceConfig?.radius_meters ?? 0
          }m).`
        );
      }
      await checkOfflineStorage();
    } catch (err: any) {
      const errMsg =
        err?.response?.data?.error ||
        err?.response?.data?.security_alert ||
        err?.message ||
        'Unable to verify GPS coordinates.';
      showAlert('Telemetry Error', errMsg);
    } finally {
      setTelemetryLoading(false);
    }
  };

  return (
    <SafeAreaView style={styles.safeContainer} edges={['top', 'left', 'right']}>
      <StatusBar barStyle="dark-content" backgroundColor="#ffffff" />

      {/* Top Institutional Header (From Database) */}
      <View style={styles.topHeader}>
        <View style={styles.brandGroup}>
          <Image source={logoSource} style={styles.schoolLogo} contentFit="contain" />
          <View style={styles.brandTextGroup}>
            <Text style={styles.schoolTitle} numberOfLines={1}>
              {schoolName || 'Loading School Profile...'}
            </Text>
            <View style={styles.subBrandRow}>
              <View style={[styles.activeDot, { backgroundColor: dutyStatusColor }]} />
              <Text style={styles.protocolText} numberOfLines={1}>
                {schoolSubHeader || (userRole ? `${userRole} PORTAL` : '')}
              </Text>
            </View>
          </View>
        </View>

        <TouchableOpacity style={styles.refreshButton} onPress={onRefresh} activeOpacity={0.7}>
          <Ionicons name="refresh" size={18} color="#004b87" />
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
                Mandatory classroom attendance logging is excluded today.
              </Text>
            </View>
          </View>
        ) : null}

        {/* 1. Faculty Identity, Gate Status & Geofence Telemetry Card */}
        <View style={styles.dutyCard}>
          <View style={styles.dutyTopRow}>
            <View style={styles.dutyUserMeta}>
              <Text style={styles.welcomeGreeting}>
                {dtrData?.department ? dtrData.department : userRole || 'Faculty Member'}
              </Text>
              <Text style={styles.facultyDisplayName} numberOfLines={1}>
                {displayName}
              </Text>
              {employeeId ? (
                <Text style={styles.empIdBadgeText}>ID: {employeeId}</Text>
              ) : null}
            </View>

            <View style={[styles.dutyBadge, { backgroundColor: dutyStatusBg }]}>
              <View style={[styles.activeDot, { backgroundColor: dutyStatusColor }]} />
              <Text style={[styles.dutyBadgeText, { color: dutyStatusColor }]}>
                {dutyStatusLabel}
              </Text>
            </View>
          </View>

          <View style={styles.dutyDivider} />

          <View style={styles.telemetryStatusRow}>
            <View style={{ flex: 1, marginRight: 8 }}>
              <View style={styles.perimeterChip}>
                <Ionicons
                  name={
                    isInsideGeofence === null
                      ? 'location-outline'
                      : isInsideGeofence
                      ? 'radio'
                      : 'alert-circle'
                  }
                  size={15}
                  color={
                    isInsideGeofence === null
                      ? '#475569'
                      : isInsideGeofence
                      ? '#059669'
                      : '#dc2626'
                  }
                />
                <Text
                  style={[
                    styles.perimeterChipText,
                    {
                      color:
                        isInsideGeofence === null
                          ? '#475569'
                          : isInsideGeofence
                          ? '#059669'
                          : '#dc2626',
                    },
                  ]}
                >
                  {isInsideGeofence === null
                    ? geofenceConfig?.is_configured
                      ? `Geofence Radius: ${geofenceConfig.radius_meters}m`
                      : 'Geofence Ready'
                    : isInsideGeofence
                    ? `Inside Perimeter (${lastDistanceMeters ?? 0}m)`
                    : `Outside Perimeter (${lastDistanceMeters ?? 0}m)`}
                </Text>
              </View>
              {lastHeartbeatTime ? (
                <Text style={styles.heartbeatSubText}>Last GPS log: {lastHeartbeatTime}</Text>
              ) : null}
            </View>

            <TouchableOpacity
              style={[styles.pingButton, telemetryLoading && styles.btnDisabled]}
              onPress={handleVerifyLocation}
              disabled={telemetryLoading}
              activeOpacity={0.8}
            >
              {telemetryLoading ? (
                <ActivityIndicator size="small" color="#ffffff" />
              ) : (
                <>
                  <Ionicons name="navigate" size={13} color="#ffffff" />
                  <Text style={styles.pingButtonText}>Verify Presence</Text>
                </>
              )}
            </TouchableOpacity>
          </View>
        </View>

        {/* 2. Offline Queue Notice */}
        {offlineCount > 0 && (
          <View style={styles.offlineWarningBanner}>
            <Ionicons name="cloud-offline" size={16} color="#b45309" />
            <Text style={styles.offlineWarningText}>
              {offlineCount} offline record(s) waiting to sync to database.
            </Text>
          </View>
        )}

        {/* 3. Personal CSC Form 48 (DTR) Analytics */}
        {dtrData && (
          <>
            <View style={styles.sectionHeadingRow}>
              <Text style={styles.sectionHeadingTitle}>
                My CSC Form 48 Logs ({dtrData.month} {dtrData.year})
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

        {/* 4. Classroom & Learner Attendance Analytics */}
        <View style={styles.sectionHeadingRow}>
          <Text style={styles.sectionHeadingTitle}>Classroom Attendance Analytics</Text>
          {lastSyncTime ? (
            <Text style={styles.syncTimestampText}>Synced {lastSyncTime}</Text>
          ) : null}
        </View>

        <View style={styles.overallRateCard}>
          <View style={styles.rateHeaderRow}>
            <View style={{ flex: 1 }}>
              <Text style={styles.rateCardTitle}>Overall Class Attendance Rate</Text>
              <Text style={styles.rateCardSub}>
                {totalAttended} of {totalStudentsEnrolled} learners accounted for across {totalClasses} class(es)
              </Text>
            </View>
            <Text style={styles.rateBigText}>{overallRate}%</Text>
          </View>

          <View style={styles.overallProgressTrack}>
            <View style={[styles.overallProgressFill, { width: `${Math.min(overallRate, 100)}%` }]} />
          </View>

          {/* Gender Breakdown Bar */}
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

        {/* Primary Classroom KPIs */}
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
            <Text style={styles.kpiLabel}>Anomalies</Text>
          </View>
        </View>

        {/* Anti-Cutting / Proxy Scan Alert Banner */}
        {totalAnomalies > 0 && (
          <View style={styles.anomalyBanner}>
            <Ionicons name="warning" size={18} color="#9333ea" />
            <View style={{ flex: 1 }}>
              <Text style={styles.anomalyBannerTitle}>
                Gate Discrepancy Detected ({totalAnomalies} Learner{totalAnomalies > 1 ? 's' : ''})
              </Text>
              <Text style={styles.anomalyBannerSub}>
                {totalCutting > 0 ? `${totalCutting} Cutting (tapped OUT at gate) • ` : ''}
                {totalUnverified > 0 ? `${totalUnverified} Unverified (no gate IN record)` : ''}
              </Text>
            </View>
          </View>
        )}

        {/* 5. Live Campus Gate Telemetry Summary */}
        {campusOverview && (
          <>
            <View style={styles.sectionHeadingRow}>
              <Text style={styles.sectionHeadingTitle}>Live Campus Gate Telemetry</Text>
              <Text style={styles.syncTimestampText}>
                {campusOverview.kiosks_online}/{campusOverview.total_kiosks} Kiosks Online
              </Text>
            </View>

            <View style={styles.campusTelemetryCard}>
              <View style={styles.campusStatsRow}>
                <View style={styles.campusStatBox}>
                  <Text style={styles.campusStatVal}>{campusOverview.students_on_campus}</Text>
                  <Text style={styles.campusStatLabel}>In Campus</Text>
                </View>
                <View style={styles.campusStatBox}>
                  <Text style={styles.campusStatVal}>
                    {campusOverview.faculty_on_duty}/{campusOverview.total_faculty}
                  </Text>
                  <Text style={styles.campusStatLabel}>Faculty In</Text>
                </View>
                <View style={styles.campusStatBox}>
                  <Text style={styles.campusStatVal}>
                    {campusOverview.analytics?.rfid_count_today ?? 0}
                  </Text>
                  <Text style={styles.campusStatLabel}>RFID Taps</Text>
                </View>
                <View style={styles.campusStatBox}>
                  <Text style={styles.campusStatVal}>
                    {campusOverview.analytics?.qr_count_today ?? 0}
                  </Text>
                  <Text style={styles.campusStatLabel}>QR Scans</Text>
                </View>
              </View>
            </View>
          </>
        )}

        {/* 6. Assigned Class Sessions */}
        <View style={styles.sectionHeadingRow}>
          <Text style={styles.sectionHeadingTitle}>Assigned Class Sessions</Text>
          <Text style={styles.classCountText}>{sections.length} Scheduled</Text>
        </View>

        {loading ? (
          <View style={styles.loadingCard}>
            <ActivityIndicator size="small" color="#004b87" />
            <Text style={styles.loadingCardText}>Loading class schedules from database...</Text>
          </View>
        ) : sections.length === 0 ? (
          <View style={styles.emptyClassCard}>
            <Ionicons name="school-outline" size={38} color="#94a3b8" />
            <Text style={styles.emptyClassTitle}>No Classes Assigned</Text>
            <Text style={styles.emptyClassSub}>
              No teaching schedules or advisory sections are linked to your profile in the database.
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
  calendarAlertBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#fef2f2',
    borderRadius: 12,
    padding: 12,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: '#fecaca',
    gap: 10,
  },
  calendarAlertTitle: { fontSize: 11.5, fontWeight: '800', color: '#991b1b' },
  calendarAlertReason: { fontSize: 11, color: '#b91c1c', marginTop: 1 },
  dutyCard: {
    backgroundColor: '#ffffff',
    borderRadius: 16,
    padding: 14,
    borderWidth: 1,
    borderColor: '#e2e8f0',
    ...Platform.select({
      ios: {
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.04,
        shadowRadius: 6,
      },
      android: { elevation: 2 },
    }),
  },
  dutyTopRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  dutyUserMeta: { flex: 1, marginRight: 8 },
  welcomeGreeting: { fontSize: 10.5, fontWeight: '700', color: '#64748b', textTransform: 'uppercase' },
  facultyDisplayName: { fontSize: 16, fontWeight: '800', color: '#0f172a', marginTop: 1 },
  empIdBadgeText: { fontSize: 11, color: '#004b87', fontWeight: '700', marginTop: 2 },
  dutyBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingVertical: 5,
    paddingHorizontal: 9,
    borderRadius: 8,
  },
  dutyBadgeText: { fontSize: 9.5, fontWeight: '800', letterSpacing: 0.3 },
  dutyDivider: { height: 1, backgroundColor: '#f1f5f9', marginVertical: 12 },
  telemetryStatusRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  perimeterChip: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  perimeterChipText: { fontSize: 11, fontWeight: '700' },
  heartbeatSubText: { fontSize: 9.5, color: '#94a3b8', marginTop: 2, marginLeft: 20 },
  pingButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: '#004b87',
    paddingVertical: 7,
    paddingHorizontal: 11,
    borderRadius: 8,
  },
  pingButtonText: { color: '#ffffff', fontSize: 11, fontWeight: '700' },
  btnDisabled: { opacity: 0.6 },
  offlineWarningBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#fffbeb',
    borderRadius: 10,
    padding: 10,
    marginTop: 10,
    borderWidth: 1,
    borderColor: '#fde68a',
    gap: 8,
  },
  offlineWarningText: { flex: 1, fontSize: 10.5, color: '#92400e', fontWeight: '600' },
  sectionHeadingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 16,
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
  rateCardTitle: { fontSize: 13.5, fontWeight: '700', color: '#0f172a' },
  rateCardSub: { fontSize: 11, color: '#64748b', marginTop: 2 },
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
  campusTelemetryCard: {
    backgroundColor: '#ffffff',
    borderRadius: 14,
    padding: 12,
    borderWidth: 1,
    borderColor: '#e2e8f0',
  },
  campusStatsRow: { flexDirection: 'row', justifyContent: 'space-between' },
  campusStatBox: { alignItems: 'center', flex: 1 },
  campusStatVal: { fontSize: 14, fontWeight: '800', color: '#003460' },
  campusStatLabel: { fontSize: 9, fontWeight: '700', color: '#64748b', marginTop: 2 },
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