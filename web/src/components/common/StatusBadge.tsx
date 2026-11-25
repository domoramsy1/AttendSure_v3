// AttendSure Web - Status Badge Component
// File: D:\AttendSure_V3\web\src\components\common\StatusBadge.tsx

/**
 * AttendSure - Unified Semantic Status Badge
 * File: web/src/components/common/StatusBadge.tsx
 *
 * Uses centralized ThemeContext tokens for consistent Light, Dark, and High-Contrast rendering:
 *  - Green (Success): PRESENT, ON TIME, INSIDE, ACTIVE, ENROLLED, RETURNED, EXCUSED, IN
 *  - Amber (Warning): LATE, TARDY, AUTHORIZED OUTSIDE, ACTIVE PASS, TRANSFERRED OUT
 *  - Red   (Danger):  ABSENT, LOAFING ALERT, CONFIRMED LOAFING, OPEN, OVERDUE, CUTTING CLASS, DROPPED, LOCKED, OUT
 *  - Neutral:         OFF DUTY, OFFLINE, CANCELLED, INACTIVE, UNASSIGNED
 */

import React from 'react';
import { LogIn, LogOut, CheckCircle2, AlertTriangle, XCircle, Clock, ShieldCheck } from 'lucide-react';
import { useTheme } from '../../context/ThemeContext';

interface StatusBadgeProps {
  status: string;
  type?: 'DIRECTION' | 'ATTENDANCE' | 'ACTIVE' | 'GENERIC';
  label?: string;
}

const GREEN_STATUSES = new Set([
  'IN',
  'PRESENT',
  'ON_TIME',
  'ON TIME',
  'INSIDE',
  'INSIDE_CAMPUS',
  'ACTIVE',
  'ENROLLED',
  'TRANSFERRED_IN',
  'RETURNED',
  'EXCUSED',
  'APPROVED',
  'BOUND',
]);

const AMBER_STATUSES = new Set([
  'LATE',
  'TARDY',
  'AUTHORIZED_OUTSIDE',
  'AUTHORIZED OUTSIDE',
  'ON_OFFICIAL_PASS',
  'ACTIVE_PASS',
  'ACTIVE PASS',
  'TRANSFERRED_OUT',
  'TRANSFERRED OUT',
  'PENDING',
  'PENDING_APPROVAL',
  'PENDING APPROVAL',
  'SIGNAL_LOST',
  'SIGNAL LOST',
  'WARNING',
]);

const RED_STATUSES = new Set([
  'OUT',
  'ABSENT',
  'LOAFING_ALERT',
  'LOAFING ALERT',
  'CONFIRMED_LOAFING',
  'CONFIRMED LOAFING',
  'OPEN',
  'OVERDUE',
  'CUTTING',
  'CUTTING_CLASS',
  'CUTTING CLASS',
  'DROPPED',
  'LOCKED',
  'OUTSIDE',
]);

const NEUTRAL_STATUSES = new Set([
  'OFF_DUTY',
  'OFF DUTY',
  'OFFLINE',
  'CANCELLED',
  'INACTIVE',
  'UNASSIGNED',
  'UNBOUND',
]);

export const StatusBadge: React.FC<StatusBadgeProps> = ({ status, type = 'GENERIC', label }) => {
  const { tokens, brand } = useTheme();
  const normalized = String(status || '').trim().toUpperCase();
  const display = label || normalized.replace(/_/g, ' ');

  let bg = tokens.neutralBg;
  let text = tokens.textSecondary;
  let border = tokens.neutralBorder;
  let icon: React.ReactNode = null;

  if (type === 'DIRECTION' && (normalized === 'IN' || normalized === 'OUT')) {
    if (normalized === 'IN') {
      bg = tokens.successLight;
      text = brand.success;
      border = brand.success;
      icon = <LogIn size={11} />;
    } else {
      bg = tokens.dangerLight;
      text = brand.danger;
      border = brand.danger;
      icon = <LogOut size={11} />;
    }
  } else if (GREEN_STATUSES.has(normalized)) {
    bg = tokens.successLight;
    text = brand.success;
    border = brand.success;
    icon = normalized === 'IN' ? <LogIn size={11} /> : normalized === 'EXCUSED' ? <ShieldCheck size={11} /> : <CheckCircle2 size={11} />;
  } else if (AMBER_STATUSES.has(normalized)) {
    bg = tokens.warningLight;
    text = brand.warning;
    border = brand.warning;
    icon = <Clock size={11} />;
  } else if (RED_STATUSES.has(normalized)) {
    bg = tokens.dangerLight;
    text = brand.danger;
    border = brand.danger;
    icon = normalized === 'OUT' ? <LogOut size={11} /> : <AlertTriangle size={11} />;
  } else if (NEUTRAL_STATUSES.has(normalized) || (type === 'ACTIVE' && normalized !== 'ACTIVE')) {
    bg = tokens.neutralBg;
    text = tokens.textSecondary;
    border = tokens.neutralBorder;
    icon = normalized === 'INACTIVE' || normalized === 'CANCELLED' ? <XCircle size={11} /> : null;
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
        borderWidth: 1,
        borderStyle: 'solid',
        borderColor: border,
        letterSpacing: '0.2px',
        whiteSpace: 'nowrap',
      }}
    >
      {icon}
      <span>{display}</span>
    </span>
  );
};

export default StatusBadge;
