// AttendSure Web - Dashboard View Component
// File: D:\AttendSure_V3\web\src\components\dashboard\DashboardView.tsx

/**
 * AttendSure - Instant-Hydrating School Dashboard
 * File: web/src/components/dashboard/DashboardView.tsx
 */

import React, { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import apiClient, { peekApiCache, subscribeApiCache } from '../../api/client';
import { API_ROUTES } from '../../api/routes';
import { useTheme } from '../../context/ThemeContext';
import { canViewTab, getCurrentUserFromStorage } from '../../utils/permissions';
import { formatTime12h } from '../../utils/timeFormat';
import { StatsCard } from '../common/StatsCard';
import {
  UserCheck,
  UserX,
  Clock,
  Globe,
  RefreshCw,
  Scan,
  TrendingUp,
  Inbox,
  Database,
  Ticket,
  CalendarCheck,
  Users,
  ChevronLeft,
  ChevronRight,
  Sparkles,
  QrCode,
  BookOpen,
  MapPin,
  ShieldAlert,
} from 'lucide-react';

interface DashboardViewProps {
  isServerOnline?: boolean;
  userRole?: string;
  onStatusChange?: (online: boolean) => void;
  onManualRefresh?: () => void;
  onNavigateTab?: (tab: string, report?: string) => void;
}

interface HourlyBar {
  hour: string;
  count: number;
  height: number;
  is_peak: boolean;
}

interface RecentScanItem {
  person_name: string;
  grade_section: string;
  scan_time: string;
}

interface DashboardState {
  total_students: number;
  students_present: number;
  students_absent: number;
  students_cutting: number;
  attendance_rate: number;
  teachers_on_duty: number;
  total_teachers: number;
  classroom_scans_today: number;
  active_exit_passes: number;
  open_loafing_incidents: number;
  hourly_scans: HourlyBar[];
  recent_scans: RecentScanItem[];
}

const EMPTY_DASHBOARD: DashboardState = {
  total_students: 0,
  students_present: 0,
  students_absent: 0,
  students_cutting: 0,
  attendance_rate: 0,
  teachers_on_duty: 0,
  total_teachers: 0,
  classroom_scans_today: 0,
  active_exit_passes: 0,
  open_loafing_incidents: 0,
  hourly_scans: [],
  recent_scans: [],
};

const normalizeDashboardPayload = (d: Record<string, any> | undefined): DashboardState => {
  if (!d) return EMPTY_DASHBOARD;
  const total = Number(d.total_students) || 0;
  const present = Number(d.students_present) || 0;
  const rawHourly = Array.isArray(d.hourly_scans) ? d.hourly_scans : [];
  const maxCount = Math.max(...rawHourly.map((h: any) => Number(h.count) || 0), 1);

  return {
    total_students: total,
    students_present: present,
    students_absent: Number(d.students_absent) || Math.max(0, total - present),
    students_cutting: Number(d.students_cutting) || 0,
    attendance_rate: total > 0 ? Math.round((present / total) * 100) : Number(d.attendance_rate) || 0,
    teachers_on_duty: Number(d.teachers_on_duty) || 0,
    total_teachers: Number(d.total_teachers) || 0,
    classroom_scans_today: Number(d.classroom_scans_today) || 0,
    active_exit_passes: Number(d.active_exit_passes) || 0,
    open_loafing_incidents: Number(d.open_loafing_incidents) || 0,
    hourly_scans: rawHourly.map((h: any) => {
      const c = Number(h.count) || 0;
      return {
        hour: String(h.hour || ''),
        count: c,
        height: c > 0 ? Math.round((c / maxCount) * 100) : 0,
        is_peak: Boolean(h.is_peak),
      };
    }),
    recent_scans: Array.isArray(d.recent_scans) ? d.recent_scans : [],
  };
};

export const DashboardView: React.FC<DashboardViewProps> = ({
  isServerOnline = true,
  userRole,
  onStatusChange,
  onManualRefresh,
  onNavigateTab,
}) => {
  const { tokens, brand, fonts, ui } = useTheme();

  const warmPayload = useMemo(
    () => peekApiCache<Record<string, any>>(API_ROUTES.reports.dashboard),
    []
  );

  const [loading, setLoading] = useState<boolean>(() => warmPayload === undefined);
  const [refreshing, setRefreshing] = useState<boolean>(false);
  const [lastSyncTime, setLastSyncTime] = useState<string>(() =>
    warmPayload ? formatTime12h(new Date(), { includeSeconds: true }) : ''
  );
  const [fetchFailed, setFetchFailed] = useState<boolean>(false);
  const [calendarDate, setCalendarDate] = useState<Date>(() => new Date());
  const [data, setData] = useState<DashboardState>(() => normalizeDashboardPayload(warmPayload));

  const abortRef = useRef<AbortController | null>(null);
  const currentUser = { ...getCurrentUserFromStorage(), ...(userRole ? { role: userRole } : {}) };
  const role = (currentUser.role || 'TEACHER').toUpperCase();
  const isTeacher = role === 'TEACHER';
  const isOnline = isServerOnline && !fetchFailed;

  useEffect(() => {
    return subscribeApiCache(API_ROUTES.reports.dashboard, undefined, (freshRaw) => {
      setData(normalizeDashboardPayload(freshRaw as Record<string, any>));
      setLastSyncTime(formatTime12h(new Date(), { includeSeconds: true }));
      setLoading(false);
    });
  }, []);

  const navigateTo = (tab: string, report?: string) => {
    if (onNavigateTab) {
      onNavigateTab(tab, report);
      return;
    }
    window.dispatchEvent(new CustomEvent('attendsure:navigate', { detail: report ? { tab, report } : tab }));
  };

  const fetchDashboardData = useCallback(
    async (silent = false, bypassCache = false) => {
      abortRef.current?.abort();
      const controller = new AbortController();
      abortRef.current = controller;

      try {
        if (!silent) setRefreshing(true);
        const res = await apiClient.get(API_ROUTES.reports.dashboard, {
          params: {
            silent: silent ? '1' : undefined,
            ...(bypassCache ? { nocache: 1 } : {}),
          },
          signal: controller.signal,
        });

        if (controller.signal.aborted) return;
        if (res.data) {
          setFetchFailed(false);
          setData(normalizeDashboardPayload(res.data));
          setLastSyncTime(formatTime12h(new Date(), { includeSeconds: true }));
          onStatusChange?.(true);
        }
      } catch (err: unknown) {
        const anyErr = err as { name?: string; code?: string };
        if (
          controller.signal.aborted ||
          anyErr?.name === 'CanceledError' ||
          anyErr?.name === 'AbortError' ||
          anyErr?.code === 'ERR_CANCELED'
        ) {
          return;
        }
        setFetchFailed(true);
        onStatusChange?.(false);
      } finally {
        if (!controller.signal.aborted) {
          setLoading(false);
          setRefreshing(false);
        }
      }
    },
    [onStatusChange]
  );

  useEffect(() => {
    void fetchDashboardData(warmPayload !== undefined, false);
    const handleAttendanceUpdated = () => {
      void fetchDashboardData(true, true);
    };
    window.addEventListener('attendsure:attendance-updated', handleAttendanceUpdated);
    const timer = setInterval(() => {
      if (document.visibilityState === 'visible') {
        void fetchDashboardData(true, true);
      }
    }, 20000);
    return () => {
      window.removeEventListener('attendsure:attendance-updated', handleAttendanceUpdated);
      clearInterval(timer);
      abortRef.current?.abort();
    };
  }, [fetchDashboardData, warmPayload]);

  const calendarDays = useMemo(() => {
    const y = calendarDate.getFullYear();
    const m = calendarDate.getMonth();
    const firstDay = new Date(y, m, 1).getDay();
    const totalDays = new Date(y, m + 1, 0).getDate();
    const now = new Date();
    return [
      ...Array.from({ length: firstDay }, () => ({ day: null as number | null, isToday: false })),
      ...Array.from({ length: totalDays }, (_, i) => ({
        day: i + 1,
        isToday: now.getFullYear() === y && now.getMonth() === m && now.getDate() === i + 1,
      })),
    ];
  }, [calendarDate]);

  const quickActions = [
    {
      tab: 'classroom-scanner',
      label: 'QR Scanner',
      desc: 'Scan student QR IDs via webcam',
      icon: <QrCode size={19} />,
      onClick: () => navigateTo('classroom-scanner'),
    },
    {
      tab: 'geofence',
      label: 'Geofence & Loafing',
      desc: 'Campus boundary & loafing logs',
      icon: <MapPin size={19} />,
      onClick: () => navigateTo('geofence'),
    },
    {
      tab: 'gate-passes',
      label: 'Exit & Travel Passes',
      desc: 'Student exit & teacher locator slips',
      icon: <Ticket size={19} />,
      onClick: () => navigateTo('gate-passes'),
    },
    {
      tab: 'reports',
      label: 'Daily Attendance (SF2)',
      desc: 'Official DepEd attendance register',
      icon: <CalendarCheck size={19} />,
      onClick: () => navigateTo('reports', 'sf2'),
    },
    {
      tab: 'dtr',
      label: isTeacher ? 'My DTR' : 'Teachers & DTR',
      desc: 'CSC Form 48 work hours',
      icon: <Clock size={19} />,
      onClick: () => navigateTo('dtr'),
    },
    {
      tab: isTeacher ? 'my-classes' : 'students',
      label: isTeacher ? 'My Classes' : 'Class Lists',
      desc: 'Enrolled learners by section',
      icon: isTeacher ? <BookOpen size={19} /> : <Users size={19} />,
      onClick: () => navigateTo(isTeacher ? 'my-classes' : 'students'),
    },
    {
      tab: 'impact',
      label: 'SARDO & Campus Safety',
      desc: 'Dropout early-warning & roll-call',
      icon: <Globe size={19} />,
      onClick: () => navigateTo('impact'),
    },
  ].filter((item) => canViewTab(currentUser, item.tab));

  if (loading) {
    return (
      <div style={{ padding: 48, textAlign: 'center', color: tokens.textMuted }}>
        <RefreshCw size={22} className="animate-spin" style={{ margin: '0 auto 8px', display: 'block', color: brand.primary }} />
        <span>Loading dashboard...</span>
      </div>
    );
  }

  return (
    <div style={{ height: '100%', overflowY: 'auto', backgroundColor: tokens.bgCanvas, padding: 'clamp(12px, 2vw, 20px)' }}>
      <div style={{ maxWidth: 1380, margin: '0 auto', display: 'flex', flexDirection: 'column', gap: 14 }}>
        <div style={{ ...ui.card, padding: '10px 16px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 10 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
            <span style={ui.badge(isOnline ? tokens.successLight : tokens.dangerLight, isOnline ? brand.success : brand.danger)}>
              ● {isOnline ? 'ONLINE' : 'OFFLINE'}
            </span>
            <span style={{ fontSize: fonts.size.sm, fontWeight: 700, color: tokens.textSecondary, display: 'flex', alignItems: 'center', gap: 5 }}>
              <Database size={13} color={brand.primary} /> Database: {isOnline ? 'Connected' : 'Offline'}
            </span>
            <span style={{ fontSize: fonts.size.sm, fontWeight: 700, color: data.open_loafing_incidents > 0 ? brand.danger : tokens.textSecondary, display: 'flex', alignItems: 'center', gap: 5 }}>
              <ShieldAlert size={13} color={data.open_loafing_incidents > 0 ? brand.danger : brand.success} />
              Open Loafing &amp; Cutting Alerts: {data.open_loafing_incidents} &bull; Active Exit Passes: {data.active_exit_passes}
            </span>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            {lastSyncTime && <span style={{ fontSize: fonts.size.xs, color: tokens.textMuted, fontFamily: fonts.mono }}>Updated: {lastSyncTime}</span>}
            <button
              type="button"
              onClick={() => {
                void fetchDashboardData(false, true);
                onManualRefresh?.();
              }}
              disabled={refreshing}
              style={ui.btnSecondary}
            >
              <RefreshCw size={13} className={refreshing ? 'animate-spin' : ''} /> {refreshing ? 'Updating...' : 'Refresh'}
            </button>
          </div>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 210px), 1fr))', gap: 12 }}>
          <StatsCard
            label="STUDENTS IN CLASS"
            value={isOnline ? data.students_present.toLocaleString() : '—'}
            helpText={`${data.attendance_rate}% of ${data.total_students.toLocaleString()} students`}
            badge={<UserCheck size={18} color={brand.success} />}
          />
          <StatsCard
            label="NOT SCANNED YET TODAY"
            value={isOnline ? data.students_absent.toLocaleString() : '—'}
            valueColor={data.students_absent > 0 ? brand.warning : tokens.textPrimary}
            helpText="Waiting for first classroom QR scan"
            badge={<UserX size={18} color={brand.warning} />}
          />
          <StatsCard
            label="TEACHERS ON CAMPUS"
            value={isOnline ? `${data.teachers_on_duty}/${data.total_teachers}` : '—'}
            helpText="Verified on campus via phone check-in (zero face photos saved)"
            badge={<Clock size={18} color={brand.success} />}
          />
          <StatsCard
            label="CLASSROOM QR SCANS"
            value={isOnline ? data.classroom_scans_today.toLocaleString() : '—'}
            helpText={`${data.active_exit_passes} Active Exit Passes`}
            badge={<Scan size={18} color={brand.primary} />}
          />
        </div>

        <div style={ui.card}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
            <Sparkles size={15} color={brand.primary} />
            <h3 style={{ margin: 0, fontSize: fonts.size.md, fontWeight: 800, color: tokens.textPrimary }}>Quick Actions</h3>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 185px), 1fr))', gap: 10 }}>
            {quickActions.map((act) => (
              <button
                key={act.label}
                type="button"
                onClick={act.onClick}
                style={{ ...ui.subtleBox, display: 'flex', alignItems: 'center', gap: 10, cursor: 'pointer', textAlign: 'left' }}
              >
                <div style={{ width: 34, height: 34, borderRadius: 8, backgroundColor: tokens.primaryLight, color: brand.primary, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                  {act.icon}
                </div>
                <div>
                  <div style={{ fontSize: fonts.size.base, fontWeight: 800, color: tokens.textPrimary }}>{act.label}</div>
                  <div style={{ fontSize: fonts.size.xs, color: tokens.textMuted }}>{act.desc}</div>
                </div>
              </button>
            ))}
          </div>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 300px), 1fr))', gap: 14 }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            <div style={ui.card}>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 12 }}>
                <h3 style={{ margin: 0, fontSize: fonts.size.md, fontWeight: 800, color: tokens.textPrimary }}>Classroom Scans by Hour</h3>
                <span style={ui.badge(tokens.primaryLight, brand.primary)}><TrendingUp size={12} /> Today</span>
              </div>
              {data.hourly_scans.some((h) => h.count > 0) ? (
                <div style={{ height: 150, display: 'flex', alignItems: 'flex-end', gap: 8 }}>
                  {data.hourly_scans.map((item, idx) => (
                    <div key={idx} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', height: '100%', justifyContent: 'flex-end' }}>
                      <span style={{ fontSize: fonts.size.xs, fontWeight: 700, color: tokens.textMuted }}>{item.count || ''}</span>
                      <div style={{ width: '100%', maxWidth: 26, height: `${item.height}%`, backgroundColor: item.is_peak ? brand.primary : brand.secondary, borderRadius: '4px 4px 0 0' }} />
                      <span style={{ fontSize: fonts.size.xs, color: tokens.textMuted, marginTop: 4 }}>{item.hour}</span>
                    </div>
                  ))}
                </div>
              ) : (
                <div style={{ padding: 24, textAlign: 'center', color: tokens.textMuted, fontSize: fonts.size.sm }}>
                  <Inbox size={22} style={{ margin: '0 auto 6px', display: 'block' }} />
                  No student QR scans yet today. Open QR Scanner to start recording classroom attendance.
                </div>
              )}
            </div>

            <div style={ui.card}>
              <h3 style={{ margin: '0 0 10px', fontSize: fonts.size.md, fontWeight: 800, color: tokens.textPrimary }}>Recent Classroom QR Scans</h3>
              {data.recent_scans.length > 0 ? (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  {data.recent_scans.slice(0, 5).map((s, idx) => (
                    <div key={idx} style={{ ...ui.subtleBox, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <div>
                        <strong style={{ fontSize: fonts.size.base, color: tokens.textPrimary }}>{s.person_name}</strong>
                        <div style={{ fontSize: fonts.size.xs, color: tokens.textMuted }}>{s.grade_section}</div>
                      </div>
                      <span style={{ fontSize: fonts.size.sm, fontWeight: 700, color: tokens.textSecondary }}>{s.scan_time}</span>
                    </div>
                  ))}
                </div>
              ) : (
                <div style={{ padding: 20, textAlign: 'center', color: tokens.textMuted, fontSize: fonts.size.sm }}>
                  Scanned students will appear here live as classes begin.
                </div>
              )}
            </div>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            <div style={ui.card}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
                <strong style={{ fontSize: fonts.size.base, color: tokens.textPrimary }}>
                  {calendarDate.toLocaleString('en-US', { month: 'long', year: 'numeric' })}
                </strong>
                <div style={{ display: 'flex', gap: 4 }}>
                  <button type="button" onClick={() => setCalendarDate(new Date(calendarDate.getFullYear(), calendarDate.getMonth() - 1, 1))} style={ui.btnSecondary}><ChevronLeft size={13} /></button>
                  <button type="button" onClick={() => setCalendarDate(new Date())} style={ui.btnSecondary}>Today</button>
                  <button type="button" onClick={() => setCalendarDate(new Date(calendarDate.getFullYear(), calendarDate.getMonth() + 1, 1))} style={ui.btnSecondary}><ChevronRight size={13} /></button>
                </div>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', textAlign: 'center', gap: 4 }}>
                {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map((d) => (
                  <span key={d} style={{ fontSize: fonts.size.xs, fontWeight: 800, color: tokens.textMuted }}>{d}</span>
                ))}
                {calendarDays.map((item, idx) => (
                  <div key={idx} style={{ height: 28, display: 'flex', alignItems: 'center', justifyContent: 'center', borderRadius: 6, fontSize: fonts.size.sm, fontWeight: item.isToday ? 800 : 500, backgroundColor: item.isToday ? brand.buttonBg : 'transparent', color: item.isToday ? tokens.onPrimary : tokens.textPrimary }}>
                    {item.day || ''}
                  </div>
                ))}
              </div>
            </div>

            <div style={ui.card}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <ShieldAlert size={15} color={data.open_loafing_incidents > 0 ? brand.danger : brand.success} />
                  <h3 style={{ margin: 0, fontSize: fonts.size.md, fontWeight: 800, color: tokens.textPrimary }}>Teacher Loafing &amp; Student Cutting Summary</h3>
                </div>
                {canViewTab(currentUser, 'geofence') && (
                  <button type="button" onClick={() => navigateTo('geofence')} style={ui.btnSecondary}>
                    Open Monitor
                  </button>
                )}
              </div>
              <div style={{ display: 'grid', gap: 8 }}>
                <div style={{ ...ui.subtleBox, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span style={{ fontSize: fonts.size.sm, color: tokens.textSecondary }}>Open Loafing &amp; Cutting Alerts</span>
                  <strong style={{ color: data.open_loafing_incidents > 0 ? brand.danger : brand.success }}>
                    {data.open_loafing_incidents}
                  </strong>
                </div>
                <div style={{ ...ui.subtleBox, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span style={{ fontSize: fonts.size.sm, color: tokens.textSecondary }}>Student Cutting Class Alerts Today</span>
                  <strong style={{ color: data.students_cutting > 0 ? brand.warning : brand.success }}>
                    {data.students_cutting}
                  </strong>
                </div>
                <div style={{ ...ui.subtleBox, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span style={{ fontSize: fonts.size.sm, color: tokens.textSecondary }}>Active Exit &amp; Travel Passes</span>
                  <strong style={{ color: brand.primary }}>{data.active_exit_passes}</strong>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default DashboardView;
