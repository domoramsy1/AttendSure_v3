/**
 * AttendSure - User Account & Profile Popover Menu (Theme Adaptive)
 * File: web/src/components/layout/ProfileDropdown.tsx
 */

import React, { useEffect, useRef, useState, useCallback } from 'react';
import { useTheme } from '../../context/ThemeContext';
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
  const { tokens, brand } = useTheme();

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
  const userRole = (session?.role || localStorage.getItem('attendsure_role') || 'FACULTY').toUpperCase();
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
      style={{
        position: 'absolute',
        top: 52,
        right: 0,
        width: 'min(300px, 90vw)',
        backgroundColor: tokens.bgSurface,
        borderRadius: 14,
        boxShadow: tokens.cardShadow,
        border: `1px solid ${tokens.borderSubtle}`,
        zIndex: 100,
        overflow: 'hidden',
        color: tokens.textPrimary,
        userSelect: 'none',
        transition: 'background-color 0.2s ease, border-color 0.2s ease',
      }}
    >
      <div style={{ padding: '16px 16px 12px 16px', borderBottom: `1px solid ${tokens.borderSubtle}` }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <div
            style={{
              width: 44,
              height: 44,
              borderRadius: '50%',
              backgroundColor: brand.primary,
              color: '#ffffff',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontWeight: 800,
              fontSize: '1.05rem',
              flexShrink: 0,
              overflow: 'hidden',
              border: `2px solid ${tokens.primaryLight}`,
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
          </div>

          <div style={{ minWidth: 0, flex: 1 }}>
            <div style={{ fontSize: '0.90rem', fontWeight: 700, color: tokens.textPrimary, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }} title={userName}>
              {userName}
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 3 }}>
              <span style={{ fontSize: '0.62rem', fontWeight: 800, color: brand.primary, backgroundColor: tokens.primaryLight, padding: '1px 6px', borderRadius: 4 }}>
                {userRole}
              </span>
              <span style={{ fontSize: '0.68rem', color: brand.success, display: 'flex', alignItems: 'center', gap: 3, fontWeight: 600 }}>
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
            style={{
              marginTop: 12,
              width: '100%',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 6,
              padding: '7px 10px',
              backgroundColor: tokens.bgSurfaceSubtle,
              border: `1px solid ${tokens.borderSubtle}`,
              borderRadius: 8,
              color: tokens.textPrimary,
              fontSize: '0.78rem',
              fontWeight: 700,
              cursor: 'pointer',
              transition: 'background-color 0.15s ease',
            }}
          >
            <UserCog size={14} color={brand.primary} />
            <span>Manage Profile &amp; Details</span>
          </button>
        )}
      </div>

      <div style={{ padding: '6px' }}>
        <button
          type="button"
          onClick={() => handleAction('dtr')}
          style={{
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
          }}
          onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = tokens.bgSurfaceHover)}
          onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = 'transparent')}
        >
          <div style={{ width: 32, height: 32, borderRadius: 8, backgroundColor: tokens.bgSurfaceSubtle, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
            <Clock size={16} color={brand.primary} />
          </div>
          <div style={{ flex: 1, textAlign: 'left' }}>
            <div style={{ fontSize: '0.80rem', fontWeight: 600, color: tokens.textPrimary }}>My Daily Time Record</div>
            <div style={{ fontSize: '0.68rem', color: tokens.textMuted }}>CSC DTR logs &amp; hours</div>
          </div>
        </button>

        <button
          type="button"
          onClick={handleSecurityAction}
          style={{
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
          }}
          onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = tokens.bgSurfaceHover)}
          onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = 'transparent')}
        >
          <div style={{ width: 32, height: 32, borderRadius: 8, backgroundColor: tokens.bgSurfaceSubtle, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
            {userRole === 'ADMIN' ? <Shield size={16} color={brand.primary} /> : <KeyRound size={16} color={tokens.textMuted} />}
          </div>
          <div style={{ flex: 1, textAlign: 'left' }}>
            <div style={{ fontSize: '0.80rem', fontWeight: 600, color: tokens.textPrimary }}>
              {userRole === 'ADMIN' ? 'User & Role Security' : 'Account Security'}
            </div>
            <div style={{ fontSize: '0.68rem', color: tokens.textMuted }}>
              {userRole === 'ADMIN' ? 'Manage faculty roles & credentials' : 'Credentials & session policies'}
            </div>
          </div>
        </button>

        <button
          type="button"
          onClick={() => handleAction('settings')}
          style={{
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
          }}
          onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = tokens.bgSurfaceHover)}
          onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = 'transparent')}
        >
          <div style={{ width: 32, height: 32, borderRadius: 8, backgroundColor: tokens.bgSurfaceSubtle, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
            <Settings size={16} color={brand.primary} />
          </div>
          <div style={{ flex: 1, textAlign: 'left' }}>
            <div style={{ fontSize: '0.80rem', fontWeight: 600, color: tokens.textPrimary }}>School Settings</div>
            <div style={{ fontSize: '0.68rem', color: tokens.textMuted }}>Emblem, seals &amp; geofence</div>
          </div>
        </button>
      </div>

      <div style={{ height: 1, backgroundColor: tokens.borderSubtle, margin: '0 8px' }} />

      <div style={{ padding: '6px' }}>
        <button
          type="button"
          onClick={() => {
            onClose();
            onLogout();
          }}
          style={{
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
          }}
          onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = 'rgba(239, 68, 68, 0.12)')}
          onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = 'transparent')}
        >
          <div style={{ width: 32, height: 32, borderRadius: 8, backgroundColor: 'rgba(239, 68, 68, 0.12)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
            <LogOut size={16} color={brand.danger} />
          </div>
          <div style={{ flex: 1, textAlign: 'left' }}>
            <div style={{ fontSize: '0.80rem', fontWeight: 700, color: brand.danger }}>Log Out</div>
            <div style={{ fontSize: '0.68rem', color: tokens.textMuted }}>End current session safely</div>
          </div>
        </button>
      </div>
    </div>
  );
};

export default ProfileDropdown;