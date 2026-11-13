/**
 * AttendSure V3 - School Footer
 * File: web/src/components/layout/Footer.tsx
 */

import React from 'react';
import { useSchool } from '../../context/SchoolContext';
import { useTheme } from '../../context/ThemeContext';
import { Building2, CheckCircle2, AlertCircle, ShieldCheck } from 'lucide-react';

export interface FooterProps {
  schoolName?: string;
  schoolId?: string;
  divisionOrCity?: string;
  isDatabaseConnected?: boolean;
  isGateSystemOnline?: boolean;
}

export const Footer: React.FC<FooterProps> = ({
  schoolName,
  schoolId,
  divisionOrCity,
  isDatabaseConnected = true,
  isGateSystemOnline = true,
}) => {
  const { school } = useSchool();
  const { tokens, brand } = useTheme();

  // Safe name resolution to prevent 0-width collapsing
  const activeSchoolName =
    (schoolName && schoolName.trim()) ||
    (school?.school_name && school.school_name.trim()) ||
    'Lapasan National High School';

  const activeSchoolId =
    (schoolId && schoolId.trim()) ||
    (school?.school_id && school.school_id.trim()) ||
    '55555';

  const activeDivision =
    (divisionOrCity && divisionOrCity.trim()) ||
    (school?.division && school.division.trim()) ||
    'Cagayan de Oro City';

  return (
    <footer
      style={{
        width: '100%',
        minHeight: 44,
        height: 'auto',
        flexShrink: 0,
        marginTop: 'auto',
        backgroundColor: tokens.bgSurface || '#ffffff',
        borderTop: `1px solid ${tokens.borderSubtle || '#e2e8f0'}`,
        padding: '10px clamp(12px, 2.5vw, 24px)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        flexWrap: 'wrap',
        gap: '8px 20px',
        fontSize: '0.74rem',
        lineHeight: 1.4,
        color: tokens.textSecondary || '#64748b',
        boxSizing: 'border-box',
        userSelect: 'none',
        zIndex: 10,
      }}
    >
      {/* Left: School Identification */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          flexWrap: 'wrap',
          gap: '6px 10px',
          minWidth: 0,
          flex: '1 1 auto',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexShrink: 0 }}>
          <Building2 size={14} color={brand.primary || '#004b87'} />
          <strong
            style={{
              color: tokens.textPrimary || '#0f172a',
              fontSize: '0.76rem',
            }}
          >
            {activeSchoolName}
          </strong>
        </div>

        <span style={{ color: tokens.borderStrong || '#cbd5e1' }}>|</span>

        <span style={{ color: tokens.textMuted || '#94a3b8', flexShrink: 0 }}>
          School ID: {activeSchoolId}
        </span>

        {activeDivision && (
          <>
            <span style={{ color: tokens.borderStrong || '#cbd5e1' }}>|</span>
            <span style={{ color: tokens.textMuted || '#94a3b8', flexShrink: 0 }}>
              {activeDivision}
            </span>
          </>
        )}
      </div>

      {/* Right: Simple System Status & Copyright */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          flexWrap: 'wrap',
          gap: '10px 18px',
          flexShrink: 0,
        }}
      >
        {/* Database Connection Status */}
        <div
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: 5,
            color: isDatabaseConnected ? brand.success || '#059669' : brand.danger || '#dc2626',
            fontWeight: 700,
          }}
        >
          {isDatabaseConnected ? (
            <CheckCircle2 size={13} color={brand.success || '#059669'} />
          ) : (
            <AlertCircle size={13} color={brand.danger || '#dc2626'} />
          )}
          <span>{isDatabaseConnected ? 'System Online' : 'System Offline'}</span>
        </div>

        {/* Gate Status */}
        <div
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: 5,
            color: isGateSystemOnline ? brand.primary || '#004b87' : brand.danger || '#dc2626',
            fontWeight: 700,
          }}
        >
          <ShieldCheck size={13} color={isGateSystemOnline ? brand.primary || '#004b87' : brand.danger || '#dc2626'} />
          <span>{isGateSystemOnline ? 'Gate Ready' : 'Gate Standby'}</span>
        </div>

        {/* Copyright */}
        <span
          style={{
            color: tokens.textMuted || '#94a3b8',
            fontSize: '0.70rem',
            whiteSpace: 'nowrap',
          }}
        >
          &copy; 2026 AttendSure &bull; TechBlazer
        </span>
      </div>
    </footer>
  );
};

export default Footer;