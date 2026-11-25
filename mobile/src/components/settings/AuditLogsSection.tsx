/**
 * AttendSure Mobile - Settings Audit Logs Viewer Section
 * File: mobile/src/components/settings/AuditLogsSection.tsx
 */

import React, { useMemo } from 'react';
import {
  ActivityIndicator,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useThemeMode } from '../../context/ThemeContext';
import type { ThemePalette } from '../../constants/theme';
import ChipRow from '../common/ChipRow';

export interface AuditLogEntry {
  id: number;
  created_at?: string;
  timestamp?: string;
  time_only?: string;
  date_only?: string;
  user?: string;
  performed_by?: string;
  actor_username?: string;
  actor_name?: string;
  action: string;
  action_label?: string;
  table_name?: string;
  target_model?: string;
  record_id?: number;
  target_id?: number;
  module?: string;
  changes?: Record<string, unknown> | null;
  details?: string;
  ip_address?: string;
  client_ip?: string;
  status?: string;
}

export interface AuditLogsSectionProps {
  logs: AuditLogEntry[];
  loading: boolean;
  search: string;
  onSearchChange: (val: string) => void;
  actionFilter: string;
  onActionFilterChange: (val: string) => void;
  onRefresh: () => void;
}

const LOG_ACTION_OPTIONS: ReadonlyArray<{ key: string; label: string }> = [
  { key: 'ALL', label: 'All' },
  { key: 'LOGIN', label: 'Sign In' },
  { key: 'LOGOUT', label: 'Sign Out' },
  { key: 'LOCKOUT', label: 'Locked' },
  { key: 'CREATE', label: 'Created' },
  { key: 'UPDATE', label: 'Updated' },
  { key: 'DELETE', label: 'Deleted' },
  { key: 'APPROVE', label: 'Approved' },
  { key: 'RESOLVE', label: 'Resolved' },
  { key: 'PROFILE', label: 'Profile' },
  { key: 'BIO_ENROLL', label: 'Phone Lock' },
  { key: 'RESET_DEV', label: 'Phone Reset' },
  { key: 'EXPORT', label: 'Exported' },
  { key: 'PRINT', label: 'Printed' },
];

const ACTION_LABELS: Record<string, string> = {
  LOGIN: 'Sign In',
  LOGOUT: 'Sign Out',
  LOGIN_FAIL: 'Failed Sign In',
  LOCKOUT: 'Account Locked',
  LOCKED: 'Locked Account Blocked',
  UNLOCK_ALL: 'Accounts Unlocked',
  PROFILE: 'Profile Updated',
  PASSWORD: 'Password Changed',
  CREATE: 'Created',
  UPDATE: 'Updated',
  DELETE: 'Deleted',
  APPROVE: 'Approved',
  RESOLVE: 'Resolved',
  EXCUSE: 'Excused',
  SUBMIT: 'Submitted',
  VIEW: 'Viewed',
  BIO_ENROLL: 'Phone Lock Enrolled',
  BIO_REJECT: 'Phone Lock Rejected',
  DEV_REJECT: 'Phone Binding Rejected',
  RESET_DEV: 'Phone Reset',
  EXPORT: 'Exported',
  PRINT: 'Printed',
  IMPORT: 'Imported',
  FLUSH: 'Cache Cleared',
};

const MODULE_LABELS: Record<string, string> = {
  auth_user: 'Account',
  user_profiles: 'Account Security',
  teacher_profiles: 'Teachers',
  departments: 'Departments',
  position_titles: 'Positions',
  students: 'Students',
  enrollments: 'Enrollments',
  sections: 'Sections',
  class_periods: 'Class Schedules',
  subjects: 'Subjects',
  rooms: 'Classrooms',
  buildings: 'Buildings',
  grade_levels: 'Grade Levels',
  school_years: 'School Years',
  school_settings: 'School Settings',
  school_holidays: 'School Calendar',
  campus_boundaries: 'Campus Boundary',
  loafing_incidents: 'Campus Alerts',
  teacher_daily_attendance: 'Teacher Attendance',
  teacher_location_pings: 'Campus Location',
  class_attendance: 'Student Attendance',
  daily_attendance: 'Daily Attendance',
  exit_passes: 'Exit Passes',
  teacher_monthly_dtr: 'Monthly DTR',
  deped_reports: 'DepEd Reports',
  edfi_export: 'Division Export',
  system_cache: 'System Memory',
};

const FAILED_ACTIONS = new Set(['LOCKOUT', 'LOCKED', 'LOGIN_FAIL', 'BIO_REJECT', 'DEV_REJECT']);
const ACCOUNT_ACTIONS = new Set(['LOGIN', 'LOGOUT', 'LOGIN_FAIL', 'LOCKOUT', 'LOCKED', 'PASSWORD', 'PROFILE', 'UNLOCK_ALL']);

function formatEntryTime(entry: AuditLogEntry): string {
  const rawIso = String(entry.created_at || '').trim();
  if (rawIso) {
    const parsed = new Date(rawIso);
    if (!Number.isNaN(parsed.getTime())) {
      const dateStr = parsed.toLocaleDateString('en-US', {
        month: 'short',
        day: 'numeric',
        year: 'numeric',
      });
      const timeStr = parsed.toLocaleTimeString('en-US', {
        hour: 'numeric',
        minute: '2-digit',
        hour12: true,
      });
      return `${dateStr} • ${timeStr}`;
    }
  }
  if (entry.timestamp && String(entry.timestamp).trim()) {
    return String(entry.timestamp).trim();
  }
  return [entry.date_only, entry.time_only].filter(Boolean).join(' • ') || '—';
}

function getEntryActor(entry: AuditLogEntry): string {
  return (
    String(entry.actor_name || entry.user || entry.performed_by || entry.actor_username || '').trim() ||
    'System'
  );
}

function getEntryActionLabel(entry: AuditLogEntry): string {
  if (entry.action_label && String(entry.action_label).trim()) {
    return String(entry.action_label).trim();
  }
  const code = String(entry.action || '').trim().toUpperCase();
  return ACTION_LABELS[code] || (code ? code.replace(/_/g, ' ') : 'Activity');
}

function getEntryModuleLabel(entry: AuditLogEntry): string {
  if (entry.module && String(entry.module).trim()) {
    return String(entry.module).trim();
  }
  const rawModel = String(entry.target_model || entry.table_name || '').trim().toLowerCase();
  if (rawModel && MODULE_LABELS[rawModel]) {
    return MODULE_LABELS[rawModel];
  }
  if (rawModel) {
    return rawModel.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
  }
  const code = String(entry.action || '').trim().toUpperCase();
  return ACCOUNT_ACTIONS.has(code) ? 'Account' : 'System';
}

function getEntryDetails(entry: AuditLogEntry): string {
  const direct = String(entry.details || '').trim();
  if (direct && direct !== '{}' && direct !== '[]') {
    return direct;
  }
  const targetId = entry.target_id ?? entry.record_id;
  return `${getEntryActionLabel(entry)} in ${getEntryModuleLabel(entry)}${targetId ? ` (#${targetId})` : ''}.`;
}

function getEntryStatus(entry: AuditLogEntry): { label: string; isFailure: boolean } {
  const code = String(entry.action || '').trim().toUpperCase();
  const rawStatus = String(entry.status || '').trim().toUpperCase();
  if (code === 'LOCKOUT' || code === 'LOCKED') {
    return { label: 'Locked', isFailure: true };
  }
  if (rawStatus === 'FAILED' || FAILED_ACTIONS.has(code)) {
    return { label: 'Failed', isFailure: true };
  }
  return { label: 'Success', isFailure: false };
}

export const AuditLogsSection: React.FC<AuditLogsSectionProps> = ({
  logs,
  loading,
  search,
  onSearchChange,
  actionFilter,
  onActionFilterChange,
  onRefresh,
}) => {
  const { palette, fonts } = useThemeMode();
  const styles = useMemo(() => createStyles(palette, fonts), [palette, fonts]);

  return (
    <View style={styles.card}>
      <View style={styles.rowBetween}>
        <Text style={styles.cardTitle}>System Activity &amp; Audit Logs</Text>
        <TouchableOpacity style={styles.refreshMiniBtn} onPress={onRefresh} disabled={loading}>
          <Ionicons name="refresh-outline" size={15} color={palette.primary} />
          <Text style={styles.refreshMiniText}>Refresh</Text>
        </TouchableOpacity>
      </View>

      <View style={styles.searchWrap}>
        <Ionicons name="search-outline" size={15} color={palette.textMuted} />
        <TextInput
          style={styles.searchInput}
          value={search}
          onChangeText={onSearchChange}
          placeholder="Search user, action, module, or IP..."
          placeholderTextColor={palette.textMuted}
        />
      </View>

      <ChipRow
        options={LOG_ACTION_OPTIONS.map((opt) => ({ key: opt.key, label: opt.label }))}
        selected={actionFilter}
        onSelect={onActionFilterChange}
      />

      {loading ? (
        <ActivityIndicator size="small" color={palette.primary} style={{ marginVertical: 16 }} />
      ) : logs.length === 0 ? (
        <Text style={styles.cardSubtitle}>No audit entries match your filter.</Text>
      ) : (
        <View style={{ gap: 8, marginTop: 4 }}>
          {logs.map((entry) => {
            const statusInfo = getEntryStatus(entry);
            const actionLabel = getEntryActionLabel(entry);
            const moduleLabel = getEntryModuleLabel(entry);
            const actorName = getEntryActor(entry);
            const detailsText = getEntryDetails(entry);
            const ipAddr = String(entry.ip_address || entry.client_ip || '').trim();

            return (
              <View key={String(entry.id)} style={styles.logItem}>
                <View style={styles.rowBetween}>
                  <Text style={styles.logAction} numberOfLines={1}>
                    {actionLabel} &bull; {moduleLabel}
                  </Text>
                  <View
                    style={[
                      styles.statusPill,
                      {
                        backgroundColor: statusInfo.isFailure
                          ? palette.dangerLight
                          : palette.successLight,
                      },
                    ]}
                  >
                    <Text
                      style={[
                        styles.statusPillText,
                        { color: statusInfo.isFailure ? palette.danger : palette.success },
                      ]}
                    >
                      {statusInfo.label}
                    </Text>
                  </View>
                </View>

                <Text style={styles.logDetails}>
                  <Text style={styles.logActor}>{actorName}: </Text>
                  {detailsText}
                </Text>

                <View style={styles.rowBetween}>
                  <Text style={styles.logTime}>{formatEntryTime(entry)}</Text>
                  {ipAddr ? <Text style={styles.logIp}>IP: {ipAddr}</Text> : null}
                </View>
              </View>
            );
          })}
        </View>
      )}
    </View>
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
    rowBetween: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      gap: 8,
    },
    refreshMiniBtn: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 4,
      paddingHorizontal: 10,
      paddingVertical: 5,
      borderRadius: 8,
      backgroundColor: palette.primarySoft,
    },
    refreshMiniText: { fontSize: fonts.xs, fontWeight: fonts.weight.bold, color: palette.primary },
    searchWrap: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
      backgroundColor: palette.surfaceSubtle,
      borderRadius: 10,
      borderWidth: 1,
      borderColor: palette.borderStrong,
      paddingHorizontal: 10,
      height: 40,
    },
    searchInput: { flex: 1, fontSize: fonts.sm, color: palette.textPrimary },
    logItem: {
      padding: 10,
      borderRadius: 10,
      backgroundColor: palette.surfaceSubtle,
      borderWidth: 1,
      borderColor: palette.border,
      gap: 4,
    },
    logAction: {
      flex: 1,
      fontSize: fonts.xs,
      fontWeight: fonts.weight.extrabold,
      color: palette.primary,
    },
    logActor: {
      fontWeight: fonts.weight.bold,
      color: palette.textPrimary,
    },
    logTime: { fontSize: fonts.xxs, color: palette.textMuted },
    logIp: { fontSize: fonts.xxs, color: palette.textMuted },
    logDetails: { fontSize: fonts.xs, color: palette.textSecondary, lineHeight: 16 },
    statusPill: {
      paddingHorizontal: 8,
      paddingVertical: 2,
      borderRadius: 999,
    },
    statusPillText: {
      fontSize: fonts.xxs,
      fontWeight: fonts.weight.extrabold,
    },
  });

export default AuditLogsSection;
