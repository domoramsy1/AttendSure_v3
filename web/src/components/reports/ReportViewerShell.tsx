/**
 * AttendSure - Shared Official Report Header, Switcher Bar, Page Dimensions & Viewer Shell
 * File: web/src/components/reports/ReportViewerShell.tsx
 */

import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  Loader2,
  AlertCircle,
  ZoomIn,
  ZoomOut,
  Maximize2,
  Printer,
  Download,
  Settings,
  FileSpreadsheet,
} from 'lucide-react';
import { useTheme } from '../../context/ThemeContext';
import { SEAL_COLORS } from '../../theme/tokens';
import { canViewSf4, getCurrentUserFromStorage } from '../../utils/permissions';
import { DEFAULT_PAGE_SETUP, PAPER_SIZES } from '../../types/pageSetup';
import type { PageSetupConfig } from '../../types/pageSetup';

export const DEFAULT_DEPED_LANDSCAPE_SETUP: PageSetupConfig = {
  ...DEFAULT_PAGE_SETUP,
  layoutMode: 'pages',
  orientation: 'landscape',
  paperSize: 'legal',
  pageColor: SEAL_COLORS.white,
  marginPreset: 'compact',
  margins: { top: 0.25, right: 0.25, bottom: 0.25, left: 0.25 },
  headerRepeat: 'first_page_only',
};

export const resolvePaperDimensionsInches = (
  config: PageSetupConfig
): { widthIn: number; heightIn: number } => {
  const paper = PAPER_SIZES[config.paperSize] || PAPER_SIZES.legal;
  const isLandscape = config.orientation === 'landscape';
  return isLandscape
    ? { widthIn: paper.height, heightIn: paper.width }
    : { widthIn: paper.width, heightIn: paper.height };
};

export const DepEdOfficialSeal: React.FC<{ size?: number }> = ({ size = 56 }) => (
  <svg width={size} height={size} viewBox="0 0 64 64" fill="none" aria-label="Official Seal">
    <circle cx="32" cy="32" r="30" fill={SEAL_COLORS.white} stroke={SEAL_COLORS.navy} strokeWidth="2.5" />
    <circle cx="32" cy="32" r="24" fill={SEAL_COLORS.surface} stroke={SEAL_COLORS.amber} strokeWidth="1.5" />
    <path d="M20 38L32 18L44 38H20Z" fill={SEAL_COLORS.navy} opacity="0.9" />
    <circle cx="32" cy="28" r="4" fill={SEAL_COLORS.gold} />
    <text
      x="32"
      y="49"
      textAnchor="middle"
      fontSize="7"
      fontWeight="800"
      fill={SEAL_COLORS.ink}
      fontFamily="Arial, sans-serif"
    >
      DEPED
    </text>
  </svg>
);

export interface ReportHeaderBarProps {
  activeReportId?: string;
  onSelectReport?: (reportId: string) => void;
  documentTitle: string;
  subtitle?: string;
  isSavingPdf?: boolean;
  onOpenPageSetup: () => void;
  onPrint: () => void;
  onSavePdf: () => void;
  onSavePdfAs?: () => void;
  onDownloadExcel: () => void;
  onSaveExcelAs?: () => void;
  onDownloadCsv: () => void;
  onSaveCsvAs?: () => void;
  onDownloadWord: () => void;
  onSaveWordAs?: () => void;
  onDownloadJson: () => void;
  onSaveJsonAs?: () => void;
}

export const ReportHeaderBar: React.FC<ReportHeaderBarProps> = ({
  activeReportId = 'sf1',
  onSelectReport,
  documentTitle,
  subtitle,
  isSavingPdf = false,
  onOpenPageSetup,
  onPrint,
  onSavePdf,
  onSavePdfAs,
  onDownloadExcel,
  onSaveExcelAs,
  onDownloadCsv,
  onSaveCsvAs,
  onDownloadWord,
  onSaveWordAs,
  onDownloadJson,
  onSaveJsonAs,
}) => {
  const { tokens, brand, ui } = useTheme();
  const [menuOpen, setMenuOpen] = useState<boolean>(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  const isLeader = canViewSf4(getCurrentUserFromStorage());

  const reportTabs = [
    { id: 'sf1', label: 'Form 1 (School Register)' },
    { id: 'sf2', label: 'Form 2 (Daily Attendance)' },
    ...(isLeader ? [{ id: 'sf4', label: 'Form 4 (Monthly Movement)' }] : []),
  ];

  const handleSwitchReport = (reportId: string) => {
    if (onSelectReport) {
      onSelectReport(reportId);
    } else {
      window.dispatchEvent(
        new CustomEvent('attendsure:navigate', { detail: { tab: 'reports', report: reportId } })
      );
    }
  };

  useEffect(() => {
    if (!menuOpen) return;

    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setMenuOpen(false);
      }
    };

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setMenuOpen(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    window.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [menuOpen]);

  const menuActions: Array<{ label: string; fn: () => void }> = [
    { label: 'Download PDF (.pdf)', fn: onSavePdf },
    ...(onSavePdfAs ? [{ label: 'Save PDF As...', fn: onSavePdfAs }] : []),
    { label: 'Download Excel (.xls)', fn: onDownloadExcel },
    ...(onSaveExcelAs ? [{ label: 'Save Excel As...', fn: onSaveExcelAs }] : []),
    { label: 'Download CSV (.csv)', fn: onDownloadCsv },
    ...(onSaveCsvAs ? [{ label: 'Save CSV As...', fn: onSaveCsvAs }] : []),
    { label: 'Download Word (.doc)', fn: onDownloadWord },
    ...(onSaveWordAs ? [{ label: 'Save Word As...', fn: onSaveWordAs }] : []),
    { label: 'Download JSON (.json)', fn: onDownloadJson },
    ...(onSaveJsonAs ? [{ label: 'Save JSON As...', fn: onSaveJsonAs }] : []),
  ];

  return (
    <div style={{ display: 'flex', flexDirection: 'column', width: '100%' }}>
      {/* Report Form Switcher Bar (Form 1 / Form 2 / Form 4) */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 12,
          padding: '8px 24px',
          backgroundColor: tokens.bgSurface,
          borderBottom: `1px solid ${tokens.borderSubtle}`,
          flexWrap: 'wrap',
        }}
      >
        <span
          style={{
            fontSize: '0.72rem',
            fontWeight: 800,
            color: tokens.textMuted,
            letterSpacing: '0.4px',
            textTransform: 'uppercase',
          }}
        >
          REPORT FORM:
        </span>
        <div
          style={{
            display: 'flex',
            gap: 6,
            backgroundColor: tokens.bgSurfaceSubtle,
            padding: 4,
            borderRadius: 10,
            border: `1px solid ${tokens.borderSubtle}`,
            flexWrap: 'wrap',
          }}
        >
          {reportTabs.map((tab) => {
            const isActive = activeReportId === tab.id;
            return (
              <button
                key={tab.id}
                type="button"
                onClick={() => handleSwitchReport(tab.id)}
                style={{
                  padding: '6px 14px',
                  borderRadius: 8,
                  border: 'none',
                  fontSize: '0.80rem',
                  fontWeight: 700,
                  cursor: 'pointer',
                  backgroundColor: isActive ? brand.buttonBg : 'transparent',
                  color: isActive ? tokens.onPrimary : tokens.textSecondary,
                  boxShadow: isActive ? tokens.cardShadow : 'none',
                  transition: 'all 0.15s ease',
                }}
              >
                {tab.label}
              </button>
            );
          })}
        </div>
      </div>

      {/* Document Title & Export Actions Row */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          flexWrap: 'wrap',
          gap: 12,
          padding: '10px 24px',
          backgroundColor: tokens.bgSurface,
          borderBottom: `1px solid ${tokens.borderSubtle}`,
        }}
      >
        <div>
          <div style={{ fontSize: '0.92rem', fontWeight: 800, color: tokens.textPrimary }}>
            {documentTitle}
          </div>
          {subtitle && (
            <div style={{ fontSize: '0.72rem', color: tokens.textSecondary }}>{subtitle}</div>
          )}
        </div>

        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 8,
            flexWrap: 'wrap',
            position: 'relative',
          }}
        >
          <button type="button" onClick={onOpenPageSetup} style={ui.btnSecondary}>
            <Settings size={14} />
            <span>Page Setup</span>
          </button>

          <div ref={dropdownRef} style={{ position: 'relative' }}>
            <button
              type="button"
              aria-haspopup="true"
              aria-expanded={menuOpen}
              onClick={() => setMenuOpen((prev) => !prev)}
              style={ui.btnSecondary}
            >
              <FileSpreadsheet size={14} />
              <span>Export Formats</span>
            </button>

            {menuOpen && (
              <div
                style={{
                  position: 'absolute',
                  right: 0,
                  top: 'calc(100% + 6px)',
                  zIndex: 50,
                  minWidth: 210,
                  backgroundColor: tokens.bgSurface,
                  border: `1px solid ${tokens.borderStrong}`,
                  borderRadius: 8,
                  boxShadow: tokens.cardShadow,
                  padding: 6,
                  display: 'flex',
                  flexDirection: 'column',
                  gap: 2,
                }}
              >
                {menuActions.map((item) => (
                  <button
                    key={item.label}
                    type="button"
                    onClick={() => {
                      setMenuOpen(false);
                      item.fn();
                    }}
                    style={{
                      textAlign: 'left',
                      padding: '7px 10px',
                      borderRadius: 6,
                      border: 'none',
                      background: 'transparent',
                      color: tokens.textPrimary,
                      fontSize: '0.76rem',
                      fontWeight: 600,
                      cursor: 'pointer',
                    }}
                  >
                    {item.label}
                  </button>
                ))}
              </div>
            )}
          </div>

          <button
            type="button"
            onClick={onSavePdf}
            disabled={isSavingPdf}
            style={ui.btnSecondary}
          >
            {isSavingPdf ? (
              <Loader2 size={14} className="animate-spin" />
            ) : (
              <Download size={14} color={brand.primary} />
            )}
            <span>{isSavingPdf ? 'Saving PDF...' : 'Export PDF'}</span>
          </button>

          <button type="button" onClick={onPrint} style={ui.btnPrimary}>
            <Printer size={14} />
            <span>Print</span>
          </button>
        </div>
      </div>
    </div>
  );
};

export interface ReportViewerShellProps {
  loading: boolean;
  loadingMessage: string;
  error: string | null;
  hasData: boolean;
  isPrinting: boolean;
  isExportingPdf: boolean;
  pageWidthInches: number;
  pageHeightInches: number;
  pageConfig: PageSetupConfig;
  sheetClassName: string;
  documentId: string;
  reportRef: React.RefObject<HTMLDivElement | null>;
  leftToolbarContent?: React.ReactNode;
  children: React.ReactNode;
}

const sanitizeCssToken = (raw: string, fallback: string): string => {
  const cleaned = String(raw || '').replace(/[^a-zA-Z0-9_-]/g, '');
  return cleaned || fallback;
};

const sanitizePageColor = (raw?: string): string => {
  if (raw && /^#[0-9a-fA-F]{6}$/.test(raw.trim())) {
    return raw.trim();
  }
  return SEAL_COLORS.white;
};

export const ReportViewerShell: React.FC<ReportViewerShellProps> = ({
  loading,
  loadingMessage,
  error,
  hasData,
  isPrinting,
  isExportingPdf,
  pageWidthInches,
  pageHeightInches,
  pageConfig,
  sheetClassName,
  documentId,
  reportRef,
  leftToolbarContent,
  children,
}) => {
  const { tokens, brand } = useTheme();
  const [zoomScale, setZoomScale] = useState<number>(1);
  const [fitToWidth, setFitToWidth] = useState<boolean>(true);
  const viewportRef = useRef<HTMLDivElement>(null);

  const safeDocId = sanitizeCssToken(documentId, 'report-print-document');
  const safeSheetClass = sanitizeCssToken(sheetClassName, 'report-sheet-page');
  const safePageColor = sanitizePageColor(pageConfig.pageColor);

  const updateFitScale = useCallback(() => {
    if (!viewportRef.current) return;
    const containerWidth = viewportRef.current.clientWidth - 48;
    const targetWidth = pageWidthInches * 96;
    if (containerWidth > 0 && targetWidth > 0) {
      const scale = containerWidth / targetWidth;
      setZoomScale(Number(Math.min(1.15, Math.max(0.35, scale)).toFixed(3)));
    }
  }, [pageWidthInches]);

  useEffect(() => {
    if (fitToWidth && !isPrinting && !isExportingPdf) {
      const timer = setTimeout(updateFitScale, 50);
      window.addEventListener('resize', updateFitScale);
      return () => {
        clearTimeout(timer);
        window.removeEventListener('resize', updateFitScale);
      };
    }
  }, [fitToWidth, isPrinting, isExportingPdf, updateFitScale, hasData, pageConfig]);

  return (
    <>
      <div
        className="no-print"
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '8px 24px',
          flexWrap: 'wrap',
          gap: 10,
          backgroundColor: tokens.bgSurface,
          borderBottom: `1px solid ${tokens.borderSubtle}`,
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
          {leftToolbarContent}
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <button
            type="button"
            onClick={() => {
              setFitToWidth(true);
              updateFitScale();
            }}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 5,
              padding: '4px 10px',
              borderRadius: 6,
              cursor: 'pointer',
              fontSize: '0.76rem',
              fontWeight: 700,
              backgroundColor: fitToWidth ? tokens.primaryLight : tokens.bgSurfaceSubtle,
              border: `1px solid ${fitToWidth ? brand.primary : tokens.borderStrong}`,
              color: fitToWidth ? brand.primary : tokens.textSecondary,
            }}
          >
            <Maximize2 size={13} /> Fit Screen ({Math.round(zoomScale * 100)}%)
          </button>

          <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
            <button
              type="button"
              aria-label="Zoom out"
              onClick={() => {
                setFitToWidth(false);
                setZoomScale((prev) => Math.max(0.35, Number((prev - 0.05).toFixed(2))));
              }}
              style={{
                padding: '4px 8px',
                borderRadius: 6,
                cursor: 'pointer',
                backgroundColor: tokens.bgSurfaceSubtle,
                border: `1px solid ${tokens.borderStrong}`,
                color: tokens.textPrimary,
              }}
            >
              <ZoomOut size={13} />
            </button>
            <span
              style={{
                minWidth: 42,
                textAlign: 'center',
                fontWeight: 700,
                fontSize: '0.76rem',
                color: tokens.textPrimary,
              }}
            >
              {Math.round(zoomScale * 100)}%
            </span>
            <button
              type="button"
              aria-label="Zoom in"
              onClick={() => {
                setFitToWidth(false);
                setZoomScale((prev) => Math.min(1.4, Number((prev + 0.05).toFixed(2))));
              }}
              style={{
                padding: '4px 8px',
                borderRadius: 6,
                cursor: 'pointer',
                backgroundColor: tokens.bgSurfaceSubtle,
                border: `1px solid ${tokens.borderStrong}`,
                color: tokens.textPrimary,
              }}
            >
              <ZoomIn size={13} />
            </button>
          </div>
        </div>
      </div>

      <div
        ref={viewportRef}
        className="report-viewer-viewport"
        style={{
          flex: 1,
          overflowY: 'auto',
          overflowX: 'auto',
          padding: '16px 20px',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          width: '100%',
          boxSizing: 'border-box',
        }}
      >
        {loading ? (
          <div
            style={{
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              gap: 12,
              marginTop: 80,
              fontWeight: 600,
              color: tokens.textSecondary,
            }}
          >
            <Loader2 className="animate-spin" size={28} color={brand.primary} />
            <span>{loadingMessage}</span>
          </div>
        ) : error ? (
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 8,
              marginTop: 80,
              fontWeight: 600,
              padding: '12px 20px',
              borderRadius: 8,
              color: brand.danger,
              backgroundColor: tokens.dangerLight,
              border: `1px solid ${brand.danger}`,
            }}
          >
            <AlertCircle size={24} color={brand.danger} />
            <span>{error}</span>
          </div>
        ) : hasData ? (
          <div
            style={{
              width: isPrinting ? '100%' : `${pageWidthInches * zoomScale}in`,
              maxWidth: '100%',
              margin: '0 auto',
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
            }}
          >
            <div
              style={{
                transform: isPrinting ? 'none' : `scale(${zoomScale})`,
                transformOrigin: 'top center',
                width: isPrinting ? '100%' : `${pageWidthInches}in`,
                minWidth: isPrinting ? '100%' : `${pageWidthInches}in`,
                transition: isPrinting ? 'none' : 'transform 0.15s ease-out',
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
              }}
            >
              <div
                id={safeDocId}
                ref={reportRef}
                style={{
                  width: '100%',
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center',
                }}
              >
                {children}
              </div>
            </div>
          </div>
        ) : null}
      </div>

      <style>{`
        @media print {
          @page {
            size: ${pageWidthInches}in ${pageHeightInches}in;
            margin: 0 !important;
          }
          .no-print, nav, aside, header, footer, button, input, select {
            display: none !important;
          }
          html, body, #root, #root > div, main, .report-tab-root, .report-viewer-viewport {
            margin: 0 !important;
            padding: 0 !important;
            width: 100% !important;
            min-width: 100% !important;
            max-width: 100% !important;
            height: auto !important;
            min-height: 0 !important;
            overflow: visible !important;
            display: block !important;
            background: ${SEAL_COLORS.white} !important;
            background-color: ${SEAL_COLORS.white} !important;
            -webkit-print-color-adjust: exact !important;
            print-color-adjust: exact !important;
          }
          * {
            -webkit-transform: none !important;
            transform: none !important;
            zoom: 1 !important;
          }
          #${safeDocId} {
            width: 100% !important;
            max-width: 100% !important;
            min-width: 100% !important;
            margin: 0 auto !important;
            padding: 0 !important;
            display: block !important;
          }
          .${safeSheetClass} {
            width: ${pageWidthInches}in !important;
            max-width: ${pageWidthInches}in !important;
            min-width: ${pageWidthInches}in !important;
            min-height: ${pageConfig.layoutMode === 'pageless' ? 'auto' : `${pageHeightInches}in`} !important;
            box-sizing: border-box !important;
            margin: 0 auto !important;
            padding: ${pageConfig.margins.top}in ${pageConfig.margins.right}in ${pageConfig.margins.bottom}in ${pageConfig.margins.left}in !important;
            box-shadow: none !important;
            border: none !important;
            background-color: ${safePageColor} !important;
            page-break-after: ${pageConfig.layoutMode === 'pageless' ? 'auto' : 'always'} !important;
            break-after: ${pageConfig.layoutMode === 'pageless' ? 'auto' : 'page'} !important;
          }
          .${safeSheetClass}:last-child {
            page-break-after: avoid !important;
            break-after: avoid !important;
          }
          table {
            width: 100% !important;
            max-width: 100% !important;
            table-layout: fixed !important;
            page-break-inside: auto;
          }
          tr {
            page-break-inside: avoid !important;
            break-inside: avoid !important;
          }
        }
      `}</style>
    </>
  );
};

export default ReportViewerShell;