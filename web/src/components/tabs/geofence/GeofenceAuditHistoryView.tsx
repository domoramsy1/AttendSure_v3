// AttendSure Web - Geofence Location History & Audit View
// File: D:\AttendSure_V3\web\src\components\tabs\geofence\GeofenceAuditHistoryView.tsx

import React from 'react';
import { useTheme } from '../../../context/ThemeContext';
import { StatsCard } from '../../common/StatsCard';
import { AlertTriangle, Check, FileSpreadsheet, Search } from 'lucide-react';
import { formatMeters, type AuditRecord, type TeacherBoundaryStatus } from './types';

interface GeofenceAuditHistoryViewProps {
  visible: boolean;
  radius: number | null;
  teacherList: TeacherBoundaryStatus[];
  auditRecords: AuditRecord[];
  auditLoading: boolean;
  totalDatabaseRecords: number;
  auditSearchQuery: string;
  auditTeacherFilter: string;
  auditVerdictFilter: 'ALL' | 'INSIDE' | 'OUTSIDE';
  dateFilterMode: 'ALL_LOGS' | 'SPECIFIC_DATE';
  auditDate: string;
  onChangeSearch: (value: string) => void;
  onChangeTeacherFilter: (value: string) => void;
  onChangeVerdictFilter: (value: 'ALL' | 'INSIDE' | 'OUTSIDE') => void;
  onChangeDateMode: (mode: 'ALL_LOGS' | 'SPECIFIC_DATE') => void;
  onChangeAuditDate: (date: string) => void;
  onSearch: () => void;
  onExportCsv: () => void;
}

export const GeofenceAuditHistoryView: React.FC<GeofenceAuditHistoryViewProps> = ({
  visible,
  radius,
  teacherList,
  auditRecords,
  auditLoading,
  totalDatabaseRecords,
  auditSearchQuery,
  auditTeacherFilter,
  auditVerdictFilter,
  dateFilterMode,
  auditDate,
  onChangeSearch,
  onChangeTeacherFilter,
  onChangeVerdictFilter,
  onChangeDateMode,
  onChangeAuditDate,
  onSearch,
  onExportCsv,
}) => {
  const { tokens, brand, ui } = useTheme();

  const panelCard: React.CSSProperties = {
    backgroundColor: tokens.bgSurface,
    borderRadius: 12,
    border: `1px solid ${tokens.borderSubtle}`,
    boxShadow: tokens.cardShadow,
    overflow: 'hidden',
  };

  const badgePill = (bg: string, color: string, border: string): React.CSSProperties => ({
    display: 'inline-flex',
    alignItems: 'center',
    padding: '2px 8px',
    borderRadius: 4,
    backgroundColor: bg,
    color,
    border: `1px solid ${border}`,
    fontSize: '0.64rem',
    fontWeight: 800,
    letterSpacing: '0.3px',
  });

  return (
    <div style={{ display: visible ? 'flex' : 'none', flexDirection: 'column', gap: 14 }}>
      <div style={{ ...panelCard, padding: 14 }}>
        <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', flexWrap: 'wrap', gap: 10 }}>
          <div style={{ display: 'flex', alignItems: 'flex-end', gap: 8, flexWrap: 'wrap', flex: 1 }}>
            <div style={{ minWidth: 200, flex: 1 }}>
              <label style={ui.label}>Search Teacher Name or ID</label>
              <input
                type="text"
                maxLength={80}
                placeholder="Search name, Employee ID, or Device..."
                value={auditSearchQuery}
                onChange={(e) => onChangeSearch(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && onSearch()}
                style={ui.input}
              />
            </div>

            <div>
              <label style={ui.label}>Filter Teacher</label>
              <select
                value={auditTeacherFilter}
                onChange={(e) => onChangeTeacherFilter(e.target.value)}
                style={{ ...ui.input, width: 170 }}
              >
                <option value="ALL">All Teachers</option>
                {teacherList.map((t) => (
                  <option key={t.id} value={String(t.id)}>
                    {t.teacher_name}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label style={ui.label}>Log Date Filter</label>
              <div style={{ display: 'flex', gap: 4 }}>
                <button
                  type="button"
                  onClick={() => onChangeDateMode('ALL_LOGS')}
                  style={{
                    padding: '7px 10px',
                    borderRadius: 6,
                    border: `1px solid ${dateFilterMode === 'ALL_LOGS' ? brand.buttonBg : tokens.borderStrong}`,
                    backgroundColor: dateFilterMode === 'ALL_LOGS' ? brand.buttonBg : tokens.bgSurface,
                    color: dateFilterMode === 'ALL_LOGS' ? tokens.onPrimary : tokens.textSecondary,
                    fontWeight: dateFilterMode === 'ALL_LOGS' ? 800 : 600,
                    fontSize: '0.74rem',
                    cursor: 'pointer',
                  }}
                >
                  All Logs
                </button>
                <button
                  type="button"
                  onClick={() => onChangeDateMode('SPECIFIC_DATE')}
                  style={{
                    padding: '7px 10px',
                    borderRadius: 6,
                    border: `1px solid ${dateFilterMode === 'SPECIFIC_DATE' ? brand.buttonBg : tokens.borderStrong}`,
                    backgroundColor: dateFilterMode === 'SPECIFIC_DATE' ? brand.buttonBg : tokens.bgSurface,
                    color: dateFilterMode === 'SPECIFIC_DATE' ? tokens.onPrimary : tokens.textSecondary,
                    fontWeight: dateFilterMode === 'SPECIFIC_DATE' ? 800 : 600,
                    fontSize: '0.74rem',
                    cursor: 'pointer',
                  }}
                >
                  By Date
                </button>
              </div>
            </div>

            {dateFilterMode === 'SPECIFIC_DATE' && (
              <div>
                <label style={ui.label}>Select Date</label>
                <input
                  type="date"
                  value={auditDate}
                  onChange={(e) => onChangeAuditDate(e.target.value)}
                  style={{ ...ui.input, width: 145 }}
                />
              </div>
            )}

            <div>
              <label style={ui.label}>Boundary Status</label>
              <select
                value={auditVerdictFilter}
                onChange={(e) => onChangeVerdictFilter(e.target.value as 'ALL' | 'INSIDE' | 'OUTSIDE')}
                style={{ ...ui.input, width: 170 }}
              >
                <option value="ALL">All Statuses</option>
                <option value="INSIDE">Inside Campus</option>
                <option value="OUTSIDE">Outside Campus</option>
              </select>
            </div>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <button
              type="button"
              onClick={onSearch}
              disabled={auditLoading}
              style={ui.btnPrimary}
            >
              <Search size={13} />
              <span>Search Logs</span>
            </button>

            <button
              type="button"
              onClick={onExportCsv}
              disabled={auditRecords.length === 0}
              style={{
                ...ui.btnPrimary,
                backgroundColor: brand.success,
                opacity: auditRecords.length === 0 ? 0.55 : 1,
              }}
            >
              <FileSpreadsheet size={13} />
              <span>Export CSV</span>
            </button>
          </div>
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 200px), 1fr))', gap: 12 }}>
        <StatsCard
          label="LOCATION CHECKS"
          value={totalDatabaseRecords}
          helpText={dateFilterMode === 'ALL_LOGS' ? 'Recent campus location checks' : `Records on ${auditDate}`}
        />
        <StatsCard
          label="INSIDE CAMPUS"
          value={auditRecords.filter((r) => Boolean(r.is_inside ?? r.is_inside_geofence)).length}
          valueColor={brand.success}
          helpText={radius !== null ? `Within ${radius}m boundary` : 'Boundary not set'}
        />
        <StatsCard
          label="OUTSIDE CAMPUS"
          value={auditRecords.filter((r) => !Boolean(r.is_inside ?? r.is_inside_geofence)).length}
          valueColor={brand.danger}
          helpText="Beyond campus boundary"
        />
      </div>

      <div style={panelCard}>
        <div
          style={{
            padding: '12px 16px',
            borderBottom: `1px solid ${tokens.borderSubtle}`,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            flexWrap: 'wrap',
            gap: 8,
          }}
        >
          <div>
            <div style={{ fontSize: '0.88rem', fontWeight: 800, color: tokens.textPrimary }}>
              Campus GPS Location Logs
            </div>
            <div style={{ fontSize: '0.70rem', color: tokens.textSecondary, marginTop: 2 }}>
              Timestamped teacher GPS pings with dynamically computed distance from campus center.
            </div>
          </div>
          <span style={{ fontSize: '0.72rem', color: tokens.textSecondary }}>
            Showing <strong style={{ color: tokens.textPrimary }}>{auditRecords.length}</strong> record(s)
          </span>
        </div>

        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', minWidth: 780, borderCollapse: 'collapse', textAlign: 'left', fontSize: '0.76rem' }}>
            <thead>
              <tr>
                <th style={ui.th}>Timestamp</th>
                <th style={ui.th}>Teacher</th>
                <th style={ui.th}>Zone Status</th>
                <th style={ui.th}>Distance from Campus</th>
                <th style={ui.th}>GPS Accuracy</th>
                <th style={ui.th}>Device ID</th>
              </tr>
            </thead>
            <tbody>
              {auditRecords.length > 0 ? (
                auditRecords.map((r) => {
                  const inside = Boolean(r.is_inside ?? r.is_inside_geofence);
                  return (
                    <tr key={r.id}>
                      <td style={{ ...ui.td, fontFamily: 'monospace' }}>
                        <div style={{ fontWeight: 700, color: tokens.textPrimary }}>{r.time_only || r.timestamp}</div>
                        <div style={{ fontSize: '0.64rem', color: tokens.textMuted }}>{r.date_only || ''}</div>
                      </td>
                      <td style={ui.td}>
                        <strong style={{ color: tokens.textPrimary }}>{r.teacher_name}</strong>
                        {r.employee_id && (
                          <div style={{ fontSize: '0.64rem', color: tokens.textMuted, fontFamily: 'monospace' }}>
                            ID: {r.employee_id}
                          </div>
                        )}
                      </td>
                      <td style={ui.td}>
                        {inside ? (
                          <span style={badgePill(tokens.successLight, brand.success, brand.success)}>
                            <Check size={10} style={{ marginRight: 3 }} /> {r.status || 'INSIDE'}
                          </span>
                        ) : (
                          <span style={badgePill(tokens.dangerLight, brand.danger, brand.danger)}>
                            <AlertTriangle size={10} style={{ marginRight: 3 }} /> {r.status || 'OUTSIDE'}
                          </span>
                        )}
                      </td>
                      <td style={{ ...ui.td, fontFamily: 'monospace', fontWeight: 700, color: inside ? brand.success : brand.danger }}>
                        {formatMeters(r.distance ?? r.distance_meters)}
                      </td>
                      <td style={{ ...ui.td, fontFamily: 'monospace', color: tokens.textSecondary }}>
                        {r.accuracy_meters !== null && r.accuracy_meters !== undefined
                          ? `±${Math.round(r.accuracy_meters)}m`
                          : '—'}
                      </td>
                      <td style={{ ...ui.td, fontFamily: 'monospace', color: tokens.textSecondary, fontSize: '0.72rem' }}>
                        {r.device_id || '—'}
                      </td>
                    </tr>
                  );
                })
              ) : (
                <tr>
                  <td colSpan={6} style={{ textAlign: 'center', padding: '30px', color: tokens.textMuted }}>
                    {auditLoading ? 'Loading location logs...' : 'No location logs found matching your filters.'}
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

export default GeofenceAuditHistoryView;
