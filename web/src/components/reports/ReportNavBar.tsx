/**
 * AttendSure - Official Reports Navigation & Export Action Bar (Theme Adaptive)
 * File: web/src/components/reports/ReportNavBar.tsx
 */

import React, { useState, useRef, useEffect, useMemo } from 'react';
import { useTheme } from '../../context/ThemeContext';
import {
  FileText,
  CalendarCheck,
  Download,
  ChevronDown,
  Printer,
  SlidersHorizontal,
  FileSpreadsheet,
  ExternalLink,
  Table as TableIcon,
  FileCode,
  Loader2,
  RefreshCw,
  Search,
  X,
  Maximize2,
  Calendar,
} from 'lucide-react';

export interface ReportTabItem {
  id: string;
  label: string;
  icon?: React.ComponentType<{ size?: number; className?: string }>;
}

export interface SectionOption {
  id: number | string;
  name: string;
  grade_level?: any;
  academic_year?: string;
  adviser_name?: string;
  display_label?: string;
}

export interface ReportExportHandlers {
  onExportPdf?: () => void | Promise<void>;
  onExportExcel?: () => void | Promise<void>;
  onExportGoogleSheets?: () => void | Promise<void>;
  onExportWord?: () => void | Promise<void>;
  onExportGoogleDocs?: () => void | Promise<void>;
  onExportCsv?: () => void | Promise<void>;
  onExportJson?: () => void | Promise<void>;
}

export type LayoutMode = 'pages' | 'pageless';

export interface ReportNavBarProps {
  reports?: ReportTabItem[];
  activeReportId: string;
  onSelectReport: (reportId: string) => void;
  academicYears?: string[];
  selectedAcademicYear?: string;
  onAcademicYearChange?: (year: string) => void;
  showAcademicYearFilter?: boolean;
  gradeLevels?: string[];
  selectedGradeLevel?: string;
  onGradeLevelChange?: (grade: string) => void;
  showGradeLevelFilter?: boolean;
  sections: SectionOption[];
  selectedSectionId: string | number;
  onSectionChange: (sectionId: string) => void;
  showSectionFilter?: boolean;
  showDateFilter?: boolean;
  selectedDate?: string;
  onDateChange?: (date: string) => void;
  showMonthFilter?: boolean;
  selectedMonth?: string;
  onMonthChange?: (month: string) => void;
  monthsList?: string[];
  showCalendarYearFilter?: boolean;
  selectedCalendarYear?: number;
  onCalendarYearChange?: (year: number) => void;
  searchQuery?: string;
  onSearchChange?: (query: string) => void;
  showSearch?: boolean;
  layoutMode?: LayoutMode;
  onToggleLayoutMode?: (mode: LayoutMode) => void;
  showLayoutModeToggle?: boolean;
  onRefresh?: () => void;
  isRefreshing?: boolean;
  onOpenPageSetup?: () => void;
  exportHandlers?: ReportExportHandlers;
  onPrint?: () => void;
  isExporting?: boolean;
  exportingText?: string;
  disableActions?: boolean;
}

const DEFAULT_REPORTS: ReportTabItem[] = [
  { id: 'sf1', label: 'Form 1 (School Register)', icon: FileText },
  { id: 'sf2', label: 'Form 2 (Daily Attendance)', icon: CalendarCheck },
  { id: 'sf4', label: 'Form 4 (Monthly Movement)', icon: FileSpreadsheet },
];

const DEFAULT_MONTHS = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December'
];

const getCurrentMonthName = (): string => {
  try {
    return new Intl.DateTimeFormat('en-US', { month: 'long' }).format(new Date());
  } catch {
    return 'January';
  }
};

const extractGradeLevelName = (val: any): string => {
  if (val === null || val === undefined) return '';
  if (typeof val === 'string') return val.trim();
  if (typeof val === 'number') return `Grade ${val}`;
  if (typeof val === 'object') {
    const name = val.name || val.level || val.grade_name || val.grade || val.id;
    return name !== undefined && name !== null ? String(name).trim() : '';
  }
  return String(val).trim();
};

export const ReportNavBar: React.FC<ReportNavBarProps> = ({
  reports = DEFAULT_REPORTS,
  activeReportId,
  onSelectReport,
  academicYears = [],
  selectedAcademicYear = '',
  onAcademicYearChange,
  showAcademicYearFilter = false,
  gradeLevels = [],
  selectedGradeLevel = 'ALL',
  onGradeLevelChange,
  showGradeLevelFilter = true,
  sections = [],
  selectedSectionId,
  onSectionChange,
  showSectionFilter = true,
  showDateFilter = false,
  selectedDate = '',
  onDateChange,
  showMonthFilter = false,
  selectedMonth = getCurrentMonthName(),
  onMonthChange,
  monthsList = DEFAULT_MONTHS,
  showCalendarYearFilter = false,
  selectedCalendarYear = new Date().getFullYear(),
  onCalendarYearChange,
  searchQuery = '',
  onSearchChange,
  showSearch = true,
  layoutMode = 'pages',
  onToggleLayoutMode,
  showLayoutModeToggle = true,
  onRefresh,
  isRefreshing = false,
  onOpenPageSetup,
  exportHandlers,
  onPrint,
  isExporting = false,
  exportingText = 'Exporting...',
  disableActions = false,
}) => {
  const { tokens, brand } = useTheme();
  const [isExportDropdownOpen, setIsExportDropdownOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  const userRole = (localStorage.getItem('attendsure_role') || '').toUpperCase();
  const isAdminOrPrincipal = userRole === 'ADMIN' || userRole === 'PRINCIPAL';

  const filteredReports = useMemo(() => {
    return reports.filter((rep) => {
      if (rep.id === 'sf4' && !isAdminOrPrincipal) return false;
      return true;
    });
  }, [reports, isAdminOrPrincipal]);

  useEffect(() => {
    if (!isExportDropdownOpen) return;

    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsExportDropdownOpen(false);
      }
    };

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setIsExportDropdownOpen(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    window.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [isExportDropdownOpen]);

  const filteredSections = useMemo(() => {
    if (!selectedGradeLevel || selectedGradeLevel === 'ALL') {
      return sections;
    }
    return sections.filter((sec) => {
      const g = extractGradeLevelName(sec.grade_level).toLowerCase();
      const target = selectedGradeLevel.toLowerCase().trim();
      return g === target || g.includes(target);
    });
  }, [sections, selectedGradeLevel]);

  const availableGradeLevels = useMemo(() => {
    if (gradeLevels && gradeLevels.length > 0) {
      return gradeLevels
        .map(extractGradeLevelName)
        .filter(Boolean)
        .sort((a, b) => String(a).localeCompare(String(b), undefined, { numeric: true, sensitivity: 'base' }));
    }
    const extracted = Array.from(
      new Set(
        sections
          .map((s) => extractGradeLevelName(s?.grade_level))
          .filter(Boolean)
      )
    );
    return extracted.sort((a, b) =>
      String(a).localeCompare(String(b), undefined, { numeric: true, sensitivity: 'base' })
    );
  }, [gradeLevels, sections]);

  const handleExportAction = (action?: () => void | Promise<void>) => {
    setIsExportDropdownOpen(false);
    if (action) action();
  };

  return (
    <div className="no-print" style={{ display: 'flex', flexDirection: 'column', width: '100%', flexShrink: 0, backgroundColor: tokens.bgSurface, boxSizing: 'border-box' }}>
      {/* 1. Form Type Selector Tabs */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '10px 24px', backgroundColor: tokens.bgSurface, borderBottom: `1px solid ${tokens.borderSubtle}` }}>
        <span style={{ fontSize: '0.74rem', fontWeight: 800, color: tokens.textMuted, letterSpacing: '0.4px', textTransform: 'uppercase' }}>
          REPORT FORM:
        </span>
        <div style={{ display: 'flex', gap: 6, backgroundColor: tokens.bgSurfaceSubtle, padding: '4px', borderRadius: 10, border: `1px solid ${tokens.borderSubtle}` }}>
          {filteredReports.map((rep) => {
            const Icon = rep.icon;
            const isActive = rep.id === activeReportId;
            return (
              <button
                key={rep.id}
                type="button"
                onClick={() => onSelectReport(rep.id)}
                style={{
                  padding: '6px 14px',
                  borderRadius: 8,
                  border: 'none',
                  fontSize: '0.80rem',
                  fontWeight: 700,
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  gap: 6,
                  backgroundColor: isActive ? brand.primary : 'transparent',
                  color: isActive ? '#FFFFFF' : tokens.textSecondary,
                  boxShadow: isActive ? tokens.cardShadow : 'none',
                  transition: 'all 0.15s ease',
                }}
              >
                {Icon && <Icon size={15} />}
                <span>{rep.label}</span>
              </button>
            );
          })}
        </div>
      </div>

      {/* 2. Filters & Action Buttons */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '10px 24px', backgroundColor: tokens.bgSurface, borderBottom: `1px solid ${tokens.borderSubtle}`, flexWrap: 'wrap', gap: 12 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
          {showAcademicYearFilter && onAcademicYearChange && academicYears.length > 0 && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <span style={{ fontSize: '0.78rem', fontWeight: 700, color: tokens.textPrimary }}>School Year:</span>
              <select
                value={selectedAcademicYear}
                onChange={(e) => onAcademicYearChange(e.target.value)}
                style={{ padding: '6px 10px', borderRadius: 6, border: `1px solid ${tokens.borderStrong}`, fontSize: '0.80rem', fontWeight: 600, backgroundColor: tokens.bgSurfaceSubtle, color: tokens.textPrimary, outline: 'none' }}
              >
                {!selectedAcademicYear && <option value="">-- Select S.Y. --</option>}
                {academicYears.map((sy) => (
                  <option key={sy} value={sy}>{sy}</option>
                ))}
              </select>
            </div>
          )}

          {showGradeLevelFilter && onGradeLevelChange && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <span style={{ fontSize: '0.78rem', fontWeight: 700, color: tokens.textPrimary }}>Grade Level:</span>
              <select
                value={selectedGradeLevel}
                onChange={(e) => onGradeLevelChange(e.target.value)}
                style={{ padding: '6px 10px', borderRadius: 6, border: `1px solid ${tokens.borderStrong}`, fontSize: '0.80rem', fontWeight: 600, backgroundColor: tokens.bgSurfaceSubtle, color: tokens.textPrimary, outline: 'none' }}
              >
                <option value="ALL">All Grades</option>
                {availableGradeLevels.map((g) => (
                  <option key={g} value={g}>{g}</option>
                ))}
              </select>
            </div>
          )}

          {showSectionFilter && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <span style={{ fontSize: '0.78rem', fontWeight: 700, color: tokens.textPrimary }}>Section:</span>
              <select
                value={String(selectedSectionId ?? '')}
                onChange={(e) => onSectionChange(e.target.value)}
                style={{ padding: '6px 10px', borderRadius: 6, border: `1px solid ${tokens.borderStrong}`, fontSize: '0.80rem', fontWeight: 600, backgroundColor: tokens.bgSurfaceSubtle, color: tokens.textPrimary, outline: 'none' }}
              >
                {!selectedSectionId && <option value="">-- Choose Section --</option>}
                {filteredSections.length === 0 ? (
                  <option value="" disabled>No sections available</option>
                ) : (
                  filteredSections.map((sec) => {
                    const gradeStr = extractGradeLevelName(sec.grade_level);
                    return (
                      <option key={sec.id} value={String(sec.id)}>
                        {sec.display_label || `${gradeStr ? `${gradeStr} - ` : ''}${sec.name}${sec.adviser_name ? ` (${sec.adviser_name})` : ''}`}
                      </option>
                    );
                  })
                )}
              </select>
            </div>
          )}

          {showDateFilter && onDateChange && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <span style={{ fontSize: '0.78rem', fontWeight: 700, color: tokens.textPrimary }}>Date:</span>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '4px 8px', borderRadius: 6, border: `1px solid ${tokens.borderStrong}`, backgroundColor: tokens.bgSurfaceSubtle }}>
                <Calendar size={13} color={tokens.textMuted} />
                <input
                  type="date"
                  value={selectedDate}
                  onChange={(e) => onDateChange(e.target.value)}
                  style={{ border: 'none', outline: 'none', background: 'transparent', fontSize: '0.80rem', fontWeight: 600, color: tokens.textPrimary }}
                />
              </div>
            </div>
          )}

          {showMonthFilter && onMonthChange && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <span style={{ fontSize: '0.78rem', fontWeight: 700, color: tokens.textPrimary }}>Month:</span>
              <select
                value={selectedMonth}
                onChange={(e) => onMonthChange(e.target.value)}
                style={{ padding: '6px 10px', borderRadius: 6, border: `1px solid ${tokens.borderStrong}`, fontSize: '0.80rem', fontWeight: 600, backgroundColor: tokens.bgSurfaceSubtle, color: tokens.textPrimary, outline: 'none' }}
              >
                {monthsList.map((m) => (
                  <option key={m} value={m}>{m}</option>
                ))}
              </select>
            </div>
          )}

          {showCalendarYearFilter && onCalendarYearChange && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <span style={{ fontSize: '0.78rem', fontWeight: 700, color: tokens.textPrimary }}>Year:</span>
              <input
                type="number"
                value={selectedCalendarYear || new Date().getFullYear()}
                onChange={(e) => onCalendarYearChange(Number(e.target.value) || new Date().getFullYear())}
                style={{ padding: '6px 10px', borderRadius: 6, border: `1px solid ${tokens.borderStrong}`, fontSize: '0.80rem', fontWeight: 600, backgroundColor: tokens.bgSurfaceSubtle, color: tokens.textPrimary, outline: 'none', width: 80 }}
              />
            </div>
          )}

          {showSearch && onSearchChange && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '5px 10px', borderRadius: 6, border: `1px solid ${tokens.borderStrong}`, backgroundColor: tokens.bgSurfaceSubtle, width: 200 }}>
              <Search size={14} color={tokens.textMuted} />
              <input
                type="text"
                value={searchQuery}
                placeholder="Search name or LRN..."
                onChange={(e) => onSearchChange(e.target.value)}
                style={{ border: 'none', outline: 'none', background: 'transparent', fontSize: '0.78rem', width: '100%', color: tokens.textPrimary }}
              />
              {searchQuery && (
                <button
                  type="button"
                  onClick={() => onSearchChange('')}
                  style={{ border: 'none', background: 'transparent', cursor: 'pointer', padding: 0 }}
                  title="Clear search"
                >
                  <X size={13} color={tokens.textMuted} />
                </button>
              )}
            </div>
          )}
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
          {onRefresh && (
            <button
              type="button"
              onClick={onRefresh}
              disabled={isRefreshing}
              title="Refresh Record from Database"
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 6,
                padding: '6px 12px',
                backgroundColor: tokens.bgSurfaceSubtle,
                border: `1px solid ${tokens.borderStrong}`,
                borderRadius: 6,
                fontSize: '0.80rem',
                fontWeight: 700,
                color: tokens.textPrimary,
                cursor: 'pointer',
              }}
            >
              <RefreshCw size={14} className={isRefreshing ? 'animate-spin' : ''} />
              <span>Refresh</span>
            </button>
          )}

          {showLayoutModeToggle && onToggleLayoutMode && (
            <button
              type="button"
              onClick={() => onToggleLayoutMode(layoutMode === 'pageless' ? 'pages' : 'pageless')}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 6,
                padding: '6px 12px',
                backgroundColor: layoutMode === 'pageless' ? tokens.primaryLight : tokens.bgSurfaceSubtle,
                border: `1px solid ${layoutMode === 'pageless' ? brand.primary : tokens.borderStrong}`,
                borderRadius: 6,
                fontSize: '0.80rem',
                fontWeight: 700,
                color: layoutMode === 'pageless' ? brand.primary : tokens.textPrimary,
                cursor: 'pointer',
              }}
            >
              {layoutMode === 'pageless' ? <Maximize2 size={14} /> : <FileText size={14} />}
              <span>{layoutMode === 'pageless' ? 'Pageless' : 'Pages'}</span>
            </button>
          )}

          {onOpenPageSetup && (
            <button
              type="button"
              onClick={onOpenPageSetup}
              disabled={disableActions}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 6,
                padding: '6px 12px',
                backgroundColor: tokens.bgSurfaceSubtle,
                border: `1px solid ${tokens.borderStrong}`,
                borderRadius: 6,
                fontSize: '0.80rem',
                fontWeight: 700,
                color: tokens.textPrimary,
                cursor: 'pointer',
              }}
            >
              <SlidersHorizontal size={14} />
              <span>Page Setup</span>
            </button>
          )}

          {exportHandlers && (
            <div style={{ position: 'relative' }} ref={dropdownRef}>
              <button
                type="button"
                onClick={() => setIsExportDropdownOpen((prev) => !prev)}
                disabled={disableActions || isExporting}
                aria-haspopup="true"
                aria-expanded={isExportDropdownOpen}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 6,
                  padding: '6px 12px',
                  backgroundColor: 'rgba(16, 185, 129, 0.12)',
                  border: '1px solid rgba(16, 185, 129, 0.28)',
                  borderRadius: 6,
                  fontSize: '0.80rem',
                  fontWeight: 700,
                  color: brand.success,
                  cursor: 'pointer',
                }}
              >
                {isExporting ? (
                  <>
                    <Loader2 size={14} className="animate-spin" />
                    <span>{exportingText}</span>
                  </>
                ) : (
                  <>
                    <Download size={14} />
                    <span>Download Report</span>
                    <ChevronDown size={13} />
                  </>
                )}
              </button>

              {isExportDropdownOpen && (
                <div style={{ position: 'absolute', top: 'calc(100% + 6px)', right: 0, width: 270, backgroundColor: tokens.bgSurface, borderRadius: 10, boxShadow: tokens.cardShadow, border: `1px solid ${tokens.borderSubtle}`, padding: '6px 0', zIndex: 1000, display: 'flex', flexDirection: 'column' }}>
                  {exportHandlers.onExportPdf && (
                    <>
                      <div style={{ padding: '6px 14px 2px 14px', fontSize: '0.62rem', fontWeight: 800, color: tokens.textMuted, letterSpacing: '0.5px' }}>FILE DOWNLOADS</div>
                      <button
                        type="button"
                        onClick={() => handleExportAction(exportHandlers.onExportPdf)}
                        style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 14px', border: 'none', backgroundColor: 'transparent', cursor: 'pointer', fontSize: '0.78rem', textAlign: 'left', width: '100%', color: tokens.textPrimary }}
                      >
                        <Download size={15} color={brand.primary} />
                        <div style={{ flex: 1, textAlign: 'left' }}>
                          <div style={{ fontWeight: 700, color: tokens.textPrimary }}>Adobe PDF (.pdf)</div>
                          <div style={{ fontSize: '0.68rem', color: tokens.textMuted }}>Official Document Format</div>
                        </div>
                      </button>
                    </>
                  )}

                  {(exportHandlers.onExportExcel || exportHandlers.onExportGoogleSheets) && (
                    <>
                      <div style={{ padding: '6px 14px 2px 14px', fontSize: '0.62rem', fontWeight: 800, color: tokens.textMuted, letterSpacing: '0.5px' }}>OFFICIAL SPREADSHEETS</div>
                      {exportHandlers.onExportExcel && (
                        <button
                          type="button"
                          onClick={() => handleExportAction(exportHandlers.onExportExcel)}
                          style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 14px', border: 'none', backgroundColor: 'transparent', cursor: 'pointer', fontSize: '0.78rem', textAlign: 'left', width: '100%', color: tokens.textPrimary }}
                        >
                          <FileSpreadsheet size={15} color={brand.success} />
                          <div style={{ flex: 1, textAlign: 'left' }}>
                            <div style={{ fontWeight: 700, color: tokens.textPrimary }}>Microsoft Excel (.xlsx)</div>
                            <div style={{ fontSize: '0.68rem', color: tokens.textMuted }}>Formatted DepEd spreadsheet</div>
                          </div>
                        </button>
                      )}
                      {exportHandlers.onExportGoogleSheets && (
                        <button
                          type="button"
                          onClick={() => handleExportAction(exportHandlers.onExportGoogleSheets)}
                          style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 14px', border: 'none', backgroundColor: 'transparent', cursor: 'pointer', fontSize: '0.78rem', textAlign: 'left', width: '100%', color: tokens.textPrimary }}
                        >
                          <ExternalLink size={15} color={brand.success} />
                          <div style={{ flex: 1, textAlign: 'left' }}>
                            <div style={{ fontWeight: 700, color: tokens.textPrimary }}>Google Sheets</div>
                            <div style={{ fontSize: '0.68rem', color: tokens.textMuted }}>Opens in web spreadsheet</div>
                          </div>
                        </button>
                      )}
                    </>
                  )}

                  {(exportHandlers.onExportCsv || exportHandlers.onExportJson) && (
                    <>
                      <div style={{ padding: '6px 14px 2px 14px', fontSize: '0.62rem', fontWeight: 800, color: tokens.textMuted, letterSpacing: '0.5px' }}>DATA EXCHANGE</div>
                      {exportHandlers.onExportCsv && (
                        <button
                          type="button"
                          onClick={() => handleExportAction(exportHandlers.onExportCsv)}
                          style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 14px', border: 'none', backgroundColor: 'transparent', cursor: 'pointer', fontSize: '0.78rem', textAlign: 'left', width: '100%', color: tokens.textPrimary }}
                        >
                          <TableIcon size={15} color={brand.warning} />
                          <div style={{ flex: 1, textAlign: 'left' }}>
                            <div style={{ fontWeight: 700, color: tokens.textPrimary }}>LIS CSV Spreadsheet (.csv)</div>
                            <div style={{ fontSize: '0.68rem', color: tokens.textMuted }}>Standard DepEd data exchange</div>
                          </div>
                        </button>
                      )}
                      {exportHandlers.onExportJson && (
                        <button
                          type="button"
                          onClick={() => handleExportAction(exportHandlers.onExportJson)}
                          style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 14px', border: 'none', backgroundColor: 'transparent', cursor: 'pointer', fontSize: '0.78rem', textAlign: 'left', width: '100%', color: tokens.textPrimary }}
                        >
                          <FileCode size={15} color={brand.secondary} />
                          <div style={{ flex: 1, textAlign: 'left' }}>
                            <div style={{ fontWeight: 700, color: tokens.textPrimary }}>Raw JSON Data (.json)</div>
                            <div style={{ fontSize: '0.68rem', color: tokens.textMuted }}>Database export &amp; backup</div>
                          </div>
                        </button>
                      )}
                    </>
                  )}
                </div>
              )}
            </div>
          )}

          {onPrint && (
            <button
              type="button"
              onClick={onPrint}
              disabled={disableActions}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 6,
                padding: '6px 16px',
                backgroundColor: brand.primary,
                border: 'none',
                borderRadius: 6,
                fontSize: '0.80rem',
                fontWeight: 700,
                color: '#FFFFFF',
                cursor: 'pointer',
              }}
            >
              <Printer size={15} />
              <span>Print</span>
            </button>
          )}
        </div>
      </div>
    </div>
  );
};

export default ReportNavBar;