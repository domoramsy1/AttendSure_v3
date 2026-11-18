/**
 * AttendSure - School Dashboard & Telemetry Hub (Pure Software & USB QR)
 * File: web/src/components/dashboard/DashboardView.tsx
 */

import React, { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import apiClient from '../../api/client';
import { useTheme } from '../../context/ThemeContext';
import { StatsCard } from '../common/StatsCard';
import {
  UserCheck, UserX, Clock, Radio, RefreshCw, Scan, TrendingUp, Inbox,
  Database, Ticket, CalendarCheck, Send, Users, ChevronLeft, ChevronRight,
  Bell, Sparkles, QrCode, BookOpen,
} from 'lucide-react';

interface DashboardViewProps {
  isServerOnline?: boolean;
  userRole?: string;
  onStatusChange?: (online: boolean) => void;
  onManualRefresh?: () => void;
  onNavigateTab?: (tab: string, report?: string) => void;
}

export const DashboardView: React.FC<DashboardViewProps> = ({
  isServerOnline = true,
  userRole,
  onStatusChange,
  onManualRefresh,
  onNavigateTab,
}) => {
  const { tokens, brand, fonts, ui } = useTheme();
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [lastSyncTime, setLastSyncTime] = useState('');
  const [fetchFailed, setFetchFailed] = useState(false);
  const [calendarDate, setCalendarDate] = useState(new Date());

  const [data, setData] = useState({
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
    hourly_scans: [] as Array<{ hour: string; count: number; height: number; is_peak: boolean }>,
    recent_scans: [] as Array<any>,
    notices: [] as Array<any>,
  });

  const abortRef = useRef<AbortController | null>(null);
  const role = (userRole || localStorage.getItem('attendsure_role') || 'FACULTY').toUpperCase();
  const isAdmin = ['ADMIN', 'SUPERADMIN', 'PRINCIPAL'].includes(role);
  const isFaculty = role === 'FACULTY';
  const isOnline = isServerOnline && !fetchFailed;

  const navigateTo = (tab: string, report?: string) => {
    if (onNavigateTab) onNavigateTab(tab, report);
    window.dispatchEvent(new CustomEvent('attendsure:navigate', { detail: report ? { tab, report } : tab }));
  };

  const fetchDashboardData = useCallback(async (silent = false) => {
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    try {
      if (!silent) setRefreshing(true);
      const res = await apiClient.get('/dashboard/overview/', {
        params: { silent: silent ? '1' : undefined },
        signal: controller.signal,
      });

      if (res.data) {
        setFetchFailed(false);
        const d = res.data;
        const total = Number(d.total_students) || 0;
        const present = Number(d.students_present) || 0;
        const rawHourly = Array.isArray(d.hourly_scans) ? d.hourly_scans : [];
        const maxCount = Math.max(...rawHourly.map((h: any) => Number(h.count) || 0), 1);

        setData({
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
        });
        setLastSyncTime(new Date().toLocaleTimeString());
        onStatusChange?.(true);
      }
    } catch (err: any) {
      if (err?.name !== 'CanceledError') {
        setFetchFailed(true);
        onStatusChange?.(false);
      }
    } finally {
      setLoading(false);
      if (!silent) setRefreshing(false);
    }
  }, [onStatusChange]);

  useEffect(() => {
    fetchDashboardData(false);
    const timer = setInterval(() => fetchDashboardData(true), 20000);
    return () => {
      clearInterval(timer);
      abortRef.current?.abort();
    };
  }, [fetchDashboardData]);

  const calendarDays = useMemo(() => {
    const y = calendarDate.getFullYear();
    const m = calendarDate.getMonth();
    const firstDay = new Date(y, m, 1).getDay();
    const totalDays = new Date(y, m + 1, 0).getDate();
    const now = new Date();
    return [
      ...Array.from({ length: firstDay }, () => ({ day: null, isToday: false })),
      ...Array.from({ length: totalDays }, (_, i) => ({
        day: i + 1,
        isToday: now.getFullYear() === y && now.getMonth() === m && now.getDate() === i + 1,
      })),
    ];
  }, [calendarDate]);

  const quickActions = [
    { label: 'USB QR Scanner', desc: 'Scan student QR ID card', icon: <QrCode size={20} />, onClick: () => navigateTo('classroom-scanner') },
    { label: isFaculty ? 'Student Exit Permit' : 'Exit Passes', desc: 'Student exit & faculty travel', icon: <Ticket size={20} />, onClick: () => navigateTo('gate-passes') },
    { label: 'Daily Attendance (SF2)', desc: 'Official DepEd register', icon: <CalendarCheck size={20} />, onClick: () => navigateTo('reports', 'sf2') },
    { label: 'Civil Service DTR', desc: 'Form 48 faculty hours', icon: <Clock size={20} />, onClick: () => navigateTo('dtr') },
    { label: isFaculty ? 'My Classes' : 'Class Lists', desc: 'Enrolled students by section', icon: isFaculty ? <BookOpen size={20} /> : <Users size={20} />, onClick: () => navigateTo(isFaculty ? 'my-classes' : 'students') },
    ...(isAdmin ? [{ label: 'Push Notifications', desc: 'Send mobile alerts to parents', icon: <Send size={20} />, onClick: () => navigateTo('push') }] : []),
  ];

  if (loading) {
    return (
      <div style={{ padding: 60, textAlign: 'center', color: tokens.textMuted }}>
        <RefreshCw size={24} className="animate-spin" style={{ margin: '0 auto 8px', display: 'block', color: brand.primary }} />
        <span>Loading school dashboard...</span>
      </div>
    );
  }

  return (
    <div style={{ height: '100%', overflowY: 'auto', backgroundColor: tokens.bgCanvas, padding: 'clamp(14px, 2vw, 24px)' }}>
      <div style={{ maxWidth: 1380, margin: '0 auto', display: 'flex', flexDirection: 'column', gap: 16 }}>
        {/* 1. Status Bar */}
        <div style={{ ...ui.card, padding: '10px 18px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 10 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
            <span style={ui.badge(isOnline ? tokens.successLight : tokens.dangerLight, isOnline ? brand.success : brand.danger)}>
              ● {isOnline ? 'ONLINE' : 'OFFLINE'}
            </span>
            {isAdmin && (
              <>
                <span style={{ fontSize: fonts.size.sm, fontWeight: 700, color: tokens.textSecondary, display: 'flex', alignItems: 'center', gap: 5 }}>
                  <Database size={13} color={brand.primary} /> Server: {isOnline ? 'Active' : 'Offline'}
                </span>
                <span style={{ fontSize: fonts.size.sm, fontWeight: 700, color: tokens.textSecondary, display: 'flex', alignItems: 'center', gap: 5 }}>
                  <Radio size={13} color={brand.primary} /> Push Alerts Today: {Number(data.push_alerts_today || 0).toLocaleString()} • Parents Connected: {Number(data.mobile_parents_connected || 0).toLocaleString()}
                </span>
              </>
            )}
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            {lastSyncTime && <span style={{ fontSize: fonts.size.xs, color: tokens.textMuted, fontFamily: fonts.mono }}>Synced: {lastSyncTime}</span>}
            <button type="button" onClick={() => { fetchDashboardData(false); onManualRefresh?.(); }} disabled={refreshing} style={ui.btnSecondary}>
              <RefreshCw size={13} className={refreshing ? 'animate-spin' : ''} /> {refreshing ? 'Syncing...' : 'Sync Now'}
            </button>
          </div>
        </div>

        {/* 2. KPI Cards */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 14 }}>
          <StatsCard
            label="LEARNERS IN CLASS"
            value={isOnline ? Number(data.students_present || 0).toLocaleString() : '—'}
            helpText={`${Number(data.attendance_rate || 0)}% of ${Number(data.total_students || 0).toLocaleString()} learners`}
            badge={<UserCheck size={18} color={brand.success} />}
          />
          <StatsCard
            label="ABSENT LEARNERS"
            value={isOnline ? Number(data.students_absent || 0).toLocaleString() : '—'}
            valueColor={Number(data.students_absent || 0) > 0 ? brand.danger : tokens.textPrimary}
            helpText="Unverified today"
            badge={<UserX size={18} color={brand.danger} />}
          />
          <StatsCard
            label="FACULTY ON DUTY"
            value={isOnline ? `${Number(data.faculty_on_duty || 0)}/${Number(data.total_faculty || 0)}` : '—'}
            helpText="Verified via Mobile Face & GPS"
            badge={<Clock size={18} color={brand.success} />}
          />
          <StatsCard
            label="CLASSROOM QR SCANS"
            value={isOnline ? Number(data.classroom_scans_today || 0).toLocaleString() : '—'}
            helpText={`${Number(data.active_exit_passes || 0)} Active Exit Passes`}
            badge={<Scan size={18} color={brand.primary} />}
          />
        </div>

        {/* 3. Quick Actions */}
        <div style={ui.card}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
            <Sparkles size={16} color={brand.primary} />
            <h3 style={{ margin: 0, fontSize: fonts.size.md, fontWeight: 800, color: tokens.textPrimary }}>Quick Actions</h3>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(190px, 1fr))', gap: 12 }}>
            {quickActions.map((act, i) => (
              <button key={i} type="button" onClick={act.onClick} style={{ ...ui.subtleBox, display: 'flex', alignItems: 'center', gap: 12, cursor: 'pointer', textAlign: 'left' }}>
                <div style={{ width: 38, height: 38, borderRadius: 8, backgroundColor: tokens.primaryLight, color: brand.primary, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
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

        {/* 4. Bottom Analytics & Calendar Grid */}
        <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1.8fr) minmax(300px, 1fr)', gap: 16 }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            <div style={ui.card}>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 12 }}>
                <h3 style={{ margin: 0, fontSize: fonts.size.md, fontWeight: 800, color: tokens.textPrimary }}>Classroom Scans by Hour</h3>
                <span style={ui.badge(tokens.primaryLight, brand.primary)}><TrendingUp size={12} /> Today</span>
              </div>
              {data.hourly_scans.some((h) => h.count > 0) ? (
                <div style={{ height: 160, display: 'flex', alignItems: 'flex-end', gap: 8 }}>
                  {data.hourly_scans.map((item, idx) => (
                    <div key={idx} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', height: '100%', justifyContent: 'flex-end' }}>
                      <span style={{ fontSize: fonts.size.xs, fontWeight: 700, color: tokens.textMuted }}>{item.count || ''}</span>
                      <div style={{ width: '100%', maxWidth: 26, height: `${item.height}%`, backgroundColor: item.is_peak ? brand.primary : brand.secondary, borderRadius: '4px 4px 0 0' }} />
                      <span style={{ fontSize: fonts.size.xs, color: tokens.textMuted, marginTop: 4 }}>{item.hour}</span>
                    </div>
                  ))}
                </div>
              ) : (
                <div style={{ padding: 28, textAlign: 'center', color: tokens.textMuted }}>
                  <Inbox size={24} style={{ margin: '0 auto 4px', display: 'block' }} /> No Classroom Scans Recorded Today
                </div>
              )}
            </div>

            <div style={ui.card}>
              <h3 style={{ margin: '0 0 12px', fontSize: fonts.size.md, fontWeight: 800, color: tokens.textPrimary }}>Recent Classroom QR Scans</h3>
              {data.recent_scans.length > 0 ? (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  {data.recent_scans.slice(0, 5).map((s: any, idx: number) => (
                    <div key={idx} style={{ ...ui.subtleBox, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <div>
                        <strong style={{ fontSize: fonts.size.base, color: tokens.textPrimary }}>{s.person_name}</strong>
                        <div style={{ fontSize: fonts.size.xs, color: tokens.textMuted }}>{s.grade_section} • USB QR Scanner</div>
                      </div>
                      <span style={{ fontSize: fonts.size.sm, fontWeight: 700, color: tokens.textSecondary }}>{s.scan_time}</span>
                    </div>
                  ))}
                </div>
              ) : (
                <div style={{ padding: 24, textAlign: 'center', color: tokens.textMuted }}>No Classroom Scans Recorded Yet</div>
              )}
            </div>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            <div style={ui.card}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
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
                  <div key={idx} style={{ height: 30, display: 'flex', alignItems: 'center', justifyContent: 'center', borderRadius: 6, fontSize: fonts.size.sm, fontWeight: item.isToday ? 800 : 500, backgroundColor: item.isToday ? brand.primary : 'transparent', color: item.isToday ? '#fff' : tokens.textPrimary }}>
                    {item.day || ''}
                  </div>
                ))}
              </div>
            </div>

            <div style={ui.card}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
                <Bell size={16} color={brand.primary} />
                <h3 style={{ margin: 0, fontSize: fonts.size.md, fontWeight: 800, color: tokens.textPrimary }}>Campus Bulletin</h3>
              </div>
              {data.notices.length === 0 ? (
                <div style={{ padding: 20, textAlign: 'center', color: tokens.textMuted, fontSize: fonts.size.sm }}>No announcements posted</div>
              ) : (
                data.notices.map((n: any) => (
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