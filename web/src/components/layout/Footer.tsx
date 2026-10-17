/**
 * AttendSure - Institutional Status & Telemetry Footer
 * File: web/src/components/layout/Footer.tsx
 *
 * Clean, dynamic footer displaying school identity, database connection status, and developer branding.
 */

import React from 'react';
import { useSchool } from '../../context/SchoolContext';
import { Building2, Database, Radio } from 'lucide-react';

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

  const activeSchoolName = schoolName || school.school_name || 'Lapasan National High School';
  const activeSchoolId = schoolId || school.school_id || '340964';
  const activeDivision = divisionOrCity || school.division || '';

  return (
    <footer
      style={{
        height: 38,
        minHeight: 38,
        backgroundColor: '#ffffff',
        borderTop: '1px solid #e2e8f0',
        padding: '0 24px',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        fontSize: '0.73rem',
        color: '#64748b',
        boxSizing: 'border-box',
        userSelect: 'none',
        zIndex: 30,
      }}
    >
      {/* Left: Dynamic School Identity */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
          <Building2 size={13} color="#0284c7" />
          <span style={{ fontWeight: 700, color: '#1e293b' }}>{activeSchoolName}</span>
        </div>

        <span style={{ color: '#cbd5e1' }}>&bull;</span>
        <span>
          School ID:{' '}
          <strong style={{ color: '#334155', fontFamily: 'monospace' }}>
            {activeSchoolId}
          </strong>
        </span>

        {activeDivision && (
          <>
            <span style={{ color: '#cbd5e1' }}>&bull;</span>
            <span>{activeDivision}</span>
          </>
        )}
      </div>

      {/* Center: Live System Health */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 5,
            color: isDatabaseConnected ? '#059669' : '#dc2626',
            fontWeight: 600,
          }}
        >
          <Database size={12} />
          <span>{isDatabaseConnected ? 'Database Live' : 'Database Offline'}</span>
        </div>

        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 5,
            color: isGateSystemOnline ? '#0284c7' : '#dc2626',
            fontWeight: 600,
          }}
        >
          <Radio size={12} />
          <span>{isGateSystemOnline ? 'Turnstile Active' : 'Turnstile Standby'}</span>
        </div>
      </div>

      {/* Right: Copyright */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
        <span>&copy; 2026 AttendSure &bull; Developed by</span>
        <strong style={{ color: '#0A1F3D', letterSpacing: '0.05em', fontWeight: 800 }}>
          TECHBLAZER
        </strong>
      </div>
    </footer>
  );
};

export default Footer;