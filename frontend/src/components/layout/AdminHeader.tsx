import React from 'react';
import type { UserSession } from '../../types/section';
import { Bell, SlidersHorizontal, LogOut } from 'lucide-react';

interface AdminHeaderProps {
  title: string;
  isGateNodeOnline: boolean;
  session: UserSession | null;
  onLogout?: () => void;
}

export const AdminHeader: React.FC<AdminHeaderProps> = ({ 
  title, 
  isGateNodeOnline, 
  session,
  onLogout,
}) => {
  const userInitial = session?.username ? session.username.charAt(0).toUpperCase() : 'R';

  return (
    <header
      style={{
        height: '48px',
        backgroundColor: '#ffffff',
        borderBottom: '1px solid #e5e7eb',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        padding: '0 20px',
        boxSizing: 'border-box',
        flexShrink: 0,
      }}
    >
      <h2 style={{ margin: 0, fontSize: '1.05rem', fontWeight: 800, color: '#0f172a' }}>
        {title}
      </h2>

      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        <div
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: 5,
            padding: '4px 10px',
            backgroundColor: isGateNodeOnline ? '#ecfdf5' : '#fef2f2',
            color: isGateNodeOnline ? '#059669' : '#dc2626',
            borderRadius: '16px',
            fontSize: '0.72rem',
            fontWeight: 600,
            border: `1px solid ${isGateNodeOnline ? '#a7f3d0' : '#fecaca'}`,
          }}
        >
          <span
            style={{
              width: 6,
              height: 6,
              borderRadius: '50%',
              backgroundColor: isGateNodeOnline ? '#10b981' : '#ef4444',
            }}
          />
          {isGateNodeOnline ? 'Gate Scanner: Online' : 'Gate Scanner: Offline'}
        </div>

        <button
          style={{
            position: 'relative',
            background: '#f8fafc',
            border: '1px solid #e2e8f0',
            borderRadius: '50%',
            width: 32,
            height: 32,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            cursor: 'pointer',
            color: '#64748b',
          }}
        >
          <Bell size={15} />
          <span
            style={{
              position: 'absolute',
              top: 6,
              right: 6,
              width: 5,
              height: 5,
              borderRadius: '50%',
              backgroundColor: '#ef4444',
            }}
          />
        </button>

        <button
          style={{
            background: '#f8fafc',
            border: '1px solid #e2e8f0',
            borderRadius: '50%',
            width: 32,
            height: 32,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            cursor: 'pointer',
            color: '#64748b',
          }}
        >
          <SlidersHorizontal size={14} />
        </button>

        {onLogout && (
          <button
            onClick={onLogout}
            title="Sign Out"
            style={{
              background: '#fef2f2',
              border: '1px solid #fee2e2',
              borderRadius: '50%',
              width: 32,
              height: 32,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              cursor: 'pointer',
              color: '#dc2626',
            }}
          >
            <LogOut size={14} />
          </button>
        )}

        <div
          style={{
            width: 32,
            height: 32,
            borderRadius: '50%',
            backgroundColor: '#0284c7',
            color: '#ffffff',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontWeight: 700,
            fontSize: '0.8rem',
            cursor: 'pointer',
          }}
        >
          {userInitial}
        </div>
      </div>
    </header>
  );
};