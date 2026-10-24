/**
 * AttendSure V3 - Responsive Application Header Bar
 * File: web/src/components/layout/Header.tsx
 *
 * Cybersecurity & Performance:
 * 1. Mobile-First Responsiveness: Collapses non-essential pills on small screens (<768px).
 * 2. Staggered Background Notifications: 2-second boot delay to prevent thread contention.
 * 3. URL Sanitization: Rejects script and javascript: injection in user avatars.
 * 4. Zero Emojis: Strictly renders Lucide SVG components.
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

const isSafeImageUrl = (url?: string | null): boolean => {
  if (!url || typeof url !== 'string') return false;
  const clean = url.trim().toLowerCase();
  if (!clean || clean === 'null' || clean === 'undefined' || clean === 'none') return false;
  if (clean.startsWith('javascript:') || clean.startsWith('vbscript:')) return false;
  return clean.startsWith('http://') || clean.startsWith('https://') || clean.startsWith('/') || clean.startsWith('data:image/');
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
  const [readIds, setReadIds] = useState<string[]>([]);

  const notifRef = useRef<HTMLDivElement>(null);
  const profileRef = useRef<HTMLDivElement>(null);
  const isFetchingRef = useRef<boolean>(false);

  const role = (session?.role || 'FACULTY').toUpperCase();
  const isAdminOrPrincipal = role === 'ADMIN' || role === 'PRINCIPAL';
  const isTeacher = role === 'FACULTY' || role === 'TEACHER';

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
        })
      );
    };

    updateClock();
    const timer = setInterval(updateClock, 1000);
    return () => clearInterval(timer);
  }, []);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (notifRef.current && !notifRef.current.contains(e.target as Node)) {
        setNotifOpen(false);
      }
      if (profileRef.current && !profileRef.current.contains(e.target as Node)) {
        setProfileOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const fetchRoleNotifications = useCallback(async () => {
    if (!session?.token || isFetchingRef.current) return;
    isFetchingRef.current = true;

    const newItems: NotificationItem[] = [];
    const badgeMap: TabBadgeCounts = {};

    try {
      const passRes = await apiClient.get('/gate-passes/?status=ACTIVE&page_size=1', { timeout: 3500 }).catch(() => null);
      if (passRes?.data) {
        const count = typeof passRes.data.count === 'number' ? passRes.data.count : 0;
        if (count > 0) {
          badgeMap['gate-passes'] = count;
          newItems.push({
            id: 'gate-passes',
            tab: 'gate-passes',
            title: `${count} Active Gate Pass(es)`,
            description: 'Students cleared for authorized departure.',
            count,
            severity: 'info',
            icon: <Ticket size={16} color="#004b87" />,
          });
        }
      }

      setNotifications(newItems);
      window.dispatchEvent(new CustomEvent('attendsure:notifications-sync', { detail: badgeMap }));
    } finally {
      isFetchingRef.current = false;
    }
  }, [session?.token]);

  useEffect(() => {
    const timer = setTimeout(fetchRoleNotifications, 2000);
    return () => clearTimeout(timer);
  }, [fetchRoleNotifications]);

  const unreadNotifications = notifications.filter((n) => !readIds.includes(n.id));
  const totalBellCount = unreadNotifications.reduce((sum, item) => sum + item.count, 0);
  const safePhoto = isSafeImageUrl(userPhoto) ? userPhoto : null;

  return (
    <header style={headerWrapper}>
      <style>{`
        @media (max-width: 768px) {
          .header-clock-pill { display: none !important; }
          .header-title-text { font-size: 1rem !important; }
        }
      `}</style>

      {/* Title & School Meta */}
      <div style={{ display: 'flex', flexDirection: 'column', minWidth: 0, overflow: 'hidden' }}>
        {schoolName && (
          <span style={{ fontSize: '0.68rem', color: '#64748b', fontWeight: 700, letterSpacing: '0.4px', textTransform: 'uppercase' }}>
            {schoolName}
          </span>
        )}
        <h1 className="header-title-text" style={{ fontSize: '1.15rem', fontWeight: 800, color: '#0f172a', margin: 0, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
          {title}
        </h1>
      </div>

      {/* Right Actions */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        {/* Clock Pill */}
        <div className="header-clock-pill" style={clockPillStyle}>
          <Clock size={13} color="#004b87" />
          <span>{currentTime}</span>
        </div>

        {/* Gate Scanner Status */}
        <div style={{ ...statusPillStyle, backgroundColor: isGateNodeOnline ? '#ecfdf5' : '#fee2e2', borderColor: isGateNodeOnline ? '#a7f3d0' : '#fecaca', color: isGateNodeOnline ? '#059669' : '#dc2626' }}>
          <Radio size={13} />
          <span>Gate: {isGateNodeOnline ? 'Online' : 'Offline'}</span>
        </div>

        {/* Notification Bell */}
        <div style={{ position: 'relative' }} ref={notifRef}>
          <button
            type="button"
            onClick={() => {
              setNotifOpen((prev) => !prev);
              setProfileOpen(false);
            }}
            style={iconButtonStyle}
            title="Notifications"
          >
            <Bell size={16} />
            {totalBellCount > 0 && (
              <span style={notifBadgeStyle}>{totalBellCount > 9 ? '9+' : totalBellCount}</span>
            )}
          </button>

          {notifOpen && (
            <div style={notifDropdownCard}>
              <div style={{ padding: '10px 14px', borderBottom: '1px solid #f1f5f9', fontWeight: 800, fontSize: '0.84rem' }}>
                Notifications
              </div>
              <div style={{ maxHeight: 260, overflowY: 'auto' }}>
                {notifications.length === 0 ? (
                  <div style={{ padding: 24, textAlign: 'center', color: '#64748b', fontSize: '0.78rem' }}>
                    No pending alerts.
                  </div>
                ) : (
                  notifications.map((n) => (
                    <div
                      key={n.id}
                      onClick={() => {
                        setNotifOpen(false);
                        onNavigateTab(n.tab);
                      }}
                      style={{ padding: '10px 14px', borderBottom: '1px solid #f8fafc', cursor: 'pointer', display: 'flex', gap: 8 }}
                    >
                      {n.icon}
                      <div>
                        <div style={{ fontSize: '0.80rem', fontWeight: 700, color: '#0f172a' }}>{n.title}</div>
                        <div style={{ fontSize: '0.72rem', color: '#64748b' }}>{n.description}</div>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>
          )}
        </div>

        {/* User Profile */}
        <div style={{ position: 'relative' }} ref={profileRef}>
          <button
            type="button"
            onClick={() => {
              setProfileOpen((prev) => !prev);
              setNotifOpen(false);
            }}
            style={profileTriggerStyle}
          >
            {safePhoto ? (
              <img src={safePhoto} alt="User" style={{ width: 28, height: 28, borderRadius: '50%', objectFit: 'cover' }} />
            ) : (
              <div style={{ width: 28, height: 28, borderRadius: '50%', backgroundColor: '#004b87', color: '#fff', fontSize: '0.74rem', fontWeight: 800, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                {session?.faculty_name?.charAt(0) || 'U'}
              </div>
            )}
            <ChevronDown size={14} color="#64748b" />
          </button>

          {profileOpen && (
            <div style={profileDropdownCard}>
              <div style={{ padding: '8px 12px', borderBottom: '1px solid #f1f5f9' }}>
                <div style={{ fontSize: '0.80rem', fontWeight: 800, color: '#0f172a' }}>{session?.faculty_name || session?.username}</div>
                <div style={{ fontSize: '0.68rem', color: '#004b87', fontWeight: 700 }}>{role} ACCOUNT</div>
              </div>
              <button
                type="button"
                onClick={() => {
                  setProfileOpen(false);
                  onOpenProfile();
                }}
                style={dropdownItemBtn}
              >
                <User size={13} color="#64748b" /> My Profile
              </button>
              <button
                type="button"
                onClick={() => {
                  setProfileOpen(false);
                  onLogout();
                }}
                style={{ ...dropdownItemBtn, color: '#dc2626' }}
              >
                <LogOut size={13} color="#dc2626" /> Log Out
              </button>
            </div>
          )}
        </div>
      </div>
    </header>
  );
};

const headerWrapper: React.CSSProperties = {
  height: 60,
  minHeight: 60,
  backgroundColor: '#ffffff',
  borderBottom: '1px solid #e2e8f0',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
  padding: '0 clamp(12px, 2.5vw, 24px)',
  boxSizing: 'border-box',
  zIndex: 40,
};

const clockPillStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: 6,
  height: 34,
  padding: '0 10px',
  backgroundColor: '#f8fafc',
  border: '1px solid #e2e8f0',
  borderRadius: 17,
  fontSize: '0.74rem',
  color: '#334155',
  fontFamily: 'monospace',
  fontWeight: 700,
};

const statusPillStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: 5,
  height: 34,
  padding: '0 10px',
  borderRadius: 17,
  border: '1px solid',
  fontSize: '0.74rem',
  fontWeight: 700,
};

const iconButtonStyle: React.CSSProperties = {
  width: 36,
  height: 36,
  borderRadius: '50%',
  border: '1px solid #e2e8f0',
  backgroundColor: '#f8fafc',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  cursor: 'pointer',
  color: '#334155',
  position: 'relative',
};

const notifBadgeStyle: React.CSSProperties = {
  position: 'absolute',
  top: -3,
  right: -3,
  minWidth: 16,
  height: 16,
  borderRadius: 8,
  backgroundColor: '#dc2626',
  color: '#ffffff',
  fontSize: '0.62rem',
  fontWeight: 800,
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  padding: '0 3px',
};

const profileTriggerStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: 6,
  height: 36,
  padding: '0 8px 0 4px',
  backgroundColor: '#f8fafc',
  border: '1px solid #e2e8f0',
  borderRadius: 18,
  cursor: 'pointer',
};

const notifDropdownCard: React.CSSProperties = {
  position: 'absolute',
  top: 44,
  right: 0,
  width: 280,
  backgroundColor: '#ffffff',
  border: '1px solid #e2e8f0',
  borderRadius: 10,
  boxShadow: '0 10px 25px rgba(0,0,0,0.1)',
  overflow: 'hidden',
  zIndex: 100,
};

const profileDropdownCard: React.CSSProperties = {
  position: 'absolute',
  top: 44,
  right: 0,
  width: 180,
  backgroundColor: '#ffffff',
  border: '1px solid #e2e8f0',
  borderRadius: 10,
  boxShadow: '0 10px 25px rgba(0,0,0,0.1)',
  padding: '4px 0',
  display: 'flex',
  flexDirection: 'column',
  zIndex: 100,
};

const dropdownItemBtn: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: 8,
  padding: '8px 12px',
  background: 'none',
  border: 'none',
  fontSize: '0.78rem',
  fontWeight: 600,
  color: '#334155',
  cursor: 'pointer',
  textAlign: 'left',
};

export default Header;