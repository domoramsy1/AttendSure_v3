// D:\AttendSure_V3\mobile\src\screens\ScannerScreen.tsx

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
  Platform,
  ScrollView,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { CameraView, useCameraPermissions } from 'expo-camera';
import { Image } from 'expo-image';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { apiClient } from '../api/client';
import { useAuth } from '../context/AuthContext';
import { COLORS } from '../constants/theme';
import configService from '../services/configService';
import {
  playScanSuccessSound,
  playScanWarningSound,
  playScanErrorSound,
} from '../services/soundService';

interface StudentItem {
  id: number;
  lrn: string;
  qr_token: string;
  rfid_uid?: string;
  full_name: string;
  gender?: string;
  photo?: string | null;
  photo_url?: string | null;
  parent_contact?: string;
  guardian_name?: string;
  attendance_status: string;
}

interface SectionClass {
  schedule_id: number;
  section_id: number;
  section_name: string;
  grade_level?: string;
  subject_name: string;
  subject_code: string;
  faculty_name?: string;
  room: string;
  start_time?: string | null;
  end_time?: string | null;
  total_students: number;
  students: StudentItem[];
}

interface ScanResultData {
  student_id?: number;
  name: string;
  lrn: string;
  rfid_uid?: string;
  photo_url?: string | null;
  parent_contact?: string;
  section: string;
  status: string;
  is_anomaly: boolean;
  remarks: string;
  scan_time: string;
}

const formatTime = (timeStr?: string | null): string => {
  if (!timeStr || typeof timeStr !== 'string') return '--:--';
  return timeStr.slice(0, 5);
};

export const ScannerScreen: React.FC = () => {
  const { user } = useAuth();

  // Camera & Device Controls
  const [permission, requestPermission] = useCameraPermissions();
  const [facing, setFacing] = useState<'back' | 'front'>('back');
  const [enableTorch, setEnableTorch] = useState<boolean>(false);
  const [isScanningLocked, setIsScanningLocked] = useState<boolean>(false);

  // Time & Configuration
  const [currentTime, setCurrentTime] = useState<string>('');
  const [currentDate, setCurrentDate] = useState<string>('');
  const [scanMode, setScanMode] = useState<'PRESENT' | 'LATE'>('PRESENT');
  const [vibrateEnabled, setVibrateEnabled] = useState<boolean>(true);
  const [soundEnabled, setSoundEnabled] = useState<boolean>(true);
  const [serverBase, setServerBase] = useState<string>('');

  // Class Roster
  const [sections, setSections] = useState<SectionClass[]>([]);
  const [activeSectionIndex, setActiveSectionIndex] = useState<number>(0);
  const [listLoading, setRosterLoading] = useState<boolean>(true);
  const [showStudentListModal, setShowRosterDrawer] = useState<boolean>(false);
  const [showSectionPicker, setShowSectionPicker] = useState<boolean>(false);

  // Verification Results
  const [manualInputVisible, setManualInputVisible] = useState<boolean>(false);
  const [manualCode, setManualCode] = useState<string>('');
  const [scanLoading, setScanLoading] = useState<boolean>(false);
  const [modalVisible, setModalVisible] = useState<boolean>(false);
  const [lastScannedStudent, setLastScannedStudent] = useState<ScanResultData | null>(null);
  const [modalImageFailed, setModalImageFailed] = useState<boolean>(false);

  // Student Profile Edit Modal
  const [editingStudent, setEditingStudent] = useState<StudentItem | null>(null);
  const [editContact, setEditContact] = useState<string>('');
  const [editRfid, setEditRfid] = useState<string>('');
  const [savingProfile, setSavingProfile] = useState<boolean>(false);

  const lockTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Helper to ensure full URL for images
  const resolvePhotoUri = useCallback(
    (url?: string | null) => {
      if (!url) return null;
      if (url.startsWith('http://') || url.startsWith('https://') || url.startsWith('data:image/')) {
        return url;
      }
      const base = serverBase.replace(/\/+$/, '');
      const path = url.startsWith('/') ? url : `/${url}`;
      return `${base}${path}`;
    },
    [serverBase]
  );

  useEffect(() => {
    configService.getServerBaseUrl().then((url) => setServerBase(url));
  }, []);

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

  useEffect(() => {
    const loadPreferences = async () => {
      try {
        const storedSound = await AsyncStorage.getItem('pref_sound_enabled');
        const storedHaptic = await AsyncStorage.getItem('pref_haptic_enabled');
        if (storedSound !== null) setSoundEnabled(storedSound === 'true');
        if (storedHaptic !== null) setVibrateEnabled(storedHaptic === 'true');
      } catch {}
    };
    loadPreferences();
  }, []);

  const toggleSound = async () => {
    const nextVal = !soundEnabled;
    setSoundEnabled(nextVal);
    try {
      await AsyncStorage.setItem('pref_sound_enabled', String(nextVal));
    } catch {}
  };

  const fetchFacultyStudentList = useCallback(async () => {
    setRosterLoading(true);
    try {
      const res = await apiClient.get('/api/classroom/student_list/');
      const rawData = Array.isArray(res.data) ? res.data : [];

      const normalizedData: SectionClass[] = rawData.map((item: any) => ({
        schedule_id: item.schedule_id || item.id || 0,
        section_id: item.section_id || item.id || 0,
        section_name: item.section_name || item.name || 'Section',
        grade_level: item.grade_level || '—',
        subject_name: item.subject_name || item.subject_title || 'Subject',
        subject_code: item.subject_code || 'SUBJ',
        faculty_name: item.faculty_name || '',
        room: item.room || item.room_number || 'Room —',
        start_time: typeof item.start_time === 'string' ? item.start_time : '',
        end_time: typeof item.end_time === 'string' ? item.end_time : '',
        total_students: Array.isArray(item.students) ? item.students.length : Number(item.total_students) || 0,
        students: Array.isArray(item.students) ? item.students : [],
      }));

      setSections(normalizedData);
      if (normalizedData.length > 0 && activeSectionIndex >= normalizedData.length) {
        setActiveSectionIndex(0);
      }
    } catch {
      Alert.alert('Class List Notice', 'Unable to fetch assigned classroom sections from server.');
    } finally {
      setRosterLoading(false);
    }
  }, [activeSectionIndex]);

  useEffect(() => {
    fetchFacultyStudentList();
  }, [fetchFacultyStudentList]);

  const activeSection = sections[activeSectionIndex] || null;

  const unlockScanningDebounce = () => {
    if (lockTimerRef.current) clearTimeout(lockTimerRef.current);
    lockTimerRef.current = setTimeout(() => {
      setIsScanningLocked(false);
    }, 1500);
  };

  const isFacultyIdentifier = (code: string): boolean => {
    const clean = code.trim().toLowerCase();
    const myEmpId = (user?.faculty_id || (user as any)?.employee_id || '').toLowerCase();
    const myUsername = (user?.username || '').toLowerCase();
    const myQrToken = (user?.qr_token || '').toLowerCase();

    if (myEmpId && clean === myEmpId) return true;
    if (myUsername && clean === myUsername) return true;
    if (myQrToken && clean === myQrToken) return true;

    return clean.startsWith('emp-') || clean.startsWith('fac-') || clean.startsWith('staff-') || clean.startsWith('stf-');
  };

  const processStudentScan = async (rawCode: string) => {
    const cleanCode = rawCode ? String(rawCode).trim().replace(/[\r\n\t]/g, '').slice(0, 64) : '';
    if (!cleanCode) return;

    if (!activeSection) {
      if (soundEnabled) await playScanErrorSound();
      Alert.alert('No Class Available', 'You do not have any teaching sections assigned to your faculty profile.');
      return;
    }

    if (isFacultyIdentifier(cleanCode)) {
      if (soundEnabled) await playScanErrorSound();
      if (vibrateEnabled) Vibration.vibrate([0, 150, 100, 150]);
      Alert.alert('Faculty Pass Detected', 'Teacher identification cards cannot be used for student attendance logs.', [
        { text: 'OK', onPress: unlockScanningDebounce },
      ]);
      return;
    }

    const studentList = activeSection.students || [];
    let enrolledMatch = studentList.find(
      (s) =>
        (s.lrn && s.lrn.toLowerCase() === cleanCode.toLowerCase()) ||
        (s.qr_token && s.qr_token.toLowerCase() === cleanCode.toLowerCase()) ||
        (s.rfid_uid && s.rfid_uid.toLowerCase() === cleanCode.toLowerCase())
    );

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

      if (!enrolledMatch && processed) {
        enrolledMatch = studentList.find(
          (s) => s.lrn === processed.lrn || s.id === processed.student_id
        );
      }

      if (isAnomaly) {
        if (soundEnabled) await playScanWarningSound();
        if (vibrateEnabled) Vibration.vibrate([0, 200, 100, 200]);
      } else {
        if (soundEnabled) await playScanSuccessSound();
        if (vibrateEnabled) Vibration.vibrate(80);
      }

      setSections((prev) =>
        prev.map((sec, idx) => {
          if (idx !== activeSectionIndex) return sec;
          return {
            ...sec,
            students: (sec.students || []).map((st) => {
              const isTarget =
                (enrolledMatch && st.id === enrolledMatch.id) ||
                st.lrn === processed?.lrn ||
                st.qr_token === cleanCode;
              return isTarget ? { ...st, attendance_status: resultingStatus } : st;
            }),
          };
        })
      );

      const resolvedPhoto =
        processed?.photo_url ||
        enrolledMatch?.photo_url ||
        enrolledMatch?.photo ||
        null;

      setModalImageFailed(false);
      setLastScannedStudent({
        student_id: processed?.student_id || enrolledMatch?.id,
        name: processed?.name || enrolledMatch?.full_name || 'Learner',
        lrn: processed?.lrn || enrolledMatch?.lrn || cleanCode,
        rfid_uid: processed?.rfid_uid || enrolledMatch?.rfid_uid || '',
        photo_url: resolvePhotoUri(resolvedPhoto),
        parent_contact: processed?.parent_contact || enrolledMatch?.parent_contact || '',
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
      const msg =
        err?.response?.data?.error ||
        err?.response?.data?.detail ||
        `This student is not registered in ${activeSection.section_name}.`;
      Alert.alert('Student Not in Class', msg, [{ text: 'Continue', onPress: unlockScanningDebounce }]);
    } finally {
      setScanLoading(false);
    }
  };

  // Open Edit Profile for Student
  const handleOpenEditStudent = (st: StudentItem | null) => {
    if (!st) return;
    setEditingStudent(st);
    setEditContact(st.parent_contact || '');
    setEditRfid(st.rfid_uid || '');
  };

  // Save Student Profile Details
  const handleSaveStudentProfile = async () => {
    if (!editingStudent) return;
    setSavingProfile(true);

    try {
      const payload: Record<string, any> = {
        parent_contact: editContact.trim(),
      };
      if (editRfid.trim()) {
        payload.rfid_uid = editRfid.trim().toUpperCase();
      }

      const res = await apiClient.patch(`/api/students/${editingStudent.id}/`, payload);
      Alert.alert('Updated', 'Student profile details updated successfully.');

      // Update local state immediately
      setSections((prev) =>
        prev.map((sec) => ({
          ...sec,
          students: sec.students.map((s) =>
            s.id === editingStudent.id
              ? { ...s, parent_contact: editContact.trim(), rfid_uid: editRfid.trim().toUpperCase() }
              : s
          ),
        }))
      );

      if (lastScannedStudent && lastScannedStudent.student_id === editingStudent.id) {
        setLastScannedStudent((prev) =>
          prev
            ? { ...prev, parent_contact: editContact.trim(), rfid_uid: editRfid.trim().toUpperCase() }
            : null
        );
      }

      setEditingStudent(null);
    } catch (err: any) {
      Alert.alert('Save Error', err?.response?.data?.error || 'Could not update student profile.');
    } finally {
      setSavingProfile(false);
    }
  };

  const currentStudents = activeSection?.students || [];
  const presentCount = currentStudents.filter((s) => s.attendance_status === 'PRESENT').length;
  const lateCount = currentStudents.filter((s) => s.attendance_status === 'LATE').length;
  const anomalyCount = currentStudents.filter(
    (s) => s.attendance_status === 'UNVERIFIED' || s.attendance_status === 'CUTTING'
  ).length;
  const unscannedCount = currentStudents.filter((s) => s.attendance_status === 'UNSCANNED').length;

  return (
    <SafeAreaView style={styles.container} edges={['top', 'left', 'right']}>
      {/* 1. Terminal Clock & Scan Mode */}
      <View style={styles.clockCard}>
        <View style={styles.clockTopRow}>
          <View style={styles.terminalIndicator}>
            <View style={styles.greenDot} />
            <Text style={styles.terminalIndicatorText}>FACULTY CLASSROOM SCANNER</Text>
          </View>
          <Text style={styles.clockDate}>{currentDate}</Text>
        </View>

        <View style={styles.clockMainRow}>
          <Text style={styles.clockDigits}>{currentTime || '--:--:--'}</Text>

          <View style={styles.modeSwitchPill}>
            <TouchableOpacity
              style={[styles.modeOptionBtn, scanMode === 'PRESENT' && styles.modePresentActive]}
              onPress={() => setScanMode('PRESENT')}
            >
              <Text style={[styles.modeOptionText, scanMode === 'PRESENT' && { color: '#ffffff' }]}>
                ON-TIME
              </Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.modeOptionBtn, scanMode === 'LATE' && styles.modeLateActive]}
              onPress={() => setScanMode('LATE')}
            >
              <Text style={[styles.modeOptionText, scanMode === 'LATE' && { color: '#ffffff' }]}>
                LATE
              </Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>

      {/* 2. Assigned Class Selector Banner */}
      {listLoading ? (
        <View style={styles.loadingBanner}>
          <ActivityIndicator size="small" color={COLORS.primary} />
          <Text style={styles.loadingBannerText}>Synchronizing assigned teaching class lists...</Text>
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
              {activeSection.room || 'Room —'} ({formatTime(activeSection.start_time)} - {formatTime(activeSection.end_time)})
            </Text>
          </TouchableOpacity>

          <View style={styles.sectionActionsRow}>
            <TouchableOpacity
              style={styles.refreshIconBtn}
              onPress={fetchFacultyStudentList}
              accessibilityLabel="Reload Student List"
            >
              <Ionicons name="refresh" size={15} color={COLORS.primary} />
            </TouchableOpacity>

            {sections.length > 1 && (
              <TouchableOpacity
                style={styles.switchSectionBtn}
                onPress={() => setShowSectionPicker(true)}
              >
                <Ionicons name="swap-horizontal" size={14} color={COLORS.primary} />
                <Text style={styles.switchSectionBtnText}>Switch</Text>
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
              Your faculty profile does not have any active class schedules assigned.
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

        <View style={[styles.counterBox, { backgroundColor: '#fef2f2', borderColor: '#fecaca' }]}>
          <Text style={[styles.counterLabel, { color: '#dc2626' }]}>FLAGGED</Text>
          <Text style={[styles.counterValue, { color: '#b91c1c' }]}>{anomalyCount}</Text>
        </View>

        <View style={[styles.counterBox, { backgroundColor: '#f1f5f9', borderColor: '#e2e8f0' }]}>
          <Text style={[styles.counterLabel, { color: '#64748b' }]}>UNSCANNED</Text>
          <Text style={[styles.counterValue, { color: '#334155' }]}>{unscannedCount}</Text>
        </View>
      </View>

      {/* 4. Scanning Camera Viewfinder */}
      <View style={styles.viewfinderContainer}>
        <View style={styles.cameraBox}>
          {Platform.OS === 'web' ? (
            <View style={styles.permissionBox}>
              <Ionicons name="desktop-outline" size={36} color="#94a3b8" />
              <Text style={styles.permissionText}>
                Camera scanning is active. You can scan student QR passes directly or enter the 12-digit LRN below.
              </Text>
            </View>
          ) : !permission?.granted ? (
            <View style={styles.permissionBox}>
              <Ionicons name="camera-outline" size={32} color="#94a3b8" />
              <Text style={styles.permissionText}>Camera access is required to scan student QR passes</Text>
              <TouchableOpacity style={styles.grantBtn} onPress={requestPermission}>
                <Text style={styles.grantBtnText}>Grant Camera Permission</Text>
              </TouchableOpacity>
            </View>
          ) : (
            <>
              <CameraView
                style={styles.fullAbsoluteFill}
                facing={facing}
                enableTorch={enableTorch}
                barcodeScannerSettings={{ barcodeTypes: ['qr', 'code128', 'code39', 'ean13'] }}
                onBarcodeScanned={
                  isScanningLocked || scanLoading ? undefined : ({ data }) => processStudentScan(data)
                }
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
                <View
                  style={[
                    styles.laserLine,
                    scanMode === 'LATE' && { backgroundColor: '#f59e0b' },
                  ]}
                />
              )}

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

              <TouchableOpacity
                style={styles.torchToggleBtn}
                onPress={() => setEnableTorch((prev) => !prev)}
                accessibilityLabel="Toggle Flashlight"
              >
                <Ionicons
                  name={enableTorch ? 'flash' : 'flash-off-outline'}
                  size={16}
                  color={enableTorch ? '#fbbf24' : '#ffffff'}
                />
              </TouchableOpacity>

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
          {Platform.OS === 'web'
            ? `Logging attendance manually as ${scanMode}`
            : `Align student QR pass within viewfinder (Logging as ${scanMode})`}
        </Text>
      </View>

      {/* 5. Utility Controls */}
      <View style={styles.utilityRow}>
        <TouchableOpacity
          style={[styles.studentListBtn, !activeSection && styles.btnDisabled]}
          disabled={!activeSection}
          onPress={() => setShowRosterDrawer(true)}
        >
          <Ionicons name="people-outline" size={16} color={COLORS.primary} />
          <Text style={styles.studentListBtnText}>
            Class Student List ({activeSection?.total_students || activeSection?.students?.length || 0})
          </Text>
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

      {/* 6. Section Switcher Modal */}
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
                      <Text
                        style={[
                          styles.sectionOptionTitle,
                          isSelected && { color: COLORS.primary },
                        ]}
                      >
                        {item.subject_name} • {item.section_name}
                      </Text>
                      <Text style={styles.sectionOptionSub}>
                        {item.room || 'Room —'} • {item.total_students || item.students?.length || 0} Enrolled Students
                      </Text>
                    </View>
                    {isSelected && (
                      <Ionicons name="checkmark-circle" size={20} color={COLORS.primary} />
                    )}
                  </TouchableOpacity>
                );
              }}
            />
          </View>
        </View>
      </Modal>

      {/* 7. Class Student List Modal */}
      <Modal visible={showStudentListModal} animationType="slide">
        <SafeAreaView style={{ flex: 1, backgroundColor: '#ffffff' }}>
          <View style={styles.studentListModalHeader}>
            <View>
              <Text style={styles.studentListModalTitle}>{activeSection?.section_name} Students</Text>
              <Text style={styles.studentListModalSub}>
                Tap learner to mark {scanMode}, or tap the pencil icon to edit profile
              </Text>
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
              const isFlagged =
                item.attendance_status === 'UNVERIFIED' || item.attendance_status === 'CUTTING';
              const isUnscanned = item.attendance_status === 'UNSCANNED';
              const avatarUri = resolvePhotoUri(item.photo_url || item.photo);

              return (
                <View style={styles.studentListRow}>
                  <TouchableOpacity
                    style={{ flexDirection: 'row', alignItems: 'center', flex: 1 }}
                    onPress={() => {
                      setShowRosterDrawer(false);
                      processStudentScan(item.lrn);
                    }}
                  >
                    <View style={styles.studentAvatarBox}>
                      {avatarUri ? (
                        <Image
                          source={{ uri: avatarUri }}
                          style={styles.studentAvatarImg}
                          contentFit="cover"
                          transition={150}
                        />
                      ) : (
                        <Ionicons name="person" size={18} color="#94a3b8" />
                      )}
                    </View>

                    <View style={{ flex: 1, marginLeft: 10 }}>
                      <Text style={styles.studentRowName}>{item.full_name}</Text>
                      <Text style={styles.studentRowLrn}>
                        LRN: {item.lrn}
                        {item.rfid_uid ? ` • RFID: ${item.rfid_uid}` : ''}
                      </Text>
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
                  </TouchableOpacity>

                  {/* Edit Student Profile Button */}
                  <TouchableOpacity
                    style={styles.editStudentIconBtn}
                    onPress={() => handleOpenEditStudent(item)}
                  >
                    <Ionicons name="create-outline" size={18} color="#004b87" />
                  </TouchableOpacity>
                </View>
              );
            }}
          />
        </SafeAreaView>
      </Modal>

      {/* 8. Manual LRN Input Dialog */}
      <Modal visible={manualInputVisible} transparent animationType="fade">
        <View style={styles.modalBackdrop}>
          <View style={styles.inputModalSheet}>
            <Text style={styles.inputModalTitle}>Enter Student LRN</Text>
            <Text style={styles.inputModalSub}>
              Records attendance directly into {activeSection?.section_name}.
            </Text>

            <TextInput
              style={styles.modalTextInput}
              placeholder="Enter 12-digit Learner Reference Number"
              placeholderTextColor="#94a3b8"
              value={manualCode}
              onChangeText={setManualCode}
              keyboardType="numeric"
              maxLength={12}
              autoFocus={Platform.OS !== 'web'}
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

      {/* 9. Verification Result Modal with Real Image & Quick Edit */}
      <Modal visible={modalVisible} transparent animationType="fade">
        <View style={styles.modalBackdrop}>
          <View style={styles.modalSheet}>
            <View style={styles.successHeadingGroup}>
              <Ionicons
                name={lastScannedStudent?.is_anomaly ? 'warning' : 'checkmark-circle'}
                size={24}
                color={lastScannedStudent?.is_anomaly ? '#d97706' : '#10b981'}
              />
              <Text
                style={[
                  styles.modalHeadingText,
                  lastScannedStudent?.is_anomaly && { color: '#b45309' },
                ]}
              >
                {lastScannedStudent?.is_anomaly
                  ? 'Attendance Anomaly'
                  : `Logged in ${activeSection?.section_name}`}
              </Text>
            </View>

            {/* Real Student Image Circle */}
            <View
              style={[
                styles.studentAvatarRing,
                lastScannedStudent?.is_anomaly && { borderColor: '#d97706' },
              ]}
            >
              {lastScannedStudent?.photo_url && !modalImageFailed ? (
                <Image
                  source={{ uri: lastScannedStudent.photo_url }}
                  style={styles.studentAvatarImage}
                  contentFit="cover"
                  transition={200}
                  onError={() => setModalImageFailed(true)}
                />
              ) : (
                <Ionicons
                  name="person"
                  size={42}
                  color={lastScannedStudent?.is_anomaly ? '#d97706' : COLORS.primary}
                />
              )}
            </View>

            <Text style={styles.studentModalName}>{lastScannedStudent?.name}</Text>
            <Text style={styles.studentModalLrn}>
              LRN: {lastScannedStudent?.lrn}
              {lastScannedStudent?.rfid_uid ? ` • RFID: ${lastScannedStudent.rfid_uid}` : ''}
            </Text>

            {lastScannedStudent?.is_anomaly && (
              <View style={styles.anomalyBanner}>
                <Ionicons name="shield-outline" size={16} color="#b45309" />
                <Text style={styles.anomalyBannerText}>{lastScannedStudent.remarks}</Text>
              </View>
            )}

            <View
              style={[
                styles.statusPillLarge,
                lastScannedStudent?.is_anomaly && {
                  backgroundColor: '#fef3c7',
                  borderColor: '#fde68a',
                },
              ]}
            >
              <Text
                style={[
                  styles.statusPillTitle,
                  lastScannedStudent?.is_anomaly && { color: '#92400e' },
                ]}
              >
                {lastScannedStudent?.status}
              </Text>
              <Text style={styles.statusPillTime}>Recorded at {lastScannedStudent?.scan_time}</Text>
            </View>

            {/* Quick Edit Profile Trigger */}
            <TouchableOpacity
              style={styles.editProfileLink}
              onPress={() => {
                const matched = activeSection?.students.find((s) => s.lrn === lastScannedStudent?.lrn);
                if (matched) {
                  handleOpenEditStudent(matched);
                } else if (lastScannedStudent?.student_id) {
                  handleOpenEditStudent({
                    id: lastScannedStudent.student_id,
                    lrn: lastScannedStudent.lrn,
                    full_name: lastScannedStudent.name,
                    qr_token: '',
                    rfid_uid: lastScannedStudent.rfid_uid,
                    parent_contact: lastScannedStudent.parent_contact,
                    attendance_status: lastScannedStudent.status,
                  });
                }
              }}
            >
              <Ionicons name="create-outline" size={14} color="#004b87" />
              <Text style={styles.editProfileLinkText}>Update Student Photo or Profile</Text>
            </TouchableOpacity>

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

      {/* 10. Student Profile Quick Editor Modal */}
      {editingStudent && (
        <Modal visible={Boolean(editingStudent)} transparent animationType="slide">
          <View style={styles.modalBackdrop}>
            <View style={styles.editProfileModalCard}>
              <View style={styles.editProfileHeader}>
                <Text style={styles.editProfileTitle}>Edit Student Profile</Text>
                <TouchableOpacity onPress={() => setEditingStudent(null)}>
                  <Ionicons name="close" size={20} color="#64748b" />
                </TouchableOpacity>
              </View>

              <ScrollView showsVerticalScrollIndicator={false}>
                <View style={{ alignItems: 'center', marginVertical: 12 }}>
                  <View style={styles.studentAvatarRing}>
                    {editingStudent.photo_url || editingStudent.photo ? (
                      <Image
                        source={{ uri: resolvePhotoUri(editingStudent.photo_url || editingStudent.photo) }}
                        style={styles.studentAvatarImage}
                        contentFit="cover"
                      />
                    ) : (
                      <Ionicons name="person" size={38} color="#004b87" />
                    )}
                  </View>
                  <Text style={{ fontSize: 14, fontWeight: '800', color: '#0f172a', marginTop: 4 }}>
                    {editingStudent.full_name}
                  </Text>
                  <Text style={{ fontSize: 11, color: '#64748b' }}>LRN: {editingStudent.lrn}</Text>
                </View>

                <Text style={styles.inputFieldLabel}>Parent Mobile Contact (for SMS Alerts):</Text>
                <TextInput
                  style={styles.modalTextInput}
                  value={editContact}
                  onChangeText={setEditContact}
                  placeholder="09123456789"
                  keyboardType="phone-pad"
                />

                <Text style={styles.inputFieldLabel}>RFID Card UID (Optional):</Text>
                <TextInput
                  style={styles.modalTextInput}
                  value={editRfid}
                  onChangeText={setEditRfid}
                  placeholder="e.g. CE826413"
                  autoCapitalize="characters"
                />

                <View style={styles.modalActionsRow}>
                  <TouchableOpacity
                    style={styles.cancelBtn}
                    onPress={() => setEditingStudent(null)}
                  >
                    <Text style={styles.cancelBtnText}>Cancel</Text>
                  </TouchableOpacity>

                  <TouchableOpacity
                    style={[styles.submitBtn, savingProfile && { opacity: 0.6 }]}
                    onPress={handleSaveStudentProfile}
                    disabled={savingProfile}
                  >
                    {savingProfile ? (
                      <ActivityIndicator size="small" color="#ffffff" />
                    ) : (
                      <Text style={styles.submitBtnText}>Save Profile</Text>
                    )}
                  </TouchableOpacity>
                </View>
              </ScrollView>
            </View>
          </View>
        </Modal>
      )}
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f8fafc', paddingHorizontal: 16 },
  clockCard: {
    backgroundColor: '#ffffff',
    borderRadius: 16,
    paddingVertical: 10,
    paddingHorizontal: 14,
    borderWidth: 1,
    borderColor: '#e2e8f0',
    marginTop: 4,
  },
  clockTopRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  terminalIndicator: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  greenDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: '#10b981' },
  terminalIndicatorText: { fontSize: 9, fontWeight: '800', color: '#004b87', letterSpacing: 0.5 },
  clockDate: { fontSize: 10, color: '#64748b', fontWeight: '600' },
  clockMainRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 4,
  },
  clockDigits: { fontSize: 22, fontWeight: '800', color: '#003460', letterSpacing: -0.5 },
  modeSwitchPill: {
    flexDirection: 'row',
    backgroundColor: '#f1f5f9',
    borderRadius: 8,
    padding: 2,
    borderWidth: 1,
    borderColor: '#e2e8f0',
  },
  modeOptionBtn: { paddingVertical: 4, paddingHorizontal: 10, borderRadius: 6 },
  modePresentActive: { backgroundColor: '#059669' },
  modeLateActive: { backgroundColor: '#d97706' },
  modeOptionText: { fontSize: 10, fontWeight: '800', color: '#64748b' },
  loadingBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#ffffff',
    borderRadius: 14,
    padding: 12,
    borderWidth: 1,
    borderColor: '#e2e8f0',
    marginTop: 8,
    gap: 8,
  },
  loadingBannerText: { fontSize: 12, color: '#64748b', fontWeight: '600' },
  sectionHeaderBox: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#e6f0fa',
    borderRadius: 14,
    padding: 12,
    borderWidth: 1,
    borderColor: '#b8d6f0',
    marginTop: 8,
  },
  sectionMetaTag: { fontSize: 8.5, fontWeight: '800', color: '#004b87', letterSpacing: 0.5 },
  activeSectionTitle: { fontSize: 13.5, fontWeight: '800', color: '#0f172a', marginTop: 1 },
  sectionSubDetails: { fontSize: 10.5, color: '#475569', marginTop: 1 },
  sectionActionsRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  refreshIconBtn: {
    width: 30,
    height: 30,
    borderRadius: 8,
    backgroundColor: '#ffffff',
    alignItems: 'center',
    justifyContent: 'center',
  },
  switchSectionBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: '#ffffff',
    paddingVertical: 6,
    paddingHorizontal: 10,
    borderRadius: 8,
  },
  switchSectionBtnText: { fontSize: 11, fontWeight: '700', color: '#004b87' },
  emptySectionBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#fffbeb',
    borderRadius: 14,
    padding: 12,
    borderWidth: 1,
    borderColor: '#fde68a',
    marginTop: 8,
  },
  emptySectionTitle: { fontSize: 12.5, fontWeight: '700', color: '#92400e' },
  emptySectionSub: { fontSize: 10.5, color: '#b45309', marginTop: 2, lineHeight: 14 },
  counterRow: { flexDirection: 'row', gap: 6, marginTop: 8 },
  counterBox: { flex: 1, borderRadius: 12, padding: 8, borderWidth: 1, alignItems: 'center' },
  counterLabel: { fontSize: 8.5, fontWeight: '800', letterSpacing: 0.3 },
  counterValue: { fontSize: 17, fontWeight: '800', marginTop: 1 },
  viewfinderContainer: { alignItems: 'center', marginTop: 8 },
  cameraBox: {
    width: '100%',
    height: 215,
    borderRadius: 18,
    backgroundColor: '#0f172a',
    position: 'relative',
    overflow: 'hidden',
    alignItems: 'center',
    justifyContent: 'center',
  },
  fullAbsoluteFill: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 },
  permissionBox: { padding: 20, alignItems: 'center' },
  permissionText: { fontSize: 11, color: '#cbd5e1', marginTop: 10, marginBottom: 12, textAlign: 'center', lineHeight: 16 },
  grantBtn: { backgroundColor: '#004b87', paddingVertical: 8, paddingHorizontal: 14, borderRadius: 8 },
  grantBtnText: { color: '#ffffff', fontSize: 11, fontWeight: '700' },
  bracket: { position: 'absolute', width: 22, height: 22, borderColor: '#38bdf8', zIndex: 2 },
  bracketTL: { top: 14, left: 14, borderTopWidth: 3, borderLeftWidth: 3 },
  bracketTR: { top: 14, right: 14, borderTopWidth: 3, borderRightWidth: 3 },
  bracketBL: { bottom: 14, left: 14, borderBottomWidth: 3, borderLeftWidth: 3 },
  bracketBR: { bottom: 14, right: 14, borderBottomWidth: 3, borderRightWidth: 3 },
  laserLine: { width: '80%', height: 2, backgroundColor: '#38bdf8', zIndex: 2 },
  soundToggleBtn: {
    position: 'absolute',
    top: 10,
    left: 10,
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: 'rgba(15, 23, 42, 0.75)',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 4,
  },
  torchToggleBtn: {
    position: 'absolute',
    top: 10,
    left: 48,
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: 'rgba(15, 23, 42, 0.75)',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 4,
  },
  cameraFlipBtn: {
    position: 'absolute',
    top: 10,
    right: 10,
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: 'rgba(15, 23, 42, 0.75)',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 4,
  },
  loadingOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(15, 23, 42, 0.75)',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 5,
  },
  loadingOverlayText: { color: '#ffffff', fontSize: 11, fontWeight: '600', marginTop: 8 },
  helperText: { fontSize: 10.5, color: '#64748b', marginTop: 6, textAlign: 'center', fontWeight: '600' },
  utilityRow: { flexDirection: 'row', gap: 8, marginTop: 8 },
  studentListBtn: {
    flex: 1.5,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    backgroundColor: '#e6f0fa',
    borderRadius: 10,
    paddingVertical: 10,
    borderWidth: 1,
    borderColor: '#b8d6f0',
  },
  studentListBtnText: { fontSize: 11.5, fontWeight: '700', color: '#004b87' },
  manualBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    backgroundColor: '#ffffff',
    borderRadius: 10,
    paddingVertical: 10,
    borderWidth: 1,
    borderColor: '#cbd5e1',
  },
  manualBtnText: { fontSize: 11.5, fontWeight: '700', color: '#334155' },
  btnDisabled: { opacity: 0.5 },
  modalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(15, 23, 42, 0.65)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
  pickerModalSheet: {
    width: '100%',
    maxHeight: '60%',
    backgroundColor: '#ffffff',
    borderRadius: 20,
    padding: 18,
  },
  pickerHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingBottom: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#f1f5f9',
  },
  pickerTitle: { fontSize: 14.5, fontWeight: '800', color: '#0f172a' },
  sectionOption: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#f1f5f9',
  },
  sectionOptionActive: { backgroundColor: '#f0f9ff', marginHorizontal: -18, paddingHorizontal: 18 },
  sectionOptionTitle: { fontSize: 13, fontWeight: '700', color: '#0f172a' },
  sectionOptionSub: { fontSize: 11, color: '#64748b', marginTop: 2 },
  studentListModalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 18,
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: '#f1f5f9',
  },
  studentListModalTitle: { fontSize: 16, fontWeight: '800', color: '#0f172a' },
  studentListModalSub: { fontSize: 11, color: '#64748b', marginTop: 1 },
  closeBtn: { padding: 4 },
  studentListRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: '#f1f5f9',
  },
  studentAvatarBox: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: '#f1f5f9',
    borderWidth: 1,
    borderColor: '#e2e8f0',
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  studentAvatarImg: { width: '100%', height: '100%' },
  studentRowName: { fontSize: 13, fontWeight: '700', color: '#0f172a' },
  studentRowLrn: { fontSize: 11, color: '#64748b', marginTop: 1 },
  statusPillSmall: { paddingVertical: 4, paddingHorizontal: 8, borderRadius: 6 },
  statusPillSmallText: { fontSize: 9.5, fontWeight: '800' },
  editStudentIconBtn: { padding: 8, marginLeft: 4 },
  inputModalSheet: { width: '100%', backgroundColor: '#ffffff', borderRadius: 20, padding: 18 },
  inputModalTitle: { fontSize: 15, fontWeight: '700', color: '#0f172a' },
  inputModalSub: { fontSize: 11.5, color: '#64748b', marginTop: 2, marginBottom: 12 },
  inputFieldLabel: { fontSize: 11.5, fontWeight: '700', color: '#475569', marginBottom: 4 },
  modalTextInput: {
    borderWidth: 1,
    borderColor: '#cbd5e1',
    borderRadius: 10,
    paddingHorizontal: 12,
    height: 42,
    fontSize: 13,
    backgroundColor: '#f8fafc',
    marginBottom: 12,
    color: '#0f172a',
  },
  modalActionsRow: { flexDirection: 'row', justifyContent: 'flex-end', gap: 8, marginTop: 4 },
  cancelBtn: { paddingVertical: 8, paddingHorizontal: 12, borderRadius: 8, backgroundColor: '#f1f5f9' },
  cancelBtnText: { fontSize: 12, fontWeight: '600', color: '#475569' },
  submitBtn: { paddingVertical: 8, paddingHorizontal: 14, borderRadius: 8, backgroundColor: '#004b87' },
  submitBtnText: { fontSize: 12, fontWeight: '700', color: '#ffffff' },
  modalSheet: {
    width: '100%',
    backgroundColor: '#ffffff',
    borderRadius: 22,
    padding: 20,
    alignItems: 'center',
  },
  successHeadingGroup: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  modalHeadingText: { fontSize: 14, fontWeight: '800', color: '#065f46' },
  studentAvatarRing: {
    width: 84,
    height: 84,
    borderRadius: 42,
    backgroundColor: '#f0f9ff',
    borderWidth: 3,
    borderColor: '#004b87',
    alignItems: 'center',
    justifyContent: 'center',
    marginVertical: 12,
    overflow: 'hidden',
  },
  studentAvatarImage: { width: '100%', height: '100%' },
  studentModalName: { fontSize: 15.5, fontWeight: '800', color: '#0f172a', textAlign: 'center' },
  studentModalLrn: { fontSize: 11.5, color: '#64748b', marginTop: 2, fontWeight: '600' },
  anomalyBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: '#fef3c7',
    borderWidth: 1,
    borderColor: '#fde68a',
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 10,
    marginTop: 10,
  },
  anomalyBannerText: { flex: 1, fontSize: 10.5, color: '#92400e', fontWeight: '700' },
  statusPillLarge: {
    width: '100%',
    backgroundColor: '#ecfdf5',
    borderRadius: 10,
    paddingVertical: 8,
    alignItems: 'center',
    marginTop: 10,
  },
  statusPillTitle: { fontSize: 13, fontWeight: '800', color: '#047857' },
  statusPillTime: { fontSize: 10.5, color: '#065f46', marginTop: 1 },
  editProfileLink: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginTop: 12,
    paddingVertical: 4,
    paddingHorizontal: 8,
  },
  editProfileLinkText: { fontSize: 11.5, fontWeight: '700', color: '#004b87', textDecorationLine: 'underline' },
  confirmModalBtn: {
    width: '100%',
    backgroundColor: '#004b87',
    borderRadius: 10,
    paddingVertical: 11,
    alignItems: 'center',
    marginTop: 10,
  },
  confirmModalBtnText: { color: '#ffffff', fontSize: 12.5, fontWeight: '800' },
  editProfileModalCard: {
    width: '100%',
    maxHeight: '80%',
    backgroundColor: '#ffffff',
    borderRadius: 20,
    padding: 18,
  },
  editProfileHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingBottom: 10,
    borderBottomWidth: 1,
    borderBottomColor: '#f1f5f9',
  },
  editProfileTitle: { fontSize: 15, fontWeight: '800', color: '#0f172a' },
});

export default ScannerScreen;