/**
 * AttendSure - User Activity & System Audit Logs Panel
 * File: web/src/components/tabs/settings/AuditLogsPanel.tsx
 */

import React from 'react';
import { useTheme } from '../../../context/ThemeContext';
import { FileSpreadsheet, History, RefreshCw, Search } from 'lucide-react';
import type { ActivityRecord } from './types';

interface AuditLogsPanelProps {
  activityLogs: ActivityRecord[];
  logsLoading: boolean;
  isAdminUser: boolean;
  logSearch: string;
  logActionFilter: string;
  logDateFilter: string;
  onLogSearchChange: (value: string) => void;
  onLogActionFilterChange: (value: string) => void;
  onLogDateFilterChange: (value: string) => void;
  onRefresh: () => void;
  onExportCsv: () => void;
}

export const AUDIT_ACTION_OPTIONS: ReadonlyArray<{ value: string; label: string }> = [
  { value: 'ALL', label: 'All Actions' },
  { value: 'LOGIN', label: 'Sign In' },
  { value: 'LOGOUT', label: 'Sign Out' },
  { value: 'LOCKOUT', label: 'Account Locked' },
  { value: 'LOGIN_FAIL', label: 'Failed Sign In' },
  { value: 'CREATE', label: 'Created' },
  { value: 'UPDATE', label: 'Updated' },
  { value: 'DELETE', label: 'Deleted' },
  { value: 'APPROVE', label: 'Approved' },
  { value: 'RESOLVE', label: 'Resolved' },
  { value: 'EXCUSE', label: 'Excused' },
  { value: 'SUBMIT', label: 'Submitted' },
  { value: 'VIEW', label: 'Viewed' },
  { value: 'PROFILE', label: 'Profile Updated' },
  { value: 'PASSWORD', label: 'Password Changed' },
  { value: 'BIO_ENROLL', label: 'Phone Lock Enrolled' },
  { value: 'BIO_REJECT', label: 'Phone Lock Rejected' },
  { value: 'DEV_REJECT', label: 'Phone Binding Rejected' },
  { value: 'RESET_DEV', label: 'Phone Reset' },
  { value: 'UNLOCK_ALL', label: 'Accounts Unlocked' },
  { value: 'EXPORT', label: 'Exported' },
  { value: 'PRINT', label: 'Printed' },
  { value: 'IMPORT', label: 'Imported' },
  { value: 'FLUSH', label: 'Cache Cleared' },
];

const ACTION_LABEL_MAP: Record<string, string> = {
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

const MODULE_LABEL_MAP: Record<string, string> = {
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

export function formatAuditTimestamp(log: ActivityRecord): {
  dateText: string;
  timeText: string;
  fullText: string;
} {
  const rawIso = String(log.created_at || '').trim();
  if (rawIso) {
    const parsed = new Date(rawIso);
    if (!Number.isNaN(parsed.getTime())) {
      const dateText = parsed.toLocaleDateString('en-US', {
        timeZone: 'Asia/Manila',
        month: 'short',
        day: 'numeric',
        year: 'numeric',
      });
      const timeText = parsed.toLocaleTimeString('en-US', {
        timeZone: 'Asia/Manila',
        hour: 'numeric',
        minute: '2-digit',
        hour12: true,
      });
      return { dateText, timeText, fullText: `${dateText} • ${timeText}` };
    }
  }

  const fallbackDate = String(log.date_only || '').trim();
  const fallbackTime = String(log.time_only || '').trim();
  if (fallbackDate || fallbackTime) {
    const fullText = [fallbackDate, fallbackTime].filter(Boolean).join(' • ');
    return { dateText: fallbackDate, timeText: fallbackTime, fullText };
  }

  const fallbackTs = String(log.timestamp || '').trim();
  return {
    dateText: fallbackTs || '—',
    timeText: '',
    fullText: fallbackTs || '—',
  };
}

export function getAuditActorName(log: ActivityRecord): string {
  const name = String(
    log.actor_name || log.user || log.performed_by || log.actor_username || ''
  ).trim();
  return name || 'System';
}

export function getAuditActionLabel(log: ActivityRecord): string {
  if (log.action_label && String(log.action_label).trim()) {
    return String(log.action_label).trim();
  }
  const code = String(log.action || '').trim().toUpperCase();
  return ACTION_LABEL_MAP[code] || (code ? code.replace(/_/g, ' ') : 'Activity');
}

export function getAuditModuleLabel(log: ActivityRecord): string {
  if (log.module && String(log.module).trim()) {
    return String(log.module).trim();
  }
  const rawModel = String(log.target_model || log.table_name || '').trim().toLowerCase();
  if (rawModel && MODULE_LABEL_MAP[rawModel]) {
    return MODULE_LABEL_MAP[rawModel];
  }
  if (rawModel) {
    return rawModel
      .replace(/_/g, ' ')
      .replace(/\b\w/g, (ch) => ch.toUpperCase());
  }
  const code = String(log.action || '').trim().toUpperCase();
  return ACCOUNT_ACTIONS.has(code) ? 'Account' : 'System';
}

export function getAuditDetailsText(log: ActivityRecord): string {
  const direct = String(log.details || '').trim();
  if (direct && direct !== '{}' && direct !== '[]') {
    return direct;
  }
  const actionLabel = getAuditActionLabel(log);
  const moduleLabel = getAuditModuleLabel(log);
  const targetId = log.target_id ?? log.record_id;
  const suffix = targetId ? ` (#${targetId})` : '';
  return `${actionLabel} in ${moduleLabel}${suffix}.`;
}

export function getAuditIpAddress(log: ActivityRecord): string {
  const ip = String(log.ip_address || log.client_ip || '').trim();
  return ip || '—';
}

export function getAuditStatusDisplay(log: ActivityRecord): {
  label: string;
  isFailure: boolean;
} {
  const code = String(log.action || '').trim().toUpperCase();
  const rawStatus = String(log.status || '').trim().toUpperCase();
  if (code === 'LOCKOUT' || code === 'LOCKED') {
    return { label: 'Locked', isFailure: true };
  }
  if (rawStatus === 'FAILED' || FAILED_ACTIONS.has(code)) {
    return { label: 'Failed', isFailure: true };
  }
  return { label: 'Success', isFailure: false };
}

export const AuditLogsPanel: React.FC<AuditLogsPanelProps> = ({
  activityLogs,
  logsLoading,
  isAdminUser,
  logSearch,
  logActionFilter,
  logDateFilter,
  onLogSearchChange,
  onLogActionFilterChange,
  onLogDateFilterChange,
  onRefresh,
  onExportCsv,
}) => {
  const { tokens, brand, ui } = useTheme();

  const cardStyle: React.CSSProperties = {
    backgroundColor: tokens.bgSurface,
    borderRadius: 14,
    padding: '18px 22px',
    border: `1px solid ${tokens.borderSubtle}`,
    boxShadow: tokens.cardShadow,
  };

  const inputStyle: React.CSSProperties = {
    ...ui.input,
    borderRadius: 8,
    backgroundColor: tokens.bgSurfaceSubtle,
    fontSize: '0.82rem',
  };

  const getActionBadgeStyle = (actionCode: string): React.CSSProperties => {
    const code = actionCode.toUpperCase();
    let bg = tokens.primaryLight;
    let color = brand.primary;

    if (FAILED_ACTIONS.has(code) || code === 'DELETE') {
      bg = tokens.dangerLight;
      color = brand.danger;
    } else if (code === 'CREATE' || code === 'APPROVE' || code === 'RESOLVE' || code === 'BIO_ENROLL' || code === 'UNLOCK_ALL') {
      bg = tokens.successLight;
      color = brand.success;
    } else if (code === 'UPDATE' || code === 'RESET_DEV' || code === 'PASSWORD' || code === 'PROFILE' || code === 'EXCUSE') {
      bg = tokens.warningLight;
      color = brand.warning;
    } else if (code === 'EXPORT' || code === 'PRINT' || code === 'IMPORT' || code === 'VIEW') {
      bg = tokens.infoLight;
      color = brand.secondary;
    }

    return {
      display: 'inline-flex',
      alignItems: 'center',
      padding: '2px 8px',
      borderRadius: 9999,
      fontSize: '0.68rem',
      fontWeight: 800,
      backgroundColor: bg,
      color,
    };
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      <div style={cardStyle}>
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            flexWrap: 'wrap',
            gap: 8,
            marginBottom: 12,
          }}
        >
          <div>
            <h2
              style={{
                fontSize: '0.98rem',
                fontWeight: 800,
                color: tokens.textPrimary,
                margin: 0,
                display: 'flex',
                alignItems: 'center',
                gap: 6,
              }}
            >
              <History size={18} color={brand.primary} />
              <span>{isAdminUser ? 'System-Wide User Activity & Audit Logs' : 'My Activity Logs'}</span>
            </h2>
            <p style={{ fontSize: '0.72rem', color: tokens.textSecondary, margin: '2px 0 0 0' }}>
              {isAdminUser
                ? 'Track sign-ins, phone lock updates, record changes, approvals, and report exports.'
                : 'Activity record of your sign-ins and account updates.'}
            </p>
          </div>

          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <button
              type="button"
              onClick={onExportCsv}
              disabled={activityLogs.length === 0}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: 4,
                padding: '6px 12px',
                backgroundColor: brand.success,
                color: tokens.onPrimary,
                border: 'none',
                borderRadius: 6,
                fontSize: '0.72rem',
                fontWeight: 700,
                cursor: activityLogs.length === 0 ? 'not-allowed' : 'pointer',
                opacity: activityLogs.length === 0 ? 0.55 : 1,
              }}
            >
              <FileSpreadsheet size={13} />
              <span>Export CSV</span>
            </button>

            <button
              type="button"
              onClick={onRefresh}
              disabled={logsLoading}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: 4,
                padding: '6px 12px',
                backgroundColor: tokens.bgSurfaceSubtle,
                color: tokens.textPrimary,
                border: `1px solid ${tokens.borderStrong}`,
                borderRadius: 6,
                fontSize: '0.72rem',
                fontWeight: 700,
                cursor: 'pointer',
              }}
            >
              <RefreshCw size={12} className={logsLoading ? 'animate-spin' : ''} />
              <span>Refresh</span>
            </button>
          </div>
        </div>

        <div
          style={{
            padding: 10,
            backgroundColor: tokens.bgSurfaceSubtle,
            borderRadius: 8,
            border: `1px solid ${tokens.borderSubtle}`,
            display: 'flex',
            gap: 8,
            flexWrap: 'wrap',
            alignItems: 'center',
            marginBottom: 14,
          }}
        >
          <div style={{ flex: 1, minWidth: 200 }}>
            <input
              type="text"
              maxLength={80}
              placeholder="Search user, action, module, or IP address..."
              value={logSearch}
              onChange={(e) => onLogSearchChange(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && onRefresh()}
              style={inputStyle}
            />
          </div>

          <select
            aria-label="Filter activity by action"
            value={logActionFilter}
            onChange={(e) => onLogActionFilterChange(e.target.value)}
            style={{ ...inputStyle, width: 185 }}
          >
            {AUDIT_ACTION_OPTIONS.map((opt) => (
              <option key={opt.value} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </select>

          <input
            type="date"
            aria-label="Filter activity by date"
            value={logDateFilter}
            onChange={(e) => onLogDateFilterChange(e.target.value)}
            style={{ ...inputStyle, width: 145 }}
          />

          <button
            type="button"
            onClick={onRefresh}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 5,
              padding: '8px 16px',
              backgroundColor: brand.buttonBg,
              color: tokens.onPrimary,
              borderRadius: 6,
              border: 'none',
              fontSize: '0.76rem',
              fontWeight: 700,
              cursor: 'pointer',
            }}
          >
            <Search size={13} />
            <span>Search</span>
          </button>
        </div>

        <div style={{ overflowX: 'auto' }}>
          <table
            style={{
              width: '100%',
              minWidth: 720,
              borderCollapse: 'collapse',
              textAlign: 'left',
              fontSize: '0.76rem',
            }}
          >
            <thead>
              <tr
                style={{
                  backgroundColor: tokens.bgSurfaceSubtle,
                  borderBottom: `1px solid ${tokens.borderSubtle}`,
                  color: tokens.textSecondary,
                }}
              >
                <th style={{ padding: '9px 14px' }}>Timestamp</th>
                <th style={{ padding: '9px 14px' }}>User Account</th>
                <th style={{ padding: '9px 14px' }}>Action &amp; Module</th>
                <th style={{ padding: '9px 14px' }}>Event Details</th>
                <th style={{ padding: '9px 14px' }}>Client IP</th>
                <th style={{ padding: '9px 14px' }}>Status</th>
              </tr>
            </thead>
            <tbody>
              {activityLogs.length > 0 ? (
                activityLogs.map((log) => {
                  const ts = formatAuditTimestamp(log);
                  const actor = getAuditActorName(log);
                  const actionLabel = getAuditActionLabel(log);
                  const moduleLabel = getAuditModuleLabel(log);
                  const detailsText = getAuditDetailsText(log);
                  const ipText = getAuditIpAddress(log);
                  const statusInfo = getAuditStatusDisplay(log);

                  return (
                    <tr key={log.id} style={{ borderBottom: `1px solid ${tokens.borderSubtle}` }}>
                      <td style={{ padding: '9px 14px', whiteSpace: 'nowrap', color: tokens.textPrimary }}>
                        <div style={{ fontWeight: 700 }}>{ts.fullText}</div>
                      </td>
                      <td style={{ padding: '9px 14px' }}>
                        <strong style={{ color: brand.primary }}>{actor}</strong>
                        {log.actor_username && log.actor_username !== actor && (
                          <div style={{ fontSize: '0.64rem', color: tokens.textMuted }}>
                            @{log.actor_username}
                          </div>
                        )}
                      </td>
                      <td style={{ padding: '9px 14px' }}>
                        <span style={getActionBadgeStyle(log.action)}>{actionLabel}</span>
                        <div style={{ fontSize: '0.66rem', color: tokens.textMuted, marginTop: 3 }}>
                          Module: {moduleLabel}
                        </div>
                      </td>
                      <td style={{ padding: '9px 14px', color: tokens.textSecondary, maxWidth: 320 }}>
                        {detailsText}
                      </td>
                      <td style={{ padding: '9px 14px', fontFamily: 'monospace', color: tokens.textMuted }}>
                        {ipText}
                      </td>
                      <td style={{ padding: '9px 14px' }}>
                        <span
                          style={{
                            display: 'inline-flex',
                            alignItems: 'center',
                            padding: '2px 8px',
                            borderRadius: 9999,
                            fontSize: '0.66rem',
                            fontWeight: 800,
                            backgroundColor: statusInfo.isFailure ? tokens.dangerLight : tokens.successLight,
                            color: statusInfo.isFailure ? brand.danger : brand.success,
                          }}
                        >
                          {statusInfo.label}
                        </span>
                      </td>
                    </tr>
                  );
                })
              ) : (
                <tr>
                  <td colSpan={6} style={{ textAlign: 'center', padding: '24px', color: tokens.textMuted }}>
                    {logsLoading ? 'Loading activity logs...' : 'No activity logs found for the selected criteria.'}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};
