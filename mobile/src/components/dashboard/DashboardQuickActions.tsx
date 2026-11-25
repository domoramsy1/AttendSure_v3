// AttendSure Mobile - Dashboard Quick Actions Component
// File: D:\AttendSure_V3\mobile\src\components\dashboard\DashboardQuickActions.tsx

/**
 * AttendSure Mobile - Role-Scoped Dashboard Quick Actions Grid & More Tools Card
 * File: mobile/src/components/dashboard/DashboardQuickActions.tsx
 */

import React, { useMemo } from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useThemeMode } from '../../context/ThemeContext';
import type { ThemePalette } from '../../constants/theme';
import type { TabType } from '../../navigation/MainTabNavigator';
import {
  canManageUsers,
  canViewAcademicSetup,
  canViewTeacherDirectory,
} from '../../utils/permissions';

export interface DashboardQuickActionsProps {
  user: any;
  allowClassViews: boolean;
  onNavigate?: (tab: TabType) => void;
}

interface QuickTile {
  tab: TabType;
  title: string;
  sub: string;
  icon: keyof typeof Ionicons.glyphMap;
  bg: string;
  color: string;
}

export const DashboardQuickActions: React.FC<DashboardQuickActionsProps> = ({
  user,
  allowClassViews,
  onNavigate,
}) => {
  const { palette, fonts } = useThemeMode();
  const styles = useMemo(() => createStyles(palette, fonts), [palette, fonts]);

  const tiles: QuickTile[] = [
    {
      tab: 'scanner',
      title: 'Teacher Time In / Out',
      sub: 'Phone Fingerprint & Campus GPS',
      icon: 'finger-print-outline',
      bg: palette.warningLight,
      color: palette.warning,
    },
    {
      tab: 'gate_pass',
      title: 'Exit Passes',
      sub: allowClassViews ? 'Student & Locator Slips' : 'Official Locator Slips',
      icon: 'ticket-outline',
      bg: palette.infoLight,
      color: palette.info,
    },
    ...(allowClassViews
      ? [
          {
            tab: 'students' as TabType,
            title: 'Students',
            sub: 'Add, Edit & QR Passes',
            icon: 'school-outline' as const,
            bg: palette.primarySoft,
            color: palette.primary,
          },
          {
            tab: 'class_list' as TabType,
            title: 'Class List',
            sub: 'Attendance & Cutting',
            icon: 'people-outline' as const,
            bg: palette.primarySoft,
            color: palette.primary,
          },
        ]
      : []),
    ...(canViewTeacherDirectory(user)
      ? [
          {
            tab: 'teachers' as TabType,
            title: 'Teachers',
            sub: 'Directory & Bound Phones',
            icon: 'briefcase-outline' as const,
            bg: palette.infoLight,
            color: palette.info,
          },
        ]
      : []),
    ...(canViewAcademicSetup(user)
      ? [
          {
            tab: 'schedules' as TabType,
            title: 'Schedules',
            sub: 'Sections, Subjects & Periods',
            icon: 'calendar-number-outline' as const,
            bg: palette.warningLight,
            color: palette.warning,
          },
        ]
      : []),
    ...(canManageUsers(user)
      ? [
          {
            tab: 'users' as TabType,
            title: 'User Accounts',
            sub: 'Roles & Access CRUD',
            icon: 'shield-checkmark-outline' as const,
            bg: palette.primarySoft,
            color: palette.primary,
          },
        ]
      : []),
    ...(allowClassViews
      ? [
          {
            tab: 'sardo_safety' as TabType,
            title: 'SARDO & Safety',
            sub: 'Roll-Call & Risk Alerts',
            icon: 'shield-outline' as const,
            bg: palette.dangerLight,
            color: palette.danger,
          },
        ]
      : []),
    {
      tab: 'geofence',
      title: 'Campus Geofence',
      sub: 'Live Boundary & Alerts',
      icon: 'navigate-outline',
      bg: palette.successLight,
      color: palette.success,
    },
  ];

  return (
    <>
      <Text style={styles.sectionHeader}>Quick Actions</Text>
      <View style={styles.gridContainer}>
        {tiles.map((tile) => (
          <TouchableOpacity
            key={tile.tab}
            style={styles.gridCard}
            onPress={() => onNavigate?.(tile.tab)}
            activeOpacity={0.8}
          >
            <View style={[styles.gridIconBox, { backgroundColor: tile.bg }]}>
              <Ionicons name={tile.icon} size={20} color={tile.color} />
            </View>
            <Text style={styles.gridCardTitle}>{tile.title}</Text>
            <Text style={styles.gridCardSub}>{tile.sub}</Text>
          </TouchableOpacity>
        ))}
      </View>

      <TouchableOpacity
        style={styles.moreToolsCard}
        onPress={() => onNavigate?.('menu')}
        activeOpacity={0.85}
      >
        <View style={styles.moreToolsLeft}>
          <View style={styles.moreToolsIconBox}>
            <Ionicons name="grid-outline" size={20} color={palette.primary} />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={styles.moreToolsTitle}>More School Tools</Text>
            <Text style={styles.moreToolsSub}>
              DTR, Reports with Page Setup, Calendar, Audit Logs &amp; Settings
            </Text>
          </View>
        </View>
        <Ionicons name="chevron-forward" size={18} color={palette.textMuted} />
      </TouchableOpacity>
    </>
  );
};

const createStyles = (palette: ThemePalette, fonts: ReturnType<typeof useThemeMode>['fonts']) =>
  StyleSheet.create({
    sectionHeader: {
      fontSize: fonts.md,
      fontWeight: fonts.weight.extrabold,
      color: palette.textPrimary,
      marginBottom: 10,
      marginLeft: 2,
    },
    gridContainer: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginBottom: 16 },
    gridCard: {
      width: '48%',
      borderRadius: 16,
      padding: 14,
      backgroundColor: palette.surface,
      borderWidth: 1,
      borderColor: palette.border,
      gap: 4,
    },
    gridIconBox: {
      width: 36,
      height: 36,
      borderRadius: 10,
      alignItems: 'center',
      justifyContent: 'center',
      marginBottom: 4,
    },
    gridCardTitle: {
      fontSize: fonts.md,
      fontWeight: fonts.weight.extrabold,
      color: palette.textPrimary,
    },
    gridCardSub: {
      fontSize: fonts.xs,
      color: palette.textSecondary,
      fontWeight: fonts.weight.semibold,
    },
    moreToolsCard: {
      backgroundColor: palette.surface,
      borderRadius: 16,
      padding: 14,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      borderWidth: 1,
      borderColor: palette.border,
      marginBottom: 14,
    },
    moreToolsLeft: { flexDirection: 'row', alignItems: 'center', gap: 12, flex: 1 },
    moreToolsIconBox: {
      width: 40,
      height: 40,
      borderRadius: 12,
      backgroundColor: palette.primarySoft,
      alignItems: 'center',
      justifyContent: 'center',
    },
    moreToolsTitle: {
      fontSize: fonts.md,
      fontWeight: fonts.weight.extrabold,
      color: palette.textPrimary,
    },
    moreToolsSub: { fontSize: fonts.xs, color: palette.textSecondary, marginTop: 2 },
  });

export default DashboardQuickActions;
