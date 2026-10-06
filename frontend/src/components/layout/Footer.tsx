import React from 'react';
import { Building2, Database, Radio } from 'lucide-react';

interface FooterProps {
  schoolName?: string;
  schoolId?: string;
  divisionOrCity?: string;
}

export const Footer: React.FC<FooterProps> = ({
  schoolName = 'Lapasan National High School',
  schoolId = '304033',
  divisionOrCity = 'Cagayan de Oro City',
}) => {
  return (
    <footer
      style={{
        height: 36,
        backgroundColor: '#ffffff',
        borderTop: '1px solid #e2e8f0',
        padding: '0 24px',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        fontSize: '0.70rem',
        color: '#64748b',
        position: 'sticky',
        bottom: 0,
        zIndex: 30,
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <Building2 size={13} color="#0284c7" />
        <span style={{ fontWeight: 700, color: '#1e293b' }}>{schoolName}</span>
        <span style={{ color: '#cbd5e1' }}>&bull;</span>
        <span>ID: <strong style={{ color: '#475569', fontFamily: 'monospace' }}>{schoolId}</strong></span>
        <span style={{ color: '#cbd5e1' }}>&bull;</span>
        <span>{divisionOrCity}</span>
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 4, color: '#059669', fontWeight: 600 }}>
          <Database size={11} />
          <span>PostgreSQL Active</span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 4, color: '#0284c7', fontWeight: 600 }}>
          <Radio size={11} />
          <span>SMS Gateway Ready</span>
        </div>
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
        <span>&copy; 2026 AttendSure V3. Developed by</span>
        <strong style={{ color: '#0284c7', fontWeight: 800 }}>TechBlazer</strong>.
      </div>
    </footer>
  );
};

export default Footer;