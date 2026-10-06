import React, { useEffect, useRef } from 'react';
import {
  Clock,
  KeyRound,
  LogOut,
  CheckCircle2,
  UserCog,
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

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        onClose();
      }
    };

    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside);
    }
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  const userName = session?.faculty_name || session?.username || 'User';
  const userRole = (session?.role || '').toUpperCase();
  const userInitial = userName ? userName.charAt(0).toUpperCase() : '?';

  const handleAction = (tab?: NavItemKey) => {
    if (tab && onNavigateTab) {
      onNavigateTab(tab);
    }
    onClose();
  };

  return (
    <div
      ref={dropdownRef}
      style={{
        position: 'absolute',
        top: 52,
        right: 0,
        width: 290,
        backgroundColor: '#ffffff',
        borderRadius: 12,
        boxShadow: '0 10px 25px -5px rgba(0, 0, 0, 0.1), 0 8px 10px -6px rgba(0, 0, 0, 0.1)',
        border: '1px solid #e2e8f0',
        zIndex: 100,
        overflow: 'hidden',
        animation: 'fadeInSlide 0.15s ease-out',
        color: '#0f172a',
        userSelect: 'none',
      }}
    >
      {/* 1. Identity Header */}
      <div style={{ padding: '16px 16px 12px 16px', borderBottom: '1px solid #f1f5f9' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          {/* User Avatar Circle */}
          <div
            style={{
              width: 46,
              height: 46,
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
          </div>

          <div style={{ minWidth: 0, flex: 1 }}>
            <div
              style={{
                fontSize: '0.90rem',
                fontWeight: 700,
                color: '#0f172a',
                whiteSpace: 'nowrap',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
              }}
            >
              {userName}
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 3 }}>
              <span
                style={{
                  fontSize: '0.62rem',
                  fontWeight: 800,
                  color: '#0284c7',
                  backgroundColor: '#e0f2fe',
                  padding: '1px 6px',
                  borderRadius: 4,
                  letterSpacing: '0.3px',
                }}
              >
                {userRole}
              </span>
              <span style={{ fontSize: '0.68rem', color: '#10b981', display: 'flex', alignItems: 'center', gap: 3 }}>
                <CheckCircle2 size={11} /> Active
              </span>
            </div>
          </div>
        </div>

        {onOpenProfile && (
          <button
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
              backgroundColor: '#f1f5f9',
              border: '1px solid #e2e8f0',
              borderRadius: 6,
              color: '#0f172a',
              fontSize: '0.78rem',
              fontWeight: 700,
              cursor: 'pointer',
            }}
          >
            <UserCog size={14} color="#0284c7" />
            <span>Manage Profile & Details</span>
          </button>
        )}
      </div>

      {/* 2. Quick Actions */}
      <div style={{ padding: '6px' }}>
        <button
          onClick={() => handleAction('dtr')}
          style={actionItemStyle}
          onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = '#f8fafc')}
          onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = 'transparent')}
        >
          <div style={iconBoxStyle}>
            <Clock size={16} color="#0284c7" />
          </div>
          <div style={{ flex: 1, textAlign: 'left' }}>
            <div style={{ fontSize: '0.80rem', fontWeight: 600, color: '#1e293b' }}>
              My Daily Time Record
            </div>
            <div style={{ fontSize: '0.68rem', color: '#64748b' }}>
              CSC Form 48 logs & hours
            </div>
          </div>
        </button>

{/* Account Security Button */}
<button
  type="button"
  onClick={() => {
    const role = (localStorage.getItem('attendsure_role') || '').toUpperCase();
    if (role === 'ADMIN') {
      // Redirect school admin to Django user administration
      window.open('http://127.0.0.1:8000/admin/auth/user/', '_blank');
    } else {
      alert('Password and security policies are managed by the school administrator.');
    }
  }}
  style={{
    display: 'flex',
    alignItems: 'center',
    gap: 10,
    width: '100%',
    padding: '10px 14px',
    border: 'none',
    background: 'none',
    cursor: 'pointer',
    textAlign: 'left',
  }}
>
  <KeyRound size={16} color="#64748b" />
  <div>
    <div style={{ fontSize: '0.80rem', fontWeight: 700, color: '#0f172a' }}>
      Account Security
    </div>
    <div style={{ fontSize: '0.68rem', color: '#64748b' }}>
      Credentials & access session
    </div>
  </div>
</button>
      </div>

      <div style={{ height: 1, backgroundColor: '#f1f5f9', margin: '0 8px' }} />

      {/* 3. Sign Out */}
      <div style={{ padding: '6px' }}>
        <button
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
  transition: 'background 0.12s ease',
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

export default ProfileDropdown;