// AttendSure Mobile - Campus Alert Modal
// File: D:\AttendSure_V3\mobile\src\components\dashboard\CampusAlertModal.tsx

/**
 * AttendSure Mobile - Outside School Boundary Notice Modal
 * File: mobile/src/components/dashboard/CampusAlertModal.tsx
 */

import React, { useMemo } from 'react';
import { Modal, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useThemeMode } from '../../context/ThemeContext';
import type { ThemePalette } from '../../constants/theme';
import { formatDistanceMeters } from '../../utils/helpers';

export interface CampusAlertModalProps {
  visible: boolean;
  liveDistanceMeters: number | null;
  radiusMeters: number | null;
  onDismiss: () => void;
}

export const CampusAlertModal: React.FC<CampusAlertModalProps> = ({
  visible,
  liveDistanceMeters,
  radiusMeters,
  onDismiss,
}) => {
  const { palette, fonts } = useThemeMode();
  const styles = useMemo(() => createStyles(palette, fonts), [palette, fonts]);

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onDismiss}>
      <View style={styles.modalOverlay}>
        <View style={styles.modalCard}>
          <View style={styles.modalIconWrap}>
            <Ionicons name="location-outline" size={32} color={palette.primary} />
          </View>

          <Text style={styles.modalTitle}>Outside the School Boundary</Text>
          <Text style={styles.modalSubtitle}>
            You are currently timed in on duty, and your phone appears to be outside school grounds.
          </Text>

          <View style={styles.modalMetricsBox}>
            <View style={styles.modalMetricCol}>
              <Text style={styles.modalMetricLabel}>CURRENT DISTANCE</Text>
              <Text style={styles.modalMetricVal}>
                {liveDistanceMeters !== null ? formatDistanceMeters(liveDistanceMeters) : '—'}
              </Text>
            </View>
            <View style={styles.modalMetricDivider} />
            <View style={styles.modalMetricCol}>
              <Text style={styles.modalMetricLabel}>ALLOWED BOUNDARY</Text>
              <Text style={styles.modalMetricVal}>
                {radiusMeters !== null ? `${radiusMeters}m` : '—'}
              </Text>
            </View>
          </View>

          <Text style={styles.modalExplanation}>
            On official school business? Tap Exit Passes to log an Official Locator Slip so your
            duty record stays protected. Otherwise, step back inside campus grounds or Time Out if
            your shift is finished.
          </Text>

          <TouchableOpacity style={styles.modalConfirmBtn} onPress={onDismiss} activeOpacity={0.85}>
            <Ionicons name="checkmark-outline" size={16} color={palette.onPrimary} />
            <Text style={styles.modalConfirmBtnText}>I Understand</Text>
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );
};

const createStyles = (palette: ThemePalette, fonts: ReturnType<typeof useThemeMode>['fonts']) =>
  StyleSheet.create({
    modalOverlay: {
      flex: 1,
      backgroundColor: 'rgba(15, 23, 42, 0.75)',
      justifyContent: 'center',
      alignItems: 'center',
      padding: 20,
    },
    modalCard: {
      width: '100%',
      backgroundColor: palette.surface,
      borderRadius: 16,
      padding: 20,
      alignItems: 'center',
      borderWidth: 1,
      borderColor: palette.borderStrong,
    },
    modalIconWrap: {
      width: 54,
      height: 54,
      borderRadius: 27,
      backgroundColor: palette.primarySoft,
      justifyContent: 'center',
      alignItems: 'center',
      marginBottom: 12,
    },
    modalTitle: {
      fontSize: fonts.lg,
      fontWeight: fonts.weight.extrabold,
      color: palette.textPrimary,
      textAlign: 'center',
    },
    modalSubtitle: {
      fontSize: fonts.sm,
      color: palette.textSecondary,
      textAlign: 'center',
      marginTop: 4,
      lineHeight: 18,
    },
    modalMetricsBox: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-around',
      backgroundColor: palette.surfaceSubtle,
      borderWidth: 1,
      borderColor: palette.border,
      borderRadius: 10,
      width: '100%',
      paddingVertical: 10,
      marginVertical: 12,
    },
    modalMetricCol: { alignItems: 'center', flex: 1 },
    modalMetricDivider: { width: 1, height: 24, backgroundColor: palette.borderStrong },
    modalMetricLabel: { fontSize: 9, fontWeight: fonts.weight.extrabold, color: palette.textMuted },
    modalMetricVal: {
      fontSize: fonts.md,
      fontWeight: fonts.weight.extrabold,
      color: palette.textPrimary,
      marginTop: 2,
    },
    modalExplanation: {
      fontSize: fonts.xs,
      color: palette.textSecondary,
      textAlign: 'center',
      lineHeight: 16,
      marginBottom: 16,
    },
    modalConfirmBtn: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 6,
      backgroundColor: palette.buttonBg,
      width: '100%',
      paddingVertical: 12,
      borderRadius: 10,
    },
    modalConfirmBtnText: {
      color: palette.onPrimary,
      fontSize: fonts.sm,
      fontWeight: fonts.weight.bold,
    },
  });

export default CampusAlertModal;
