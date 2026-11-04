/**
 * AttendSure V3 - School Executive Dashboard & Telemetry Hub
 * Pure White Institutional Theme with Bento Quick-Action Launchpad & Right-Side Calendar Rail.
 * File: web/src/components/dashboard/DashboardView.tsx
 */

import React, { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import apiClient from '../../api/client';
import { useTheme } from '../../context/ThemeContext';
import {
  UserCheck,
  UserX,
  Clock,
  Radio,
  RefreshCw,
  Scan,
  TrendingUp,
  Inbox,
  Database,
  Ticket,
  CalendarCheck,
  Send,
  Users,
  ChevronLeft,
  ChevronRight,
  Bell,
  Sparkles,
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
  role_label?: string;
  grade_section: string;
  direction: 'IN' | 'OUT';
  scan_time: string;
  scan_method: 'RFID' | 'QR' | string;
}

interface CampusNotice {
  id: string | number;
  title: string;
  date: string;
  category: string;
  details: string;
}

interface CalendarEvent {
  date: string;
  title: string;
  is_holiday?: boolean;
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
  notices?: CampusNotice[];
  events?: CalendarEvent[];
  analytics?: Record<string, unknown>;
  database?: Record<string, unknown>;
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
  const { tokens, brand } = useTheme();

  const [loading, setLoading] = useState<boolean>(true);
  const [refreshing, setRefreshing] = useState<boolean>(false);
  const [lastSyncTime, setLastSyncTime] = useState<string>('');
  const [fetchFailed, setFetchFailed] = useState<boolean>(false);

  // Live Calendar State
  const [calendarDate, setCalendarDate] = useState<Date>(new Date());

  const isMounted = useRef<boolean>(true);
  const abortControllerRef = useRef<AbortController | null>(null);

  const effectiveRole = (userRole || localStorage.getItem('attendsure_role') || 'FACULTY').toUpperCase();
  const isAdmin = effectiveRole === 'ADMIN' || effectiveRole === 'PRINCIPAL';

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
    notices: [],
    events: [],
    analytics: {},
    database: {},
  });

  const isOnline = isServerOnline && !fetchFailed;

  const navigateTo = (detail: string | { tab: string; report?: string }) => {
    window.dispatchEvent(new CustomEvent('attendsure:navigate', { detail }));
  };

  const fetchDashboardData = useCallback(
    async (silent = false) => {
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
      }
      const controller = new AbortController();
      abortControllerRef.current = controller;

      try {
        if (!silent) setRefreshing(true);

        const res = await apiClient.get<DashboardMetrics>('/dashboard/overview/', {
          params: { silent: silent ? '1' : undefined },
          timeout: 6000,
          signal: controller.signal,
        });

        if (isMounted.current && res.data) {
          setFetchFailed(false);
          const totalStudents = Number(res.data.total_students) || 0;
          const presentStudents = Number(res.data.students_present) || 0;
          const calculatedRate =
            totalStudents > 0
              ? Math.min(100, Math.max(0, Math.round((presentStudents / totalStudents) * 100)))
              : Number(res.data.attendance_rate) || 0;

          const rawHourly = Array.isArray(res.data.hourly_scans) ? res.data.hourly_scans : [];
          const maxHourlyVolume = Math.max(...rawHourly.map((h) => Number(h.count) || 0), 1);
          const normalizedHourly = rawHourly.map((item) => {
            const count = Number(item.count) || 0;
            return {
              hour: String(item.hour || ''),
              count,
              height: count > 0 ? Math.round((count / maxHourlyVolume) * 100) : 0,
              is_peak: Boolean(item.is_peak),
            };
          });

          setData({
            total_students: totalStudents,
            students_present: presentStudents,
            students_absent: Number(res.data.students_absent) || Math.max(0, totalStudents - presentStudents),
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
            grade_levels: Array.isArray(res.data.grade_levels) ? res.data.grade_levels : [],
            recent_scans: Array.isArray(res.data.recent_scans) ? res.data.recent_scans : [],
            notices: Array.isArray(res.data.notices) ? res.data.notices : [],
            events: Array.isArray(res.data.events) ? res.data.events : [],
            analytics: res.data.analytics || {},
            database: res.data.database || {},
          });

          setLastSyncTime(
            new Date().toLocaleTimeString('en-US', {
              hour: '2-digit',
              minute: '2-digit',
              second: '2-digit',
            })
          );

          if (onGateStatusChange) {
            onGateStatusChange((Number(res.data.kiosks_online) || 0) > 0);
          }
        }
      } catch (err: unknown) {
        if (err && typeof err === 'object' && 'name' in err && err.name === 'CanceledError') {
          return;
        }
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
    }, 20000);

    return () => {
      isMounted.current = false;
      clearInterval(interval);
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
      }
    };
  }, [fetchDashboardData]);

  const handleManualSync = () => {
    fetchDashboardData(false);
    if (onManualRefresh) {
      onManualRefresh();
    }
  };

  const hasHourlyScans = isOnline && data.hourly_scans.some((h) => h.count > 0);

  const currentMonthYear = useMemo(() => {
    return calendarDate.toLocaleString('en-US', { month: 'long', year: 'numeric' });
  }, [calendarDate]);

  const calendarDays = useMemo(() => {
    const year = calendarDate.getFullYear();
    const month = calendarDate.getMonth();
    const firstDayIndex = new Date(year, month, 1).getDay();
    const daysInMonth = new Date(year, month + 1, 0).getDate();

    const days: Array<{ day: number | null; isToday: boolean }> = [];
    const now = new Date();

    for (let i = 0; i < firstDayIndex; i++) {
      days.push({ day: null, isToday: false });
    }

    for (let d = 1; d <= daysInMonth; d++) {
      const isToday =
        now.getFullYear() === year && now.getMonth() === month && now.getDate() === d;
      days.push({ day: d, isToday });
    }

    return days;
  }, [calendarDate]);

  if (loading) {
    return (
      <div style={{ padding: 60, textAlign: 'center', color: tokens.textMuted }}>
        <RefreshCw size={26} className="animate-spin" style={{ margin: '0 auto 10px auto', display: 'block', color: brand.primary }} />
        <span style={{ fontWeight: 600, fontSize: '0.86rem' }}>Synchronizing school dashboard and hardware telemetry...</span>
      </div>
    );
  }

  return (
    <div
      style={{
        height: '100%',
        overflowY: 'auto',
        backgroundColor: tokens.bgSurfaceSubtle,
        padding: 'clamp(14px, 2.5vw, 24px)',
        boxSizing: 'border-box',
      }}
    >
      <div style={{ maxWidth: 1380, margin: '0 auto', display: 'flex', flexDirection: 'column', gap: 16 }}>
        {/* 1. Telemetry Status Header */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            flexWrap: 'wrap',
            gap: 10,
            backgroundColor: '#FFFFFF',
            padding: '10px 18px',
            borderRadius: 14,
            border: `1px solid ${tokens.borderSubtle}`,
            boxShadow: tokens.cardShadow,
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
            <span
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: 6,
                padding: '4px 10px',
                borderRadius: 9999,
                backgroundColor: isOnline ? 'rgba(16, 185, 129, 0.12)' : 'rgba(239, 68, 68, 0.12)',
                color: isOnline ? brand.success : brand.danger,
                fontSize: '0.70rem',
                fontWeight: 800,
                border: `1px solid ${isOnline ? 'rgba(16, 185, 129, 0.28)' : 'rgba(239, 68, 68, 0.28)'}`,
              }}
            >
              <span style={{ width: 6, height: 6, borderRadius: '50%', backgroundColor: isOnline ? brand.success : brand.danger }} />
              {isOnline ? 'DATABASE CONNECTED' : 'DATABASE OFFLINE'}
            </span>

            {isAdmin && (
              <>
                <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: '0.74rem', fontWeight: 700, color: tokens.textSecondary }}>
                  <Database size={13} color={brand.primary} />
                  <span>PostgreSQL: {isOnline ? 'Active' : 'Offline'}</span>
                </span>
                <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: '0.74rem', fontWeight: 700, color: tokens.textSecondary }}>
                  <Radio size={13} color={brand.primary} />
                  <span>Turnstiles: {data.kiosks_online} of {data.total_kiosks} Online</span>
                </span>
              </>
            )}
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            {lastSyncTime && (
              <span style={{ fontSize: '0.72rem', color: tokens.textMuted, fontFamily: 'monospace' }}>
                Synced: {lastSyncTime}
              </span>
            )}
            <button
              type="button"
              onClick={handleManualSync}
              disabled={refreshing}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: 6,
                backgroundColor: tokens.bgSurfaceSubtle,
                border: `1px solid ${tokens.borderStrong}`,
                borderRadius: 8,
                padding: '5px 12px',
                fontSize: '0.76rem',
                fontWeight: 700,
                color: tokens.textPrimary,
                cursor: 'pointer',
              }}
            >
              <RefreshCw size={13} className={refreshing ? 'animate-spin' : ''} />
              <span>{refreshing ? 'Syncing...' : 'Sync Now'}</span>
            </button>
          </div>
        </div>

        {/* 2. Core KPI Statistics Grid */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 220px), 1fr))', gap: 14 }}>
          <div style={kpiCardStyle}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
              <div>
                <span style={kpiLabelStyle}>LEARNERS IN SCHOOL</span>
                <div style={kpiValueStyle}>{isOnline ? data.students_present.toLocaleString() : '—'}</div>
              </div>
              <div style={{ width: 38, height: 38, borderRadius: 10, display: 'flex', alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(16, 185, 129, 0.12)', color: brand.success }}>
                <UserCheck size={20} />
              </div>
            </div>
            <div style={kpiFooterStyle}>
              <span style={{ color: brand.success, fontWeight: 800 }}>{data.attendance_rate}%</span>
              <span style={{ color: tokens.textMuted }}>of {data.total_students} enrolled learners</span>
            </div>
          </div>

          <div style={kpiCardStyle}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
              <div>
                <span style={kpiLabelStyle}>ABSENT LEARNERS</span>
                <div style={{ ...kpiValueStyle, color: data.students_absent > 0 ? brand.danger : tokens.textPrimary }}>
                  {isOnline ? data.students_absent.toLocaleString() : '—'}
                </div>
              </div>
              <div style={{ width: 38, height: 38, borderRadius: 10, display: 'flex', alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(239, 68, 68, 0.12)', color: brand.danger }}>
                <UserX size={20} />
              </div>
            </div>
            <div style={kpiFooterStyle}>
              <span style={{ color: tokens.textMuted }}>Unverified departures today</span>
            </div>
          </div>

          <div style={kpiCardStyle}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
              <div>
                <span style={kpiLabelStyle}>TEACHERS ON DUTY</span>
                <div style={kpiValueStyle}>
                  {isOnline ? `${data.faculty_on_duty}/${data.total_faculty}` : '—'}
                </div>
              </div>
              <div style={{ width: 38, height: 38, borderRadius: 10, display: 'flex', alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(16, 185, 129, 0.12)', color: brand.success }}>
                <Clock size={20} />
              </div>
            </div>
            <div style={kpiFooterStyle}>
              <span style={{ color: tokens.textMuted }}>Verified on campus DTR</span>
            </div>
          </div>

          <div style={kpiCardStyle}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
              <div>
                <span style={kpiLabelStyle}>GATE TAPS TODAY</span>
                <div style={kpiValueStyle}>{isOnline ? data.gate_scans_today.toLocaleString() : '—'}</div>
              </div>
              <div style={{ width: 38, height: 38, borderRadius: 10, display: 'flex', alignItems: 'center', justifyContent: 'center', backgroundColor: tokens.primaryLight, color: brand.primary }}>
                <Scan size={20} />
              </div>
            </div>
            <div style={kpiFooterStyle}>
              <span style={{ color: brand.primary, fontWeight: 700 }}>{data.active_gate_passes} Active Gate Passes</span>
            </div>
          </div>
        </div>

        {/* 3. Bento Quick-Action Launchpad */}
        <div
          style={{
            backgroundColor: '#FFFFFF',
            borderRadius: 16,
            border: `1px solid ${tokens.borderSubtle}`,
            boxShadow: tokens.cardShadow,
            padding: '18px 20px',
            display: 'flex',
            flexDirection: 'column',
            gap: 14,
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <div style={{ width: 30, height: 30, borderRadius: 8, backgroundColor: tokens.primaryLight, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <Sparkles size={16} color={brand.primary} />
            </div>
            <div>
              <h3 style={{ margin: 0, fontSize: '0.94rem', fontWeight: 800, color: tokens.textPrimary }}>
                Quick Action Center
              </h3>
              <span style={{ fontSize: '0.70rem', color: tokens.textMuted }}>
                Immediate 1-click shortcuts for daily school operations
              </span>
            </div>
          </div>

          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 180px), 1fr))',
              gap: 12,
            }}
          >
            <button
              type="button"
              onClick={() => navigateTo('gate-passes')}
              style={actionTileStyle}
              onMouseEnter={(e) => (e.currentTarget.style.borderColor = brand.primary)}
              onMouseLeave={(e) => (e.currentTarget.style.borderColor = tokens.borderSubtle)}
            >
              <div style={{ ...actionIconFrame, backgroundColor: 'rgba(0, 75, 135, 0.1)', color: brand.primary }}>
                <Ticket size={20} />
              </div>
              <div>
                <div style={actionTileTitle}>Issue Gate Pass</div>
                <div style={actionTileDesc}>Authorize student or teacher exit</div>
              </div>
            </button>

            <button
              type="button"
              onClick={() => navigateTo({ tab: 'reports', report: 'sf2' })}
              style={actionTileStyle}
              onMouseEnter={(e) => (e.currentTarget.style.borderColor = brand.primary)}
              onMouseLeave={(e) => (e.currentTarget.style.borderColor = tokens.borderSubtle)}
            >
              <div style={{ ...actionIconFrame, backgroundColor: 'rgba(16, 185, 129, 0.1)', color: brand.success }}>
                <CalendarCheck size={20} />
              </div>
              <div>
                <div style={actionTileTitle}>Daily Attendance (SF2)</div>
                <div style={actionTileDesc}>Official DepEd attendance register</div>
              </div>
            </button>

            <button
              type="button"
              onClick={() => navigateTo('dtr')}
              style={actionTileStyle}
              onMouseEnter={(e) => (e.currentTarget.style.borderColor = brand.primary)}
              onMouseLeave={(e) => (e.currentTarget.style.borderColor = tokens.borderSubtle)}
            >
              <div style={{ ...actionIconFrame, backgroundColor: 'rgba(2, 132, 199, 0.1)', color: brand.secondary }}>
                <Clock size={20} />
              </div>
              <div>
                <div style={actionTileTitle}>Civil Service DTR</div>
                <div style={actionTileDesc}>Inspect and endorse Form 48 hours</div>
              </div>
            </button>

            <button
              type="button"
              onClick={() => navigateTo('sms')}
              style={actionTileStyle}
              onMouseEnter={(e) => (e.currentTarget.style.borderColor = brand.primary)}
              onMouseLeave={(e) => (e.currentTarget.style.borderColor = tokens.borderSubtle)}
            >
              <div style={{ ...actionIconFrame, backgroundColor: 'rgba(245, 158, 11, 0.1)', color: brand.warning }}>
                <Send size={20} />
              </div>
              <div>
                <div style={actionTileTitle}>SMS Parent Alert</div>
                <div style={actionTileDesc}>Send emergency broadcast to parents</div>
              </div>
            </button>

            <button
              type="button"
              onClick={() => navigateTo('gate-logs')}
              style={actionTileStyle}
              onMouseEnter={(e) => (e.currentTarget.style.borderColor = brand.primary)}
              onMouseLeave={(e) => (e.currentTarget.style.borderColor = tokens.borderSubtle)}
            >
              <div style={{ ...actionIconFrame, backgroundColor: 'rgba(124, 58, 237, 0.1)', color: '#7c3aed' }}>
                <Scan size={20} />
              </div>
              <div>
                <div style={actionTileTitle}>Live Gate Monitor</div>
                <div style={actionTileDesc}>Real-time arrival &amp; departure taps</div>
              </div>
            </button>

            <button
              type="button"
              onClick={() => navigateTo(effectiveRole === 'FACULTY' ? 'my-classes' : 'students')}
              style={actionTileStyle}
              onMouseEnter={(e) => (e.currentTarget.style.borderColor = brand.primary)}
              onMouseLeave={(e) => (e.currentTarget.style.borderColor = tokens.borderSubtle)}
            >
              <div style={{ ...actionIconFrame, backgroundColor: 'rgba(100, 116, 139, 0.1)', color: tokens.textSecondary }}>
                <Users size={20} />
              </div>
              <div>
                <div style={actionTileTitle}>Class Rosters</div>
                <div style={actionTileDesc}>Verify enrolled students by section</div>
              </div>
            </button>
          </div>
        </div>

        {/* 4. Split Main Content: Left Analytics & Right Utility Rail */}
        <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1.8fr) minmax(320px, 1fr)', gap: 16 }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            <div style={sectionCardStyle}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 12 }}>
                <div>
                  <h3 style={sectionCardTitle}>Arrivals by Hour</h3>
                  <span style={sectionCardSubtitle}>Gate scanner arrivals recorded today</span>
                </div>
                <div style={{ display: 'inline-flex', alignItems: 'center', gap: 4, padding: '3px 8px', borderRadius: 6, backgroundColor: tokens.primaryLight, color: brand.primary, fontSize: '0.68rem', fontWeight: 700 }}>
                  <TrendingUp size={12} color={brand.primary} />
                  <span>Today</span>
                </div>
              </div>

              {hasHourlyScans ? (
                <div style={{ height: 180, display: 'flex', alignItems: 'flex-end', gap: 8, padding: '12px 0 4px 0' }}>
                  {data.hourly_scans.map((item, idx) => (
                    <div key={idx} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', height: '100%', justifyContent: 'flex-end' }}>
                      <span style={{ fontSize: '0.62rem', fontWeight: 700, color: item.is_peak ? brand.primary : tokens.textMuted, marginBottom: 2 }}>
                        {item.count > 0 ? item.count : ''}
                      </span>
                      <div
                        style={{
                          width: '100%',
                          maxWidth: 28,
                          height: `${item.height}%`,
                          backgroundColor: item.is_peak ? brand.primary : item.count > 0 ? brand.secondary : tokens.borderSubtle,
                          borderRadius: '4px 4px 0 0',
                          transition: 'height 0.3s ease',
                        }}
                      />
                      <span style={{ fontSize: '0.62rem', fontWeight: 600, color: tokens.textMuted, marginTop: 4 }}>
                        {item.hour}
                      </span>
                    </div>
                  ))}
                </div>
              ) : (
                <div style={emptyCardBox}>
                  <Inbox size={26} color={tokens.textMuted} />
                  <span style={{ fontSize: '0.80rem', fontWeight: 600, color: tokens.textMuted, marginTop: 4 }}>
                    No Gate Scans Recorded Today
                  </span>
                </div>
              )}
            </div>

            <div style={sectionCardStyle}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 12 }}>
                <div>
                  <h3 style={sectionCardTitle}>Recent Gate Taps</h3>
                  <span style={sectionCardSubtitle}>Real-time campus entrance &amp; exit feed</span>
                </div>
                <button
                  type="button"
                  onClick={() => navigateTo('gate-logs')}
                  style={{ background: 'none', border: 'none', color: brand.primary, fontSize: '0.74rem', fontWeight: 700, cursor: 'pointer', padding: 0 }}
                >
                  View All
                </button>
              </div>

              {data.recent_scans.length > 0 ? (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  {data.recent_scans.slice(0, 5).map((scan, idx) => (
                    <div
                      key={`${scan.id}-${idx}`}
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        padding: '10px 12px',
                        backgroundColor: tokens.bgSurfaceSubtle,
                        borderRadius: 10,
                        border: `1px solid ${tokens.borderSubtle}`,
                      }}
                    >
                      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                        <span
                          style={{
                            padding: '2px 8px',
                            borderRadius: 6,
                            fontSize: '0.66rem',
                            fontWeight: 800,
                            backgroundColor: scan.direction === 'IN' ? 'rgba(16, 185, 129, 0.12)' : 'rgba(239, 68, 68, 0.12)',
                            color: scan.direction === 'IN' ? brand.success : brand.danger,
                          }}
                        >
                          {scan.direction}
                        </span>
                        <div>
                          <div style={{ fontSize: '0.82rem', fontWeight: 700, color: tokens.textPrimary }}>{scan.person_name}</div>
                          <div style={{ fontSize: '0.70rem', color: tokens.textMuted }}>
                            {scan.grade_section} &bull; {scan.scan_method}
                          </div>
                        </div>
                      </div>
                      <span style={{ fontSize: '0.74rem', fontWeight: 700, color: tokens.textSecondary }}>{scan.scan_time}</span>
                    </div>
                  ))}
                </div>
              ) : (
                <div style={emptyCardBox}>
                  <Inbox size={26} color={tokens.textMuted} />
                  <span style={{ fontSize: '0.80rem', fontWeight: 600, color: tokens.textMuted, marginTop: 4 }}>
                    No Gate Taps Recorded Yet
                  </span>
                </div>
              )}
            </div>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            <div style={sectionCardStyle}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
                <span style={{ fontSize: '0.88rem', fontWeight: 800, color: tokens.textPrimary }}>
                  {currentMonthYear}
                </span>

                <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                  <button
                    type="button"
                    onClick={() => setCalendarDate(new Date(calendarDate.setMonth(calendarDate.getMonth() - 1)))}
                    style={calNavBtn}
                    title="Previous month"
                  >
                    <ChevronLeft size={14} />
                  </button>
                  <button
                    type="button"
                    onClick={() => setCalendarDate(new Date())}
                    style={{ ...calNavBtn, fontSize: '0.70rem', fontWeight: 700, padding: '0 8px', width: 'auto' }}
                  >
                    Today
                  </button>
                  <button
                    type="button"
                    onClick={() => setCalendarDate(new Date(calendarDate.setMonth(calendarDate.getMonth() + 1)))}
                    style={calNavBtn}
                    title="Next month"
                  >
                    <ChevronRight size={14} />
                  </button>
                </div>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', textAlign: 'center', marginBottom: 6 }}>
                {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map((d) => (
                  <span key={d} style={{ fontSize: '0.66rem', fontWeight: 800, color: tokens.textMuted }}>
                    {d}
                  </span>
                ))}
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 4, textAlign: 'center' }}>
                {calendarDays.map((item, idx) => (
                  <div
                    key={idx}
                    style={{
                      height: 32,
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      borderRadius: 8,
                      fontSize: '0.76rem',
                      fontWeight: item.isToday ? 800 : 600,
                      backgroundColor: item.isToday ? brand.primary : 'transparent',
                      color: item.isToday ? '#FFFFFF' : item.day ? tokens.textPrimary : 'transparent',
                      border: item.isToday ? 'none' : `1px solid transparent`,
                    }}
                  >
                    {item.day || ''}
                  </div>
                ))}
              </div>
            </div>

            <div style={sectionCardStyle}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
                <Bell size={16} color={brand.primary} />
                <h3 style={sectionCardTitle}>Campus Bulletin</h3>
              </div>

              {data.notices && data.notices.length > 0 ? (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                  {data.notices.map((notice) => (
                    <div
                      key={notice.id}
                      style={{
                        padding: '10px 12px',
                        backgroundColor: tokens.bgSurfaceSubtle,
                        borderRadius: 10,
                        border: `1px solid ${tokens.borderSubtle}`,
                      }}
                    >
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <span style={{ fontSize: '0.66rem', fontWeight: 800, color: brand.primary }}>
                          {notice.category}
                        </span>
                        <span style={{ fontSize: '0.64rem', color: tokens.textMuted }}>{notice.date}</span>
                      </div>
                      <div style={{ fontSize: '0.80rem', fontWeight: 800, color: tokens.textPrimary, marginTop: 2 }}>
                        {notice.title}
                      </div>
                      <div style={{ fontSize: '0.72rem', color: tokens.textSecondary, marginTop: 2 }}>
                        {notice.details}
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div style={{ ...emptyCardBox, padding: '24px 12px' }}>
                  <Inbox size={22} color={tokens.textMuted} />
                  <span style={{ fontSize: '0.76rem', fontWeight: 600, color: tokens.textMuted, marginTop: 4 }}>
                    No announcements posted in database
                  </span>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default DashboardView;

const kpiCardStyle: React.CSSProperties = {
  backgroundColor: '#FFFFFF',
  borderRadius: 16,
  border: '1px solid #E2E8F0',
  boxShadow: '0 4px 16px -2px rgba(15, 23, 42, 0.05)',
  padding: '16px 18px',
};

const kpiLabelStyle: React.CSSProperties = {
  display: 'block',
  fontSize: '0.66rem',
  fontWeight: 800,
  color: '#64748B',
  marginBottom: 4,
  letterSpacing: '0.4px',
};

const kpiValueStyle: React.CSSProperties = {
  fontSize: '1.60rem',
  fontWeight: 800,
  color: '#0F172A',
  lineHeight: 1.1,
};

const kpiFooterStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: 6,
  marginTop: 10,
  paddingTop: 8,
  borderTop: '1px solid #E2E8F0',
  fontSize: '0.72rem',
};

const actionTileStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: 12,
  padding: '12px 14px',
  borderRadius: 12,
  border: '1px solid #E2E8F0',
  backgroundColor: '#FFFFFF',
  cursor: 'pointer',
  textAlign: 'left',
  transition: 'border-color 0.15s ease, box-shadow 0.15s ease',
};

const actionIconFrame: React.CSSProperties = {
  width: 42,
  height: 42,
  borderRadius: 10,
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  flexShrink: 0,
};

const actionTileTitle: React.CSSProperties = {
  fontSize: '0.84rem',
  fontWeight: 800,
  color: '#0F172A',
};

const actionTileDesc: React.CSSProperties = {
  fontSize: '0.70rem',
  color: '#64748B',
  marginTop: 1,
};

const sectionCardStyle: React.CSSProperties = {
  backgroundColor: '#FFFFFF',
  borderRadius: 16,
  border: '1px solid #E2E8F0',
  boxShadow: '0 4px 16px -2px rgba(15, 23, 42, 0.05)',
  padding: '18px 20px',
};

const sectionCardTitle: React.CSSProperties = {
  fontSize: '0.94rem',
  fontWeight: 800,
  color: '#0F172A',
  margin: 0,
};

const sectionCardSubtitle: React.CSSProperties = {
  fontSize: '0.70rem',
  color: '#64748B',
  marginTop: 2,
  display: 'block',
};

const emptyCardBox: React.CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  alignItems: 'center',
  justifyContent: 'center',
  padding: '36px 16px',
  textAlign: 'center',
};

const calNavBtn: React.CSSProperties = {
  width: 26,
  height: 26,
  borderRadius: 6,
  border: '1px solid #E2E8F0',
  backgroundColor: '#F8FAFC',
  color: '#475569',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  cursor: 'pointer',
};