/**
 * AttendSure - Compact Top Application Header
 * File: web/src/components/layout/Header.tsx
 */

import React, { useState, useEffect, useCallback } from 'react';
import apiClient from '../../api/client';
import { API_ROUTES } from '../../api/routes';
import { useSchool } from '../../context/SchoolContext';
import { useTheme } from '../../context/ThemeContext';
import { isSafeImageUrl, type ThemeMode } from '../../theme/tokens';
import { ControlSwitch } from '../ui/ControlSwitch';
import StudentIdPassModal from '../modals/StudentIdPassModal';
import {
  Bell,
  ChevronDown,
  LogOut,
  User,
  CheckCircle2,
  X,
  Activity,
  QrCode,
  Inbox,
  Sun,
  Moon,
  Eye,
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

interface AlertNotice {
  id: number;
  title: string;
  message: string;
}

export const Header: React.FC<HeaderProps> = ({
  title,
  currentTitle = 'Dashboard',
  isSystemOnline = true,
  session,
  userPhoto,
  schoolName,
  schoolId,
  onLogout,
  onOpenProfile,
}) => {
  const { school } = useSchool();
  const { mode, setThemeMode, tokens, brand, fonts, ui } = useTheme();

  const [systemOnline, setSystemOnline] = useState<boolean>(isSystemOnline);
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const [notifOpen, setNotifOpen] = useState(false);
  const [unreadAlerts, setUnreadAlerts] = useState<AlertNotice[]>([]);
  const [isDigitalPassOpen, setIsDigitalPassOpen] = useState(false);

  useEffect(() => {
    setSystemOnline(isSystemOnline);
  }, [isSystemOnline]);

  const pollAlerts = useCallback(async () => {
    if (!session?.token || document.visibilityState !== 'visible') return;
    try {
      const res = await apiClient.get(API_ROUTES.messaging.notifications, { params: { page_size: 10 } });
      const raw = Array.isArray(res.data) ? res.data : res.data?.results || [];
      const unread = raw
        .filter((item: { is_read?: boolean }) => !item.is_read)
        .map((item: { id: number; title: string; message: string }) => ({
          id: item.id,
          title: item.title,
          message: item.message,
        }));
      setUnreadAlerts(unread);
      setSystemOnline(true);
    } catch {
      // Quiet background poll
    }
  }, [session?.token]);

  useEffect(() => {
    pollAlerts();
    const timer = setInterval(pollAlerts, 30000);
    return () => clearInterval(timer);
  }, [pollAlerts]);

  const markAllAlertsRead = async () => {
    await apiClient.post(API_ROUTES.messaging.markRead, {}).catch(() => {});
    setUnreadAlerts([]);
  };

  const handleLogout = () => {
    if (onLogout) {
      onLogout();
      return;
    }
    localStorage.clear();
    window.dispatchEvent(new CustomEvent('attendsure:auth-expired'));
  };

  const activeSchoolName = schoolName || school.school_name || 'School Campus';
  const activeSchoolId = schoolId || school.school_id || '—';
  const displayName = session?.faculty_name || session?.username || 'Account';
  const displayRole = (session?.role || 'FACULTY').toUpperCase();
  const resolvedPhoto = isSafeImageUrl(userPhoto) ? userPhoto : null;

  const themeOptions: { value: ThemeMode; title: string; icon: React.ReactNode }[] = [
    { value: 'light', title: 'Light Mode', icon: <Sun size={13} /> },
    { value: 'dark', title: 'Dark Mode', icon: <Moon size={13} /> },
    { value: 'high-contrast', title: 'High-Contrast Mode', icon: <Eye size={13} /> },
  ];

  return (
    <header
      style={{
        backgroundColor: tokens.bgSurface,
        borderBottomWidth: 1,
        borderBottomStyle: 'solid',
        borderBottomColor: tokens.borderSubtle,
        padding: '7px 16px',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        flexWrap: 'wrap',
        gap: 10,
        minHeight: 52,
        zIndex: 40,
      }}
    >
      <div>
        <h1 style={{ margin: 0, fontSize: fonts.size.md, fontWeight: fonts.weight.extrabold, color: tokens.textPrimary }}>
          {title || currentTitle}
        </h1>
        <span style={{ fontSize: fonts.size.xs, color: tokens.textMuted }}>
          {activeSchoolName} &bull; School ID: {activeSchoolId}
        </span>
      </div>

      <div style={{ display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: 8 }}>
        <button
          type="button"
          onClick={() => setIsDigitalPassOpen(true)}
          style={{
            ...ui.badge(tokens.primaryLight, brand.primary),
            borderWidth: 1,
            borderStyle: 'solid',
            borderColor: brand.primary,
            padding: '5px 10px',
            cursor: 'pointer',
          }}
        >
          <QrCode size={12} /> My Pass
        </button>

        <div style={ui.badge(systemOnline ? tokens.successLight : tokens.dangerLight, systemOnline ? brand.success : brand.danger)}>
          <Activity size={11} /> {systemOnline ? 'Online' : 'Offline'}
        </div>

        <ControlSwitch
          options={themeOptions}
          value={mode}
          onChange={setThemeMode}
          compactIconsOnly
          ariaLabel="Theme Mode"
        />

        <div style={{ position: 'relative' }}>
          <button
            type="button"
            onClick={() => setNotifOpen(!notifOpen)}
            aria-label="Notifications"
            style={{ ...ui.btnSecondary, padding: 6, position: 'relative' }}
          >
            <Bell size={14} />
            {unreadAlerts.length > 0 && (
              <span
                style={{
                  position: 'absolute',
                  top: -4,
                  right: -4,
                  backgroundColor: brand.danger,
                  color: '#fff',
                  fontSize: '0.58rem',
                  fontWeight: 800,
                  borderRadius: 9999,
                  padding: '1px 5px',
                }}
              >
                {formatBadgeCount(unreadAlerts.length)}
              </span>
            )}
          </button>

          {notifOpen && (
            <div style={{ ...ui.card, position: 'absolute', top: 'calc(100% + 8px)', right: 0, width: 280, zIndex: 1000 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                <strong style={{ fontSize: fonts.size.sm, color: tokens.textPrimary }}>Unread Alerts</strong>
                {unreadAlerts.length > 0 && (
                  <button
                    type="button"
                    onClick={markAllAlertsRead}
                    style={{ background: 'none', border: 'none', color: brand.primary, fontSize: fonts.size.xs, fontWeight: 700, cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: 4 }}
                  >
                    <CheckCircle2 size={11} /> Mark all read
                  </button>
                )}
              </div>

              {unreadAlerts.length === 0 ? (
                <div style={{ padding: 14, textAlign: 'center', color: tokens.textMuted, fontSize: fonts.size.sm }}>
                  <Inbox size={18} style={{ margin: '0 auto 4px', display: 'block' }} /> No unread alerts
                </div>
              ) : (
                unreadAlerts.slice(0, 6).map((n) => (
                  <div key={n.id} style={{ ...ui.subtleBox, display: 'flex', justifyContent: 'space-between', gap: 8, marginBottom: 6 }}>
                    <div style={{ minWidth: 0 }}>
                      <div style={{ fontSize: fonts.size.sm, fontWeight: 700, color: tokens.textPrimary }}>{n.title}</div>
                      <div style={{ fontSize: fonts.size.xs, color: tokens.textSecondary }}>{n.message}</div>
                    </div>
                    <button
                      type="button"
                      onClick={() => setUnreadAlerts((prev) => prev.filter((item) => item.id !== n.id))}
                      style={{ background: 'none', border: 'none', color: tokens.textMuted, cursor: 'pointer' }}
                    >
                      <X size={12} />
                    </button>
                  </div>
                ))
              )}
            </div>
          )}
        </div>

        <div style={{ position: 'relative' }}>
          <button
            type="button"
            onClick={() => setDropdownOpen(!dropdownOpen)}
            style={{ display: 'flex', alignItems: 'center', gap: 7, background: 'none', border: 'none', cursor: 'pointer' }}
          >
            <div
              style={{
                width: 30,
                height: 30,
                borderRadius: '50%',
                overflow: 'hidden',
                backgroundColor: tokens.primaryLight,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                borderWidth: 1,
                borderStyle: 'solid',
                borderColor: tokens.borderSubtle,
              }}
            >
              {resolvedPhoto ? (
                <img src={resolvedPhoto} alt={displayName} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
              ) : (
                <User size={14} color={brand.primary} />
              )}
            </div>
            <div style={{ textAlign: 'left' }}>
              <div style={{ fontSize: fonts.size.sm, fontWeight: 700, color: tokens.textPrimary }}>{displayName}</div>
              <div style={{ fontSize: '0.62rem', color: tokens.textMuted }}>{displayRole}</div>
            </div>
            <ChevronDown size={13} color={tokens.textMuted} />
          </button>

          {dropdownOpen && (
            <div style={{ ...ui.card, position: 'absolute', top: 'calc(100% + 8px)', right: 0, width: 180, padding: 8, zIndex: 1000 }}>
              {onOpenProfile && (
                <button
                  type="button"
                  onClick={() => {
                    setDropdownOpen(false);
                    onOpenProfile();
                  }}
                  style={{ ...ui.btnSecondary, width: '100%', borderStyle: 'none', marginBottom: 4 }}
                >
                  <User size={14} /> My Profile
                </button>
              )}
              <button
                type="button"
                onClick={handleLogout}
                style={{ ...ui.btnSecondary, width: '100%', borderStyle: 'none', color: brand.danger }}
              >
                <LogOut size={14} /> Sign Out
              </button>
            </div>
          )}
        </div>
      </div>

      {isDigitalPassOpen && (
        <StudentIdPassModal
          student={{
            id: session?.user_id || 0,
            name: displayName,
            lrn: session?.username || 'STAFF',
            photo_url: resolvedPhoto,
          }}
          selectedClass={{ id: 0, section_name: `${displayRole} • ${activeSchoolName}` } as never}
          onClose={() => setIsDigitalPassOpen(false)}
          onCopyLrn={(id) => navigator.clipboard?.writeText(id)}
        />
      )}
    </header>
  );
};

export default Header;