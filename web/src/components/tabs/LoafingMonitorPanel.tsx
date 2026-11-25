/**
 * AttendSure - Live Loafing & Class-Cutting Incident Monitor
 * File: web/src/components/tabs/LoafingMonitorPanel.tsx
 */

import React, { useState, useEffect, useCallback, useRef } from 'react';
import apiClient from '../../api/client';
import { API_ROUTES, extractApiError } from '../../api/routes';
import { useTheme } from '../../context/ThemeContext';
import { useAlert } from '../../context/AlertContext';
import { sanitizeText } from '../../theme/tokens';
import { StatusBadge } from '../common/StatusBadge';
import { canResolveLoafing, getCurrentUserFromStorage } from '../../utils/permissions';
import {
  AlertTriangle,
  CheckCircle2,
  ShieldAlert,
  RefreshCw,
  PlayCircle,
  Clock,
  Check,
  XCircle,
  FileCheck,
} from 'lucide-react';

export interface LoafingIncidentItem {
  id: number;
  incident_type: 'TEACHER_OUTSIDE_GEOFENCE' | 'STUDENT_CUTTING_CLASS' | 'EXPIRED_EXIT_PASS';
  status: 'OPEN' | 'RETURNED' | 'EXCUSED' | 'CONFIRMED_LOAFING';
  person_name: string;
  person_code: string;
  person_role: string;
  section_name?: string;
  class_period_label?: string;
  pass_number?: string;
  distance_meters?: number | null;
  detected_at: string;
  resolved_at?: string | null;
  remarks: string;
  reviewed_by_name?: string;
}

interface LoafingMonitorPanelProps {
  onIncidentUpdated?: () => void;
}

const INCIDENT_TYPE_LABELS: Record<string, string> = {
  TEACHER_OUTSIDE_GEOFENCE: 'Teacher Loafing',
  STUDENT_CUTTING_CLASS: 'Student Cutting Class',
  EXPIRED_EXIT_PASS: 'Expired Exit Pass',
};

const getStatusLabel = (status: string, incidentType?: string): string => {
  if (status === 'CONFIRMED_LOAFING') {
    return incidentType === 'STUDENT_CUTTING_CLASS' ? 'Confirmed Cutting' : 'Confirmed Loafing';
  }
  if (status === 'OPEN') return 'Open Alert';
  if (status === 'RETURNED') return 'Returned';
  if (status === 'EXCUSED') return 'Excused';
  return status;
};

export const LoafingMonitorPanel: React.FC<LoafingMonitorPanelProps> = ({ onIncidentUpdated }) => {
  const { tokens, brand, ui } = useTheme();
  const { showAlert } = useAlert();

  const isLeader = canResolveLoafing(getCurrentUserFromStorage());

  const [incidents, setIncidents] = useState<LoafingIncidentItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [auditing, setAuditing] = useState(false);
  const [resolvingId, setResolvingId] = useState<number | null>(null);
  const [typeFilter, setTypeFilter] = useState<string>('ALL');
  const [statusFilter, setStatusFilter] = useState<string>('ALL');
  const [remarksById, setRemarksById] = useState<Record<number, string>>({});

  const abortRef = useRef<AbortController | null>(null);

  const fetchIncidents = useCallback(
    async (silent = false) => {
      abortRef.current?.abort();
      const controller = new AbortController();
      abortRef.current = controller;

      if (!silent) setLoading(true);
      try {
        const params: Record<string, string> = { nocache: '1' };
        if (typeFilter !== 'ALL') params.incident_type = typeFilter;
        if (statusFilter !== 'ALL') params.status = statusFilter;

        const res = await apiClient.get(API_ROUTES.campus.loafing, {
          params,
          signal: controller.signal,
        });
        if (controller.signal.aborted) return;
        const rows = Array.isArray(res.data)
          ? res.data
          : Array.isArray(res.data?.results)
            ? res.data.results
            : Array.isArray(res.data?.records)
              ? res.data.records
              : [];
        setIncidents(rows as LoafingIncidentItem[]);
      } catch (err: unknown) {
        const anyErr = err as { name?: string; code?: string };
        if (controller.signal.aborted || anyErr?.name === 'CanceledError' || anyErr?.code === 'ERR_CANCELED') {
          return;
        }
        if (!silent) {
          showAlert({
            title: 'Load Notice',
            message: extractApiError(err, 'Could not load teacher loafing and student cutting alerts from the server.'),
            type: 'warning',
          });
        }
      } finally {
        if (!controller.signal.aborted && !silent) setLoading(false);
      }
    },
    [typeFilter, statusFilter, showAlert]
  );

  useEffect(() => {
    void fetchIncidents(false);
    return () => abortRef.current?.abort();
  }, [fetchIncidents]);

  const handleRunClassAudit = async () => {
    setAuditing(true);
    try {
      const res = await apiClient.post(API_ROUTES.campus.loafingAudit, {});
      const data = res.data || {};
      const cutting = Number(data.created_cutting_incidents ?? 0);
      const expired = Number(data.created_expired_pass_incidents ?? 0);
      showAlert({
        title: 'Student Cutting Audit Complete',
        message: `Detected ${cutting} new student cutting alert(s) and ${expired} expired exit pass alert(s).`,
        type: cutting + expired > 0 ? 'warning' : 'success',
      });
      await fetchIncidents(false);
      onIncidentUpdated?.();
    } catch (err) {
      showAlert({
        title: 'Audit Failed',
        message: extractApiError(err, 'Unable to run the student cutting audit right now.'),
        type: 'error',
      });
    } finally {
      setAuditing(false);
    }
  };

  const handleResolve = async (
    incident: LoafingIncidentItem,
    nextStatus: 'CONFIRMED_LOAFING' | 'RETURNED' | 'EXCUSED'
  ) => {
    if (!isLeader) return;
    const incidentId = incident.id;
    setResolvingId(incidentId);
    try {
      const cleanRemarks = sanitizeText(remarksById[incidentId] || '', 240);
      await apiClient.patch(`${API_ROUTES.campus.loafingIncidents}${incidentId}/`, {
        status: nextStatus,
        remarks: cleanRemarks,
      });
      showAlert({
        title: 'Incident Updated',
        message: `Alert #${incidentId} marked as ${getStatusLabel(nextStatus, incident.incident_type)}.`,
        type: 'success',
      });
      setRemarksById((prev) => {
        const next = { ...prev };
        delete next[incidentId];
        return next;
      });
      await fetchIncidents(false);
      onIncidentUpdated?.();
    } catch (err) {
      showAlert({
        title: 'Update Failed',
        message: extractApiError(err, 'Could not update alert status.'),
        type: 'error',
      });
    } finally {
      setResolvingId(null);
    }
  };

  return (
    <div style={{ ...ui.card, padding: 0, overflow: 'hidden' }}>
      <div
        style={{
          padding: '12px 16px',
          borderBottom: `1px solid ${tokens.borderSubtle}`,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          flexWrap: 'wrap',
          gap: 10,
          backgroundColor: tokens.bgSurfaceSubtle,
        }}
      >
        <div>
          <div
            style={{
              fontSize: '0.90rem',
              fontWeight: 800,
              color: tokens.textPrimary,
              display: 'flex',
              alignItems: 'center',
              gap: 7,
            }}
          >
            <ShieldAlert size={16} color={brand.danger} />
            <span>Teacher Loafing &amp; Student Cutting Alerts</span>
          </div>
          <div style={{ fontSize: '0.70rem', color: tokens.textSecondary, marginTop: 2 }}>
            Helps school leaders review off-campus duty alerts, missed class periods, and overdue exit passes with fair context.
          </div>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
          <select
            aria-label="Filter incident type"
            value={typeFilter}
            onChange={(e) => setTypeFilter(e.target.value)}
            style={{ ...ui.input, width: 'auto', padding: '5px 9px', fontSize: '0.74rem' }}
          >
            <option value="ALL">All Alert Types</option>
            <option value="TEACHER_OUTSIDE_GEOFENCE">Teacher Loafing</option>
            <option value="STUDENT_CUTTING_CLASS">Student Cutting Class</option>
            <option value="EXPIRED_EXIT_PASS">Expired Exit Pass</option>
          </select>

          <select
            aria-label="Filter incident status"
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            style={{ ...ui.input, width: 'auto', padding: '5px 9px', fontSize: '0.74rem' }}
          >
            <option value="ALL">All Statuses</option>
            <option value="OPEN">Open Alerts</option>
            <option value="RETURNED">Returned</option>
            <option value="EXCUSED">Excused</option>
            <option value="CONFIRMED_LOAFING">Confirmed Loafing / Cutting</option>
          </select>

          {isLeader && (
            <button
              type="button"
              onClick={() => void handleRunClassAudit()}
              disabled={auditing}
              style={ui.btnPrimary}
            >
              <PlayCircle size={14} />
              <span>{auditing ? 'Auditing...' : 'Run Student Cutting Audit'}</span>
            </button>
          )}

          <button
            type="button"
            onClick={() => void fetchIncidents(false)}
            disabled={loading}
            style={ui.btnSecondary}
          >
            <RefreshCw size={13} className={loading ? 'animate-spin' : ''} />
            <span>Refresh</span>
          </button>
        </div>
      </div>

      <div style={{ overflowX: 'auto' }}>
        <table style={{ width: '100%', minWidth: 860, borderCollapse: 'collapse', textAlign: 'left', fontSize: '0.76rem' }}>
          <thead>
            <tr>
              <th style={ui.th}>Person</th>
              <th style={ui.th}>Alert Type</th>
              <th style={ui.th}>Context / Distance</th>
              <th style={ui.th}>Detected</th>
              <th style={ui.th}>Status</th>
              <th style={ui.th}>Remarks / Review</th>
              {isLeader && <th style={{ ...ui.th, textAlign: 'right' }}>Action</th>}
            </tr>
          </thead>
          <tbody>
            {loading && incidents.length === 0 ? (
              <tr>
                <td colSpan={isLeader ? 7 : 6} style={{ padding: 28, textAlign: 'center', color: tokens.textMuted }}>
                  Loading alerts...
                </td>
              </tr>
            ) : incidents.length === 0 ? (
              <tr>
                <td colSpan={isLeader ? 7 : 6} style={{ padding: 28, textAlign: 'center', color: tokens.textMuted }}>
                  <CheckCircle2 size={20} color={brand.success} style={{ margin: '0 auto 6px', display: 'block' }} />
                  All clear — no open teacher loafing or student cutting alerts match these filters.
                </td>
              </tr>
            ) : (
              incidents.map((inc) => (
                <tr key={inc.id}>
                  <td style={ui.td}>
                    <div style={{ fontWeight: 800, color: tokens.textPrimary }}>{inc.person_name || 'Unknown'}</div>
                    <div style={{ fontSize: '0.66rem', color: tokens.textMuted, fontFamily: 'monospace' }}>
                      {inc.person_role} &bull; {inc.person_code || `#${inc.id}`}
                    </div>
                  </td>

                  <td style={ui.td}>
                    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, fontWeight: 700, color: tokens.textPrimary }}>
                      <AlertTriangle
                        size={13}
                        color={inc.status === 'OPEN' ? brand.danger : brand.warning}
                      />
                      {INCIDENT_TYPE_LABELS[inc.incident_type] || inc.incident_type}
                    </span>
                  </td>

                  <td style={ui.td}>
                    {inc.class_period_label && (
                      <div style={{ fontWeight: 700, color: tokens.textPrimary }}>{inc.class_period_label}</div>
                    )}
                    {inc.section_name && (
                      <div style={{ fontSize: '0.68rem', color: tokens.textSecondary }}>{inc.section_name}</div>
                    )}
                    {inc.pass_number && (
                      <div style={{ fontSize: '0.68rem', color: brand.primary, fontFamily: 'monospace' }}>
                        Pass #{inc.pass_number}
                      </div>
                    )}
                    {inc.distance_meters !== null && inc.distance_meters !== undefined && (
                      <div style={{ fontSize: '0.68rem', color: brand.danger, fontFamily: 'monospace', fontWeight: 700 }}>
                        {Math.round(inc.distance_meters)}m from campus
                      </div>
                    )}
                  </td>

                  <td style={ui.td}>
                    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: '0.72rem', color: tokens.textSecondary }}>
                      <Clock size={12} />
                      {inc.detected_at ? new Date(inc.detected_at).toLocaleString() : '—'}
                    </span>
                  </td>

                  <td style={ui.td}>
                    <StatusBadge
                      status={inc.status}
                      label={getStatusLabel(inc.status, inc.incident_type)}
                    />
                  </td>

                  <td style={ui.td}>
                    <div style={{ fontSize: '0.72rem', color: tokens.textPrimary, maxWidth: 260 }}>
                      {inc.remarks || '—'}
                    </div>
                    {inc.reviewed_by_name && (
                      <div style={{ fontSize: '0.64rem', color: tokens.textMuted, marginTop: 2 }}>
                        Reviewed by {inc.reviewed_by_name}
                      </div>
                    )}
                    {isLeader && inc.status === 'OPEN' && (
                      <input
                        type="text"
                        maxLength={240}
                        placeholder="Add official reason, locator slip #, or review note..."
                        value={remarksById[inc.id] || ''}
                        onChange={(e) =>
                          setRemarksById((prev) => ({ ...prev, [inc.id]: e.target.value }))
                        }
                        style={{ ...ui.input, marginTop: 6, padding: '4px 8px', fontSize: '0.70rem' }}
                      />
                    )}
                  </td>

                  {isLeader && (
                    <td style={{ ...ui.td, textAlign: 'right' }}>
                      {inc.status === 'OPEN' ? (
                        <div style={{ display: 'inline-flex', gap: 4, flexWrap: 'wrap', justifyContent: 'flex-end' }}>
                          <button
                            type="button"
                            disabled={resolvingId === inc.id}
                            onClick={() => void handleResolve(inc, 'CONFIRMED_LOAFING')}
                            style={{
                              ...ui.btnSecondary,
                              padding: '4px 7px',
                              fontSize: '0.66rem',
                              color: brand.danger,
                              borderColor: brand.danger,
                              backgroundColor: tokens.dangerLight,
                            }}
                            title={
                              inc.incident_type === 'STUDENT_CUTTING_CLASS'
                                ? 'Confirm student cutting class'
                                : 'Confirm teacher loafing'
                            }
                          >
                            <XCircle size={11} /> Confirm
                          </button>
                          <button
                            type="button"
                            disabled={resolvingId === inc.id}
                            onClick={() => void handleResolve(inc, 'RETURNED')}
                            style={{
                              ...ui.btnSecondary,
                              padding: '4px 7px',
                              fontSize: '0.66rem',
                              color: brand.success,
                              borderColor: brand.success,
                              backgroundColor: tokens.successLight,
                            }}
                            title="Mark person as returned"
                          >
                            <Check size={11} /> Returned
                          </button>
                          <button
                            type="button"
                            disabled={resolvingId === inc.id}
                            onClick={() => void handleResolve(inc, 'EXCUSED')}
                            style={{
                              ...ui.btnSecondary,
                              padding: '4px 7px',
                              fontSize: '0.66rem',
                              color: brand.primary,
                              borderColor: brand.primary,
                              backgroundColor: tokens.primaryLight,
                            }}
                            title="Excuse with official reason"
                          >
                            <FileCheck size={11} /> Excuse
                          </button>
                        </div>
                      ) : (
                        <span style={{ fontSize: '0.68rem', color: tokens.textMuted }}>Resolved</span>
                      )}
                    </td>
                  )}
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
};

export default LoafingMonitorPanel;
