// mobile/src/screens/ScannerScreen.tsx

import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  TextInput,
  ScrollView,
  ActivityIndicator,
  Alert,
  Platform,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { CameraView, useCameraPermissions } from 'expo-camera';
import { Ionicons } from '@expo/vector-icons';
import { apiClient } from '../api/client';
import { enqueueOfflineScan } from '../services/offlineQueue';
import { COLORS } from '../constants/theme';

interface StudentRosterItem {
  id: number;
  lrn: string;
  qr_token: string;
  rfid_uid: string;
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

interface ProcessedRecord {
  student_id: number;
  name: string;
  lrn: string;
  section: string;
  status: string;
  is_anomaly: boolean;
  remarks: string;
  scan_time: string;
}

const showAlert = (title: string, message: string) => {
  if (Platform.OS === 'web' && typeof window !== 'undefined') {
    window.alert(`${title}: ${message}`);
  } else {
    Alert.alert(title, message);
  }
};

export const ScannerScreen: React.FC = () => {
  const [permission, requestPermission] = useCameraPermissions();

  const [schedules, setSchedules] = useState<SectionRoster[]>([]);
  const [selectedScheduleId, setSelectedScheduleId] = useState<number | null>(null);
  const [scanModeStatus, setScanModeStatus] = useState<'PRESENT' | 'LATE'>('PRESENT');
  const [manualInput, setManualInput] = useState<string>('');
  const [cameraActive, setCameraActive] = useState<boolean>(true);

  const [loadingRoster, setLoadingRoster] = useState<boolean>(true);
  const [submittingScan, setSubmittingScan] = useState<boolean>(false);
  const [recentScans, setRecentScans] = useState<ProcessedRecord[]>([]);

  const lastScannedRef = useRef<{ token: string; time: number }>({ token: '', time: 0 });

  const fetchRosterSchedules = useCallback(async () => {
    try {
      const res = await apiClient.get('/api/classroom/roster/');
      const list: SectionRoster[] = Array.isArray(res.data) ? res.data : [];
      setSchedules(list);
      if (list.length > 0 && selectedScheduleId === null) {
        setSelectedScheduleId(list[0].schedule_id);
      }
    } catch {
      setSchedules([]);
    } finally {
      setLoadingRoster(false);
    }
  }, [selectedScheduleId]);

  useEffect(() => {
    fetchRosterSchedules();
  }, [fetchRosterSchedules]);

  const activeSchedule = schedules.find((s) => s.schedule_id === selectedScheduleId) || null;

  const submitAttendanceScan = async (identifier: string) => {
    const cleanId = identifier.trim();
    if (!cleanId) return;

    if (!selectedScheduleId) {
      showAlert('No Class Selected', 'Please select an assigned class schedule before scanning.');
      return;
    }

    setSubmittingScan(true);
    try {
      const payload = {
        schedule_id: selectedScheduleId,
        scans: [
          {
            qr_token: cleanId,
            status: scanModeStatus,
          },
        ],
      };

      const res = await apiClient.post('/api/classroom/batch-scan/', payload);
      const records: ProcessedRecord[] = res.data?.processed_records || [];

      if (records.length > 0) {
        const latest = records[0];
        setRecentScans((prev) => [latest, ...prev.filter((r) => r.student_id !== latest.student_id)]);

        if (latest.is_anomaly) {
          showAlert('Gate Discrepancy Flagged', `${latest.name}: ${latest.remarks}`);
        }
      }

      setManualInput('');
      await fetchRosterSchedules();
    } catch (err: any) {
      const httpStatus = err?.response?.status;

      // Save to offline queue if the server is unreachable or timed out
      if (!httpStatus || httpStatus >= 500) {
        await enqueueOfflineScan(selectedScheduleId, cleanId, scanModeStatus);
        setManualInput('');
        showAlert(
          'Saved Offline',
          `No connection to server. Scan for ID "${cleanId}" was saved to your phone's offline queue.`
        );
      } else {
        const msg =
          err?.response?.data?.error ||
          err?.response?.data?.detail ||
          'Could not record attendance scan.';
        showAlert('Scan Rejected', msg);
      }
    } finally {
      setSubmittingScan(false);
    }
  };

  const handleBarcodeScanned = ({ data }: { data: string }) => {
    if (!data || submittingScan) return;

    const now = Date.now();
    // 3-second cooldown for the same QR code to prevent duplicate requests
    if (lastScannedRef.current.token === data && now - lastScannedRef.current.time < 3000) {
      return;
    }

    lastScannedRef.current = { token: data, time: now };
    submitAttendanceScan(data);
  };

  return (
    <SafeAreaView style={styles.container} edges={['top', 'left', 'right']}>
      {/* Top Header */}
      <View style={styles.topHeader}>
        <View>
          <Text style={styles.screenTitle}>Classroom QR Scanner</Text>
          <Text style={styles.screenSub}>Real-Time Learner Verification & Gate Cross-Check</Text>
        </View>
        <TouchableOpacity
          style={styles.cameraToggleBtn}
          onPress={() => setCameraActive((prev) => !prev)}
          activeOpacity={0.7}
        >
          <Ionicons
            name={cameraActive ? 'videocam' : 'videocam-off'}
            size={18}
            color={COLORS.primary}
          />
        </TouchableOpacity>
      </View>

      <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
        {/* 1. Class Schedule Selector */}
        <View style={styles.card}>
          <Text style={styles.sectionLabel}>1. SELECT ASSIGNED CLASS SESSION</Text>
          {loadingRoster ? (
            <ActivityIndicator size="small" color={COLORS.primary} style={{ marginVertical: 10 }} />
          ) : schedules.length === 0 ? (
            <Text style={styles.emptyText}>
              No assigned class schedules found for your account in the database.
            </Text>
          ) : (
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.pillScroll}>
              {schedules.map((sched) => {
                const isSelected = sched.schedule_id === selectedScheduleId;
                return (
                  <TouchableOpacity
                    key={String(sched.schedule_id)}
                    style={[styles.schedulePill, isSelected && styles.schedulePillActive]}
                    onPress={() => setSelectedScheduleId(sched.schedule_id)}
                    activeOpacity={0.8}
                  >
                    <Text style={[styles.schedulePillTitle, isSelected && styles.textWhite]}>
                      {sched.subject_name || sched.subject_code}
                    </Text>
                    <Text style={[styles.schedulePillSub, isSelected && styles.textWhiteSub]}>
                      {[sched.section_name, sched.start_time].filter(Boolean).join(' • ')}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </ScrollView>
          )}

          {/* Mark Status Toggle (Present vs Late) */}
          <View style={styles.statusToggleRow}>
            <Text style={styles.fieldSubLabel}>Scan Status:</Text>
            {(['PRESENT', 'LATE'] as const).map((st) => (
              <TouchableOpacity
                key={st}
                style={[
                  styles.statusOptionBtn,
                  scanModeStatus === st &&
                    (st === 'PRESENT' ? styles.statusPresentActive : styles.statusLateActive),
                ]}
                onPress={() => setScanModeStatus(st)}
              >
                <Text
                  style={[
                    styles.statusOptionText,
                    scanModeStatus === st && { color: '#ffffff' },
                  ]}
                >
                  {st}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>

        {/* 2. Live Camera Viewport */}
        {cameraActive && Platform.OS !== 'web' && (
          <View style={styles.cameraCard}>
            {!permission ? (
              <ActivityIndicator size="small" color={COLORS.primary} style={{ margin: 24 }} />
            ) : !permission.granted ? (
              <View style={styles.permissionBox}>
                <Ionicons name="camera-outline" size={32} color="#64748b" />
                <Text style={styles.permissionText}>
                  Camera access is required to scan student QR ID cards.
                </Text>
                <TouchableOpacity style={styles.grantBtn} onPress={requestPermission}>
                  <Text style={styles.grantBtnText}>Grant Camera Permission</Text>
                </TouchableOpacity>
              </View>
            ) : (
              <View style={styles.cameraWrapper}>
                <CameraView
                  style={styles.cameraView}
                  facing="back"
                  barcodeScannerSettings={{ barcodeTypes: ['qr'] }}
                  onBarcodeScanned={handleBarcodeScanned}
                />
                <View style={styles.scanFrameOverlay} />
                {submittingScan && (
                  <View style={styles.scanningBusyOverlay}>
                    <ActivityIndicator size="large" color="#ffffff" />
                    <Text style={styles.scanningBusyText}>Verifying in database...</Text>
                  </View>
                )}
              </View>
            )}
          </View>
        )}

        {/* 3. Manual LRN / QR Token Input */}
        <View style={styles.card}>
          <Text style={styles.sectionLabel}>2. MANUAL LRN / QR TOKEN ENTRY</Text>
          <View style={styles.manualRow}>
            <TextInput
              style={styles.manualInput}
              placeholder="Enter Learner LRN or QR Token"
              placeholderTextColor="#94a3b8"
              value={manualInput}
              onChangeText={setManualInput}
              autoCapitalize="characters"
            />
            <TouchableOpacity
              style={[styles.submitManualBtn, submittingScan && { opacity: 0.6 }]}
              onPress={() => submitAttendanceScan(manualInput)}
              disabled={submittingScan}
            >
              {submittingScan ? (
                <ActivityIndicator size="small" color="#ffffff" />
              ) : (
                <Text style={styles.submitManualBtnText}>Record</Text>
              )}
            </TouchableOpacity>
          </View>
        </View>

        {/* 4. Live Session Scan Log */}
        <View style={styles.card}>
          <View style={styles.logHeaderRow}>
            <Text style={styles.sectionLabel}>
              VERIFIED SCANS THIS SESSION ({recentScans.length})
            </Text>
            {activeSchedule && (
              <Text style={styles.enrolledCountText}>
                Class Roster: {activeSchedule.total_students}
              </Text>
            )}
          </View>

          {recentScans.length === 0 ? (
            <Text style={styles.emptyText}>No students scanned in this session yet.</Text>
          ) : (
            recentScans.map((rec) => (
              <View key={String(rec.student_id)} style={styles.scanResultRow}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.studentNameText}>{rec.name}</Text>
                  <Text style={styles.studentMetaText}>
                    LRN: {rec.lrn} • {rec.scan_time}
                  </Text>
                  {rec.is_anomaly && (
                    <Text style={styles.anomalyReasonText}>{rec.remarks}</Text>
                  )}
                </View>

                <View
                  style={[
                    styles.statusBadge,
                    rec.is_anomaly
                      ? styles.badgeAnomaly
                      : rec.status === 'PRESENT'
                      ? styles.badgePresent
                      : styles.badgeLate,
                  ]}
                >
                  <Text
                    style={[
                      styles.statusBadgeText,
                      rec.is_anomaly
                        ? styles.textAnomaly
                        : rec.status === 'PRESENT'
                        ? styles.textPresent
                        : styles.textLate,
                    ]}
                  >
                    {rec.status}
                  </Text>
                </View>
              </View>
            ))
          )}
        </View>
      </ScrollView>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f8fafc' },
  topHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 18,
    paddingVertical: 12,
    backgroundColor: '#ffffff',
    borderBottomWidth: 1,
    borderBottomColor: '#e2e8f0',
  },
  screenTitle: { fontSize: 18, fontWeight: '800', color: '#003460' },
  screenSub: { fontSize: 10.5, color: '#64748b', marginTop: 1 },
  cameraToggleBtn: {
    width: 36,
    height: 36,
    borderRadius: 10,
    backgroundColor: '#e6f0fa',
    alignItems: 'center',
    justifyContent: 'center',
  },
  scrollContent: { padding: 16, gap: 12 },
  card: {
    backgroundColor: '#ffffff',
    borderRadius: 16,
    padding: 15,
    borderWidth: 1,
    borderColor: '#e2e8f0',
  },
  sectionLabel: {
    fontSize: 10.5,
    fontWeight: '800',
    color: '#004b87',
    letterSpacing: 0.4,
    marginBottom: 10,
  },
  pillScroll: { flexDirection: 'row', marginBottom: 12 },
  schedulePill: {
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 10,
    backgroundColor: '#f1f5f9',
    borderWidth: 1,
    borderColor: '#e2e8f0',
    marginRight: 8,
  },
  schedulePillActive: { backgroundColor: '#004b87', borderColor: '#004b87' },
  schedulePillTitle: { fontSize: 12, fontWeight: '800', color: '#0f172a' },
  schedulePillSub: { fontSize: 10, color: '#64748b', marginTop: 1 },
  textWhite: { color: '#ffffff' },
  textWhiteSub: { color: '#e2e8f0' },
  statusToggleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingTop: 8,
    borderTopWidth: 1,
    borderTopColor: '#f1f5f9',
  },
  fieldSubLabel: { fontSize: 11.5, fontWeight: '700', color: '#475569', marginRight: 4 },
  statusOptionBtn: {
    paddingVertical: 6,
    paddingHorizontal: 14,
    borderRadius: 8,
    backgroundColor: '#f1f5f9',
  },
  statusPresentActive: { backgroundColor: '#16a34a' },
  statusLateActive: { backgroundColor: '#d97706' },
  statusOptionText: { fontSize: 11, fontWeight: '800', color: '#475569' },
  cameraCard: {
    backgroundColor: '#0f172a',
    borderRadius: 16,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: '#cbd5e1',
  },
  cameraWrapper: {
    height: 240,
    width: '100%',
    position: 'relative',
    alignItems: 'center',
    justifyContent: 'center',
  },
  cameraView: {
    position: 'absolute',
    top: 0,
    right: 0,
    bottom: 0,
    left: 0,
  },
  scanFrameOverlay: {
    width: 170,
    height: 170,
    borderWidth: 2,
    borderColor: '#38bdf8',
    borderRadius: 14,
  },
  scanningBusyOverlay: {
    position: 'absolute',
    top: 0,
    right: 0,
    bottom: 0,
    left: 0,
    backgroundColor: 'rgba(15, 23, 42, 0.7)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  scanningBusyText: { color: '#ffffff', fontSize: 12, fontWeight: '700', marginTop: 8 },
  permissionBox: { padding: 24, alignItems: 'center' },
  permissionText: {
    color: '#cbd5e1',
    fontSize: 12,
    textAlign: 'center',
    marginTop: 8,
    marginBottom: 14,
  },
  grantBtn: {
    backgroundColor: '#0284c7',
    paddingVertical: 8,
    paddingHorizontal: 16,
    borderRadius: 8,
  },
  grantBtnText: { color: '#ffffff', fontSize: 12, fontWeight: '700' },
  manualRow: { flexDirection: 'row', gap: 8 },
  manualInput: {
    flex: 1,
    height: 42,
    backgroundColor: '#f8fafc',
    borderWidth: 1,
    borderColor: '#cbd5e1',
    borderRadius: 10,
    paddingHorizontal: 12,
    fontSize: 12.5,
    color: '#0f172a',
  },
  submitManualBtn: {
    backgroundColor: '#004b87',
    paddingHorizontal: 18,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  submitManualBtnText: { color: '#ffffff', fontSize: 12, fontWeight: '800' },
  logHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 6,
  },
  enrolledCountText: { fontSize: 10.5, fontWeight: '700', color: '#64748b' },
  emptyText: { fontSize: 11.5, color: '#94a3b8', textAlign: 'center', paddingVertical: 12 },
  scanResultRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: '#f1f5f9',
  },
  studentNameText: { fontSize: 13, fontWeight: '700', color: '#0f172a' },
  studentMetaText: { fontSize: 10.5, color: '#64748b', marginTop: 1 },
  anomalyReasonText: { fontSize: 10.5, fontWeight: '700', color: '#9333ea', marginTop: 2 },
  statusBadge: { paddingVertical: 4, paddingHorizontal: 8, borderRadius: 6 },
  badgePresent: { backgroundColor: '#dcfce7' },
  textPresent: { color: '#16a34a' },
  badgeLate: { backgroundColor: '#fef3c7' },
  textLate: { color: '#d97706' },
  badgeAnomaly: { backgroundColor: '#fae8ff' },
  textAnomaly: { color: '#9333ea' },
  statusBadgeText: { fontSize: 9.5, fontWeight: '800' },
});

export default ScannerScreen;