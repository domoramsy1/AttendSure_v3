import React, { useState, useRef, useEffect, useMemo } from 'react';
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
  grade_level?: string;
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
  // 1. Report Form Selector Tabs
  reports?: ReportTabItem[];
  activeReportId: string;
  onSelectReport: (reportId: string) => void;

  // 2. School Year / Academic Year Filter
  academicYears?: string[];
  selectedAcademicYear?: string;
  onAcademicYearChange?: (year: string) => void;
  showAcademicYearFilter?: boolean;

  // 3. Grade Level Filter
  gradeLevels?: string[];
  selectedGradeLevel?: string;
  onGradeLevelChange?: (grade: string) => void;
  showGradeLevelFilter?: boolean;

  // 4. Section Filter (Cascades with Grade Level)
  sections: SectionOption[];
  selectedSectionId: string | number;
  onSectionChange: (sectionId: string) => void;
  showSectionFilter?: boolean;

  // 5. Specific Date Filter (For daily logs or specific date reports)
  showDateFilter?: boolean;
  selectedDate?: string;
  onDateChange?: (date: string) => void;

  // 6. Month & Calendar Year Filter (SF2 & monthly forms)
  showMonthFilter?: boolean;
  selectedMonth?: string;
  onMonthChange?: (month: string) => void;
  monthsList?: string[];

  showCalendarYearFilter?: boolean;
  selectedCalendarYear?: number;
  onCalendarYearChange?: (year: number) => void;

  // 7. In-Report Learner Search (by Name or LRN)
  searchQuery?: string;
  onSearchChange?: (query: string) => void;
  showSearch?: boolean;

  // 8. Direct Pages vs. Pageless Layout Toggle
  layoutMode?: LayoutMode;
  onToggleLayoutMode?: (mode: LayoutMode) => void;
  showLayoutModeToggle?: boolean;

  // 9. Actions (Refresh, Page Setup, Download, Print)
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
];

const DEFAULT_MONTHS = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December'
];

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
  selectedMonth = 'October',
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
  exportingText = 'Preparing PDF...',
  disableActions = false,
}) => {
  const [isExportDropdownOpen, setIsExportDropdownOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  // Close dropdown on outside click
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsExportDropdownOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Filter sections dynamically when a specific grade level is selected
  const filteredSections = useMemo(() => {
    if (!selectedGradeLevel || selectedGradeLevel === 'ALL') {
      return sections;
    }
    return sections.filter((sec) => {
      const g = (sec.grade_level || '').toLowerCase().trim();
      const target = selectedGradeLevel.toLowerCase().trim();
      return g === target || g.includes(target);
    });
  }, [sections, selectedGradeLevel]);

  // Extract unique grade levels dynamically if none were passed
  const availableGradeLevels = useMemo(() => {
    if (gradeLevels.length > 0) return gradeLevels;
    const extracted = Array.from(new Set(sections.map((s) => s.grade_level).filter(Boolean))) as string[];
    return extracted.sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));
  }, [gradeLevels, sections]);

  const handleExportAction = (action?: () => void | Promise<void>) => {
    setIsExportDropdownOpen(false);
    if (action) action();
  };

  return (
    <div className="no-print" style={navBarWrapperStyle}>
      {/* ======================================================== */}
      {/* TIER 1: REPORT FORM TABS                                 */}
      {/* ======================================================== */}
      <div style={topTabBarStyle}>
        <span style={reportFormLabelStyle}>REPORT FORM:</span>
        <div style={pillContainerStyle}>
          {reports.map((rep) => {
            const Icon = rep.icon;
            const isActive = rep.id === activeReportId;
            return (
              <button
                key={rep.id}
                type="button"
                onClick={() => onSelectReport(rep.id)}
                style={{
                  ...tabButtonStyle,
                  backgroundColor: isActive ? '#ffffff' : 'transparent',
                  color: isActive ? '#0284c7' : '#64748b',
                  boxShadow: isActive ? '0 1px 3px rgba(0,0,0,0.1)' : 'none',
                }}
              >
                {Icon && <Icon size={15} />}
                <span>{rep.label}</span>
              </button>
            );
          })}
        </div>
      </div>

      {/* ======================================================== */}
      {/* TIER 2: ESSENTIAL ACADEMIC FILTERS & REPORT ACTIONS      */}
      {/* ======================================================== */}
      <div style={bottomActionBarStyle}>
        {/* Left Side: Filter Controls */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
          {/* 1. School Year Filter */}
          {showAcademicYearFilter && onAcademicYearChange && academicYears.length > 0 && (
            <div style={filterGroupStyle}>
              <span style={filterLabelStyle}>School Year:</span>
              <select
                value={selectedAcademicYear}
                onChange={(e) => onAcademicYearChange(e.target.value)}
                style={selectInputStyle}
              >
                {academicYears.map((sy) => (
                  <option key={sy} value={sy}>{sy}</option>
                ))}
              </select>
            </div>
          )}

          {/* 2. Grade Level Filter */}
          {showGradeLevelFilter && onGradeLevelChange && (
            <div style={filterGroupStyle}>
              <span style={filterLabelStyle}>Grade Level:</span>
              <select
                value={selectedGradeLevel}
                onChange={(e) => onGradeLevelChange(e.target.value)}
                style={selectInputStyle}
              >
                <option value="ALL">All Grades</option>
                {availableGradeLevels.map((g) => (
                  <option key={g} value={g}>{g}</option>
                ))}
              </select>
            </div>
          )}

          {/* 3. Class Section Filter */}
          {showSectionFilter && (
            <div style={filterGroupStyle}>
              <span style={filterLabelStyle}>Section:</span>
              <select
                value={String(selectedSectionId)}
                onChange={(e) => onSectionChange(e.target.value)}
                style={selectInputStyle}
              >
                {filteredSections.map((sec) => (
                  <option key={sec.id} value={sec.id}>
                    {sec.display_label || `${sec.grade_level ? `${sec.grade_level} - ` : ''}${sec.name}${sec.adviser_name ? ` (${sec.adviser_name})` : ''}`}
                  </option>
                ))}
              </select>
            </div>
          )}

          {/* 4. Specific Date Filter (if applicable) */}
          {showDateFilter && onDateChange && (
            <div style={filterGroupStyle}>
              <span style={filterLabelStyle}>Date:</span>
              <div style={dateInputWrapperStyle}>
                <Calendar size={13} color="#64748b" />
                <input
                  type="date"
                  value={selectedDate}
                  onChange={(e) => onDateChange(e.target.value)}
                  style={dateInputStyle}
                />
              </div>
            </div>
          )}

          {/* 5. Month Filter (e.g., SF2 Daily Attendance) */}
          {showMonthFilter && onMonthChange && (
            <div style={filterGroupStyle}>
              <span style={filterLabelStyle}>Month:</span>
              <select
                value={selectedMonth}
                onChange={(e) => onMonthChange(e.target.value)}
                style={selectInputStyle}
              >
                {monthsList.map((m) => (
                  <option key={m} value={m}>{m}</option>
                ))}
              </select>
            </div>
          )}

          {/* 6. Calendar Year Filter */}
          {showCalendarYearFilter && onCalendarYearChange && (
            <div style={filterGroupStyle}>
              <span style={filterLabelStyle}>Year:</span>
              <input
                type="number"
                value={selectedCalendarYear}
                onChange={(e) => onCalendarYearChange(Number(e.target.value))}
                style={{ ...selectInputStyle, width: 75 }}
              />
            </div>
          )}

          {/* 7. Quick Learner Search */}
          {showSearch && onSearchChange && (
            <div style={searchContainerStyle}>
              <Search size={14} color="#94a3b8" />
              <input
                type="text"
                value={searchQuery}
                placeholder="Search name or LRN..."
                onChange={(e) => onSearchChange(e.target.value)}
                style={searchInputStyle}
              />
              {searchQuery && (
                <button
                  type="button"
                  onClick={() => onSearchChange('')}
                  style={clearSearchBtnStyle}
                  title="Clear search"
                >
                  <X size={13} color="#94a3b8" />
                </button>
              )}
            </div>
          )}
        </div>

        {/* Right Side: Primary Actions */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          {/* Refresh Action */}
          {onRefresh && (
            <button
              type="button"
              onClick={onRefresh}
              disabled={isRefreshing}
              title="Refresh Record from Database"
              style={btnActionSecondaryStyle}
            >
              <RefreshCw size={14} className={isRefreshing ? 'animate-spin' : ''} />
              <span>Refresh</span>
            </button>
          )}

          {/* Direct Pages vs. Pageless Layout Toggle */}
          {showLayoutModeToggle && onToggleLayoutMode && (
            <button
              type="button"
              onClick={() => onToggleLayoutMode(layoutMode === 'pageless' ? 'pages' : 'pageless')}
              title={layoutMode === 'pageless' ? 'Switch to Paginated Sheets view' : 'Switch to Continuous Pageless view'}
              style={{
                ...btnActionSecondaryStyle,
                borderColor: layoutMode === 'pageless' ? '#0284c7' : '#cbd5e1',
                backgroundColor: layoutMode === 'pageless' ? '#f0f9ff' : '#f8fafc',
                color: layoutMode === 'pageless' ? '#0284c7' : '#334155',
              }}
            >
              {layoutMode === 'pageless' ? <Maximize2 size={14} /> : <FileText size={14} />}
              <span>{layoutMode === 'pageless' ? 'Pageless' : 'Pages'}</span>
            </button>
          )}

          {/* Page Setup Action */}
          {onOpenPageSetup && (
            <button
              type="button"
              onClick={onOpenPageSetup}
              disabled={disableActions}
              style={btnActionSecondaryStyle}
            >
              <SlidersHorizontal size={14} />
              <span>Page Setup</span>
            </button>
          )}

          {/* Download Report Dropdown (7 Standard Export Formats) */}
          {exportHandlers && (
            <div style={{ position: 'relative' }} ref={dropdownRef}>
              <button
                type="button"
                onClick={() => setIsExportDropdownOpen((prev) => !prev)}
                disabled={disableActions || isExporting}
                style={btnDownloadDropdownStyle}
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
                <div style={dropdownListStyle}>
                  {exportHandlers.onExportPdf && (
                    <>
                      <div style={dropdownCategoryHeaderStyle}>FILE DOWNLOADS</div>
                      <button
                        type="button"
                        onClick={() => handleExportAction(exportHandlers.onExportPdf)}
                        style={dropdownOptionButtonStyle}
                      >
                        <Download size={15} color="#0284c7" />
                        <div style={{ flex: 1, textAlign: 'left' }}>
                          <div style={{ fontWeight: 700, color: '#0f172a' }}>Adobe PDF (.pdf)</div>
                          <div style={{ fontSize: '0.68rem', color: '#64748b' }}>Legal Landscape Format</div>
                        </div>
                      </button>
                    </>
                  )}

                  {(exportHandlers.onExportExcel || exportHandlers.onExportGoogleSheets) && (
                    <>
                      <div style={dropdownCategoryHeaderStyle}>OFFICIAL SPREADSHEETS</div>
                      {exportHandlers.onExportExcel && (
                        <button
                          type="button"
                          onClick={() => handleExportAction(exportHandlers.onExportExcel)}
                          style={dropdownOptionButtonStyle}
                        >
                          <FileSpreadsheet size={15} color="#059669" />
                          <div style={{ flex: 1, textAlign: 'left' }}>
                            <div style={{ fontWeight: 700, color: '#0f172a' }}>Microsoft Excel (.xlsx / .xls)</div>
                            <div style={{ fontSize: '0.68rem', color: '#64748b' }}>Formatted DepEd spreadsheet</div>
                          </div>
                        </button>
                      )}
                      {exportHandlers.onExportGoogleSheets && (
                        <button
                          type="button"
                          onClick={() => handleExportAction(exportHandlers.onExportGoogleSheets)}
                          style={dropdownOptionButtonStyle}
                        >
                          <ExternalLink size={15} color="#16a34a" />
                          <div style={{ flex: 1, textAlign: 'left' }}>
                            <div style={{ fontWeight: 700, color: '#0f172a' }}>Google Sheets</div>
                            <div style={{ fontSize: '0.68rem', color: '#64748b' }}>Opens in web spreadsheet</div>
                          </div>
                        </button>
                      )}
                    </>
                  )}

                  {(exportHandlers.onExportWord || exportHandlers.onExportGoogleDocs) && (
                    <>
                      <div style={dropdownCategoryHeaderStyle}>DOCUMENT FORMATS</div>
                      {exportHandlers.onExportWord && (
                        <button
                          type="button"
                          onClick={() => handleExportAction(exportHandlers.onExportWord)}
                          style={dropdownOptionButtonStyle}
                        >
                          <FileText size={15} color="#2563eb" />
                          <div style={{ flex: 1, textAlign: 'left' }}>
                            <div style={{ fontWeight: 700, color: '#0f172a' }}>Microsoft Word (.docx / .doc)</div>
                            <div style={{ fontSize: '0.68rem', color: '#64748b' }}>Editable document</div>
                          </div>
                        </button>
                      )}
                      {exportHandlers.onExportGoogleDocs && (
                        <button
                          type="button"
                          onClick={() => handleExportAction(exportHandlers.onExportGoogleDocs)}
                          style={dropdownOptionButtonStyle}
                        >
                          <ExternalLink size={15} color="#3b82f6" />
                          <div style={{ flex: 1, textAlign: 'left' }}>
                            <div style={{ fontWeight: 700, color: '#0f172a' }}>Google Docs</div>
                            <div style={{ fontSize: '0.68rem', color: '#64748b' }}>Opens in web document editor</div>
                          </div>
                        </button>
                      )}
                    </>
                  )}

                  {(exportHandlers.onExportCsv || exportHandlers.onExportJson) && (
                    <>
                      <div style={dropdownCategoryHeaderStyle}>DATA EXCHANGE</div>
                      {exportHandlers.onExportCsv && (
                        <button
                          type="button"
                          onClick={() => handleExportAction(exportHandlers.onExportCsv)}
                          style={dropdownOptionButtonStyle}
                        >
                          <TableIcon size={15} color="#d97706" />
                          <div style={{ flex: 1, textAlign: 'left' }}>
                            <div style={{ fontWeight: 700, color: '#0f172a' }}>LIS CSV Spreadsheet (.csv)</div>
                            <div style={{ fontSize: '0.68rem', color: '#64748b' }}>Standard DepEd data exchange</div>
                          </div>
                        </button>
                      )}
                      {exportHandlers.onExportJson && (
                        <button
                          type="button"
                          onClick={() => handleExportAction(exportHandlers.onExportJson)}
                          style={dropdownOptionButtonStyle}
                        >
                          <FileCode size={15} color="#7c3aed" />
                          <div style={{ flex: 1, textAlign: 'left' }}>
                            <div style={{ fontWeight: 700, color: '#0f172a' }}>Raw JSON Data (.json)</div>
                            <div style={{ fontSize: '0.68rem', color: '#64748b' }}>Database export &amp; backup</div>
                          </div>
                        </button>
                      )}
                    </>
                  )}
                </div>
              )}
            </div>
          )}

          {/* Print Action */}
          {onPrint && (
            <button
              type="button"
              onClick={onPrint}
              disabled={disableActions}
              style={btnPrintStyle}
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

// ==========================================
// STYLES
// ==========================================
const navBarWrapperStyle: React.CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  width: '100%',
  flexShrink: 0,
  backgroundColor: '#ffffff',
  boxSizing: 'border-box',
};

const topTabBarStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: 12,
  padding: '8px 24px',
  backgroundColor: '#ffffff',
  borderBottom: '1px solid #e2e8f0',
};

const reportFormLabelStyle: React.CSSProperties = {
  fontSize: '0.78rem',
  fontWeight: 800,
  color: '#475569',
  letterSpacing: '0.4px',
  textTransform: 'uppercase',
};

const pillContainerStyle: React.CSSProperties = {
  display: 'flex',
  gap: 6,
  backgroundColor: '#f1f5f9',
  padding: '3px',
  borderRadius: 8,
};

const tabButtonStyle: React.CSSProperties = {
  padding: '6px 14px',
  borderRadius: 6,
  border: 'none',
  fontSize: '0.8rem',
  fontWeight: 700,
  cursor: 'pointer',
  display: 'flex',
  alignItems: 'center',
  gap: 6,
  transition: 'all 0.15s ease',
};

const bottomActionBarStyle: React.CSSProperties = {
  display: 'flex',
  justifyContent: 'space-between',
  alignItems: 'center',
  padding: '8px 24px',
  backgroundColor: '#ffffff',
  borderBottom: '1px solid #cbd5e1',
};

const filterGroupStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: 6,
};

const filterLabelStyle: React.CSSProperties = {
  fontSize: '0.8rem',
  fontWeight: 700,
  color: '#1e293b',
  whiteSpace: 'nowrap',
};

const selectInputStyle: React.CSSProperties = {
  padding: '5px 10px',
  borderRadius: 6,
  border: '1px solid #cbd5e1',
  fontSize: '0.8rem',
  fontWeight: 600,
  backgroundColor: '#f8fafc',
  color: '#0f172a',
  outline: 'none',
  cursor: 'pointer',
};

const dateInputWrapperStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: 6,
  padding: '3px 8px',
  borderRadius: 6,
  border: '1px solid #cbd5e1',
  backgroundColor: '#f8fafc',
};

const dateInputStyle: React.CSSProperties = {
  border: 'none',
  outline: 'none',
  background: 'transparent',
  fontSize: '0.8rem',
  fontWeight: 600,
  color: '#0f172a',
  cursor: 'pointer',
};

const searchContainerStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: 6,
  padding: '4px 10px',
  borderRadius: 6,
  border: '1px solid #cbd5e1',
  backgroundColor: '#f8fafc',
  width: 190,
};

const searchInputStyle: React.CSSProperties = {
  border: 'none',
  outline: 'none',
  background: 'transparent',
  fontSize: '0.78rem',
  width: '100%',
  color: '#0f172a',
};

const clearSearchBtnStyle: React.CSSProperties = {
  border: 'none',
  background: 'transparent',
  cursor: 'pointer',
  padding: 0,
  display: 'flex',
  alignItems: 'center',
};

const btnActionSecondaryStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: 6,
  padding: '6px 12px',
  backgroundColor: '#f8fafc',
  border: '1px solid #cbd5e1',
  borderRadius: 6,
  fontSize: '0.8rem',
  fontWeight: 700,
  color: '#334155',
  cursor: 'pointer',
  transition: 'all 0.15s ease',
};

const btnDownloadDropdownStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: 6,
  padding: '6px 12px',
  backgroundColor: '#ecfdf5',
  border: '1px solid #a7f3d0',
  borderRadius: 6,
  fontSize: '0.8rem',
  fontWeight: 700,
  color: '#065f46',
  cursor: 'pointer',
  transition: 'all 0.15s ease',
};

const btnPrintStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: 6,
  padding: '6px 16px',
  backgroundColor: '#0284c7',
  border: 'none',
  borderRadius: 6,
  fontSize: '0.8rem',
  fontWeight: 700,
  color: '#ffffff',
  cursor: 'pointer',
  transition: 'all 0.15s ease',
};

const dropdownListStyle: React.CSSProperties = {
  position: 'absolute',
  top: 'calc(100% + 6px)',
  right: 0,
  width: 270,
  backgroundColor: '#ffffff',
  borderRadius: 8,
  boxShadow: '0 10px 25px -5px rgba(0, 0, 0, 0.15)',
  border: '1px solid #e2e8f0',
  padding: '6px 0',
  zIndex: 1000,
  display: 'flex',
  flexDirection: 'column',
};

const dropdownCategoryHeaderStyle: React.CSSProperties = {
  padding: '6px 14px 2px 14px',
  fontSize: '0.62rem',
  fontWeight: 800,
  color: '#94a3b8',
  letterSpacing: '0.5px',
};

const dropdownOptionButtonStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: 10,
  padding: '8px 14px',
  border: 'none',
  backgroundColor: 'transparent',
  cursor: 'pointer',
  fontSize: '0.78rem',
  textAlign: 'left',
  width: '100%',
};

export default ReportNavBar;