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
  left_logo?: string;
  right_logo?: string;
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

export const SF4ReportTab: React.FC<SF4ReportTabProps> = ({
  activeReportId = 'sf4',
  onSelectReport = () => {},
}) => {
  const [selectedAcademicYear, setSelectedAcademicYear] = useState<string>('2026-2027');
  const [selectedMonth, setSelectedMonth] = useState<string>('October');
  const [selectedYear, setSelectedYear] = useState<number>(new Date().getFullYear());
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [reportData, setReportData] = useState<SF4ReportData | null>(null);
  const [loading, setLoading] = useState<boolean>(false);
  const [exportingPdf, setExportingPdf] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [isPageSetupOpen, setIsPageSetupOpen] = useState(false);

  // Persistent Page Setup Configuration — Folio Landscape Default
  const { config: savedPageConfig, saveConfig: savePageConfig } = usePageSetup('sf4');
  const [activePageConfig, setActivePageConfig] = useState<PageSetupConfig>(() => ({
    ...savedPageConfig,
    orientation: 'landscape',
    paperSize: savedPageConfig.paperSize || 'folio',
  }));

  useEffect(() => {
    setActivePageConfig((prev) => ({
      ...savedPageConfig,
      orientation: savedPageConfig.orientation || 'landscape',
      paperSize: savedPageConfig.paperSize || prev.paperSize || 'folio',
    }));
  }, [savedPageConfig]);

  const reportRef = useRef<HTMLDivElement>(null);

  const fetchSF4 = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await apiClient.get<SF4ReportData>(
        `/reports/sf4/?month=${selectedMonth}&year=${selectedYear}&school_year=${selectedAcademicYear}`
      );
      setReportData(res.data);
    } catch (err: any) {
      setError(err.response?.data?.error || 'Failed to retrieve official DepEd SF4 report data.');
    } finally {
      setLoading(false);
    }
  }, [selectedMonth, selectedYear, selectedAcademicYear]);

  useEffect(() => {
    fetchSF4();
  }, [fetchSF4]);

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
    const trackingId = `DOC-SF4-${schoolIdStr}-${dateStamp}-${timeCode}`;

    return { printedAt, trackingId };
  }, [reportData]);

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

  // Dynamic Pagination Engine with Real Row Height (0.24in per row)
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

    const paper = PAPER_SIZES[activePageConfig.paperSize] || PAPER_SIZES.folio;
    const isLandscape = activePageConfig.orientation === 'landscape';
    const pageHeightInches = isLandscape ? paper.width : paper.height;
    const printableHeight = Math.max(
      4,
      pageHeightInches - (activePageConfig.margins.top || 0.25) - (activePageConfig.margins.bottom || 0.25)
    );

    const fullHeaderH = 1.60;
    const theadH = 0.75;
    const footerH = 1.70;
    const trackingH = 0.25;
    const rowH = 0.24;

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
      const isFirstPage = pages.length === 0;
      const showFullHeader = isFirstPage || (activePageConfig.headerRepeat || 'all_pages') === 'all_pages';
      const overheadWithoutFooter = (showFullHeader ? fullHeaderH : 0) + theadH + trackingH;
      const pageCapacity = Math.floor((printableHeight - overheadWithoutFooter) / rowH);

      if (currentRowsCount + groupRows <= pageCapacity) {
        currentGroups.push(g);
        currentRowsCount += groupRows;
      } else {
        if (currentGroups.length > 0) {
          pages.push({
            pageNumber: pages.length + 1,
            groups: currentGroups,
            isFinalPage: false,
            showFullHeader,
          });
        }
        currentGroups = [g];
        currentRowsCount = groupRows;
      }
    }

    if (currentGroups.length > 0) {
      const pageNum = pages.length + 1;
      const showFullHeader = pageNum === 1 || (activePageConfig.headerRepeat || 'all_pages') === 'all_pages';
      pages.push({
        pageNumber: pageNum,
        groups: currentGroups,
        isFinalPage: true,
        showFullHeader,
      });
    }

    const totalPages: number = pages.length;
    return pages.map((p) => ({ ...p, totalPages }));
  }, [activePageConfig, filteredGradeGroups]);

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

    const paper = PAPER_SIZES[activePageConfig.paperSize] || PAPER_SIZES.folio;
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

  const getBaseFilename = () => {
    const now = new Date();
    const pad = (n: number) => String(n).padStart(2, '0');
    const timestamp = `${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}_${pad(now.getHours())}${pad(now.getMinutes())}${pad(now.getSeconds())}`;
    return `SF4_Report_${selectedMonth}_${selectedYear}_${timestamp}`;
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

      const isLandscape = activePageConfig.orientation === 'landscape';
      const isPageless = activePageConfig.layoutMode === 'pageless';
      const isSingle = paginatedPages.length === 1;
      const paper = PAPER_SIZES[activePageConfig.paperSize] || PAPER_SIZES.folio;
      const widthInches = isLandscape ? paper.height : paper.width;

      let jsPdfFormat: string | number[] =
        activePageConfig.paperSize === 'folio' ? [8.5, 13] : activePageConfig.paperSize;

      if (isPageless && reportRef.current) {
        const scrollHeightPx = reportRef.current.scrollHeight;
        const scrollWidthPx = reportRef.current.scrollWidth;
        const approxHeightInches = Number((scrollHeightPx / 96).toFixed(2)) + 0.3;
        const approxWidthInches = Number((scrollWidthPx / 96).toFixed(2)) || widthInches;
        jsPdfFormat = [approxWidthInches, approxHeightInches];
      }

      const opt = {
        margin: [0, 0, 0, 0],
        filename: `${getBaseFilename()}.pdf`,
        image: { type: 'jpeg', quality: 0.98 },
        html2canvas: { scale: 2, useCORS: true, logging: false },
        jsPDF: {
          unit: 'in',
          format: jsPdfFormat,
          orientation: isLandscape ? 'landscape' : 'portrait',
        },
        pagebreak: isSingle || isPageless ? { mode: [] } : { mode: ['css', 'legacy'] },
      };

      const pdfBlob: Blob = await html2pdfInstance().from(reportRef.current).set(opt).outputPdf('blob');
      await saveFileWithPicker(pdfBlob, `${getBaseFilename()}.pdf`, 'application/pdf', 'pdf', 'PDF Document (*.pdf)');
    } catch {
      alert('Unable to generate PDF directly. Please choose Print and save as PDF.');
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
    await saveFileWithPicker(blob, `${getBaseFilename()}.xls`, 'application/vnd.ms-excel', 'xls', 'Excel Worksheet (*.xls)');
  };

  const handleExportGoogleSheets = () => {
    handleExportExcel();
    window.open('https://sheets.new', '_blank');
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
    await saveFileWithPicker(blob, `${getBaseFilename()}.doc`, 'application/msword', 'doc', 'Word Document (*.doc)');
  };

  const handleExportGoogleDocs = () => {
    handleExportWord();
    window.open('https://docs.new', '_blank');
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
        rows.push([
          `"${s.adviser_name}"`, `"${s.grade_level}"`, `"${s.section_name}"`,
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

    const auditMetaComments = [
      `# DOCUMENT TRACKING ID: ${auditMeta.trackingId}`,
      `# DATE AND TIME PRINTED: ${auditMeta.printedAt}`,
    ];

    const csvContent = '\uFEFF' + [...auditMetaComments, headers.join(','), ...rows.map((r) => r.join(','))].join('\r\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    await saveFileWithPicker(blob, `${getBaseFilename()}.csv`, 'text/csv', 'csv', 'CSV Document (*.csv)');
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
    await saveFileWithPicker(blob, `${getBaseFilename()}.json`, 'application/json', 'json', 'JSON Document (*.json)');
  };

  // Official DepEd SF4 Header Component (DepEd Manual of Style Fonts and Sizes)
  const renderHeader = () => (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 14, marginBottom: 8, width: '100%', boxSizing: 'border-box' }}>
      {/* Seal – 0.76 Inch */}
      <div style={{ flexShrink: 0, width: '0.76in', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}>
        {reportData?.left_logo ? (
          <img src={reportData.left_logo} alt="Republic Seal" style={{ width: '0.76in', height: '0.76in', objectFit: 'contain' }} />
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
          <div style={{ fontFamily: 'Arial, sans-serif', fontSize: '10.5pt', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.5px', marginTop: 3, color: '#000000' }}>
            School Form 4 (SF4) Monthly Learner's Movement and Attendance
          </div>
          <div style={{ fontFamily: 'Arial, sans-serif', fontSize: '7.5pt', fontStyle: 'italic', color: '#000000', marginTop: 1 }}>
            (This replaced Form 3 &amp; STS Form 4-Absenteeism and Dropout Profile)
          </div>
        </div>

        {/* Administrative Metadata Rows */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4, width: '100%' }}>
          <div style={{ display: 'flex', alignItems: 'center', width: '100%' }}>
            <div style={{ display: 'flex', alignItems: 'center', width: '25%' }}>
              <span style={fieldLabelStyle}>School ID</span>
              <div style={{ ...fieldBoxStyle, width: 110 }}>{reportData?.school_id || ''}</div>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', width: '25%' }}>
              {/* Name of Regional Office – Tahoma (10 point size, bold) */}
              <span style={{ ...fieldLabelStyle, fontFamily: 'Tahoma, sans-serif', fontSize: '10pt', fontWeight: 'bold' }}>Region</span>
              <div style={{ ...fieldBoxStyle, flex: 1, textAlign: 'left', paddingLeft: 6, fontFamily: 'Tahoma, sans-serif', fontSize: '10pt', fontWeight: 'bold' }}>{reportData?.region || ''}</div>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', width: '25%', paddingLeft: 10 }}>
              {/* Name of Office – Tahoma (10 point size, bold) */}
              <span style={{ ...fieldLabelStyle, fontFamily: 'Tahoma, sans-serif', fontSize: '10pt', fontWeight: 'bold' }}>Division</span>
              <div style={{ ...fieldBoxStyle, flex: 1, textAlign: 'left', paddingLeft: 6, fontFamily: 'Tahoma, sans-serif', fontSize: '10pt', fontWeight: 'bold' }}>{reportData?.division || ''}</div>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', width: '25%', paddingLeft: 10 }}>
              <span style={fieldLabelStyle}>District</span>
              <div style={{ ...fieldBoxStyle, flex: 1, textAlign: 'left', paddingLeft: 6 }}>{reportData?.district || ''}</div>
            </div>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', width: '100%' }}>
            <div style={{ display: 'flex', alignItems: 'center', width: '48%' }}>
              {/* Name of Office (School Name) – Tahoma (10 point size, bold) */}
              <span style={{ ...fieldLabelStyle, fontFamily: 'Tahoma, sans-serif', fontSize: '10pt', fontWeight: 'bold' }}>School Name</span>
              <div style={{ ...fieldBoxStyle, flex: 1, textAlign: 'left', paddingLeft: 6, marginRight: 10, fontFamily: 'Tahoma, sans-serif', fontSize: '10pt', fontWeight: 'bold' }}>
                {reportData?.school_name || ''}
              </div>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', width: '24%' }}>
              <span style={fieldLabelStyle}>School Year</span>
              <div style={{ ...fieldBoxStyle, flex: 1, marginRight: 10 }}>{reportData?.school_year || selectedAcademicYear}</div>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', width: '28%' }}>
              <span style={{ ...fieldLabelStyle, width: 145 }}>Report for the Month of</span>
              <div style={{ ...fieldBoxStyle, flex: 1, textAlign: 'left', paddingLeft: 6 }}>
                {reportData?.month} {reportData?.year}
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

  // Official DepEd SF4 3-Tier Header Columns (NAME OF ADVISER, GRADE/YEAR LEVEL, SECTION)
  const renderTableHeader = () => (
    <thead>
      <tr>
        <th rowSpan={3} style={{ width: '9.2%', ...thCell }}>NAME OF ADVISER</th>
        <th rowSpan={3} style={{ width: '6.4%', ...thCell }}>
          GRADE/<br />YEAR<br />LEVEL
        </th>
        <th rowSpan={3} style={{ width: '6.2%', ...thCell }}>SECTION</th>
        <th colSpan={3} rowSpan={2} style={{ width: '6.8%', ...thCell }}>
          REGISTERED LEARNER<br />
          <span style={subHeaderSpan}>(As of End of the Month)</span>
        </th>
        <th colSpan={6} style={{ width: '13.0%', ...thCell }}>ATTENDANCE</th>
        <th colSpan={9} style={{ width: '19.4%', ...thCell }}>DROPPED OUT</th>
        <th colSpan={9} style={{ width: '19.5%', ...thCell }}>TRANSFERRED OUT</th>
        <th colSpan={9} style={{ width: '19.5%', ...thCell }}>TRANSFERRED IN</th>
      </tr>
      <tr>
        <th colSpan={3} style={{ ...thCell, fontSize: '6.5pt' }}>Daily Average</th>
        <th colSpan={3} style={{ ...thCell, fontSize: '6.5pt' }}>Percentage for the Month</th>
        <th colSpan={3} style={{ ...thCell, fontSize: '5.8pt' }}>(A) Cumulative as of<br />Previous Month</th>
        <th colSpan={3} style={{ ...thCell, fontSize: '5.8pt' }}>(B) For the Month</th>
        <th colSpan={3} style={{ ...thCell, fontSize: '5.8pt' }}>(A+B) Cumulative as of<br />End of the Month</th>
        <th colSpan={3} style={{ ...thCell, fontSize: '5.8pt' }}>(A) Cumulative as of<br />Previous Month</th>
        <th colSpan={3} style={{ ...thCell, fontSize: '5.8pt' }}>(B) For the Month</th>
        <th colSpan={3} style={{ ...thCell, fontSize: '5.8pt' }}>(A+B) Cumulative as of<br />End of the Month</th>
        <th colSpan={3} style={{ ...thCell, fontSize: '5.8pt' }}>(A) Cumulative as of<br />Previous Month</th>
        <th colSpan={3} style={{ ...thCell, fontSize: '5.8pt' }}>(B) For the Month</th>
        <th colSpan={3} style={{ ...thCell, fontSize: '5.8pt' }}>(A+B) Cumulative as of<br />End of the Month</th>
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
  );

  const renderMetricCells = (triplet?: MetricTriplet) => (
    <>
      <td style={centerCell}>{triplet ? triplet.m : 0}</td>
      <td style={centerCell}>{triplet ? triplet.f : 0}</td>
      <td style={{ ...centerCell, fontWeight: 700 }}>{triplet ? triplet.total : 0}</td>
    </>
  );

  const renderSummaryFooter = () => (
    <div style={footerContainerStyle}>
      <div style={guidelinesPanelStyle}>
        <div style={{ fontWeight: 800, fontSize: '8.5pt', marginBottom: 3, color: '#000000', fontFamily: 'Calibri, sans-serif' }}>
          GUIDELINES:
        </div>
        <div style={ruleTextStyle}>
          1. This forms shall be accomplished every end of the month using the summary box of SF2 submitted by the teachers/advisers to update figures for the month.
        </div>
        <div style={ruleTextStyle}>
          2. Furnish copy to Division Office: a week after June 30, October 30 &amp; March 31.
        </div>
        <div style={ruleTextStyle}>
          3. Only teachers who are handling advisory class shall be reported. May use additional copy/ies of this form if needed.
        </div>
        <div style={ruleTextStyle}>
          4. Small school that has one section per grade/year level is not required to fill the columns "Name of Adviser, Grade/Year Level &amp; Section". Instead, they will only accomplish the summary column per grade/year level.
        </div>
      </div>

      <div style={signaturePanelStyle}>
        <div style={{ fontSize: '8.5pt', fontWeight: 700, textAlign: 'left', marginBottom: 24, color: '#000000', fontFamily: 'Calibri, sans-serif' }}>
          Prepared and Submitted by:
        </div>
        <div style={sigLineStyle}>{reportData?.school_head || '\u00A0'}</div>
        <div style={{ textAlign: 'center', fontSize: '7.5pt', marginTop: 3, color: '#000000', fontFamily: 'Calibri, sans-serif' }}>
          (Signature of School Head over Printed Name)
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
          onExportGoogleSheets: handleExportGoogleSheets,
          onExportWord: handleExportWord,
          onExportGoogleDocs: handleExportGoogleDocs,
          onExportCsv: handleExportCSV,
          onExportJson: handleExportJSON,
        }}
        onPrint={handlePrint}
        isExporting={exportingPdf}
      />

      <div className="report-viewer-viewport" style={viewerScrollContainerStyle}>
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
          <div id="sf4-print-document" ref={reportRef} style={{ width: '100%', display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
            {paginatedPages.map((page) => (
              <div
                key={`sf4-page-${page.pageNumber}`}
                className="sf4-page-sheet"
                style={{
                  ...sheetWrapperStyle,
                  ...sheetDimensions,
                  backgroundColor: activePageConfig.pageColor,
                  pageBreakBefore: page.pageNumber > 1 ? 'always' : 'auto',
                }}
              >
                {page.showFullHeader && renderHeader()}

                <table style={mainTableStyle}>
                  {renderTableHeader()}
                  <tbody>
                    <tr style={{ height: '20px', backgroundColor: '#ffffff' }}>
                      <td colSpan={39} style={{ ...leftCell, fontWeight: 800, fontSize: '7.5pt' }}>
                        ELEMENTARY/SECONDARY:
                      </td>
                    </tr>

                    {page.groups.map((group) => (
                      <React.Fragment key={`grade-group-${group.grade_level}`}>
                        {group.sections && group.sections.length > 0 ? (
                          <>
                            {group.sections.map((sec) => (
                              <tr key={`section-row-${sec.section_id}`} style={dataRowStyle}>
                                <td style={leftCell}>{sec.adviser_name}</td>
                                <td style={{ ...leftCell, fontWeight: 700 }}>{sec.grade_level}</td>
                                <td style={leftCell}>{sec.section_name}</td>
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
                            ))}
                            <tr style={gradeSubtotalRowStyle}>
                              <td colSpan={3} style={{ ...leftCell, fontWeight: 800 }}>
                                TOTAL FOR {group.grade_level.toUpperCase()}
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
                            <td style={leftCell}></td>
                            <td style={{ ...leftCell, fontWeight: 700 }}>{group.grade_level}</td>
                            <td style={leftCell}></td>
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
                    ))}

                    {page.isFinalPage && reportData.non_graded_summary && (
                      <tr style={gradeSubtotalRowStyle}>
                        <td colSpan={3} style={{ ...leftCell, fontWeight: 800 }}>
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
                        <td colSpan={3} style={{ ...leftCell, fontWeight: 900 }}>
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

                {/* FOOTER: Division Seal/School Seal – 0.76 Inch & Office Details – Calibri 10pt */}
                {page.isFinalPage && (
                  <div style={officialFooterStyle}>
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
                  </div>
                )}

                <div style={auditFooterContainerStyle}>
                  <div>
                    <span>Document Tracking ID: <strong>{auditMeta.trackingId}</strong></span>
                  </div>
                  <div>
                    <span>Date and Time Printed: <strong>{auditMeta.printedAt}</strong></span>
                    <span> &bull; Page {page.pageNumber} of {page.totalPages}</span>
                  </div>
                </div>
              </div>
            ))}
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
            size: 13in 8.5in;
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

          #sf4-print-document {
            width: 100% !important;
            max-width: 100% !important;
            margin: 0 !important;
            padding: 0 !important;
            display: block !important;
          }

          .sf4-page-sheet {
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

          .sf4-page-sheet:last-child {
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

          td {
            white-space: nowrap !important;
          }
        }
      `}</style>
    </div>
  );
};

// ==========================================
// STYLES
// ==========================================
const fieldLabelStyle: React.CSSProperties = {
  fontFamily: 'Tahoma, sans-serif',
  fontWeight: 700,
  fontSize: '9.0pt',
  color: '#000000',
  marginRight: 6,
};

const fieldBoxStyle: React.CSSProperties = {
  minHeight: 20,
  lineHeight: '20px',
  border: '1.2px solid #000000',
  backgroundColor: '#ffffff',
  textAlign: 'center',
  fontWeight: 700,
  fontFamily: 'Tahoma, sans-serif',
  fontSize: '9.0pt',
  color: '#000000',
  padding: '0 6px',
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
  fontSize: '7.2pt',
  border: '1.2px solid #000000',
  boxSizing: 'border-box',
  fontFamily: 'Arial, sans-serif',
};

const thCell: React.CSSProperties = {
  border: '1px solid #000000',
  padding: '3px 1px',
  backgroundColor: '#ffffff',
  fontWeight: 700,
  textAlign: 'center',
  verticalAlign: 'middle',
  color: '#000000',
  lineHeight: 1.15,
  fontSize: '7.5pt',
  wordBreak: 'break-word',
};

const thSubCell: React.CSSProperties = {
  border: '1px solid #000000',
  padding: '2px 0',
  backgroundColor: '#ffffff',
  fontWeight: 700,
  textAlign: 'center',
  verticalAlign: 'middle',
  fontSize: '7.0pt',
  color: '#000000',
  lineHeight: 1,
};

const subHeaderSpan: React.CSSProperties = {
  fontSize: '6.2pt',
  fontWeight: 400,
  fontStyle: 'italic',
  color: '#000000',
  display: 'inline-block',
  marginTop: 1,
};

const dataRowStyle: React.CSSProperties = {
  borderBottom: '1px solid #000000',
  verticalAlign: 'middle',
  height: '22px',
};

const gradeSubtotalRowStyle: React.CSSProperties = {
  borderTop: '1px solid #000000',
  borderBottom: '1px solid #000000',
  backgroundColor: '#ffffff',
  height: '22px',
};

const grandTotalRowStyle: React.CSSProperties = {
  borderTop: '1.4px solid #000000',
  borderBottom: '1.4px solid #000000',
  backgroundColor: '#ffffff',
  height: '24px',
};

const centerCell: React.CSSProperties = {
  textAlign: 'center',
  border: '1px solid #000000',
  padding: '0 1px',
  color: '#000000',
  verticalAlign: 'middle',
  fontSize: '7.2pt',
  whiteSpace: 'nowrap',
  lineHeight: '20px',
  fontFamily: 'Arial, sans-serif',
};

const leftCell: React.CSSProperties = {
  textAlign: 'left',
  border: '1px solid #000000',
  padding: '0 4px',
  color: '#000000',
  whiteSpace: 'nowrap',
  overflow: 'hidden',
  textOverflow: 'ellipsis',
  verticalAlign: 'middle',
  lineHeight: '20px',
  fontSize: '7.2pt',
  fontFamily: 'Arial, sans-serif',
};

const footerContainerStyle: React.CSSProperties = {
  display: 'grid',
  gridTemplateColumns: '7.2fr 2.8fr',
  gap: 16,
  marginTop: 8,
  alignItems: 'start',
  width: '100%',
  boxSizing: 'border-box',
  color: '#000000',
};

const guidelinesPanelStyle: React.CSSProperties = {
  fontFamily: 'Calibri, sans-serif',
  fontSize: '8.0pt',
  lineHeight: 1.25,
  boxSizing: 'border-box',
  minWidth: 0,
  color: '#000000',
};

const ruleTextStyle: React.CSSProperties = {
  marginBottom: 3,
  color: '#000000',
};

const signaturePanelStyle: React.CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  width: '100%',
  boxSizing: 'border-box',
  color: '#000000',
  paddingLeft: 10,
};

const sigLineStyle: React.CSSProperties = {
  borderBottom: '1.2px solid #000000',
  minHeight: 18,
  display: 'flex',
  alignItems: 'flex-end',
  justifyContent: 'center',
  fontWeight: 800,
  fontSize: '9.5pt',
  fontFamily: 'Calibri, sans-serif',
  textTransform: 'uppercase',
  paddingBottom: 2,
  color: '#000000',
  width: '100%',
};

const officialFooterStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: 12,
  marginTop: 8,
  paddingTop: 4,
  borderTop: '1px solid #000000',
  width: '100%',
  boxSizing: 'border-box',
};

const officeDetailsTextStyle: React.CSSProperties = {
  fontFamily: 'Calibri, sans-serif',
  fontSize: '10pt',
  color: '#000000',
  lineHeight: 1.25,
  textAlign: 'left',
};

const auditFooterContainerStyle: React.CSSProperties = {
  display: 'flex',
  justifyContent: 'space-between',
  alignItems: 'center',
  fontSize: '7.0pt',
  fontFamily: 'Calibri, monospace',
  color: '#000000',
  marginTop: 8,
  paddingTop: 4,
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

export default SF4ReportTab;