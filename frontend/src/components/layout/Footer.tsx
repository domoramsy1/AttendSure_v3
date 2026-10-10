/**
 * AttendSure V3 - Institutional Status & Telemetry Footer
 * File: frontend/src/components/layout/Footer.tsx
 *
 * 100% Dynamic - Derives school identity and hardware status directly from database state.
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

  // Purely dynamic from database context
  const activeSchoolName = schoolName || school.school_name || '';
  const activeSchoolId = schoolId || school.school_id || '';
  const activeDivision = divisionOrCity || school.division || '';

  return (
    <footer
      style={{
        minHeight: 36,
        backgroundColor: '#ffffff',
        borderTop: '1px solid #e2e8f0',
        padding: '0 20px',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        fontSize: '0.70rem',
        color: '#64748b',
        position: 'sticky',
        bottom: 0,
        zIndex: 30,
        boxSizing: 'border-box',
        flexWrap: 'wrap',
        gap: 8,
      }}
    >
      {/* Left: Dynamic Institutional Identity */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
        {activeSchoolName && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
            <Building2 size={13} color="#0284c7" />
            <span style={{ fontWeight: 700, color: '#1e293b' }}>{activeSchoolName}</span>
          </div>
        )}
        {activeSchoolId && (
          <>
            <span style={{ color: '#cbd5e1' }}>&bull;</span>
            <span>
              ID:{' '}
              <strong style={{ color: '#475569', fontFamily: 'monospace', letterSpacing: '0.5px' }}>
                {activeSchoolId}
              </strong>
            </span>
          </>
        )}
        {activeDivision && (
          <>
            <span style={{ color: '#cbd5e1' }}>&bull;</span>
            <span className="hidden sm:inline">{activeDivision}</span>
          </>
        )}
      </div>

      {/* Center: Live Telemetry Badges */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 4,
            color: isDatabaseConnected ? '#059669' : '#dc2626',
            fontWeight: 600,
          }}
          title={isDatabaseConnected ? 'PostgreSQL Database Connected' : 'Database Disconnected'}
        >
          <Database size={11} />
          <span>{isDatabaseConnected ? 'Database Connected' : 'Database Disconnected'}</span>
        </div>

        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 4,
            color: isGateSystemOnline ? '#0284c7' : '#dc2626',
            fontWeight: 600,
          }}
          title={isGateSystemOnline ? 'Gate Hardware Online' : 'Gate System Offline'}
        >
          <Radio size={11} />
          <span>{isGateSystemOnline ? 'Gate System Online' : 'Gate System Offline'}</span>
        </div>
      </div>

      {/* Right: Institutional Copyright */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
        <span>&copy; 2026 AttendSure V3 &bull; Developed by</span>
        <strong style={{ color: '#0284c7', fontWeight: 800 }}>TechBlazer</strong>.
        <span className="hidden md:inline" style={{ color: '#94a3b8' }}>
          All rights reserved.
        </span>
      </div>
    </footer>
  );
};

export default Footer;