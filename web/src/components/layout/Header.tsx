/**
 * AttendSure V3 - Main Header
 * File: web/src/components/layout/Header.tsx
 */

import React, { useState, useEffect, useMemo, useCallback } from 'react';
import apiClient from '../../api/client';
import { useTheme } from '../../context/ThemeContext';
import StudentIdPassModal from '../modals/StudentIdPassModal';
import {
  Search,
  Bell,
  ChevronDown,
  LogOut,
  User,
  Shield,
  BookOpen,
  Send,
  Cpu,
  FileClock,
  CheckCircle2,
  X,
  Activity,
  QrCode,
  Inbox,
} from 'lucide-react';
import type { UserSession } from '../../types/section';
import type { NavItemKey } from './Sidebar';

export interface TabBadgeCounts {
  students?: number;
  faculties?: number;
  schedules?: number;
  gatelogs?: number;
  sms?: number;
  gatepasses?: number;
  scanners?: number;
  [key: string]: number | undefined;
}

export function formatBadgeCount(count?: number | null): string {
  if (count === undefined || count === null || count <= 0) return '';
  if (count > 999) return `${(count / 1000).toFixed(1)}k`;
  return String(count);
}

export interface HeaderProps {
  title?: string;
  currentTitle?: string;
  activeTab?: string;
  onTabChange?: (tab: string) => void;
  isGateNodeOnline?: boolean;
  session?: UserSession | null;
  userPhoto?: string | null;
  schoolName?: string;
  schoolId?: string;
  schoolLogo?: string | null;
  onLogout?: () => void;
  onNavigateTab?: (tab: NavItemKey) => void;
  onOpenProfile?: () => void;
}

interface CurrentUser {
  username: string;
  full_name: string;
  role: string;
  photo_url?: string | null;
  employee_id?: string;
  rfid_uid?: string;
}

interface NotificationItem {
  id: string;
  title: string;
  message: string;
  type: 'GATE' | 'CLASS' | 'SMS' | 'KIOSK' | 'GATE_PASS';
  time: string;
  targetRole?: 'ADMIN' | 'ALL';
}

const isSafeImageUrl = (url?: string | null): boolean => {
  if (!url || typeof url !== 'string') return false;
  const clean = url.trim().toLowerCase();
  if (!clean || clean === 'null' || clean === 'undefined' || clean === 'none') {
    return false;
  }
  if (clean.startsWith('javascript:') || clean.startsWith('vbscript:')) {
    return false;
  }
  if (clean.startsWith('data:') && !clean.startsWith('data:image/')) {
    return false;
  }
  return (
    clean.startsWith('http://') ||
    clean.startsWith('https://') ||
    clean.startsWith('/') ||
    clean.startsWith('data:image/') ||
    clean.startsWith('blob:')
  );
};

export const Header: React.FC<HeaderProps> = ({
  title,
  currentTitle = 'Dashboard',
  isGateNodeOnline,
  userPhoto,
  onLogout,
  onOpenProfile,
}) => {
  const displayTitle = title || currentTitle;
  const { tokens, brand } = useTheme();

  const [currentUser, setCurrentUser] = useState<CurrentUser>({
    username: '',
    full_name: '',
    role: '',
  });

  const [gateOnline, setGateOnline] = useState<boolean>(true);
  const [searchVal, setSearchVal] = useState<string>('');
  const [dropdownOpen, setDropdownOpen] = useState<boolean>(false);
  const [notifOpen, setNotifOpen] = useState<boolean>(false);
  const [readIds, setReadIds] = useState<string[]>([]);
  const [liveNotifications, setLiveNotifications] = useState<NotificationItem[]>([]);
  const [isDigitalPassOpen, setIsDigitalPassOpen] = useState<boolean>(false);

  useEffect(() => {
    if (typeof isGateNodeOnline === 'boolean') {
      setGateOnline(isGateNodeOnline);
    }
  }, [isGateNodeOnline]);

  const fetchSystemStatus = useCallback(async () => {
    const token =
      localStorage.getItem('attendsure_token') ||
      localStorage.getItem('auth_token') ||
      localStorage.getItem('token');
    if (!token) return;

    try {
      const [userRes, kioskRes, smsRes] = await Promise.allSettled([
        apiClient.get('/me/'),
        apiClient.get('/kiosks/'),
        apiClient.get('/sms-outbox/metrics/').catch(() => null),
      ]);

      if (userRes.status === 'fulfilled' && userRes.value?.data) {
        const u = userRes.value.data;
        setCurrentUser({
          username: u.username || '',
          full_name: u.full_name || u.first_name || u.username || 'User',
          role: String(u.role || u.system_role || 'FACULTY').toUpperCase(),
          photo_url: u.photo_url || u.photo || null,
          employee_id: u.employee_id || u.username || '',
          rfid_uid: u.rfid_uid || '',
        });
      }

      const generatedAlerts: NotificationItem[] = [];

      if (kioskRes.status === 'fulfilled' && kioskRes.value?.data) {
        const kiosks = Array.isArray(kioskRes.value.data)
          ? kioskRes.value.data
          : kioskRes.value.data.results || [];

        const hasOnlineKiosks =
          kiosks.length === 0 ||
          kiosks.some(
            (k: { is_active?: boolean; is_online?: boolean }) =>
              k.is_active !== false && k.is_online !== false
          );

        if (typeof isGateNodeOnline !== 'boolean') {
          setGateOnline(hasOnlineKiosks);
        }

        const offlineList = kiosks.filter(
          (k: { is_active?: boolean; is_online?: boolean }) => k.is_active && !k.is_online
        );

        if (offlineList.length > 0) {
          generatedAlerts.push({
            id: 'gate-offline-alert',
            title: 'Gate Scanner Offline',
            message: `${offlineList.length} gate scanner unit(s) are currently disconnected.`,
            type: 'KIOSK',
            time: 'Just now',
            targetRole: 'ADMIN',
          });
        }
      }

      if (smsRes && smsRes.status === 'fulfilled' && smsRes.value?.data) {
        const pendingCount = Number(smsRes.value.data.pending_total || 0);
        const failedCount = Number(smsRes.value.data?.failed_total || 0);

        if (pendingCount > 50 || failedCount > 0) {
          generatedAlerts.push({
            id: 'sms-pending-alert',
            title: 'Text Alert Delay',
            message: `${pendingCount} parent text message(s) are waiting to be sent.`,
            type: 'SMS',
            time: 'Just now',
            targetRole: 'ADMIN',
          });
        }
      }

      setLiveNotifications(generatedAlerts);
    } catch {
      if (typeof isGateNodeOnline !== 'boolean') setGateOnline(false);
    }
  }, [isGateNodeOnline]);

  useEffect(() => {
    fetchSystemStatus();
    const interval = setInterval(fetchSystemStatus, 30000);
    return () => clearInterval(interval);
  }, [fetchSystemStatus]);

  const handleLogout = async () => {
    if (onLogout) {
      onLogout();
      return;
    }
    try {
      await apiClient.post('/auth/logout/').catch(() => {});
    } finally {
      localStorage.removeItem('attendsure_token');
      localStorage.removeItem('auth_token');
      localStorage.removeItem('token');
      localStorage.removeItem('attendsure_username');
      localStorage.removeItem('attendsure_role');
      window.dispatchEvent(new CustomEvent('attendsure:auth-expired'));
    }
  };

  const role = currentUser.role;
  const isAdminOrPrincipal = role === 'ADMIN' || role === 'SUPERADMIN' || role === 'PRINCIPAL';
  const isFaculty = role === 'FACULTY';

  const visibleNotifications = useMemo(() => {
    return liveNotifications.filter((n) => {
      if (n.targetRole === 'ADMIN') return isAdminOrPrincipal;
      if ((n.targetRole as string) === 'FACULTY') return isFaculty || isAdminOrPrincipal;
      return true;
    });
  }, [liveNotifications, isAdminOrPrincipal, isFaculty]);

  const unreadCount = useMemo(() => {
    return visibleNotifications.filter((n) => !readIds.includes(n.id)).length;
  }, [visibleNotifications, readIds]);

  const markAllAsRead = () => {
    setReadIds(visibleNotifications.map((n) => n.id));
  };

  const dismissNotification = (id: string) => {
    setReadIds((prev) => (prev.includes(id) ? prev : [...prev, id]));
  };

  const getNotifIcon = (type: NotificationItem['type']) => {
    switch (type) {
      case 'CLASS':
        return <BookOpen size={14} color={brand.primary} />;
      case 'SMS':
        return <Send size={14} color={brand.secondary} />;
      case 'KIOSK':
        return <Cpu size={14} color={brand.danger} />;
      case 'GATE_PASS':
        return <FileClock size={14} color={brand.warning} />;
      default:
        return <Shield size={14} color={brand.primary} />;
    }
  };

  const rawPhoto = userPhoto || currentUser.photo_url;
  const resolvedPhoto = isSafeImageUrl(rawPhoto) ? rawPhoto : null;

  return (
    <header
      style={{
        backgroundColor: '#FFFFFF',
        borderBottom: `1px solid ${tokens.borderSubtle}`,
        padding: '12px clamp(12px, 2.5vw, 24px)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        flexWrap: 'wrap',
        gap: '12px 16px',
        boxSizing: 'border-box',
        width: '100%',
        maxWidth: '100%',
        minHeight: 64,
        position: 'relative',
        zIndex: 40,
      }}
    >
      {/* Page Title & School ID */}
      <div style={{ flex: '1 1 auto', minWidth: 'min(100%, 200px)' }}>
        <h1
          style={{
            margin: 0,
            fontSize: 'clamp(1.1rem, 2vw, 1.25rem)',
            fontWeight: 800,
            color: tokens.textPrimary,
            letterSpacing: '-0.3px',
            lineHeight: 1.2,
          }}
        >
          {displayTitle}
        </h1>
        <span
          style={{
            fontSize: '0.74rem',
            color: tokens.textMuted,
            marginTop: 3,
            display: 'block',
            whiteSpace: 'nowrap',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
          }}
        >
          Macasandig National High School | School ID: 55555
        </span>
      </div>

      {/* Action Controls */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          flexWrap: 'wrap',
          gap: '8px 12px',
          justifyContent: 'flex-end',
          flex: '1 1 auto',
        }}
      >
        {/* Search Input Box */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 8,
            backgroundColor: tokens.bgSurfaceSubtle,
            border: `1px solid ${tokens.borderStrong}`,
            borderRadius: 9999,
            padding: '6px 12px',
            flex: '1 1 160px',
            maxWidth: 240,
            minWidth: 130,
            boxSizing: 'border-box',
          }}
        >
          <Search size={14} color={tokens.textMuted} style={{ flexShrink: 0 }} />
          <input
            type="text"
            placeholder="Search student, LRN..."
            value={searchVal}
            onChange={(e) => setSearchVal(e.target.value)}
            style={{
              border: 'none',
              background: 'transparent',
              outline: 'none',
              fontSize: '0.78rem',
              color: tokens.textPrimary,
              width: '100%',
              minWidth: 0,
            }}
          />
        </div>

        {/* My Gate Pass Button */}
        <button
          type="button"
          onClick={() => setIsDigitalPassOpen(true)}
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: 6,
            padding: '6px 12px',
            borderRadius: 9999,
            fontSize: '0.74rem',
            fontWeight: 700,
            backgroundColor: tokens.primaryLight,
            border: `1px solid ${brand.primary}`,
            color: brand.primary,
            cursor: 'pointer',
            whiteSpace: 'nowrap',
            flexShrink: 0,
          }}
          title="Open your personal gate QR code pass"
        >
          <QrCode size={13} />
          <span>My Pass</span>
        </button>

        {/* Gate Status Pill */}
        <div
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: 6,
            padding: '6px 11px',
            borderRadius: 9999,
            fontSize: '0.72rem',
            fontWeight: 700,
            backgroundColor: gateOnline ? 'rgba(16, 185, 129, 0.12)' : 'rgba(239, 68, 68, 0.12)',
            border: `1px solid ${gateOnline ? 'rgba(16, 185, 129, 0.28)' : 'rgba(239, 68, 68, 0.28)'}`,
            color: gateOnline ? brand.success : brand.danger,
            whiteSpace: 'nowrap',
            flexShrink: 0,
          }}
        >
          <Activity size={12} color={gateOnline ? brand.success : brand.danger} />
          <span>{gateOnline ? 'Gate Online' : 'Gate Offline'}</span>
        </div>

        {/* Notifications Icon & Popover */}
        <div style={{ position: 'relative' }}>
          <button
            type="button"
            onClick={() => setNotifOpen(!notifOpen)}
            style={{
              position: 'relative',
              width: 36,
              height: 36,
              borderRadius: 10,
              border: `1px solid ${tokens.borderSubtle}`,
              backgroundColor: tokens.bgSurfaceSubtle,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              cursor: 'pointer',
              flexShrink: 0,
            }}
            title="Notifications"
          >
            <Bell size={15} color={tokens.textSecondary} />
            {unreadCount > 0 && (
              <span
                style={{
                  position: 'absolute',
                  top: -3,
                  right: -3,
                  backgroundColor: brand.danger,
                  color: '#FFFFFF',
                  fontSize: '0.62rem',
                  fontWeight: 800,
                  borderRadius: 9999,
                  minWidth: 16,
                  height: 16,
                  padding: '0 4px',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              >
                {unreadCount}
              </span>
            )}
          </button>

          {notifOpen && (
            <div
              style={{
                position: 'absolute',
                top: 'calc(100% + 8px)',
                right: 0,
                width: 'min(300px, calc(100vw - 32px))',
                backgroundColor: '#FFFFFF',
                border: `1px solid ${tokens.borderSubtle}`,
                borderRadius: 14,
                boxShadow: tokens.cardShadow,
                zIndex: 1000,
                padding: '12px 14px',
                boxSizing: 'border-box',
              }}
            >
              <div
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  marginBottom: 10,
                }}
              >
                <span style={{ fontSize: '0.80rem', fontWeight: 800, color: tokens.textPrimary }}>
                  Notifications
                </span>
                {unreadCount > 0 && (
                  <button
                    type="button"
                    onClick={markAllAsRead}
                    style={{
                      background: 'none',
                      border: 'none',
                      color: brand.primary,
                      fontSize: '0.68rem',
                      fontWeight: 700,
                      cursor: 'pointer',
                      display: 'flex',
                      alignItems: 'center',
                      gap: 4,
                    }}
                  >
                    <CheckCircle2 size={12} /> Mark read
                  </button>
                )}
              </div>

              <div
                style={{
                  display: 'flex',
                  flexDirection: 'column',
                  gap: 8,
                  maxHeight: 250,
                  overflowY: 'auto',
                }}
              >
                {visibleNotifications.length > 0 ? (
                  visibleNotifications.map((notif) => {
                    const isRead = readIds.includes(notif.id);
                    return (
                      <div
                        key={notif.id}
                        style={{
                          display: 'flex',
                          alignItems: 'flex-start',
                          gap: 8,
                          padding: '8px',
                          borderRadius: 8,
                          backgroundColor: isRead ? 'transparent' : tokens.bgSurfaceSubtle,
                          border: `1px solid ${tokens.borderSubtle}`,
                        }}
                      >
                        <div style={{ marginTop: 2 }}>{getNotifIcon(notif.type)}</div>
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ fontSize: '0.74rem', fontWeight: 700, color: tokens.textPrimary }}>
                            {notif.title}
                          </div>
                          <div style={{ fontSize: '0.68rem', color: tokens.textSecondary, lineHeight: 1.3 }}>
                            {notif.message}
                          </div>
                          <div style={{ fontSize: '0.62rem', color: tokens.textMuted, marginTop: 2 }}>
                            {notif.time}
                          </div>
                        </div>
                        <button
                          type="button"
                          onClick={() => dismissNotification(notif.id)}
                          style={{
                            background: 'none',
                            border: 'none',
                            color: tokens.textMuted,
                            cursor: 'pointer',
                            padding: 0,
                          }}
                          title="Dismiss"
                        >
                          <X size={12} />
                        </button>
                      </div>
                    );
                  })
                ) : (
                  <div style={{ padding: '24px 12px', textAlign: 'center', color: tokens.textMuted }}>
                    <Inbox size={20} style={{ margin: '0 auto 6px auto', display: 'block' }} />
                    <span style={{ fontSize: '0.76rem', fontWeight: 600 }}>No unread alerts</span>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>

        {/* User Profile & Account Menu */}
        <div style={{ position: 'relative' }}>
          <button
            type="button"
            onClick={() => setDropdownOpen(!dropdownOpen)}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 8,
              background: 'none',
              border: 'none',
              cursor: 'pointer',
              padding: '4px',
              borderRadius: 8,
            }}
          >
            <div
              style={{
                width: 34,
                height: 34,
                borderRadius: '50%',
                overflow: 'hidden',
                backgroundColor: tokens.primaryLight,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                border: `1px solid ${tokens.borderSubtle}`,
                flexShrink: 0,
              }}
            >
              {resolvedPhoto ? (
                <img
                  src={resolvedPhoto}
                  alt={currentUser.full_name}
                  style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                />
              ) : (
                <User size={16} color={brand.primary} />
              )}
            </div>
            <div style={{ textAlign: 'left', minWidth: 0 }}>
              <div
                style={{
                  fontSize: '0.78rem',
                  fontWeight: 700,
                  color: tokens.textPrimary,
                  whiteSpace: 'nowrap',
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  maxWidth: 120,
                }}
              >
                {currentUser.full_name || 'My Account'}
              </div>
              <div style={{ fontSize: '0.66rem', color: tokens.textMuted }}>
                {currentUser.role || 'FACULTY'}
              </div>
            </div>
            <ChevronDown size={14} color={tokens.textMuted} style={{ flexShrink: 0 }} />
          </button>

          {dropdownOpen && (
            <div
              style={{
                position: 'absolute',
                top: 'calc(100% + 8px)',
                right: 0,
                backgroundColor: '#FFFFFF',
                border: `1px solid ${tokens.borderSubtle}`,
                borderRadius: 12,
                boxShadow: tokens.cardShadow,
                width: 'min(190px, calc(100vw - 32px))',
                zIndex: 1000,
                overflow: 'hidden',
                boxSizing: 'border-box',
              }}
            >
              <div style={{ padding: '8px 12px', borderBottom: `1px solid ${tokens.borderSubtle}` }}>
                <span style={{ fontSize: '0.68rem', color: tokens.textMuted }}>Logged in as</span>
                <strong style={{ display: 'block', fontSize: '0.76rem', color: tokens.textPrimary, wordBreak: 'break-all' }}>
                  {currentUser.username || 'User'}
                </strong>
              </div>

              {onOpenProfile && (
                <button
                  type="button"
                  onClick={() => {
                    setDropdownOpen(false);
                    onOpenProfile();
                  }}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 8,
                    width: '100%',
                    padding: '8px 12px',
                    border: 'none',
                    background: 'none',
                    fontSize: '0.76rem',
                    fontWeight: 600,
                    color: tokens.textPrimary,
                    cursor: 'pointer',
                    textAlign: 'left',
                  }}
                >
                  <User size={14} />
                  <span>Profile</span>
                </button>
              )}

              <button
                type="button"
                onClick={handleLogout}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 8,
                  width: '100%',
                  padding: '10px 12px',
                  border: 'none',
                  background: 'none',
                  fontSize: '0.76rem',
                  fontWeight: 700,
                  color: brand.danger,
                  cursor: 'pointer',
                  textAlign: 'left',
                }}
              >
                <LogOut size={14} color={brand.danger} />
                <span>Sign Out</span>
              </button>
            </div>
          )}
        </div>
      </div>

      {isDigitalPassOpen && (
        <StudentIdPassModal
          student={{
            id: 0,
            name: currentUser.full_name || currentUser.username,
            lrn: currentUser.employee_id || currentUser.username,
            photo_url: resolvedPhoto,
            rfid_uid: currentUser.rfid_uid,
            gender: 'N/A',
            attendance_status: 'PRESENT',
          }}
          selectedClass={{
            id: 0,
            section_name: `${currentUser.role || 'STAFF'} &bull; Lapasan National High School`,
          } as any}
          onClose={() => setIsDigitalPassOpen(false)}
          onCopyLrn={(id) => {
            if (navigator.clipboard) navigator.clipboard.writeText(id);
          }}
        />
      )}
    </header>
  );
};

export default Header;