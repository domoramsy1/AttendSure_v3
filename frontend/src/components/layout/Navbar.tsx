import React from 'react';
import { theme } from '../../theme/tokens';
import { Button } from '../ui/Button';
import type { UserSession } from '../../types/section';
import { School, LogOut } from 'lucide-react';

interface NavbarProps {
  session: UserSession | null;
  onLogout: () => void;
}

export const Navbar: React.FC<NavbarProps> = ({ session, onLogout }) => (
  <header
    style={{
      display: 'flex',
      justifyContent: 'space-between',
      alignItems: 'center',
      padding: '10px 24px',
      backgroundColor: theme.colors.surface,
      borderBottom: `1px solid ${theme.colors.border}`,
      boxShadow: theme.shadows.sm,
    }}
  >
    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
      <School size={24} color={theme.colors.primary} />
      <span style={{ fontSize: '1.15rem', fontWeight: 800, color: theme.colors.textPrimary }}>
        AttendSure V3
      </span>
      <span style={{ fontSize: '0.8rem', color: theme.colors.textSecondary, borderLeft: `1px solid ${theme.colors.border}`, paddingLeft: 10 }}>
        Lapasan National High School
      </span>
    </div>

    {session ? (
      <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
        <div style={{ textAlign: 'right', fontSize: '0.85rem' }}>
          <div style={{ fontWeight: 700, color: theme.colors.textPrimary }}>{session.staff_name}</div>
          <span style={{ fontSize: '0.75rem', color: theme.colors.textSecondary }}>{session.role}</span>
        </div>
        <Button variant="danger" size="sm" onClick={onLogout} icon={<LogOut size={14} />}>
          Logout
        </Button>
      </div>
    ) : (
      <span style={{ fontSize: '0.85rem', color: theme.colors.textSecondary }}>Authentication Required</span>
    )}
  </header>
);