/**
 * AttendSure Mobile - Dashboard Daily Time Record Summary & Student KPI Tiles
 * File: mobile/src/components/dashboard/DashboardDtrAndKpiSection.tsx
 */

import React, { useMemo } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useThemeMode } from '../../context/ThemeContext';
import type { ThemePalette } from '../../constants/theme';

export interface DtrDayRowSummary {
  am_arrival: string;
  am_departure: string;
  pm_arrival: string;
  pm_departure: string;
}

export interface DtrSummarySnapshot {
  month: string;
  year: number;
  days_present: number;
  total_undertime_hours: number;
  total_undertime_minutes: number;
  dtr_submitted: boolean;
  dept_head_approved: boolean;
}

export interface DashboardDtrAndKpiSectionProps {
  dtrData: DtrSummarySnapshot | null;
  todayDtrRow: DtrDayRowSummary | null;
  allowClassViews: boolean;
  lastSyncTime: string;
  totalPresent: number;
  totalLate: number;
  totalAbsent: number;
  totalNeedsReview: number;
}

export const DashboardDtrAndKpiSection: React.FC<DashboardDtrAndKpiSectionProps> = ({
  dtrData,
  todayDtrRow,
  allowClassViews,
  lastSyncTime,
  totalPresent,
  totalLate,
  totalAbsent,
  totalNeedsReview,
}) => {
  const { palette, fonts } = useThemeMode();
  const styles = useMemo(() => createStyles(palette, fonts), [palette, fonts]);

  return (
    <>
      {dtrData && (
        <>
          <View style={styles.sectionHeaderRow}>
            <Text style={styles.sectionHeaderTitle}>
              Daily Time Record ({dtrData.month} {dtrData.year})
            </Text>
            <Text style={styles.sectionHeaderSub}>
              {dtrData.days_present} {dtrData.days_present === 1 ? 'Day' : 'Days'} Logged
            </Text>
          </View>

          <View style={styles.dtrSummaryCard}>
            <View style={styles.dtrGrid}>
              {[
                { label: 'AM IN', val: todayDtrRow?.am_arrival },
                { label: 'AM OUT', val: todayDtrRow?.am_departure },
                { label: 'PM IN', val: todayDtrRow?.pm_arrival },
                { label: 'PM OUT', val: todayDtrRow?.pm_departure },
              ].map((slot) => (
                <View key={slot.label} style={styles.dtrSlot}>
                  <Text style={styles.dtrSlotLabel}>{slot.label}</Text>
                  <Text style={styles.dtrSlotTime}>{slot.val || '--:--'}</Text>
                </View>
              ))}
            </View>

            <View style={styles.dtrCardFooter}>
              <Text style={styles.dtrFooterMeta}>
                Undertime: {dtrData.total_undertime_hours}h {dtrData.total_undertime_minutes}m
              </Text>
              <Text
                style={[
                  styles.dtrApprovalBadge,
                  {
                    color: dtrData.dept_head_approved
                      ? palette.success
                      : dtrData.dtr_submitted
                        ? palette.primary
                        : palette.textMuted,
                  },
                ]}
              >
                {dtrData.dept_head_approved
                  ? 'APPROVED BY DEPT HEAD'
                  : dtrData.dtr_submitted
                    ? 'SENT FOR REVIEW'
                    : 'LOGGING TODAY'}
              </Text>
            </View>
          </View>
        </>
      )}

      {allowClassViews && (
        <>
          <View style={styles.sectionHeaderRow}>
            <Text style={styles.sectionHeaderTitle}>Student Attendance Today</Text>
            {lastSyncTime ? (
              <Text style={styles.sectionHeaderSub}>Updated {lastSyncTime}</Text>
            ) : null}
          </View>

          <View style={styles.kpiTileGrid}>
            {[
              {
                label: 'Present',
                value: totalPresent,
                icon: 'checkmark-circle-outline' as const,
                bg: palette.successLight,
                color: palette.success,
              },
              {
                label: 'Late',
                value: totalLate,
                icon: 'time-outline' as const,
                bg: palette.warningLight,
                color: palette.warning,
              },
              {
                label: 'Absent',
                value: totalAbsent,
                icon: 'close-circle-outline' as const,
                bg: palette.dangerLight,
                color: palette.danger,
              },
              {
                label: 'Review',
                value: totalNeedsReview,
                icon: 'eye-outline' as const,
                bg: palette.surfaceSubtle,
                color: palette.textSecondary,
                valueColor: palette.textPrimary,
              },
            ].map((tile) => (
              <View key={tile.label} style={styles.kpiTile}>
                <View style={[styles.kpiIconWrap, { backgroundColor: tile.bg }]}>
                  <Ionicons name={tile.icon} size={15} color={tile.color} />
                </View>
                <Text style={[styles.kpiValueText, { color: tile.valueColor || tile.color }]}>
                  {tile.value}
                </Text>
                <Text style={styles.kpiLabelText}>{tile.label}</Text>
              </View>
            ))}
          </View>
        </>
      )}
    </>
  );
};

const createStyles = (palette: ThemePalette, fonts: ReturnType<typeof useThemeMode>['fonts']) =>
  StyleSheet.create({
    sectionHeaderRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      marginTop: 12,
      marginBottom: 6,
    },
    sectionHeaderTitle: {
      fontSize: fonts.sm,
      fontWeight: fonts.weight.extrabold,
      color: palette.textPrimary,
    },
    sectionHeaderSub: {
      fontSize: fonts.xxs,
      fontWeight: fonts.weight.semibold,
      color: palette.textMuted,
    },
    dtrSummaryCard: {
      backgroundColor: palette.surface,
      borderRadius: 14,
      padding: 12,
      borderWidth: 1,
      borderColor: palette.border,
    },
    dtrGrid: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      backgroundColor: palette.surfaceSubtle,
      borderRadius: 8,
      paddingVertical: 8,
      paddingHorizontal: 8,
    },
    dtrSlot: { alignItems: 'center', flex: 1 },
    dtrSlotLabel: { fontSize: 9, fontWeight: fonts.weight.extrabold, color: palette.textMuted },
    dtrSlotTime: {
      fontSize: fonts.sm,
      fontWeight: fonts.weight.extrabold,
      color: palette.textPrimary,
      marginTop: 2,
    },
    dtrCardFooter: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      marginTop: 8,
      paddingHorizontal: 2,
    },
    dtrFooterMeta: {
      fontSize: fonts.xs,
      color: palette.textSecondary,
      fontWeight: fonts.weight.semibold,
    },
    dtrApprovalBadge: { fontSize: fonts.xxs, fontWeight: fonts.weight.extrabold, letterSpacing: 0.2 },
    kpiTileGrid: { flexDirection: 'row', gap: 6, marginBottom: 4 },
    kpiTile: {
      flex: 1,
      backgroundColor: palette.surface,
      borderRadius: 12,
      padding: 10,
      borderWidth: 1,
      borderColor: palette.border,
      alignItems: 'center',
    },
    kpiIconWrap: {
      width: 28,
      height: 28,
      borderRadius: 8,
      alignItems: 'center',
      justifyContent: 'center',
      marginBottom: 4,
    },
    kpiValueText: {
      fontSize: fonts.md,
      fontWeight: fonts.weight.extrabold,
      color: palette.textPrimary,
    },
    kpiLabelText: {
      fontSize: 9.5,
      fontWeight: fonts.weight.bold,
      color: palette.textSecondary,
      marginTop: 1,
      textAlign: 'center',
    },
  });

export default DashboardDtrAndKpiSection;
