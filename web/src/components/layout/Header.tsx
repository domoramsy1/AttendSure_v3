/**
 * AttendSure - Main Header with Color Mode Switcher
 * File: web/src/components/layout/Header.tsx
 */

import React, { useState, useEffect, useMemo, useCallback } from 'react';
import apiClient from '../../api/client';
import { useTheme } from '../../context/ThemeContext';
import { isSafeImageUrl, type ThemeMode } from '../../theme/tokens';
import StudentIdPassModal from '../modals/StudentIdPassModal';
import {
  Search, Bell, ChevronDown, LogOut, User,
  CheckCircle2, X, Activity, QrCode, Inbox, Sun, Moon, Eye,
} from 'lucide-react';
import type { UserSession } from '../../types/section';
import type { NavItemKey } from './Sidebar';

export interface TabBadgeCounts {
  [key: string]: number | undefined;
}

export function formatBadgeCount(count?: number | null): string {
  if (!count || count <= 0) return '';
  return count > 999 ? `${(count / 1000).toFixed(1)}k` : String(count);
}

export interface HeaderProps {
  title?: string;
  currentTitle?: string;
  activeTab?: string;
  onTabChange?: (tab: string) => void;
  isSystemOnline?: boolean;
  session?: UserSession | null;
  userPhoto?: string | null;
  schoolName?: string;
  schoolId?: string;
  schoolLogo?: string | null;
  onLogout?: () => void;
  onNavigateTab?: (tab: NavItemKey) => void;
  onOpenProfile?: () => void;
}

interface NotificationItem {
  id: string;
  title: string;
  message: string;
  time: string;
  targetRole?: 'ADMIN' | 'ALL';
}

export const Header: React.FC<HeaderProps> = ({
  title,
  currentTitle = 'Dashboard',
  isSystemOnline,
  userPhoto,
  onLogout,
  onOpenProfile,
}) => {
  const { mode, setThemeMode, tokens, brand, fonts, ui } = useTheme();
  const [currentUser, setCurrentUser] = useState({
    username: '',
    full_name: '',
    role: '',
    photo_url: null as string | null,
    employee_id: '',
    qr_token: '',
  });
  const [systemOnline, setSystemOnline] = useState(true);
  const [searchVal, setSearchVal] = useState('');
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const [notifOpen, setNotifOpen] = useState(false);
  const [readIds, setReadIds] = useState<string[]>([]);
  const [liveNotifications, setLiveNotifications] = useState<NotificationItem[]>([]);
  const [isDigitalPassOpen, setIsDigitalPassOpen] = useState(false);

  useEffect(() => {
    if (typeof isSystemOnline === 'boolean') setSystemOnline(isSystemOnline);
  }, [isSystemOnline]);

  const fetchSystemStatus = useCallback(async () => {
    if (!localStorage.getItem('attendsure_token')) return;
    try {
      const [userRes, statusRes] = await Promise.allSettled([
        apiClient.get('/me/'),
        apiClient.get('/system/status/'),
      ]);

      if (userRes.status === 'fulfilled' && userRes.value?.data) {
        const u = userRes.value.data;
        setCurrentUser({
          username: u.username || '',
          full_name: u.full_name || u.first_name || u.username || 'User',
          role: String(u.role || u.system_role || 'FACULTY').toUpperCase(),
          photo_url: u.photo_url || u.photo || null,
          employee_id: u.employee_id || u.username || '',
          qr_token: u.qr_token || '',
        });
      }

      if (statusRes.status === 'fulfilled' && statusRes.value?.data) {
        const d = statusRes.value.data;
        const alerts: NotificationItem[] = [];
        const pending = Number(d.pending_total || 0);
        if (pending > 50 || Number(d.failed_total || 0) > 0) {
          alerts.push({
            id: 'push-alert',
            title: 'Push Alert Notice',
            message: `${pending} parent mobile push alerts are queued.`,
            time: 'Just now',
            targetRole: 'ADMIN',
          });
        }
        setLiveNotifications(alerts);
        if (typeof isSystemOnline !== 'boolean') setSystemOnline(true);
      }
    } catch {
      if (typeof isSystemOnline !== 'boolean') setSystemOnline(false);
    }
  }, [isSystemOnline]);

  useEffect(() => {
    fetchSystemStatus();
    const timer = setInterval(fetchSystemStatus, 30000);
    return () => clearInterval(timer);
  }, [fetchSystemStatus]);

  const handleLogout = async () => {
    if (onLogout) return onLogout();
    await apiClient.post('/auth/logout/').catch(() => {});
    localStorage.clear();
    window.dispatchEvent(new CustomEvent('attendsure:auth-expired'));
  };

  const isAdmin = ['ADMIN', 'SUPERADMIN', 'PRINCIPAL'].includes(currentUser.role);
  const visibleNotifications = useMemo(
    () => liveNotifications.filter((n) => (n.targetRole === 'ADMIN' ? isAdmin : true)),
    [liveNotifications, isAdmin]
  );
  const unreadCount = visibleNotifications.filter((n) => !readIds.includes(n.id)).length;
  const resolvedPhoto = isSafeImageUrl(userPhoto || currentUser.photo_url) ? (userPhoto || currentUser.photo_url) : null;

  const themeOptions: { key: ThemeMode; label: string; icon: React.ReactNode }[] = [
    { key: 'light', label: 'Light Mode', icon: <Sun size={14} /> },
    { key: 'dark', label: 'Dark Mode', icon: <Moon size={14} /> },
    { key: 'high-contrast', label: 'High-Contrast Mode', icon: <Eye size={14} /> },
  ];

  return (
    <header
      style={{
        backgroundColor: tokens.bgSurface,
        borderBottom: `1px solid ${tokens.borderSubtle}`,
        padding: '10px 20px',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        flexWrap: 'wrap',
        gap: 12,
        minHeight: 64,
        zIndex: 40,
      }}
    >
      {/* Left: Page Title & School Info */}
      <div>
        <h1 style={{ margin: 0, fontSize: fonts.size.lg, fontWeight: fonts.weight.extrabold, color: tokens.textPrimary }}>
          {title || currentTitle}
        </h1>
        <span style={{ fontSize: fonts.size.sm, color: tokens.textMuted }}>
          Macasandig National High School | School ID: 55555
        </span>
      </div>

      {/* Right: Search, My ID Pass, Status, Color Switcher, Notifications, Profile */}
      <div style={{ display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: 10 }}>
        {/* Search Box */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, backgroundColor: tokens.bgSurfaceSubtle, border: `1px solid ${tokens.borderStrong}`, borderRadius: 9999, padding: '5px 12px' }}>
          <Search size={14} color={tokens.textMuted} />
          <input
            type="text"
            placeholder="Search student, LRN..."
            value={searchVal}
            onChange={(e) => setSearchVal(e.target.value)}
            style={{ border: 'none', background: 'transparent', outline: 'none', fontSize: fonts.size.sm, color: tokens.textPrimary, width: 150 }}
          />
        </div>

        {/* My Pass Button */}
        <button
          type="button"
          onClick={() => setIsDigitalPassOpen(true)}
          style={{ ...ui.badge(tokens.primaryLight, brand.primary), border: `1px solid ${brand.primary}`, padding: '6px 12px', cursor: 'pointer' }}
        >
          <QrCode size={13} /> My Pass
        </button>

        {/* System Status Pill */}
        <div style={ui.badge(systemOnline ? tokens.successLight : tokens.dangerLight, systemOnline ? brand.success : brand.danger)}>
          <Activity size={12} /> {systemOnline ? 'Online' : 'Offline'}
        </div>

        {/* Color Mode Switcher */}
        <div style={{ display: 'flex', backgroundColor: tokens.bgSurfaceSubtle, borderRadius: 9999, padding: 3, border: `1px solid ${tokens.borderSubtle}` }}>
          {themeOptions.map((opt) => {
            const active = mode === opt.key;
            return (
              <button
                key={opt.key}
                type="button"
                title={opt.label}
                onClick={() => setThemeMode(opt.key)}
                style={{
                  background: active ? brand.primary : 'transparent',
                  color: active ? '#ffffff' : tokens.textMuted,
                  border: 'none',
                  borderRadius: '50%',
                  width: 28,
                  height: 28,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  cursor: 'pointer',
                }}
              >
                {opt.icon}
              </button>
            );
          })}
        </div>

        {/* Notifications Bell */}
        <div style={{ position: 'relative' }}>
          <button type="button" onClick={() => setNotifOpen(!notifOpen)} style={{ ...ui.btnSecondary, padding: 8, position: 'relative' }}>
            <Bell size={15} />
            {unreadCount > 0 && (
              <span style={{ position: 'absolute', top: -4, right: -4, backgroundColor: brand.danger, color: '#fff', fontSize: '0.6rem', fontWeight: 800, borderRadius: 9999, padding: '1px 5px' }}>
                {unreadCount}
              </span>
            )}
          </button>

          {notifOpen && (
            <div style={{ ...ui.card, position: 'absolute', top: 'calc(100% + 8px)', right: 0, width: 280, zIndex: 1000 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8 }}>
                <strong style={{ fontSize: fonts.size.sm, color: tokens.textPrimary }}>Notifications</strong>
                {unreadCount > 0 && (
                  <button type="button" onClick={() => setReadIds(visibleNotifications.map((n) => n.id))} style={{ background: 'none', border: 'none', color: brand.primary, fontSize: fonts.size.xs, fontWeight: 700, cursor: 'pointer' }}>
                    <CheckCircle2 size={11} /> Mark read
                  </button>
                )}
              </div>
              {visibleNotifications.length === 0 ? (
                <div style={{ padding: 16, textAlign: 'center', color: tokens.textMuted, fontSize: fonts.size.sm }}>
                  <Inbox size={18} style={{ margin: '0 auto 4px', display: 'block' }} /> No unread alerts
                </div>
              ) : (
                visibleNotifications.map((n) => (
                  <div key={n.id} style={{ ...ui.subtleBox, display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
                    <div>
                      <div style={{ fontSize: fonts.size.sm, fontWeight: 700, color: tokens.textPrimary }}>{n.title}</div>
                      <div style={{ fontSize: fonts.size.xs, color: tokens.textSecondary }}>{n.message}</div>
                    </div>
                    <button type="button" onClick={() => setReadIds((p) => [...p, n.id])} style={{ background: 'none', border: 'none', color: tokens.textMuted, cursor: 'pointer' }}>
                      <X size={12} />
                    </button>
                  </div>
                ))
              )}
            </div>
          )}
        </div>

        {/* User Account Menu */}
        <div style={{ position: 'relative' }}>
          <button type="button" onClick={() => setDropdownOpen(!dropdownOpen)} style={{ display: 'flex', alignItems: 'center', gap: 8, background: 'none', border: 'none', cursor: 'pointer' }}>
            <div style={{ width: 34, height: 34, borderRadius: '50%', overflow: 'hidden', backgroundColor: tokens.primaryLight, display: 'flex', alignItems: 'center', justifyContent: 'center', border: `1px solid ${tokens.borderSubtle}` }}>
              {resolvedPhoto ? <img src={resolvedPhoto} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} /> : <User size={16} color={brand.primary} />}
            </div>
            <div style={{ textAlign: 'left' }}>
              <div style={{ fontSize: fonts.size.sm, fontWeight: 700, color: tokens.textPrimary }}>{currentUser.full_name || 'Account'}</div>
              <div style={{ fontSize: fonts.size.xs, color: tokens.textMuted }}>{currentUser.role || 'FACULTY'}</div>
            </div>
            <ChevronDown size={14} color={tokens.textMuted} />
          </button>

          {dropdownOpen && (
            <div style={{ ...ui.card, position: 'absolute', top: 'calc(100% + 8px)', right: 0, width: 180, padding: 8, zIndex: 1000 }}>
              {onOpenProfile && (
                <button type="button" onClick={() => { setDropdownOpen(false); onOpenProfile(); }} style={{ ...ui.btnSecondary, width: '100%', border: 'none', marginBottom: 4 }}>
                  <User size={14} /> Profile
                </button>
              )}
              <button type="button" onClick={handleLogout} style={{ ...ui.btnSecondary, width: '100%', border: 'none', color: brand.danger }}>
                <LogOut size={14} /> Sign Out
              </button>
            </div>
          )}
        </div>
      </div>

      {isDigitalPassOpen && (
        <StudentIdPassModal
          student={{ id: 0, name: currentUser.full_name || currentUser.username, lrn: currentUser.employee_id || currentUser.username, photo_url: resolvedPhoto, qr_token: currentUser.qr_token }}
          selectedClass={{ id: 0, section_name: `${currentUser.role || 'FACULTY'} • Macasandig National High School` } as any}
          onClose={() => setIsDigitalPassOpen(false)}
          onCopyLrn={(id) => navigator.clipboard?.writeText(id)}
        />
      )}
    </header>
  );
};

export default Header;