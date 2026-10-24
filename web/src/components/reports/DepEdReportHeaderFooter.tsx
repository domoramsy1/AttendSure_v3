/**
 * AttendSure - DepEd Manual of Style (DMOS) Header & Footer
 * File: web/src/components/reports/DepEdReportHeaderFooter.tsx
 *
 * DMOS SPECIFICATIONS:
 * HEADER:
 * – Left Seal: DepEd Seal – 0.76 Inch (73px)
 * – Right Seal: Division / School Seal – 0.76 Inch (73px)
 * – Republic of the Philippines: Old English Text MT (12pt, bold)
 * – Department of Education: Old English Text MT (18pt, bold)
 * – Name of Regional Office: Tahoma (10pt, bold)
 * – Name of Office / Division: Tahoma (10pt, bold)
 *
 * FOOTER:
 * – Division Seal / School Seal – 0.76 Inch (73px)
 * – Office Details (Address, Contact, Email): Calibri (Body), 10pt
 */

import React from 'react';
import { useSchool } from '../../context/SchoolContext';

export interface DepEdReportHeaderProps {
  formTitle: string;
  formSubtitle?: string;
  formType?: 'SF1' | 'SF2' | 'SF4';
  reportData?: {
    school_id?: string;
    school_name?: string;
    region?: string;
    division?: string;
    district?: string;
    academic_year?: string;
    school_year?: string;
    grade_level?: string;
    section_name?: string;
    month?: string;
    year?: number | string;
    left_logo?: string | null;
    right_logo?: string | null;
    school_logo?: string | null;
  } | null;
}

// Cybersecurity: Validate that image sources use safe protocols
const isSafeImageUrl = (url?: string | null): boolean => {
  if (!url || typeof url !== 'string') return false;
  const clean = url.trim().toLowerCase();
  if (!clean || clean === 'null' || clean === 'undefined' || clean === 'none') return false;
  if (clean.startsWith('javascript:') || clean.startsWith('vbscript:')) return false;
  return (
    clean.startsWith('http://') ||
    clean.startsWith('https://') ||
    clean.startsWith('/') ||
    clean.startsWith('data:image/') ||
    clean.startsWith('blob:')
  );
};

export const DepEdReportHeader: React.FC<DepEdReportHeaderProps> = ({
  formTitle,
  formSubtitle,
  formType = 'SF1',
  reportData,
}) => {
  const { school } = useSchool();

  // Left Seal: DepEd / Kagawaran Seal
  const effectiveLeftLogo =
    (isSafeImageUrl(reportData?.left_logo) && reportData?.left_logo) ||
    (isSafeImageUrl(school.left_logo) && school.left_logo) ||
    null;

  // Right Seal: School Circular Crest (Prioritizes School Emblem from database)
  const effectiveRightLogo =
    (isSafeImageUrl(school.school_logo) && school.school_logo) ||
    (isSafeImageUrl(reportData?.school_logo) && reportData?.school_logo) ||
    (isSafeImageUrl(reportData?.right_logo) && reportData?.right_logo) ||
    (isSafeImageUrl(school.right_logo) && school.right_logo) ||
    null;

  const effectiveSchoolName = reportData?.school_name || school.school_name || '';
  const effectiveSchoolId = reportData?.school_id || school.school_id || '';
  const effectiveDivision = reportData?.division || school.division || '';
  const effectiveRegion = reportData?.region || school.region || '';
  const effectiveDistrict = reportData?.district || school.district || '';
  const effectiveYear = reportData?.academic_year || reportData?.school_year || '';

  return (
    <div style={headerContainerStyle}>
      {/* DepEd Seal – 0.76 Inch */}
      <div style={sealBoxStyle}>
        {effectiveLeftLogo ? (
          <img src={effectiveLeftLogo} alt="DepEd Seal" style={sealImgStyle} />
        ) : null}
      </div>

      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ textAlign: 'center', marginBottom: 4 }}>
          {/* Republic of the Philippines – Old English Text MT (12 point size, bold) */}
          <div style={republicStyle}>Republic of the Philippines</div>

          {/* Department of Education – Old English Text MT (18 point size, bold) */}
          <div style={depedTitleStyle}>Department of Education</div>

          {/* Name of Regional Office – Tahoma (10 point size, bold) */}
          {effectiveRegion ? (
            <div style={regionalOfficeStyle}>{effectiveRegion.toUpperCase()}</div>
          ) : null}

          {/* Name of Office – Tahoma (10 point size, bold) */}
          {effectiveDivision ? (
            <div style={officeStyle}>{effectiveDivision.toUpperCase()}</div>
          ) : null}

          <div style={formTitleStyle}>{formTitle}</div>
          {formSubtitle ? <div style={formSubStyle}>{formSubtitle}</div> : null}
        </div>

        {/* Dynamic Metadata Grids per Form Type */}
        {formType === 'SF2' ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 3, width: '100%' }}>
            <div style={{ display: 'flex', alignItems: 'center', width: '100%' }}>
              <div style={{ display: 'flex', alignItems: 'center', width: '28%' }}>
                <span style={metaLabelStyle}>School ID</span>
                <div style={{ ...fieldBoxStyle, width: 95 }}>{effectiveSchoolId || '—'}</div>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', width: '32%' }}>
                <span style={metaLabelStyle}>School Year</span>
                <div style={{ ...fieldBoxStyle, width: 105 }}>{effectiveYear || '—'}</div>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', width: '40%' }}>
                <span style={{ ...metaLabelStyle, width: 125 }}>Report for Month of</span>
                <div style={{ ...fieldBoxStyle, flex: 1, textAlign: 'left', paddingLeft: 6 }}>
                  {reportData?.month} {reportData?.year}
                </div>
              </div>
            </div>

            <div style={{ display: 'flex', alignItems: 'center', width: '100%' }}>
              <div style={{ display: 'flex', alignItems: 'center', width: '50%' }}>
                <span style={{ ...metaLabelStyle, width: 95 }}>Name of School</span>
                <div style={{ ...fieldBoxStyle, flex: 1, textAlign: 'left', paddingLeft: 6, marginRight: 12 }}>
                  {effectiveSchoolName || '—'}
                </div>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', width: '25%' }}>
                <span style={metaLabelStyle}>Grade Level</span>
                <div style={{ ...fieldBoxStyle, width: 65, marginRight: 10 }}>{reportData?.grade_level || '—'}</div>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', width: '25%' }}>
                <span style={metaLabelStyle}>Section</span>
                <div style={{ ...fieldBoxStyle, flex: 1, textAlign: 'left', paddingLeft: 6 }}>
                  {reportData?.section_name || '—'}
                </div>
              </div>
            </div>
          </div>
        ) : formType === 'SF4' ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 3, width: '100%' }}>
            <div style={{ display: 'flex', alignItems: 'center', width: '100%' }}>
              <div style={{ display: 'flex', alignItems: 'center', width: '25%' }}>
                <span style={metaLabelStyle}>School ID</span>
                <div style={{ ...fieldBoxStyle, width: 90 }}>{effectiveSchoolId || '—'}</div>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', width: '25%' }}>
                <span style={metaLabelStyle}>Region</span>
                <div style={{ ...fieldBoxStyle, flex: 1, textAlign: 'left', paddingLeft: 4 }}>{effectiveRegion || '—'}</div>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', width: '25%', paddingLeft: 6 }}>
                <span style={metaLabelStyle}>Division</span>
                <div style={{ ...fieldBoxStyle, flex: 1, textAlign: 'left', paddingLeft: 4 }}>{effectiveDivision || '—'}</div>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', width: '25%', paddingLeft: 6 }}>
                <span style={metaLabelStyle}>District</span>
                <div style={{ ...fieldBoxStyle, flex: 1, textAlign: 'left', paddingLeft: 4 }}>{effectiveDistrict || '—'}</div>
              </div>
            </div>

            <div style={{ display: 'flex', alignItems: 'center', width: '100%' }}>
              <div style={{ display: 'flex', alignItems: 'center', width: '48%' }}>
                <span style={metaLabelStyle}>School Name</span>
                <div style={{ ...fieldBoxStyle, flex: 1, textAlign: 'left', paddingLeft: 4, marginRight: 6 }}>
                  {effectiveSchoolName || '—'}
                </div>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', width: '24%' }}>
                <span style={metaLabelStyle}>School Year</span>
                <div style={{ ...fieldBoxStyle, flex: 1, marginRight: 6 }}>{effectiveYear || '—'}</div>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', width: '28%' }}>
                <span style={{ ...metaLabelStyle, width: 120 }}>Report for Month of</span>
                <div style={{ ...fieldBoxStyle, flex: 1, textAlign: 'left', paddingLeft: 4 }}>
                  {reportData?.month} {reportData?.year}
                </div>
              </div>
            </div>
          </div>
        ) : (
          /* SF1 Layout */
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4, width: '100%' }}>
            <div style={{ display: 'flex', alignItems: 'center', width: '100%' }}>
              <div style={{ display: 'flex', alignItems: 'center', width: '22%' }}>
                <span style={{ ...metaLabelStyle, width: 62 }}>School ID</span>
                <div style={{ ...fieldBoxStyle, width: 88 }}>{effectiveSchoolId}</div>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', width: '26%', paddingRight: 8 }}>
                <span style={{ ...metaLabelStyle, width: 48 }}>Region</span>
                <div style={{ ...fieldBoxStyle, flex: 1, textAlign: 'left', paddingLeft: 6 }}>{effectiveRegion}</div>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', width: '28%', paddingRight: 8 }}>
                <span style={{ ...metaLabelStyle, width: 52 }}>Division</span>
                <div style={{ ...fieldBoxStyle, flex: 1, textAlign: 'left', paddingLeft: 6 }}>{effectiveDivision}</div>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', width: '24%' }}>
                <span style={{ ...metaLabelStyle, width: 48 }}>District</span>
                <div style={{ ...fieldBoxStyle, flex: 1, textAlign: 'left', paddingLeft: 6 }}>{effectiveDistrict}</div>
              </div>
            </div>

            <div style={{ display: 'flex', alignItems: 'center', width: '100%' }}>
              <div style={{ display: 'flex', alignItems: 'center', width: '42%' }}>
                <span style={{ ...metaLabelStyle, width: 78 }}>School Name</span>
                <div style={{ ...fieldBoxStyle, flex: 1, textAlign: 'left', paddingLeft: 6, marginRight: 8 }}>
                  {effectiveSchoolName}
                </div>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', width: '25%', paddingRight: 8 }}>
                <span style={{ ...metaLabelStyle, width: 68 }}>School Year</span>
                <div style={{ ...fieldBoxStyle, flex: 1 }}>{effectiveYear}</div>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', width: '33%' }}>
                <span style={{ ...metaLabelStyle, width: 62 }}>Grade Level</span>
                <div style={{ ...fieldBoxStyle, width: 48, marginRight: 8 }}>{reportData?.grade_level}</div>
                <span style={{ ...metaLabelStyle, width: 42 }}>Section</span>
                <div style={{ ...fieldBoxStyle, flex: 1, textAlign: 'left', paddingLeft: 6 }}>
                  {reportData?.section_name}
                </div>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Division Seal / School Seal – 0.76 Inch */}
      <div style={sealBoxStyle}>
        {effectiveRightLogo ? (
          <img src={effectiveRightLogo} alt="School Seal" style={sealImgStyle} />
        ) : null}
      </div>
    </div>
  );
};

export interface DepEdReportFooterProps {
  sealUrl?: string | null;
  address?: string;
  contactNumber?: string;
  email?: string;
  reportData?: {
    school_logo?: string | null;
    right_logo?: string | null;
  } | null;
}

export const DepEdReportFooter: React.FC<DepEdReportFooterProps> = ({
  sealUrl,
  address,
  contactNumber,
  email,
  reportData,
}) => {
  const { school } = useSchool();

  // Division Seal / School Seal – 0.76 Inch (Strictly pulls School Emblem)
  const effectiveSeal =
    (isSafeImageUrl(sealUrl) && sealUrl) ||
    (isSafeImageUrl(school.school_logo) && school.school_logo) ||
    (isSafeImageUrl(reportData?.school_logo) && reportData?.school_logo) ||
    (isSafeImageUrl(school.right_logo) && school.right_logo) ||
    (isSafeImageUrl(reportData?.right_logo) && reportData?.right_logo) ||
    null;

  const effectiveAddress = address || school.address || '';
  const effectiveContact = contactNumber || school.contact_number || '';
  const effectiveEmail = email || school.email || '';

  return (
    <div style={dmosFooterStyle}>
      {/* Division Seal / School Seal – 0.76 Inch */}
      <div style={sealBoxStyle}>
        {effectiveSeal ? (
          <img src={effectiveSeal} alt="School Seal" style={sealImgStyle} />
        ) : null}
      </div>

      {/* Office Details – Calibri (Body), 10 point size */}
      <div style={dmosFooterDetailsStyle}>
        <div><strong>Address: </strong>{effectiveAddress || '—'}</div>
        <div>
          <strong>Contact No.: </strong>{effectiveContact || '—'} &bull;{' '}
          <strong>Email: </strong>{effectiveEmail || '—'}
        </div>
      </div>
    </div>
  );
};

// ==============================================================================
// EXACT DMOS STYLES (0.76 INCH, 12PT/18PT OLD ENGLISH, 10PT TAHOMA, 10PT CALIBRI)
// ==============================================================================

const headerContainerStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'flex-start',
  justifyContent: 'space-between',
  gap: '12px',
  marginBottom: '8px',
  width: '100%',
  boxSizing: 'border-box',
};

// Seal – 0.76 Inch (73px at 96 DPI)
const sealBoxStyle: React.CSSProperties = {
  width: '0.76in',
  height: '0.76in',
  minWidth: '0.76in',
  minHeight: '0.76in',
  flexShrink: 0,
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
};

const sealImgStyle: React.CSSProperties = {
  width: '0.76in',
  height: '0.76in',
  objectFit: 'contain',
};

// Republic of the Philippines – Old English Text MT (12 point size, bold)
const republicStyle: React.CSSProperties = {
  fontFamily: "'Old English Text MT', 'UnifrakturMaguntia', 'Cloister Black', serif",
  fontSize: '12pt',
  fontWeight: 'bold',
  color: '#000000',
  lineHeight: 1.15,
};

// Department of Education – Old English Text MT (18 point size, bold)
const depedTitleStyle: React.CSSProperties = {
  fontFamily: "'Old English Text MT', 'UnifrakturMaguntia', 'Cloister Black', serif",
  fontSize: '18pt',
  fontWeight: 'bold',
  color: '#000000',
  lineHeight: 1.15,
  marginTop: '1px',
};

// Name of Regional Office – Tahoma (10 point size, bold)
const regionalOfficeStyle: React.CSSProperties = {
  fontFamily: 'Tahoma, Arial, sans-serif',
  fontSize: '10pt',
  fontWeight: 'bold',
  color: '#000000',
  lineHeight: 1.2,
  marginTop: '2px',
};

// Name of Office – Tahoma (10 point size, bold)
const officeStyle: React.CSSProperties = {
  fontFamily: 'Tahoma, Arial, sans-serif',
  fontSize: '10pt',
  fontWeight: 'bold',
  color: '#000000',
  lineHeight: 1.2,
  marginTop: '1px',
};

const formTitleStyle: React.CSSProperties = {
  fontFamily: 'Tahoma, Arial, sans-serif',
  fontSize: '10.5pt',
  fontWeight: 900,
  textTransform: 'uppercase',
  letterSpacing: '0.5px',
  marginTop: '4px',
  color: '#000000',
};

const formSubStyle: React.CSSProperties = {
  fontSize: '6.2pt',
  fontStyle: 'italic',
  color: '#000000',
  marginTop: '1px',
};

const metaLabelStyle: React.CSSProperties = {
  fontFamily: 'Tahoma, sans-serif',
  fontWeight: 700,
  fontSize: '7.2pt',
  color: '#000000',
  flexShrink: 0,
};

const fieldBoxStyle: React.CSSProperties = {
  minHeight: 18,
  lineHeight: '18px',
  border: '1.2px solid #000000',
  backgroundColor: '#ffffff',
  textAlign: 'center',
  fontWeight: 700,
  fontSize: '7.4pt',
  color: '#000000',
  padding: '0 4px',
  boxSizing: 'border-box',
  overflow: 'hidden',
  textOverflow: 'ellipsis',
  whiteSpace: 'nowrap',
};

// Footer Container
const dmosFooterStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'flex-start',
  gap: '12px',
  width: '100%',
  marginTop: '10px',
  paddingTop: '6px',
  borderTop: '1px solid #000000',
  boxSizing: 'border-box',
};

// Office Details – Calibri (Body), 10 point size
const dmosFooterDetailsStyle: React.CSSProperties = {
  fontFamily: 'Calibri, "Segoe UI", Arial, sans-serif',
  fontSize: '10pt',
  color: '#000000',
  lineHeight: 1.3,
  textAlign: 'left',
};