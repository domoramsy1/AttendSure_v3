/**
 * AttendSure V3 - Institutional Top Header Bar
 * File: frontend/src/components/layout/Header.tsx
 *
 * Fixes TS2322 by maintaining backward-compatible optional props for App.tsx
 * while keeping the visual layout clean and free of duplicate headers/logos.
 */

import React, { useState, useEffect, useCallback } from 'react';
import { Clock, Bell, Radio } from 'lucide-react';
import type { UserSession } from '../../types/section';
import type { NavItemKey } from './Sidebar';
import { ProfileDropdown } from './ProfileDropdown';

export interface HeaderProps {
  title: string;
  isGateNodeOnline?: boolean;
  session: UserSession | null;
  userPhoto?: string | null;
  schoolName?: string | null;
  schoolId?: string | null;
  schoolLogo?: string | null;
  onLogout: () => void;
  onNavigateTab?: (tab: NavItemKey) => void;
  onOpenProfile?: () => void;
}

export const Header: React.FC<HeaderProps> = (props) => {
  const {
    title,
    isGateNodeOnline = true,
    session,
    userPhoto,
    onLogout,
    onNavigateTab,
    onOpenProfile,
  } = props;

  const [currentTime, setCurrentTime] = useState<string>('');
  const [isProfileOpen, setIsProfileOpen] = useState(false);
  const [imgError, setImgError] = useState(false);

  // Synchronized Philippine Standard Time (PST) live ticker
  const updatePSTClock = useCallback(() => {
    const now = new Date();
    const options: Intl.DateTimeFormatOptions = {
      timeZone: 'Asia/Manila',
      month: 'short',
      day: 'numeric',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hour12: true,
    };

    try {
      const parts = new Intl.DateTimeFormat('en-US', options).formatToParts(now);
      const month = parts.find((p) => p.type === 'month')?.value || '';
      const day = parts.find((p) => p.type === 'day')?.value || '';
      const year = parts.find((p) => p.type === 'year')?.value || '';
      const hour = parts.find((p) => p.type === 'hour')?.value || '';
      const min = parts.find((p) => p.type === 'minute')?.value || '';
      const sec = parts.find((p) => p.type === 'second')?.value || '';
      const period = parts.find((p) => p.type === 'dayPeriod')?.value?.toUpperCase() || 'AM';

      setCurrentTime(`${month} ${day}, ${year} • ${hour}:${min}:${sec} ${period} PST`);
    } catch {
      setCurrentTime(now.toLocaleTimeString('en-US') + ' PST');
    }
  }, []);

  useEffect(() => {
    updatePSTClock();
    const interval = setInterval(updatePSTClock, 1000);
    return () => clearInterval(interval);
  }, [updatePSTClock]);

  const handleNotificationClick = () => {
    if (onNavigateTab) {
      onNavigateTab('sms');
    } else {
      window.dispatchEvent(new CustomEvent('attendsure:navigate', { detail: 'sms' }));
    }
  };

  const userName = session?.faculty_name || session?.username || '';
  const userInitial = userName ? userName.charAt(0).toUpperCase() : '?';

  return (
    <header
      style={{
        height: 56,
        backgroundColor: '#ffffff',
        borderBottom: '1px solid #e2e8f0',
        padding: '0 24px',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        position: 'sticky',
        top: 0,
        zIndex: 40,
        boxSizing: 'border-box',
      }}
    >
      {/* Streamlined Single Title */}
      <div>
        <h1 style={{ fontSize: '1.15rem', fontWeight: 800, color: '#0f172a', margin: 0 }}>
          {title}
        </h1>
      </div>

      {/* Right Toolbar: PST Clock, Gate Scanner Telemetry, Notifications & User Session */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, position: 'relative' }}>
        {/* Live Philippine Standard Time */}
        <div
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: 6,
            padding: '5px 10px',
            backgroundColor: '#f8fafc',
            borderRadius: 6,
            border: '1px solid #e2e8f0',
            fontSize: '0.72rem',
            fontWeight: 700,
            color: '#334155',
            fontFamily: 'monospace',
          }}
          title="Synchronized Philippine Standard Time (PST)"
        >
          <Clock size={13} color="#0284c7" />
          <span>{currentTime || 'Clock syncing...'}</span>
        </div>

        {/* Gate Scanner Telemetry Pill */}
        <div
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: 6,
            padding: '4px 10px',
            borderRadius: 20,
            backgroundColor: isGateNodeOnline ? '#ecfdf5' : '#fef2f2',
            border: `1px solid ${isGateNodeOnline ? '#a7f3d0' : '#fecaca'}`,
            fontSize: '0.72rem',
            fontWeight: 700,
            color: isGateNodeOnline ? '#059669' : '#dc2626',
          }}
          title={isGateNodeOnline ? 'Gate kiosks connected' : 'Gate kiosks offline'}
        >
          <span
            style={{
              width: 7,
              height: 7,
              borderRadius: '50%',
              backgroundColor: isGateNodeOnline ? '#10b981' : '#ef4444',
            }}
          />
          <Radio size={12} color={isGateNodeOnline ? '#059669' : '#dc2626'} />
          <span>{isGateNodeOnline ? 'Gate Scanner: Online' : 'Gate Scanner: Offline'}</span>
        </div>

        {/* SMS / Notifications Trigger */}
        <button
          type="button"
          title="Open SMS Outbox & Alerts"
          style={iconBtnStyle}
          onClick={handleNotificationClick}
        >
          <Bell size={14} color="#475569" />
        </button>

        {/* Account Profile Avatar */}
        <button
          type="button"
          onClick={() => setIsProfileOpen((prev) => !prev)}
          title="Account Profile"
          aria-expanded={isProfileOpen}
          aria-haspopup="true"
          style={{
            width: 36,
            height: 36,
            borderRadius: '50%',
            backgroundColor: isProfileOpen ? '#0369a1' : '#0284c7',
            color: '#ffffff',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontWeight: 800,
            fontSize: '0.86rem',
            border: isProfileOpen ? '2px solid #38bdf8' : '2px solid #e0f2fe',
            cursor: 'pointer',
            transition: 'all 0.15s ease',
            outline: 'none',
            overflow: 'hidden',
            padding: 0,
          }}
        >
          {userPhoto && !imgError ? (
            <img
              src={userPhoto}
              alt={userName}
              onError={() => setImgError(true)}
              style={{ width: '100%', height: '100%', objectFit: 'cover' }}
            />
          ) : (
            userInitial
          )}
        </button>

        {/* Profile Dropdown Popover */}
        <ProfileDropdown
          isOpen={isProfileOpen}
          onClose={() => setIsProfileOpen(false)}
          session={session}
          userPhoto={userPhoto}
          onLogout={onLogout}
          onNavigateTab={onNavigateTab}
          onOpenProfile={onOpenProfile}
        />
      </div>
    </header>
  );
};

const iconBtnStyle: React.CSSProperties = {
  width: 34,
  height: 34,
  borderRadius: 8,
  border: '1px solid #e2e8f0',
  backgroundColor: '#ffffff',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  cursor: 'pointer',
};

export default Header;