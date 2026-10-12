import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Modal,
  Vibration,
  TextInput,
  ActivityIndicator,
  Alert,
  FlatList,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { CameraView, useCameraPermissions } from 'expo-camera';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { apiClient } from '../api/client';
import { useAuth } from '../context/AuthContext';
import { COLORS } from '../constants/theme';
import {
  playScanSuccessSound,
  playScanWarningSound,
  playScanErrorSound,
} from '../services/soundService';

interface StudentRosterItem {
  id: number;
  lrn: string;
  qr_token: string;
  full_name: string;
  gender?: string;
  attendance_status: 'PRESENT' | 'LATE' | 'CUTTING' | 'UNVERIFIED' | 'UNSCANNED' | string;
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

interface ScanResultData {
  name: string;
  lrn: string;
  section: string;
  status: string;
  is_anomaly: boolean;
  remarks: string;
  scan_time: string;
}

export const ScannerScreen: React.FC = () => {
  const { user } = useAuth();

  // Camera State
  const [permission, requestPermission] = useCameraPermissions();
  const [facing, setFacing] = useState<'back' | 'front'>('back');
  const [isScanningLocked, setIsScanningLocked] = useState<boolean>(false);

  // Time & Ingestion Mode
  const [currentTime, setCurrentTime] = useState<string>('');
  const [currentDate, setCurrentDate] = useState<string>('');
  const [scanMode, setScanMode] = useState<'PRESENT' | 'LATE'>('PRESENT');
  const [vibrateEnabled, setVibrateEnabled] = useState<boolean>(true);
  const [soundEnabled, setSoundEnabled] = useState<boolean>(true);

  // Faculty Roster Data
  const [sections, setSections] = useState<SectionRoster[]>([]);
  const [activeSectionIndex, setActiveSectionIndex] = useState<number>(0);
  const [rosterLoading, setRosterLoading] = useState<boolean>(true);
  const [showRosterDrawer, setShowRosterDrawer] = useState<boolean>(false);
  const [showSectionPicker, setShowSectionPicker] = useState<boolean>(false);

  // Verification & Manual Input
  const [manualInputVisible, setManualInputVisible] = useState<boolean>(false);
  const [manualCode, setManualCode] = useState<string>('');
  const [scanLoading, setScanLoading] = useState<boolean>(false);
  const [modalVisible, setModalVisible] = useState<boolean>(false);
  const [lastScannedStudent, setLastScannedStudent] = useState<ScanResultData | null>(null);

  const lockTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // 1. Live Clock
  useEffect(() => {
    const update = () => {
      const now = new Date();
      setCurrentTime(
        now.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', second: '2-digit' })
      );
      setCurrentDate(
        now.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' })
      );
    };
    update();
    const interval = setInterval(update, 1000);
    return () => clearInterval(interval);
  }, []);

  // 2. Load Persisted Audio & Haptic Preferences
  useEffect(() => {
    const loadPreferences = async () => {
      try {
        const storedSound = await AsyncStorage.getItem('pref_sound_enabled');
        const storedHaptic = await AsyncStorage.getItem('pref_haptic_enabled');
        if (storedSound !== null) setSoundEnabled(storedSound === 'true');
        if (storedHaptic !== null) setVibrateEnabled(storedHaptic === 'true');
      } catch {
        // Fall back to default enabled
      }
    };
    loadPreferences();
  }, []);

  const toggleSound = async () => {
    const nextVal = !soundEnabled;
    setSoundEnabled(nextVal);
    try {
      await AsyncStorage.setItem('pref_sound_enabled', String(nextVal));
    } catch {
      // Storage error ignored
    }
  };

  // 3. Fetch Assigned Class Rosters
  const fetchFacultyRoster = useCallback(async () => {
    setRosterLoading(true);
    try {
      const res = await apiClient.get('/api/classroom/roster/');
      const data: SectionRoster[] = res.data || [];
      setSections(data);
      if (data.length > 0 && activeSectionIndex >= data.length) {
        setActiveSectionIndex(0);
      }
    } catch {
      Alert.alert('Roster Sync Notice', 'Unable to fetch assigned classroom sections from server.');
    } finally {
      setRosterLoading(false);
    }
  }, [activeSectionIndex]);

  useEffect(() => {
    fetchFacultyRoster();
  }, [fetchFacultyRoster]);

  const activeSection = sections[activeSectionIndex] || null;

  const unlockScanningDebounce = () => {
    if (lockTimerRef.current) clearTimeout(lockTimerRef.current);
    lockTimerRef.current = setTimeout(() => {
      setIsScanningLocked(false);
    }, 1500);
  };

  // 4. Reject Faculty Identifiers (Prevents proxy/self scans)
  const isFacultyIdentifier = (code: string): boolean => {
    const clean = code.trim().toLowerCase();
    const myEmpId = (user?.faculty_id || (user as any)?.employee_id || '').toLowerCase();
    const myUsername = (user?.username || '').toLowerCase();
    const myQrToken = (user?.qr_token || '').toLowerCase();

    if (myEmpId && clean === myEmpId) return true;
    if (myUsername && clean === myUsername) return true;
    if (myQrToken && clean === myQrToken) return true;

    return clean.startsWith('emp-') || clean.startsWith('fac-') || clean.startsWith('staff-');
  };

  // 5. Verification & Batch Ingestion
  const processStudentScan = async (rawCode: string) => {
    const cleanCode = rawCode.trim();
    if (!cleanCode) return;

    if (!activeSection) {
      if (soundEnabled) await playScanErrorSound();
      Alert.alert('No Class Available', 'You do not have any teaching sections assigned to your faculty profile.');
      return;
    }

    // Shield: Reject Faculty Badges
    if (isFacultyIdentifier(cleanCode)) {
      if (soundEnabled) await playScanErrorSound();
      if (vibrateEnabled) Vibration.vibrate([0, 150, 100, 150]);
      Alert.alert('Faculty Pass Detected', 'Teacher identification cards cannot be used for student attendance logs.', [
        { text: 'OK', onPress: unlockScanningDebounce },
      ]);
      return;
    }

    // Section Whitelist Verification
    const enrolledMatch = activeSection.students.find(
      (s) =>
        s.lrn.toLowerCase() === cleanCode.toLowerCase() ||
        (s.qr_token && s.qr_token.toLowerCase() === cleanCode.toLowerCase())
    );

    if (!enrolledMatch) {
      if (soundEnabled) await playScanErrorSound();
      if (vibrateEnabled) Vibration.vibrate([0, 150, 100, 150]);
      Alert.alert(
        'Student Not in Class',
        `This learner is not registered in ${activeSection.section_name}. Please switch to their assigned class section.`,
        [{ text: 'OK', onPress: unlockScanningDebounce }]
      );
      return;
    }

    setIsScanningLocked(true);
    setScanLoading(true);

    try {
      const res = await apiClient.post('/api/classroom/batch-scan/', {
        schedule_id: activeSection.schedule_id,
        scans: [{ qr_token: cleanCode, status: scanMode }],
      });

      const processed = res.data?.processed_records?.[0];
      const isAnomaly = Boolean(processed?.is_anomaly);
      const resultingStatus = processed?.status || scanMode;

      // Auditory & Haptic Feedback
      if (isAnomaly) {
        if (soundEnabled) await playScanWarningSound();
        if (vibrateEnabled) Vibration.vibrate([0, 200, 100, 200]);
      } else {
        if (soundEnabled) await playScanSuccessSound();
        if (vibrateEnabled) Vibration.vibrate(80);
      }

      // Live Section State Synchronization
      setSections((prev) =>
        prev.map((sec, idx) => {
          if (idx !== activeSectionIndex) return sec;
          return {
            ...sec,
            students: sec.students.map((st) =>
              st.id === enrolledMatch.id ? { ...st, attendance_status: resultingStatus } : st
            ),
          };
        })
      );

      setLastScannedStudent({
        name: enrolledMatch.full_name,
        lrn: enrolledMatch.lrn,
        section: activeSection.section_name,
        status: resultingStatus,
        is_anomaly: isAnomaly,
        remarks: processed?.remarks || 'Attendance scan recorded successfully.',
        scan_time: processed?.scan_time || currentTime || new Date().toLocaleTimeString(),
      });

      setModalVisible(true);
      setManualInputVisible(false);
      setManualCode('');
    } catch (err: any) {
      if (soundEnabled) await playScanErrorSound();
      if (vibrateEnabled) Vibration.vibrate([0, 100, 100, 100]);
      const msg = err?.response?.data?.error || err?.response?.data?.detail || 'Unable to verify student attendance.';
      Alert.alert('Scan Incomplete', msg, [{ text: 'Continue', onPress: unlockScanningDebounce }]);
    } finally {
      setScanLoading(false);
    }
  };

  // Dynamic Counter Calculations
  const presentCount = activeSection?.students.filter((s) => s.attendance_status === 'PRESENT').length || 0;
  const lateCount = activeSection?.students.filter((s) => s.attendance_status === 'LATE').length || 0;
  const anomalyCount =
    activeSection?.students.filter(
      (s) => s.attendance_status === 'UNVERIFIED' || s.attendance_status === 'CUTTING'
    ).length || 0;
  const unscannedCount = activeSection?.students.filter((s) => s.attendance_status === 'UNSCANNED').length || 0;

  return (
    <SafeAreaView style={styles.container} edges={['top', 'left', 'right']}>
      {/* 1. Terminal Clock Header */}
      <View style={styles.clockCard}>
        <View style={styles.terminalIndicator}>
          <View style={styles.greenDot} />
          <Text style={styles.terminalIndicatorText}>FACULTY CLASSROOM SCANNER</Text>
        </View>
        <Text style={styles.clockDigits}>{currentTime || '--:--:--'}</Text>
        <Text style={styles.clockDate}>{currentDate}</Text>
      </View>

      {/* 2. Assigned Class Selector Banner */}
      {rosterLoading ? (
        <View style={styles.loadingBanner}>
          <ActivityIndicator size="small" color={COLORS.primary} />
          <Text style={styles.loadingBannerText}>Synchronizing assigned teaching rosters...</Text>
        </View>
      ) : activeSection ? (
        <View style={styles.sectionHeaderBox}>
          <TouchableOpacity
            style={{ flex: 1 }}
            activeOpacity={0.8}
            onPress={() => sections.length > 1 && setShowSectionPicker(true)}
          >
            <Text style={styles.sectionMetaTag}>ASSIGNED TEACHING SESSION</Text>
            <Text style={styles.activeSectionTitle} numberOfLines={1}>
              {`${activeSection.subject_name} • ${activeSection.section_name}`}
            </Text>
            <Text style={styles.sectionSubDetails}>
              {activeSection.room} ({activeSection.start_time} - {activeSection.end_time})
            </Text>
          </TouchableOpacity>

          <View style={styles.sectionActionsRow}>
            <TouchableOpacity
              style={styles.refreshIconBtn}
              onPress={fetchFacultyRoster}
              accessibilityLabel="Reload Roster"
            >
              <Ionicons name="refresh" size={15} color={COLORS.primary} />
            </TouchableOpacity>

            {sections.length > 1 && (
              <TouchableOpacity
                style={styles.switchSectionBtn}
                onPress={() => setShowSectionPicker(true)}
              >
                <Ionicons name="swap-horizontal" size={14} color={COLORS.primary} />
                <Text style={styles.switchSectionBtnText}>Change</Text>
              </TouchableOpacity>
            )}
          </View>
        </View>
      ) : (
        <View style={styles.emptySectionBanner}>
          <Ionicons name="information-circle-outline" size={20} color="#b45309" />
          <View style={{ flex: 1, marginLeft: 8 }}>
            <Text style={styles.emptySectionTitle}>No Teaching Classes Assigned</Text>
            <Text style={styles.emptySectionSub}>
              Your faculty profile does not have any active class schedules or advisory sections assigned.
            </Text>
          </View>
        </View>
      )}

      {/* 3. Section Counter Chips */}
      <View style={styles.counterRow}>
        <View style={[styles.counterBox, { backgroundColor: '#ecfdf5', borderColor: '#a7f3d0' }]}>
          <Text style={[styles.counterLabel, { color: '#059669' }]}>PRESENT</Text>
          <Text style={[styles.counterValue, { color: '#047857' }]}>{presentCount}</Text>
        </View>

        <View style={[styles.counterBox, { backgroundColor: '#fffbeb', borderColor: '#fef3c7' }]}>
          <Text style={[styles.counterLabel, { color: '#d97706' }]}>LATE</Text>
          <Text style={[styles.counterValue, { color: '#b45309' }]}>{lateCount}</Text>
        </View>

        {anomalyCount > 0 && (
          <View style={[styles.counterBox, { backgroundColor: '#fef2f2', borderColor: '#fecaca' }]}>
            <Text style={[styles.counterLabel, { color: '#dc2626' }]}>FLAGGED</Text>
            <Text style={[styles.counterValue, { color: '#b91c1c' }]}>{anomalyCount}</Text>
          </View>
        )}

        <View style={[styles.counterBox, { backgroundColor: '#f1f5f9', borderColor: '#e2e8f0' }]}>
          <Text style={[styles.counterLabel, { color: '#64748b' }]}>UNSCANNED</Text>
          <Text style={[styles.counterValue, { color: '#334155' }]}>{unscannedCount}</Text>
        </View>
      </View>

      {/* 4. Scanning Camera Viewfinder */}
      <View style={styles.viewfinderContainer}>
        <View style={styles.cameraBox}>
          {!permission?.granted ? (
            <View style={styles.permissionBox}>
              <Ionicons name="camera-outline" size={32} color="#94a3b8" />
              <Text style={styles.permissionText}>Camera access is required to verify student optical codes</Text>
              <TouchableOpacity style={styles.grantBtn} onPress={requestPermission}>
                <Text style={styles.grantBtnText}>Grant Camera Permission</Text>
              </TouchableOpacity>
            </View>
          ) : (
            <>
              <CameraView
                style={styles.fullAbsoluteFill}
                facing={facing}
                barcodeScannerSettings={{ barcodeTypes: ['qr', 'code128', 'code39', 'ean13'] }}
                onBarcodeScanned={isScanningLocked || scanLoading ? undefined : ({ data }) => processStudentScan(data)}
              />

              <View style={[styles.bracket, styles.bracketTL]} />
              <View style={[styles.bracket, styles.bracketTR]} />
              <View style={[styles.bracket, styles.bracketBL]} />
              <View style={[styles.bracket, styles.bracketBR]} />

              {scanLoading ? (
                <View style={styles.loadingOverlay}>
                  <ActivityIndicator size="large" color="#ffffff" />
                  <Text style={styles.loadingOverlayText}>Verifying student credentials...</Text>
                </View>
              ) : (
                <View style={styles.laserLine} />
              )}

              {/* Sound Feedback Toggle Button */}
              <TouchableOpacity
                style={styles.soundToggleBtn}
                onPress={toggleSound}
                accessibilityLabel="Toggle Scanner Audio"
              >
                <Ionicons
                  name={soundEnabled ? 'volume-high' : 'volume-mute'}
                  size={16}
                  color={soundEnabled ? '#38bdf8' : '#94a3b8'}
                />
              </TouchableOpacity>

              {/* Camera Flip Button */}
              <TouchableOpacity
                style={styles.cameraFlipBtn}
                onPress={() => setFacing((cur) => (cur === 'back' ? 'front' : 'back'))}
              >
                <Ionicons name="camera-reverse-outline" size={18} color="#ffffff" />
              </TouchableOpacity>
            </>
          )}
        </View>
        <Text style={styles.helperText}>
          Align student barcode within viewfinder
        </Text>
      </View>

      {/* 5. Utility Controls */}
      <View style={styles.utilityRow}>
        <TouchableOpacity
          style={[styles.rosterDrawerBtn, !activeSection && styles.btnDisabled]}
          disabled={!activeSection}
          onPress={() => setShowRosterDrawer(true)}
        >
          <Ionicons name="people-outline" size={16} color={COLORS.primary} />
          <Text style={styles.rosterDrawerBtnText}>Class Roster ({activeSection?.total_students || 0})</Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.manualBtn, !activeSection && styles.btnDisabled]}
          disabled={!activeSection}
          onPress={() => setManualInputVisible(true)}
        >
          <Ionicons name="keypad-outline" size={16} color="#334155" />
          <Text style={styles.manualBtnText}>Manual LRN</Text>
        </TouchableOpacity>
      </View>

      {/* Section Switcher Modal */}
      <Modal visible={showSectionPicker} transparent animationType="fade">
        <View style={styles.modalBackdrop}>
          <View style={styles.pickerModalSheet}>
            <View style={styles.pickerHeader}>
              <Text style={styles.pickerTitle}>Select Teaching Class</Text>
              <TouchableOpacity onPress={() => setShowSectionPicker(false)}>
                <Ionicons name="close" size={20} color="#64748b" />
              </TouchableOpacity>
            </View>

            <FlatList
              data={sections}
              keyExtractor={(item) => String(item.schedule_id || item.section_id)}
              renderItem={({ item, index }) => {
                const isSelected = index === activeSectionIndex;
                return (
                  <TouchableOpacity
                    style={[styles.sectionOption, isSelected && styles.sectionOptionActive]}
                    onPress={() => {
                      setActiveSectionIndex(index);
                      setShowSectionPicker(false);
                    }}
                  >
                    <View style={{ flex: 1 }}>
                      <Text style={[styles.sectionOptionTitle, isSelected && { color: COLORS.primary }]}>
                        {item.subject_name} • {item.section_name}
                      </Text>
                      <Text style={styles.sectionOptionSub}>
                        {item.room} • {item.total_students} Enrolled Students
                      </Text>
                    </View>
                    {isSelected && <Ionicons name="checkmark-circle" size={20} color={COLORS.primary} />}
                  </TouchableOpacity>
                );
              }}
            />
          </View>
        </View>
      </Modal>

      {/* Class Student Roster Modal */}
      <Modal visible={showRosterDrawer} animationType="slide">
        <SafeAreaView style={{ flex: 1, backgroundColor: '#ffffff' }}>
          <View style={styles.rosterModalHeader}>
            <View>
              <Text style={styles.rosterModalTitle}>{activeSection?.section_name} Students</Text>
              <Text style={styles.rosterModalSub}>Only enrolled students of this class are accepted</Text>
            </View>
            <TouchableOpacity onPress={() => setShowRosterDrawer(false)} style={styles.closeBtn}>
              <Ionicons name="close" size={24} color="#64748b" />
            </TouchableOpacity>
          </View>

          <FlatList
            data={activeSection?.students || []}
            keyExtractor={(item) => String(item.id)}
            contentContainerStyle={{ padding: 16 }}
            renderItem={({ item }) => {
              const isPresent = item.attendance_status === 'PRESENT';
              const isLate = item.attendance_status === 'LATE';
              const isFlagged = item.attendance_status === 'UNVERIFIED' || item.attendance_status === 'CUTTING';
              const isUnscanned = item.attendance_status === 'UNSCANNED';

              return (
                <View style={styles.studentRosterRow}>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.studentRowName}>{item.full_name}</Text>
                    <Text style={styles.studentRowLrn}>LRN: {item.lrn}</Text>
                  </View>
                  <View
                    style={[
                      styles.statusPillSmall,
                      isPresent && { backgroundColor: '#ecfdf5' },
                      isLate && { backgroundColor: '#fffbeb' },
                      isFlagged && { backgroundColor: '#fef2f2' },
                      isUnscanned && { backgroundColor: '#f1f5f9' },
                    ]}
                  >
                    <Text
                      style={[
                        styles.statusPillSmallText,
                        isPresent && { color: '#059669' },
                        isLate && { color: '#d97706' },
                        isFlagged && { color: '#dc2626' },
                        isUnscanned && { color: '#64748b' },
                      ]}
                    >
                      {item.attendance_status}
                    </Text>
                  </View>
                </View>
              );
            }}
          />
        </SafeAreaView>
      </Modal>

      {/* Manual LRN Dialog */}
      <Modal visible={manualInputVisible} transparent animationType="fade">
        <View style={styles.modalBackdrop}>
          <View style={styles.inputModalSheet}>
            <Text style={styles.inputModalTitle}>Enter Student LRN</Text>
            <Text style={styles.inputModalSub}>Records attendance directly into {activeSection?.section_name}.</Text>

            <TextInput
              style={styles.modalTextInput}
              placeholder="Enter 12-digit Learner Reference Number"
              placeholderTextColor="#94a3b8"
              value={manualCode}
              onChangeText={setManualCode}
              keyboardType="numeric"
              autoFocus
            />

            <View style={styles.modalActionsRow}>
              <TouchableOpacity
                style={styles.cancelBtn}
                onPress={() => {
                  setManualInputVisible(false);
                  setManualCode('');
                }}
              >
                <Text style={styles.cancelBtnText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.submitBtn}
                onPress={() => processStudentScan(manualCode)}
                disabled={scanLoading}
              >
                {scanLoading ? (
                  <ActivityIndicator size="small" color="#ffffff" />
                ) : (
                  <Text style={styles.submitBtnText}>Verify LRN</Text>
                )}
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* Verification Result Modal */}
      <Modal visible={modalVisible} transparent animationType="fade">
        <View style={styles.modalBackdrop}>
          <View style={styles.modalSheet}>
            <View style={styles.successHeadingGroup}>
              <Ionicons
                name={lastScannedStudent?.is_anomaly ? 'warning' : 'checkmark-circle'}
                size={24}
                color={lastScannedStudent?.is_anomaly ? '#d97706' : '#10b981'}
              />
              <Text style={[styles.modalHeadingText, lastScannedStudent?.is_anomaly && { color: '#b45309' }]}>
                {lastScannedStudent?.is_anomaly ? 'Attendance Anomaly' : `Logged in ${activeSection?.section_name}`}
              </Text>
            </View>

            <View style={[styles.studentAvatarRing, lastScannedStudent?.is_anomaly && { borderColor: '#d97706' }]}>
              <Ionicons name="person" size={40} color={lastScannedStudent?.is_anomaly ? '#d97706' : COLORS.primary} />
            </View>

            <Text style={styles.studentModalName}>{lastScannedStudent?.name}</Text>
            <Text style={styles.studentModalLrn}>LRN: {lastScannedStudent?.lrn}</Text>

            {lastScannedStudent?.is_anomaly && (
              <View style={styles.anomalyBanner}>
                <Ionicons name="shield-outline" size={16} color="#b45309" />
                <Text style={styles.anomalyBannerText}>{lastScannedStudent.remarks}</Text>
              </View>
            )}

            <View
              style={[
                styles.statusPillLarge,
                lastScannedStudent?.is_anomaly && { backgroundColor: '#fef3c7', borderColor: '#fde68a' },
              ]}
            >
              <Text style={[styles.statusPillTitle, lastScannedStudent?.is_anomaly && { color: '#92400e' }]}>
                {lastScannedStudent?.status}
              </Text>
              <Text style={styles.statusPillTime}>Recorded at {lastScannedStudent?.scan_time}</Text>
            </View>

            <TouchableOpacity
              style={styles.confirmModalBtn}
              onPress={() => {
                setModalVisible(false);
                unlockScanningDebounce();
              }}
            >
              <Text style={styles.confirmModalBtnText}>Continue Scanning</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f8fafc', paddingHorizontal: 18 },
  clockCard: { backgroundColor: '#ffffff', borderRadius: 18, paddingVertical: 10, paddingHorizontal: 16, alignItems: 'center', borderWidth: 1, borderColor: '#e2e8f0', marginTop: 4 },
  terminalIndicator: { flexDirection: 'row', alignItems: 'center', gap: 5, marginBottom: 2 },
  greenDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: '#10b981' },
  terminalIndicatorText: { fontSize: 9, fontWeight: '800', color: '#004b87', letterSpacing: 0.5 },
  clockDigits: { fontSize: 24, fontWeight: '800', color: '#003460', letterSpacing: -0.5 },
  clockDate: { fontSize: 10.5, color: '#64748b' },
  loadingBanner: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', backgroundColor: '#ffffff', borderRadius: 14, padding: 14, borderWidth: 1, borderColor: '#e2e8f0', marginTop: 10, gap: 8 },
  loadingBannerText: { fontSize: 12, color: '#64748b', fontWeight: '600' },
  sectionHeaderBox: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#e6f0fa', borderRadius: 14, padding: 12, borderWidth: 1, borderColor: '#b8d6f0', marginTop: 10 },
  sectionMetaTag: { fontSize: 8.5, fontWeight: '800', color: '#004b87', letterSpacing: 0.5 },
  activeSectionTitle: { fontSize: 13, fontWeight: '700', color: '#0f172a', marginTop: 1 },
  sectionSubDetails: { fontSize: 10.5, color: '#64748b', marginTop: 1 },
  sectionActionsRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  refreshIconBtn: { width: 30, height: 30, borderRadius: 8, backgroundColor: '#ffffff', alignItems: 'center', justifyContent: 'center' },
  switchSectionBtn: { flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: '#ffffff', paddingVertical: 6, paddingHorizontal: 10, borderRadius: 8 },
  switchSectionBtnText: { fontSize: 11, fontWeight: '700', color: '#004b87' },
  emptySectionBanner: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#fffbeb', borderRadius: 14, padding: 12, borderWidth: 1, borderColor: '#fde68a', marginTop: 10 },
  emptySectionTitle: { fontSize: 12.5, fontWeight: '700', color: '#92400e' },
  emptySectionSub: { fontSize: 10.5, color: '#b45309', marginTop: 2, lineHeight: 14 },
  counterRow: { flexDirection: 'row', gap: 6, marginTop: 10 },
  counterBox: { flex: 1, borderRadius: 12, padding: 8, borderWidth: 1, alignItems: 'center' },
  counterLabel: { fontSize: 8.5, fontWeight: '800', letterSpacing: 0.3 },
  counterValue: { fontSize: 18, fontWeight: '800', marginTop: 2 },
  viewfinderContainer: { alignItems: 'center', marginTop: 10 },
  cameraBox: { width: '100%', height: 210, borderRadius: 18, backgroundColor: '#0f172a', position: 'relative', overflow: 'hidden', alignItems: 'center', justifyContent: 'center' },
  fullAbsoluteFill: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 },
  permissionBox: { padding: 20, alignItems: 'center' },
  permissionText: { fontSize: 11, color: '#cbd5e1', marginTop: 8, marginBottom: 12, textAlign: 'center' },
  grantBtn: { backgroundColor: '#004b87', paddingVertical: 8, paddingHorizontal: 14, borderRadius: 8 },
  grantBtnText: { color: '#ffffff', fontSize: 11, fontWeight: '700' },
  bracket: { position: 'absolute', width: 22, height: 22, borderColor: '#38bdf8', zIndex: 2 },
  bracketTL: { top: 14, left: 14, borderTopWidth: 3, borderLeftWidth: 3 },
  bracketTR: { top: 14, right: 14, borderTopWidth: 3, borderRightWidth: 3 },
  bracketBL: { bottom: 14, left: 14, borderBottomWidth: 3, borderLeftWidth: 3 },
  bracketBR: { bottom: 14, right: 14, borderBottomWidth: 3, borderRightWidth: 3 },
  laserLine: { width: '80%', height: 2, backgroundColor: '#38bdf8', zIndex: 2 },
  soundToggleBtn: { position: 'absolute', top: 10, left: 10, width: 32, height: 32, borderRadius: 16, backgroundColor: 'rgba(15, 23, 42, 0.75)', alignItems: 'center', justifyContent: 'center', zIndex: 4 },
  cameraFlipBtn: { position: 'absolute', top: 10, right: 10, width: 32, height: 32, borderRadius: 16, backgroundColor: 'rgba(15, 23, 42, 0.75)', alignItems: 'center', justifyContent: 'center', zIndex: 4 },
  loadingOverlay: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(15, 23, 42, 0.75)', alignItems: 'center', justifyContent: 'center', zIndex: 5 },
  loadingOverlayText: { color: '#ffffff', fontSize: 11, fontWeight: '600', marginTop: 8 },
  helperText: { fontSize: 10.5, color: '#64748b', marginTop: 6, textAlign: 'center' },
  utilityRow: { flexDirection: 'row', gap: 8, marginTop: 10 },
  rosterDrawerBtn: { flex: 1.5, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, backgroundColor: '#e6f0fa', borderRadius: 10, paddingVertical: 10, borderWidth: 1, borderColor: '#b8d6f0' },
  rosterDrawerBtnText: { fontSize: 11.5, fontWeight: '700', color: '#004b87' },
  manualBtn: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, backgroundColor: '#ffffff', borderRadius: 10, paddingVertical: 10, borderWidth: 1, borderColor: '#cbd5e1' },
  manualBtnText: { fontSize: 11.5, fontWeight: '700', color: '#334155' },
  btnDisabled: { opacity: 0.5 },
  modalBackdrop: { flex: 1, backgroundColor: 'rgba(15, 23, 42, 0.65)', justifyContent: 'center', alignItems: 'center', padding: 24 },
  pickerModalSheet: { width: '100%', maxHeight: '60%', backgroundColor: '#ffffff', borderRadius: 20, padding: 18 },
  pickerHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingBottom: 12, borderBottomWidth: 1, borderBottomColor: '#f1f5f9' },
  pickerTitle: { fontSize: 14.5, fontWeight: '800', color: '#0f172a' },
  sectionOption: { flexDirection: 'row', alignItems: 'center', paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: '#f1f5f9' },
  sectionOptionActive: { backgroundColor: '#f0f9ff', marginHorizontal: -18, paddingHorizontal: 18 },
  sectionOptionTitle: { fontSize: 13, fontWeight: '700', color: '#0f172a' },
  sectionOptionSub: { fontSize: 11, color: '#64748b', marginTop: 2 },
  rosterModalHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 18, paddingVertical: 14, borderBottomWidth: 1, borderBottomColor: '#f1f5f9' },
  rosterModalTitle: { fontSize: 16, fontWeight: '800', color: '#0f172a' },
  rosterModalSub: { fontSize: 11, color: '#64748b', marginTop: 1 },
  closeBtn: { padding: 4 },
  studentRosterRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: '#f1f5f9' },
  studentRowName: { fontSize: 13, fontWeight: '700', color: '#0f172a' },
  studentRowLrn: { fontSize: 11, color: '#64748b', marginTop: 1 },
  statusPillSmall: { paddingVertical: 4, paddingHorizontal: 8, borderRadius: 6 },
  statusPillSmallText: { fontSize: 9.5, fontWeight: '800' },
  inputModalSheet: { width: '100%', backgroundColor: '#ffffff', borderRadius: 20, padding: 18 },
  inputModalTitle: { fontSize: 15, fontWeight: '700', color: '#0f172a' },
  inputModalSub: { fontSize: 11.5, color: '#64748b', marginTop: 2, marginBottom: 12 },
  modalTextInput: { borderWidth: 1, borderColor: '#cbd5e1', borderRadius: 10, paddingHorizontal: 12, height: 42, fontSize: 13, backgroundColor: '#f8fafc', marginBottom: 12 },
  modalActionsRow: { flexDirection: 'row', justifyContent: 'flex-end', gap: 8 },
  cancelBtn: { paddingVertical: 8, paddingHorizontal: 12, borderRadius: 8, backgroundColor: '#f1f5f9' },
  cancelBtnText: { fontSize: 12, fontWeight: '600', color: '#475569' },
  submitBtn: { paddingVertical: 8, paddingHorizontal: 14, borderRadius: 8, backgroundColor: '#004b87' },
  submitBtnText: { fontSize: 12, fontWeight: '700', color: '#ffffff' },
  modalSheet: { width: '100%', backgroundColor: '#ffffff', borderRadius: 22, padding: 20, alignItems: 'center' },
  successHeadingGroup: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  modalHeadingText: { fontSize: 14, fontWeight: '800', color: '#065f46' },
  studentAvatarRing: { width: 64, height: 64, borderRadius: 32, backgroundColor: '#f0f9ff', borderWidth: 2, borderColor: '#004b87', alignItems: 'center', justifyContent: 'center', marginVertical: 10 },
  studentModalName: { fontSize: 15, fontWeight: '800', color: '#0f172a' },
  studentModalLrn: { fontSize: 11, color: '#64748b', marginTop: 1 },
  anomalyBanner: { flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: '#fef3c7', borderWidth: 1, borderColor: '#fde68a', paddingVertical: 8, paddingHorizontal: 12, borderRadius: 10, marginTop: 10 },
  anomalyBannerText: { flex: 1, fontSize: 10.5, color: '#92400e', fontWeight: '700' },
  statusPillLarge: { width: '100%', backgroundColor: '#ecfdf5', borderRadius: 10, paddingVertical: 8, alignItems: 'center', marginTop: 10 },
  statusPillTitle: { fontSize: 13, fontWeight: '800', color: '#047857' },
  statusPillTime: { fontSize: 10.5, color: '#065f46', marginTop: 1 },
  confirmModalBtn: { width: '100%', backgroundColor: '#004b87', borderRadius: 10, paddingVertical: 10, alignItems: 'center', marginTop: 14 },
  confirmModalBtnText: { color: '#ffffff', fontSize: 12, fontWeight: '700' },
});

export default ScannerScreen;