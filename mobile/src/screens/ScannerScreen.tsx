/**
 * AttendSure - Mobile Classroom QR Scanner Screen
 * File: mobile/src/screens/ScannerScreen.tsx
 */

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
import { getServerBaseUrl } from '../services/configService';
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
  photo_url?: string | null;
  parent_contact?: string;
  attendance_status: string;
}

interface SectionClass {
  schedule_id: number;
  section_id: number;
  section_name: string;
  grade_level?: string;
  subject_name: string;
  subject_code: string;
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
  status: string;
  is_anomaly: boolean;
  remarks: string;
  scan_time: string;
}

const extractLrnOrToken = (raw: string): string => {
  const clean = String(raw || '').trim().replace(/[\r\n\t]/g, '');
  if (clean.startsWith('{') && clean.endsWith('}')) {
    try {
      const parsed = JSON.parse(clean);
      return String(parsed.lrn || parsed.student_lrn || parsed.qr_token || parsed.id || clean).trim();
    } catch {}
  }
  if (clean.includes(':')) {
    return clean.split(':').pop()?.trim() || clean;
  }
  return clean;
};

export const ScannerScreen: React.FC = () => {
  const { user } = useAuth();
  const [permission, requestPermission] = useCameraPermissions();
  const [facing, setFacing] = useState<'back' | 'front'>('back');
  const [enableTorch, setEnableTorch] = useState<boolean>(false);
  const [isScanningLocked, setIsScanningLocked] = useState<boolean>(false);

  const [currentTime, setCurrentTime] = useState<string>('');
  const [currentDate, setCurrentDate] = useState<string>('');
  const [scanMode, setScanMode] = useState<'PRESENT' | 'LATE'>('PRESENT');
  const [vibrateEnabled, setVibrateEnabled] = useState<boolean>(true);
  const [soundEnabled, setSoundEnabled] = useState<boolean>(true);
  const [serverBase, setServerBase] = useState<string>('');

  const [sections, setSections] = useState<SectionClass[]>([]);
  const [activeSectionIndex, setActiveSectionIndex] = useState<number>(0);
  const [listLoading, setListLoading] = useState<boolean>(true);
  const [showStudentListModal, setShowStudentListModal] = useState<boolean>(false);
  const [showSectionPicker, setShowSectionPicker] = useState<boolean>(false);

  const [manualInputVisible, setManualInputVisible] = useState<boolean>(false);
  const [manualCode, setManualCode] = useState<string>('');
  const [scanLoading, setScanLoading] = useState<boolean>(false);
  const [modalVisible, setModalVisible] = useState<boolean>(false);
  const [lastScannedStudent, setLastScannedStudent] = useState<ScanResultData | null>(null);

  const [editingStudent, setEditingStudent] = useState<StudentItem | null>(null);
  const [editContact, setEditContact] = useState<string>('');
  const [editRfid, setEditRfid] = useState<string>('');
  const [savingProfile, setSavingProfile] = useState<boolean>(false);

  const lockTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const resolvePhotoUri = useCallback(
    (url?: string | null): string | undefined => {
      if (!url) return undefined;
      if (url.startsWith('http://') || url.startsWith('https://') || url.startsWith('data:image/')) {
        return url;
      }
      return `${serverBase.replace(/\/+$/, '')}/${url.replace(/^\/+/, '')}`;
    },
    [serverBase]
  );

  useEffect(() => {
    getServerBaseUrl().then((url) => setServerBase(url));
  }, []);

  useEffect(() => {
    const update = () => {
      const now = new Date();
      setCurrentTime(now.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', second: '2-digit' }));
      setCurrentDate(now.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' }));
    };
    update();
    const interval = setInterval(update, 1000);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    AsyncStorage.getItem('pref_sound_enabled').then((v) => v !== null && setSoundEnabled(v === 'true'));
    AsyncStorage.getItem('pref_haptic_enabled').then((v) => v !== null && setVibrateEnabled(v === 'true'));
  }, []);

  const toggleSound = async () => {
    const next = !soundEnabled;
    setSoundEnabled(next);
    AsyncStorage.setItem('pref_sound_enabled', String(next));
  };

  const fetchFacultyStudentList = useCallback(async () => {
    setListLoading(true);
    try {
      const res = await apiClient.get('classroom/class_list/');
      const raw = Array.isArray(res.data) ? res.data : res.data?.results || [];

      const normalized: SectionClass[] = raw.map((item: any, idx: number) => ({
        schedule_id: item.schedule_id || item.id || idx + 1,
        section_id: item.section_id || item.id || 0,
        section_name: item.section_name || item.name || 'Assigned Class',
        grade_level: item.grade_level || 'General',
        subject_name: item.subject_name || item.subject_title || 'Subject',
        subject_code: item.subject_code || '',
        room: item.room || item.room_number || 'Room',
        start_time: item.start_time || '07:30',
        end_time: item.end_time || '16:30',
        total_students: Array.isArray(item.students) ? item.students.length : item.total_students || 0,
        students: Array.isArray(item.students) ? item.students : [],
      }));

      setSections(normalized);
      if (normalized.length > 0 && activeSectionIndex >= normalized.length) {
        setActiveSectionIndex(0);
      }
    } catch {
      Alert.alert('Server Notice', 'Could not sync assigned classes.');
    } finally {
      setListLoading(false);
    }
  }, [activeSectionIndex]);

  useEffect(() => {
    fetchFacultyStudentList();
  }, [fetchFacultyStudentList]);

  const activeSection = sections[activeSectionIndex] || null;

  const unlockScanning = () => {
    if (lockTimerRef.current) clearTimeout(lockTimerRef.current);
    lockTimerRef.current = setTimeout(() => setIsScanningLocked(false), 1200);
  };

  const processStudentScan = async (rawCode: string) => {
    const cleanCode = extractLrnOrToken(rawCode);
    if (!cleanCode || isScanningLocked || scanLoading) return;

    if (!activeSection) {
      if (soundEnabled) await playScanErrorSound();
      Alert.alert('No Class Selected', 'Please select an assigned class first.');
      return;
    }

    setIsScanningLocked(true);
    setScanLoading(true);

    try {
      const res = await apiClient.post('classroom/batch-scan/', {
        schedule_id: activeSection.schedule_id,
        scans: [{ qr_token: cleanCode, status: scanMode }],
      });

      const processed = res.data?.processed_records?.[0];
      const isAnomaly = Boolean(processed?.is_anomaly);
      const resultingStatus = processed?.status || scanMode;

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
          const updated = sec.students.map((st) => {
            const matches =
              st.lrn === cleanCode ||
              st.qr_token === cleanCode ||
              st.rfid_uid?.toUpperCase() === cleanCode.toUpperCase() ||
              (processed && st.id === processed.student_id);
            return matches ? { ...st, attendance_status: resultingStatus } : st;
          });
          return { ...sec, students: updated };
        })
      );

      setLastScannedStudent({
        student_id: processed?.student_id,
        name: processed?.name || 'Student Verified',
        lrn: processed?.lrn || cleanCode,
        rfid_uid: processed?.rfid_uid || '',
        photo_url: resolvePhotoUri(processed?.photo_url) ?? null,
        parent_contact: processed?.parent_contact || '',
        status: resultingStatus,
        is_anomaly: isAnomaly,
        remarks: processed?.remarks || 'Attendance recorded successfully.',
        scan_time: processed?.scan_time || currentTime,
      });

      setModalVisible(true);
      setManualInputVisible(false);
      setManualCode('');
    } catch (err: any) {
      if (soundEnabled) await playScanErrorSound();
      if (vibrateEnabled) Vibration.vibrate([0, 100, 100, 100]);
      const msg = err?.response?.data?.detail || err?.response?.data?.error || 'Student scan failed.';
      Alert.alert('Scan Result', msg, [{ text: 'OK', onPress: unlockScanning }]);
    } finally {
      setScanLoading(false);
    }
  };

  const handleSaveStudentProfile = async () => {
    if (!editingStudent) return;
    setSavingProfile(true);

    try {
      const payload: Record<string, any> = { parent_contact: editContact.trim() };
      if (editRfid.trim()) payload.rfid_uid = editRfid.trim().toUpperCase();

      await apiClient.patch(`/students/${editingStudent.id}/`, payload);
      Alert.alert('Saved', 'Student profile updated.');

      setSections((prev) =>
        prev.map((sec) => ({
          ...sec,
          students: sec.students.map((s) =>
            s.id === editingStudent.id ? { ...s, parent_contact: editContact.trim(), rfid_uid: editRfid.trim().toUpperCase() } : s
          ),
        }))
      );
      setEditingStudent(null);
    } catch {
      Alert.alert('Error', 'Could not update student profile.');
    } finally {
      setSavingProfile(false);
    }
  };

  const currentStudents = activeSection?.students || [];
  const presentCount = currentStudents.filter((s) => s.attendance_status === 'PRESENT').length;
  const lateCount = currentStudents.filter((s) => s.attendance_status === 'LATE').length;
  const flaggedCount = currentStudents.filter((s) => s.attendance_status === 'UNVERIFIED' || s.attendance_status === 'CUTTING').length;
  const unscannedCount = currentStudents.filter((s) => s.attendance_status === 'UNSCANNED').length;

  return (
    <SafeAreaView style={styles.container} edges={['top', 'left', 'right']}>
      {/* 1. Terminal Clock & Mode Header */}
      <View style={styles.clockCard}>
        <View style={styles.clockTopRow}>
          <View style={styles.terminalIndicator}>
            <View style={styles.greenDot} />
            <Text style={styles.terminalIndicatorText}>CLASSROOM ATTENDANCE SCANNER</Text>
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
              <Text style={[styles.modeOptionText, scanMode === 'PRESENT' && { color: '#ffffff' }]}>ON-TIME</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.modeOptionBtn, scanMode === 'LATE' && styles.modeLateActive]}
              onPress={() => setScanMode('LATE')}
            >
              <Text style={[styles.modeOptionText, scanMode === 'LATE' && { color: '#ffffff' }]}>LATE</Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>

      {/* 2. Active Class Selection Banner */}
      {listLoading ? (
        <View style={styles.loadingBanner}>
          <ActivityIndicator size="small" color={COLORS.primary} />
          <Text style={styles.loadingBannerText}>Loading assigned classes and student lists...</Text>
        </View>
      ) : activeSection ? (
        <View style={styles.sectionHeaderBox}>
          <TouchableOpacity
            style={{ flex: 1 }}
            activeOpacity={0.8}
            onPress={() => sections.length > 1 && setShowSectionPicker(true)}
          >
            <Text style={styles.sectionMetaTag}>ACTIVE TEACHING SESSION</Text>
            <Text style={styles.activeSectionTitle} numberOfLines={1}>
              {`${activeSection.subject_name} • ${activeSection.section_name}`}
            </Text>
            <Text style={styles.sectionSubDetails}>
              {activeSection.room} ({activeSection.start_time} - {activeSection.end_time})
            </Text>
          </TouchableOpacity>

          <View style={styles.sectionActionsRow}>
            <TouchableOpacity style={styles.refreshIconBtn} onPress={fetchFacultyStudentList}>
              <Ionicons name="refresh" size={15} color={COLORS.primary} />
            </TouchableOpacity>

            {sections.length > 1 && (
              <TouchableOpacity style={styles.switchSectionBtn} onPress={() => setShowSectionPicker(true)}>
                <Ionicons name="swap-horizontal" size={14} color={COLORS.primary} />
                <Text style={styles.switchSectionBtnText}>Switch</Text>
              </TouchableOpacity>
            )}
          </View>
        </View>
      ) : (
        <View style={styles.emptySectionBanner}>
          <Ionicons name="alert-circle-outline" size={20} color="#b45309" />
          <Text style={styles.emptySectionTitle}>No teaching schedules found for your profile.</Text>
        </View>
      )}

      {/* 3. Real-Time Counter Chips */}
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
          <Text style={[styles.counterValue, { color: '#b91c1c' }]}>{flaggedCount}</Text>
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
              <Ionicons name="qr-code-outline" size={36} color="#94a3b8" />
              <Text style={styles.permissionText}>Optical scanning is ready. Point card QR or enter LRN below.</Text>
            </View>
          ) : !permission?.granted ? (
            <View style={styles.permissionBox}>
              <Ionicons name="camera-outline" size={32} color="#94a3b8" />
              <Text style={styles.permissionText}>Camera access required to scan student QR codes.</Text>
              <TouchableOpacity style={styles.grantBtn} onPress={requestPermission}>
                <Text style={styles.grantBtnText}>Grant Permission</Text>
              </TouchableOpacity>
            </View>
          ) : (
            <>
              <CameraView
                style={StyleSheet.absoluteFill}
                facing={facing}
                enableTorch={enableTorch}
                barcodeScannerSettings={{ barcodeTypes: ['qr', 'code128', 'code39'] }}
                onBarcodeScanned={isScanningLocked || scanLoading ? undefined : ({ data }) => processStudentScan(data)}
              />

              <View style={[styles.bracket, styles.bracketTL]} />
              <View style={[styles.bracket, styles.bracketTR]} />
              <View style={[styles.bracket, styles.bracketBL]} />
              <View style={[styles.bracket, styles.bracketBR]} />

              {scanLoading ? (
                <View style={styles.loadingOverlay}>
                  <ActivityIndicator size="large" color="#ffffff" />
                  <Text style={styles.loadingOverlayText}>Registering Attendance...</Text>
                </View>
              ) : (
                <View style={[styles.laserLine, scanMode === 'LATE' && { backgroundColor: '#f59e0b' }]} />
              )}

              <TouchableOpacity style={styles.soundToggleBtn} onPress={toggleSound}>
                <Ionicons name={soundEnabled ? 'volume-high' : 'volume-mute'} size={16} color="#ffffff" />
              </TouchableOpacity>
              <TouchableOpacity style={styles.torchToggleBtn} onPress={() => setEnableTorch((p) => !p)}>
                <Ionicons name={enableTorch ? 'flash' : 'flash-off-outline'} size={16} color={enableTorch ? '#fbbf24' : '#ffffff'} />
              </TouchableOpacity>
              <TouchableOpacity style={styles.cameraFlipBtn} onPress={() => setFacing((c) => (c === 'back' ? 'front' : 'back'))}>
                <Ionicons name="camera-reverse-outline" size={18} color="#ffffff" />
              </TouchableOpacity>
            </>
          )}
        </View>
        <Text style={styles.helperText}>Scan student QR card to mark {scanMode}</Text>
      </View>

      {/* 5. Utility Buttons */}
      <View style={styles.utilityRow}>
        <TouchableOpacity
          style={[styles.studentListBtn, !activeSection && styles.btnDisabled]}
          disabled={!activeSection}
          onPress={() => setShowStudentListModal(true)}
        >
          <Ionicons name="people-outline" size={16} color={COLORS.primary} />
          <Text style={styles.studentListBtnText}>
            Student List ({activeSection?.total_students || 0})
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

      {/* 6. Section Picker Modal */}
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
              renderItem={({ item, index }) => (
                <TouchableOpacity
                  style={[styles.sectionOption, index === activeSectionIndex && styles.sectionOptionActive]}
                  onPress={() => {
                    setActiveSectionIndex(index);
                    setShowSectionPicker(false);
                  }}
                >
                  <View style={{ flex: 1 }}>
                    <Text style={[styles.sectionOptionTitle, index === activeSectionIndex && { color: COLORS.primary }]}>
                      {item.subject_name} • {item.section_name}
                    </Text>
                    <Text style={styles.sectionOptionSub}>
                      {item.room} • {item.total_students} Enrolled Students
                    </Text>
                  </View>
                  {index === activeSectionIndex && <Ionicons name="checkmark-circle" size={20} color={COLORS.primary} />}
                </TouchableOpacity>
              )}
            />
          </View>
        </View>
      </Modal>

      {/* 7. Class Student List Modal */}
      <Modal visible={showStudentListModal} animationType="slide">
        <SafeAreaView style={{ flex: 1, backgroundColor: '#ffffff' }}>
          <View style={styles.studentListModalHeader}>
            <View>
              <Text style={styles.studentListModalTitle}>{activeSection?.section_name} Student List</Text>
              <Text style={styles.studentListModalSub}>Tap student to mark present, or tap pencil to edit</Text>
            </View>
            <TouchableOpacity onPress={() => setShowStudentListModal(false)} style={styles.closeBtn}>
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
              const photoUri = resolvePhotoUri(item.photo_url);

              return (
                <View style={styles.studentListRow}>
                  <TouchableOpacity
                    style={{ flexDirection: 'row', alignItems: 'center', flex: 1 }}
                    onPress={() => {
                      setShowStudentListModal(false);
                      processStudentScan(item.lrn);
                    }}
                  >
                    <View style={styles.studentAvatarBox}>
                      {photoUri ? (
                        <Image source={{ uri: photoUri }} style={styles.studentAvatarImg} contentFit="cover" />
                      ) : (
                        <Ionicons name="person" size={18} color="#94a3b8" />
                      )}
                    </View>

                    <View style={{ flex: 1, marginLeft: 10 }}>
                      <Text style={styles.studentRowName}>{item.full_name}</Text>
                      <Text style={styles.studentRowLrn}>LRN: {item.lrn}</Text>
                    </View>

                    <View
                      style={[
                        styles.statusPillSmall,
                        isPresent && { backgroundColor: '#ecfdf5' },
                        isLate && { backgroundColor: '#fffbeb' },
                        isFlagged && { backgroundColor: '#fef2f2' },
                        !isPresent && !isLate && !isFlagged && { backgroundColor: '#f1f5f9' },
                      ]}
                    >
                      <Text
                        style={[
                          styles.statusPillSmallText,
                          isPresent && { color: '#059669' },
                          isLate && { color: '#d97706' },
                          isFlagged && { color: '#dc2626' },
                          !isPresent && !isLate && !isFlagged && { color: '#64748b' },
                        ]}
                      >
                        {item.attendance_status}
                      </Text>
                    </View>
                  </TouchableOpacity>

                  <TouchableOpacity
                    style={styles.editStudentIconBtn}
                    onPress={() => {
                      setEditingStudent(item);
                      setEditContact(item.parent_contact || '');
                      setEditRfid(item.rfid_uid || '');
                    }}
                  >
                    <Ionicons name="create-outline" size={18} color={COLORS.primary} />
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
            <TextInput
              style={styles.modalTextInput}
              placeholder="12-digit Learner Reference Number"
              placeholderTextColor="#94a3b8"
              value={manualCode}
              onChangeText={setManualCode}
              keyboardType="numeric"
              maxLength={12}
            />
            <View style={styles.modalActionsRow}>
              <TouchableOpacity style={styles.cancelBtn} onPress={() => setManualInputVisible(false)}>
                <Text style={styles.cancelBtnText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.submitBtn}
                onPress={() => processStudentScan(manualCode)}
                disabled={scanLoading}
              >
                <Text style={styles.submitBtnText}>Verify LRN</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* 9. Scan Success / Anomaly Result Modal */}
      <Modal visible={modalVisible} transparent animationType="fade">
        <View style={styles.modalBackdrop}>
          <View style={styles.modalSheet}>
            <Ionicons
              name={lastScannedStudent?.is_anomaly ? 'warning' : 'checkmark-circle'}
              size={28}
              color={lastScannedStudent?.is_anomaly ? '#d97706' : '#10b981'}
            />
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
                lastScannedStudent?.is_anomaly && { backgroundColor: '#fef3c7' },
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

            <TouchableOpacity
              style={styles.confirmModalBtn}
              onPress={() => {
                setModalVisible(false);
                unlockScanning();
              }}
            >
              <Text style={styles.confirmModalBtnText}>Continue</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      {/* 10. Student Profile Quick Editor */}
      {editingStudent && (
        <Modal visible={Boolean(editingStudent)} transparent animationType="slide">
          <View style={styles.modalBackdrop}>
            <View style={styles.editProfileModalCard}>
              <Text style={styles.editProfileTitle}>Edit Student Details</Text>
              <Text style={{ fontSize: 13, fontWeight: '700', marginTop: 4 }}>{editingStudent.full_name}</Text>

              <Text style={styles.inputFieldLabel}>Parent Mobile Number (SMS Alerts):</Text>
              <TextInput
                style={styles.modalTextInput}
                value={editContact}
                onChangeText={setEditContact}
                placeholder="09XXXXXXXXX"
                keyboardType="phone-pad"
              />

              <Text style={styles.inputFieldLabel}>RFID UID (Optional):</Text>
              <TextInput
                style={styles.modalTextInput}
                value={editRfid}
                onChangeText={setEditRfid}
                placeholder="RFID Tag UID"
                autoCapitalize="characters"
              />

              <View style={styles.modalActionsRow}>
                <TouchableOpacity style={styles.cancelBtn} onPress={() => setEditingStudent(null)}>
                  <Text style={styles.cancelBtnText}>Cancel</Text>
                </TouchableOpacity>
                <TouchableOpacity style={styles.submitBtn} onPress={handleSaveStudentProfile} disabled={savingProfile}>
                  <Text style={styles.submitBtnText}>Save</Text>
                </TouchableOpacity>
              </View>
            </View>
          </View>
        </Modal>
      )}
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f8fafc', paddingHorizontal: 16 },
  clockCard: { backgroundColor: '#ffffff', borderRadius: 16, padding: 12, borderWidth: 1, borderColor: '#e2e8f0', marginTop: 4 },
  clockTopRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  terminalIndicator: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  greenDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: '#10b981' },
  terminalIndicatorText: { fontSize: 9, fontWeight: '800', color: '#004b87' },
  clockDate: { fontSize: 10, color: '#64748b', fontWeight: '600' },
  clockMainRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 4 },
  clockDigits: { fontSize: 22, fontWeight: '800', color: '#003460' },
  modeSwitchPill: { flexDirection: 'row', backgroundColor: '#f1f5f9', borderRadius: 8, padding: 2, borderWidth: 1, borderColor: '#e2e8f0' },
  modeOptionBtn: { paddingVertical: 4, paddingHorizontal: 10, borderRadius: 6 },
  modePresentActive: { backgroundColor: '#059669' },
  modeLateActive: { backgroundColor: '#d97706' },
  modeOptionText: { fontSize: 10, fontWeight: '800', color: '#64748b' },
  loadingBanner: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', backgroundColor: '#ffffff', borderRadius: 14, padding: 12, marginTop: 8, gap: 8 },
  loadingBannerText: { fontSize: 12, color: '#64748b', fontWeight: '600' },
  sectionHeaderBox: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#e6f0fa', borderRadius: 14, padding: 12, borderWidth: 1, borderColor: '#b8d6f0', marginTop: 8 },
  sectionMetaTag: { fontSize: 8.5, fontWeight: '800', color: '#004b87' },
  activeSectionTitle: { fontSize: 13.5, fontWeight: '800', color: '#0f172a' },
  sectionSubDetails: { fontSize: 10.5, color: '#475569', marginTop: 1 },
  sectionActionsRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  refreshIconBtn: { width: 30, height: 30, borderRadius: 8, backgroundColor: '#ffffff', alignItems: 'center', justifyContent: 'center' },
  switchSectionBtn: { flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: '#ffffff', paddingVertical: 6, paddingHorizontal: 10, borderRadius: 8 },
  switchSectionBtnText: { fontSize: 11, fontWeight: '700', color: '#004b87' },
  emptySectionBanner: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#fffbeb', borderRadius: 14, padding: 12, marginTop: 8, gap: 8 },
  emptySectionTitle: { fontSize: 12, fontWeight: '700', color: '#92400e' },
  counterRow: { flexDirection: 'row', gap: 6, marginTop: 8 },
  counterBox: { flex: 1, borderRadius: 12, padding: 8, borderWidth: 1, alignItems: 'center' },
  counterLabel: { fontSize: 8.5, fontWeight: '800' },
  counterValue: { fontSize: 17, fontWeight: '800', marginTop: 1 },
  viewfinderContainer: { alignItems: 'center', marginTop: 8 },
  cameraBox: { width: '100%', height: 215, borderRadius: 18, backgroundColor: '#0f172a', overflow: 'hidden', alignItems: 'center', justifyContent: 'center' },
  permissionBox: { padding: 20, alignItems: 'center' },
  permissionText: { fontSize: 11, color: '#cbd5e1', marginTop: 10, marginBottom: 12, textAlign: 'center' },
  grantBtn: { backgroundColor: '#004b87', paddingVertical: 8, paddingHorizontal: 14, borderRadius: 8 },
  grantBtnText: { color: '#ffffff', fontSize: 11, fontWeight: '700' },
  bracket: { position: 'absolute', width: 22, height: 22, borderColor: '#38bdf8' },
  bracketTL: { top: 14, left: 14, borderTopWidth: 3, borderLeftWidth: 3 },
  bracketTR: { top: 14, right: 14, borderTopWidth: 3, borderRightWidth: 3 },
  bracketBL: { bottom: 14, left: 14, borderBottomWidth: 3, borderLeftWidth: 3 },
  bracketBR: { bottom: 14, right: 14, borderBottomWidth: 3, borderRightWidth: 3 },
  laserLine: { width: '80%', height: 2, backgroundColor: '#38bdf8' },
  soundToggleBtn: { position: 'absolute', top: 10, left: 10, width: 32, height: 32, borderRadius: 16, backgroundColor: 'rgba(15, 23, 42, 0.75)', alignItems: 'center', justifyContent: 'center' },
  torchToggleBtn: { position: 'absolute', top: 10, left: 48, width: 32, height: 32, borderRadius: 16, backgroundColor: 'rgba(15, 23, 42, 0.75)', alignItems: 'center', justifyContent: 'center' },
  cameraFlipBtn: { position: 'absolute', top: 10, right: 10, width: 32, height: 32, borderRadius: 16, backgroundColor: 'rgba(15, 23, 42, 0.75)', alignItems: 'center', justifyContent: 'center' },
  loadingOverlay: { position: 'absolute', inset: 0, backgroundColor: 'rgba(15, 23, 42, 0.75)', alignItems: 'center', justifyContent: 'center' },
  loadingOverlayText: { color: '#ffffff', fontSize: 11, fontWeight: '600', marginTop: 8 },
  helperText: { fontSize: 10.5, color: '#64748b', marginTop: 6, fontWeight: '600' },
  utilityRow: { flexDirection: 'row', gap: 8, marginTop: 8 },
  studentListBtn: { flex: 1.5, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, backgroundColor: '#e6f0fa', borderRadius: 10, paddingVertical: 10, borderWidth: 1, borderColor: '#b8d6f0' },
  studentListBtnText: { fontSize: 11.5, fontWeight: '700', color: '#004b87' },
  manualBtn: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, backgroundColor: '#ffffff', borderRadius: 10, paddingVertical: 10, borderWidth: 1, borderColor: '#cbd5e1' },
  manualBtnText: { fontSize: 11.5, fontWeight: '700', color: '#334155' },
  btnDisabled: { opacity: 0.5 },
  modalBackdrop: { flex: 1, backgroundColor: 'rgba(15, 23, 42, 0.65)', justifyContent: 'center', alignItems: 'center', padding: 24 },
  pickerModalSheet: { width: '100%', maxHeight: '60%', backgroundColor: '#ffffff', borderRadius: 20, padding: 18 },
  pickerHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingBottom: 12, borderBottomWidth: 1, borderBottomColor: '#f1f5f9' },
  pickerTitle: { fontSize: 14.5, fontWeight: '800', color: '#0f172a' },
  sectionOption: { flexDirection: 'row', alignItems: 'center', paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: '#f1f5f9' },
  sectionOptionActive: { backgroundColor: '#f0f9ff' },
  sectionOptionTitle: { fontSize: 13, fontWeight: '700', color: '#0f172a' },
  sectionOptionSub: { fontSize: 11, color: '#64748b', marginTop: 2 },
  studentListModalHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: 16, borderBottomWidth: 1, borderBottomColor: '#f1f5f9' },
  studentListModalTitle: { fontSize: 16, fontWeight: '800', color: '#0f172a' },
  studentListModalSub: { fontSize: 11, color: '#64748b', marginTop: 1 },
  closeBtn: { padding: 4 },
  studentListRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: '#f1f5f9' },
  studentAvatarBox: { width: 38, height: 38, borderRadius: 19, backgroundColor: '#f1f5f9', alignItems: 'center', justifyContent: 'center', overflow: 'hidden' },
  studentAvatarImg: { width: '100%', height: '100%' },
  studentRowName: { fontSize: 13, fontWeight: '700', color: '#0f172a' },
  studentRowLrn: { fontSize: 11, color: '#64748b', marginTop: 1 },
  statusPillSmall: { paddingVertical: 4, paddingHorizontal: 8, borderRadius: 6 },
  statusPillSmallText: { fontSize: 9.5, fontWeight: '800' },
  editStudentIconBtn: { padding: 8 },
  inputModalSheet: { width: '100%', backgroundColor: '#ffffff', borderRadius: 20, padding: 18 },
  inputModalTitle: { fontSize: 15, fontWeight: '700', color: '#0f172a', marginBottom: 12 },
  inputFieldLabel: { fontSize: 11.5, fontWeight: '700', color: '#475569', marginTop: 8, marginBottom: 4 },
  modalTextInput: { borderWidth: 1, borderColor: '#cbd5e1', borderRadius: 10, paddingHorizontal: 12, height: 42, fontSize: 13, backgroundColor: '#f8fafc', marginBottom: 12 },
  modalActionsRow: { flexDirection: 'row', justifyContent: 'flex-end', gap: 8 },
  cancelBtn: { paddingVertical: 8, paddingHorizontal: 12, borderRadius: 8, backgroundColor: '#f1f5f9' },
  cancelBtnText: { fontSize: 12, fontWeight: '600', color: '#475569' },
  submitBtn: { paddingVertical: 8, paddingHorizontal: 14, borderRadius: 8, backgroundColor: '#004b87' },
  submitBtnText: { fontSize: 12, fontWeight: '700', color: '#ffffff' },
  modalSheet: { width: '100%', backgroundColor: '#ffffff', borderRadius: 22, padding: 20, alignItems: 'center' },
  studentModalName: { fontSize: 16, fontWeight: '800', color: '#0f172a', marginTop: 8 },
  studentModalLrn: { fontSize: 11.5, color: '#64748b', marginTop: 2 },
  statusPillLarge: { width: '100%', backgroundColor: '#ecfdf5', borderRadius: 10, paddingVertical: 8, alignItems: 'center', marginTop: 12 },
  statusPillTitle: { fontSize: 14, fontWeight: '800', color: '#047857' },
  statusPillTime: { fontSize: 11, color: '#065f46', marginTop: 1 },
  anomalyBanner: { flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: '#fef3c7', borderWidth: 1, borderColor: '#fde68a', paddingVertical: 8, paddingHorizontal: 12, borderRadius: 10, marginTop: 10 },
  anomalyBannerText: { flex: 1, fontSize: 10.5, color: '#92400e', fontWeight: '700' },
  confirmModalBtn: { width: '100%', backgroundColor: '#004b87', borderRadius: 10, paddingVertical: 11, alignItems: 'center', marginTop: 14 },
  confirmModalBtnText: { color: '#ffffff', fontSize: 12.5, fontWeight: '800' },
  editProfileModalCard: { width: '100%', backgroundColor: '#ffffff', borderRadius: 20, padding: 18 },
  editProfileTitle: { fontSize: 15, fontWeight: '800', color: '#0f172a' },
});

export default ScannerScreen;