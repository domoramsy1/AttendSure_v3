/**
 * AttendSure V3 - All-in-One Dashboard & System Maintenance Hub
 * Developer: TECHBLAZER
 * File: frontend/src/components/dashboard/DashboardView.tsx
 */

import React, { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { useAlert } from '../../context/AlertContext';
import apiClient from '../../api/client';
import {
  UserCheck,
  UserX,
  Clock,
  Send,
  Radio,
  RefreshCw,
  Scan,
  TrendingUp,
  FileSpreadsheet,
  Activity,
  Layers,
  Inbox,
  ChevronRight,
  ShieldAlert,
  BarChart3,
  CreditCard,
  Gauge,
  AlertOctagon,
  CheckCircle2,
  CalendarCheck,
  Coins,
  Cpu,
  Database,
  HardDrive,
  Server,
  XCircle,
  Ticket,
  WifiOff,
  Wrench,
  ShieldCheck,
  RotateCcw,
} from 'lucide-react';

interface HourlyScanItem {
  hour: string;
  count: number;
  height: number;
  is_peak: boolean;
}

interface GradeBreakdown {
  grade: string;
  present: number;
  total: number;
  percentage: number;
}

interface RecentScan {
  id: string | number;
  person_name: string;
  role_label: string;
  grade_section: string;
  direction: 'IN' | 'OUT';
  scan_time: string;
  scan_method: 'RFID' | 'QR';
}

interface BusinessAnalyticsData {
  sms_unit_cost?: number;
  rfid_count_today?: number;
  qr_count_today?: number;
  on_time_count?: number;
  tardy_count?: number;
  chronic_absent_count?: number;
  peak_throughput_rate?: number;
  average_latency_ms?: number;
}

interface DatabaseTelemetryData {
  status?: 'CONNECTED' | 'DISCONNECTED';
  database_name?: string;
  database_size_mb?: number;
  active_connections?: number;
  max_connections?: number;
  server_disk_used_gb?: number;
  server_disk_total_gb?: number;
  server_disk_percent?: number;
}

interface DashboardMetrics {
  total_students: number;
  students_present: number;
  students_absent: number;
  attendance_rate: number;
  faculty_on_duty: number;
  total_faculty: number;
  gate_scans_today: number;
  active_gate_passes: number;
  sms_sent_today: number;
  sms_pending_count: number;
  sms_failed_count?: number;
  kiosks_online: number;
  total_kiosks: number;
  hourly_scans: HourlyScanItem[];
  grade_levels: GradeBreakdown[];
  recent_scans: RecentScan[];
  analytics?: BusinessAnalyticsData;
  database?: DatabaseTelemetryData;
}

interface DashboardViewProps {
  isServerOnline?: boolean;
  userRole?: string;
  onGateStatusChange?: (online: boolean) => void;
  onManualRefresh?: () => void;
}

export const DashboardView: React.FC<DashboardViewProps> = ({
  isServerOnline = true,
  userRole,
  onGateStatusChange,
  onManualRefresh,
}) => {
  const { showAlert } = useAlert();

  const [loading, setLoading] = useState<boolean>(true);
  const [refreshing, setRefreshing] = useState<boolean>(false);
  const [lastSyncTime, setLastSyncTime] = useState<string>('');
  const [fetchFailed, setFetchFailed] = useState<boolean>(false);
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const isMounted = useRef<boolean>(true);

  const effectiveRole = (
    userRole ||
    localStorage.getItem('attendsure_role') ||
    'FACULTY'
  ).toUpperCase();
  const isAdmin = effectiveRole === 'ADMIN';

  const [data, setData] = useState<DashboardMetrics>({
    total_students: 0,
    students_present: 0,
    students_absent: 0,
    attendance_rate: 0,
    faculty_on_duty: 0,
    total_faculty: 0,
    gate_scans_today: 0,
    active_gate_passes: 0,
    sms_sent_today: 0,
    sms_pending_count: 0,
    sms_failed_count: 0,
    kiosks_online: 0,
    total_kiosks: 0,
    hourly_scans: [],
    grade_levels: [],
    recent_scans: [],
    analytics: {},
    database: {},
  });

  const isOnline = isServerOnline && !fetchFailed;

  const navigateTo = (detail: string | { tab: string; report?: string }) => {
    window.dispatchEvent(new CustomEvent('attendsure:navigate', { detail }));
  };

  const fetchDashboardData = useCallback(
    async (silent: boolean = false) => {
      try {
        if (!silent) setRefreshing(true);

        const res = await apiClient.get<DashboardMetrics>('/dashboard/overview/', {
          params: { silent: silent ? '1' : undefined },
          timeout: 5000,
        });

        if (isMounted.current && res.data) {
          setFetchFailed(false);
          const totalStudents = Number(res.data.total_students) || 0;
          const presentStudents = Number(res.data.students_present) || 0;
          const calculatedRate =
            totalStudents > 0
              ? Math.round((presentStudents / totalStudents) * 100)
              : Number(res.data.attendance_rate) || 0;

          const rawHourly = Array.isArray(res.data.hourly_scans) ? res.data.hourly_scans : [];
          const maxHourlyVolume = Math.max(...rawHourly.map((h) => Number(h.count) || 0), 1);
          const normalizedHourly = rawHourly.map((item) => {
            const count = Number(item.count) || 0;
            return {
              hour: item.hour,
              count,
              height: count > 0 ? Math.round((count / maxHourlyVolume) * 100) : 0,
              is_peak: Boolean(item.is_peak),
            };
          });

          setData({
            total_students: totalStudents,
            students_present: presentStudents,
            students_absent:
              Number(res.data.students_absent) || Math.max(0, totalStudents - presentStudents),
            attendance_rate: calculatedRate,
            faculty_on_duty: Number(res.data.faculty_on_duty) || 0,
            total_faculty: Number(res.data.total_faculty) || 0,
            gate_scans_today: Number(res.data.gate_scans_today) || 0,
            active_gate_passes: Number(res.data.active_gate_passes) || 0,
            sms_sent_today: Number(res.data.sms_sent_today) || 0,
            sms_pending_count: Number(res.data.sms_pending_count) || 0,
            sms_failed_count: Number(res.data.sms_failed_count) || 0,
            kiosks_online: Number(res.data.kiosks_online) || 0,
            total_kiosks: Number(res.data.total_kiosks) || 0,
            hourly_scans: normalizedHourly,
            grade_levels: (Array.isArray(res.data.grade_levels) ? res.data.grade_levels : []).map(
              (lvl) => ({
                ...lvl,
                present: Number(lvl.present) || 0,
                total: Number(lvl.total) || 0,
                percentage:
                  Number(lvl.total) > 0
                    ? Math.round((Number(lvl.present) / Number(lvl.total)) * 100)
                    : Number(lvl.percentage) || 0,
              })
            ),
            recent_scans: Array.isArray(res.data.recent_scans) ? res.data.recent_scans : [],
            analytics: res.data.analytics || {},
            database: res.data.database || {},
          });

          setLastSyncTime(
            new Date().toLocaleTimeString('en-US', {
              hour: '2-digit',
              minute: '2-digit',
              second: '2-digit',
              hour12: true,
            })
          );

          if (onGateStatusChange) {
            onGateStatusChange((Number(res.data.kiosks_online) || 0) > 0);
          }
        }
      } catch (err: any) {
        console.warn('[DashboardView] Server sync warning:', err.message);
        if (isMounted.current) {
          setFetchFailed(true);
          if (onGateStatusChange) onGateStatusChange(false);
        }
      } finally {
        if (isMounted.current) {
          setLoading(false);
          if (!silent) setRefreshing(false);
        }
      }
    },
    [onGateStatusChange]
  );

  useEffect(() => {
    isMounted.current = true;
    fetchDashboardData(false);

    const interval = setInterval(() => {
      fetchDashboardData(true);
    }, 15000);

    return () => {
      isMounted.current = false;
      clearInterval(interval);
    };
  }, [fetchDashboardData]);

  const handleManualSync = () => {
    fetchDashboardData(false);
    if (onManualRefresh) onManualRefresh();
  };

  // Run SysAdmin Maintenance Actions with instant alert feedback
  const runMaintenanceTask = async (taskName: string, endpoint: string) => {
    try {
      setActionLoading(taskName);
      const res = await apiClient.post(endpoint, {});
      showAlert({
        title: 'Task Completed',
        message: res.data?.message || `${taskName} was executed successfully.`,
        type: 'success',
      });
      fetchDashboardData(true);
    } catch (err: any) {
      const msg =
        err.response?.status === 404
          ? `Endpoint ${endpoint} not found on backend. Please ensure the URL is registered in Django.`
          : err.response?.data?.message || `Could not run ${taskName}. Check server logs.`;
      showAlert({
        title: 'Task Result',
        message: msg,
        type: 'warning',
      });
    } finally {
      setActionLoading(null);
    }
  };

  // Derived Business Analytics
  const analyticsMetrics = useMemo(() => {
    const raw = data.analytics || {};
    const unitCost = Number(raw.sms_unit_cost) || 0;
    const totalSmsCost = (data.sms_sent_today * unitCost).toFixed(2);
    const totalSmsDispatched = data.sms_sent_today + (data.sms_failed_count || 0);
    const smsSuccessRate =
      totalSmsDispatched > 0
        ? Math.round((data.sms_sent_today / totalSmsDispatched) * 100)
        : 0;

    const rfidScans = Number(raw.rfid_count_today) || 0;
    const qrScans = Number(raw.qr_count_today) || 0;
    const totalCredentials = rfidScans + qrScans;
    const rfidPercentage =
      totalCredentials > 0 ? Math.round((rfidScans / totalCredentials) * 100) : 0;
    const qrPercentage =
      totalCredentials > 0 ? Math.round((qrScans / totalCredentials) * 100) : 0;

    const onTimeCount = Number(raw.on_time_count) || 0;
    const tardyCount = Number(raw.tardy_count) || 0;
    const totalTurnout = onTimeCount + tardyCount;
    const punctualityRate =
      totalTurnout > 0 ? Math.round((onTimeCount / totalTurnout) * 100) : 0;

    const peakThroughput = Number(raw.peak_throughput_rate) || 0;
    const avgLatency = Number(raw.average_latency_ms) || 0;
    const chronicAbsent = Number(raw.chronic_absent_count) || 0;

    return {
      unitCost,
      totalSmsCost,
      smsSuccessRate,
      rfidScans,
      qrScans,
      totalCredentials,
      rfidPercentage,
      qrPercentage,
      onTimeCount,
      tardyCount,
      punctualityRate,
      peakThroughput,
      avgLatency,
      chronicAbsent,
    };
  }, [data]);

  // Derived Real Database Telemetry
  const dbMetrics = useMemo(() => {
    const raw = data.database || {};
    const isDbConnected = isOnline && (raw.status ? raw.status === 'CONNECTED' : true);
    const dbSize = Number(raw.database_size_mb) || 0;
    const activeConn = Number(raw.active_connections) || 1;
    const maxConn = Number(raw.max_connections) || 100;
    const diskUsed = Number(raw.server_disk_used_gb) || 0;
    const diskTotal = Number(raw.server_disk_total_gb) || 0;
    const diskPercent =
      diskTotal > 0
        ? Math.round((diskUsed / diskTotal) * 100)
        : Number(raw.server_disk_percent) || 0;

    return {
      isDbConnected,
      dbName: raw.database_name || 'attendsure_v3_db',
      dbSize,
      activeConn,
      maxConn,
      diskUsed,
      diskTotal,
      diskPercent,
    };
  }, [data, isOnline]);

  if (loading) {
    return (
      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          height: '100%',
          minHeight: 460,
          gap: 12,
        }}
      >
        <RefreshCw className="animate-spin" size={28} color="#0284c7" />
        <span style={{ fontSize: '0.85rem', color: '#64748b', fontWeight: 600 }}>
          Connecting to campus database &amp; hardware telemetry...
        </span>
      </div>
    );
  }

  const hasHourlyScans = isOnline && data.hourly_scans.some((h) => h.count > 0);

  return (
    <div
      style={{
        height: '100%',
        overflowY: 'auto',
        backgroundColor: '#f8fafc',
        padding: '18px 24px',
        boxSizing: 'border-box',
      }}
    >
      <div
        style={{
          maxWidth: 1280,
          margin: '0 auto',
          display: 'flex',
          flexDirection: 'column',
          gap: 18,
        }}
      >
        {/* ======================================================== */}
        {/* 1. TOP TELEMETRY STATUS BAR                              */}
        {/* ======================================================== */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            flexWrap: 'wrap',
            gap: 12,
            backgroundColor: '#ffffff',
            padding: '10px 16px',
            borderRadius: 10,
            border: `1px solid ${isOnline ? '#e2e8f0' : '#fecaca'}`,
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
            <span
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: 5,
                padding: '3px 10px',
                borderRadius: 12,
                backgroundColor: isOnline ? '#ecfdf5' : '#fee2e2',
                color: isOnline ? '#059669' : '#dc2626',
                fontSize: '0.66rem',
                fontWeight: 800,
                letterSpacing: '0.5px',
                border: `1px solid ${isOnline ? '#a7f3d0' : '#fca5a5'}`,
              }}
            >
              <span
                style={{
                  width: 6,
                  height: 6,
                  borderRadius: '50%',
                  backgroundColor: isOnline ? '#10b981' : '#dc2626',
                }}
              />
              {isOnline ? 'DATABASE LIVE' : 'DATABASE OFFLINE'}
            </span>

            {isAdmin ? (
              <>
                <div
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: 5,
                    fontSize: '0.72rem',
                    fontWeight: 700,
                    color: dbMetrics.isDbConnected ? '#059669' : '#dc2626',
                  }}
                >
                  <Database size={13} />
                  <span>
                    PostgreSQL: {dbMetrics.isDbConnected ? 'Connected' : 'Disconnected'}
                    {isOnline ? ` (${dbMetrics.activeConn}/${dbMetrics.maxConn} conns)` : ' (Server Unreachable)'}
                  </span>
                </div>

                <span style={{ color: '#cbd5e1' }}>&bull;</span>

                <div
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: 5,
                    fontSize: '0.72rem',
                    fontWeight: 700,
                    color: isOnline && data.kiosks_online > 0 ? '#0284c7' : '#94a3b8',
                  }}
                >
                  <Radio size={13} />
                  <span>
                    Terminals: {isOnline ? `${data.kiosks_online}/${data.total_kiosks} Online` : 'Offline'}
                  </span>
                </div>

                <span style={{ color: '#cbd5e1' }}>&bull;</span>

                <div
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: 5,
                    fontSize: '0.72rem',
                    fontWeight: 700,
                    color: isOnline ? '#475569' : '#94a3b8',
                  }}
                >
                  <HardDrive size={13} />
                  <span>
                    Disk: {isOnline && dbMetrics.diskPercent > 0 ? `${dbMetrics.diskPercent}% Used` : 'Monitoring'}
                  </span>
                </div>
              </>
            ) : (
              <span style={{ fontSize: '0.74rem', color: '#64748b', fontWeight: 600 }}>
                Campus Gate &amp; Roster Systems Active
              </span>
            )}
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            {lastSyncTime && (
              <span style={{ fontSize: '0.70rem', color: '#64748b', fontFamily: 'monospace' }}>
                Synced: {lastSyncTime}
              </span>
            )}

            <button
              onClick={handleManualSync}
              disabled={refreshing}
              title="Refresh Numbers"
              style={{
                ...refreshBtnStyle,
                borderColor: isOnline ? '#cbd5e1' : '#f87171',
                backgroundColor: isOnline ? '#ffffff' : '#fef2f2',
              }}
              type="button"
            >
              <RefreshCw
                size={13}
                className={refreshing ? 'animate-spin' : ''}
                color={isOnline ? '#334155' : '#dc2626'}
              />
              <span
                style={{
                  fontSize: '0.74rem',
                  fontWeight: 700,
                  color: isOnline ? '#334155' : '#dc2626',
                }}
              >
                {refreshing ? 'Connecting...' : isOnline ? 'Sync Live Data' : 'Retry Connection'}
              </span>
            </button>
          </div>
        </div>

        {/* ======================================================== */}
        {/* 2. ADMIN ONLY: SYSTEM MAINTENANCE CONSOLE                */}
        {/* ======================================================== */}
        {isAdmin && (
          <div
            style={{
              backgroundColor: '#0f172a',
              borderRadius: 12,
              padding: '16px 20px',
              color: '#ffffff',
              display: 'flex',
              flexDirection: 'column',
              gap: 12,
              boxShadow: '0 4px 14px rgba(15, 23, 42, 0.12)',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 8 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <Wrench size={18} color="#38bdf8" />
                <span style={{ fontSize: '0.90rem', fontWeight: 800, letterSpacing: '0.02em' }}>
                  System Administrator &amp; Maintenance Console
                </span>
                <span
                  style={{
                    fontSize: '0.62rem',
                    fontWeight: 800,
                    backgroundColor: '#0284c7',
                    padding: '2px 6px',
                    borderRadius: 4,
                  }}
                >
                  MAINTENANCE
                </span>
              </div>
              <span style={{ fontSize: '0.70rem', color: '#94a3b8' }}>
                Hardware Pings • Telemetry Tests • Database Health Checks
              </span>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 10 }}>
              <button
                type="button"
                disabled={!isOnline || actionLoading !== null}
                onClick={() => runMaintenanceTask('Ping Gate Scanners', '/telemetry/ping-scanners/')}
                style={adminActionBtn}
              >
                <Radio size={14} color="#38bdf8" />
                <span>{actionLoading === 'Ping Gate Scanners' ? 'Pinging...' : 'Ping Gate Scanners'}</span>
              </button>

              <button
                type="button"
                disabled={!isOnline || actionLoading !== null}
                onClick={() => runMaintenanceTask('Test SMS Gateway', '/sms/test-gateway/')}
                style={adminActionBtn}
              >
                <Send size={14} color="#38bdf8" />
                <span>{actionLoading === 'Test SMS Gateway' ? 'Testing...' : 'Test SMS Gateway'}</span>
              </button>

              <button
                type="button"
                disabled={!isOnline || actionLoading !== null}
                onClick={() => runMaintenanceTask('Check Database Health', '/core/maintenance/db-check/')}
                style={adminActionBtn}
              >
                <Database size={14} color="#38bdf8" />
                <span>{actionLoading === 'Check Database Health' ? 'Checking...' : 'Check Database Health'}</span>
              </button>

              <button
                type="button"
                disabled={!isOnline || actionLoading !== null}
                onClick={() => runMaintenanceTask('Flush Cache', '/core/maintenance/flush-cache/')}
                style={adminActionBtn}
              >
                <RotateCcw size={14} color="#38bdf8" />
                <span>{actionLoading === 'Flush Cache' ? 'Flushing...' : 'Flush Cache'}</span>
              </button>
            </div>
          </div>
        )}

        {/* ======================================================== */}
        {/* 3. CORE ATTENDANCE KPIS                                  */}
        {/* ======================================================== */}
        <div style={kpiGrid}>
          {/* Students in School */}
          <div style={kpiCard}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
              <div>
                <span style={kpiLabel}>STUDENTS IN SCHOOL</span>
                <div style={{ ...kpiValue, color: isOnline ? '#0f172a' : '#94a3b8' }}>
                  {isOnline ? data.students_present.toLocaleString() : '—'}
                </div>
              </div>
              <div
                style={{
                  ...kpiIconBox,
                  backgroundColor: isOnline ? '#ecfdf5' : '#f1f5f9',
                  color: isOnline ? '#059669' : '#94a3b8',
                }}
              >
                <UserCheck size={20} />
              </div>
            </div>
            <div style={kpiFooter}>
              {isOnline ? (
                <>
                  <span style={{ color: '#059669', fontWeight: 800 }}>{data.attendance_rate}%</span>
                  <span style={kpiSubtext}>
                    of {data.total_students.toLocaleString()} enrolled learners
                  </span>
                </>
              ) : (
                <span style={{ color: '#dc2626', fontWeight: 600 }}>Server Disconnected</span>
              )}
            </div>
          </div>

          {/* Absent Students */}
          <div style={kpiCard}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
              <div>
                <span style={kpiLabel}>ABSENT LEARNERS</span>
                <div
                  style={{
                    ...kpiValue,
                    color: !isOnline
                      ? '#94a3b8'
                      : data.students_absent > 0
                      ? '#e11d48'
                      : '#0f172a',
                  }}
                >
                  {isOnline ? data.students_absent.toLocaleString() : '—'}
                </div>
              </div>
              <div
                style={{
                  ...kpiIconBox,
                  backgroundColor: isOnline ? '#fff1f2' : '#f1f5f9',
                  color: isOnline ? '#e11d48' : '#94a3b8',
                }}
              >
                <UserX size={20} />
              </div>
            </div>
            <div style={kpiFooter}>
              <span style={kpiSubtext}>
                {isOnline
                  ? data.students_present === 0
                    ? 'No check-ins recorded for today yet'
                    : `${data.students_absent} learners unverified`
                  : 'Telemetry unavailable'}
              </span>
            </div>
          </div>

          {/* Faculty on Duty */}
          <div style={kpiCard}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
              <div>
                <span style={kpiLabel}>TEACHERS ON DUTY</span>
                <div style={{ ...kpiValue, color: isOnline ? '#0f172a' : '#94a3b8' }}>
                  {isOnline ? (
                    <>
                      {data.faculty_on_duty}
                      <span style={{ fontSize: '0.85rem', color: '#64748b', fontWeight: 500 }}>
                        /{data.total_faculty}
                      </span>
                    </>
                  ) : (
                    '—'
                  )}
                </div>
              </div>
              <div
                style={{
                  ...kpiIconBox,
                  backgroundColor: isOnline ? '#f0fdf4' : '#f1f5f9',
                  color: isOnline ? '#16a34a' : '#94a3b8',
                }}
              >
                <Clock size={20} />
              </div>
            </div>
            <div style={kpiFooter}>
              <span style={kpiSubtext}>
                {isOnline ? 'Faculty Daily Time Record (CSC Form 48)' : 'Database link required'}
              </span>
            </div>
          </div>

          {/* Gate Scans Today */}
          <div
            style={{ ...kpiCard, cursor: isOnline ? 'pointer' : 'default' }}
            role="button"
            tabIndex={0}
            onClick={() => isOnline && navigateTo('gate-logs')}
            onKeyDown={(e) => {
              if (isOnline && (e.key === 'Enter' || e.key === ' ')) {
                e.preventDefault();
                navigateTo('gate-logs');
              }
            }}
            title={isOnline ? 'Inspect Turnstile Scans' : 'Offline'}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
              <div>
                <span style={kpiLabel}>TOTAL GATE SCANS</span>
                <div style={{ ...kpiValue, color: isOnline ? '#0f172a' : '#94a3b8' }}>
                  {isOnline ? data.gate_scans_today.toLocaleString() : '—'}
                </div>
              </div>
              <div
                style={{
                  ...kpiIconBox,
                  backgroundColor: isOnline ? '#eff6ff' : '#f1f5f9',
                  color: isOnline ? '#0284c7' : '#94a3b8',
                }}
              >
                <Scan size={20} />
              </div>
            </div>
            <div style={kpiFooter}>
              {isOnline ? (
                <span
                  style={{
                    color: '#0284c7',
                    fontWeight: 700,
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: 4,
                  }}
                >
                  <Ticket size={12} /> {data.active_gate_passes} Active Gate Passes
                </span>
              ) : (
                <span style={{ color: '#94a3b8' }}>Hardware queue disconnected</span>
              )}
            </div>
          </div>
        </div>

        {/* ======================================================== */}
        {/* 4. ADMIN ONLY: BUSINESS & TELEMETRY                      */}
        {/* ======================================================== */}
        {isAdmin && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <BarChart3 size={17} color={isOnline ? '#0284c7' : '#94a3b8'} />
                <h2 style={{ fontSize: '0.96rem', fontWeight: 800, color: '#0f172a', margin: 0 }}>
                  Business Analytics &amp; Hardware Telemetry
                </h2>
              </div>
              <span style={{ fontSize: '0.70rem', color: '#64748b' }}>
                Carrier billing, turnstile throughput, and compliance metrics
              </span>
            </div>

            <div style={analyticsGrid}>
              {/* 1. SMS Telco Expense */}
              <div style={analyticsCard}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                  <div>
                    <span style={kpiLabel}>SMS TELCO EXPENDITURE TODAY</span>
                    <div style={{ ...kpiValue, color: isOnline ? '#0284c7' : '#94a3b8' }}>
                      {isOnline ? `₱${analyticsMetrics.totalSmsCost}` : '—'}
                    </div>
                  </div>
                  <div style={{ ...kpiIconBox, backgroundColor: '#f0f9ff', color: '#0284c7' }}>
                    <Coins size={20} />
                  </div>
                </div>
                <div style={{ marginTop: 10, fontSize: '0.72rem', color: '#475569', lineHeight: 1.5 }}>
                  {isOnline ? (
                    <>
                      <div>
                        Sent: <strong>{data.sms_sent_today.toLocaleString()}</strong> messages
                        {analyticsMetrics.unitCost > 0 &&
                          ` @ ₱${analyticsMetrics.unitCost.toFixed(2)}/SMS`}
                      </div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 4 }}>
                        <span
                          style={{
                            color: analyticsMetrics.smsSuccessRate > 0 ? '#059669' : '#64748b',
                            fontWeight: 700,
                          }}
                        >
                          {analyticsMetrics.smsSuccessRate}% Success SLA
                        </span>
                        <span style={{ color: '#94a3b8' }}>&bull;</span>
                        <span style={{ color: '#64748b' }}>
                          Queue: {data.sms_pending_count} pending
                        </span>
                      </div>
                    </>
                  ) : (
                    <span style={{ color: '#94a3b8' }}>Outbox statistics paused</span>
                  )}
                </div>
              </div>

              {/* 2. Turnstile Velocity & Latency */}
              <div style={analyticsCard}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                  <div>
                    <span style={kpiLabel}>PEAK SCAN VELOCITY</span>
                    <div style={{ ...kpiValue, color: isOnline ? '#0f172a' : '#94a3b8' }}>
                      {isOnline ? (
                        <>
                          {analyticsMetrics.peakThroughput}{' '}
                          <span style={{ fontSize: '0.80rem', color: '#64748b', fontWeight: 600 }}>
                            scans/min
                          </span>
                        </>
                      ) : (
                        '—'
                      )}
                    </div>
                  </div>
                  <div style={{ ...kpiIconBox, backgroundColor: '#f5f3ff', color: '#7c3aed' }}>
                    <Gauge size={20} />
                  </div>
                </div>
                <div style={{ marginTop: 10, fontSize: '0.72rem', color: '#475569', lineHeight: 1.5 }}>
                  {isOnline ? (
                    <>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                        <Cpu size={13} color="#7c3aed" />
                        <span>
                          Avg Latency: <strong>{analyticsMetrics.avgLatency}ms</strong>
                        </span>
                      </div>
                      <div style={{ color: '#64748b', marginTop: 4 }}>
                        Terminals: <strong>{data.kiosks_online} active</strong> out of {data.total_kiosks}
                      </div>
                    </>
                  ) : (
                    <span style={{ color: '#94a3b8' }}>Scanner network inactive</span>
                  )}
                </div>
              </div>

              {/* 3. Credential Split */}
              <div style={analyticsCard}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                  <div>
                    <span style={kpiLabel}>CREDENTIAL ADOPTION SPLIT</span>
                    <div style={{ ...kpiValue, fontSize: '1.25rem', color: isOnline ? '#0f172a' : '#94a3b8' }}>
                      {isOnline
                        ? `${analyticsMetrics.rfidPercentage}% RFID • ${analyticsMetrics.qrPercentage}% QR`
                        : '—'}
                    </div>
                  </div>
                  <div style={{ ...kpiIconBox, backgroundColor: '#eff6ff', color: '#0284c7' }}>
                    <CreditCard size={20} />
                  </div>
                </div>
                <div style={{ marginTop: 10 }}>
                  <div style={progressBarTrack}>
                    <div
                      style={{
                        ...progressBarFill,
                        width: isOnline ? `${analyticsMetrics.rfidPercentage}%` : '0%',
                        backgroundColor: '#0284c7',
                      }}
                    />
                  </div>
                  <div
                    style={{
                      display: 'flex',
                      justifyContent: 'space-between',
                      fontSize: '0.68rem',
                      color: '#64748b',
                      marginTop: 6,
                    }}
                  >
                    <span>RFID: {isOnline ? analyticsMetrics.rfidScans : '—'}</span>
                    <span>QR: {isOnline ? analyticsMetrics.qrScans : '—'}</span>
                  </div>
                </div>
              </div>

              {/* 4. Punctuality Rate */}
              <div style={analyticsCard}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                  <div>
                    <span style={kpiLabel}>PUNCTUALITY RATE</span>
                    <div style={{ ...kpiValue, color: isOnline ? '#059669' : '#94a3b8' }}>
                      {isOnline ? `${analyticsMetrics.punctualityRate}%` : '—'}
                    </div>
                  </div>
                  <div style={{ ...kpiIconBox, backgroundColor: '#ecfdf5', color: '#059669' }}>
                    <CalendarCheck size={20} />
                  </div>
                </div>
                <div style={{ marginTop: 10, fontSize: '0.72rem', color: '#475569', lineHeight: 1.5 }}>
                  {isOnline ? (
                    <>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                        <CheckCircle2 size={13} color="#059669" />
                        <span>
                          On-Time: <strong>{analyticsMetrics.onTimeCount}</strong> | Tardy:{' '}
                          <strong>{analyticsMetrics.tardyCount}</strong>
                        </span>
                      </div>
                      <div
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          gap: 4,
                          marginTop: 4,
                          color: analyticsMetrics.chronicAbsent > 0 ? '#dc2626' : '#64748b',
                        }}
                      >
                        <AlertOctagon size={13} />
                        <span>
                          Chronic Truancy: <strong>{analyticsMetrics.chronicAbsent} learners</strong>
                        </span>
                      </div>
                    </>
                  ) : (
                    <span style={{ color: '#94a3b8' }}>Punctuality analytics paused</span>
                  )}
                </div>
              </div>
            </div>
          </div>
        )}

        {/* ======================================================== */}
        {/* 5. ADMIN ONLY: REAL DATABASE & STORAGE TELEMETRY         */}
        {/* ======================================================== */}
        {isAdmin && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <Server size={17} color={isOnline ? '#0284c7' : '#94a3b8'} />
                <h2 style={{ fontSize: '0.96rem', fontWeight: 800, color: '#0f172a', margin: 0 }}>
                  System Health, Database &amp; Storage Capacity
                </h2>
              </div>
              <span style={{ fontSize: '0.70rem', color: '#64748b' }}>
                Real PostgreSQL metrics, active connections, and hardware disk footprint
              </span>
            </div>

            <div style={systemGrid}>
              {/* PostgreSQL Instance */}
              <div
                style={{
                  ...systemCard,
                  borderColor: dbMetrics.isDbConnected ? '#e2e8f0' : '#fecaca',
                }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <Database size={16} color={dbMetrics.isDbConnected ? '#0284c7' : '#dc2626'} />
                    <span style={{ fontSize: '0.80rem', fontWeight: 700, color: '#0f172a' }}>
                      PostgreSQL Instance
                    </span>
                  </div>
                  <span
                    style={{
                      ...badgeStyle,
                      backgroundColor: dbMetrics.isDbConnected ? '#ecfdf5' : '#fee2e2',
                      color: dbMetrics.isDbConnected ? '#059669' : '#dc2626',
                      border: `1px solid ${dbMetrics.isDbConnected ? '#a7f3d0' : '#fca5a5'}`,
                    }}
                  >
                    {dbMetrics.isDbConnected ? (
                      <>
                        <CheckCircle2 size={11} /> READY
                      </>
                    ) : (
                      <>
                        <XCircle size={11} /> DISCONNECTED
                      </>
                    )}
                  </span>
                </div>
                <div style={{ marginTop: 10, fontSize: '0.72rem', color: '#475569', lineHeight: 1.6 }}>
                  <div>
                    Database Schema:{' '}
                    <strong style={{ fontFamily: 'monospace' }}>
                      {isOnline ? dbMetrics.dbName : 'Unavailable'}
                    </strong>
                  </div>
                  <div>
                    Database Footprint:{' '}
                    <strong>
                      {isOnline
                        ? dbMetrics.dbSize > 0
                          ? `${dbMetrics.dbSize.toFixed(2)} MB`
                          : 'Calculated at next sync'
                        : '—'}
                    </strong>
                  </div>
                </div>
              </div>

              {/* Active Connection Pool */}
              <div style={systemCard}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <Activity size={16} color={isOnline ? '#7c3aed' : '#94a3b8'} />
                    <span style={{ fontSize: '0.80rem', fontWeight: 700, color: '#0f172a' }}>
                      Active Connection Pool
                    </span>
                  </div>
                  <span style={{ fontSize: '0.76rem', fontWeight: 800, color: isOnline ? '#0f172a' : '#94a3b8' }}>
                    {isOnline ? `${dbMetrics.activeConn} / ${dbMetrics.maxConn}` : '—'}
                  </span>
                </div>
                <div style={{ marginTop: 10 }}>
                  <div style={progressBarTrack}>
                    <div
                      style={{
                        ...progressBarFill,
                        width: isOnline
                          ? `${Math.max(
                              3,
                              Math.min(100, Math.round((dbMetrics.activeConn / dbMetrics.maxConn) * 100))
                            )}%`
                          : '0%',
                        backgroundColor: '#7c3aed',
                      }}
                    />
                  </div>
                  <div style={{ fontSize: '0.68rem', color: '#64748b', marginTop: 6 }}>
                    {isOnline ? (
                      <>
                        Pool Load:{' '}
                        <strong>
                          {Math.max(1, Math.round((dbMetrics.activeConn / dbMetrics.maxConn) * 100))}%
                        </strong>{' '}
                        active server sessions
                      </>
                    ) : (
                      'Pool monitoring offline'
                    )}
                  </div>
                </div>
              </div>

              {/* Server Disk Capacity */}
              <div style={systemCard}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <HardDrive size={16} color={isOnline ? '#059669' : '#94a3b8'} />
                    <span style={{ fontSize: '0.80rem', fontWeight: 700, color: '#0f172a' }}>
                      Server Disk Capacity
                    </span>
                  </div>
                  <span style={{ fontSize: '0.76rem', fontWeight: 800, color: isOnline ? '#0f172a' : '#94a3b8' }}>
                    {isOnline && dbMetrics.diskPercent > 0 ? `${dbMetrics.diskPercent}%` : 'Monitoring'}
                  </span>
                </div>
                <div style={{ marginTop: 10 }}>
                  <div style={progressBarTrack}>
                    <div
                      style={{
                        ...progressBarFill,
                        width: isOnline && dbMetrics.diskPercent > 0 ? `${dbMetrics.diskPercent}%` : '20%',
                        backgroundColor: dbMetrics.diskPercent >= 85 ? '#e11d48' : '#059669',
                      }}
                    />
                  </div>
                  <div style={{ fontSize: '0.68rem', color: '#64748b', marginTop: 6 }}>
                    {isOnline && dbMetrics.diskTotal > 0 ? (
                      <>
                        <strong>{dbMetrics.diskUsed.toFixed(1)} GB</strong> used of{' '}
                        <strong>{dbMetrics.diskTotal.toFixed(1)} GB</strong>
                      </>
                    ) : (
                      'Local drive storage active'
                    )}
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* ======================================================== */}
        {/* 6. HOURLY TURNOUT CURVE & RECENT GATE ACTIVITY           */}
        {/* ======================================================== */}
        <div style={twoColGrid}>
          {/* Hourly Arrivals Chart */}
          <div style={sectionCard}>
            <div style={sectionCardHeader}>
              <div>
                <h3 style={sectionTitle}>Arrivals by Hour</h3>
                <span style={sectionSubtitle}>Gate tap distribution recorded throughout today</span>
              </div>
              <div style={badgeStyle}>
                <TrendingUp size={12} color="#0284c7" />
                <span>Today&apos;s Curve</span>
              </div>
            </div>

            {hasHourlyScans ? (
              <div
                style={{
                  height: 190,
                  display: 'flex',
                  alignItems: 'flex-end',
                  gap: 10,
                  padding: '14px 4px 6px 4px',
                }}
              >
                {data.hourly_scans.map((item, idx) => (
                  <div
                    key={idx}
                    style={{
                      flex: 1,
                      display: 'flex',
                      flexDirection: 'column',
                      alignItems: 'center',
                      height: '100%',
                      justifyContent: 'flex-end',
                    }}
                  >
                    <span
                      style={{
                        fontSize: '0.64rem',
                        fontWeight: 700,
                        color: item.is_peak ? '#0284c7' : '#64748b',
                        marginBottom: 4,
                      }}
                    >
                      {item.count > 0 ? item.count : ''}
                    </span>
                    <div
                      style={{
                        width: '100%',
                        maxWidth: 32,
                        height: `${item.height}%`,
                        backgroundColor: item.is_peak
                          ? '#0284c7'
                          : item.count > 0
                          ? '#93c5fd'
                          : '#e2e8f0',
                        borderRadius: '4px 4px 0 0',
                        transition: 'height 0.3s ease',
                      }}
                    />
                    <span
                      style={{
                        fontSize: '0.62rem',
                        fontWeight: 600,
                        color: '#64748b',
                        marginTop: 6,
                      }}
                    >
                      {item.hour}
                    </span>
                  </div>
                ))}
              </div>
            ) : (
              <div style={emptyBox}>
                {!isOnline ? (
                  <>
                    <WifiOff size={26} color="#dc2626" />
                    <span style={{ fontSize: '0.78rem', color: '#991b1b', marginTop: 6, fontWeight: 700 }}>
                      Backend Disconnected
                    </span>
                    <span style={{ fontSize: '0.70rem', color: '#94a3b8' }}>
                      Re-establish server connection to render turnstile distribution curve.
                    </span>
                  </>
                ) : (
                  <>
                    <Inbox size={26} color="#94a3b8" />
                    <span style={{ fontSize: '0.78rem', color: '#64748b', marginTop: 6, fontWeight: 600 }}>
                      No Gate Check-ins Recorded Today
                    </span>
                    <span style={{ fontSize: '0.70rem', color: '#94a3b8' }}>
                      Logs update automatically when learners scan their card or QR code at the turnstile.
                    </span>
                  </>
                )}
              </div>
            )}
          </div>

          {/* Latest Gate Activity Feed */}
          <div style={sectionCard}>
            <div style={sectionCardHeader}>
              <div>
                <h3 style={sectionTitle}>Latest Gate Scans</h3>
                <span style={sectionSubtitle}>Real-time check-ins from the school gate scanners</span>
              </div>
              <button
                type="button"
                disabled={!isOnline}
                onClick={() => navigateTo('gate-logs')}
                style={{ ...textLinkBtn, color: isOnline ? '#0284c7' : '#94a3b8' }}
              >
                View All
              </button>
            </div>

            {isOnline && data.recent_scans.length > 0 ? (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginTop: 4 }}>
                {data.recent_scans.map((scan) => (
                  <div key={scan.id} style={scanRow}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                      <div
                        style={{
                          ...directionBadge,
                          backgroundColor: scan.direction === 'IN' ? '#ecfdf5' : '#fef2f2',
                          color: scan.direction === 'IN' ? '#059669' : '#dc2626',
                        }}
                      >
                        {scan.direction}
                      </div>
                      <div>
                        <div style={{ fontSize: '0.80rem', fontWeight: 700, color: '#0f172a' }}>
                          {scan.person_name}
                        </div>
                        <div style={{ fontSize: '0.68rem', color: '#64748b' }}>
                          {scan.grade_section} &bull; {scan.scan_method} Tap
                        </div>
                      </div>
                    </div>

                    <div style={{ textAlign: 'right' }}>
                      <div style={{ fontSize: '0.74rem', fontWeight: 700, color: '#1e293b' }}>
                        {scan.scan_time}
                      </div>
                      <span style={{ fontSize: '0.62rem', color: '#059669', fontWeight: 600 }}>
                        Recorded
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div style={emptyBox}>
                {!isOnline ? (
                  <>
                    <WifiOff size={26} color="#dc2626" />
                    <span style={{ fontSize: '0.78rem', color: '#991b1b', marginTop: 6, fontWeight: 700 }}>
                      Live Feed Offline
                    </span>
                    <span style={{ fontSize: '0.70rem', color: '#94a3b8' }}>
                      Cannot read turnstile buffer. Waiting for server reconnect.
                    </span>
                  </>
                ) : (
                  <>
                    <Inbox size={26} color="#94a3b8" />
                    <span style={{ fontSize: '0.78rem', color: '#64748b', marginTop: 6, fontWeight: 600 }}>
                      No Gate Scans Recorded Today
                    </span>
                    <span style={{ fontSize: '0.70rem', color: '#94a3b8' }}>
                      Waiting for student or faculty gate taps.
                    </span>
                  </>
                )}
              </div>
            )}
          </div>
        </div>

        {/* ======================================================== */}
        {/* 7. GRADE TURNOUT & OPERATIONAL CONSOLE                   */}
        {/* ======================================================== */}
        <div style={bottomGrid}>
          {/* Class Attendance by Grade Level */}
          <div style={sectionCard}>
            <div style={sectionCardHeader}>
              <div>
                <h3 style={sectionTitle}>Class Attendance by Grade Level</h3>
                <span style={sectionSubtitle}>Today&apos;s learner turnout across grade levels</span>
              </div>
              <Layers size={16} color="#64748b" />
            </div>

            {isOnline && data.grade_levels.length > 0 ? (
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginTop: 4 }}>
                {data.grade_levels.map((lvl, index) => (
                  <div key={index} style={gradeCard}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
                      <span style={{ fontSize: '0.76rem', fontWeight: 700, color: '#1e293b' }}>
                        {lvl.grade}
                      </span>
                      <span
                        style={{
                          fontSize: '0.76rem',
                          fontWeight: 800,
                          color: lvl.percentage >= 80 ? '#059669' : '#d97706',
                        }}
                      >
                        {lvl.percentage}%
                      </span>
                    </div>
                    <div style={progressBarTrack}>
                      <div
                        style={{
                          ...progressBarFill,
                          width: `${lvl.percentage}%`,
                          backgroundColor: lvl.percentage >= 80 ? '#10b981' : '#f59e0b',
                          transition: 'width 0.4s ease',
                        }}
                      />
                    </div>
                    <div style={{ fontSize: '0.66rem', color: '#64748b', marginTop: 4 }}>
                      {lvl.present} present out of {lvl.total}
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div style={emptyBox}>
                <span
                  style={{
                    fontSize: '0.78rem',
                    color: isOnline ? '#64748b' : '#991b1b',
                    fontWeight: isOnline ? 400 : 600,
                  }}
                >
                  {isOnline
                    ? 'No grade levels or enrolled students found in database.'
                    : 'Grade roster data unavailable while backend is offline.'}
                </span>
              </div>
            )}
          </div>

          {/* Quick Actions & Parent SMS Gateway */}
          <div style={sectionCard}>
            <div style={sectionCardHeader}>
              <div>
                <h3 style={sectionTitle}>Parent SMS &amp; Quick Actions</h3>
                <span style={sectionSubtitle}>
                  {isAdmin ? 'Modem queue and gate controls' : 'Quick teacher departure permissions'}
                </span>
              </div>
              <Send size={15} color={isOnline ? '#0284c7' : '#94a3b8'} />
            </div>

            {isAdmin ? (
              <div
                style={{ ...smsStatusBox, cursor: isOnline ? 'pointer' : 'default' }}
                role="button"
                tabIndex={0}
                onClick={() => isOnline && navigateTo('sms')}
                onKeyDown={(e) => {
                  if (isOnline && (e.key === 'Enter' || e.key === ' ')) {
                    e.preventDefault();
                    navigateTo('sms');
                  }
                }}
                title={isOnline ? 'Open SMS Outbox & Hardware Gateway' : 'Offline'}
              >
                <div>
                  <div style={{ fontSize: '0.78rem', fontWeight: 700, color: '#0f172a' }}>
                    {isOnline
                      ? `${data.sms_sent_today.toLocaleString()} Parent SMS Sent Today`
                      : 'SMS Dispatcher Offline'}
                  </div>
                  <div style={{ fontSize: '0.66rem', color: '#64748b', marginTop: 2 }}>
                    {isOnline ? (
                      <>
                        {data.sms_pending_count} pending messages in queue
                        {Boolean(data.sms_failed_count && data.sms_failed_count > 0) && (
                          <span style={{ color: '#dc2626', fontWeight: 700, marginLeft: 6 }}>
                            &bull; {data.sms_failed_count} failed
                          </span>
                        )}
                      </>
                    ) : (
                      'Cannot read modem status'
                    )}
                  </div>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  {isOnline ? (
                    Boolean(data.sms_failed_count && data.sms_failed_count > 0) ? (
                      <span
                        style={{
                          ...activeBadge,
                          backgroundColor: '#fee2e2',
                          color: '#dc2626',
                          border: '1px solid #fecaca',
                        }}
                      >
                        <ShieldAlert size={10} style={{ marginRight: 3, verticalAlign: 'middle' }} />
                        ATTENTION
                      </span>
                    ) : (
                      <span style={activeBadge}>SMS GATEWAY</span>
                    )
                  ) : (
                    <span style={{ ...activeBadge, backgroundColor: '#94a3b8' }}>OFFLINE</span>
                  )}
                  <ChevronRight size={14} color={isOnline ? '#0284c7' : '#94a3b8'} />
                </div>
              </div>
            ) : (
              <div
                style={{
                  padding: '12px 14px',
                  backgroundColor: '#f0fdf4',
                  border: '1px solid #bbf7d0',
                  borderRadius: 8,
                  display: 'flex',
                  alignItems: 'center',
                  gap: 10,
                }}
              >
                <ShieldCheck size={20} color="#166534" />
                <span style={{ fontSize: '0.78rem', color: '#166534', fontWeight: 600 }}>
                  Automated parent SMS arrival notifications are active across all turnstiles.
                </span>
              </div>
            )}

            {/* Role-Specific Actions */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginTop: 12 }}>
              <button
                type="button"
                disabled={!isOnline}
                style={{ ...actionBtnStyle, opacity: isOnline ? 1 : 0.6, cursor: isOnline ? 'pointer' : 'not-allowed' }}
                onClick={() => navigateTo('gate-passes')}
              >
                <Activity size={14} color={isOnline ? '#0284c7' : '#94a3b8'} />
                <span>Issue Student Gate Pass / Exit Permit</span>
              </button>

              <button
                type="button"
                disabled={!isOnline}
                style={{ ...actionBtnStyle, opacity: isOnline ? 1 : 0.6, cursor: isOnline ? 'pointer' : 'not-allowed' }}
                onClick={() => navigateTo({ tab: 'reports', report: 'sf2' })}
              >
                <FileSpreadsheet size={14} color={isOnline ? '#059669' : '#94a3b8'} />
                <span>Open Daily Attendance Register (SF2)</span>
              </button>

              {!isAdmin && (
                <button
                  type="button"
                  disabled={!isOnline}
                  style={{ ...actionBtnStyle, opacity: isOnline ? 1 : 0.6, cursor: isOnline ? 'pointer' : 'not-allowed' }}
                  onClick={() => navigateTo('dtr')}
                >
                  <Clock size={14} color={isOnline ? '#7c3aed' : '#94a3b8'} />
                  <span>View My Daily Time Record (DTR Form 48)</span>
                </button>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default DashboardView;

// ============================================================================
// STYLES
// ============================================================================

const refreshBtnStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: 6,
  padding: '6px 12px',
  border: '1px solid #cbd5e1',
  borderRadius: 8,
  cursor: 'pointer',
  transition: 'all 0.15s ease',
};

const adminActionBtn: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  gap: 8,
  padding: '8px 12px',
  backgroundColor: '#1e293b',
  border: '1px solid #334155',
  borderRadius: 8,
  color: '#ffffff',
  fontSize: '0.74rem',
  fontWeight: 700,
  cursor: 'pointer',
  transition: 'all 0.15s ease',
};

const kpiGrid: React.CSSProperties = {
  display: 'grid',
  gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
  gap: 16,
};

const analyticsGrid: React.CSSProperties = {
  display: 'grid',
  gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))',
  gap: 16,
};

const systemGrid: React.CSSProperties = {
  display: 'grid',
  gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))',
  gap: 16,
};

const kpiCard: React.CSSProperties = {
  backgroundColor: '#ffffff',
  borderRadius: 10,
  border: '1px solid #e2e8f0',
  padding: '16px 18px',
  boxShadow: '0 1px 2px rgba(0,0,0,0.02)',
};

const analyticsCard: React.CSSProperties = {
  backgroundColor: '#ffffff',
  borderRadius: 10,
  border: '1px solid #cbd5e1',
  padding: '16px 18px',
  boxShadow: '0 1px 3px rgba(0,0,0,0.03)',
  display: 'flex',
  flexDirection: 'column',
  justifyContent: 'space-between',
};

const systemCard: React.CSSProperties = {
  backgroundColor: '#ffffff',
  borderRadius: 10,
  border: '1px solid #e2e8f0',
  padding: '14px 16px',
  boxShadow: '0 1px 2px rgba(0,0,0,0.02)',
};

const kpiLabel: React.CSSProperties = {
  display: 'block',
  fontSize: '0.68rem',
  fontWeight: 700,
  color: '#64748b',
  marginBottom: 4,
  letterSpacing: '0.3px',
};

const kpiValue: React.CSSProperties = {
  fontSize: '1.60rem',
  fontWeight: 800,
  color: '#0f172a',
  lineHeight: 1.1,
};

const kpiIconBox: React.CSSProperties = {
  width: 38,
  height: 38,
  borderRadius: 8,
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  flexShrink: 0,
};

const kpiFooter: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: 6,
  marginTop: 10,
  paddingTop: 8,
  borderTop: '1px solid #f8fafc',
  fontSize: '0.72rem',
};

const kpiSubtext: React.CSSProperties = {
  color: '#94a3b8',
};

const twoColGrid: React.CSSProperties = {
  display: 'grid',
  gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))',
  gap: 16,
};

const bottomGrid: React.CSSProperties = {
  display: 'grid',
  gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))',
  gap: 16,
};

const sectionCard: React.CSSProperties = {
  backgroundColor: '#ffffff',
  borderRadius: 10,
  border: '1px solid #e2e8f0',
  padding: '16px 18px',
  boxShadow: '0 1px 2px rgba(0,0,0,0.02)',
};

const sectionCardHeader: React.CSSProperties = {
  display: 'flex',
  justifyContent: 'space-between',
  alignItems: 'flex-start',
  marginBottom: 12,
};

const sectionTitle: React.CSSProperties = {
  fontSize: '0.90rem',
  fontWeight: 800,
  color: '#0f172a',
  margin: 0,
};

const sectionSubtitle: React.CSSProperties = {
  fontSize: '0.70rem',
  color: '#64748b',
  marginTop: 2,
  display: 'block',
};

const badgeStyle: React.CSSProperties = {
  display: 'inline-flex',
  alignItems: 'center',
  gap: 4,
  padding: '3px 8px',
  borderRadius: 6,
  backgroundColor: '#f0f9ff',
  color: '#0284c7',
  fontSize: '0.68rem',
  fontWeight: 700,
};

const scanRow: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
  padding: '8px 10px',
  backgroundColor: '#f8fafc',
  borderRadius: 6,
  border: '1px solid #f1f5f9',
};

const directionBadge: React.CSSProperties = {
  padding: '2px 6px',
  borderRadius: 4,
  fontSize: '0.66rem',
  fontWeight: 800,
};

const gradeCard: React.CSSProperties = {
  padding: '8px 12px',
  backgroundColor: '#f8fafc',
  borderRadius: 6,
  border: '1px solid #f1f5f9',
};

const progressBarTrack: React.CSSProperties = {
  width: '100%',
  height: 6,
  backgroundColor: '#e2e8f0',
  borderRadius: 99,
  overflow: 'hidden',
};

const progressBarFill: React.CSSProperties = {
  height: '100%',
  borderRadius: 99,
};

const smsStatusBox: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
  padding: '10px 14px',
  backgroundColor: '#f0f9ff',
  borderRadius: 6,
  border: '1px solid #e0f2fe',
  transition: 'background-color 0.15s ease',
};

const activeBadge: React.CSSProperties = {
  padding: '2px 6px',
  borderRadius: 4,
  backgroundColor: '#0284c7',
  color: '#ffffff',
  fontSize: '0.60rem',
  fontWeight: 800,
};

const actionBtnStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: 10,
  width: '100%',
  padding: '9px 12px',
  backgroundColor: '#ffffff',
  border: '1px solid #e2e8f0',
  borderRadius: 6,
  fontSize: '0.76rem',
  fontWeight: 700,
  color: '#1e293b',
  cursor: 'pointer',
  textAlign: 'left',
};

const textLinkBtn: React.CSSProperties = {
  background: 'none',
  border: 'none',
  color: '#0284c7',
  fontSize: '0.72rem',
  fontWeight: 700,
  cursor: 'pointer',
  padding: 0,
};

const emptyBox: React.CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  alignItems: 'center',
  justifyContent: 'center',
  padding: '30px 16px',
  textAlign: 'center',
};