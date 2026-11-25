// AttendSure Mobile - Scanner Screen
// File: D:\AttendSure_V3\mobile\src\screens\ScannerScreen.tsx

/**
 * AttendSure Mobile - Dual-Mode Attendance & Verification Screen
 * Mode 1: Continuous Automatic Student QR Scanner (Built-In Back Camera) + Offline Queue Sync
 * Mode 2: On-Device Phone Lock + Ed25519 Asymmetric Phone Key Signature + Anti-Fake Campus GPS
 * File: mobile/src/screens/ScannerScreen.tsx
 */

import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  AppState,
  DeviceEventEmitter,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useCameraPermissions, type BarcodeScanningResult } from 'expo-camera';
import * as Location from 'expo-location';
import * as Crypto from 'expo-crypto';
import { Ionicons } from '@expo/vector-icons';
import { apiClient } from '../api/client';
import { ENDPOINTS } from '../api/endpoints';
import { useAuth } from '../context/AuthContext';
import { useThemeMode } from '../context/ThemeContext';
import { useTeacherDutyLocation } from '../context/TeacherDutyLocationContext';
import { getFriendlyErrorMessage, type ThemePalette } from '../constants/theme';
import { canScanStudentQr } from '../utils/permissions';
import { isCanceledError, resolveMediaUrl, showNotice } from '../utils/helpers';
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
import {
  checkPhoneLockCapability,
  verifyTeacherBiometricProof,
  type PhoneLockCapability,
} from '../services/biometricService';
import { periodRunsOnJsDay } from '../services/scheduleAlarmService';
import StudentQrScannerMode, {
  type ClassOption,
  type ScanCardResult,
} from '../components/scanner/StudentQrScannerMode';
import TeacherCheckInMode, {
  type CheckInAction,
  type CheckInStep,
} from '../components/scanner/TeacherCheckInMode';

export const ATTENDANCE_UPDATED_EVENT = 'attendsure:attendance-updated';

export interface ScannerScreenProps {
  onBack?: () => void;
}

type ScannerMode = 'STUDENT_QR' | 'TEACHER_CHECKIN';

const makeUuid = (): string => {
  if (typeof Crypto.randomUUID === 'function') {
    return Crypto.randomUUID();
  }
  return `scan-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
};

const withLocationTimeout = <T,>(promise: Promise<T>, timeoutMs: number): Promise<T> =>
  new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('GPS_TIMEOUT')), timeoutMs);
    promise.then(
      (val) => {
        clearTimeout(timer);
        resolve(val);
      },
      (err) => {
        clearTimeout(timer);
        reject(err);
      }
    );
  });

const acquireCampusLocationWithFallback = async (): Promise<Location.LocationObject> => {
  try {
    return await withLocationTimeout(
      Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.High }),
      8000
    );
  } catch {
    try {
      return await withLocationTimeout(
        Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced }),
        6000
      );
    } catch {
      const lastKnown = await Location.getLastKnownPositionAsync({ maxAge: 60000 });
      if (lastKnown) return lastKnown;
      throw new Error(
        'Could not get a fresh GPS reading indoors. Step near a window or outdoors and try again.'
      );
    }
  }
};

export const ScannerScreen: React.FC<ScannerScreenProps> = ({ onBack }) => {
  const insets = useSafeAreaInsets();
  const { user, refreshUser } = useAuth();
  const { palette, fonts } = useThemeMode();
  const { setLocalOnDuty } = useTeacherDutyLocation();
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

  const [classes, setClasses] = useState<ClassOption[]>([]);
  const [selectedPeriodId, setSelectedPeriodId] = useState<number | null>(null);
  const [queuedQrCount, setQueuedQrCount] = useState<number>(0);
  const [syncingQr, setSyncingQr] = useState<boolean>(false);
  const [qrBusy, setQrBusy] = useState<boolean>(false);
  const [lastScan, setLastScan] = useState<ScanCardResult | null>(null);

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

  const handleStudentQrScanned = async (event: BarcodeScanningResult) => {
    if (mode !== 'STUDENT_QR') return;
    const rawQr = String(event.data || '').trim();
    if (!rawQr) return;

    const now = Date.now();
    recentQrMapRef.current.forEach((ts, key) => {
      if (now - ts > 10000) recentQrMapRef.current.delete(key);
    });

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

  // Mode 2: On-Device Lock + Ed25519 Asymmetric Signature + Challenge Nonce + Anti-Fake Campus GPS
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
        ? 'Step 1 of 3: Confirm your identity using your phone fingerprint or face lock...'
        : 'Step 1 of 3: Confirm your identity using your phone screen lock (PIN, Pattern, or Password)...'
    );

    try {
      // Request a short-lived single-use server challenge nonce for replay protection
      let serverChallengeNonce: string | undefined;
      try {
        const challengeRes = await apiClient.get<{ nonce?: string }>(
          ENDPOINTS.CAMPUS_CHECK_IN_CHALLENGE,
          { signal: controller.signal, timeout: 4000 }
        );
        if (challengeRes.data?.nonce) {
          serverChallengeNonce = String(challengeRes.data.nonce).trim();
        }
      } catch {
        // Backend still verifies Ed25519 signature freshness and single-use replay hash
      }

      if (!isMountedRef.current || controller.signal.aborted) return;

      const userId = user?.id ?? user?.username ?? 'teacher';
      const bioProof = await verifyTeacherBiometricProof(
        userId,
        checkInAction,
        serverChallengeNonce
      );
      if (!isMountedRef.current || controller.signal.aborted) return;

      if (!bioProof.ok || !bioProof.keyId || !bioProof.publicKeyHex || !bioProof.signatureHex) {
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

      const loc = await acquireCampusLocationWithFallback();
      if (!isMountedRef.current || controller.signal.aborted) return;

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
      setStatusMessage('Step 3 of 3: Verifying signed proof and saving your attendance...');

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
          biometric_public_key: bioProof.publicKeyHex,
          biometric_key_algorithm: bioProof.keyAlgorithm || 'ED25519',
          biometric_signature: bioProof.signatureHex,
          ...(bioProof.nonce ? { biometric_nonce: bioProof.nonce } : {}),
          biometric_proof: bioProof.proofHash || bioProof.signatureHex.slice(0, 64),
          biometric_method: bioProof.biometricMethod || 'BIOMETRIC',
          biometric_timestamp_ms: bioProof.timestampMs || Date.now(),
          is_mock_location: false,
        },
        { signal: controller.signal }
      );

      if (!isMountedRef.current || controller.signal.aborted) return;

      await setLocalOnDuty(checkInAction === 'TIME_IN');
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
              ? 'Time In verified: Phone fingerprint signature & campus GPS confirmed.'
              : 'Time In verified: Phone screen lock signature & campus GPS confirmed.'
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
  const stepActiveLabel =
    checkInStep === 'BIOMETRIC'
      ? hasBiometricSensor
        ? 'Confirming on Your Phone...'
        : 'Confirming Phone Screen Lock...'
      : checkInStep === 'GPS'
        ? 'Checking School Boundary...'
        : checkInStep === 'SAVING'
          ? 'Verifying Signed Attendance...'
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
        <StudentQrScannerMode
          bottomInset={insets.bottom}
          classes={classes}
          selectedPeriodId={selectedPeriodId}
          onSelectPeriod={setSelectedPeriodId}
          queuedQrCount={queuedQrCount}
          syncingQr={syncingQr}
          onSyncQueuedScans={() => void handleSyncQueuedScans()}
          cameraGranted={Boolean(permission?.granted)}
          onRequestCameraPermission={() => void requestPermission()}
          qrBusy={qrBusy}
          onBarcodeScanned={(res) => void handleStudentQrScanned(res)}
          lastScan={lastScan}
          scanPhotoFailed={scanPhotoFailed}
          onScanPhotoError={() => setScanPhotoFailed(true)}
        />
      ) : (
        <TeacherCheckInMode
          bottomInset={insets.bottom}
          checkInAction={checkInAction}
          onSelectAction={(act) => {
            setCheckInAction(act);
            if (checkInStep === 'DONE') setCheckInStep('IDLE');
          }}
          submittingCheckIn={submittingCheckIn}
          checkInStep={checkInStep}
          lockCapability={lockCapability}
          statusMessage={statusMessage}
          statusIsError={statusIsError}
          stepActiveLabel={stepActiveLabel}
          verifyButtonLabel={verifyButtonLabel}
          isPhoneBound={Boolean(user?.has_bound_device || user?.bound_device_id)}
          isBiometricLocked={Boolean(user?.has_biometric_enrolled)}
          hasAsymmetricKey={Boolean(user?.has_asymmetric_key)}
          phoneModelLabel={phoneModelLabel}
          onVerifyAndSubmit={() => void handleTeacherBiometricCheckIn()}
        />
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
  });

export default ScannerScreen;
