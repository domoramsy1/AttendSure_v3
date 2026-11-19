/**
 * AttendSure - Dynamic School Identity Badge (Theme-Adaptive & Zero Mock Data)
 * File: web/src/components/branding/SchoolTenantBadge.tsx
 */

import React, { memo, useState, useEffect, useMemo } from 'react';
import { School } from 'lucide-react';
import { useSchool } from '../../context/SchoolContext';
import { useTheme } from '../../context/ThemeContext';
import { isSafeImageUrl, sanitizeText } from '../../theme/tokens';
import { BRAND_ASSETS } from './BrandAssets';

export interface SchoolTenantBadgeProps {
  showDivision?: boolean;
  showSchoolId?: boolean;
  compact?: boolean;
  className?: string;
  style?: React.CSSProperties;
}

const formatDivisionText = (division?: string, region?: string): string => {
  const cleanDivision = sanitizeText(division || '', 80);
  if (cleanDivision) {
    return /division/i.test(cleanDivision) ? cleanDivision : `Division of ${cleanDivision}`;
  }
  return sanitizeText(region || '', 60);
};

export const SchoolTenantBadge: React.FC<SchoolTenantBadgeProps> = memo(
  ({
    showDivision = true,
    showSchoolId = false,
    compact = false,
    className,
    style,
  }) => {
    const { school, loading } = useSchool();
    const { mode, tokens, brand, fonts } = useTheme();

    const [sealFailed, setSealFailed] = useState<boolean>(false);
    const [fallbackFailed, setFallbackFailed] = useState<boolean>(false);

    const safeSchoolLogo = useMemo(
      () => (isSafeImageUrl(school.school_logo) ? school.school_logo : null),
      [school.school_logo]
    );

    useEffect(() => {
      setSealFailed(false);
    }, [safeSchoolLogo]);

    const schoolName = useMemo(() => {
      const cleaned = sanitizeText(school.school_name || '', 120);
      if (cleaned) return cleaned;
      return loading ? 'Loading school...' : 'School Not Configured';
    }, [school.school_name, loading]);

    const divisionLabel = useMemo(
      () => (showDivision ? formatDivisionText(school.division, school.region) : ''),
      [showDivision, school.division, school.region]
    );

    const validSchoolId = useMemo(() => {
      if (!showSchoolId) return '';
      const rawId = sanitizeText(school.school_id || '', 20);
      return rawId && rawId !== '55555' && rawId !== '000000' ? rawId : '';
    }, [showSchoolId, school.school_id]);

    const activeImageSrc =
      safeSchoolLogo && !sealFailed
        ? safeSchoolLogo
        : !fallbackFailed
        ? BRAND_ASSETS.attendsureLogo
        : null;

    const sealBoxSize = compact ? 22 : 26;
    const sealImgSize = compact ? 16 : 20;

    return (
      <div
        className={className}
        title={
          divisionLabel
            ? `${schoolName} • ${divisionLabel}`
            : schoolName
        }
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          gap: compact ? 8 : 10,
          padding: compact ? '4px 11px 4px 6px' : '5px 14px 5px 7px',
          maxWidth: '100%',
          backgroundColor: tokens.bgSurface,
          borderWidth: mode === 'high-contrast' ? 1.5 : 1,
          borderStyle: 'solid',
          borderColor: tokens.borderSubtle,
          borderRadius: 9999,
          boxShadow: tokens.cardShadow,
          fontFamily: fonts.sans,
          userSelect: 'none',
          boxSizing: 'border-box',
          transition: 'background-color 0.2s ease, border-color 0.2s ease',
          ...style,
        }}
      >
        {/* Porcelain Seal Medallion keeps dark-ink logos crisp in Dark Mode */}
        <div
          style={{
            width: sealBoxSize,
            height: sealBoxSize,
            borderRadius: '50%',
            backgroundColor: '#ffffff',
            borderWidth: 1,
            borderStyle: 'solid',
            borderColor: mode === 'dark' ? 'rgba(56, 189, 248, 0.45)' : '#e2e8f0',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            overflow: 'hidden',
            flexShrink: 0,
          }}
        >
          {activeImageSrc ? (
            <img
              src={activeImageSrc}
              alt={`${schoolName} Seal`}
              width={sealImgSize}
              height={sealImgSize}
              decoding="async"
              referrerPolicy="no-referrer"
              draggable={false}
              onError={() => {
                if (safeSchoolLogo && !sealFailed) {
                  setSealFailed(true);
                } else {
                  setFallbackFailed(true);
                }
              }}
              style={{
                width: sealImgSize,
                height: sealImgSize,
                objectFit: 'contain',
                display: 'block',
              }}
            />
          ) : (
            <School size={compact ? 13 : 15} color="#004b87" aria-hidden="true" />
          )}
        </div>

        <span
          style={{
            fontSize: compact ? fonts.size.sm : fonts.size.base,
            fontWeight: 800,
            color: tokens.textPrimary,
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
            minWidth: 0,
          }}
        >
          {schoolName}
        </span>

        {validSchoolId && (
          <span
            style={{
              fontSize: fonts.size.xs,
              fontWeight: 700,
              fontFamily: fonts.mono,
              color: brand.primary,
              backgroundColor: tokens.primaryLight,
              padding: '1px 7px',
              borderRadius: 9999,
              flexShrink: 0,
            }}
          >
            ID: {validSchoolId}
          </span>
        )}

        {divisionLabel && (
          <span
            style={{
              fontSize: fonts.size.sm,
              fontWeight: 500,
              color: tokens.textSecondary,
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
              flexShrink: 1,
            }}
          >
            &bull; {divisionLabel}
          </span>
        )}
      </div>
    );
  }
);

SchoolTenantBadge.displayName = 'SchoolTenantBadge';

export default SchoolTenantBadge;