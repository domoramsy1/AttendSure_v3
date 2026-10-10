/**
 * AttendSure V3 - DepEd School Form 4 (SF 4) Monthly Learner's Movement and Attendance
 * File: frontend/src/components/tabs/SF4ReportTab.tsx
 *
 * Fixes Applied:
 * 1. RESOLVED UNUSED STYLES: Connected dmosFooterStyle and dmosFooterDetailsStyle in renderSummaryFooter().
 * 2. EXPORT SUITE COMPLETE: Configured handlers for PDF, Excel, Word, CSV, and JSON.
 * 3. HEADER LOCKED TO PAGE 1: The official DepEd letterhead only appears on page 1.
 */

import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import apiClient from '../../api/client';
import { useSchool } from '../../context/SchoolContext';
import { useAlert } from '../../context/AlertContext';
import { ReportNavBar } from '../reports/ReportNavBar';
import { PageSetupModal } from '../common/PageSetupModal';
import { usePageSetup } from '../../hooks/usePageSetup';
import { PAPER_SIZES } from '../../types/pageSetup';
import type { PageSetupConfig, LayoutMode } from '../../types/pageSetup';
import { Loader2, AlertCircle, ZoomIn, ZoomOut, Maximize2 } from 'lucide-react';

export interface MetricTriplet {
  m: number;
  f: number;
  total: number;
}

export interface SF4SectionRecord {
  section_id: number | string;
  section_name: string;
  grade_level: string;
  adviser_name: string;
  registered_end: MetricTriplet;
  daily_average: MetricTriplet;
  attendance_percentage: MetricTriplet;
  dropped_out_prev: MetricTriplet;
  dropped_out_month: MetricTriplet;
  dropped_out_cumulative: MetricTriplet;
  transferred_out_prev: MetricTriplet;
  transferred_out_month: MetricTriplet;
  transferred_out_cumulative: MetricTriplet;
  transferred_in_prev: MetricTriplet;
  transferred_in_month: MetricTriplet;
  transferred_in_cumulative: MetricTriplet;
}

export interface SF4GradeGroup {
  grade_level: string;
  sections: SF4SectionRecord[];
  subtotal: SF4SectionRecord;
}

export interface SF4ReportData {
  school_id: string;
  school_name: string;
  region: string;
  division: string;
  district: string;
  school_year: string;
  month: string;
  year: number;
  school_head: string;
  left_logo?: string | null;
  right_logo?: string | null;
  grade_groups: SF4GradeGroup[];
  non_graded_summary: SF4SectionRecord;
  total_summary: SF4SectionRecord;
}

interface SF4PageChunk {
  pageNumber: number;
  totalPages?: number;
  groups: SF4GradeGroup[];
  isFinalPage: boolean;
  showFullHeader: boolean;
}

export interface SF4ReportTabProps {
  activeReportId?: string;
  onSelectReport?: (reportId: string) => void;
}

const parseGradeLevelAndSection = (gradeLevelInput: string, existingSectionName?: string) => {
  const cleanGrade = (gradeLevelInput || '').trim();
  const cleanSection = (existingSectionName || '').trim();

  if (cleanSection) {
    return { grade: cleanGrade, section: cleanSection };
  }

  if (cleanGrade.includes(' - ')) {
    const parts = cleanGrade.split(' - ');
    return {
      grade: parts[0].trim(),
      section: parts.slice(1).join(' - ').trim(),
    };
  }

  if (cleanGrade.includes('-') && !cleanGrade.toLowerCase().startsWith('non-')) {
    const parts = cleanGrade.split('-');
    if (parts.length === 2 && parts[0].toLowerCase().includes('grade')) {
      return {
        grade: parts[0].trim(),
        section: parts[1].trim(),
      };
    }
  }

  return { grade: cleanGrade, section: '' };
};

export const SF4ReportTab: React.FC<SF4ReportTabProps> = ({
  activeReportId = 'sf4',
  onSelectReport = () => {},
}) => {
  const { school } = useSchool();
  const { showAlert } = useAlert();

  const [selectedAcademicYear, setSelectedAcademicYear] = useState<string>('2026-2027');
  const [selectedMonth, setSelectedMonth] = useState<string>('October');
  const [selectedYear, setSelectedYear] = useState<number>(new Date().getFullYear());
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [reportData, setReportData] = useState<SF4ReportData | null>(null);
  const [loading, setLoading] = useState<boolean>(false);
  const [exportingPdf, setExportingPdf] = useState<boolean>(false);
  const [isPrinting, setIsPrinting] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [isPageSetupOpen, setIsPageSetupOpen] = useState(false);

  const { config: savedPageConfig, saveConfig: savePageConfig } = usePageSetup('sf4');
  const [activePageConfig, setActivePageConfig] = useState<PageSetupConfig>(() => ({
    ...savedPageConfig,
    orientation: savedPageConfig.orientation || 'landscape',
    paperSize: savedPageConfig.paperSize || 'folio',
  }));

  useEffect(() => {
    setActivePageConfig(savedPageConfig);
  }, [savedPageConfig]);

  const paper = useMemo(() => {
    return PAPER_SIZES[activePageConfig.paperSize] || PAPER_SIZES.folio || { width: 8.5, height: 13 };
  }, [activePageConfig.paperSize]);

  const isLandscape = activePageConfig.orientation === 'landscape';
  const pageWidthInches = isLandscape ? paper.height : paper.width;
  const pageHeightInches = isLandscape ? paper.width : paper.height;

  const [zoomScale, setZoomScale] = useState<number>(1);
  const [fitToWidth, setFitToWidth] = useState<boolean>(true);
  const viewportContainerRef = useRef<HTMLDivElement>(null);
  const reportRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleBeforePrint = () => setIsPrinting(true);
    const handleAfterPrint = () => setIsPrinting(false);
    window.addEventListener('beforeprint', handleBeforePrint);
    window.addEventListener('afterprint', handleAfterPrint);
    return () => {
      window.removeEventListener('beforeprint', handleBeforePrint);
      window.removeEventListener('afterprint', handleAfterPrint);
    };
  }, []);

  const fetchSF4 = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await apiClient.get<SF4ReportData>(
        `/reports/sf4/?month=${selectedMonth}&year=${selectedYear}&school_year=${selectedAcademicYear}`
      );
      setReportData(res.data);
    } catch (err: any) {
      setError(err?.response?.data?.error || 'Failed to retrieve official SF4 report data from database.');
    } finally {
      setLoading(false);
    }
  }, [selectedMonth, selectedYear, selectedAcademicYear]);

  useEffect(() => {
    fetchSF4();
  }, [fetchSF4]);

  const updateFitScale = useCallback(() => {
    if (!viewportContainerRef.current) return;
    const containerWidth = viewportContainerRef.current.clientWidth - 48;
    const targetWidth = pageWidthInches * 96;
    if (containerWidth > 0 && targetWidth > 0) {
      const scale = containerWidth / targetWidth;
      setZoomScale(Number(Math.min(1.15, Math.max(0.35, scale)).toFixed(3)));
    }
  }, [pageWidthInches]);

  useEffect(() => {
    if (fitToWidth && !isPrinting && !exportingPdf) {
      const timer = setTimeout(updateFitScale, 50);
      window.addEventListener('resize', updateFitScale);
      return () => {
        clearTimeout(timer);
        window.removeEventListener('resize', updateFitScale);
      };
    }
  }, [fitToWidth, isPrinting, exportingPdf, updateFitScale, reportData, activePageConfig]);

  const auditMeta = useMemo(() => {
    const now = new Date();
    const pad = (n: number) => String(n).padStart(2, '0');
    const dateFormatted = now.toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
    });
    const timeFormatted = now.toLocaleTimeString('en-US', {
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hour12: true,
    });
    const printedAt = `${dateFormatted} at ${timeFormatted}`;

    const schoolIdStr = reportData?.school_id || school.school_id || '';
    const dateStamp = `${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}`;
    const timeCode = `${pad(now.getHours())}${pad(now.getMinutes())}${pad(now.getSeconds())}`;
    const trackingId = `DOC-SF4-${schoolIdStr}-${dateStamp}-${timeCode}`;

    return { printedAt, trackingId };
  }, [reportData, school]);

  const getBaseFilename = useCallback(() => {
    const now = new Date();
    const pad = (n: number) => String(n).padStart(2, '0');
    const timestamp = `${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}_${pad(now.getHours())}${pad(now.getMinutes())}${pad(now.getSeconds())}`;
    return `SF4_Report_${selectedMonth}_${selectedYear}_${timestamp}`;
  }, [selectedMonth, selectedYear]);

  const logReportAudit = async (actionType: 'VIEW' | 'PRINT' | 'PDF' | 'EXCEL' | 'WORD' | 'CSV' | 'JSON') => {
    try {
      await apiClient.post('/reports/audit-logs/', {
        report_name: 'School Form 4 (SF4)',
        document_tracking_id: auditMeta.trackingId,
        action: actionType,
        printed_at: auditMeta.printedAt,
        timestamp: new Date().toISOString(),
      });
    } catch {
      // Offline fallback
    }
  };

  const filteredGradeGroups = useMemo(() => {
    if (!reportData?.grade_groups) return [];
    if (!searchQuery.trim()) return reportData.grade_groups;
    const q = searchQuery.toLowerCase().trim();

    return reportData.grade_groups
      .map((group) => {
        const matchingSections = group.sections.filter(
          (s) =>
            s.section_name.toLowerCase().includes(q) ||
            s.adviser_name.toLowerCase().includes(q) ||
            s.grade_level.toLowerCase().includes(q)
        );
        return {
          ...group,
          sections: matchingSections,
        };
      })
      .filter((g) => g.sections.length > 0 || g.grade_level.toLowerCase().includes(q));
  }, [reportData, searchQuery]);

  const paginatedPages = useMemo(() => {
    if (activePageConfig.layoutMode === 'pageless') {
      return [
        {
          pageNumber: 1,
          totalPages: 1,
          groups: filteredGradeGroups,
          isFinalPage: true,
          showFullHeader: true,
        },
      ];
    }

    const printableHeight = Math.max(
      3.0,
      pageHeightInches - (activePageConfig.margins.top || 0.15) - (activePageConfig.margins.bottom || 0.15)
    );
    const rowH = 0.22;
    const fullHeaderH = 1.35;
    const theadH = 0.58;
    const trackingH = 0.22;
    const footerH = 1.45;

    const totalContentRows = filteredGradeGroups.reduce(
      (acc, g) => acc + (g.sections.length > 0 ? g.sections.length + 1 : 1),
      3
    );

    const singlePageOverhead = fullHeaderH + theadH + footerH + trackingH;
    const singlePageCapacity = Math.floor((printableHeight - singlePageOverhead) / rowH);

    if (totalContentRows <= singlePageCapacity) {
      return [
        {
          pageNumber: 1,
          totalPages: 1,
          groups: filteredGradeGroups,
          isFinalPage: true,
          showFullHeader: true,
        },
      ];
    }

    const pages: SF4PageChunk[] = [];
    let currentGroups: SF4GradeGroup[] = [];
    let currentRowsCount = 0;

    for (let i = 0; i < filteredGradeGroups.length; i++) {
      const g = filteredGradeGroups[i];
      const groupRows = g.sections.length > 0 ? g.sections.length + 1 : 1;
      const isFirst = pages.length === 0;
      const pageOverhead = (isFirst ? fullHeaderH : 0) + theadH + trackingH;
      const capacity = Math.max(6, Math.floor((printableHeight - pageOverhead) / rowH));

      if (currentRowsCount + groupRows <= capacity) {
        currentGroups.push(g);
        currentRowsCount += groupRows;
      } else {
        if (currentGroups.length > 0) {
          pages.push({
            pageNumber: pages.length + 1,
            groups: currentGroups,
            isFinalPage: false,
            showFullHeader: pages.length === 0, // ONLY Page 1 gets header
          });
        }
        currentGroups = [g];
        currentRowsCount = groupRows;
      }
    }

    if (currentGroups.length > 0) {
      pages.push({
        pageNumber: pages.length + 1,
        groups: currentGroups,
        isFinalPage: true,
        showFullHeader: pages.length === 0, // ONLY Page 1 gets header
      });
    }

    const totalPages: number = pages.length;
    return pages.map((p) => ({ ...p, totalPages }));
  }, [activePageConfig, filteredGradeGroups, pageHeightInches]);

  const handleToggleLayoutMode = (newMode: LayoutMode) => {
    const updated: PageSetupConfig = { ...activePageConfig, layoutMode: newMode };
    savePageConfig(updated, false);
    setActivePageConfig(updated);
  };

  const handlePrint = () => {
    logReportAudit('PRINT');
    setIsPrinting(true);
    setTimeout(() => {
      window.print();
      setIsPrinting(false);
    }, 120);
  };

  const handleDownloadPDF = async () => {
    if (!reportRef.current || !reportData) return;
    setExportingPdf(true);
    logReportAudit('PDF');

    try {
      let html2pdfInstance = (window as any).html2pdf;
      if (!html2pdfInstance) {
        await new Promise((resolve, reject) => {
          const script = document.createElement('script');
          script.src = 'https://cdnjs.cloudflare.com/ajax/libs/html2pdf.js/0.10.1/html2pdf.bundle.min.js';
          script.onload = () => resolve((window as any).html2pdf);
          script.onerror = reject;
          document.head.appendChild(script);
        });
        html2pdfInstance = (window as any).html2pdf;
      }

      const opt = {
        margin: [0, 0, 0, 0],
        filename: `${getBaseFilename()}.pdf`,
        image: { type: 'jpeg', quality: 0.98 },
        html2canvas: {
          scale: 2,
          useCORS: true,
          logging: false,
          backgroundColor: activePageConfig.pageColor || '#ffffff',
        },
        jsPDF: {
          unit: 'in',
          format: [pageWidthInches, pageHeightInches],
          orientation: activePageConfig.orientation,
        },
        pagebreak: activePageConfig.layoutMode === 'pageless' ? { mode: [] } : { mode: ['css', 'legacy'] },
      };

      const pdfBlob: Blob = await html2pdfInstance().from(reportRef.current).set(opt).outputPdf('blob');
      const url = URL.createObjectURL(pdfBlob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `${getBaseFilename()}.pdf`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);

      showAlert({ title: 'PDF Exported', message: 'School Form 4 successfully exported.', type: 'success' });
    } catch {
      handlePrint();
    } finally {
      setExportingPdf(false);
    }
  };

  const handleExportExcel = async () => {
    if (!reportRef.current || !reportData) return;
    logReportAudit('EXCEL');
    const excelContent = `
      <html>
        <head><meta charset="utf-8"></head>
        <body>
          ${reportRef.current.innerHTML}
          <br/>
          <table border="0" style="font-size:8pt; color:#000000; font-family:Calibri;">
            <tr>
              <td><strong>DOCUMENT TRACKING ID:</strong> ${auditMeta.trackingId}</td>
              <td><strong>DATE &amp; TIME PRINTED:</strong> ${auditMeta.printedAt}</td>
            </tr>
          </table>
        </body>
      </html>
    `;
    const blob = new Blob([excelContent], { type: 'application/vnd.ms-excel;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `${getBaseFilename()}.xls`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
    showAlert({ title: 'Excel Exported', message: 'SF4 spreadsheet exported successfully.', type: 'success' });
  };

  const handleExportWord = async () => {
    if (!reportRef.current || !reportData) return;
    logReportAudit('WORD');
    const wordContent = `
      <html>
        <head><meta charset="utf-8"></head>
        <body>
          ${reportRef.current.innerHTML}
          <br/>
          <p style="font-size:8pt; color:#000000; font-family:Calibri;">
            <strong>DOCUMENT TRACKING ID:</strong> ${auditMeta.trackingId} &bull; 
            <strong>DATE &amp; TIME PRINTED:</strong> ${auditMeta.printedAt}
          </p>
        </body>
      </html>
    `;
    const blob = new Blob([wordContent], { type: 'application/msword;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `${getBaseFilename()}.doc`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
    showAlert({ title: 'Word Exported', message: 'SF4 document exported successfully.', type: 'success' });
  };

  const handleExportCSV = async () => {
    if (!reportData) return;
    logReportAudit('CSV');
    const headers = [
      'Name of Adviser', 'Grade Level', 'Section',
      'Registered End M', 'Registered End F', 'Registered End T',
      'Daily Avg M', 'Daily Avg F', 'Daily Avg T',
      'Attendance % M', 'Attendance % F', 'Attendance % T',
      'Drop Prev M', 'Drop Prev F', 'Drop Prev T',
      'Drop Month M', 'Drop Month F', 'Drop Month T',
      'Drop Total M', 'Drop Total F', 'Drop Total T',
      'Transfer Out Prev M', 'Transfer Out Prev F', 'Transfer Out Prev T',
      'Transfer Out Month M', 'Transfer Out Month F', 'Transfer Out Month T',
      'Transfer Out Total M', 'Transfer Out Total F', 'Transfer Out Total T',
      'Transfer In Prev M', 'Transfer In Prev F', 'Transfer In Prev T',
      'Transfer In Month M', 'Transfer In Month F', 'Transfer In Month T',
      'Transfer In Total M', 'Transfer In Total F', 'Transfer In Total T'
    ];

    const rows: (string | number)[][] = [];
    filteredGradeGroups.forEach((g) => {
      g.sections.forEach((s) => {
        const { grade, section } = parseGradeLevelAndSection(s.grade_level, s.section_name);
        rows.push([
          `"${s.adviser_name}"`, `"${grade}"`, `"${section}"`,
          s.registered_end.m, s.registered_end.f, s.registered_end.total,
          s.daily_average.m, s.daily_average.f, s.daily_average.total,
          s.attendance_percentage.m, s.attendance_percentage.f, s.attendance_percentage.total,
          s.dropped_out_prev.m, s.dropped_out_prev.f, s.dropped_out_prev.total,
          s.dropped_out_month.m, s.dropped_out_month.f, s.dropped_out_month.total,
          s.dropped_out_cumulative.m, s.dropped_out_cumulative.f, s.dropped_out_cumulative.total,
          s.transferred_out_prev.m, s.transferred_out_prev.f, s.transferred_out_prev.total,
          s.transferred_out_month.m, s.transferred_out_month.f, s.transferred_out_month.total,
          s.transferred_out_cumulative.m, s.transferred_out_cumulative.f, s.transferred_out_cumulative.total,
          s.transferred_in_prev.m, s.transferred_in_prev.f, s.transferred_in_prev.total,
          s.transferred_in_month.m, s.transferred_in_month.f, s.transferred_in_month.total,
          s.transferred_in_cumulative.m, s.transferred_in_cumulative.f, s.transferred_in_cumulative.total,
        ]);
      });
    });

    const csvContent = '\uFEFF' + [
      `# DOCUMENT TRACKING ID: ${auditMeta.trackingId}`,
      `# DATE AND TIME PRINTED: ${auditMeta.printedAt}`,
      headers.join(','),
      ...rows.map((r) => r.join(','))
    ].join('\r\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `${getBaseFilename()}.csv`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
    showAlert({ title: 'CSV Exported', message: 'SF4 CSV file ready.', type: 'success' });
  };

  const handleExportJSON = async () => {
    if (!reportData) return;
    logReportAudit('JSON');
    const exportPayload = {
      tracking_id: auditMeta.trackingId,
      date_and_time_printed: auditMeta.printedAt,
      report_data: reportData,
    };
    const blob = new Blob([JSON.stringify(exportPayload, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `${getBaseFilename()}.json`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
    showAlert({ title: 'JSON Exported', message: 'SF4 JSON export ready.', type: 'success' });
  };

  const renderHeader = () => {
    const effectiveLeftLogo = reportData?.left_logo || school.left_logo;
    const effectiveRightLogo = reportData?.right_logo || school.right_logo;
    const effectiveSchoolName = reportData?.school_name || school.school_name;
    const effectiveSchoolId = reportData?.school_id || school.school_id;
    const effectiveDivision = reportData?.division || school.division;
    const effectiveRegion = reportData?.region || school.region;
    const effectiveDistrict = reportData?.district || school.district;

    return (
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12, marginBottom: 8, width: '100%', boxSizing: 'border-box' }}>
        <div style={{ flexShrink: 0, width: '0.76in', height: '0.76in', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          {effectiveLeftLogo ? (
            <img src={effectiveLeftLogo} alt="Left Seal" style={{ width: '0.76in', height: '0.76in', objectFit: 'contain' }} />
          ) : null}
        </div>

        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ textAlign: 'center', marginBottom: 6 }}>
            <div style={republicStyle}>Republic of the Philippines</div>
            <div style={depedTitleStyle}>Department of Education</div>
            {effectiveRegion && <div style={regionalOfficeStyle}>{effectiveRegion.toUpperCase()}</div>}
            {effectiveDivision && <div style={officeStyle}>{effectiveDivision.toUpperCase()}</div>}
            <div style={{ fontFamily: 'Tahoma, Arial, sans-serif', fontSize: '10.5pt', fontWeight: 900, textTransform: 'uppercase', letterSpacing: '0.5px', marginTop: 4, color: '#000000' }}>
              School Form 4 (SF 4) Monthly Learner's Movement and Attendance
            </div>
            <div style={{ fontSize: '6.0pt', fontStyle: 'italic', color: '#000000', marginTop: 1 }}>
              (Consolidated Learner Movement and Monthly Attendance Summary)
            </div>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 3, width: '100%' }}>
            <div style={{ display: 'flex', alignItems: 'center', width: '100%' }}>
              <div style={{ display: 'flex', alignItems: 'center', width: '25%' }}>
                <span style={fieldLabelStyle}>School ID</span>
                <div style={{ ...fieldBoxStyle, width: 90 }}>{effectiveSchoolId || ''}</div>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', width: '25%' }}>
                <span style={fieldLabelStyle}>Region</span>
                <div style={{ ...fieldBoxStyle, flex: 1, textAlign: 'left', paddingLeft: 4 }}>{effectiveRegion || ''}</div>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', width: '25%', paddingLeft: 6 }}>
                <span style={fieldLabelStyle}>Division</span>
                <div style={{ ...fieldBoxStyle, flex: 1, textAlign: 'left', paddingLeft: 4 }}>{effectiveDivision || ''}</div>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', width: '25%', paddingLeft: 6 }}>
                <span style={fieldLabelStyle}>District</span>
                <div style={{ ...fieldBoxStyle, flex: 1, textAlign: 'left', paddingLeft: 4 }}>{effectiveDistrict || ''}</div>
              </div>
            </div>

            <div style={{ display: 'flex', alignItems: 'center', width: '100%' }}>
              <div style={{ display: 'flex', alignItems: 'center', width: '48%' }}>
                <span style={fieldLabelStyle}>School Name</span>
                <div style={{ ...fieldBoxStyle, flex: 1, textAlign: 'left', paddingLeft: 4, marginRight: 6 }}>
                  {effectiveSchoolName || ''}
                </div>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', width: '24%' }}>
                <span style={fieldLabelStyle}>School Year</span>
                <div style={{ ...fieldBoxStyle, flex: 1, marginRight: 6 }}>{reportData?.school_year || selectedAcademicYear}</div>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', width: '28%' }}>
                <span style={{ ...fieldLabelStyle, width: 130 }}>Report for Month of</span>
                <div style={{ ...fieldBoxStyle, flex: 1, textAlign: 'left', paddingLeft: 4 }}>
                  {reportData?.month || selectedMonth} {reportData?.year || selectedYear}
                </div>
              </div>
            </div>
          </div>
        </div>

        <div style={{ flexShrink: 0, width: '0.76in', height: '0.76in', display: 'flex', justifyContent: 'center', alignItems: 'center' }}>
          {effectiveRightLogo ? (
            <img src={effectiveRightLogo} alt="Right Seal" style={{ width: '0.76in', height: '0.76in', objectFit: 'contain' }} />
          ) : null}
        </div>
      </div>
    );
  };

  const renderTableHeader = () => (
    <>
      <colgroup>
        <col style={{ width: '8.8%' }} />
        <col style={{ width: '7.0%' }} />
        <col style={{ width: '6.6%' }} />
        {Array.from({ length: 36 }).map((_, i) => (
          <col key={`col-${i}`} style={{ width: '2.155%' }} />
        ))}
      </colgroup>
      <thead>
        <tr>
          <th rowSpan={3} style={{ width: '8.8%', ...thCell }}>NAME OF ADVISER</th>
          <th rowSpan={3} style={{ width: '7.0%', ...thCell }}>
            GRADE/<br />YEAR<br />LEVEL
          </th>
          <th rowSpan={3} style={{ width: '6.6%', ...thCell }}>SECTION</th>
          <th colSpan={3} rowSpan={2} style={{ width: '6.467%', ...thCell }}>
            REGISTERED LEARNER<br />
            <span style={subHeaderSpan}>(As of End of Month)</span>
          </th>
          <th colSpan={6} style={{ width: '12.934%', ...thCell }}>ATTENDANCE</th>
          <th colSpan={9} style={{ width: '19.4%', ...thCell }}>DROPPED OUT</th>
          <th colSpan={9} style={{ width: '19.4%', ...thCell }}>TRANSFERRED OUT</th>
          <th colSpan={9} style={{ width: '19.4%', ...thCell }}>TRANSFERRED IN</th>
        </tr>
        <tr>
          <th colSpan={3} style={{ ...thCell, fontSize: '5.6pt' }}>Daily Average</th>
          <th colSpan={3} style={{ ...thCell, fontSize: '5.6pt' }}>Percentage for Month</th>
          <th colSpan={3} style={{ ...thCell, fontSize: '5.0pt' }}>(A) Cumulative as of<br />Previous Month</th>
          <th colSpan={3} style={{ ...thCell, fontSize: '5.0pt' }}>(B) For the Month</th>
          <th colSpan={3} style={{ ...thCell, fontSize: '5.0pt' }}>(A+B) Cumulative as of<br />End of Month</th>
          <th colSpan={3} style={{ ...thCell, fontSize: '5.0pt' }}>(A) Cumulative as of<br />Previous Month</th>
          <th colSpan={3} style={{ ...thCell, fontSize: '5.0pt' }}>(B) For the Month</th>
          <th colSpan={3} style={{ ...thCell, fontSize: '5.0pt' }}>(A+B) Cumulative as of<br />End of Month</th>
          <th colSpan={3} style={{ ...thCell, fontSize: '5.0pt' }}>(A) Cumulative as of<br />Previous Month</th>
          <th colSpan={3} style={{ ...thCell, fontSize: '5.0pt' }}>(B) For the Month</th>
          <th colSpan={3} style={{ ...thCell, fontSize: '5.0pt' }}>(A+B) Cumulative as of<br />End of Month</th>
        </tr>
        <tr>
          {Array.from({ length: 12 }).map((_, i) => (
            <React.Fragment key={`triplet-${i}`}>
              <th style={thSubCell}>M</th>
              <th style={thSubCell}>F</th>
              <th style={{ ...thSubCell, fontWeight: 800 }}>T</th>
            </React.Fragment>
          ))}
        </tr>
      </thead>
    </>
  );

  const renderMetricCells = (triplet?: MetricTriplet) => (
    <>
      <td style={centerCell}>{triplet ? triplet.m : 0}</td>
      <td style={centerCell}>{triplet ? triplet.f : 0}</td>
      <td style={{ ...centerCell, fontWeight: 700 }}>{triplet ? triplet.total : 0}</td>
    </>
  );

  const renderSummaryFooter = () => (
    <div style={{ marginTop: 8, width: '100%' }}>
      <div style={footerContainerStyle}>
        <div style={guidelinesPanelStyle}>
          <div style={{ fontWeight: 800, fontSize: '7.2pt', marginBottom: 2, color: '#000000', fontFamily: 'Calibri, sans-serif' }}>
            GUIDELINES:
          </div>
          <div style={ruleTextStyle}>
            1. This form shall be accomplished every end of the month using the summary box of SF2 submitted by the teachers/advisers.
          </div>
          <div style={ruleTextStyle}>
            2. Furnish copy to Division Office: a week after June 30, October 30 &amp; March 31.
          </div>
          <div style={ruleTextStyle}>
            3. Only teachers who are handling advisory classes shall be reported.
          </div>
        </div>

        <div style={signaturePanelStyle}>
          <div style={{ fontSize: '7.5pt', fontWeight: 700, textAlign: 'left', marginBottom: 16, color: '#000000', fontFamily: 'Calibri, sans-serif' }}>
            Prepared and Submitted by:
          </div>
          <div style={sigLineStyle}>{reportData?.school_head || school.principal_name || '\u00A0'}</div>
          <div style={{ textAlign: 'center', fontSize: '6.5pt', marginTop: 2, color: '#000000', fontFamily: 'Calibri, sans-serif' }}>
            (Signature of School Head over Printed Name)
          </div>
        </div>
      </div>

      {/* Official DepEd Manual of Style Footer */}
      <div style={dmosFooterStyle}>
        <div style={{ width: '0.76in', height: '0.76in', minWidth: '0.76in', minHeight: '0.76in', flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          {(school.school_logo || school.left_logo) ? (
            <img
              src={school.school_logo || school.left_logo || ''}
              alt="School Seal"
              style={{ width: '0.76in', height: '0.76in', objectFit: 'contain' }}
            />
          ) : null}
        </div>

        <div style={dmosFooterDetailsStyle}>
          <div><strong>Address:</strong> {school.address || 'Lapasan, Cagayan de Oro City, Northern Mindanao, 9000'}</div>
          <div>
            <strong>Contact No.:</strong> {school.contact_number || '(088) 856-1234'} &bull; <strong>Email:</strong> {school.email || 'lapasan.nhs@deped.gov.ph'}
          </div>
        </div>
      </div>
    </div>
  );

  return (
    <div className="report-tab-root" style={{ display: 'flex', flexDirection: 'column', height: '100%', backgroundColor: '#f1f5f9' }}>
      <ReportNavBar
        reports={[
          { id: 'sf1', label: 'Form 1 (School Register)' },
          { id: 'sf2', label: 'Form 2 (Daily Attendance)' },
          { id: 'sf4', label: 'Form 4 (Monthly Movement)' },
        ]}
        activeReportId={activeReportId}
        onSelectReport={onSelectReport}
        academicYears={['2026-2027', '2025-2026']}
        selectedAcademicYear={selectedAcademicYear}
        onAcademicYearChange={setSelectedAcademicYear}
        showAcademicYearFilter={true}
        sections={[]}
        selectedSectionId=""
        onSectionChange={() => {}}
        showSectionFilter={false}
        showGradeLevelFilter={false}
        showMonthFilter={true}
        selectedMonth={selectedMonth}
        onMonthChange={setSelectedMonth}
        showCalendarYearFilter={true}
        selectedCalendarYear={selectedYear}
        onCalendarYearChange={setSelectedYear}
        searchQuery={searchQuery}
        onSearchChange={setSearchQuery}
        showSearch={true}
        layoutMode={activePageConfig.layoutMode}
        onToggleLayoutMode={handleToggleLayoutMode}
        showLayoutModeToggle={true}
        onRefresh={fetchSF4}
        isRefreshing={loading}
        onOpenPageSetup={() => setIsPageSetupOpen(true)}
        exportHandlers={{
          onExportPdf: handleDownloadPDF,
          onExportExcel: handleExportExcel,
          onExportWord: handleExportWord,
          onExportCsv: handleExportCSV,
          onExportJson: handleExportJSON,
        }}
        onPrint={handlePrint}
        isExporting={exportingPdf}
      />

      <div className="no-print" style={controlStripStyle}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <span style={{ fontSize: '0.80rem', fontWeight: 700, color: '#334155' }}>
            {selectedMonth} {selectedYear} &bull; SY {selectedAcademicYear}
          </span>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <button
            onClick={() => {
              setFitToWidth(true);
              updateFitScale();
            }}
            style={{
              ...toggleBtnStyle,
              backgroundColor: fitToWidth ? '#e0f2fe' : '#ffffff',
              color: fitToWidth ? '#0284c7' : '#475569',
            }}
          >
            <Maximize2 size={13} /> Fit Screen ({Math.round(zoomScale * 100)}%)
          </button>

          <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
            <button
              onClick={() => {
                setFitToWidth(false);
                setZoomScale((prev) => Math.max(0.35, Number((prev - 0.05).toFixed(2))));
              }}
              style={zoomBtnStyle}
            >
              <ZoomOut size={13} />
            </button>
            <span style={{ minWidth: 42, textAlign: 'center', fontWeight: 700, fontSize: '0.76rem' }}>
              {Math.round(zoomScale * 100)}%
            </span>
            <button
              onClick={() => {
                setFitToWidth(false);
                setZoomScale((prev) => Math.min(1.4, Number((prev + 0.05).toFixed(2))));
              }}
              style={zoomBtnStyle}
            >
              <ZoomIn size={13} />
            </button>
          </div>
        </div>
      </div>

      <div
        ref={viewportContainerRef}
        className="report-viewer-viewport"
        style={viewerScrollContainerStyle}
      >
        {loading ? (
          <div style={loadingStateStyle}>
            <Loader2 className="animate-spin" size={32} color="#0284c7" />
            <span style={{ fontSize: '9.5pt', fontWeight: 600 }}>Consolidating School Form 4 monthly learner figures...</span>
          </div>
        ) : error ? (
          <div style={errorStateStyle}>
            <AlertCircle size={26} color="#dc2626" />
            <span style={{ fontSize: '9.5pt' }}>{error}</span>
          </div>
        ) : reportData ? (
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
                id="sf4-print-document"
                ref={reportRef}
                style={{ width: '100%', display: 'flex', flexDirection: 'column', alignItems: 'center' }}
              >
                {paginatedPages.map((page) => (
                  <div
                    key={`sf4-page-${page.pageNumber}`}
                    className="sf4-page-sheet"
                    style={{
                      ...sheetWrapperStyle,
                      width: isPrinting ? '100%' : `${pageWidthInches}in`,
                      minWidth: isPrinting ? '100%' : `${pageWidthInches}in`,
                      maxWidth: isPrinting ? '100%' : `${pageWidthInches}in`,
                      minHeight: activePageConfig.layoutMode === 'pageless' ? 'auto' : `${pageHeightInches}in`,
                      boxShadow: isPrinting ? 'none' : '0 4px 24px rgba(0,0,0,0.12)',
                      padding: `${activePageConfig.margins.top}in ${activePageConfig.margins.right}in ${activePageConfig.margins.bottom}in ${activePageConfig.margins.left}in`,
                      backgroundColor: activePageConfig.pageColor || '#ffffff',
                      pageBreakBefore: page.pageNumber > 1 ? 'always' : 'auto',
                      breakBefore: page.pageNumber > 1 ? 'page' : 'auto',
                    }}
                  >
                    {/* Header ALWAYS ONLY on Page 1 */}
                    {page.pageNumber === 1 && renderHeader()}

                    <table style={mainTableStyle}>
                      {renderTableHeader()}
                      <tbody>
                        <tr style={{ height: '17px', backgroundColor: '#ffffff' }}>
                          <td colSpan={39} style={{ ...adviserCell, fontWeight: 800, fontSize: '6.8pt' }}>
                            ELEMENTARY/SECONDARY:
                          </td>
                        </tr>

                        {page.groups.map((group) => {
                          const { grade: groupGrade, section: groupSection } = parseGradeLevelAndSection(group.grade_level);
                          return (
                            <React.Fragment key={`grade-group-${group.grade_level}`}>
                              {group.sections && group.sections.length > 0 ? (
                                <>
                                  {group.sections.map((sec) => {
                                    const { grade: secGrade, section: secName } = parseGradeLevelAndSection(sec.grade_level, sec.section_name);
                                    return (
                                      <tr key={`section-row-${sec.section_id}`} style={dataRowStyle}>
                                        <td style={adviserCell}>{sec.adviser_name}</td>
                                        <td style={gradeCell}>{secGrade}</td>
                                        <td style={sectionCell}>{secName}</td>
                                        {renderMetricCells(sec.registered_end)}
                                        {renderMetricCells(sec.daily_average)}
                                        {renderMetricCells(sec.attendance_percentage)}
                                        {renderMetricCells(sec.dropped_out_prev)}
                                        {renderMetricCells(sec.dropped_out_month)}
                                        {renderMetricCells(sec.dropped_out_cumulative)}
                                        {renderMetricCells(sec.transferred_out_prev)}
                                        {renderMetricCells(sec.transferred_out_month)}
                                        {renderMetricCells(sec.transferred_out_cumulative)}
                                        {renderMetricCells(sec.transferred_in_prev)}
                                        {renderMetricCells(sec.transferred_in_month)}
                                        {renderMetricCells(sec.transferred_in_cumulative)}
                                      </tr>
                                    );
                                  })}
                                  <tr style={gradeSubtotalRowStyle}>
                                    <td colSpan={3} style={{ ...adviserCell, fontWeight: 800 }}>
                                      TOTAL FOR {groupGrade.toUpperCase()}
                                    </td>
                                    {renderMetricCells(group.subtotal.registered_end)}
                                    {renderMetricCells(group.subtotal.daily_average)}
                                    {renderMetricCells(group.subtotal.attendance_percentage)}
                                    {renderMetricCells(group.subtotal.dropped_out_prev)}
                                    {renderMetricCells(group.subtotal.dropped_out_month)}
                                    {renderMetricCells(group.subtotal.dropped_out_cumulative)}
                                    {renderMetricCells(group.subtotal.transferred_out_prev)}
                                    {renderMetricCells(group.subtotal.transferred_out_month)}
                                    {renderMetricCells(group.subtotal.transferred_out_cumulative)}
                                    {renderMetricCells(group.subtotal.transferred_in_prev)}
                                    {renderMetricCells(group.subtotal.transferred_in_month)}
                                    {renderMetricCells(group.subtotal.transferred_in_cumulative)}
                                  </tr>
                                </>
                              ) : (
                                <tr style={dataRowStyle}>
                                  <td style={adviserCell}></td>
                                  <td style={gradeCell}>{groupGrade}</td>
                                  <td style={sectionCell}>{groupSection}</td>
                                  {renderMetricCells(group.subtotal?.registered_end)}
                                  {renderMetricCells(group.subtotal?.daily_average)}
                                  {renderMetricCells(group.subtotal?.attendance_percentage)}
                                  {renderMetricCells(group.subtotal?.dropped_out_prev)}
                                  {renderMetricCells(group.subtotal?.dropped_out_month)}
                                  {renderMetricCells(group.subtotal?.dropped_out_cumulative)}
                                  {renderMetricCells(group.subtotal?.transferred_out_prev)}
                                  {renderMetricCells(group.subtotal?.transferred_out_month)}
                                  {renderMetricCells(group.subtotal?.transferred_out_cumulative)}
                                  {renderMetricCells(group.subtotal?.transferred_in_prev)}
                                  {renderMetricCells(group.subtotal?.transferred_in_month)}
                                  {renderMetricCells(group.subtotal?.transferred_in_cumulative)}
                                </tr>
                              )}
                            </React.Fragment>
                          );
                        })}

                        {page.isFinalPage && reportData.non_graded_summary && (
                          <tr style={gradeSubtotalRowStyle}>
                            <td colSpan={3} style={{ ...adviserCell, fontWeight: 800 }}>
                              TOTAL FOR NON-GRADED
                            </td>
                            {renderMetricCells(reportData.non_graded_summary.registered_end)}
                            {renderMetricCells(reportData.non_graded_summary.daily_average)}
                            {renderMetricCells(reportData.non_graded_summary.attendance_percentage)}
                            {renderMetricCells(reportData.non_graded_summary.dropped_out_prev)}
                            {renderMetricCells(reportData.non_graded_summary.dropped_out_month)}
                            {renderMetricCells(reportData.non_graded_summary.dropped_out_cumulative)}
                            {renderMetricCells(reportData.non_graded_summary.transferred_out_prev)}
                            {renderMetricCells(reportData.non_graded_summary.transferred_out_month)}
                            {renderMetricCells(reportData.non_graded_summary.transferred_out_cumulative)}
                            {renderMetricCells(reportData.non_graded_summary.transferred_in_prev)}
                            {renderMetricCells(reportData.non_graded_summary.transferred_in_month)}
                            {renderMetricCells(reportData.non_graded_summary.transferred_in_cumulative)}
                          </tr>
                        )}

                        {page.isFinalPage && reportData.total_summary && (
                          <tr style={grandTotalRowStyle}>
                            <td colSpan={3} style={{ ...adviserCell, fontWeight: 900 }}>
                              TOTAL
                            </td>
                            {renderMetricCells(reportData.total_summary.registered_end)}
                            {renderMetricCells(reportData.total_summary.daily_average)}
                            {renderMetricCells(reportData.total_summary.attendance_percentage)}
                            {renderMetricCells(reportData.total_summary.dropped_out_prev)}
                            {renderMetricCells(reportData.total_summary.dropped_out_month)}
                            {renderMetricCells(reportData.total_summary.dropped_out_cumulative)}
                            {renderMetricCells(reportData.total_summary.transferred_out_prev)}
                            {renderMetricCells(reportData.total_summary.transferred_out_month)}
                            {renderMetricCells(reportData.total_summary.transferred_out_cumulative)}
                            {renderMetricCells(reportData.total_summary.transferred_in_prev)}
                            {renderMetricCells(reportData.total_summary.transferred_in_month)}
                            {renderMetricCells(reportData.total_summary.transferred_in_cumulative)}
                          </tr>
                        )}
                      </tbody>
                    </table>

                    {page.isFinalPage && renderSummaryFooter()}

                    <div style={auditFooterContainerStyle}>
                      <div>
                        <span>Document Tracking ID: <strong>{auditMeta.trackingId}</strong></span>
                      </div>
                      <div>
                        <span>Date and Time Printed: <strong>{auditMeta.printedAt}</strong></span>
                        {page.totalPages && page.totalPages > 1 && (
                          <span> &bull; Page {page.pageNumber} of {page.totalPages}</span>
                        )}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        ) : null}
      </div>

      <PageSetupModal
        isOpen={isPageSetupOpen}
        onClose={() => {
          setActivePageConfig(savedPageConfig);
          setIsPageSetupOpen(false);
        }}
        currentConfig={activePageConfig}
        onLiveChange={(liveCfg) => setActivePageConfig(liveCfg)}
        onApply={(finalCfg: PageSetupConfig, setAsDefault: boolean) => {
          savePageConfig(finalCfg, setAsDefault);
          setActivePageConfig(finalCfg);
          setIsPageSetupOpen(false);
        }}
        reportTitle="SF4 Monthly Learner Movement"
      />

      <style>{`
        @media print {
          @page {
            size: ${pageWidthInches}in ${pageHeightInches}in;
            margin: 0 !important;
          }
          
          .no-print,
          nav,
          aside,
          header,
          footer,
          button,
          input,
          select {
            display: none !important;
          }

          html,
          body,
          #root,
          #root > div,
          main,
          .report-tab-root,
          .report-viewer-viewport {
            margin: 0 !important;
            padding: 0 !important;
            width: 100% !important;
            min-width: 100% !important;
            max-width: 100% !important;
            height: auto !important;
            min-height: 0 !important;
            overflow: visible !important;
            display: block !important;
            background: #ffffff !important;
            background-color: #ffffff !important;
            -webkit-print-color-adjust: exact !important;
            print-color-adjust: exact !important;
          }

          * {
            -webkit-transform: none !important;
            transform: none !important;
            zoom: 1 !important;
          }

          #sf4-print-document {
            width: 100% !important;
            max-width: 100% !important;
            min-width: 100% !important;
            margin: 0 auto !important;
            padding: 0 !important;
            display: block !important;
          }

          .sf4-page-sheet {
            width: ${pageWidthInches}in !important;
            max-width: ${pageWidthInches}in !important;
            min-width: ${pageWidthInches}in !important;
            min-height: ${activePageConfig.layoutMode === 'pageless' ? 'auto' : `${pageHeightInches}in`} !important;
            box-sizing: border-box !important;
            margin: 0 auto !important;
            padding: ${activePageConfig.margins.top}in ${activePageConfig.margins.right}in ${activePageConfig.margins.bottom}in ${activePageConfig.margins.left}in !important;
            box-shadow: none !important;
            border: none !important;
            background-color: ${activePageConfig.pageColor || '#ffffff'} !important;
            page-break-after: ${activePageConfig.layoutMode === 'pageless' ? 'auto' : 'always'} !important;
            break-after: ${activePageConfig.layoutMode === 'pageless' ? 'auto' : 'page'} !important;
          }

          .sf4-page-sheet:last-child {
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
    </div>
  );
};

export default SF4ReportTab;

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

const dmosFooterDetailsStyle: React.CSSProperties = {
  fontFamily: 'Calibri, "Segoe UI", Arial, sans-serif',
  fontSize: '10pt',
  color: '#000000',
  lineHeight: 1.3,
  textAlign: 'left',
};

const controlStripStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
  padding: '8px 24px',
  backgroundColor: '#ffffff',
  borderBottom: '1px solid #e2e8f0',
};

const toggleBtnStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: 5,
  padding: '4px 10px',
  borderRadius: 6,
  border: '1px solid #cbd5e1',
  cursor: 'pointer',
  fontSize: '0.76rem',
  fontWeight: 700,
};

const zoomBtnStyle: React.CSSProperties = {
  padding: '4px 8px',
  borderRadius: 6,
  border: '1px solid #cbd5e1',
  backgroundColor: '#ffffff',
  cursor: 'pointer',
};

const fieldLabelStyle: React.CSSProperties = {
  fontFamily: 'Tahoma, sans-serif',
  fontWeight: 700,
  fontSize: '8.2pt',
  color: '#000000',
  marginRight: 4,
};

const fieldBoxStyle: React.CSSProperties = {
  minHeight: 17,
  lineHeight: '17px',
  border: '1.2px solid #000000',
  backgroundColor: '#ffffff',
  textAlign: 'center',
  fontWeight: 700,
  fontFamily: 'Tahoma, sans-serif',
  fontSize: '8.2pt',
  color: '#000000',
  padding: '0 4px',
  boxSizing: 'border-box',
};

const viewerScrollContainerStyle: React.CSSProperties = {
  flex: 1,
  overflowY: 'auto',
  overflowX: 'auto',
  padding: '16px 20px',
  display: 'flex',
  flexDirection: 'column',
  alignItems: 'center',
  width: '100%',
  boxSizing: 'border-box',
};

const sheetWrapperStyle: React.CSSProperties = {
  backgroundColor: '#ffffff',
  boxShadow: '0 4px 24px rgba(0,0,0,0.14)',
  margin: '0 auto 24px auto',
  boxSizing: 'border-box',
  fontFamily: 'Arial, sans-serif',
  color: '#000000',
  transition: 'all 0.15s ease',
};

const mainTableStyle: React.CSSProperties = {
  width: '100%',
  tableLayout: 'fixed',
  borderCollapse: 'collapse',
  fontSize: '6.2pt',
  border: '1.2px solid #000000',
  boxSizing: 'border-box',
  fontFamily: 'Arial, sans-serif',
};

const thCell: React.CSSProperties = {
  border: '1px solid #000000',
  padding: '1px 1px',
  backgroundColor: '#ffffff',
  fontWeight: 700,
  textAlign: 'center',
  verticalAlign: 'middle',
  color: '#000000',
  lineHeight: 1.05,
  fontSize: '5.8pt',
  wordBreak: 'break-word',
};

const thSubCell: React.CSSProperties = {
  border: '1px solid #000000',
  padding: '1px 0',
  backgroundColor: '#ffffff',
  fontWeight: 700,
  textAlign: 'center',
  verticalAlign: 'middle',
  fontSize: '5.4pt',
  color: '#000000',
  lineHeight: 1,
  whiteSpace: 'nowrap',
};

const subHeaderSpan: React.CSSProperties = {
  fontSize: '4.8pt',
  fontWeight: 400,
  fontStyle: 'italic',
  color: '#000000',
  display: 'inline-block',
  marginTop: 1,
};

const dataRowStyle: React.CSSProperties = {
  borderBottom: '1px solid #000000',
  verticalAlign: 'middle',
  height: '16px',
};

const gradeSubtotalRowStyle: React.CSSProperties = {
  borderTop: '1px solid #000000',
  borderBottom: '1px solid #000000',
  backgroundColor: '#ffffff',
  height: '17px',
};

const grandTotalRowStyle: React.CSSProperties = {
  borderTop: '1.4px solid #000000',
  borderBottom: '1.4px solid #000000',
  backgroundColor: '#ffffff',
  height: '18px',
};

const adviserCell: React.CSSProperties = {
  textAlign: 'left',
  border: '1px solid #000000',
  padding: '0 3px',
  color: '#000000',
  verticalAlign: 'middle',
  lineHeight: 1.1,
  fontSize: '6.0pt',
  fontFamily: 'Arial, sans-serif',
  whiteSpace: 'normal',
  wordBreak: 'break-word',
};

const gradeCell: React.CSSProperties = {
  textAlign: 'left',
  border: '1px solid #000000',
  padding: '0 3px',
  color: '#000000',
  verticalAlign: 'middle',
  lineHeight: 1.1,
  fontSize: '6.0pt',
  fontWeight: 700,
  fontFamily: 'Arial, sans-serif',
  whiteSpace: 'normal',
  wordBreak: 'break-word',
};

const sectionCell: React.CSSProperties = {
  textAlign: 'left',
  border: '1px solid #000000',
  padding: '0 3px',
  color: '#000000',
  verticalAlign: 'middle',
  lineHeight: 1.1,
  fontSize: '6.0pt',
  fontFamily: 'Arial, sans-serif',
  whiteSpace: 'normal',
  wordBreak: 'break-word',
};

const centerCell: React.CSSProperties = {
  textAlign: 'center',
  border: '1px solid #000000',
  padding: '0',
  color: '#000000',
  verticalAlign: 'middle',
  fontSize: '5.6pt',
  lineHeight: '16px',
  fontFamily: 'Arial, sans-serif',
  whiteSpace: 'nowrap',
};

const footerContainerStyle: React.CSSProperties = {
  display: 'grid',
  gridTemplateColumns: '7.2fr 2.8fr',
  gap: 12,
  marginTop: 4,
  alignItems: 'start',
  width: '100%',
  boxSizing: 'border-box',
  color: '#000000',
};

const guidelinesPanelStyle: React.CSSProperties = {
  fontFamily: 'Calibri, sans-serif',
  fontSize: '7.0pt',
  lineHeight: 1.15,
  boxSizing: 'border-box',
  minWidth: 0,
  color: '#000000',
};

const ruleTextStyle: React.CSSProperties = {
  marginBottom: 2,
  color: '#000000',
};

const signaturePanelStyle: React.CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  width: '100%',
  boxSizing: 'border-box',
  color: '#000000',
  paddingLeft: 8,
};

const sigLineStyle: React.CSSProperties = {
  borderBottom: '1.2px solid #000000',
  minHeight: 16,
  display: 'flex',
  alignItems: 'flex-end',
  justifyContent: 'center',
  fontWeight: 800,
  fontSize: '8.5pt',
  fontFamily: 'Calibri, sans-serif',
  textTransform: 'uppercase',
  paddingBottom: 1,
  color: '#000000',
  width: '100%',
};

const auditFooterContainerStyle: React.CSSProperties = {
  display: 'flex',
  justifyContent: 'space-between',
  alignItems: 'center',
  fontSize: '6.2pt',
  fontFamily: 'Calibri, monospace',
  color: '#000000',
  marginTop: 4,
  paddingTop: 2,
  borderTop: '0.8px dashed #000000',
  width: '100%',
  boxSizing: 'border-box',
};

const loadingStateStyle: React.CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  alignItems: 'center',
  gap: 12,
  marginTop: 80,
  color: '#475569',
};

const errorStateStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: 8,
  marginTop: 80,
  color: '#dc2626',
  fontWeight: 600,
  backgroundColor: '#fef2f2',
  padding: '12px 20px',
  borderRadius: 8,
  border: '1px solid #fecaca',
};