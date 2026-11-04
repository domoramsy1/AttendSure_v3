/**
 * AttendSure - Reusable Status Badge
 * Replaces hardcoded status pills for Attendance, Direction, and Account states.
 * File: web/src/components/common/StatusBadge.tsx
 */

import React from 'react';
import { LogIn, LogOut, CheckCircle2, AlertTriangle, XCircle, Clock } from 'lucide-react';

interface StatusBadgeProps {
  status: string;
  type?: 'DIRECTION' | 'ATTENDANCE' | 'ACTIVE' | 'GENERIC';
}

export const StatusBadge: React.FC<StatusBadgeProps> = ({ status, type = 'GENERIC' }) => {
  const s = String(status || '').toUpperCase();

  let bg = 'rgba(100, 116, 139, 0.12)';
  let text = 'var(--text-secondary, #64748b)';
  let border = 'rgba(100, 116, 139, 0.25)';
  let icon: React.ReactNode = null;

  if (type === 'DIRECTION' || s === 'IN' || s === 'OUT') {
    if (s === 'IN') {
      bg = 'rgba(16, 185, 129, 0.12)';
      text = 'var(--brand-success, #10B981)';
      border = 'rgba(16, 185, 129, 0.28)';
      icon = <LogIn size={11} />;
    } else {
      bg = 'rgba(239, 68, 68, 0.12)';
      text = 'var(--brand-danger, #EF4444)';
      border = 'rgba(239, 68, 68, 0.28)';
      icon = <LogOut size={11} />;
    }
  } else if (type === 'ACTIVE' || s === 'ACTIVE' || s === 'INACTIVE') {
    if (s === 'ACTIVE') {
      bg = 'rgba(16, 185, 129, 0.12)';
      text = 'var(--brand-success, #10B981)';
      border = 'rgba(16, 185, 129, 0.28)';
      icon = <CheckCircle2 size={11} />;
    } else {
      bg = 'rgba(239, 68, 68, 0.12)';
      text = 'var(--brand-danger, #EF4444)';
      border = 'rgba(239, 68, 68, 0.28)';
      icon = <XCircle size={11} />;
    }
  } else if (type === 'ATTENDANCE' || ['PRESENT', 'LATE', 'ABSENT', 'CUTTING'].includes(s)) {
    if (s === 'PRESENT') {
      bg = 'rgba(16, 185, 129, 0.12)';
      text = 'var(--brand-success, #10B981)';
      border = 'rgba(16, 185, 129, 0.28)';
    } else if (s === 'LATE' || s === 'TARDY') {
      bg = 'rgba(245, 158, 11, 0.12)';
      text = 'var(--brand-warning, #F59E0B)';
      border = 'rgba(245, 158, 11, 0.28)';
      icon = <Clock size={11} />;
    } else {
      bg = 'rgba(239, 68, 68, 0.12)';
      text = 'var(--brand-danger, #EF4444)';
      border = 'rgba(239, 68, 68, 0.28)';
      icon = <AlertTriangle size={11} />;
    }
  }

  return (
    <span
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 4,
        padding: '3px 8px',
        borderRadius: 6,
        fontSize: '0.68rem',
        fontWeight: 800,
        backgroundColor: bg,
        color: text,
        border: `1px solid ${border}`,
        letterSpacing: '0.2px',
      }}
    >
      {icon}
      <span>{s}</span>
    </span>
  );
};

export default StatusBadge;