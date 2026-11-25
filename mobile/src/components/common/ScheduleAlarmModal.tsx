/**
 * AttendSure Mobile - Schedule & Teacher Time In / Out Alarm Popup Modal
 * File: mobile/src/components/common/ScheduleAlarmModal.tsx
 */

import React, { useMemo } from 'react';
import { Modal, View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useThemeMode } from '../../context/ThemeContext';
import type { ThemePalette } from '../../constants/theme';
import type { MobileAlarmEvent } from '../../services/scheduleAlarmService';

interface ScheduleAlarmModalProps {
  alarm: MobileAlarmEvent | null;
  onDismiss: () => void;
  onSnooze: () => void;
  onAction: (targetTab: MobileAlarmEvent['targetTab']) => void;
}

export const ScheduleAlarmModal: React.FC<ScheduleAlarmModalProps> = ({
  alarm,
  onDismiss,
  onSnooze,
  onAction,
}) => {
  const { palette, fonts } = useThemeMode();
  const styles = useMemo(() => createStyles(palette, fonts), [palette, fonts]);

  if (!alarm) return null;

  const accentColor =
    alarm.kind === 'TIME_IN'
      ? palette.success
      : alarm.kind === 'TIME_OUT'
        ? palette.warning
        : palette.primary;

  const accentBg =
    alarm.kind === 'TIME_IN'
      ? palette.successLight
      : alarm.kind === 'TIME_OUT'
        ? palette.warningLight
        : palette.primarySoft;

  return (
    <Modal visible={Boolean(alarm)} transparent animationType="fade" onRequestClose={onDismiss}>
      <View style={styles.overlay}>
        <View style={styles.card}>
          <View style={[styles.iconRing, { backgroundColor: accentBg, borderColor: accentColor }]}>
            <Ionicons name="alarm" size={34} color={accentColor} />
          </View>

          <View style={[styles.badge, { backgroundColor: accentBg, borderColor: accentColor }]}>
            <Ionicons name="volume-high-outline" size={12} color={accentColor} />
            <Text style={[styles.badgeText, { color: accentColor }]}>ALARM RINGING</Text>
          </View>

          <Text style={styles.title}>{alarm.title}</Text>
          <Text style={styles.subtitle}>{alarm.subtitle}</Text>

          <View style={styles.timeBox}>
            <Ionicons name="time-outline" size={16} color={accentColor} />
            <Text style={styles.timeText}>{alarm.timeLabel}</Text>
          </View>

          <Text style={styles.detail}>{alarm.detail}</Text>

          <TouchableOpacity
            style={[styles.primaryBtn, { backgroundColor: palette.buttonBg }]}
            onPress={() => onAction(alarm.targetTab)}
            activeOpacity={0.85}
          >
            <Text style={styles.primaryBtnText}>{alarm.actionLabel}</Text>
            <Ionicons name="arrow-forward" size={16} color={palette.onPrimary} />
          </TouchableOpacity>

          <View style={styles.secondaryRow}>
            <TouchableOpacity style={styles.secondaryBtn} onPress={onSnooze} activeOpacity={0.8}>
              <Ionicons name="time-outline" size={15} color={palette.textPrimary} />
              <Text style={styles.secondaryBtnText}>Snooze 5m</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.secondaryBtn} onPress={onDismiss} activeOpacity={0.8}>
              <Ionicons name="notifications-off-outline" size={15} color={palette.danger} />
              <Text style={[styles.secondaryBtnText, { color: palette.danger }]}>Stop Alarm</Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  );
};

const createStyles = (palette: ThemePalette, fonts: ReturnType<typeof useThemeMode>['fonts']) =>
  StyleSheet.create({
    overlay: {
      flex: 1,
      backgroundColor: 'rgba(15, 23, 42, 0.72)',
      justifyContent: 'center',
      alignItems: 'center',
      padding: 20,
    },
    card: {
      width: '100%',
      maxWidth: 380,
      backgroundColor: palette.surface,
      borderRadius: 20,
      padding: 22,
      alignItems: 'center',
      borderWidth: 1.5,
      borderColor: palette.borderStrong,
      gap: 10,
    },
    iconRing: {
      width: 68,
      height: 68,
      borderRadius: 34,
      borderWidth: 2,
      alignItems: 'center',
      justifyContent: 'center',
    },
    badge: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 5,
      paddingHorizontal: 10,
      paddingVertical: 4,
      borderRadius: 999,
      borderWidth: 1,
    },
    badgeText: {
      fontSize: fonts.xxs,
      fontWeight: fonts.weight.extrabold,
      letterSpacing: 0.4,
    },
    title: {
      fontSize: fonts.lg,
      fontWeight: fonts.weight.black,
      color: palette.textPrimary,
      textAlign: 'center',
    },
    subtitle: {
      fontSize: fonts.sm,
      fontWeight: fonts.weight.bold,
      color: palette.textSecondary,
      textAlign: 'center',
    },
    timeBox: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 6,
      width: '100%',
      paddingVertical: 10,
      paddingHorizontal: 12,
      borderRadius: 12,
      backgroundColor: palette.surfaceSubtle,
      borderWidth: 1,
      borderColor: palette.border,
    },
    timeText: {
      fontSize: fonts.md,
      fontWeight: fonts.weight.black,
      color: palette.textPrimary,
    },
    detail: {
      fontSize: fonts.xs,
      color: palette.textSecondary,
      textAlign: 'center',
      lineHeight: 18,
    },
    primaryBtn: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 8,
      width: '100%',
      height: 46,
      borderRadius: 12,
      marginTop: 4,
    },
    primaryBtnText: {
      fontSize: fonts.sm,
      fontWeight: fonts.weight.extrabold,
      color: palette.onPrimary,
    },
    secondaryRow: {
      flexDirection: 'row',
      gap: 10,
      width: '100%',
    },
    secondaryBtn: {
      flex: 1,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 6,
      height: 42,
      borderRadius: 10,
      backgroundColor: palette.surfaceSubtle,
      borderWidth: 1,
      borderColor: palette.borderStrong,
    },
    secondaryBtnText: {
      fontSize: fonts.xs,
      fontWeight: fonts.weight.extrabold,
      color: palette.textPrimary,
    },
  });

export default ScheduleAlarmModal;
