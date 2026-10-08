import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import apiClient from '../../api/client';
import { KagawaranNgEdukasyonLogo } from '../ui/KagawaranNgEdukasyonLogo';
import { DepEdLogo } from '../ui/DepEdLogo';
import { ReportNavBar } from '../reports/ReportNavBar';
import { PageSetupModal } from '../common/PageSetupModal';
import { usePageSetup } from '../../hooks/usePageSetup';
import { PAPER_SIZES } from '../../types/pageSetup';
import type { PageSetupConfig, LayoutMode } from '../../types/pageSetup';
import { Loader2, AlertCircle } from 'lucide-react';

const DepEdLogoComp = DepEdLogo as React.ComponentType<{
  className?: string;
  width?: number | string;
  height?: number | string;
  style?: React.CSSProperties;
}>;

interface SchoolDay {
  dateNumber: number;
  dayOfWeek: 'M' | 'T' | 'W' | 'TH' | 'F';
  fullDate: string;
}

interface SF2Learner {
  id: number;
  lrn: string;
  name: string;
  sex: 'M' | 'F';
  attendance: { [dayNumber: number]: string | number };
  total_absent: number;
  total_tardy: number;
  remarks: string;
}

interface MetricCounts {
  m: number;
  f: number;
  total: number;
}

interface SF2Metrics {
  enrolment_june: MetricCounts;
  late_enrolment: MetricCounts;
  registered_end: MetricCounts;
  percentage_enrolment: MetricCounts;
  average_daily_attendance: MetricCounts;
  percentage_attendance: MetricCounts;
  consecutive_5_absent_count: MetricCounts;
  drop_out: MetricCounts;
  transferred_out: MetricCounts;
  transferred_in: MetricCounts;
}

interface SF2ReportData {
  school_id: string;
  school_name: string;
  region?: string;
  division: string;
  district: string;
  academic_year: string;
  grade_level: string;
  section_name: string;
  month: string;
  year: number;
  adviser_name: string;
  school_head: string;
  left_logo?: string;
  right_logo?: string;
  school_days: SchoolDay[];
  has_enrolled_students?: boolean;
  notice?: string;
  males: SF2Learner[];
  females: SF2Learner[];
  metrics: SF2Metrics;
}

export interface SF2ReportTabProps {
  sectionId?: number | string;
  activeReportId?: string;
  onSelectReport?: (reportId: string) => void;
}

// Self-contained SVG data URIs
const SVG_PRESENT =
  'data:image/svg+xml;utf8,' +
  encodeURIComponent(
    '<svg xmlns="http://www.w3.org/2000/svg" width="24" height="16" viewBox="0 0 24 16" preserveAspectRatio="none"><line x1="0" y1="16" x2="24" y2="0" stroke="#000000" stroke-width="0.75"/></svg>'
  );

const SVG_ABSENT =
  'data:image/svg+xml;utf8,' +
  encodeURIComponent(
    '<svg xmlns="http://www.w3.org/2000/svg" width="24" height="16" viewBox="0 0 24 16" preserveAspectRatio="none"><line x1="0" y1="16" x2="24" y2="0" stroke="#000000" stroke-width="0.6"/><line x1="4" y1="2" x2="20" y2="14" stroke="#000000" stroke-width="1.9" stroke-linecap="round"/><line x1="20" y1="2" x2="4" y2="14" stroke="#000000" stroke-width="1.9" stroke-linecap="round"/></svg>'
  );

const SVG_TARDY =
  'data:image/svg+xml;utf8,' +
  encodeURIComponent(
    '<svg xmlns="http://www.w3.org/2000/svg" width="24" height="16" viewBox="0 0 24 16" preserveAspectRatio="none"><polygon points="0,0 24,0 0,16" fill="#000000"/><line x1="0" y1="16" x2="24" y2="0" stroke="#000000" stroke-width="0.75"/></svg>'
  );

const SVG_CUTTING =
  'data:image/svg+xml;utf8,' +
  encodeURIComponent(
    '<svg xmlns="http://www.w3.org/2000/svg" width="24" height="16" viewBox="0 0 24 16" preserveAspectRatio="none"><polygon points="24,0 24,16 0,16" fill="#000000"/><line x1="0" y1="16" x2="24" y2="0" stroke="#000000" stroke-width="0.75"/></svg>'
  );

const SVG_BOTH =
  'data:image/svg+xml;utf8,' +
  encodeURIComponent(
    '<svg xmlns="http://www.w3.org/2000/svg" width="24" height="16" viewBox="0 0 24 16" preserveAspectRatio="none"><polygon points="0,0 24,0 0,16" fill="#000000"/><polygon points="24,0 24,16 0,16" fill="#000000"/><line x1="0" y1="16" x2="24" y2="0" stroke="#ffffff" stroke-width="0.75"/></svg>'
  );

const AttendanceCell: React.FC<{ status?: string | number | null }> = ({ status }) => {
  const s = String(status ?? '').toLowerCase().trim();
  let src = SVG_PRESENT;
  let alt = 'Present';

  if (s === 'absent' || s === 'x' || s === '1' || s === 'a') {
    src = SVG_ABSENT;
    alt = 'Absent (X)';
  } else if (s === 'tardy' || s === 'late' || s === '2' || s === 't') {
    src = SVG_TARDY;
    alt = 'Tardy (Upper Half Shaded)';
  } else if (s === 'cutting' || s === 'cc' || s === '3' || s === 'c') {
    src = SVG_CUTTING;
    alt = 'Cutting Classes (Lower Half Shaded)';
  } else if (s === 'both' || s === '4') {
    src = SVG_BOTH;
    alt = 'Tardy & Cutting';
  }

  return (
    <div
      style={{
        width: '100%',
        height: '16px',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        overflow: 'hidden',
        backgroundColor: '#ffffff',
      }}
    >
      <img
        src={src}
        alt={alt}
        style={{
          width: '100%',
          height: '100%',
          display: 'block',
          objectFit: 'fill',
        }}
      />
    </div>
  );
};

export const SF2ReportTab: React.FC<SF2ReportTabProps> = ({
  sectionId,
  activeReportId = 'sf2',
  onSelectReport = () => {},
}) => {
  const [sections, setSections] = useState<any[]>([]);
  const [selectedSectionId, setSelectedSectionId] = useState<string>(
    sectionId ? String(sectionId) : ''
  );
  const [selectedAcademicYear, setSelectedAcademicYear] = useState<string>('');
  const [selectedGradeLevel, setSelectedGradeLevel] = useState<string>('ALL');
  const [selectedMonth, setSelectedMonth] = useState<string>('October');
  const [selectedYear, setSelectedYear] = useState<number>(new Date().getFullYear());
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [reportData, setReportData] = useState<SF2ReportData | null>(null);
  const [loading, setLoading] = useState<boolean>(false);
  const [exportingPdf, setExportingPdf] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [isPageSetupOpen, setIsPageSetupOpen] = useState(false);

  const { config: savedPageConfig, saveConfig: savePageConfig } = usePageSetup('sf2');
  const [activePageConfig, setActivePageConfig] = useState<PageSetupConfig>(savedPageConfig);

  useEffect(() => {
    setActivePageConfig(savedPageConfig);
  }, [savedPageConfig]);

  const reportRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (sectionId) setSelectedSectionId(String(sectionId));
  }, [sectionId]);

  useEffect(() => {
    const fetchSections = async () => {
      try {
        const res = await apiClient.get('/sections/');
        setSections(res.data);
        if (!selectedSectionId && res.data.length > 0) {
          setSelectedSectionId(String(res.data[0].id));
        }
      } catch (err) {
        console.error('Failed to load sections:', err);
      }
    };
    fetchSections();
  }, [selectedSectionId]);

  const fetchSF2 = useCallback(async () => {
    if (!selectedSectionId) return;
    setLoading(true);
    setError(null);
    try {
      const res = await apiClient.get<SF2ReportData>(
        `/reports/sf2/${selectedSectionId}/?month=${selectedMonth}&year=${selectedYear}`
      );
      setReportData(res.data);
      if (res.data?.academic_year && !selectedAcademicYear) {
        setSelectedAcademicYear(res.data.academic_year);
      }
    } catch (err: any) {
      setError(err.response?.data?.error || 'Failed to retrieve attendance register from database.');
    } finally {
      setLoading(false);
    }
  }, [selectedSectionId, selectedMonth, selectedYear, selectedAcademicYear]);

  useEffect(() => {
    fetchSF2();
  }, [fetchSF2]);

  const availableAcademicYears = useMemo(() => {
    const years = Array.from(
      new Set(
        [
          reportData?.academic_year,
          ...sections.map((s) => s.academic_year),
        ].filter(Boolean)
      )
    ) as string[];
    return years.length > 0 ? years : ['2026-2027'];
  }, [reportData, sections]);

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

    const schoolIdStr = reportData?.school_id || '304033';
    const dateStamp = `${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}`;
    const timeCode = `${pad(now.getHours())}${pad(now.getMinutes())}${pad(now.getSeconds())}`;
    const trackingId = `DOC-SF2-${schoolIdStr}-${dateStamp}-${timeCode}`;

    return { printedAt, trackingId };
  }, [reportData, selectedSectionId]);

  const logReportAudit = async (actionType: 'VIEW' | 'PRINT' | 'PDF' | 'EXCEL' | 'WORD' | 'CSV' | 'JSON') => {
    try {
      await apiClient.post('/reports/audit-logs/', {
        report_name: 'School Form 2 (SF2)',
        document_tracking_id: auditMeta.trackingId,
        section_id: selectedSectionId,
        action: actionType,
        printed_at: auditMeta.printedAt,
        timestamp: new Date().toISOString(),
      });
    } catch {
      // Offline fallback
    }
  };

  const getBaseFilename = () => {
    const now = new Date();
    const pad = (n: number) => String(n).padStart(2, '0');
    const timestamp = `${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}_${pad(now.getHours())}${pad(now.getMinutes())}${pad(now.getSeconds())}`;
    const cleanGrade = (reportData?.grade_level || 'Grade').replace(/[^a-zA-Z0-9]/g, '_');
    const cleanSection = (reportData?.section_name || 'Section').replace(/[^a-zA-Z0-9]/g, '_');
    return `SF2_Report_${cleanGrade}_${cleanSection}_${selectedMonth}_${timestamp}`;
  };

  const males = useMemo(() => {
    const list = reportData?.males || [];
    if (!searchQuery.trim()) return list;
    const q = searchQuery.toLowerCase().trim();
    return list.filter((m) => m.name.toLowerCase().includes(q) || m.lrn.toLowerCase().includes(q));
  }, [reportData, searchQuery]);

  const females = useMemo(() => {
    const list = reportData?.females || [];
    if (!searchQuery.trim()) return list;
    const q = searchQuery.toLowerCase().trim();
    return list.filter((f) => f.name.toLowerCase().includes(q) || f.lrn.toLowerCase().includes(q));
  }, [reportData, searchQuery]);

  const dailyAttendanceTotals = useMemo(() => {
    if (!reportData || !reportData.school_days) return { males: [], females: [], combined: [] };
    const maxCols = 25;
    const malesCount: number[] = new Array(maxCols).fill(0);
    const femalesCount: number[] = new Array(maxCols).fill(0);
    const combinedCount: number[] = new Array(maxCols).fill(0);

    const safeMales = reportData.males || [];
    const safeFemales = reportData.females || [];

    reportData.school_days.forEach((day, idx) => {
      if (idx >= maxCols) return;
      let mPresent = 0;
      let fPresent = 0;

      safeMales.forEach((m) => {
        const status = String(m.attendance?.[day.dateNumber] ?? '').toLowerCase().trim();
        if (status === 'present' || status === 'tardy' || status === 'cutting' || status === '0' || status === '') {
          mPresent++;
        }
      });

      safeFemales.forEach((f) => {
        const status = String(f.attendance?.[day.dateNumber] ?? '').toLowerCase().trim();
        if (status === 'present' || status === 'tardy' || status === 'cutting' || status === '0' || status === '') {
          fPresent++;
        }
      });

      malesCount[idx] = mPresent;
      femalesCount[idx] = fPresent;
      combinedCount[idx] = mPresent + fPresent;
    });

    return { males: malesCount, females: femalesCount, combined: combinedCount };
  }, [reportData]);

  // Dynamic Page Fit Calculation
  const fitsOnSinglePage = useMemo(() => {
    if (activePageConfig.layoutMode === 'pageless') return true;

    const paper = PAPER_SIZES[activePageConfig.paperSize] || PAPER_SIZES.legal;
    const isLandscape = activePageConfig.orientation === 'landscape';
    const pageHeightInches = isLandscape ? paper.width : paper.height;
    const printableHeight =
      pageHeightInches - (activePageConfig.margins.top || 0.25) - (activePageConfig.margins.bottom || 0.25);

    // Overhead: Full Header (1.35) + thead (0.40) + section banners/totals (0.85) + Summary footer (3.15) + tracking (0.22)
    const singlePageOverhead = 5.97;
    const rowHeight = 0.17;
    const totalRows = (males.length || 0) + (females.length || 0);
    const totalHeightNeeded = singlePageOverhead + totalRows * rowHeight;

    return totalHeightNeeded <= printableHeight;
  }, [activePageConfig, males.length, females.length]);

  const sheetDimensions = useMemo(() => {
    const m = activePageConfig.margins;
    const paddingStr = `${m.top}in ${m.right}in ${m.bottom}in ${m.left}in`;

    if (activePageConfig.layoutMode === 'pageless') {
      return {
        width: '100%',
        maxWidth: '100%',
        boxShadow: 'none',
        padding: paddingStr,
      };
    }

    const paper = PAPER_SIZES[activePageConfig.paperSize] || PAPER_SIZES.legal;
    const isLandscape = activePageConfig.orientation === 'landscape';
    const widthInches = isLandscape ? paper.height : paper.width;

    return {
      width: '100%',
      maxWidth: `${widthInches}in`,
      boxShadow: '0 4px 24px rgba(0,0,0,0.12)',
      padding: paddingStr,
    };
  }, [activePageConfig]);

  const handleToggleLayoutMode = (newMode: LayoutMode) => {
    const updated: PageSetupConfig = { ...activePageConfig, layoutMode: newMode };
    savePageConfig(updated, false);
    setActivePageConfig(updated);
  };

  const saveFileWithPicker = async (
    blob: Blob,
    suggestedName: string,
    mimeType: string,
    extension: string,
    description: string
  ) => {
    if ('showSaveFilePicker' in window) {
      try {
        const handle = await (window as any).showSaveFilePicker({
          suggestedName,
          types: [{ description, accept: { [mimeType]: [`.${extension}`] } }],
        });
        const writable = await handle.createWritable();
        await writable.write(blob);
        await writable.close();
        return;
      } catch (err: any) {
        if (err.name === 'AbortError') return;
      }
    }
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = suggestedName;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  const handlePrint = () => {
    logReportAudit('PRINT');
    window.print();
  };

const handleDownloadPDF = async () => {
    if (!reportRef.current || !reportData) return;
    setExportingPdf(true);

    // 1. Reset scroll container so canvas origin starts at 0
    const scrollContainer = reportRef.current.closest('.report-viewer-viewport') as HTMLElement | null;
    if (scrollContainer) {
      scrollContainer.scrollLeft = 0;
    }

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

      // 2. Resolve paper geometry directly from activePageConfig
      const paper = (typeof PAPER_SIZES !== 'undefined' && PAPER_SIZES[activePageConfig?.paperSize])
        ? PAPER_SIZES[activePageConfig.paperSize]
        : { width: 8.5, height: 13 };
      const isLandscape = activePageConfig?.orientation === 'landscape';
      const widthInches = isLandscape ? Math.max(paper.width, paper.height) : Math.min(paper.width, paper.height);
      const heightInches = isLandscape ? Math.min(paper.width, paper.height) : Math.max(paper.width, paper.height);
      const exactWidthPx = Math.ceil(widthInches * 96);

      // 3. Prevent virtual canvas truncation
      const opt = {
        margin: [0, 0, 0, 0],
        filename: `SF2_${reportData.section_name || 'Section'}_${selectedAcademicYear || '2026-2027'}.pdf`,
        image: { type: 'jpeg', quality: 0.98 },
        html2canvas: {
          scale: 2,
          useCORS: true,
          logging: false,
          scrollX: 0,
          scrollY: 0,
          windowWidth: exactWidthPx + 150,
          width: exactWidthPx,
          x: 0,
        },
        jsPDF: {
          unit: 'in',
          format: [widthInches, heightInches],
          orientation: isLandscape ? 'landscape' : 'portrait',
        },
        pagebreak: { mode: ['css', 'legacy'] },
      };

      await html2pdfInstance().from(reportRef.current).set(opt).save();
    } catch {
      handlePrint();
    } finally {
      setExportingPdf(false);
    }
  };



  const handleDownloadExcel = async () => {
    if (!reportRef.current || !reportData) return;
    logReportAudit('EXCEL');
    const excelContent = `
      <html>
        <head><meta charset="utf-8"></head>
        <body>
          ${reportRef.current.innerHTML}
          <br/>
          <table border="0" style="font-size:7pt; color:#000000; font-family:Arial;">
            <tr>
              <td><strong>DOCUMENT TRACKING ID:</strong> ${auditMeta.trackingId}</td>
              <td><strong>DATE &amp; TIME PRINTED:</strong> ${auditMeta.printedAt}</td>
            </tr>
          </table>
        </body>
      </html>
    `;
    const blob = new Blob([excelContent], { type: 'application/vnd.ms-excel;charset=utf-8' });
    await saveFileWithPicker(blob, `${getBaseFilename()}.xls`, 'application/vnd.ms-excel', 'xls', 'Excel Spreadsheet (*.xls)');
  };

  const handleOpenGoogleSheets = () => {
    handleDownloadExcel();
    window.open('https://docs.google.com/spreadsheets/u/0/create', '_blank');
  };

  const handleDownloadWord = async () => {
    if (!reportRef.current || !reportData) return;
    logReportAudit('WORD');
    const wordContent = `
      <html>
        <head><meta charset="utf-8"></head>
        <body>
          ${reportRef.current.innerHTML}
          <br/>
          <p style="font-size:7pt; color:#000000; font-family:Arial;">
            <strong>DOCUMENT TRACKING ID:</strong> ${auditMeta.trackingId} &bull; 
            <strong>DATE &amp; TIME PRINTED:</strong> ${auditMeta.printedAt}
          </p>
        </body>
      </html>
    `;
    const blob = new Blob([wordContent], { type: 'application/msword;charset=utf-8' });
    await saveFileWithPicker(blob, `${getBaseFilename()}.doc`, 'application/msword', 'doc', 'Word Document (*.doc)');
  };

  const handleOpenGoogleDocs = () => {
    handleDownloadWord();
    window.open('https://docs.google.com/document/u/0/create', '_blank');
  };

  const handleDownloadCSV = async () => {
    if (!reportData) return;
    logReportAudit('CSV');
    const headers = ['#', 'LRN', 'Learner Name', 'Sex', ...reportData.school_days.map((d) => `${d.dateNumber}-${d.dayOfWeek}`), 'Absent', 'Tardy', 'Remarks'];
    const rows = [
      ...males.map((m, i) => [i + 1, m.lrn, `"${m.name}"`, m.sex, ...reportData.school_days.map((d) => m.attendance?.[d.dateNumber] || ''), m.total_absent, m.total_tardy, `"${m.remarks || ''}"`]),
      ...females.map((f, i) => [i + 1, f.lrn, `"${f.name}"`, f.sex, ...reportData.school_days.map((d) => f.attendance?.[d.dateNumber] || ''), f.total_absent, f.total_tardy, `"${f.remarks || ''}"`]),
    ];

    const auditMetaComments = [
      `# DOCUMENT TRACKING ID: ${auditMeta.trackingId}`,
      `# DATE AND TIME PRINTED: ${auditMeta.printedAt}`,
    ];

    const csvContent = '\uFEFF' + [...auditMetaComments, headers.join(','), ...rows.map((r) => r.join(','))].join('\r\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    await saveFileWithPicker(blob, `${getBaseFilename()}.csv`, 'text/csv', 'csv', 'CSV Document (*.csv)');
  };

  const handleDownloadJSON = async () => {
    if (!reportData) return;
    logReportAudit('JSON');
    const exportPayload = {
      tracking_id: auditMeta.trackingId,
      date_and_time_printed: auditMeta.printedAt,
      report_data: reportData,
    };
    const blob = new Blob([JSON.stringify(exportPayload, null, 2)], { type: 'application/json' });
    await saveFileWithPicker(blob, `${getBaseFilename()}.json`, 'application/json', 'json', 'JSON Document (*.json)');
  };

  const isRosterEmpty =
    !reportData ||
    reportData.has_enrolled_students === false ||
    ((!reportData.males || reportData.males.length === 0) && (!reportData.females || reportData.females.length === 0));

  // HEADER – DepEd Manual of Style Fonts and Sizes
  const renderHeader = () => (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, marginBottom: 6, width: '100%', boxSizing: 'border-box' }}>
      {/* Seal – 0.76 Inch */}
      <div style={{ flexShrink: 0, width: '0.76in', display: 'flex', justifyContent: 'center' }}>
        {reportData?.left_logo ? (
          <img src={reportData.left_logo} alt="School Seal" style={{ width: '0.76in', height: '0.76in', objectFit: 'contain' }} />
        ) : (
          <div style={{ width: '0.76in', height: '0.76in', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <KagawaranNgEdukasyonLogo size={70} />
          </div>
        )}
      </div>

      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ textAlign: 'center', marginBottom: 6 }}>
          {/* Republic of the Philippines – Old English Text MT (12 point size, bold) */}
          <div style={{ fontFamily: "'Old English Text MT', 'Engravers Old English BT', Georgia, serif", fontSize: '12pt', fontWeight: 'bold', color: '#000000', lineHeight: 1.15 }}>
            Republic of the Philippines
          </div>
          {/* Department of Education – Old English Text MT (18 point size, bold) */}
          <div style={{ fontFamily: "'Old English Text MT', 'Engravers Old English BT', Georgia, serif", fontSize: '18pt', fontWeight: 'bold', color: '#000000', lineHeight: 1.2 }}>
            Department of Education
          </div>
          {/* Name of Regional Office – Tahoma (10 point size, bold) */}
          {reportData?.region && (
            <div style={{ fontFamily: 'Tahoma, sans-serif', fontSize: '10pt', fontWeight: 'bold', color: '#000000', lineHeight: 1.2, marginTop: 1 }}>
              {reportData.region}
            </div>
          )}
          {/* Name of Office – Tahoma (10 point size, bold) */}
          {reportData?.division && (
            <div style={{ fontFamily: 'Tahoma, sans-serif', fontSize: '10pt', fontWeight: 'bold', color: '#000000', lineHeight: 1.2 }}>
              {reportData.division}
            </div>
          )}
          <div style={{ fontSize: '8.8pt', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.4px', margin: '4px 0 0 0', color: '#000000' }}>
            School Form 2 (SF2) Daily Attendance Report of Learners
          </div>
          <div style={{ fontSize: '6.2pt', fontStyle: 'italic', color: '#000000', marginTop: 1 }}>
            (This replaced Form 1, Form 2 &amp; STS Form 4 - Absenteeism and Dropout Profile)
          </div>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 3, width: '100%' }}>
          <div style={{ display: 'flex', alignItems: 'center', width: '100%' }}>
            <div style={{ display: 'flex', alignItems: 'center', width: '28%' }}>
              <span style={{ fontWeight: 700, fontSize: '6.8pt', width: 60, color: '#000000' }}>School ID</span>
              <div style={{ ...fieldBoxStyle, width: 95 }}>{reportData?.school_id || '—'}</div>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', width: '32%' }}>
              <span style={{ fontWeight: 700, fontSize: '6.8pt', width: 72, color: '#000000' }}>School Year</span>
              <div style={{ ...fieldBoxStyle, width: 105 }}>{reportData?.academic_year || '—'}</div>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', width: '40%' }}>
              <span style={{ fontWeight: 700, fontSize: '6.8pt', width: 125, color: '#000000' }}>Report for the Month of</span>
              <div style={{ ...fieldBoxStyle, flex: 1, textAlign: 'left', paddingLeft: 6 }}>
                {reportData?.month} {reportData?.year}
              </div>
            </div>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', width: '100%' }}>
            <div style={{ display: 'flex', alignItems: 'center', width: '50%' }}>
              {/* Name of Office – Tahoma (10 point size, bold) */}
              <span style={{ fontFamily: 'Tahoma, sans-serif', fontSize: '10pt', fontWeight: 'bold', width: 110, color: '#000000' }}>Name of School</span>
              <div style={{ ...fieldBoxStyle, flex: 1, textAlign: 'left', paddingLeft: 6, marginRight: 12, fontFamily: 'Tahoma, sans-serif', fontSize: '10pt', fontWeight: 'bold' }}>
                {reportData?.school_name || '—'}
              </div>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', width: '25%' }}>
              <span style={{ fontWeight: 700, fontSize: '6.8pt', width: 68, color: '#000000' }}>Grade Level</span>
              <div style={{ ...fieldBoxStyle, width: 65, marginRight: 10 }}>{reportData?.grade_level || '—'}</div>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', width: '25%' }}>
              <span style={{ fontWeight: 700, fontSize: '6.8pt', width: 48, color: '#000000' }}>Section</span>
              <div style={{ ...fieldBoxStyle, flex: 1, textAlign: 'left', paddingLeft: 6 }}>
                {reportData?.section_name || '—'}
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Seal – 0.76 Inch */}
      <div style={{ flexShrink: 0, width: '0.76in', display: 'flex', justifyContent: 'center', alignItems: 'center' }}>
        {reportData?.right_logo ? (
          <img src={reportData.right_logo} alt="DepEd Logo" style={{ width: '0.76in', height: '0.76in', objectFit: 'contain' }} />
        ) : (
          <div style={{ width: '0.76in', height: '0.76in', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <DepEdLogoComp className="h-14 w-auto" style={{ maxHeight: '0.76in', maxWidth: '0.76in' }} />
          </div>
        )}
      </div>
    </div>
  );

  const renderTableHeader = () => (
    <thead>
      <tr>
        <th rowSpan={2} style={{ width: '1.8%', ...thCell }}>#</th>
        <th rowSpan={2} style={{ width: '16.0%', ...thCell }}>
          LEARNER'S NAME<br />
          <span style={{ fontSize: '4.2pt', fontWeight: 400, fontStyle: 'italic', color: '#000000' }}>
            (Last Name, First Name, Middle Name)
          </span>
        </th>
        <th colSpan={25} style={{ width: '61.25%', ...thCell, fontSize: '4.8pt' }}>
          (1st row for date, 2nd row for Day: M, T, W, TH, F)
        </th>
        <th colSpan={2} style={{ width: '5.4%', ...thCell }}>Total for Month</th>
        <th rowSpan={2} style={{ width: '15.55%', ...thCell, fontSize: '4.5pt', lineHeight: 1.15, padding: '2px 4px' }}>
          REMARK/S <span style={{ fontSize: '3.9pt', fontWeight: 400, color: '#000000' }}>
            (If DROPPED OUT, state reason, please refer to legend number 2. If TRANSFERRED IN/OUT, write the name of School.)
          </span>
        </th>
      </tr>
      <tr>
        {Array.from({ length: 25 }).map((_, i) => {
          const day = reportData?.school_days ? reportData.school_days[i] : undefined;
          return (
            <th key={`day-col-${i}`} style={{ width: '2.45%', ...thDateCell }}>
              <div>{day ? day.dateNumber : ''}</div>
              <div style={{ fontWeight: 800, fontSize: '4.2pt' }}>{day ? day.dayOfWeek : ''}</div>
            </th>
          );
        })}
        <th style={{ width: '2.7%', ...thCell, fontSize: '4.5pt' }}>ABSENT</th>
        <th style={{ width: '2.7%', ...thCell, fontSize: '4.5pt' }}>TARDY</th>
      </tr>
    </thead>
  );

  const renderSummaryFooter = () => (
    <div style={footerContainerStyle}>
      <div style={guidelinesPanelStyle}>
        <div style={{ fontWeight: 800, fontSize: '5.8pt', marginBottom: 3, color: '#000000' }}>GUIDELINES:</div>
        <div style={ruleTextStyle}>1. Attendance accomplished daily. Refer to codes.</div>
        <div style={ruleTextStyle}>2. Dates written beside learner name.</div>
        <div style={ruleTextStyle}>3. Computations:</div>
        <div style={formulaRowStyle}>
          <span style={{ width: 14 }}>a.</span>
          <span style={{ fontStyle: 'italic', marginRight: 4 }}>% Enrolment =</span>
          <div style={fractionContainerStyle}>
            <span>Registered End of Month</span>
            <div style={fractionBarStyle} />
            <span>Enrolment 1st Friday June</span>
          </div>
          <span style={{ marginLeft: 6 }}>x 100</span>
        </div>
        <div style={formulaRowStyle}>
          <span style={{ width: 14 }}>b.</span>
          <span style={{ fontStyle: 'italic', marginRight: 4 }}>Avg Daily Attendance =</span>
          <div style={fractionContainerStyle}>
            <span>Total Daily Attendance</span>
            <div style={fractionBarStyle} />
            <span>Number of School Days</span>
          </div>
        </div>
        <div style={formulaRowStyle}>
          <span style={{ width: 14 }}>c.</span>
          <span style={{ fontStyle: 'italic', marginRight: 4 }}>% Attendance =</span>
          <div style={fractionContainerStyle}>
            <span>Avg Daily Attendance</span>
            <div style={fractionBarStyle} />
            <span>Registered End of Month</span>
          </div>
          <span style={{ marginLeft: 6 }}>x 100</span>
        </div>
        <div style={{ ...ruleTextStyle, marginTop: 4 }}>
          4. Submit to principal end of month.
        </div>
        <div style={ruleTextStyle}>
          5. Intervene for 5 consecutive absences.
        </div>
      </div>

      <div style={legendPanelStyle}>
        <div style={{ fontWeight: 800, fontSize: '5.4pt', paddingBottom: 2, borderBottom: '1px solid #000000', color: '#000000' }}>
          1. ATTENDANCE CODES
        </div>
        <div style={{ fontSize: '4.6pt', margin: '3px 0 6px 0', color: '#000000' }}>
          <strong>blank</strong>-Present; <strong>(x)</strong>-Absent; Tardy (Upper=Late, Lower=Cutting)
        </div>
        <div style={{ fontWeight: 800, fontSize: '5.4pt', marginBottom: 2, color: '#000000' }}>2. REASONS FOR DROP-OUT</div>
        <div style={{ fontSize: '4.4pt', lineHeight: 1.15, color: '#000000' }}>
          <strong>a. Domestic:</strong> a.1 Sibling care, a.2 Marriage, a.3 Parent attitude, a.4 Family problem<br />
          <strong>b. Individual:</strong> b.1 Illness, b.2 Overage, b.3 Death, b.4 Drug abuse, b.5 Poor academics, b.6 Lack interest, b.7 Hunger<br />
          <strong>c. School:</strong> c.1 Teacher, c.2 Classroom, c.3 Peer influence<br />
          <strong>d. Environment:</strong> d.1 Distance, d.2 Armed conflict, d.3 Calamities<br />
          <strong>e. Financial:</strong> e.1 Child labor &nbsp; <strong>f. Others</strong>
        </div>
      </div>

      <div style={summaryPanelStyle}>
        <table style={metricsTableStyle}>
          <thead>
            <tr>
              <th style={{ width: '27%', ...thCell, textAlign: 'left', paddingLeft: 4 }}>Month: {reportData?.month}</th>
              <th style={{ width: '31%', ...thCell, textAlign: 'left', paddingLeft: 4 }}>Days: {reportData?.school_days ? reportData.school_days.length : 0}</th>
              <th colSpan={3} style={{ width: '42%', ...thCell, fontSize: '4.8pt' }}>Summary for Month</th>
            </tr>
            <tr>
              <th colSpan={2} style={{ ...thCell, backgroundColor: '#ffffff', borderTop: 'none' }}></th>
              <th style={{ width: '14%', ...thCell, fontSize: '4.8pt' }}>M</th>
              <th style={{ width: '14%', ...thCell, fontSize: '4.8pt' }}>F</th>
              <th style={{ width: '14%', ...thCell, fontSize: '4.8pt' }}>TOTAL</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td colSpan={2} style={metricsLabelCell}>Enrolment as of 1st Friday of June</td>
              <td style={centerCell}>{reportData?.metrics?.enrolment_june?.m ?? 0}</td>
              <td style={centerCell}>{reportData?.metrics?.enrolment_june?.f ?? 0}</td>
              <td style={{ ...centerCell, fontWeight: 700 }}>{reportData?.metrics?.enrolment_june?.total ?? 0}</td>
            </tr>
            <tr>
              <td colSpan={2} style={metricsLabelCell}>Late Enrollment during month</td>
              <td style={centerCell}>{reportData?.metrics?.late_enrolment?.m ?? 0}</td>
              <td style={centerCell}>{reportData?.metrics?.late_enrolment?.f ?? 0}</td>
              <td style={{ ...centerCell, fontWeight: 700 }}>{reportData?.metrics?.late_enrolment?.total ?? 0}</td>
            </tr>
            <tr>
              <td colSpan={2} style={metricsLabelCell}>Registered Learner end of month</td>
              <td style={centerCell}>{reportData?.metrics?.registered_end?.m ?? 0}</td>
              <td style={centerCell}>{reportData?.metrics?.registered_end?.f ?? 0}</td>
              <td style={{ ...centerCell, fontWeight: 700 }}>{reportData?.metrics?.registered_end?.total ?? 0}</td>
            </tr>
            <tr>
              <td colSpan={2} style={metricsLabelCell}>Percentage of Enrolment</td>
              <td style={centerCell}>{(reportData?.metrics?.percentage_enrolment?.m ?? 0).toFixed(1)}%</td>
              <td style={centerCell}>{(reportData?.metrics?.percentage_enrolment?.f ?? 0).toFixed(1)}%</td>
              <td style={{ ...centerCell, fontWeight: 700 }}>{(reportData?.metrics?.percentage_enrolment?.total ?? 0).toFixed(1)}%</td>
            </tr>
            <tr>
              <td colSpan={2} style={metricsLabelCell}>Average Daily Attendance</td>
              <td style={centerCell}>{(reportData?.metrics?.average_daily_attendance?.m ?? 0).toFixed(1)}</td>
              <td style={centerCell}>{(reportData?.metrics?.average_daily_attendance?.f ?? 0).toFixed(1)}</td>
              <td style={{ ...centerCell, fontWeight: 700 }}>{(reportData?.metrics?.average_daily_attendance?.total ?? 0).toFixed(1)}</td>
            </tr>
            <tr>
              <td colSpan={2} style={metricsLabelCell}>Percentage of Attendance</td>
              <td style={centerCell}>{(reportData?.metrics?.percentage_attendance?.m ?? 0).toFixed(1)}%</td>
              <td style={centerCell}>{(reportData?.metrics?.percentage_attendance?.f ?? 0).toFixed(1)}%</td>
              <td style={{ ...centerCell, fontWeight: 700 }}>{(reportData?.metrics?.percentage_attendance?.total ?? 0).toFixed(1)}%</td>
            </tr>
            <tr>
              <td colSpan={2} style={metricsLabelCell}>5 consecutive days absences</td>
              <td style={centerCell}>{reportData?.metrics?.consecutive_5_absent_count?.m ?? 0}</td>
              <td style={centerCell}>{reportData?.metrics?.consecutive_5_absent_count?.f ?? 0}</td>
              <td style={{ ...centerCell, fontWeight: 700 }}>{reportData?.metrics?.consecutive_5_absent_count?.total ?? 0}</td>
            </tr>
            <tr>
              <td colSpan={2} style={{ ...metricsLabelCell, fontWeight: 700 }}>Drop out</td>
              <td style={centerCell}>{reportData?.metrics?.drop_out?.m ?? 0}</td>
              <td style={centerCell}>{reportData?.metrics?.drop_out?.f ?? 0}</td>
              <td style={{ ...centerCell, fontWeight: 700 }}>{reportData?.metrics?.drop_out?.total ?? 0}</td>
            </tr>
            <tr>
              <td colSpan={2} style={{ ...metricsLabelCell, fontWeight: 700 }}>Transferred out</td>
              <td style={centerCell}>{reportData?.metrics?.transferred_out?.m ?? 0}</td>
              <td style={centerCell}>{reportData?.metrics?.transferred_out?.f ?? 0}</td>
              <td style={{ ...centerCell, fontWeight: 700 }}>{reportData?.metrics?.transferred_out?.total ?? 0}</td>
            </tr>
            <tr>
              <td colSpan={2} style={{ ...metricsLabelCell, fontWeight: 700 }}>Transferred in</td>
              <td style={centerCell}>{reportData?.metrics?.transferred_in?.m ?? 0}</td>
              <td style={centerCell}>{reportData?.metrics?.transferred_in?.f ?? 0}</td>
              <td style={{ ...centerCell, fontWeight: 700 }}>{reportData?.metrics?.transferred_in?.total ?? 0}</td>
            </tr>
          </tbody>
        </table>

        <div style={{ marginTop: 8, display: 'flex', flexDirection: 'column', width: '100%' }}>
          <div style={{ fontSize: '5pt', fontStyle: 'italic', marginBottom: 8, color: '#000000' }}>I certify that this is true and correct:</div>
          <div style={sigLineStyle}>{reportData?.adviser_name || '\u00A0'}</div>
          <div style={{ textAlign: 'center', fontSize: '4.4pt', marginTop: 1, marginBottom: 8, color: '#000000' }}>(Signature of Teacher over Printed Name)</div>

          <div style={{ fontSize: '5pt', fontStyle: 'italic', marginBottom: 8, color: '#000000' }}>Attested by:</div>
          <div style={sigLineStyle}>{reportData?.school_head || '\u00A0'}</div>
          <div style={{ textAlign: 'center', fontSize: '4.4pt', marginTop: 1, color: '#000000' }}>(Signature of School Head over Printed Name)</div>
        </div>
      </div>
    </div>
  );

  const shouldRepeatHeader = (activePageConfig.headerRepeat || 'all_pages') === 'all_pages';

  return (
    <div className="report-tab-root" style={{ display: 'flex', flexDirection: 'column', height: '100%', backgroundColor: '#f1f5f9' }}>
      <ReportNavBar
        activeReportId={activeReportId}
        onSelectReport={onSelectReport}
        academicYears={availableAcademicYears}
        selectedAcademicYear={selectedAcademicYear}
        onAcademicYearChange={setSelectedAcademicYear}
        showAcademicYearFilter={true}
        sections={sections}
        selectedSectionId={selectedSectionId}
        onSectionChange={setSelectedSectionId}
        selectedGradeLevel={selectedGradeLevel}
        onGradeLevelChange={setSelectedGradeLevel}
        showGradeLevelFilter={true}
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
        onRefresh={fetchSF2}
        isRefreshing={loading}
        onOpenPageSetup={() => setIsPageSetupOpen(true)}
        exportHandlers={{
          onExportPdf: handleDownloadPDF,
          onExportExcel: handleDownloadExcel,
          onExportGoogleSheets: handleOpenGoogleSheets,
          onExportWord: handleDownloadWord,
          onExportGoogleDocs: handleOpenGoogleDocs,
          onExportCsv: handleDownloadCSV,
          onExportJson: handleDownloadJSON,
        }}
        onPrint={handlePrint}
        isExporting={exportingPdf}
      />

      <div className="report-viewer-viewport" style={viewerScrollContainerStyle}>
        {loading ? (
          <div style={loadingStateStyle}>
            <Loader2 className="animate-spin" size={28} color="#0284c7" />
            <span>Loading...</span>
          </div>
        ) : error ? (
          <div style={errorStateStyle}>
            <AlertCircle size={24} color="#dc2626" />
            <span>{error}</span>
          </div>
        ) : reportData ? (
          <div id="sf2-print-document" ref={reportRef} style={{ width: '100%', display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
            {fitsOnSinglePage ? (
              /* ======================================================== */
              /* FITS ON 1 PAGE: ALL SECTIONS STAY TOGETHER ON PAGE 1     */
              /* ======================================================== */
              <div
                className="sf2-page-sheet"
                style={{
                  ...sheetWrapperStyle,
                  ...sheetDimensions,
                  backgroundColor: activePageConfig.pageColor,
                }}
              >
                {renderHeader()}

                <table style={mainTableStyle}>
                  {renderTableHeader()}
                  <tbody>
                    {isRosterEmpty ? (
                      <tr>
                        <td colSpan={30} style={emptyNoticeCellStyle}>
                          Notice: There are no students enrolled in Section {reportData.section_name} for {reportData.month} {reportData.year}.
                        </td>
                      </tr>
                    ) : (
                      <>
                        <tr style={{ backgroundColor: '#f8fafc', fontWeight: 800, height: 16 }}>
                          <td colSpan={30} style={{ ...leftCell, paddingLeft: 6, fontSize: '5.4pt' }}>MALE</td>
                        </tr>
                        {males.map((m, idx) => (
                          <tr key={`m-single-${m.id}`} style={dataRowStyle}>
                            <td style={centerCell}>{idx + 1}</td>
                            <td style={{ ...leftCell, fontWeight: 700 }}>{m.name}</td>
                            {Array.from({ length: 25 }).map((_, i) => {
                              const day = reportData.school_days ? reportData.school_days[i] : undefined;
                              const status = day ? m.attendance?.[day.dateNumber] : undefined;
                              return (
                                <td key={`m-${m.id}-d-${i}`} style={cellDateWrapper}>
                                  <AttendanceCell status={status} />
                                </td>
                              );
                            })}
                            <td style={{ ...centerCell, fontWeight: 700 }}>{m.total_absent || ''}</td>
                            <td style={{ ...centerCell, fontWeight: 700 }}>{m.total_tardy || ''}</td>
                            <td style={leftCell}>{m.remarks || ''}</td>
                          </tr>
                        ))}
                        <tr style={summaryRowStyle}>
                          <td colSpan={2} style={{ ...leftCell, fontWeight: 800 }}>&larr; MALE | TOTAL Per Day &rarr;</td>
                          {Array.from({ length: 25 }).map((_, i) => (
                            <td key={`m-tot-${i}`} style={{ ...centerCell, fontWeight: 800 }}>{dailyAttendanceTotals.males[i] || ''}</td>
                          ))}
                          <td style={{ ...centerCell, fontWeight: 800 }}>{males.reduce((acc, cur) => acc + (cur.total_absent || 0), 0)}</td>
                          <td style={{ ...centerCell, fontWeight: 800 }}>{males.reduce((acc, cur) => acc + (cur.total_tardy || 0), 0)}</td>
                          <td style={centerCell}></td>
                        </tr>

                        <tr style={{ backgroundColor: '#f8fafc', fontWeight: 800, height: 16 }}>
                          <td colSpan={30} style={{ ...leftCell, paddingLeft: 6, fontSize: '5.4pt' }}>FEMALE</td>
                        </tr>
                        {females.map((f, idx) => (
                          <tr key={`f-single-${f.id}`} style={dataRowStyle}>
                            <td style={centerCell}>{idx + 1}</td>
                            <td style={{ ...leftCell, fontWeight: 700 }}>{f.name}</td>
                            {Array.from({ length: 25 }).map((_, i) => {
                              const day = reportData.school_days ? reportData.school_days[i] : undefined;
                              const status = day ? f.attendance?.[day.dateNumber] : undefined;
                              return (
                                <td key={`f-${f.id}-d-${i}`} style={cellDateWrapper}>
                                  <AttendanceCell status={status} />
                                </td>
                              );
                            })}
                            <td style={{ ...centerCell, fontWeight: 700 }}>{f.total_absent || ''}</td>
                            <td style={{ ...centerCell, fontWeight: 700 }}>{f.total_tardy || ''}</td>
                            <td style={leftCell}>{f.remarks || ''}</td>
                          </tr>
                        ))}
                        <tr style={summaryRowStyle}>
                          <td colSpan={2} style={{ ...leftCell, fontWeight: 800 }}>&larr; FEMALE | TOTAL Per Day &rarr;</td>
                          {Array.from({ length: 25 }).map((_, i) => (
                            <td key={`f-tot-${i}`} style={{ ...centerCell, fontWeight: 800 }}>{dailyAttendanceTotals.females[i] || ''}</td>
                          ))}
                          <td style={{ ...centerCell, fontWeight: 800 }}>{females.reduce((acc, cur) => acc + (cur.total_absent || 0), 0)}</td>
                          <td style={{ ...centerCell, fontWeight: 800 }}>{females.reduce((acc, cur) => acc + (cur.total_tardy || 0), 0)}</td>
                          <td style={centerCell}></td>
                        </tr>

                        <tr style={{ ...summaryRowStyle, backgroundColor: '#e2e8f0' }}>
                          <td colSpan={2} style={{ ...leftCell, fontWeight: 900 }}>Combined TOTAL PER DAY</td>
                          {Array.from({ length: 25 }).map((_, i) => (
                            <td key={`c-tot-${i}`} style={{ ...centerCell, fontWeight: 900 }}>{dailyAttendanceTotals.combined[i] || ''}</td>
                          ))}
                          <td style={{ ...centerCell, fontWeight: 900 }}>
                            {males.reduce((acc, cur) => acc + (cur.total_absent || 0), 0) +
                              females.reduce((acc, cur) => acc + (cur.total_absent || 0), 0)}
                          </td>
                          <td style={{ ...centerCell, fontWeight: 900 }}>
                            {males.reduce((acc, cur) => acc + (cur.total_tardy || 0), 0) +
                              females.reduce((acc, cur) => acc + (cur.total_tardy || 0), 0)}
                          </td>
                          <td style={centerCell}></td>
                        </tr>
                      </>
                    )}
                  </tbody>
                </table>

                {renderSummaryFooter()}

               
                <div style={auditFooterContainerStyle}>
                  <div>
                    <span>Document Tracking ID: <strong>{auditMeta.trackingId}</strong></span>
                  </div>
                  <div>
                    <span>Date and Time Printed: <strong>{auditMeta.printedAt}</strong></span>
                    <span> &bull; Page 1 of 1</span>
                  </div>
                </div>
              </div>
            ) : (
              /* ======================================================== */
              /* CANNOT FIT ON 1 PAGE: SPLITS ACROSS PAGES 1 AND 2        */
              /* ======================================================== */
              <>
                {/* PAGE 1: MALE COHORT */}
                <div
                  className="sf2-page-sheet"
                  style={{
                    ...sheetWrapperStyle,
                    ...sheetDimensions,
                    backgroundColor: activePageConfig.pageColor,
                  }}
                >
                  {renderHeader()}
                  <table style={mainTableStyle}>
                    {renderTableHeader()}
                    <tbody>
                      {isRosterEmpty ? (
                        <tr>
                          <td colSpan={30} style={emptyNoticeCellStyle}>
                            Notice: There are no students enrolled in Section {reportData.section_name} for {reportData.month} {reportData.year}.
                          </td>
                        </tr>
                      ) : (
                        <>
                          <tr style={{ backgroundColor: '#f8fafc', fontWeight: 800, height: 16 }}>
                            <td colSpan={30} style={{ ...leftCell, paddingLeft: 6, fontSize: '5.4pt' }}>MALE</td>
                          </tr>
                          {males.map((m, idx) => (
                            <tr key={`male-${m.id}`} style={dataRowStyle}>
                              <td style={centerCell}>{idx + 1}</td>
                              <td style={{ ...leftCell, fontWeight: 700 }}>{m.name}</td>
                              {Array.from({ length: 25 }).map((_, i) => {
                                const day = reportData.school_days ? reportData.school_days[i] : undefined;
                                const status = day ? m.attendance?.[day.dateNumber] : undefined;
                                return (
                                  <td key={`m-${m.id}-d-${i}`} style={cellDateWrapper}>
                                    <AttendanceCell status={status} />
                                  </td>
                                );
                              })}
                              <td style={{ ...centerCell, fontWeight: 700 }}>{m.total_absent || ''}</td>
                              <td style={{ ...centerCell, fontWeight: 700 }}>{m.total_tardy || ''}</td>
                              <td style={leftCell}>{m.remarks || ''}</td>
                            </tr>
                          ))}
                          <tr style={summaryRowStyle}>
                            <td colSpan={2} style={{ ...leftCell, fontWeight: 800 }}>&larr; MALE | TOTAL Per Day &rarr;</td>
                            {Array.from({ length: 25 }).map((_, i) => (
                              <td key={`m-tot-${i}`} style={{ ...centerCell, fontWeight: 800 }}>{dailyAttendanceTotals.males[i] || ''}</td>
                            ))}
                            <td style={{ ...centerCell, fontWeight: 800 }}>{males.reduce((acc, cur) => acc + (cur.total_absent || 0), 0)}</td>
                            <td style={{ ...centerCell, fontWeight: 800 }}>{males.reduce((acc, cur) => acc + (cur.total_tardy || 0), 0)}</td>
                            <td style={centerCell}></td>
                          </tr>
                        </>
                      )}
                    </tbody>
                  </table>

                  <div style={auditFooterContainerStyle}>
                    <div>
                      <span>Document Tracking ID: <strong>{auditMeta.trackingId}</strong></span>
                    </div>
                    <div>
                      <span>Date and Time Printed: <strong>{auditMeta.printedAt}</strong></span>
                      <span> &bull; Page 1 of 2</span>
                    </div>
                  </div>
                </div>

                {/* PAGE 2: FEMALE COHORT & SUMMARY */}
                <div
                  className="sf2-page-sheet"
                  style={{
                    ...sheetWrapperStyle,
                    ...sheetDimensions,
                    backgroundColor: activePageConfig.pageColor,
                    pageBreakBefore: 'always',
                  }}
                >
                  {/* Header: Rendered only if "Every Page" is selected */}
                  {shouldRepeatHeader && renderHeader()}

                  <table style={mainTableStyle}>
                    {renderTableHeader()}
                    <tbody>
                      {isRosterEmpty ? (
                        <tr>
                          <td colSpan={30} style={emptyNoticeCellStyle}>
                            Notice: There are no students enrolled in Section {reportData.section_name} for {reportData.month} {reportData.year}.
                          </td>
                        </tr>
                      ) : (
                        <>
                          <tr style={{ backgroundColor: '#f8fafc', fontWeight: 800, height: 16 }}>
                            <td colSpan={30} style={{ ...leftCell, paddingLeft: 6, fontSize: '5.4pt' }}>FEMALE</td>
                          </tr>
                          {females.map((f, idx) => (
                            <tr key={`female-${f.id}`} style={dataRowStyle}>
                              <td style={centerCell}>{idx + 1}</td>
                              <td style={{ ...leftCell, fontWeight: 700 }}>{f.name}</td>
                              {Array.from({ length: 25 }).map((_, i) => {
                                const day = reportData.school_days ? reportData.school_days[i] : undefined;
                                const status = day ? f.attendance?.[day.dateNumber] : undefined;
                                return (
                                  <td key={`f-${f.id}-d-${i}`} style={cellDateWrapper}>
                                    <AttendanceCell status={status} />
                                  </td>
                                );
                              })}
                              <td style={{ ...centerCell, fontWeight: 700 }}>{f.total_absent || ''}</td>
                              <td style={{ ...centerCell, fontWeight: 700 }}>{f.total_tardy || ''}</td>
                              <td style={leftCell}>{f.remarks || ''}</td>
                            </tr>
                          ))}
                          <tr style={summaryRowStyle}>
                            <td colSpan={2} style={{ ...leftCell, fontWeight: 800 }}>&larr; FEMALE | TOTAL Per Day &rarr;</td>
                            {Array.from({ length: 25 }).map((_, i) => (
                              <td key={`f-tot-${i}`} style={{ ...centerCell, fontWeight: 800 }}>{dailyAttendanceTotals.females[i] || ''}</td>
                            ))}
                            <td style={{ ...centerCell, fontWeight: 800 }}>{females.reduce((acc, cur) => acc + (cur.total_absent || 0), 0)}</td>
                            <td style={{ ...centerCell, fontWeight: 800 }}>{females.reduce((acc, cur) => acc + (cur.total_tardy || 0), 0)}</td>
                            <td style={centerCell}></td>
                          </tr>

                          <tr style={{ ...summaryRowStyle, backgroundColor: '#e2e8f0' }}>
                            <td colSpan={2} style={{ ...leftCell, fontWeight: 900 }}>Combined TOTAL PER DAY</td>
                            {Array.from({ length: 25 }).map((_, i) => (
                              <td key={`c-tot-${i}`} style={{ ...centerCell, fontWeight: 900 }}>{dailyAttendanceTotals.combined[i] || ''}</td>
                            ))}
                            <td style={{ ...centerCell, fontWeight: 900 }}>
                              {males.reduce((acc, cur) => acc + (cur.total_absent || 0), 0) +
                                females.reduce((acc, cur) => acc + (cur.total_absent || 0), 0)}
                            </td>
                            <td style={{ ...centerCell, fontWeight: 900 }}>
                              {males.reduce((acc, cur) => acc + (cur.total_tardy || 0), 0) +
                                females.reduce((acc, cur) => acc + (cur.total_tardy || 0), 0)}
                            </td>
                            <td style={centerCell}></td>
                          </tr>
                        </>
                      )}
                    </tbody>
                  </table>

                  {renderSummaryFooter()}

                  {/* FOOTER: Division Seal/School Seal – 0.76 Inch & Office Details – Calibri 10pt */}
                  {/* <div style={officialFooterStyle}>
                    <div style={{ flexShrink: 0, width: '0.76in', display: 'flex', justifyContent: 'center', alignItems: 'center' }}>
                      {reportData?.right_logo ? (
                        <img src={reportData.right_logo} alt="Division / School Seal" style={{ width: '0.76in', height: '0.76in', objectFit: 'contain' }} />
                      ) : reportData?.left_logo ? (
                        <img src={reportData.left_logo} alt="Division / School Seal" style={{ width: '0.76in', height: '0.76in', objectFit: 'contain' }} />
                      ) : (
                        <div style={{ width: '0.76in', height: '0.76in', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                          <KagawaranNgEdukasyonLogo size={70} />
                        </div>
                      )}
                    </div>
                    <div style={officeDetailsTextStyle}>
                      <div><strong>{reportData?.school_name || 'Department of Education'}</strong> &bull; {reportData?.division || ''} &bull; {reportData?.district || ''}</div>
                      <div>Address: {reportData?.district || ''}, {reportData?.division || ''}, {reportData?.region || ''} &bull; Contact Numbers: Official Records &bull; Email Address: deped.gov.ph</div>
                    </div>
                  </div> */}

                  <div style={auditFooterContainerStyle}>
                    <div>
                      <span>Document Tracking ID: <strong>{auditMeta.trackingId}</strong></span>
                    </div>
                    <div>
                      <span>Date and Time Printed: <strong>{auditMeta.printedAt}</strong></span>
                      <span> &bull; Page 2 of 2</span>
                    </div>
                  </div>
                </div>
              </>
            )}
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
        reportTitle="SF2 Daily Attendance"
      />

      {/* Pure White Background Print CSS */}
      <style>{`
        @media print {
          @page {
            size: ${activePageConfig.paperSize === 'folio' ? '8.5in 13in' : activePageConfig.paperSize} ${activePageConfig.orientation};
            margin: ${activePageConfig.margins.top}in ${activePageConfig.margins.right}in ${activePageConfig.margins.bottom}in ${activePageConfig.margins.left}in;
          }
          
          html,
          body,
          #root,
          body > div,
          body > div > div,
          main,
          .report-tab-root,
          .report-viewer-viewport {
            margin: 0 !important;
            padding: 0 !important;
            height: auto !important;
            min-height: 100% !important;
            background-color: #ffffff !important;
            background: #ffffff !important;
            box-shadow: none !important;
            -webkit-print-color-adjust: exact !important;
            print-color-adjust: exact !important;
          }

          .no-print,
          nav,
          aside,
          header {
            display: none !important;
          }

          main {
            margin: 0 !important;
            padding: 0 !important;
            overflow: visible !important;
            height: auto !important;
            display: block !important;
            width: 100% !important;
            background-color: #ffffff !important;
            background: #ffffff !important;
          }

          div {
            overflow: visible !important;
          }

          #sf2-print-document {
            width: 100% !important;
            max-width: 100% !important;
            margin: 0 !important;
            padding: 0 !important;
            display: block !important;
          }

          .sf2-page-sheet {
            width: 100% !important;
            max-width: 100% !important;
            margin: 0 !important;
            padding: 0 !important;
            box-shadow: none !important;
            border: none !important;
            background-color: #ffffff !important;
            background: #ffffff !important;
            page-break-after: always !important;
            break-after: page !important;
          }

          .sf2-page-sheet:last-child {
            page-break-after: avoid !important;
            break-after: avoid !important;
          }

          table {
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

// ==========================================
// STYLES
// ==========================================
const fieldBoxStyle: React.CSSProperties = {
  minHeight: 17,
  lineHeight: '17px',
  border: '1.2px solid #000000',
  backgroundColor: '#ffffff',
  textAlign: 'center',
  fontWeight: 700,
  fontSize: '7pt',
  color: '#000000',
  padding: '0 4px',
  boxSizing: 'border-box',
};

const viewerScrollContainerStyle: React.CSSProperties = {
  flex: 1,
  overflowY: 'auto',
  overflowX: 'hidden',
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
  fontSize: '5pt',
  border: '1.2px solid #000000',
  boxSizing: 'border-box',
};

const thCell: React.CSSProperties = {
  border: '1px solid #000000',
  padding: '2px 1px',
  backgroundColor: '#ffffff',
  fontWeight: 700,
  textAlign: 'center',
  verticalAlign: 'middle',
  boxSizing: 'border-box',
  color: '#000000',
};

const thDateCell: React.CSSProperties = {
  border: '1px solid #000000',
  padding: '1px 0',
  backgroundColor: '#ffffff',
  fontWeight: 700,
  textAlign: 'center',
  verticalAlign: 'middle',
  fontSize: '4.8pt',
  lineHeight: 1.1,
  boxSizing: 'border-box',
  color: '#000000',
};

const dataRowStyle: React.CSSProperties = {
  borderBottom: '1px solid #000000',
  verticalAlign: 'middle',
  height: '16px',
};

const summaryRowStyle: React.CSSProperties = {
  borderTop: '1px solid #000000',
  borderBottom: '1px solid #000000',
  backgroundColor: '#f1f5f9',
  height: '16px',
  color: '#000000',
};

const centerCell: React.CSSProperties = {
  textAlign: 'center',
  border: '1px solid #000000',
  padding: '0px',
  verticalAlign: 'middle',
  boxSizing: 'border-box',
  color: '#000000',
};

const cellDateWrapper: React.CSSProperties = {
  textAlign: 'center',
  border: '1px solid #000000',
  padding: '0px',
  verticalAlign: 'middle',
  boxSizing: 'border-box',
  height: '16px',
};

const leftCell: React.CSSProperties = {
  textAlign: 'left',
  border: '1px solid #000000',
  padding: '1px 3px',
  verticalAlign: 'middle',
  whiteSpace: 'nowrap',
  overflow: 'hidden',
  textOverflow: 'ellipsis',
  boxSizing: 'border-box',
  color: '#000000',
};

const emptyNoticeCellStyle: React.CSSProperties = {
  textAlign: 'center',
  padding: '30px 14px',
  fontSize: '6.4pt',
  fontWeight: 700,
  color: '#000000',
  backgroundColor: '#ffffff',
  border: '1px solid #000000',
};

const footerContainerStyle: React.CSSProperties = {
  display: 'grid',
  gridTemplateColumns: '4.4fr 2.5fr 3.1fr',
  gap: 8,
  marginTop: 6,
  alignItems: 'start',
  width: '100%',
  boxSizing: 'border-box',
  color: '#000000',
};

const guidelinesPanelStyle: React.CSSProperties = {
  fontSize: '4.5pt',
  lineHeight: 1.15,
  boxSizing: 'border-box',
  minWidth: 0,
  color: '#000000',
};

const ruleTextStyle: React.CSSProperties = {
  marginBottom: 2,
  color: '#000000',
};

const formulaRowStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  margin: '2px 0',
  color: '#000000',
};

const fractionContainerStyle: React.CSSProperties = {
  display: 'inline-flex',
  flexDirection: 'column',
  alignItems: 'center',
  margin: '0 3px',
  color: '#000000',
};

const fractionBarStyle: React.CSSProperties = {
  width: '100%',
  height: 1,
  backgroundColor: '#000000',
};

const legendPanelStyle: React.CSSProperties = {
  border: '1.2px solid #000000',
  padding: '4px 6px',
  boxSizing: 'border-box',
  minWidth: 0,
  color: '#000000',
};

const summaryPanelStyle: React.CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  width: '100%',
  boxSizing: 'border-box',
  minWidth: 0,
  color: '#000000',
};

const metricsTableStyle: React.CSSProperties = {
  width: '100%',
  tableLayout: 'fixed',
  borderCollapse: 'collapse',
  fontSize: '4.5pt',
  border: '1.2px solid #000000',
  boxSizing: 'border-box',
  color: '#000000',
};

const metricsLabelCell: React.CSSProperties = {
  border: '1px solid #000000',
  padding: '1px 3px',
  textAlign: 'left',
  boxSizing: 'border-box',
  color: '#000000',
};

const sigLineStyle: React.CSSProperties = {
  borderBottom: '1px solid #000000',
  minHeight: 14,
  display: 'flex',
  alignItems: 'flex-end',
  justifyContent: 'center',
  fontWeight: 800,
  fontSize: '5.8pt',
  textTransform: 'uppercase',
  paddingBottom: 1,
  width: '100%',
  boxSizing: 'border-box',
  color: '#000000',
};


const auditFooterContainerStyle: React.CSSProperties = {
  display: 'flex',
  justifyContent: 'space-between',
  alignItems: 'center',
  fontSize: '5pt',
  color: '#000000',
  marginTop: 6,
  paddingTop: 3,
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
  fontWeight: 600,
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

export default SF2ReportTab;