/**
 * AttendSure V3 - Official DepEd Manual of Style Header & Footer
 * File: frontend/src/components/reports/DepEdLetterhead.tsx
 *
 * 100% Dynamic - Zero hardcoded region, division, or school names.
 * Strictly renders official data saved in SchoolContext.
 */

import React, { useState } from 'react';
import { useSchool } from '../../context/SchoolContext';

interface DepEdHeaderProps {
  leftSealUrl?: string | null;
  rightSealUrl?: string | null;
  regionalOfficeName?: string;
  divisionOrOfficeName?: string;
  schoolName?: string;
  documentTitle?: string;
  documentSubTitle?: string;
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

export const DepEdHeader: React.FC<DepEdHeaderProps> = ({
  leftSealUrl,
  rightSealUrl,
  regionalOfficeName,
  divisionOrOfficeName,
  schoolName,
  documentTitle,
  documentSubTitle,
}) => {
  const { school } = useSchool();
  const [leftImgFailed, setLeftImgFailed] = useState(false);
  const [rightImgFailed, setRightImgFailed] = useState(false);

  // Purely dynamic from database context
  const activeRegion = regionalOfficeName || school.region || '';
  const activeDivision =
    divisionOrOfficeName ||
    (school.division ? `SCHOOLS DIVISION OF ${school.division.toUpperCase()}` : '');
  const activeSchool = schoolName || (school.school_name ? school.school_name.toUpperCase() : '');

  const resolvedLeftSeal = resolveMediaUrl(leftSealUrl || '/assets/deped-seal.png');
  const resolvedRightSeal = resolveMediaUrl(rightSealUrl || school.school_logo);

  return (
    <div style={headerRootStyle} className="deped-header-container">
      {/* Left Seal: Exactly 0.76 Inch */}
      <div style={sealContainerStyle}>
        {resolvedLeftSeal && !leftImgFailed ? (
          <img
            src={resolvedLeftSeal}
            alt="DepEd Seal"
            onError={() => setLeftImgFailed(true)}
            style={sealImageStyle}
          />
        ) : null}
      </div>

      {/* Center Hierarchy (DepEd DMOS Specifications) */}
      <div style={centerHeaderContainer}>
        <div style={republicStyle}>
          Republic of the Philippines
        </div>

        <div style={depedTitleStyle}>
          Department of Education
        </div>

        {activeRegion && (
          <div style={regionalOfficeStyle}>
            {activeRegion.toUpperCase()}
          </div>
        )}

        {activeDivision && (
          <div style={officeStyle}>
            {activeDivision.toUpperCase()}
          </div>
        )}

        {activeSchool && (
          <div style={officeStyle}>
            {activeSchool.toUpperCase()}
          </div>
        )}

        {documentTitle && (
          <div style={documentTitleStyle}>
            {documentTitle}
          </div>
        )}
        {documentSubTitle && (
          <div style={documentSubTitleStyle}>
            {documentSubTitle}
          </div>
        )}
      </div>

      {/* Right Seal: Exactly 0.76 Inch */}
      <div style={sealContainerStyle}>
        {resolvedRightSeal && !rightImgFailed ? (
          <img
            src={resolvedRightSeal}
            alt="School Emblem"
            onError={() => setRightImgFailed(true)}
            style={sealImageStyle}
          />
        ) : null}
      </div>
    </div>
  );
};

interface DepEdFooterProps {
  sealUrl?: string | null;
  address?: string;
  contactNumber?: string;
  emailAddress?: string;
  website?: string;
}

export const DepEdFooter: React.FC<DepEdFooterProps> = ({
  sealUrl,
  address,
  contactNumber,
  emailAddress,
  website,
}) => {
  const { school } = useSchool();
  const [footerImgFailed, setFooterImgFailed] = useState(false);

  const activeAddress = address || school.address || '';
  const activeContact = contactNumber || school.contact_number || '';
  const activeEmail = emailAddress || school.email || '';
  const activeWebsite = website || '';
  const resolvedSeal = resolveMediaUrl(sealUrl || school.school_logo);

  return (
    <div style={footerRootStyle} className="deped-footer-container">
      <div style={sealContainerStyle}>
        {resolvedSeal && !footerImgFailed ? (
          <img
            src={resolvedSeal}
            alt="Office Seal"
            onError={() => setFooterImgFailed(true)}
            style={sealImageStyle}
          />
        ) : null}
      </div>

      <div style={footerDetailsStyle}>
        {activeAddress && <div>Address: {activeAddress}</div>}
        <div>
          {activeContact && <span>Contact No.: {activeContact}</span>}
          {activeContact && activeEmail && <span> &bull; </span>}
          {activeEmail && <span>Email: {activeEmail}</span>}
          {activeWebsite && <span> &bull; Website: {activeWebsite}</span>}
        </div>
      </div>
    </div>
  );
};

const headerRootStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
  width: '100%',
  marginBottom: '8px',
  boxSizing: 'border-box',
  pageBreakInside: 'avoid',
  breakInside: 'avoid',
};

const sealContainerStyle: React.CSSProperties = {
  width: '0.76in',
  height: '0.76in',
  minWidth: '0.76in',
  minHeight: '0.76in',
  maxWidth: '0.76in',
  maxHeight: '0.76in',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  flexShrink: 0,
};

const sealImageStyle: React.CSSProperties = {
  width: '0.76in',
  height: '0.76in',
  objectFit: 'contain',
  display: 'block',
};

const centerHeaderContainer: React.CSSProperties = {
  flex: 1,
  textAlign: 'center',
  margin: '0 8px',
};

const republicStyle: React.CSSProperties = {
  fontFamily: "'Old English Text MT', 'Old English Text MT Fallback', 'UnifrakturMaguntia', serif",
  fontSize: '12pt',
  fontWeight: 'bold',
  color: '#000000',
  lineHeight: 1.15,
};

const depedTitleStyle: React.CSSProperties = {
  fontFamily: "'Old English Text MT', 'Old English Text MT Fallback', 'UnifrakturMaguntia', serif",
  fontSize: '18pt',
  fontWeight: 'bold',
  color: '#000000',
  lineHeight: 1.15,
  marginTop: '1px',
};

const regionalOfficeStyle: React.CSSProperties = {
  fontFamily: 'Tahoma, Arial, sans-serif',
  fontSize: '10pt',
  fontWeight: 'bold',
  color: '#000000',
  lineHeight: 1.2,
  marginTop: '3px',
};

const officeStyle: React.CSSProperties = {
  fontFamily: 'Tahoma, Arial, sans-serif',
  fontSize: '10pt',
  fontWeight: 'bold',
  color: '#000000',
  lineHeight: 1.2,
  marginTop: '1px',
};

const documentTitleStyle: React.CSSProperties = {
  fontFamily: 'Tahoma, Arial, sans-serif',
  fontSize: '11pt',
  fontWeight: 900,
  textTransform: 'uppercase',
  letterSpacing: '0.5px',
  color: '#000000',
  marginTop: '5px',
};

const documentSubTitleStyle: React.CSSProperties = {
  fontFamily: 'Arial, sans-serif',
  fontSize: '6.2pt',
  fontStyle: 'italic',
  color: '#000000',
  marginTop: '1px',
};

const footerRootStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'flex-start',
  gap: '12px',
  width: '100%',
  marginTop: '10px',
  paddingTop: '6px',
  borderTop: '1px solid #000000',
  boxSizing: 'border-box',
  pageBreakInside: 'avoid',
  breakInside: 'avoid',
};

const footerDetailsStyle: React.CSSProperties = {
  fontFamily: 'Calibri, "Segoe UI", Arial, sans-serif',
  fontSize: '10pt',
  color: '#000000',
  lineHeight: 1.3,
  textAlign: 'left',
};

export default DepEdHeader;