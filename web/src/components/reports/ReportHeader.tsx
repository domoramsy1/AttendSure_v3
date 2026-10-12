/**
 * AttendSure V3 - Official DepEd & Institutional Report Header & Signatories
 * File: frontend/src/components/reports/ReportHeader.tsx
 *
 * 100% Dynamic:
 * - Reads institutional identity directly from SchoolContext with zero dummy strings.
 * - Safe image resolution avoiding TS2339 property access errors.
 * - Non-collapsing signature underlines for digital or wet signatures.
 * - Print-safe CSS preventing breaks and color fading during PDF export.
 */

import React, { useState } from 'react';
import { useSchool } from '../../context/SchoolContext';

export interface ReportHeaderProps {
  title: string;
  subtitle?: string;
  formNumber?: string;
  leftLogoUrl?: string | null;
  rightLogoUrl?: string | null;
  schoolName?: string;
  schoolId?: string;
  region?: string;
  division?: string;
}

const resolveMediaUrl = (rawSrc?: string | null): string | null => {
  if (!rawSrc || typeof rawSrc !== 'string') return null;
  const trimmed = rawSrc.trim();
  if (!trimmed) return null;

  if (
    trimmed.startsWith('data:image/') ||
    trimmed.startsWith('http://') ||
    trimmed.startsWith('https://') ||
    trimmed.startsWith('blob:')
  ) {
    return trimmed;
  }

  if (trimmed.startsWith('/media/') || trimmed.startsWith('media/')) {
    const cleanPath = trimmed.startsWith('/') ? trimmed : `/${trimmed}`;
    const protocol = typeof window !== 'undefined' ? window.location.protocol : 'http:';
    const hostname = typeof window !== 'undefined' ? window.location.hostname : 'localhost';
    const backendPort = typeof window !== 'undefined' && window.location.port === '8000' ? '' : ':8000';
    return `${protocol}//${hostname}${backendPort}${cleanPath}`;
  }

  return trimmed;
};

export const ReportHeader: React.FC<ReportHeaderProps> = ({
  title,
  subtitle,
  formNumber,
  leftLogoUrl,
  rightLogoUrl,
  schoolName,
  schoolId,
  region,
  division,
}) => {
  const { school } = useSchool();
  const [leftImgFailed, setLeftImgFailed] = useState(false);
  const [rightImgFailed, setRightImgFailed] = useState(false);

  // Safe indexed resolution prevents TS2339 while checking optional fields
  const schoolRecord = school as Record<string, any>;

  const activeRegion = region || school.region || '';
  const activeDivision = division || school.division || '';
  const activeSchoolName = schoolName || school.school_name || '';
  const activeSchoolId = schoolId || school.school_id || '';

  const resolvedLeftLogo = resolveMediaUrl(
    leftLogoUrl || schoolRecord.left_logo || schoolRecord.deped_seal || schoolRecord.deped_logo || null
  );
  const resolvedRightLogo = resolveMediaUrl(
    rightLogoUrl || schoolRecord.right_logo || school.school_logo || null
  );

  return (
    <div style={headerContainerStyle} className="attendsure-report-header">
      {/* 1. Left Seal Container */}
      <div style={sealBoxStyle}>
        {resolvedLeftLogo && !leftImgFailed ? (
          <img
            src={resolvedLeftLogo}
            alt="Agency Seal"
            onError={() => setLeftImgFailed(true)}
            style={sealImgStyle}
          />
        ) : null}
      </div>

      {/* 2. Administrative Hierarchy */}
      <div style={centerTextStyle}>
        {formNumber && (
          <div style={formNumberStyle}>
            {formNumber}
          </div>
        )}

        {(activeRegion || activeDivision) && (
          <div style={jurisdictionStyle}>
            {activeRegion ? `${activeRegion.toUpperCase()} • ` : ''}
            {activeDivision ? activeDivision.toUpperCase() : ''}
          </div>
        )}

        {activeSchoolName && (
          <h1 style={schoolNameStyle}>
            {activeSchoolName.toUpperCase()}
          </h1>
        )}

        {activeSchoolId && (
          <div style={schoolIdStyle}>
            School ID: {activeSchoolId}
          </div>
        )}

        <h2 style={reportTitleStyle}>
          {title}
        </h2>

        {subtitle && (
          <div style={subtitleStyle}>
            {subtitle}
          </div>
        )}
      </div>

      {/* 3. Right Seal Container (Maintains Symmetric Spacing) */}
      <div style={sealBoxStyle}>
        {resolvedRightLogo && !rightImgFailed ? (
          <img
            src={resolvedRightLogo}
            alt="School Crest"
            onError={() => setRightImgFailed(true)}
            style={sealImgStyle}
          />
        ) : null}
      </div>
    </div>
  );
};

export interface ReportSignatoriesProps {
  preparedByLabel?: string;
  preparedByName?: string;
  preparedByTitle?: string;
  approvedByLabel?: string;
  approvedByName?: string;
  approvedByTitle?: string;
  dateSigned?: string;
}

export const ReportSignatories: React.FC<ReportSignatoriesProps> = ({
  preparedByLabel = 'Prepared By:',
  preparedByName = '',
  preparedByTitle = '',
  approvedByLabel = 'Certified Correct & Approved:',
  approvedByName,
  approvedByTitle,
  dateSigned,
}) => {
  const { school } = useSchool();

  const finalApprovedName = approvedByName ?? school.principal_name ?? '';
  const finalApprovedTitle = approvedByTitle ?? school.principal_title ?? '';

  return (
    <div style={signatoriesContainerStyle} className="attendsure-report-signatories">
      {/* Signatory 1: Adviser / Reporting Faculty */}
      <div style={signatoryBoxStyle}>
        <div style={signatoryLabelStyle}>
          {preparedByLabel}
        </div>
        <div style={signatureLineStyle}>
          {preparedByName ? preparedByName.toUpperCase() : '\u00A0'}
        </div>
        <div style={signatoryTitleStyle}>
          {preparedByTitle || '\u00A0'}
        </div>
        {dateSigned && (
          <div style={signatoryDateStyle}>
            Date: {dateSigned}
          </div>
        )}
      </div>

      {/* Signatory 2: School Head / Principal */}
      <div style={signatoryBoxStyle}>
        <div style={signatoryLabelStyle}>
          {approvedByLabel}
        </div>
        <div style={signatureLineStyle}>
          {finalApprovedName ? finalApprovedName.toUpperCase() : '\u00A0'}
        </div>
        <div style={signatoryTitleStyle}>
          {finalApprovedTitle || '\u00A0'}
        </div>
        {dateSigned && (
          <div style={signatoryDateStyle}>
            Date: {dateSigned}
          </div>
        )}
      </div>
    </div>
  );
};

export default ReportHeader;

// ============================================================================
// STYLES
// ============================================================================

const headerContainerStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
  borderBottom: '2px solid #0f172a',
  paddingBottom: 10,
  marginBottom: 14,
  pageBreakInside: 'avoid',
  breakInside: 'avoid',
  boxSizing: 'border-box',
  width: '100%',
  printColorAdjust: 'exact',
};

const sealBoxStyle: React.CSSProperties = {
  width: 75,
  height: 75,
  minWidth: 75,
  minHeight: 75,
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  flexShrink: 0,
};

const sealImgStyle: React.CSSProperties = {
  maxHeight: '100%',
  maxWidth: '100%',
  objectFit: 'contain',
};

const centerTextStyle: React.CSSProperties = {
  textAlign: 'center',
  flex: 1,
  padding: '0 12px',
};

const formNumberStyle: React.CSSProperties = {
  fontSize: '0.64rem',
  fontWeight: 800,
  letterSpacing: '0.8px',
  color: '#475569',
  textTransform: 'uppercase',
};

const jurisdictionStyle: React.CSSProperties = {
  fontSize: '0.66rem',
  fontWeight: 700,
  color: '#475569',
  textTransform: 'uppercase',
  letterSpacing: '0.4px',
  marginTop: 1,
};

const schoolNameStyle: React.CSSProperties = {
  fontSize: '1.05rem',
  fontWeight: 900,
  color: '#0f172a',
  textTransform: 'uppercase',
  margin: '2px 0',
  lineHeight: 1.2,
};

const schoolIdStyle: React.CSSProperties = {
  fontSize: '0.72rem',
  fontWeight: 700,
  color: '#334155',
  fontFamily: 'monospace',
};

const reportTitleStyle: React.CSSProperties = {
  fontSize: '0.86rem',
  fontWeight: 800,
  color: '#0f172a',
  textTransform: 'uppercase',
  marginTop: 4,
  marginBottom: 0,
};

const subtitleStyle: React.CSSProperties = {
  fontSize: '0.70rem',
  fontStyle: 'italic',
  color: '#64748b',
  marginTop: 2,
};

const signatoriesContainerStyle: React.CSSProperties = {
  display: 'flex',
  justifyContent: 'space-between',
  marginTop: 28,
  padding: '0 24px',
  pageBreakInside: 'avoid',
  breakInside: 'avoid',
  boxSizing: 'border-box',
  width: '100%',
  printColorAdjust: 'exact',
};

const signatoryBoxStyle: React.CSSProperties = {
  textAlign: 'center',
  width: 260,
  maxWidth: '45%',
  display: 'flex',
  flexDirection: 'column',
  alignItems: 'center',
  boxSizing: 'border-box',
};

const signatoryLabelStyle: React.CSSProperties = {
  fontSize: '0.72rem',
  color: '#64748b',
  marginBottom: 35,
};

const signatureLineStyle: React.CSSProperties = {
  fontSize: '0.88rem',
  fontWeight: 800,
  borderBottom: '1px solid #0f172a',
  paddingBottom: 2,
  textTransform: 'uppercase',
  minHeight: '1.2rem',
  width: '100%',
  display: 'block',
  boxSizing: 'border-box',
};

const signatoryTitleStyle: React.CSSProperties = {
  fontSize: '0.72rem',
  color: '#475569',
  marginTop: 2,
  minHeight: '1rem',
  width: '100%',
};

const signatoryDateStyle: React.CSSProperties = {
  fontSize: '0.68rem',
  color: '#64748b',
  marginTop: 2,
};