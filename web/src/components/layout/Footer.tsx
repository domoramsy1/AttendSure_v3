/**
 * AttendSure - Responsive Institutional Telemetry Footer
 * File: web/src/components/layout/Footer.tsx
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
  const activeSchoolId = schoolId || school.school_id || '304033';
  const activeDivision = divisionOrCity || school.division || '';

  return (
    <footer style={footerStyle}>
      <style>{`
        @media (max-width: 768px) {
          .footer-school-division { display: none !important; }
          .footer-wrapper { height: auto !important; padding: 8px 16px !important; gap: 8px !important; }
        }
      `}</style>

      {/* Left: School Identity */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 0, overflow: 'hidden' }}>
        <Building2 size={13} color="#004b87" style={{ flexShrink: 0 }} />
        <span style={{ fontWeight: 700, color: '#0f172a', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
          {activeSchoolName}
        </span>
        <span style={{ color: '#cbd5e1' }}>&bull;</span>
        <span style={{ fontFamily: 'monospace', color: '#475569', flexShrink: 0 }}>ID: {activeSchoolId}</span>
        {activeDivision && (
          <span className="footer-school-division" style={{ color: '#64748b' }}>
            &bull; {activeDivision}
          </span>
        )}
      </div>

      {/* Center & Right: Health & Attribution */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 14, flexShrink: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 4, color: isDatabaseConnected ? '#059669' : '#dc2626', fontWeight: 700 }}>
          <Database size={11} />
          <span>{isDatabaseConnected ? 'Database Live' : 'Database Offline'}</span>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 4, color: isGateSystemOnline ? '#004b87' : '#dc2626', fontWeight: 700 }}>
          <Radio size={11} />
          <span>{isGateSystemOnline ? 'Gate Live' : 'Gate Standby'}</span>
        </div>

        <span style={{ color: '#64748b' }}>&copy; 2026 AttendSure</span>
      </div>
    </footer>
  );
};

const footerStyle: React.CSSProperties = {
  height: 36,
  minHeight: 36,
  backgroundColor: '#ffffff',
  borderTop: '1px solid #e2e8f0',
  padding: '0 clamp(12px, 2.5vw, 24px)',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
  fontSize: '0.72rem',
  color: '#64748b',
  boxSizing: 'border-box',
  userSelect: 'none',
  flexWrap: 'wrap',
  gap: 8,
};

export default Footer;