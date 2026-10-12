/**
 * AttendSure V3 - User Account & Profile Popover Menu
 * File: frontend/src/components/layout/ProfileDropdown.tsx
 *
 * Capabilities:
 * - Dynamic session identity, role badges, and initial avatar fallback.
 * - Dynamic backend admin routing (avoids hardcoded 127.0.0.1 loops).
 * - Keyboard accessibility (Escape key dismissal & outside click detection).
 * - Quick shortcuts to DTR (CSC Form 48), User Management, and Settings.
 */

import React, { useEffect, useRef, useState, useCallback } from 'react';
import {
  Clock,
  KeyRound,
  LogOut,
  CheckCircle2,
  UserCog,
  Shield,
  Settings,
} from 'lucide-react';
import type { UserSession } from '../../types/section';
import type { NavItemKey } from './Sidebar';

interface ProfileDropdownProps {
  isOpen: boolean;
  onClose: () => void;
  session: UserSession | null;
  userPhoto?: string | null;
  onLogout: () => void;
  onNavigateTab?: (tab: NavItemKey) => void;
  onOpenProfile?: () => void;
}

export const ProfileDropdown: React.FC<ProfileDropdownProps> = ({
  isOpen,
  onClose,
  session,
  userPhoto,
  onLogout,
  onNavigateTab,
  onOpenProfile,
}) => {
  const dropdownRef = useRef<HTMLDivElement>(null);
  const [imgError, setImgError] = useState(false);

  // Close popover on outside click or Escape key press
  const handleKeyDown = useCallback(
    (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        onClose();
      }
    },
    [onClose]
  );

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        onClose();
      }
    };

    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside);
      window.addEventListener('keydown', handleKeyDown);
    }
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [isOpen, onClose, handleKeyDown]);

  if (!isOpen) return null;

  const userName = session?.faculty_name || session?.username || 'User';
  const userRole = (session?.role || localStorage.getItem('attendsure_role') || 'TEACHER').toUpperCase();
  const userInitial = userName ? userName.charAt(0).toUpperCase() : '?';

  const handleAction = (tab?: NavItemKey) => {
    if (tab && onNavigateTab) {
      onNavigateTab(tab);
    }
    onClose();
  };

  const handleSecurityAction = () => {
    if (userRole === 'ADMIN') {
      if (onNavigateTab) {
        onNavigateTab('users');
      } else {
        const host = window.location.hostname || 'localhost';
        const protocol = window.location.protocol || 'http:';
        window.open(`${protocol}//${host}:8000/admin/auth/user/`, '_blank');
      }
    } else {
      if (onNavigateTab) {
        onNavigateTab('settings');
      }
    }
    onClose();
  };

  return (
    <div
      ref={dropdownRef}
      role="menu"
      aria-label="User Account Menu"
      style={popoverContainerStyle}
    >
      {/* 1. Identity Header */}
      <div style={headerStyle}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          {/* User Avatar Circle */}
          <div style={avatarCircleStyle}>
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
          </div>

          <div style={{ minWidth: 0, flex: 1 }}>
            <div style={userNameStyle} title={userName}>
              {userName}
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 3 }}>
              <span style={roleBadgeStyle}>
                {userRole}
              </span>
              <span style={activeStatusStyle}>
                <CheckCircle2 size={11} /> Active
              </span>
            </div>
          </div>
        </div>

        {onOpenProfile && (
          <button
            type="button"
            onClick={() => {
              onClose();
              onOpenProfile();
            }}
            style={manageProfileBtnStyle}
          >
            <UserCog size={14} color="#0284c7" />
            <span>Manage Profile &amp; Details</span>
          </button>
        )}
      </div>

      {/* 2. Quick Actions */}
      <div style={{ padding: '6px' }}>
        {/* CSC Form 48 DTR Link */}
        <button
          type="button"
          onClick={() => handleAction('dtr')}
          style={actionItemStyle}
          onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = '#f8fafc')}
          onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = 'transparent')}
        >
          <div style={iconBoxStyle}>
            <Clock size={16} color="#0284c7" />
          </div>
          <div style={{ flex: 1, textAlign: 'left' }}>
            <div style={actionTitleStyle}>
              My Daily Time Record
            </div>
            <div style={actionSubtextStyle}>
              CSC Form 48 logs &amp; hours
            </div>
          </div>
        </button>

        {/* Account Security & User Administration */}
        <button
          type="button"
          onClick={handleSecurityAction}
          style={actionItemStyle}
          onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = '#f8fafc')}
          onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = 'transparent')}
        >
          <div style={iconBoxStyle}>
            {userRole === 'ADMIN' ? <Shield size={16} color="#0284c7" /> : <KeyRound size={16} color="#64748b" />}
          </div>
          <div style={{ flex: 1, textAlign: 'left' }}>
            <div style={actionTitleStyle}>
              {userRole === 'ADMIN' ? 'User & Role Security' : 'Account Security'}
            </div>
            <div style={actionSubtextStyle}>
              {userRole === 'ADMIN' ? 'Manage faculty roles & credentials' : 'Credentials & session policies'}
            </div>
          </div>
        </button>

        {/* Institutional Settings Link */}
        <button
          type="button"
          onClick={() => handleAction('settings')}
          style={actionItemStyle}
          onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = '#f8fafc')}
          onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = 'transparent')}
        >
          <div style={iconBoxStyle}>
            <Settings size={16} color="#0284c7" />
          </div>
          <div style={{ flex: 1, textAlign: 'left' }}>
            <div style={actionTitleStyle}>
              School Settings
            </div>
            <div style={actionSubtextStyle}>
              Emblem, seals &amp; geofence
            </div>
          </div>
        </button>
      </div>

      <div style={{ height: 1, backgroundColor: '#f1f5f9', margin: '0 8px' }} />

      {/* 3. Sign Out */}
      <div style={{ padding: '6px' }}>
        <button
          type="button"
          onClick={() => {
            onClose();
            onLogout();
          }}
          style={actionItemStyle}
          onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = '#fef2f2')}
          onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = 'transparent')}
        >
          <div style={{ ...iconBoxStyle, backgroundColor: '#fee2e2' }}>
            <LogOut size={16} color="#dc2626" />
          </div>
          <div style={{ flex: 1, textAlign: 'left' }}>
            <div style={{ fontSize: '0.80rem', fontWeight: 700, color: '#dc2626' }}>
              Sign Out
            </div>
            <div style={{ fontSize: '0.68rem', color: '#b91c1c' }}>
              End current session safely
            </div>
          </div>
        </button>
      </div>
    </div>
  );
};

// ============================================================================
// STYLES
// ============================================================================

const popoverContainerStyle: React.CSSProperties = {
  position: 'absolute',
  top: 52,
  right: 0,
  width: 300,
  backgroundColor: '#ffffff',
  borderRadius: 12,
  boxShadow: '0 10px 25px -5px rgba(0, 0, 0, 0.1), 0 8px 10px -6px rgba(0, 0, 0, 0.05)',
  border: '1px solid #e2e8f0',
  zIndex: 100,
  overflow: 'hidden',
  color: '#0f172a',
  userSelect: 'none',
};

const headerStyle: React.CSSProperties = {
  padding: '16px 16px 12px 16px',
  borderBottom: '1px solid #f1f5f9',
};

const avatarCircleStyle: React.CSSProperties = {
  width: 44,
  height: 44,
  borderRadius: '50%',
  backgroundColor: '#0284c7',
  color: '#ffffff',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  fontWeight: 800,
  fontSize: '1.05rem',
  flexShrink: 0,
  overflow: 'hidden',
  border: '2px solid #e0f2fe',
};

const userNameStyle: React.CSSProperties = {
  fontSize: '0.90rem',
  fontWeight: 700,
  color: '#0f172a',
  whiteSpace: 'nowrap',
  overflow: 'hidden',
  textOverflow: 'ellipsis',
};

const roleBadgeStyle: React.CSSProperties = {
  fontSize: '0.62rem',
  fontWeight: 800,
  color: '#0284c7',
  backgroundColor: '#e0f2fe',
  padding: '1px 6px',
  borderRadius: 4,
  letterSpacing: '0.3px',
};

const activeStatusStyle: React.CSSProperties = {
  fontSize: '0.68rem',
  color: '#10b981',
  display: 'flex',
  alignItems: 'center',
  gap: 3,
  fontWeight: 600,
};

const manageProfileBtnStyle: React.CSSProperties = {
  marginTop: 12,
  width: '100%',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  gap: 6,
  padding: '7px 10px',
  backgroundColor: '#f8fafc',
  border: '1px solid #e2e8f0',
  borderRadius: 6,
  color: '#0f172a',
  fontSize: '0.78rem',
  fontWeight: 700,
  cursor: 'pointer',
  transition: 'background-color 0.15s ease',
};

const actionItemStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: 10,
  padding: '8px 10px',
  borderRadius: 8,
  border: 'none',
  backgroundColor: 'transparent',
  width: '100%',
  cursor: 'pointer',
  transition: 'background-color 0.12s ease',
};

const iconBoxStyle: React.CSSProperties = {
  width: 32,
  height: 32,
  borderRadius: 8,
  backgroundColor: '#f1f5f9',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  flexShrink: 0,
};

const actionTitleStyle: React.CSSProperties = {
  fontSize: '0.80rem',
  fontWeight: 600,
  color: '#1e293b',
};

const actionSubtextStyle: React.CSSProperties = {
  fontSize: '0.68rem',
  color: '#64748b',
};

export default ProfileDropdown;