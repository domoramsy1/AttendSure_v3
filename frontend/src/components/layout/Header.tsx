import React, { useState, useEffect } from 'react';
import { Clock, Bell } from 'lucide-react';
import type { UserSession } from '../../types/section';
import type { NavItemKey } from './Sidebar';
import { ProfileDropdown } from './ProfileDropdown';

export interface HeaderProps {
  title: string;
  isGateNodeOnline?: boolean;
  session: UserSession | null;
  userPhoto?: string | null;
  schoolName?: string;
  schoolId?: string;
  schoolLogo?: string | null;
  onLogout: () => void;
  onNavigateTab?: (tab: NavItemKey) => void;
  onOpenProfile?: () => void;
}

export const Header: React.FC<HeaderProps> = ({
  title,
  isGateNodeOnline = true,
  session,
  userPhoto,
  onLogout,
  onNavigateTab,
  onOpenProfile,
}) => {
  const [currentTime, setCurrentTime] = useState<string>('');
  const [isProfileOpen, setIsProfileOpen] = useState(false);

  useEffect(() => {
    const updateTime = () => {
      const now = new Date();
      const datePart = now.toLocaleDateString('en-US', {
        month: 'short',
        day: 'numeric',
        year: 'numeric',
      });
      const timePart = now.toLocaleTimeString('en-US', {
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
        hour12: true,
      });
      setCurrentTime(`${datePart} • ${timePart} PST`);
    };

    updateTime();
    const interval = setInterval(updateTime, 1000);
    return () => clearInterval(interval);
  }, []);

  const userName = session?.faculty_name || session?.username || '';
  const userInitial = userName ? userName.charAt(0).toUpperCase() : '?';

  return (
    <header
      style={{
        height: 60,
        backgroundColor: '#ffffff',
        borderBottom: '1px solid #e2e8f0',
        padding: '0 24px',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        position: 'sticky',
        top: 0,
        zIndex: 40,
      }}
    >
      <div>
        <h1 style={{ fontSize: '1.15rem', fontWeight: 800, color: '#0f172a', margin: 0 }}>
          {title}
        </h1>
      </div>

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
        >
          <Clock size={13} color="#0284c7" />
          <span>{currentTime || 'Clock syncing...'}</span>
        </div>

        {/* Gate Scanner Status Pill */}
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
        >
          <span
            style={{
              width: 7,
              height: 7,
              borderRadius: '50%',
              backgroundColor: isGateNodeOnline ? '#10b981' : '#ef4444',
            }}
          />
          <span>{isGateNodeOnline ? 'Gate Scanner: Online' : 'Gate Scanner: Offline'}</span>
        </div>

        {/* Notifications Icon Button */}
        <button
          title="Notifications"
          style={iconBtnStyle}
          onClick={() => alert('All school gate alerts are active.')}
        >
          <Bell size={14} color="#475569" />
        </button>

        {/* User Profile Avatar Trigger */}
        <button
          onClick={() => setIsProfileOpen((prev) => !prev)}
          title="Account Profile"
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
          {userPhoto ? (
            <img
              src={userPhoto}
              alt={userName}
              style={{ width: '100%', height: '100%', objectFit: 'cover' }}
            />
          ) : (
            userInitial
          )}
        </button>

        {/* Profile Popover */}
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