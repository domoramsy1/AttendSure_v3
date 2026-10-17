import React from 'react';
import { useSchool } from '../../context/SchoolContext';
import appLogoSrc from '../../assets/attendsure-logo.svg';

export const SchoolTenantBadge: React.FC = () => {
  const { school } = useSchool();

  return (
    <div
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: '10px',
        padding: '6px 14px',
        backgroundColor: '#ffffff',
        border: '1px solid #e2e8f0',
        borderRadius: '999px',
        boxShadow: '0 2px 6px rgba(0, 0, 0, 0.04)',
      }}
    >
      <img
        src={school.school_logo || appLogoSrc}
        alt="School Seal"
        width={26}
        height={26}
        onError={(e) => {
          (e.target as HTMLImageElement).src = appLogoSrc;
        }}
        style={{ objectFit: 'contain', borderRadius: '50%' }}
      />
      <span style={{ fontSize: '0.86rem', fontWeight: 700, color: '#0A1F3D' }}>
        {school.school_name || 'Lapasan National High School'}
      </span>
      <span style={{ fontSize: '0.78rem', color: '#64748b' }}>
        • {school.division ? `Division of ${school.division}` : 'DepEd Region X'}
      </span>
    </div>
  );
};

export default SchoolTenantBadge;