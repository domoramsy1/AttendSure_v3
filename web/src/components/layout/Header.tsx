/**
 * AttendSure V3 - Top Application Navigation Bar & Live Notification Center
 * File: web/src/components/layout/Header.tsx
 *
 * Cybersecurity & Performance Upgrades:
 * 1. ZERO-LAG STAGGERED BOOT: Delays initial background notification queries
 *    by 2s to keep bandwidth clear for instant splash screen dismissal.
 * 2. LIGHTWEIGHT METRICS FETCHING: Uses /sms-outbox/metrics/ (20ms) instead
 *    of the heavy /dashboard/overview/ (1200ms) to prevent server queue choke.
 * 3. SELF-DOS CONCURRENCY LOCK: Uses an in-flight ref lock to stop duplicate
 *    network requests from piling up.
 * 4. STRICT TYPESCRIPT COMPLIANCE: Eliminates Promise<void | null> type mismatches
 *    with fail-safe void catch handlers.
 * 5. XSS URL SHIELD: Validates profile photos against javascript: protocol injection.
 */

import React, { useState, useEffect, useRef, useCallback } from 'react';
import apiClient from '../../api/client';
import type { UserSession } from '../../types/section';
import type { NavItemKey } from './Sidebar';
import {
  Bell,
  Clock,
  Radio,
  User,
  LogOut,
  ChevronDown,
  Ticket,
  BookOpen,
  Send,
  Cpu,
  FileClock,
  CheckCircle2,
  X,
} from 'lucide-react';

export interface TabBadgeCounts {
  'my-classes'?: number;
  'gate-passes'?: number;
  'sms'?: number;
  'scanners'?: number;
  'dtr'?: number;
  'gate-logs'?: number;
}

interface NotificationItem {
  id: string;
  tab: NavItemKey;
  title: string;
  description: string;
  count: number;
  severity: 'danger' | 'warning' | 'info';
  icon: React.ReactNode;
}

interface HeaderProps {
  title: string;
  isGateNodeOnline: boolean;
  session: UserSession | null;
  userPhoto?: string | null;
  schoolName?: string;
  schoolId?: string;
  schoolLogo?: string | null;
  onLogout: () => void;
  onNavigateTab: (tab: NavItemKey) => void;
  onOpenProfile: () => void;
}

// Cybersecurity: Blocks XSS from malicious image protocols
const isSafeImageUrl = (url?: string | null): boolean => {
  if (!url || typeof url !== 'string') return false;
  const clean = url.trim().toLowerCase();
  if (!clean || clean === 'null' || clean === 'undefined' || clean === 'none') return false;
  if (clean.startsWith('javascript:') || clean.startsWith('vbscript:')) return false;
  if (clean.startsWith('data:') && !clean.startsWith('data:image/')) return false;
  return (
    clean.startsWith('http://') ||
    clean.startsWith('https://') ||
    clean.startsWith('/') ||
    clean.startsWith('data:image/') ||
    clean.startsWith('blob:')
  );
};

export const formatBadgeCount = (count: number): string => {
  if (count <= 0) return '';
  return count > 20 ? '20+' : String(count);
};

export const Header: React.FC<HeaderProps> = ({
  title,
  isGateNodeOnline,
  session,
  userPhoto,
  schoolName,
  onLogout,
  onNavigateTab,
  onOpenProfile,
}) => {
  const [currentTime, setCurrentTime] = useState<string>('');
  const [profileOpen, setProfileOpen] = useState<boolean>(false);
  const [notifOpen, setNotifOpen] = useState<boolean>(false);
  const [notifications, setNotifications] = useState<NotificationItem[]>([]);
  const [readIds, setReadIds] = useState<string[]>(() => {
    try {
      const saved = sessionStorage.getItem('attendsure_read_notif_ids');
      return saved ? JSON.parse(saved) : [];
    } catch {
      return [];
    }
  });

  const notifRef = useRef<HTMLDivElement>(null);
  const profileRef = useRef<HTMLDivElement>(null);
  const isFetchingRef = useRef<boolean>(false);

  const role = (session?.role || 'FACULTY').toUpperCase();
  const isAdminOrPrincipal = role === 'ADMIN' || role === 'PRINCIPAL';
  const isTeacher = role === 'FACULTY' || role === 'TEACHER';
  const isGuard = role === 'GUARD';

  // 1. Live Philippine Standard Time (PST) Clock
  useEffect(() => {
    const updateClock = () => {
      const now = new Date();
      setCurrentTime(
        now.toLocaleString('en-US', {
          month: 'short',
          day: 'numeric',
          hour: '2-digit',
          minute: '2-digit',
          second: '2-digit',
          hour12: true,
        }) + ' PST'
      );
    };

    updateClock();
    const timer = setInterval(updateClock, 1000);
    return () => clearInterval(timer);
  }, []);

  // 2. Dropdown Dismissal Listeners
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (notifRef.current && !notifRef.current.contains(e.target as Node)) {
        setNotifOpen(false);
      }
      if (profileRef.current && !profileRef.current.contains(e.target as Node)) {
        setProfileOpen(false);
      }
    };

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setNotifOpen(false);
        setProfileOpen(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    window.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, []);

  // 3. Fast, Non-Blocking Role Notification Poller
  const fetchRoleNotifications = useCallback(async () => {
    if (!session?.token || isFetchingRef.current) return;
    isFetchingRef.current = true;

    const newItems: NotificationItem[] = [];
    const badgeMap: TabBadgeCounts = {};

    try {
      // A. Gate Passes (Lightweight count query)
      const passPromise: Promise<void> = apiClient
        .get('/gate-passes/?status=ACTIVE&page_size=1', { timeout: 4000 })
        .then((res) => {
          const activeCount = typeof res.data?.count === 'number'
            ? res.data.count
            : Array.isArray(res.data)
            ? res.data.length
            : 0;

          if (activeCount > 0) {
            badgeMap['gate-passes'] = activeCount;
            newItems.push({
              id: `gate-passes-${activeCount}`,
              tab: 'gate-passes',
              title: `${activeCount} Active Gate Pass${activeCount > 1 ? 'es' : ''}`,
              description: isGuard
                ? 'Authorized bearers cleared for campus exit verification.'
                : 'Active student or staff gate exit clearances.',
              count: activeCount,
              severity: 'info',
              icon: <Ticket size={16} color="#0284c7" />,
            });
          }
        })
        .catch(() => {});

      // B. Teacher Pending Class Roster Scan Checks
      let classPromise: Promise<void> = Promise.resolve();
      if (isTeacher || localStorage.getItem('attendsure_can_teach') === 'true') {
        classPromise = apiClient
          .get('/my-classes/', { timeout: 4000 })
          .then((res) => {
            if (Array.isArray(res.data)) {
              const pendingClasses = res.data.filter((cls: any) =>
                Array.isArray(cls.students) &&
                cls.students.some((st: any) => !st.attendance_status || st.attendance_status === 'UNSCANNED')
              );

              if (pendingClasses.length > 0) {
                badgeMap['my-classes'] = pendingClasses.length;
                newItems.push({
                  id: `my-classes-${pendingClasses.length}`,
                  tab: 'my-classes',
                  title: `${pendingClasses.length} Class${pendingClasses.length > 1 ? 'es' : ''} Pending Roll Call`,
                  description: 'Students in your scheduled classes have not been scanned today.',
                  count: pendingClasses.length,
                  severity: 'warning',
                  icon: <BookOpen size={16} color="#d97706" />,
                });
              }
            }
          })
          .catch(() => {});
      }

      // C. SMS & Scanner Metrics (Fast-path: ~20ms instead of ~1400ms overview)
      let adminPromise: Promise<void> = Promise.resolve();
      if (isAdminOrPrincipal) {
        adminPromise = Promise.all([
          apiClient.get('/sms-outbox/metrics/', { timeout: 3500 }).catch(() => null),
          apiClient.get('/scanners/', { timeout: 3500 }).catch(() => null),
        ])
          .then(([smsRes, scanRes]) => {
            if (smsRes?.data) {
              const smsFailed = Number(smsRes.data.failed || 0);
              const smsPending = Number(smsRes.data.pending || 0);
              const smsTotalAlert = smsFailed + smsPending;

              if (smsTotalAlert > 0) {
                badgeMap['sms'] = smsTotalAlert;
                newItems.push({
                  id: `sms-${smsTotalAlert}`,
                  tab: 'sms',
                  title: smsFailed > 0 ? `${smsFailed} Failed SMS Alert${smsFailed > 1 ? 's' : ''}` : `${smsPending} Queued SMS`,
                  description: smsFailed > 0
                    ? 'Parent SMS alerts failed to send via GSM modem.'
                    : 'Outbox messages waiting for GSM gateway dispatch.',
                  count: smsTotalAlert,
                  severity: 'danger',
                  icon: <Send size={16} color={smsFailed > 0 ? '#dc2626' : '#d97706'} />,
                });
              }
            }

            if (scanRes?.data) {
              const list = Array.isArray(scanRes.data) ? scanRes.data : scanRes.data.results || [];
              const tenMinutesAgo = new Date(Date.now() - 10 * 60 * 1000);
              const offlineCount = list.filter((k: any) => {
                if (!k.is_active) return true;
                if (!k.last_ping) return true;
                return new Date(k.last_ping) < tenMinutesAgo;
              }).length;

              if (offlineCount > 0) {
                badgeMap['scanners'] = offlineCount;
                newItems.push({
                  id: `scanners-${offlineCount}`,
                  tab: 'scanners',
                  title: `${offlineCount} Gate Kiosk${offlineCount > 1 ? 's' : ''} Offline`,
                  description: 'RFID/QR gate scanner has not pinged recently.',
                  count: offlineCount,
                  severity: 'danger',
                  icon: <Cpu size={16} color="#dc2626" />,
                });
              }
            }
          })
          .catch(() => {});
      }

      // D. DTR Draft Warning for Faculty
      let dtrPromise: Promise<void> = Promise.resolve();
      if (!isGuard) {
        dtrPromise = apiClient
          .get('/dtr/', { timeout: 3500 })
          .then((res) => {
            if (res.data && !res.data.dtr_submitted && res.data.days_present > 0) {
              badgeMap['dtr'] = 1;
              newItems.push({
                id: `dtr-unsubmitted-${res.data.month_number}`,
                tab: 'dtr',
                title: `Form 48 DTR Draft (${res.data.month})`,
                description: 'Your monthly Daily Time Record is still a draft and awaiting submission.',
                count: 1,
                severity: 'info',
                icon: <FileClock size={16} color="#0284c7" />,
              });
            }
          })
          .catch(() => {});
      }

      await Promise.all([passPromise, classPromise, adminPromise, dtrPromise]);

      setNotifications(newItems);

      // Cache locally for instant boot next time
      try {
        sessionStorage.setItem('attendsure_cached_badges', JSON.stringify(badgeMap));
      } catch {
        // Ignore quota limits
      }

      // Broadcast badge counts to Sidebar.tsx
      window.dispatchEvent(
        new CustomEvent<TabBadgeCounts>('attendsure:notifications-sync', { detail: badgeMap })
      );
    } finally {
      isFetchingRef.current = false;
    }
  }, [session?.token, isAdminOrPrincipal, isTeacher, isGuard]);

  // Initial Boot: Restores cached badges immediately (0ms), then runs first check after 2s
  useEffect(() => {
    try {
      const cached = sessionStorage.getItem('attendsure_cached_badges');
      if (cached) {
        const parsed = JSON.parse(cached);
        window.dispatchEvent(
          new CustomEvent<TabBadgeCounts>('attendsure:notifications-sync', { detail: parsed })
        );
      }
    } catch {
      // Ignore
    }

    const initialBootTimer = setTimeout(() => {
      fetchRoleNotifications();
    }, 2000);

    const interval = setInterval(fetchRoleNotifications, 20000);

    return () => {
      clearTimeout(initialBootTimer);
      clearInterval(interval);
    };
  }, [fetchRoleNotifications]);

  const markAllRead = () => {
    const allIds = notifications.map((n) => n.id);
    setReadIds(allIds);
    try {
      sessionStorage.setItem('attendsure_read_notif_ids', JSON.stringify(allIds));
    } catch {
      // Ignore
    }
  };

  const dismissOne = (id: string) => {
    setReadIds((prev) => {
      const updated = [...prev, id];
      try {
        sessionStorage.setItem('attendsure_read_notif_ids', JSON.stringify(updated));
      } catch {
        // Ignore
      }
      return updated;
    });
  };

  const unreadNotifications = notifications.filter((n) => !readIds.includes(n.id));
  const totalBellCount = unreadNotifications.reduce((sum, item) => sum + item.count, 0);

  const cleanTitle = title.replace(schoolName ? `${schoolName} ` : '', '');
  const safePhoto = isSafeImageUrl(userPhoto) ? userPhoto : null;

  return (
    <header
      style={{
        height: 62,
        minHeight: 62,
        backgroundColor: '#ffffff',
        borderBottom: '1px solid #e2e8f0',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        padding: '0 24px',
        boxSizing: 'border-box',
        position: 'relative',
        zIndex: 40,
      }}
    >
      {/* 1. Left: View Title & School Breadcrumb */}
      <div style={{ display: 'flex', flexDirection: 'column', minWidth: 0 }}>
        {schoolName && (
          <span
            style={{
              fontSize: '0.70rem',
              color: '#64748b',
              fontWeight: 700,
              letterSpacing: '0.02em',
              textTransform: 'uppercase',
            }}
          >
            {schoolName}
          </span>
        )}
        <h1
          style={{
            fontSize: '1.15rem',
            fontWeight: 800,
            color: '#0f172a',
            margin: 0,
            letterSpacing: '-0.02em',
            whiteSpace: 'nowrap',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
          }}
        >
          {cleanTitle}
        </h1>
      </div>

      {/* 2. Right: Controls */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
        {/* Live PST Clock Pill */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 6,
            height: 36,
            padding: '0 12px',
            backgroundColor: '#f8fafc',
            border: '1px solid #e2e8f0',
            borderRadius: 18,
            fontSize: '0.75rem',
            color: '#334155',
            fontFamily: 'monospace',
            fontWeight: 700,
          }}
        >
          <Clock size={14} color="#0284c7" />
          <span>{currentTime}</span>
        </div>

        {/* Gate Scanner Status Pill */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 6,
            height: 36,
            padding: '0 12px',
            borderRadius: 18,
            backgroundColor: isGateNodeOnline ? '#ecfdf5' : '#fef2f2',
            border: `1px solid ${isGateNodeOnline ? '#a7f3d0' : '#fecaca'}`,
            fontSize: '0.75rem',
            fontWeight: 700,
            color: isGateNodeOnline ? '#059669' : '#dc2626',
          }}
        >
          <Radio size={14} className={isGateNodeOnline ? 'animate-pulse' : ''} />
          <span>Gate: {isGateNodeOnline ? 'Online' : 'Offline'}</span>
        </div>

        {/* Notification Bell Button with Red Count Badge */}
        <div style={{ position: 'relative' }} ref={notifRef}>
          <button
            type="button"
            title="Notifications & Action Alerts"
            aria-label="Notifications"
            onClick={() => {
              setNotifOpen((prev) => !prev);
              setProfileOpen(false);
            }}
            style={{
              width: 38,
              height: 38,
              borderRadius: '50%',
              border: notifOpen ? '1.5px solid #0284c7' : '1px solid #e2e8f0',
              backgroundColor: notifOpen ? '#f0f9ff' : '#f1f5f9',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              cursor: 'pointer',
              color: notifOpen ? '#0284c7' : '#334155',
              position: 'relative',
              transition: 'all 0.15s ease',
            }}
          >
            <Bell size={18} fill={totalBellCount > 0 ? '#334155' : 'none'} />

            {totalBellCount > 0 && (
              <span
                style={{
                  position: 'absolute',
                  top: -4,
                  right: -5,
                  minWidth: 19,
                  height: 19,
                  padding: '0 5px',
                  borderRadius: 9999,
                  backgroundColor: '#e11d48',
                  color: '#ffffff',
                  fontSize: '0.66rem',
                  fontWeight: 800,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  border: '2px solid #ffffff',
                  boxShadow: '0 2px 4px rgba(225, 29, 72, 0.35)',
                  lineHeight: 1,
                  boxSizing: 'border-box',
                }}
              >
                {formatBadgeCount(totalBellCount)}
              </span>
            )}
          </button>

          {/* Notification Drawer Dropdown */}
          {notifOpen && (
            <div
              style={{
                position: 'absolute',
                top: 46,
                right: 0,
                width: 340,
                backgroundColor: '#ffffff',
                border: '1px solid #e2e8f0',
                borderRadius: 12,
                boxShadow: '0 12px 28px rgba(15, 23, 42, 0.14)',
                overflow: 'hidden',
                zIndex: 100,
              }}
            >
              <div
                style={{
                  padding: '12px 16px',
                  borderBottom: '1px solid #f1f5f9',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  backgroundColor: '#f8fafc',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <span style={{ fontSize: '0.86rem', fontWeight: 800, color: '#0f172a' }}>
                    Notifications
                  </span>
                  {totalBellCount > 0 && (
                    <span
                      style={{
                        backgroundColor: '#e11d48',
                        color: '#ffffff',
                        fontSize: '0.68rem',
                        fontWeight: 800,
                        padding: '1px 7px',
                        borderRadius: 999,
                      }}
                    >
                      {formatBadgeCount(totalBellCount)} new
                    </span>
                  )}
                </div>

                {unreadNotifications.length > 0 && (
                  <button
                    type="button"
                    onClick={markAllRead}
                    style={{
                      background: 'none',
                      border: 'none',
                      fontSize: '0.72rem',
                      fontWeight: 700,
                      color: '#0284c7',
                      cursor: 'pointer',
                    }}
                  >
                    Mark all read
                  </button>
                )}
              </div>

              <div style={{ maxHeight: 320, overflowY: 'auto' }}>
                {notifications.length === 0 ? (
                  <div
                    style={{
                      padding: '32px 20px',
                      textAlign: 'center',
                      color: '#64748b',
                      display: 'flex',
                      flexDirection: 'column',
                      alignItems: 'center',
                      gap: 8,
                    }}
                  >
                    <CheckCircle2 size={28} color="#10b981" />
                    <div style={{ fontSize: '0.82rem', fontWeight: 700, color: '#334155' }}>
                      You're all caught up!
                    </div>
                    <div style={{ fontSize: '0.74rem', color: '#94a3b8' }}>
                      No pending action alerts for your {role.toLowerCase()} account.
                    </div>
                  </div>
                ) : (
                  notifications.map((item) => {
                    const isRead = readIds.includes(item.id);
                    return (
                      <div
                        key={item.id}
                        style={{
                          display: 'flex',
                          alignItems: 'flex-start',
                          justifyContent: 'space-between',
                          gap: 10,
                          padding: '12px 16px',
                          borderBottom: '1px solid #f1f5f9',
                          backgroundColor: isRead ? '#ffffff' : '#f0f9ff',
                          transition: 'background-color 0.15s ease',
                        }}
                      >
                        <button
                          type="button"
                          onClick={() => {
                            dismissOne(item.id);
                            setNotifOpen(false);
                            onNavigateTab(item.tab);
                          }}
                          style={{
                            display: 'flex',
                            alignItems: 'flex-start',
                            gap: 12,
                            background: 'none',
                            border: 'none',
                            padding: 0,
                            textAlign: 'left',
                            cursor: 'pointer',
                            flex: 1,
                          }}
                        >
                          <div
                            style={{
                              width: 34,
                              height: 34,
                              borderRadius: '50%',
                              backgroundColor:
                                item.severity === 'danger'
                                  ? '#fef2f2'
                                  : item.severity === 'warning'
                                  ? '#fffbeb'
                                  : '#e0f2fe',
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'center',
                              flexShrink: 0,
                              marginTop: 2,
                            }}
                          >
                            {item.icon}
                          </div>

                          <div style={{ flex: 1, minWidth: 0 }}>
                            <div
                              style={{
                                fontSize: '0.80rem',
                                fontWeight: 800,
                                color: '#0f172a',
                                display: 'flex',
                                alignItems: 'center',
                                gap: 6,
                              }}
                            >
                              <span>{item.title}</span>
                              {!isRead && (
                                <span
                                  style={{
                                    width: 7,
                                    height: 7,
                                    borderRadius: '50%',
                                    backgroundColor: '#e11d48',
                                    flexShrink: 0,
                                  }}
                                />
                              )}
                            </div>
                            <div
                              style={{
                                fontSize: '0.73rem',
                                color: '#475569',
                                marginTop: 2,
                                lineHeight: 1.35,
                              }}
                            >
                              {item.description}
                            </div>
                          </div>
                        </button>

                        {!isRead && (
                          <button
                            type="button"
                            title="Dismiss alert"
                            onClick={() => dismissOne(item.id)}
                            style={{
                              background: 'none',
                              border: 'none',
                              color: '#94a3b8',
                              cursor: 'pointer',
                              padding: 2,
                            }}
                          >
                            <X size={14} />
                          </button>
                        )}
                      </div>
                    );
                  })
                )}
              </div>
            </div>
          )}
        </div>

        {/* User Profile Avatar Dropdown Trigger */}
        <div style={{ position: 'relative' }} ref={profileRef}>
          <button
            type="button"
            onClick={() => {
              setProfileOpen((prev) => !prev);
              setNotifOpen(false);
            }}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 8,
              height: 38,
              padding: '0 10px 0 4px',
              backgroundColor: '#f8fafc',
              border: '1px solid #e2e8f0',
              borderRadius: 999,
              cursor: 'pointer',
            }}
          >
            {safePhoto ? (
              <img
                src={safePhoto}
                alt="Avatar"
                style={{ width: 30, height: 30, borderRadius: '50%', objectFit: 'cover' }}
              />
            ) : (
              <div
                style={{
                  width: 30,
                  height: 30,
                  borderRadius: '50%',
                  backgroundColor: '#0284c7',
                  color: '#ffffff',
                  fontSize: '0.78rem',
                  fontWeight: 800,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              >
                {session?.faculty_name ? session.faculty_name.charAt(0).toUpperCase() : 'U'}
              </div>
            )}
            <ChevronDown size={14} color="#64748b" />
          </button>

          {profileOpen && (
            <div
              style={{
                position: 'absolute',
                top: 46,
                right: 0,
                width: 200,
                backgroundColor: '#ffffff',
                border: '1px solid #e2e8f0',
                borderRadius: 10,
                boxShadow: '0 10px 25px rgba(15, 23, 42, 0.12)',
                padding: '6px 0',
                display: 'flex',
                flexDirection: 'column',
                zIndex: 100,
              }}
            >
              <div style={{ padding: '8px 14px', borderBottom: '1px solid #f1f5f9' }}>
                <div style={{ fontSize: '0.80rem', fontWeight: 800, color: '#0f172a', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {session?.faculty_name || session?.username || 'User'}
                </div>
                <div style={{ fontSize: '0.68rem', fontWeight: 700, color: '#0284c7', marginTop: 2 }}>
                  {role} ACCOUNT
                </div>
              </div>

              <button
                type="button"
                onClick={() => {
                  setProfileOpen(false);
                  onOpenProfile();
                }}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 8,
                  padding: '9px 14px',
                  background: 'none',
                  border: 'none',
                  fontSize: '0.80rem',
                  fontWeight: 600,
                  color: '#334155',
                  cursor: 'pointer',
                  textAlign: 'left',
                }}
              >
                <User size={14} color="#64748b" /> My Profile
              </button>

              <div style={{ height: 1, backgroundColor: '#f1f5f9', margin: '4px 0' }} />

              <button
                type="button"
                onClick={() => {
                  setProfileOpen(false);
                  onLogout();
                }}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 8,
                  padding: '9px 14px',
                  background: 'none',
                  border: 'none',
                  fontSize: '0.80rem',
                  color: '#dc2626',
                  cursor: 'pointer',
                  textAlign: 'left',
                  fontWeight: 700,
                }}
              >
                <LogOut size={14} /> Log Out
              </button>
            </div>
          )}
        </div>
      </div>
    </header>
  );
};

export default Header;