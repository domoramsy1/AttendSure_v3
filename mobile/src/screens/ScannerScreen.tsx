/**
 * AttendSure Mobile - Dual-Mode Attendance & Verification Screen
 * Mode 1: Continuous Automatic Student QR Scanner (Built-In Back Camera) + Student Photo & Timestamp
 * Mode 2: Built-In Phone Fingerprint / Passkey Sensor Verification + 1-to-1 Phone Binding + Anti-Fake Campus GPS
 * File: mobile/src/screens/ScannerScreen.tsx
 */

import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ActivityIndicator,
  AppState,
  ScrollView,
  DeviceEventEmitter,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { CameraView, useCameraPermissions, type BarcodeScanningResult } from 'expo-camera';
import { Image } from 'expo-image';
import * as Location from 'expo-location';
import * as Crypto from 'expo-crypto';
import { Ionicons } from '@expo/vector-icons';
import { apiClient } from '../api/client';
import { ENDPOINTS } from '../api/endpoints';
import { useAuth } from '../context/AuthContext';
import { useThemeMode } from '../context/ThemeContext';
import {
  getFriendlyErrorMessage,
  SCANNER_OVERLAY_COLORS,
  type ThemePalette,
} from '../constants/theme';
import { canScanStudentQr } from '../utils/permissions';
import { getInitials, isCanceledError, resolveMediaUrl, showNotice } from '../utils/helpers';
import { getServerBaseUrl } from '../services/configService';
import { getOrCreateDeviceUuid } from '../services/deviceService';
import {
  enqueueOfflineQrScan,
  getQueuedQrScans,
  syncOfflineQrScans,
} from '../services/offlineQueue';
import {
  playScanErrorSound,
  playScanSuccessSound,
  playScanWarningSound,
} from '../services/soundService';
import { format12HourTime, getRealDeviceModel } from '../services/telemetryService';
import { setTeacherOnDutyFlag } from '../services/backgroundLocation';
import {
  checkPhoneLockCapability,
  verifyTeacherBiometricProof,
  type PhoneLockCapability,
} from '../services/biometricService';
import {
  formatDayOfWeekLabel,
  periodRunsOnJsDay,
} from '../services/scheduleAlarmService';

export const ATTENDANCE_UPDATED_EVENT = 'attendsure:attendance-updated';

export interface ScannerScreenProps {
  onBack?: () => void;
}

type ScannerMode = 'STUDENT_QR' | 'TEACHER_CHECKIN';
type CheckInAction = 'TIME_IN' | 'TIME_OUT';
type CheckInStep = 'IDLE' | 'BIOMETRIC' | 'GPS' | 'SAVING' | 'DONE';

interface ClassOption {
  schedule_id: number;
  section_name: string;
  subject_code: string;
  subject_title: string;
  time_display: string;
  day_of_week?: string;
}

interface ScanCardResult {
  ok: boolean;
  isDuplicate?: boolean;
  studentName: string;
  statusLabel: string;
  timestamp: string;
  photoUrl: string | null;
  errorDetail?: string;
}

const makeUuid = (): string => {
  if (typeof Crypto.randomUUID === 'function') {
    return Crypto.randomUUID();
  }
  return `scan-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
};

export const ScannerScreen: React.FC<ScannerScreenProps> = ({ onBack }) => {
  const insets = useSafeAreaInsets();
  const { user, refreshUser } = useAuth();
  const { palette, fonts } = useThemeMode();
  const styles = useMemo(() => createStyles(palette, fonts), [palette, fonts]);
  const [permission, requestPermission] = useCameraPermissions();

  const allowStudentQr = canScanStudentQr(user);
  const [mode, setMode] = useState<ScannerMode>(allowStudentQr ? 'STUDENT_QR' : 'TEACHER_CHECKIN');
  const [serverBase, setServerBase] = useState<string>('');
  const [scanPhotoFailed, setScanPhotoFailed] = useState<boolean>(false);

  useEffect(() => {
    if (!allowStudentQr && mode === 'STUDENT_QR') {
      setMode('TEACHER_CHECKIN');
    }
  }, [allowStudentQr, mode]);

  // Mode 1: Continuous Student Camera QR state
  const [classes, setClasses] = useState<ClassOption[]>([]);
  const [selectedPeriodId, setSelectedPeriodId] = useState<number | null>(null);
  const [queuedQrCount, setQueuedQrCount] = useState<number>(0);
  const [syncingQr, setSyncingQr] = useState<boolean>(false);
  const [qrBusy, setQrBusy] = useState<boolean>(false);
  const [lastScan, setLastScan] = useState<ScanCardResult | null>(null);

  // Mode 2: Phone Fingerprint / Screen Lock (PIN or Pattern) + Campus GPS state (NO front camera)
  const [checkInAction, setCheckInAction] = useState<CheckInAction>('TIME_IN');
  const [submittingCheckIn, setSubmittingCheckIn] = useState<boolean>(false);
  const [checkInStep, setCheckInStep] = useState<CheckInStep>('IDLE');
  const [lockCapability, setLockCapability] = useState<PhoneLockCapability | null>(null);
  const [statusMessage, setStatusMessage] = useState<string>(
    'Confirm with your phone lock inside the school boundary to record your Time In or Time Out. Zero face photos or fingerprint data are ever saved on the server.'
  );
  const [statusIsError, setStatusIsError] = useState<boolean>(false);
  const [lastCheckInTime, setLastCheckInTime] = useState<string | null>(null);

  const isMountedRef = useRef<boolean>(true);
  const abortRef = useRef<AbortController | null>(null);
  const recentQrMapRef = useRef<Map<string, number>>(new Map());
  const inFlightQrSetRef = useRef<Set<string>>(new Set());

  const phoneModelLabel = useMemo(() => getRealDeviceModel() || 'This Phone', []);

  const loadAssignedClasses = useCallback(async () => {
    try {
      const [clsRes, queued, base] = await Promise.all([
        apiClient.get(ENDPOINTS.ATTENDANCE_CLASSES, { params: { summary: '1' } }),
        getQueuedQrScans(),
        getServerBaseUrl(),
      ]);
      if (!isMountedRef.current) return;
      if (base) setServerBase(base);
      const todayJsDay = new Date().getDay();
      const raw = Array.isArray(clsRes.data) ? clsRes.data : clsRes.data?.results || [];
      const mapped: ClassOption[] = raw
        .filter((item: any) => item.subject_code !== 'ADV')
        .map((item: any) => ({
          schedule_id: Number(item.schedule_id || item.id),
          section_name: String(item.section_name || item.name || 'Section'),
          subject_code: String(item.subject_code || 'CLASS'),
          subject_title: String(item.subject_title || item.subject_name || 'Class'),
          time_display: String(item.time_display || ''),
          day_of_week: String(item.day_of_week || 'ALL_WEEKDAYS'),
        }));
      const list: ClassOption[] = [
        ...mapped.filter((c) => periodRunsOnJsDay(c.day_of_week, todayJsDay)),
        ...mapped.filter((c) => !periodRunsOnJsDay(c.day_of_week, todayJsDay)),
      ];
      setClasses(list);
      setSelectedPeriodId((prev) =>
        prev && list.some((c) => c.schedule_id === prev) ? prev : list[0]?.schedule_id || null
      );
      setQueuedQrCount(queued.length);
    } catch {
      const queued = await getQueuedQrScans().catch(() => []);
      if (isMountedRef.current) setQueuedQrCount(queued.length);
    }
  }, []);

  const refreshPhoneLockCapability = useCallback(() => {
    checkPhoneLockCapability()
      .then((info) => {
        if (isMountedRef.current) setLockCapability(info);
      })
      .catch(() => {});
  }, []);

  useEffect(() => {
    isMountedRef.current = true;
    if (allowStudentQr) {
      void loadAssignedClasses();
    } else {
      getServerBaseUrl()
        .then((base) => {
          if (isMountedRef.current && base) setServerBase(base);
        })
        .catch(() => {});
    }

    refreshPhoneLockCapability();

    // Re-check lock capability when returning from Android/iOS Settings -> Lock screen
    const appStateSub = AppState.addEventListener('change', (nextState) => {
      if (nextState === 'active') {
        refreshPhoneLockCapability();
      }
    });

    return () => {
      isMountedRef.current = false;
      appStateSub.remove();
      abortRef.current?.abort();
    };
  }, [loadAssignedClasses, allowStudentQr, refreshPhoneLockCapability]);

  useEffect(() => {
    if (mode === 'TEACHER_CHECKIN') {
      refreshPhoneLockCapability();
    }
  }, [mode, refreshPhoneLockCapability]);

  // Only ask for camera permission when using Student QR mode
  useEffect(() => {
    if (mode === 'STUDENT_QR' && permission && !permission.granted && permission.canAskAgain) {
      void requestPermission();
    }
  }, [mode, permission, requestPermission]);

  const handleSyncQueuedScans = async () => {
    if (syncingQr) return;
    setSyncingQr(true);
    try {
      const res = await syncOfflineQrScans();
      if (!isMountedRef.current) return;
      setQueuedQrCount(res.remaining);
      if (res.synced > 0) {
        DeviceEventEmitter.emit(ATTENDANCE_UPDATED_EVENT, { syncedCount: res.synced });
      }
      showNotice(
        'Saved Scans Uploaded',
        res.synced > 0
          ? `Uploaded ${res.synced} saved student scan(s). Remaining on phone: ${res.remaining}.`
          : 'Your phone is still offline. Saved scans remain safe on your phone and will sync automatically.'
      );
    } finally {
      if (isMountedRef.current) setSyncingQr(false);
    }
  };

  // Mode 1: Continuous automatic Student QR scanner (zero manual capture button)
  const handleStudentQrScanned = async (event: BarcodeScanningResult) => {
    if (mode !== 'STUDENT_QR') return;
    const rawQr = String(event.data || '').trim();
    if (!rawQr) return;

    const now = Date.now();
    recentQrMapRef.current.forEach((ts, key) => {
      if (now - ts > 10000) recentQrMapRef.current.delete(key);
    });

    // Per-QR 3-second duplicate cooldown so holding one card steady doesn't spam,
    // while the next student's QR card scans immediately with zero delay.
    const prevScanTs = recentQrMapRef.current.get(rawQr) || 0;
    if (now - prevScanTs < 3000 || inFlightQrSetRef.current.has(rawQr)) {
      return;
    }

    if (!selectedPeriodId) {
      recentQrMapRef.current.set(rawQr, now);
      setLastScan({
        ok: false,
        studentName: 'Select a Class Period First',
        statusLabel: '',
        timestamp: format12HourTime(new Date()),
        photoUrl: null,
        errorDetail: 'Tap your active class pill above before scanning.',
      });
      void playScanWarningSound();
      return;
    }

    recentQrMapRef.current.set(rawQr, now);
    inFlightQrSetRef.current.add(rawQr);
    setQrBusy(true);

    const scanUuid = makeUuid();
    try {
      const res = await apiClient.post(ENDPOINTS.ATTENDANCE_SCAN, {
        qr_text: rawQr,
        period_id: selectedPeriodId,
        client_scan_uuid: scanUuid,
      });
      if (!isMountedRef.current) return;

      const d = res.data || {};
      const resolvedPhoto = resolveMediaUrl(d.photo_url, serverBase);
      const scanTimestamp = String(d.scanned_at || '').trim() || format12HourTime(new Date());
      const duplicate = Boolean(d.is_duplicate);

      setScanPhotoFailed(false);
      setLastScan({
        ok: true,
        isDuplicate: duplicate,
        studentName: String(d.student_name || 'Student'),
        statusLabel: String(d.status || 'PRESENT'),
        timestamp: scanTimestamp,
        photoUrl: resolvedPhoto,
      });

      if (duplicate) {
        void playScanWarningSound();
      } else {
        void playScanSuccessSound();
      }

      DeviceEventEmitter.emit(ATTENDANCE_UPDATED_EVENT, {
        studentId: d.student_id,
        periodId: d.period_id || selectedPeriodId,
        status: d.status || 'PRESENT',
        scannedAt: scanTimestamp,
      });
    } catch (err: unknown) {
      if (!isMountedRef.current) return;
      const httpStatus = (err as { response?: { status?: number } })?.response?.status;
      const offlineTime = format12HourTime(new Date());

      if (!httpStatus) {
        const nextCount = await enqueueOfflineQrScan({
          client_scan_uuid: scanUuid,
          qr_token: rawQr,
          period_id: selectedPeriodId,
          scanned_at: new Date().toISOString(),
        });
        if (!isMountedRef.current) return;
        setQueuedQrCount(nextCount);
        setScanPhotoFailed(false);
        setLastScan({
          ok: true,
          isDuplicate: true,
          studentName: 'Saved on Phone',
          statusLabel: 'SAVED OFFLINE',
          timestamp: `${offlineTime} • Will sync automatically`,
          photoUrl: null,
        });
        void playScanWarningSound();
      } else {
        setLastScan({
          ok: false,
          studentName: 'Card Could Not Be Verified',
          statusLabel: '',
          timestamp: offlineTime,
          photoUrl: null,
          errorDetail: getFriendlyErrorMessage(
            err,
            'We could not verify this QR card. Please ask the student for their official AttendSure QR ID.'
          ),
        });
        void playScanErrorSound();
      }
    } finally {
      inFlightQrSetRef.current.delete(rawQr);
      if (isMountedRef.current) {
        setQrBusy(inFlightQrSetRef.current.size > 0);
      }
    }
  };

  // Mode 2: Phone Fingerprint / Passkey + 1-to-1 Phone Binding + Anti-Fake Campus GPS
  const handleTeacherBiometricCheckIn = async () => {
    if (submittingCheckIn) return;

    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    setSubmittingCheckIn(true);
    setStatusIsError(false);
    setCheckInStep('BIOMETRIC');
    setStatusMessage(
      lockCapability?.hasBiometric
        ? 'Step 1 of 3: Confirm your identity using your phone fingerprint or biometric lock...'
        : 'Step 1 of 3: Confirm your identity using your phone screen lock (PIN, Pattern, or Password)...'
    );

    try {
      const userId = user?.id ?? user?.username ?? 'teacher';
      const bioProof = await verifyTeacherBiometricProof(userId, checkInAction);
      if (!isMountedRef.current || controller.signal.aborted) return;

      if (!bioProof.ok || !bioProof.keyId || !bioProof.proofHash) {
        const errMsg =
          bioProof.error ||
          'No screen lock is set on this phone. Please go to your phone Settings -> Lock screen and set a PIN, Pattern, or Fingerprint first.';
        setCheckInStep('IDLE');
        setStatusIsError(true);
        setStatusMessage(errMsg);
        void playScanErrorSound();
        showNotice('Phone Lock Verification Needed', errMsg);
        return;
      }

      setCheckInStep('GPS');
      setStatusMessage('Step 2 of 3: Checking live campus GPS signal...');

      const { status } = await Location.requestForegroundPermissionsAsync();
      if (!isMountedRef.current || controller.signal.aborted) return;

      if (status !== 'granted') {
        const msg = 'Location permission is required to verify you are inside campus.';
        setCheckInStep('IDLE');
        setStatusIsError(true);
        setStatusMessage(msg);
        void playScanWarningSound();
        showNotice('Location Needed', 'Allow location access to verify school campus boundaries.');
        return;
      }

      const loc = await Location.getCurrentPositionAsync({
        accuracy: Location.Accuracy.BestForNavigation,
      });
      if (!isMountedRef.current || controller.signal.aborted) return;

      // Immediately block fake / mock GPS before calling the server API
      if (loc.mocked === true) {
        const msg =
          'A mock location setting is turned on. Please turn it off in phone Settings, then try again.';
        setCheckInStep('IDLE');
        setStatusIsError(true);
        setStatusMessage(msg);
        void playScanErrorSound();
        showNotice('Mock Location Active', msg);
        return;
      }

      const fixAgeSec = Math.abs(Date.now() - (loc.timestamp || Date.now())) / 1000;
      if (fixAgeSec > 90) {
        const msg =
          'Your GPS signal needs a quick refresh. Step near a window or outdoors and tap again.';
        setCheckInStep('IDLE');
        setStatusIsError(true);
        setStatusMessage(msg);
        void playScanWarningSound();
        showNotice('Refresh GPS Signal', msg);
        return;
      }

      if ((loc.coords.accuracy ?? 0) > 250) {
        const msg =
          'Your GPS signal is weak right now. Step near a window or outdoors and try again.';
        setCheckInStep('IDLE');
        setStatusIsError(true);
        setStatusMessage(msg);
        void playScanWarningSound();
        showNotice('Weak GPS Signal', msg);
        return;
      }

      setCheckInStep('SAVING');
      setStatusMessage('Step 3 of 3: Saving your verified attendance record...');

      const deviceId = await getOrCreateDeviceUuid();
      if (!isMountedRef.current || controller.signal.aborted) return;
      const deviceModel = getRealDeviceModel() || 'AttendSure Mobile';

      const res = await apiClient.post(
        ENDPOINTS.CAMPUS_CHECK_IN,
        {
          action: checkInAction,
          latitude: Number(loc.coords.latitude.toFixed(6)),
          longitude: Number(loc.coords.longitude.toFixed(6)),
          accuracy_meters: Number((loc.coords.accuracy ?? 15).toFixed(1)),
          speed_mps:
            loc.coords.speed !== null && loc.coords.speed !== undefined && loc.coords.speed >= 0
              ? Number(loc.coords.speed.toFixed(2))
              : null,
          gps_timestamp_ms: Math.round(loc.timestamp || Date.now()),
          device_id: deviceId,
          device_model: deviceModel,
          biometric_verified_on_device: true,
          biometric_key_id: bioProof.keyId,
          biometric_proof: bioProof.proofHash,
          biometric_method: bioProof.biometricMethod || 'BIOMETRIC',
          biometric_timestamp_ms: bioProof.timestampMs || Date.now(),
          is_mock_location: false,
        },
        { signal: controller.signal }
      );

      if (!isMountedRef.current || controller.signal.aborted) return;

      await setTeacherOnDutyFlag(checkInAction === 'TIME_IN');
      void playScanSuccessSound();
      void refreshUser();

      const recordedAt = String(res.data?.recorded_at || '').trim() || format12HourTime(new Date());
      setLastCheckInTime(recordedAt);
      setCheckInStep('DONE');
      setStatusIsError(false);

      DeviceEventEmitter.emit(ATTENDANCE_UPDATED_EVENT, {
        teacherCheckIn: checkInAction,
        recordedAt,
      });

      const replyMsg =
        typeof res.data?.message === 'string' && res.data.message.trim()
          ? res.data.message.trim()
          : checkInAction === 'TIME_IN'
          ? bioProof.biometricMethod === 'BIOMETRIC'
            ? 'Time In verified: Phone fingerprint & campus GPS confirmed.'
            : 'Time In verified: Phone screen lock & campus GPS confirmed.'
          : 'Time Out verified. Campus GPS tracking paused.';

      setStatusMessage(replyMsg);
      showNotice(checkInAction === 'TIME_IN' ? 'Timed In' : 'Timed Out', replyMsg);
    } catch (err: unknown) {
      if (!isMountedRef.current || isCanceledError(err)) return;
      void playScanErrorSound();
      const friendly = getFriendlyErrorMessage(
        err,
        'Move closer to a window or step inside the school boundary with your paired phone to complete Time In / Out.'
      );
      setCheckInStep('IDLE');
      setStatusIsError(true);
      setStatusMessage(friendly);
      showNotice('Could Not Complete Check-In', friendly);
    } finally {
      if (isMountedRef.current) {
        setSubmittingCheckIn(false);
      }
    }
  };

  const hasBiometricSensor = Boolean(lockCapability?.hasBiometric);
  const isPhoneLockReady = lockCapability ? lockCapability.ready : true;

  const stepActiveLabel =
    checkInStep === 'BIOMETRIC'
      ? hasBiometricSensor
        ? 'Confirming on Your Phone...'
        : 'Confirming Phone Screen Lock...'
      : checkInStep === 'GPS'
      ? 'Checking School Boundary...'
      : checkInStep === 'SAVING'
      ? 'Saving Your Attendance...'
      : checkInStep === 'DONE'
      ? `Saved at ${lastCheckInTime || format12HourTime(new Date())}`
      : lockCapability && !lockCapability.ready
      ? 'Screen Lock Not Set'
      : hasBiometricSensor
      ? 'Ready for Private Time In / Out'
      : lockCapability
      ? 'Ready — Screen Lock Active'
      : 'Checking Phone Security Lock...';

  const verifyButtonLabel = hasBiometricSensor
    ? checkInAction === 'TIME_IN'
      ? 'Verify Fingerprint & Time In'
      : 'Verify Fingerprint & Time Out'
    : checkInAction === 'TIME_IN'
    ? 'Verify Phone Lock & Time In'
    : 'Verify Phone Lock & Time Out';

  const isPhoneBound = Boolean(user?.has_bound_device || user?.bound_device_id);
  const isBiometricLocked = Boolean(user?.has_biometric_enrolled);

  return (
    <View style={styles.container}>
      {/* Header + Dual-Tab Mode Switch */}
      <View style={[styles.header, { paddingTop: Math.max(insets.top, 12) }]}>
        <View style={styles.headerRow}>
          {onBack && (
            <TouchableOpacity
              style={styles.backCircle}
              onPress={onBack}
              activeOpacity={0.75}
              accessibilityLabel="Go back"
            >
              <Ionicons name="arrow-back" size={20} color={palette.onPrimary} />
            </TouchableOpacity>
          )}
          <View style={{ flex: 1, marginLeft: onBack ? 10 : 0 }}>
            <Text style={styles.headerEyebrow}>
              {mode === 'STUDENT_QR'
                ? 'AUTO QR SCANNER MODE'
                : hasBiometricSensor
                ? 'PHONE BIOMETRIC + CAMPUS GPS'
                : 'PHONE LOCK + CAMPUS GPS'}
            </Text>
            <Text style={styles.headerTitle}>
              {mode === 'STUDENT_QR' ? 'Student Camera QR Scan' : 'Teacher Time In / Out'}
            </Text>
          </View>
        </View>

        {allowStudentQr && (
          <View style={styles.segmentWrap}>
            <TouchableOpacity
              style={[styles.segmentBtn, mode === 'STUDENT_QR' && styles.segmentBtnActive]}
              onPress={() => setMode('STUDENT_QR')}
              activeOpacity={0.85}
            >
              <Ionicons
                name="qr-code-outline"
                size={15}
                color={mode === 'STUDENT_QR' ? palette.primary : palette.onPrimary}
              />
              <Text
                style={[styles.segmentText, mode === 'STUDENT_QR' && styles.segmentTextActive]}
              >
                Student QR
              </Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.segmentBtn, mode === 'TEACHER_CHECKIN' && styles.segmentBtnActive]}
              onPress={() => setMode('TEACHER_CHECKIN')}
              activeOpacity={0.85}
            >
              <Ionicons
                name="finger-print-outline"
                size={16}
                color={mode === 'TEACHER_CHECKIN' ? palette.primary : palette.onPrimary}
              />
              <Text
                style={[
                  styles.segmentText,
                  mode === 'TEACHER_CHECKIN' && styles.segmentTextActive,
                ]}
              >
                Teacher Time In / Out
              </Text>
            </TouchableOpacity>
          </View>
        )}
      </View>

      {mode === 'STUDENT_QR' ? (
        <View style={[styles.body, { paddingBottom: Math.max(insets.bottom, 12) + 92 }]}>
          {/* Mode 1: Class Period Pills + Offline Queue Sync */}
          <View style={{ gap: 8 }}>
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={{ gap: 6 }}
            >
              {classes.length === 0 ? (
                <View style={styles.periodPill}>
                  <Text style={styles.periodPillText}>
                    No class periods scheduled yet — check Academic Setup
                  </Text>
                </View>
              ) : (
                classes.map((cls) => {
                  const active = selectedPeriodId === cls.schedule_id;
                  const runsToday = periodRunsOnJsDay(cls.day_of_week, new Date().getDay());
                  const dayTag = formatDayOfWeekLabel(cls.day_of_week);
                  const suffix = runsToday
                    ? cls.day_of_week && cls.day_of_week !== 'ALL_WEEKDAYS'
                      ? ` (${dayTag})`
                      : ''
                    : ` • ${dayTag} (Off-Day)`;
                  return (
                    <TouchableOpacity
                      key={String(cls.schedule_id)}
                      style={[
                        styles.periodPill,
                        active && styles.periodPillActive,
                        !runsToday && !active && { opacity: 0.72 },
                      ]}
                      onPress={() => setSelectedPeriodId(cls.schedule_id)}
                    >
                      <Text style={[styles.periodPillText, active && styles.periodPillTextActive]}>
                        {cls.section_name} • {cls.subject_code}
                        {suffix}
                      </Text>
                    </TouchableOpacity>
                  );
                })
              )}
            </ScrollView>

            {queuedQrCount > 0 && (
              <TouchableOpacity
                style={styles.offlineQueueBar}
                onPress={() => void handleSyncQueuedScans()}
                disabled={syncingQr}
              >
                <Ionicons name="cloud-upload-outline" size={16} color={palette.warning} />
                <Text style={styles.offlineQueueText}>
                  {queuedQrCount} scan(s) saved safely on phone — tap to sync now
                </Text>
                {syncingQr && <ActivityIndicator size="small" color={palette.warning} />}
              </TouchableOpacity>
            )}
          </View>

          {/* Mode 1: Continuous Automatic Back Camera QR Scanner */}
          <View style={styles.cameraCard}>
            {permission?.granted ? (
              <CameraView
                style={styles.cameraView}
                facing="back"
                autofocus="on"
                barcodeScannerSettings={{ barcodeTypes: ['qr'] }}
                onBarcodeScanned={(res) => void handleStudentQrScanned(res)}
              >
                <View style={styles.qrOverlay}>
                  <View
                    style={[
                      styles.qrReticle,
                      qrBusy && { borderColor: SCANNER_OVERLAY_COLORS.activeRing },
                    ]}
                  />
                  <View style={styles.autoScanPill}>
                    <View
                      style={[
                        styles.livePulseDot,
                        { backgroundColor: SCANNER_OVERLAY_COLORS.activeRing },
                      ]}
                    />
                    <Text style={styles.qrOverlayHint}>
                      {qrBusy
                        ? 'Scanning QR ID...'
                        : 'Auto-Scanner Active • Place QR ID in frame'}
                    </Text>
                  </View>
                </View>
              </CameraView>
            ) : (
              <View style={styles.permissionFallback}>
                <Ionicons name="camera-outline" size={44} color={palette.onPrimary} />
                <Text style={styles.permissionText}>
                  Built-in camera access is required for automatic student QR attendance scanning.
                </Text>
                <TouchableOpacity
                  style={styles.grantBtn}
                  onPress={() => void requestPermission()}
                  activeOpacity={0.85}
                >
                  <Text style={styles.grantBtnText}>Allow Camera</Text>
                </TouchableOpacity>
              </View>
            )}
          </View>

          {/* Mode 1 Result Card: Student Photo + Name (STATUS) + ONLY Timestamp below */}
          {lastScan ? (
            <View
              style={[
                styles.scanResultCard,
                {
                  backgroundColor: !lastScan.ok
                    ? palette.dangerLight
                    : lastScan.isDuplicate
                    ? palette.warningLight
                    : palette.successLight,
                  borderColor: !lastScan.ok
                    ? palette.danger
                    : lastScan.isDuplicate
                    ? palette.warning
                    : palette.success,
                },
              ]}
            >
              <View
                style={[
                  styles.studentPhotoCircle,
                  {
                    borderColor: !lastScan.ok
                      ? palette.danger
                      : lastScan.isDuplicate
                      ? palette.warning
                      : palette.success,
                    backgroundColor: palette.surface,
                  },
                ]}
              >
                {lastScan.photoUrl && !scanPhotoFailed ? (
                  <Image
                    source={{ uri: lastScan.photoUrl }}
                    style={styles.studentPhotoImg}
                    contentFit="cover"
                    cachePolicy="memory-disk"
                    onError={() => setScanPhotoFailed(true)}
                  />
                ) : lastScan.ok ? (
                  <Text style={[styles.studentInitialsText, { color: palette.primary }]}>
                    {getInitials(lastScan.studentName)}
                  </Text>
                ) : (
                  <Ionicons name="alert-circle" size={24} color={palette.danger} />
                )}
              </View>

              <View style={{ flex: 1 }}>
                <Text
                  style={[
                    styles.instructionTitle,
                    {
                      color: !lastScan.ok
                        ? palette.danger
                        : lastScan.isDuplicate
                        ? palette.warning
                        : palette.success,
                    },
                  ]}
                  numberOfLines={1}
                >
                  {lastScan.statusLabel
                    ? `${lastScan.studentName} (${
                        lastScan.statusLabel === 'SAVED OFFLINE'
                          ? 'SAVED OFFLINE'
                          : lastScan.isDuplicate
                          ? `${lastScan.statusLabel} • ALREADY SCANNED`
                          : lastScan.statusLabel
                      })`
                    : lastScan.studentName}
                </Text>

                {/* Strictly ONLY the timestamp on valid scans */}
                <Text style={styles.timestampOnlyText} numberOfLines={2}>
                  {lastScan.ok ? lastScan.timestamp : lastScan.errorDetail || lastScan.timestamp}
                </Text>
              </View>
            </View>
          ) : (
            <View style={styles.instructionBox}>
              <Text style={styles.instructionTitle}>Ready — Automatic QR Scanner Active</Text>
              <Text style={styles.instructionText}>
                Hold any student QR ID card in front of the camera for instant real-time attendance.
              </Text>
            </View>
          )}
        </View>
      ) : (
        /* Mode 2: Phone Fingerprint / Passkey + Campus GPS Check-In (NO Front Camera) */
        <ScrollView
          style={styles.biometricScroll}
          contentContainerStyle={[
            styles.biometricScrollContent,
            { paddingBottom: Math.max(insets.bottom, 16) + 96 },
          ]}
          showsVerticalScrollIndicator={false}
        >
          {/* Time In / Time Out Toggle */}
          <View style={styles.actionRow}>
            {(['TIME_IN', 'TIME_OUT'] as const).map((act) => {
              const active = checkInAction === act;
              return (
                <TouchableOpacity
                  key={act}
                  style={[styles.actionChip, active && styles.actionChipActive]}
                  onPress={() => {
                    setCheckInAction(act);
                    if (checkInStep === 'DONE') setCheckInStep('IDLE');
                  }}
                  disabled={submittingCheckIn}
                >
                  <Ionicons
                    name={act === 'TIME_IN' ? 'log-in-outline' : 'log-out-outline'}
                    size={15}
                    color={active ? palette.onPrimary : palette.textSecondary}
                  />
                  <Text style={[styles.actionChipText, active && styles.actionChipTextActive]}>
                    {act === 'TIME_IN' ? 'Time In (Start Duty)' : 'Time Out (End Duty)'}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </View>

          {/* Theme-Aware Phone Lock / Biometric Verification Card */}
          <View style={styles.biometricCard}>
            <View
              style={[
                styles.biometricIconRing,
                {
                  backgroundColor:
                    checkInStep === 'DONE'
                      ? palette.successLight
                      : statusIsError
                      ? palette.dangerLight
                      : !isPhoneLockReady
                      ? palette.warningLight
                      : hasBiometricSensor
                      ? palette.primarySoft
                      : palette.successLight,
                  borderColor:
                    checkInStep === 'DONE'
                      ? palette.success
                      : statusIsError
                      ? palette.danger
                      : !isPhoneLockReady
                      ? palette.warning
                      : hasBiometricSensor
                      ? palette.primary
                      : palette.success,
                },
              ]}
            >
              {submittingCheckIn ? (
                <ActivityIndicator size="large" color={palette.primary} />
              ) : (
                <Ionicons
                  name={
                    checkInStep === 'DONE'
                      ? 'shield-checkmark'
                      : !isPhoneLockReady
                      ? 'lock-open-outline'
                      : hasBiometricSensor
                      ? 'finger-print-outline'
                      : 'shield-checkmark-outline'
                  }
                  size={44}
                  color={
                    checkInStep === 'DONE'
                      ? palette.success
                      : statusIsError
                      ? palette.danger
                      : !isPhoneLockReady
                      ? palette.warning
                      : hasBiometricSensor
                      ? palette.primary
                      : palette.success
                  }
                />
              )}
            </View>

            <Text style={styles.biometricTitle}>
              {hasBiometricSensor
                ? 'Private On-Phone Check & School Boundary'
                : 'Phone Screen Lock & School Boundary'}
            </Text>
            <Text style={styles.biometricSubtitle}>
              Your privacy is protected: identity check stays strictly on your phone for effortless
              proof of service. Zero raw face photos or fingerprint data are ever saved on the
              school server.
            </Text>

            {/* Bound Phone & Security Lock Status Badges */}
            <View style={styles.statusGrid}>
              <View style={styles.statusInfoRow}>
                <View style={styles.statusInfoLeft}>
                  <Ionicons name="phone-portrait-outline" size={16} color={palette.primary} />
                  <Text style={styles.statusInfoLabel}>Bound Phone</Text>
                </View>
                <View
                  style={[
                    styles.statusPill,
                    {
                      backgroundColor: isPhoneBound
                        ? palette.successLight
                        : palette.warningLight,
                    },
                  ]}
                >
                  <Text
                    style={[
                      styles.statusPillText,
                      { color: isPhoneBound ? palette.success : palette.warning },
                    ]}
                    numberOfLines={1}
                  >
                    {isPhoneBound ? `Linked • ${phoneModelLabel}` : 'Pairs on Time In'}
                  </Text>
                </View>
              </View>

              <View style={styles.statusInfoRow}>
                <View style={styles.statusInfoLeft}>
                  <Ionicons
                    name={hasBiometricSensor ? 'finger-print-outline' : 'lock-closed-outline'}
                    size={16}
                    color={palette.primary}
                  />
                  <Text style={styles.statusInfoLabel}>Phone Lock</Text>
                </View>
                <View
                  style={[
                    styles.statusPill,
                    {
                      backgroundColor:
                        lockCapability?.ready
                          ? palette.successLight
                          : lockCapability
                          ? palette.warningLight
                          : palette.surfaceSubtle,
                    },
                  ]}
                >
                  <Text
                    style={[
                      styles.statusPillText,
                      {
                        color: lockCapability?.ready
                          ? palette.success
                          : lockCapability
                          ? palette.warning
                          : palette.textSecondary,
                      },
                    ]}
                    numberOfLines={1}
                  >
                    {lockCapability ? lockCapability.modeLabel : 'Checking Lock...'}
                  </Text>
                </View>
              </View>

              <View style={[styles.statusInfoRow, { borderBottomWidth: 0, paddingBottom: 0 }]}>
                <View style={styles.statusInfoLeft}>
                  <Ionicons name="key-outline" size={16} color={palette.primary} />
                  <Text style={styles.statusInfoLabel}>1-to-1 Key Lock</Text>
                </View>
                <View
                  style={[
                    styles.statusPill,
                    {
                      backgroundColor: isBiometricLocked
                        ? palette.successLight
                        : palette.primarySoft,
                    },
                  ]}
                >
                  <Text
                    style={[
                      styles.statusPillText,
                      { color: isBiometricLocked ? palette.success : palette.primary },
                    ]}
                  >
                    {isBiometricLocked ? 'Active on Account' : 'Locks on First Time In'}
                  </Text>
                </View>
              </View>
            </View>

            {/* Live Step Status Banner */}
            <View
              style={[
                styles.liveStepBanner,
                {
                  backgroundColor: statusIsError
                    ? palette.dangerLight
                    : checkInStep === 'DONE' || (checkInStep === 'IDLE' && lockCapability?.ready)
                    ? palette.successLight
                    : !isPhoneLockReady
                    ? palette.warningLight
                    : palette.surfaceSubtle,
                  borderColor: statusIsError
                    ? palette.danger
                    : checkInStep === 'DONE' || (checkInStep === 'IDLE' && lockCapability?.ready)
                    ? palette.success
                    : !isPhoneLockReady
                    ? palette.warning
                    : palette.border,
                },
              ]}
            >
              <Text
                style={[
                  styles.liveStepTitle,
                  {
                    color: statusIsError
                      ? palette.danger
                      : checkInStep === 'DONE' || (checkInStep === 'IDLE' && lockCapability?.ready)
                      ? palette.success
                      : !isPhoneLockReady
                      ? palette.warning
                      : palette.primary,
                  },
                ]}
              >
                {stepActiveLabel}
              </Text>
              <Text style={styles.instructionText}>{statusMessage}</Text>
            </View>

            {/* Setup Warning ONLY when phone has NO screen lock at all (SecurityLevel.NONE) */}
            {lockCapability && !lockCapability.ready && lockCapability.setupMessage ? (
              <View style={styles.setupWarningBox}>
                <Ionicons name="information-circle-outline" size={18} color={palette.warning} />
                <Text style={styles.setupWarningText}>{lockCapability.setupMessage}</Text>
              </View>
            ) : null}

            {/* Primary Phone Lock / Fingerprint Verification Button */}
            <TouchableOpacity
              style={[styles.captureBtn, submittingCheckIn && { opacity: 0.7 }]}
              onPress={() => void handleTeacherBiometricCheckIn()}
              disabled={submittingCheckIn}
              activeOpacity={0.85}
            >
              {submittingCheckIn ? (
                <ActivityIndicator size="small" color={palette.onPrimary} />
              ) : (
                <>
                  <Ionicons
                    name={hasBiometricSensor ? 'finger-print-outline' : 'lock-closed-outline'}
                    size={20}
                    color={palette.onPrimary}
                  />
                  <Text style={styles.captureBtnText}>{verifyButtonLabel}</Text>
                </>
              )}
            </TouchableOpacity>
          </View>
        </ScrollView>
      )}
    </View>
  );
};

const createStyles = (palette: ThemePalette, fonts: ReturnType<typeof useThemeMode>['fonts']) =>
  StyleSheet.create({
    container: { flex: 1, backgroundColor: palette.background },
    header: {
      backgroundColor: palette.headerBg,
      paddingHorizontal: 16,
      paddingBottom: 14,
      borderBottomLeftRadius: 24,
      borderBottomRightRadius: 24,
      gap: 10,
      flexShrink: 0,
    },
    headerRow: { flexDirection: 'row', alignItems: 'center' },
    backCircle: {
      width: 38,
      height: 38,
      borderRadius: 19,
      backgroundColor: palette.headerSurface,
      alignItems: 'center',
      justifyContent: 'center',
    },
    headerEyebrow: {
      fontSize: fonts.xxs,
      fontWeight: fonts.weight.extrabold,
      color: palette.onPrimary,
      opacity: 0.8,
      letterSpacing: 0.8,
    },
    headerTitle: {
      fontSize: fonts.lg,
      fontWeight: fonts.weight.extrabold,
      color: palette.onPrimary,
      marginTop: 1,
    },
    segmentWrap: {
      flexDirection: 'row',
      backgroundColor: palette.headerSurface,
      borderRadius: 12,
      padding: 4,
      gap: 4,
    },
    segmentBtn: {
      flex: 1,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 6,
      paddingVertical: 8,
      borderRadius: 9,
    },
    segmentBtnActive: { backgroundColor: palette.surface },
    segmentText: {
      fontSize: fonts.xs,
      fontWeight: fonts.weight.extrabold,
      color: palette.onPrimary,
    },
    segmentTextActive: { color: palette.primary },
    body: {
      flex: 1,
      paddingHorizontal: 14,
      paddingTop: 12,
      gap: 10,
    },
    biometricScroll: {
      flex: 1,
    },
    biometricScrollContent: {
      flexGrow: 1,
      paddingHorizontal: 14,
      paddingTop: 18,
      gap: 12,
    },
    periodPill: {
      paddingVertical: 7,
      paddingHorizontal: 12,
      borderRadius: 10,
      backgroundColor: palette.surface,
      borderWidth: 1,
      borderColor: palette.border,
    },
    periodPillActive: {
      backgroundColor: palette.buttonBg,
      borderColor: palette.buttonBg,
    },
    periodPillText: {
      fontSize: fonts.xs,
      fontWeight: fonts.weight.bold,
      color: palette.textPrimary,
    },
    periodPillTextActive: { color: palette.onPrimary },
    offlineQueueBar: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
      paddingVertical: 8,
      paddingHorizontal: 12,
      borderRadius: 10,
      backgroundColor: palette.warningLight,
      borderWidth: 1,
      borderColor: palette.warning,
    },
    offlineQueueText: {
      flex: 1,
      fontSize: fonts.xs,
      fontWeight: fonts.weight.bold,
      color: palette.textPrimary,
    },
    actionRow: { flexDirection: 'row', gap: 8 },
    actionChip: {
      flex: 1,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 5,
      paddingVertical: 10,
      borderRadius: 12,
      backgroundColor: palette.surface,
      borderWidth: 1,
      borderColor: palette.border,
    },
    actionChipActive: {
      backgroundColor: palette.buttonBg,
      borderColor: palette.buttonBg,
    },
    actionChipText: {
      fontSize: fonts.xs,
      fontWeight: fonts.weight.extrabold,
      color: palette.textSecondary,
    },
    actionChipTextActive: { color: palette.onPrimary },
    biometricCard: {
      backgroundColor: palette.surface,
      borderRadius: 20,
      paddingHorizontal: 18,
      paddingTop: 24,
      paddingBottom: 20,
      borderWidth: 1,
      borderColor: palette.border,
      alignItems: 'center',
      gap: 12,
      overflow: 'visible',
    },
    biometricIconRing: {
      width: 84,
      height: 84,
      borderRadius: 42,
      borderWidth: 2.5,
      alignItems: 'center',
      justifyContent: 'center',
      marginTop: 2,
    },
    biometricTitle: {
      fontSize: fonts.lg,
      fontWeight: fonts.weight.extrabold,
      color: palette.textPrimary,
      textAlign: 'center',
    },
    biometricSubtitle: {
      fontSize: fonts.xs,
      color: palette.textSecondary,
      textAlign: 'center',
      lineHeight: 17,
      paddingHorizontal: 6,
    },
    statusGrid: {
      width: '100%',
      backgroundColor: palette.surfaceSubtle,
      borderRadius: 14,
      padding: 12,
      borderWidth: 1,
      borderColor: palette.border,
      gap: 10,
    },
    statusInfoRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      gap: 8,
      paddingBottom: 10,
      borderBottomWidth: 1,
      borderBottomColor: palette.border,
    },
    statusInfoLeft: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 7,
    },
    statusInfoLabel: {
      fontSize: fonts.xs,
      fontWeight: fonts.weight.bold,
      color: palette.textSecondary,
    },
    statusPill: {
      paddingHorizontal: 9,
      paddingVertical: 4,
      borderRadius: 8,
      maxWidth: '58%',
    },
    statusPillText: {
      fontSize: fonts.xxs,
      fontWeight: fonts.weight.extrabold,
    },
    liveStepBanner: {
      width: '100%',
      paddingVertical: 12,
      paddingHorizontal: 14,
      borderRadius: 14,
      borderWidth: 1,
      gap: 4,
    },
    liveStepTitle: {
      fontSize: fonts.xs,
      fontWeight: fonts.weight.extrabold,
    },
    setupWarningBox: {
      width: '100%',
      flexDirection: 'row',
      alignItems: 'flex-start',
      gap: 8,
      padding: 12,
      borderRadius: 12,
      backgroundColor: palette.warningLight,
      borderWidth: 1,
      borderColor: palette.warning,
    },
    setupWarningText: {
      flex: 1,
      fontSize: fonts.xs,
      color: palette.textPrimary,
      lineHeight: 17,
      fontWeight: fonts.weight.semibold,
    },
    cameraCard: {
      flex: 1,
      borderRadius: 22,
      overflow: 'hidden',
      backgroundColor: SCANNER_OVERLAY_COLORS.surface,
      borderWidth: 1,
      borderColor: palette.border,
    },
    cameraView: { flex: 1 },
    qrOverlay: {
      flex: 1,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: 'rgba(15, 23, 42, 0.22)',
      gap: 14,
    },
    qrReticle: {
      width: 225,
      height: 225,
      borderRadius: 18,
      borderWidth: 3,
      borderColor: SCANNER_OVERLAY_COLORS.reticle,
      backgroundColor: 'transparent',
    },
    autoScanPill: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
      backgroundColor: 'rgba(15, 23, 42, 0.72)',
      paddingHorizontal: 12,
      paddingVertical: 6,
      borderRadius: 999,
    },
    livePulseDot: {
      width: 8,
      height: 8,
      borderRadius: 4,
    },
    qrOverlayHint: {
      color: SCANNER_OVERLAY_COLORS.hintText,
      fontSize: fonts.xs,
      fontWeight: fonts.weight.bold,
      textAlign: 'center',
    },
    permissionFallback: {
      flex: 1,
      alignItems: 'center',
      justifyContent: 'center',
      padding: 24,
    },
    permissionText: {
      color: palette.onPrimary,
      fontSize: fonts.sm,
      textAlign: 'center',
      marginTop: 10,
      marginBottom: 14,
    },
    grantBtn: {
      backgroundColor: palette.buttonBg,
      paddingHorizontal: 18,
      paddingVertical: 10,
      borderRadius: 12,
    },
    grantBtnText: {
      color: palette.onPrimary,
      fontWeight: fonts.weight.extrabold,
      fontSize: fonts.sm,
    },
    scanResultCard: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 12,
      paddingVertical: 10,
      paddingHorizontal: 12,
      borderRadius: 14,
      borderWidth: 1.5,
    },
    studentPhotoCircle: {
      width: 48,
      height: 48,
      borderRadius: 24,
      borderWidth: 2,
      alignItems: 'center',
      justifyContent: 'center',
      overflow: 'hidden',
    },
    studentPhotoImg: {
      width: '100%',
      height: '100%',
    },
    studentInitialsText: {
      fontSize: fonts.md,
      fontWeight: fonts.weight.extrabold,
    },
    instructionBox: {
      paddingVertical: 11,
      paddingHorizontal: 14,
      borderRadius: 14,
      backgroundColor: palette.primarySoft,
      borderWidth: 1,
      borderColor: palette.border,
    },
    instructionTitle: {
      fontSize: fonts.sm,
      fontWeight: fonts.weight.extrabold,
      color: palette.textPrimary,
      marginBottom: 2,
    },
    timestampOnlyText: {
      fontSize: fonts.xs,
      fontWeight: fonts.weight.bold,
      color: palette.textPrimary,
      fontFamily: fonts.mono,
    },
    instructionText: {
      fontSize: fonts.xs,
      fontWeight: fonts.weight.semibold,
      color: palette.textPrimary,
      lineHeight: 17,
    },
    captureBtn: {
      width: '100%',
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 8,
      height: 50,
      borderRadius: 14,
      backgroundColor: palette.buttonBg,
      marginTop: 2,
    },
    captureBtnText: {
      color: palette.onPrimary,
      fontSize: fonts.md,
      fontWeight: fonts.weight.extrabold,
    },
  });

export default ScannerScreen;
