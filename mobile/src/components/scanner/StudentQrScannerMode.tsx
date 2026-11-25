// AttendSure Mobile - Student Camera QR Scanner Mode Component
// File: D:\AttendSure_V3\mobile\src\components\scanner\StudentQrScannerMode.tsx

import React, { useMemo } from 'react';
import {
  ActivityIndicator,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { CameraView, type BarcodeScanningResult } from 'expo-camera';
import { Image } from 'expo-image';
import { Ionicons } from '@expo/vector-icons';
import { useThemeMode } from '../../context/ThemeContext';
import { SCANNER_OVERLAY_COLORS, type ThemePalette } from '../../constants/theme';
import { getInitials } from '../../utils/helpers';
import {
  formatDayOfWeekLabel,
  periodRunsOnJsDay,
} from '../../services/scheduleAlarmService';

export interface ClassOption {
  schedule_id: number;
  section_name: string;
  subject_code: string;
  subject_title: string;
  time_display: string;
  day_of_week?: string;
}

export interface ScanCardResult {
  ok: boolean;
  isDuplicate?: boolean;
  studentName: string;
  statusLabel: string;
  timestamp: string;
  photoUrl: string | null;
  errorDetail?: string;
}

interface StudentQrScannerModeProps {
  bottomInset: number;
  classes: ClassOption[];
  selectedPeriodId: number | null;
  onSelectPeriod: (periodId: number) => void;
  queuedQrCount: number;
  syncingQr: boolean;
  onSyncQueuedScans: () => void;
  cameraGranted: boolean;
  onRequestCameraPermission: () => void;
  qrBusy: boolean;
  onBarcodeScanned: (event: BarcodeScanningResult) => void;
  lastScan: ScanCardResult | null;
  scanPhotoFailed: boolean;
  onScanPhotoError: () => void;
}

export const StudentQrScannerMode: React.FC<StudentQrScannerModeProps> = ({
  bottomInset,
  classes,
  selectedPeriodId,
  onSelectPeriod,
  queuedQrCount,
  syncingQr,
  onSyncQueuedScans,
  cameraGranted,
  onRequestCameraPermission,
  qrBusy,
  onBarcodeScanned,
  lastScan,
  scanPhotoFailed,
  onScanPhotoError,
}) => {
  const { palette, fonts } = useThemeMode();
  const styles = useMemo(() => createStyles(palette, fonts), [palette, fonts]);
  const todayJsDay = new Date().getDay();

  return (
    <View style={[styles.body, { paddingBottom: Math.max(bottomInset, 12) + 92 }]}>
      {/* Class Period Pills + Offline Queue Sync */}
      <View style={{ gap: 8, flexShrink: 0 }}>
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          style={{ flexGrow: 0, flexShrink: 0 }}
          contentContainerStyle={{ gap: 8, alignItems: 'center', paddingVertical: 2 }}
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
              const runsToday = periodRunsOnJsDay(cls.day_of_week, todayJsDay);
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
                  onPress={() => onSelectPeriod(cls.schedule_id)}
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
            onPress={onSyncQueuedScans}
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

      {/* Continuous Automatic Built-In Back Camera QR Scanner */}
      <View style={styles.cameraCard}>
        {cameraGranted ? (
          <CameraView
            style={styles.cameraView}
            facing="back"
            autofocus="on"
            barcodeScannerSettings={{ barcodeTypes: ['qr'] }}
            onBarcodeScanned={onBarcodeScanned}
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
                  {qrBusy ? 'Scanning QR ID...' : 'Auto-Scanner Active • Place QR ID in frame'}
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
              onPress={onRequestCameraPermission}
              activeOpacity={0.85}
            >
              <Text style={styles.grantBtnText}>Allow Camera</Text>
            </TouchableOpacity>
          </View>
        )}
      </View>

      {/* Result Card: Student Photo + Name (STATUS) + ONLY Timestamp */}
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
                onError={onScanPhotoError}
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
  );
};

const createStyles = (palette: ThemePalette, fonts: ReturnType<typeof useThemeMode>['fonts']) =>
  StyleSheet.create({
    body: {
      flex: 1,
      paddingHorizontal: 14,
      paddingTop: 12,
      gap: 10,
    },
    periodPill: {
      minHeight: 36,
      justifyContent: 'center',
      alignItems: 'center',
      paddingVertical: 8,
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
      lineHeight: 16,
      fontWeight: fonts.weight.bold,
      color: palette.textPrimary,
      includeFontPadding: false,
      textAlignVertical: 'center',
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
    studentPhotoImg: { width: '100%', height: '100%' },
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
  });

export default StudentQrScannerMode;
