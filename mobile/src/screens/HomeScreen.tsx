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

const schoolLogo = require('../../assets/logo.svg');

interface StudentRosterItem {
  id: number;
  lrn: string;
  full_name: string;
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

export const HomeScreen: React.FC = () => {
  const { user, refreshUser } = useAuth();

  const [sections, setSections] = useState<SectionRoster[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [refreshing, setRefreshing] = useState<boolean>(false);
  const [telemetryLoading, setTelemetryLoading] = useState<boolean>(false);
  const [offlineCount, setOfflineCount] = useState<number>(0);
  const [lastSyncTime, setLastSyncTime] = useState<string>('');
  const [isInsideGeofence, setIsInsideGeofence] = useState<boolean>(true);

  // Dynamic user data
  const displayName =
    user?.full_name ||
    `${user?.first_name || ''} ${user?.last_name || ''}`.trim() ||
    user?.faculty_name ||
    user?.username ||
    '';

  const employeeId = user?.faculty_id || user?.username || '';
  const schoolName = user?.school_name || 'Department of Education';

  const loadDashboardData = useCallback(async () => {
    try {
      const res = await apiClient.get('/api/classroom/roster/');
      setSections(res.data || []);
      setLastSyncTime(new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }));
    } catch {
      // Keep existing data on temporary network blips
    } finally {
      setLoading(false);
    }
  }, []);

  const checkOfflineStorage = useCallback(async () => {
    try {
      const count = await getUnsyncedCount();
      setOfflineCount(count);
    } catch {
      // Ignore background storage check error
    }
  }, []);

  const onRefresh = async () => {
    setRefreshing(true);
    await Promise.all([loadDashboardData(), checkOfflineStorage(), refreshUser()]);
    setRefreshing(false);
  };

  useEffect(() => {
    loadDashboardData();
    checkOfflineStorage();
    refreshUser();
  }, [loadDashboardData, checkOfflineStorage, refreshUser]);

  // Computed live metrics
  const totalClasses = sections.length;
  const totalStudentsEnrolled = sections.reduce((acc, s) => acc + (s.students?.length || 0), 0);
  const totalPresent = sections.reduce(
    (acc, s) => acc + (s.students?.filter((st) => st.attendance_status === 'PRESENT').length || 0),
    0
  );
  const totalLate = sections.reduce(
    (acc, s) => acc + (s.students?.filter((st) => st.attendance_status === 'LATE').length || 0),
    0
  );
  const totalUnscanned = sections.reduce(
    (acc, s) => acc + (s.students?.filter((st) => st.attendance_status === 'UNSCANNED').length || 0),
    0
  );

  const overallRate =
    totalStudentsEnrolled > 0
      ? Math.round(((totalPresent + totalLate) / totalStudentsEnrolled) * 100)
      : 0;

  const handleVerifyLocation = async () => {
    setTelemetryLoading(true);
    try {
      const deviceId = user?.faculty_id || user?.username || 'FACULTY-DEVICE';
      const result: any = await sendLiveHeartbeat(deviceId);

      if (result.isQueuedOffline) {
        Alert.alert('Offline Mode', 'No network connection. Telemetry ping saved to device.');
      } else {
        setIsInsideGeofence(result?.is_inside_perimeter ?? true);
        setLastSyncTime(new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }));
        Alert.alert('Presence Verified', 'Your location has been logged for Civil Service Form 48.');
      }
      await checkOfflineStorage();
    } catch (err: any) {
      Alert.alert('Location Error', err?.message || 'Unable to get GPS coordinates.');
    } finally {
      setTelemetryLoading(false);
    }
  };

  return (
    <SafeAreaView style={styles.safeContainer} edges={['top', 'left', 'right']}>
      <StatusBar barStyle="dark-content" backgroundColor="#ffffff" />

      {/* Top Header */}
      <View style={styles.topHeader}>
        <View style={styles.brandGroup}>
          <Image source={schoolLogo} style={styles.schoolLogo} contentFit="contain" />
          <View style={styles.brandTextGroup}>
            <Text style={styles.schoolTitle} numberOfLines={1}>{schoolName}</Text>
            <View style={styles.subBrandRow}>
              <View style={styles.activeDot} />
              <Text style={styles.protocolText}>ATTENDSURE PRESENCE GATEWAY</Text>
            </View>
          </View>
        </View>

        <TouchableOpacity
          style={styles.refreshButton}
          onPress={onRefresh}
          activeOpacity={0.7}
        >
          <Ionicons name="refresh" size={18} color="#004b87" />
        </TouchableOpacity>
      </View>

      <ScrollView
        style={styles.scrollArea}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} colors={[COLORS.primary]} />}
      >
        {/* 1. Duty Banner */}
        <View style={styles.dutyCard}>
          <View style={styles.dutyTopRow}>
            <View style={styles.dutyUserMeta}>
              <Text style={styles.welcomeGreeting}>Welcome back,</Text>
              <Text style={styles.facultyDisplayName} numberOfLines={1}>
                {displayName}
              </Text>
              {employeeId ? (
                <Text style={styles.empIdBadgeText}>Employee ID: {employeeId}</Text>
              ) : null}
            </View>

            <View style={styles.dutyBadge}>
              <Ionicons name="shield-checkmark" size={14} color="#004b87" />
              <Text style={styles.dutyBadgeText}>ACTIVE ON DUTY</Text>
            </View>
          </View>

          <View style={styles.dutyDivider} />

          <View style={styles.telemetryStatusRow}>
            <View style={styles.perimeterChip}>
              <Ionicons
                name={isInsideGeofence ? 'radio' : 'alert-circle'}
                size={14}
                color={isInsideGeofence ? '#059669' : '#d97706'}
              />
              <Text
                style={[
                  styles.perimeterChipText,
                  { color: isInsideGeofence ? '#059669' : '#d97706' },
                ]}
              >
                {isInsideGeofence ? 'Within Campus Boundary' : 'Outside Campus Boundary'}
              </Text>
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

        {/* 2. Offline Notice */}
        {offlineCount > 0 && (
          <View style={styles.offlineWarningBanner}>
            <Ionicons name="cloud-offline" size={16} color="#b45309" />
            <Text style={styles.offlineWarningText}>
              {offlineCount} scan(s) stored on your phone. Upload them in the Settings tab.
            </Text>
          </View>
        )}

        {/* 3. Daily Classroom Analytics */}
        <View style={styles.sectionHeadingRow}>
          <Text style={styles.sectionHeadingTitle}>Daily Classroom Analytics</Text>
          {lastSyncTime ? (
            <Text style={styles.syncTimestampText}>Synced {lastSyncTime}</Text>
          ) : null}
        </View>

        <View style={styles.overallRateCard}>
          <View style={styles.rateHeaderRow}>
            <View>
              <Text style={styles.rateCardTitle}>Overall Class Attendance</Text>
              <Text style={styles.rateCardSub}>
                {totalPresent + totalLate} of {totalStudentsEnrolled} learners scanned today
              </Text>
            </View>
            <Text style={styles.rateBigText}>{overallRate}%</Text>
          </View>

          <View style={styles.overallProgressTrack}>
            <View style={[styles.overallProgressFill, { width: `${Math.min(overallRate, 100)}%` }]} />
          </View>
        </View>

        <View style={styles.kpiGrid}>
          <View style={styles.kpiTile}>
            <View style={[styles.kpiIconWrap, { backgroundColor: '#e0f2fe' }]}>
              <Ionicons name="calendar-outline" size={16} color="#0284c7" />
            </View>
            <Text style={styles.kpiValue}>{totalClasses}</Text>
            <Text style={styles.kpiLabel}>Classes</Text>
          </View>

          <View style={styles.kpiTile}>
            <View style={[styles.kpiIconWrap, { backgroundColor: '#f1f5f9' }]}>
              <Ionicons name="people-outline" size={16} color="#475569" />
            </View>
            <Text style={styles.kpiValue}>{totalStudentsEnrolled}</Text>
            <Text style={styles.kpiLabel}>Learners</Text>
          </View>

          <View style={styles.kpiTile}>
            <View style={[styles.kpiIconWrap, { backgroundColor: '#dcfce7' }]}>
              <Ionicons name="checkmark-done-outline" size={16} color="#16a34a" />
            </View>
            <Text style={[styles.kpiValue, { color: '#16a34a' }]}>{totalPresent}</Text>
            <Text style={styles.kpiLabel}>Present</Text>
          </View>

          <View style={styles.kpiTile}>
            <View style={[styles.kpiIconWrap, { backgroundColor: '#fef3c7' }]}>
              <Ionicons name="time-outline" size={16} color="#d97706" />
            </View>
            <Text style={[styles.kpiValue, { color: '#d97706' }]}>{totalLate}</Text>
            <Text style={styles.kpiLabel}>Tardy</Text>
          </View>
        </View>

        {/* 4. Assigned Class Sessions */}
        <View style={styles.sectionHeadingRow}>
          <Text style={styles.sectionHeadingTitle}>Assigned Class Sessions</Text>
          <Text style={styles.classCountText}>{sections.length} Active</Text>
        </View>

        {loading ? (
          <View style={styles.loadingCard}>
            <ActivityIndicator size="small" color="#004b87" />
            <Text style={styles.loadingCardText}>Loading class schedules...</Text>
          </View>
        ) : sections.length === 0 ? (
          <View style={styles.emptyClassCard}>
            <Ionicons name="school-outline" size={38} color="#94a3b8" />
            <Text style={styles.emptyClassTitle}>No Classes Assigned Today</Text>
            <Text style={styles.emptyClassSub}>
              You do not have any teaching sessions or advisory sections scheduled.
            </Text>
          </View>
        ) : (
          sections.map((sec, index) => {
            const classPresent = sec.students?.filter((s) => s.attendance_status === 'PRESENT').length || 0;
            const classLate = sec.students?.filter((s) => s.attendance_status === 'LATE').length || 0;
            const classUnscanned = sec.students?.filter((s) => s.attendance_status === 'UNSCANNED').length || 0;
            const classRate =
              sec.total_students > 0
                ? Math.round(((classPresent + classLate) / sec.total_students) * 100)
                : 0;

            return (
              <View key={String(sec.schedule_id || index)} style={styles.classScheduleCard}>
                <View style={styles.classCardHeader}>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.classSubjectTitle}>
                      {sec.subject_name} • {sec.section_name}
                    </Text>
                    <Text style={styles.classTimeRoomSub}>
                      {sec.room} ({sec.start_time} - {sec.end_time})
                    </Text>
                  </View>

                  <View style={styles.ratePill}>
                    <Text style={styles.ratePillText}>{classRate}% Rate</Text>
                  </View>
                </View>

                <View style={styles.progressTrack}>
                  <View style={[styles.progressFill, { width: `${Math.min(classRate, 100)}%` }]} />
                </View>

                <View style={styles.classMetricsRow}>
                  <View style={styles.classMetricItem}>
                    <Text style={styles.classMetricLabel}>ENROLLED</Text>
                    <Text style={styles.classMetricVal}>{sec.total_students}</Text>
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
                    <Text style={[styles.classMetricLabel, { color: '#dc2626' }]}>UNSCANNED</Text>
                    <Text style={[styles.classMetricVal, { color: '#dc2626' }]}>{classUnscanned}</Text>
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
  topHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingVertical: 10, backgroundColor: '#ffffff', borderBottomWidth: 1, borderBottomColor: '#e2e8f0' },
  brandGroup: { flexDirection: 'row', alignItems: 'center', flex: 1 },
  schoolLogo: { width: 36, height: 36, borderRadius: 8 },
  brandTextGroup: { marginLeft: 10, flex: 1 },
  schoolTitle: { fontSize: 13, fontWeight: '800', color: '#003460' },
  subBrandRow: { flexDirection: 'row', alignItems: 'center', marginTop: 1, gap: 4 },
  activeDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: '#059669' },
  protocolText: { fontSize: 8.5, fontWeight: '800', color: '#004b87', letterSpacing: 0.4 },
  refreshButton: { width: 34, height: 34, borderRadius: 8, backgroundColor: '#f1f5f9', alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: '#e2e8f0' },
  scrollArea: { flex: 1 },
  scrollContent: { paddingHorizontal: 16, paddingTop: 12, paddingBottom: 28 },
  dutyCard: { backgroundColor: '#ffffff', borderRadius: 16, padding: 14, borderWidth: 1, borderColor: '#e2e8f0', ...Platform.select({ ios: { shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.04, shadowRadius: 6 }, android: { elevation: 2 } }) },
  dutyTopRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  dutyUserMeta: { flex: 1 },
  welcomeGreeting: { fontSize: 11, color: '#64748b' },
  facultyDisplayName: { fontSize: 16, fontWeight: '800', color: '#0f172a', marginTop: 1 },
  empIdBadgeText: { fontSize: 11, color: '#004b87', fontWeight: '700', marginTop: 2 },
  dutyBadge: { flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: '#e6f0fa', paddingVertical: 5, paddingHorizontal: 9, borderRadius: 8, borderWidth: 1, borderColor: '#b8d6f0' },
  dutyBadgeText: { fontSize: 9.5, fontWeight: '800', color: '#004b87', letterSpacing: 0.3 },
  dutyDivider: { height: 1, backgroundColor: '#f1f5f9', marginVertical: 12 },
  telemetryStatusRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  perimeterChip: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  perimeterChipText: { fontSize: 11, fontWeight: '700' },
  pingButton: { flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: '#004b87', paddingVertical: 6, paddingHorizontal: 11, borderRadius: 8 },
  pingButtonText: { color: '#ffffff', fontSize: 11, fontWeight: '700' },
  btnDisabled: { opacity: 0.6 },
  offlineWarningBanner: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#fffbeb', borderRadius: 10, padding: 10, marginTop: 10, borderWidth: 1, borderColor: '#fde68a', gap: 8 },
  offlineWarningText: { flex: 1, fontSize: 10.5, color: '#92400e', fontWeight: '600' },
  sectionHeadingRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 16, marginBottom: 8 },
  sectionHeadingTitle: { fontSize: 13, fontWeight: '800', color: '#334155', letterSpacing: 0.2 },
  syncTimestampText: { fontSize: 10, color: '#94a3b8' },
  overallRateCard: { backgroundColor: '#ffffff', borderRadius: 14, padding: 14, borderWidth: 1, borderColor: '#e2e8f0', marginBottom: 10 },
  rateHeaderRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  rateCardTitle: { fontSize: 13.5, fontWeight: '700', color: '#0f172a' },
  rateCardSub: { fontSize: 11, color: '#64748b', marginTop: 2 },
  rateBigText: { fontSize: 28, fontWeight: '900', color: '#004b87' },
  overallProgressTrack: { height: 6, backgroundColor: '#f1f5f9', borderRadius: 3, overflow: 'hidden', marginTop: 10 },
  overallProgressFill: { height: '100%', backgroundColor: '#004b87', borderRadius: 3 },
  kpiGrid: { flexDirection: 'row', gap: 8 },
  kpiTile: { flex: 1, backgroundColor: '#ffffff', borderRadius: 12, padding: 10, borderWidth: 1, borderColor: '#e2e8f0', alignItems: 'center' },
  kpiIconWrap: { width: 28, height: 28, borderRadius: 7, alignItems: 'center', justifyContent: 'center', marginBottom: 5 },
  kpiValue: { fontSize: 16, fontWeight: '800', color: '#0f172a' },
  kpiLabel: { fontSize: 8.5, fontWeight: '700', color: '#64748b', marginTop: 2, textAlign: 'center' },
  classCountText: { fontSize: 11, fontWeight: '700', color: '#004b87' },
  classScheduleCard: { backgroundColor: '#ffffff', borderRadius: 14, padding: 14, borderWidth: 1, borderColor: '#e2e8f0', marginBottom: 10 },
  classCardHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  classSubjectTitle: { fontSize: 13, fontWeight: '800', color: '#0f172a' },
  classTimeRoomSub: { fontSize: 10.5, color: '#64748b', marginTop: 1 },
  ratePill: { backgroundColor: '#ecfdf5', paddingVertical: 3, paddingHorizontal: 7, borderRadius: 6, borderWidth: 1, borderColor: '#a7f3d0' },
  ratePillText: { fontSize: 9.5, fontWeight: '800', color: '#047857' },
  progressTrack: { height: 5, backgroundColor: '#f1f5f9', borderRadius: 2.5, overflow: 'hidden', marginVertical: 10 },
  progressFill: { height: '100%', backgroundColor: '#004b87', borderRadius: 2.5 },
  classMetricsRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', backgroundColor: '#f8fafc', borderRadius: 8, padding: 8 },
  classMetricItem: { alignItems: 'center' },
  classMetricLabel: { fontSize: 8, fontWeight: '800', color: '#64748b' },
  classMetricVal: { fontSize: 12, fontWeight: '800', color: '#0f172a', marginTop: 1 },
  loadingCard: { backgroundColor: '#ffffff', borderRadius: 12, padding: 24, alignItems: 'center', borderWidth: 1, borderColor: '#e2e8f0' },
  loadingCardText: { fontSize: 11.5, color: '#64748b', marginTop: 8 },
  emptyClassCard: { backgroundColor: '#ffffff', borderRadius: 14, padding: 26, alignItems: 'center', borderWidth: 1, borderColor: '#e2e8f0' },
  emptyClassTitle: { fontSize: 13.5, fontWeight: '700', color: '#0f172a', marginTop: 8 },
  emptyClassSub: { fontSize: 11, color: '#64748b', textAlign: 'center', marginTop: 3, lineHeight: 15 },
});

export default HomeScreen;