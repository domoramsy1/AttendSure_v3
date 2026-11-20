/**
 * AttendSure - Instant-Hydrating School Dashboard
 * File: web/src/components/dashboard/DashboardView.tsx
 */

import React, { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import apiClient, { peekApiCache, subscribeApiCache } from '../../api/client';
import { API_ROUTES } from '../../api/routes';
import { useTheme } from '../../context/ThemeContext';
import { useCompliance } from '../../context/ComplianceContext';
import { StatsCard } from '../common/StatsCard';
import {
  UserCheck,
  UserX,
  Clock,
  Globe,
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
  QrCode,
  BookOpen,
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

interface NoticeItem {
  id: number | string;
  title: string;
  details: string;
}

interface DashboardState {
  total_students: number;
  students_present: number;
  students_absent: number;
  attendance_rate: number;
  faculty_on_duty: number;
  total_faculty: number;
  classroom_scans_today: number;
  active_exit_passes: number;
  push_alerts_today: number;
  mobile_parents_connected: number;
  hourly_scans: HourlyBar[];
  recent_scans: RecentScanItem[];
  notices: NoticeItem[];
}

const EMPTY_DASHBOARD: DashboardState = {
  total_students: 0,
  students_present: 0,
  students_absent: 0,
  attendance_rate: 0,
  faculty_on_duty: 0,
  total_faculty: 0,
  classroom_scans_today: 0,
  active_exit_passes: 0,
  push_alerts_today: 0,
  mobile_parents_connected: 0,
  hourly_scans: [],
  recent_scans: [],
  notices: [],
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
    attendance_rate: total > 0 ? Math.round((present / total) * 100) : Number(d.attendance_rate) || 0,
    faculty_on_duty: Number(d.faculty_on_duty) || 0,
    total_faculty: Number(d.total_faculty) || 0,
    classroom_scans_today: Number(d.classroom_scans_today ?? d.gate_scans_today) || 0,
    active_exit_passes: Number(d.active_exit_passes ?? d.active_gate_passes) || 0,
    push_alerts_today: Number(d.push_alerts_today ?? d.push_sent_today) || 0,
    mobile_parents_connected: Number(d.mobile_parents_connected) || 0,
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
    notices: Array.isArray(d.notices) ? d.notices : [],
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
  const { term } = useCompliance();

  const warmPayload = useMemo(
    () => peekApiCache<Record<string, any>>(API_ROUTES.reports.dashboard),
    []
  );

  const [loading, setLoading] = useState<boolean>(() => warmPayload === undefined);
  const [refreshing, setRefreshing] = useState<boolean>(false);
  const [lastSyncTime, setLastSyncTime] = useState<string>(() =>
    warmPayload ? new Date().toLocaleTimeString() : ''
  );
  const [fetchFailed, setFetchFailed] = useState<boolean>(false);
  const [calendarDate, setCalendarDate] = useState<Date>(() => new Date());
  const [data, setData] = useState<DashboardState>(() =>
    normalizeDashboardPayload(warmPayload)
  );

  const abortRef = useRef<AbortController | null>(null);
  const role = (userRole || localStorage.getItem('attendsure_role') || 'FACULTY').toUpperCase();
  const isAdmin = ['ADMIN', 'SUPERADMIN', 'FACULTY_ADMIN', 'PRINCIPAL'].includes(role);
  const isFaculty = role === 'FACULTY';
  const isOnline = isServerOnline && !fetchFailed;

  useEffect(() => {
    return subscribeApiCache(API_ROUTES.reports.dashboard, undefined, (freshRaw) => {
      setData(normalizeDashboardPayload(freshRaw as Record<string, any>));
      setLastSyncTime(new Date().toLocaleTimeString());
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
          setLastSyncTime(new Date().toLocaleTimeString());
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
    const timer = setInterval(() => {
      if (document.visibilityState === 'visible') {
        void fetchDashboardData(true, true);
      }
    }, 20000);
    return () => {
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
    { label: 'UN SDG Impact & Safety', desc: 'Early-warning, Ed-Fi & Roll-Call', icon: <Globe size={19} />, onClick: () => navigateTo('impact') },
    { label: 'QR Scanner', desc: 'Scan signed student QR ID card', icon: <QrCode size={19} />, onClick: () => navigateTo('classroom-scanner') },
    { label: isFaculty ? 'Student Exit Permit' : 'Exit Passes', desc: 'Student exit & faculty travel', icon: <Ticket size={19} />, onClick: () => navigateTo('gate-passes') },
    {
      label: term('Daily Attendance Register', 'Daily Attendance (SF2)'),
      desc: term('Exportable attendance register', 'Official DepEd register'),
      icon: <CalendarCheck size={19} />,
      onClick: () => navigateTo('reports', 'sf2'),
    },
    {
      label: term('Staff Timesheets', 'Monthly DTR'),
      desc: term('GPS-verified faculty hours', 'CSC Form 48 work hours'),
      icon: <Clock size={19} />,
      onClick: () => navigateTo('dtr'),
    },
    { label: isFaculty ? 'My Classes' : 'Class Lists', desc: 'Enrolled students by section', icon: isFaculty ? <BookOpen size={19} /> : <Users size={19} />, onClick: () => navigateTo(isFaculty ? 'my-classes' : 'students') },
    ...(isAdmin ? [{ label: 'Push Alerts', desc: 'Send mobile alerts to parents', icon: <Send size={19} />, onClick: () => navigateTo('push') }] : []),
  ];

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
            {isAdmin && (
              <>
                <span style={{ fontSize: fonts.size.sm, fontWeight: 700, color: tokens.textSecondary, display: 'flex', alignItems: 'center', gap: 5 }}>
                  <Database size={13} color={brand.primary} /> Database: {isOnline ? 'Connected' : 'Offline'}
                </span>
                <span style={{ fontSize: fonts.size.sm, fontWeight: 700, color: tokens.textSecondary, display: 'flex', alignItems: 'center', gap: 5 }}>
                  <Radio size={13} color={brand.primary} /> Push Alerts Today: {data.push_alerts_today.toLocaleString()} &bull; Parents Linked: {data.mobile_parents_connected.toLocaleString()}
                </span>
              </>
            )}
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
            label="NOT SCANNED TODAY"
            value={isOnline ? data.students_absent.toLocaleString() : '—'}
            valueColor={data.students_absent > 0 ? brand.danger : tokens.textPrimary}
            helpText="No classroom scan yet today"
            badge={<UserX size={18} color={brand.danger} />}
          />
          <StatsCard
            label="FACULTY ON CAMPUS"
            value={isOnline ? `${data.faculty_on_duty}/${data.total_faculty}` : '—'}
            helpText="Verified via mobile face & GPS check-in"
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
                <div style={{ padding: 24, textAlign: 'center', color: tokens.textMuted }}>
                  <Inbox size={22} style={{ margin: '0 auto 4px', display: 'block' }} /> No classroom scans recorded today
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
                <div style={{ padding: 20, textAlign: 'center', color: tokens.textMuted }}>No scans recorded yet</div>
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
                  <div key={idx} style={{ height: 28, display: 'flex', alignItems: 'center', justifyContent: 'center', borderRadius: 6, fontSize: fonts.size.sm, fontWeight: item.isToday ? 800 : 500, backgroundColor: item.isToday ? brand.buttonBg : 'transparent', color: item.isToday ? '#fff' : tokens.textPrimary }}>
                    {item.day || ''}
                  </div>
                ))}
              </div>
            </div>

            <div style={ui.card}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
                <Bell size={15} color={brand.primary} />
                <h3 style={{ margin: 0, fontSize: fonts.size.md, fontWeight: 800, color: tokens.textPrimary }}>School Bulletin</h3>
              </div>
              {data.notices.length === 0 ? (
                <div style={{ padding: 18, textAlign: 'center', color: tokens.textMuted, fontSize: fonts.size.sm }}>No announcements posted</div>
              ) : (
                data.notices.map((n) => (
                  <div key={n.id} style={{ ...ui.subtleBox, marginBottom: 8 }}>
                    <div style={{ fontSize: fonts.size.base, fontWeight: 800, color: tokens.textPrimary }}>{n.title}</div>
                    <div style={{ fontSize: fonts.size.xs, color: tokens.textSecondary }}>{n.details}</div>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default DashboardView;