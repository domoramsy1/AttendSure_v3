// AttendSure Mobile - Teacher On-Device Phone Lock & GPS Check-In Mode
// File: D:\AttendSure_V3\mobile\src\components\scanner\TeacherCheckInMode.tsx

import React, { useMemo } from 'react';
import {
  ActivityIndicator,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useThemeMode } from '../../context/ThemeContext';
import type { ThemePalette } from '../../constants/theme';
import type { PhoneLockCapability } from '../../services/biometricService';

export type CheckInAction = 'TIME_IN' | 'TIME_OUT';
export type CheckInStep = 'IDLE' | 'BIOMETRIC' | 'GPS' | 'SAVING' | 'DONE';

interface TeacherCheckInModeProps {
  bottomInset: number;
  checkInAction: CheckInAction;
  onSelectAction: (action: CheckInAction) => void;
  submittingCheckIn: boolean;
  checkInStep: CheckInStep;
  lockCapability: PhoneLockCapability | null;
  statusMessage: string;
  statusIsError: boolean;
  stepActiveLabel: string;
  verifyButtonLabel: string;
  isPhoneBound: boolean;
  isBiometricLocked: boolean;
  hasAsymmetricKey: boolean;
  phoneModelLabel: string;
  onVerifyAndSubmit: () => void;
}

export const TeacherCheckInMode: React.FC<TeacherCheckInModeProps> = ({
  bottomInset,
  checkInAction,
  onSelectAction,
  submittingCheckIn,
  checkInStep,
  lockCapability,
  statusMessage,
  statusIsError,
  stepActiveLabel,
  verifyButtonLabel,
  isPhoneBound,
  isBiometricLocked,
  hasAsymmetricKey,
  phoneModelLabel,
  onVerifyAndSubmit,
}) => {
  const { palette, fonts } = useThemeMode();
  const styles = useMemo(() => createStyles(palette, fonts), [palette, fonts]);
  const hasBiometricSensor = Boolean(lockCapability?.hasBiometric);
  const isPhoneLockReady = lockCapability ? lockCapability.ready : true;

  return (
    <ScrollView
      style={styles.biometricScroll}
      contentContainerStyle={[
        styles.biometricScrollContent,
        { paddingBottom: Math.max(bottomInset, 16) + 96 },
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
              onPress={() => onSelectAction(act)}
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
          Your privacy is protected: identity check stays strictly on your phone and signs each
          check-in with your phone&apos;s private key. Zero face photos or fingerprint scans are
          ever saved on the school server.
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
                  backgroundColor: isPhoneBound ? palette.successLight : palette.warningLight,
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
                  backgroundColor: lockCapability?.ready
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
              <Text style={styles.statusInfoLabel}>Signed Phone Key</Text>
            </View>
            <View
              style={[
                styles.statusPill,
                {
                  backgroundColor: hasAsymmetricKey
                    ? palette.successLight
                    : isBiometricLocked
                      ? palette.warningLight
                      : palette.primarySoft,
                },
              ]}
            >
              <Text
                style={[
                  styles.statusPillText,
                  {
                    color: hasAsymmetricKey
                      ? palette.success
                      : isBiometricLocked
                        ? palette.warning
                        : palette.primary,
                  },
                ]}
              >
                {hasAsymmetricKey
                  ? 'Ed25519 Verified'
                  : isBiometricLocked
                    ? 'Upgrades on Next Time In'
                    : 'Locks on First Time In'}
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

        {/* Setup Warning ONLY when phone has NO screen lock at all */}
        {lockCapability && !lockCapability.ready && lockCapability.setupMessage ? (
          <View style={styles.setupWarningBox}>
            <Ionicons name="information-circle-outline" size={18} color={palette.warning} />
            <Text style={styles.setupWarningText}>{lockCapability.setupMessage}</Text>
          </View>
        ) : null}

        {/* Primary Verification Button */}
        <TouchableOpacity
          style={[styles.captureBtn, submittingCheckIn && { opacity: 0.7 }]}
          onPress={onVerifyAndSubmit}
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
  );
};

const createStyles = (palette: ThemePalette, fonts: ReturnType<typeof useThemeMode>['fonts']) =>
  StyleSheet.create({
    biometricScroll: { flex: 1 },
    biometricScrollContent: {
      flexGrow: 1,
      paddingHorizontal: 14,
      paddingTop: 18,
      gap: 12,
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
    instructionText: {
      fontSize: fonts.xs,
      fontWeight: fonts.weight.semibold,
      color: palette.textPrimary,
      lineHeight: 17,
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

export default TeacherCheckInMode;
