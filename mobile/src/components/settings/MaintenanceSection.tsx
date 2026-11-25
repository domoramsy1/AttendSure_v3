// AttendSure Mobile - Maintenance Section Component
// File: D:\AttendSure_V3\mobile\src\components\settings\MaintenanceSection.tsx

/**
 * AttendSure Mobile - Settings Live Health & Maintenance Tools Section
 * File: mobile/src/components/settings/MaintenanceSection.tsx
 */

import React, { useMemo } from 'react';
import { ActivityIndicator, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useThemeMode } from '../../context/ThemeContext';
import type { ThemePalette } from '../../constants/theme';

export type MaintenanceActionKey = 'AUDIT' | 'CACHE' | 'STATUS' | 'UNLOCK';

export interface MaintenanceHealthStats {
  dbStatus: string;
  teachersTimedIn: number;
  teachersTotal?: number;
  openAlerts: number;
  activePasses: number;
}

export interface MaintenanceSectionProps {
  healthStats: MaintenanceHealthStats;
  maintBusy: string | null;
  onRunAction: (key: MaintenanceActionKey) => void;
}

const MAINTENANCE_ACTIONS: Array<{
  key: MaintenanceActionKey;
  title: string;
  sub: string;
  icon: keyof typeof Ionicons.glyphMap;
}> = [
  {
    key: 'AUDIT',
    title: 'Run Student Cutting Class Audit',
    sub: 'Scan today’s class lists to detect missing period scans',
    icon: 'shield-checkmark-outline',
  },
  {
    key: 'CACHE',
    title: 'Refresh Server Memory',
    sub: 'Clear saved server memory so updated reports and profiles appear right away',
    icon: 'trash-bin-outline',
  },
  {
    key: 'STATUS',
    title: 'Check Attendance Services',
    sub: 'Verify database connectivity and live counters',
    icon: 'pulse-outline',
  },
  {
    key: 'UNLOCK',
    title: 'Unlock Locked Accounts',
    sub: 'Clear failed-login lockouts so teachers can sign in right away',
    icon: 'lock-open-outline',
  },
];

export const MaintenanceSection: React.FC<MaintenanceSectionProps> = ({
  healthStats,
  maintBusy,
  onRunAction,
}) => {
  const { palette, fonts } = useThemeMode();
  const styles = useMemo(() => createStyles(palette, fonts), [palette, fonts]);

  return (
    <>
      <View style={styles.card}>
        <Text style={styles.cardTitle}>Live School System Health</Text>
        <View style={styles.healthGrid}>
          <View style={styles.healthTile}>
            <Text style={styles.healthLabel}>DATABASE</Text>
            <Text style={[styles.healthVal, { color: palette.success }]}>
              {healthStats.dbStatus}
            </Text>
          </View>
          <View style={styles.healthTile}>
            <Text style={styles.healthLabel}>TEACHERS TIMED IN</Text>
            <Text style={styles.healthVal}>
              {healthStats.teachersTotal && healthStats.teachersTotal > 0
                ? `${healthStats.teachersTimedIn} / ${healthStats.teachersTotal}`
                : healthStats.teachersTimedIn}
            </Text>
          </View>
          <View style={styles.healthTile}>
            <Text style={styles.healthLabel}>OPEN ALERTS</Text>
            <Text style={[styles.healthVal, { color: palette.warning }]}>
              {healthStats.openAlerts}
            </Text>
          </View>
          <View style={styles.healthTile}>
            <Text style={styles.healthLabel}>ACTIVE EXIT PASSES</Text>
            <Text style={styles.healthVal}>{healthStats.activePasses}</Text>
          </View>
        </View>
      </View>

      <View style={styles.card}>
        <Text style={styles.cardTitle}>Maintenance Tools</Text>
        <Text style={styles.cardSubtitle}>
          Run the exact same administrative maintenance tasks available on the Web Portal.
        </Text>

        {MAINTENANCE_ACTIONS.map((act) => (
          <TouchableOpacity
            key={act.key}
            style={styles.maintRow}
            disabled={maintBusy !== null}
            onPress={() => onRunAction(act.key)}
            activeOpacity={0.85}
          >
            <View style={styles.maintIconBox}>
              {maintBusy === act.key ? (
                <ActivityIndicator size="small" color={palette.primary} />
              ) : (
                <Ionicons name={act.icon} size={18} color={palette.primary} />
              )}
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.maintTitle}>{act.title}</Text>
              <Text style={styles.maintSub}>{act.sub}</Text>
            </View>
            <Ionicons name="chevron-forward" size={16} color={palette.textMuted} />
          </TouchableOpacity>
        ))}
      </View>
    </>
  );
};

const createStyles = (palette: ThemePalette, fonts: ReturnType<typeof useThemeMode>['fonts']) =>
  StyleSheet.create({
    card: {
      backgroundColor: palette.surface,
      borderRadius: 16,
      padding: 16,
      borderWidth: 1,
      borderColor: palette.border,
      gap: 8,
    },
    cardTitle: { fontSize: fonts.md, fontWeight: fonts.weight.extrabold, color: palette.textPrimary },
    cardSubtitle: { fontSize: fonts.xs, color: palette.textSecondary, lineHeight: 17 },
    healthGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
    healthTile: {
      width: '48%',
      padding: 12,
      borderRadius: 12,
      backgroundColor: palette.surfaceSubtle,
      borderWidth: 1,
      borderColor: palette.border,
      gap: 4,
    },
    healthLabel: { fontSize: fonts.xxs, fontWeight: fonts.weight.extrabold, color: palette.textMuted },
    healthVal: { fontSize: fonts.md, fontWeight: fonts.weight.black, color: palette.textPrimary },
    maintRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 10,
      padding: 12,
      borderRadius: 12,
      backgroundColor: palette.surfaceSubtle,
      borderWidth: 1,
      borderColor: palette.border,
    },
    maintIconBox: {
      width: 36,
      height: 36,
      borderRadius: 10,
      backgroundColor: palette.primarySoft,
      alignItems: 'center',
      justifyContent: 'center',
    },
    maintTitle: { fontSize: fonts.sm, fontWeight: fonts.weight.extrabold, color: palette.textPrimary },
    maintSub: { fontSize: fonts.xxs, color: palette.textSecondary, marginTop: 1 },
  });

export default MaintenanceSection;
