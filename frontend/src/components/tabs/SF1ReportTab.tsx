import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import apiClient from '../../api/client';
import { KagawaranNgEdukasyonLogo } from '../ui/KagawaranNgEdukasyonLogo';
import { ReportNavBar } from '../reports/ReportNavBar';
import { PageSetupModal } from '../common/PageSetupModal';
import { usePageSetup } from '../../hooks/usePageSetup';
import { PAPER_SIZES } from '../../types/pageSetup';
import type { PageSetupConfig, LayoutMode } from '../../types/pageSetup';
import { Loader2, AlertCircle } from 'lucide-react';

interface Learner {
  id: number;
  lrn: string;
  name: string;
  sex: string;
  birthdate: string;
  age: number | string;
  birth_place?: string;
  mother_tongue: string;
  ethnic_group: string;
  religion: string;
  house_street: string;
  barangay: string;
  municipality_city: string;
  province: string;
  father_name: string;
  mother_maiden_name: string;
  guardian_name: string;
  guardian_relationship: string;
  parent_contact: string;
  remarks: string;
}

interface SF1Data {
  school_id: string;
  school_name: string;
  region: string;
  division: string;
  district: string;
  school_head: string;
  adviser_name: string;
  academic_year: string;
  section_name: string;
  grade_level: string;
  left_logo: string | null;
  right_logo: string | null;
  total_male: number;
  total_female: number;
  total_combined: number;
  males: Learner[];
  females: Learner[];
}

interface SF1PageChunk {
  pageNumber: number;
  totalPages?: number;
  learners: Learner[];
  startIndex: number;
  showFullHeader: boolean;
  showFooter: boolean;
}

export interface SF1ReportTabProps {
  sectionId?: number | string;
  activeReportId?: string;
  onSelectReport?: (reportId: string) => void;
}

export const SF1ReportTab: React.FC<SF1ReportTabProps> = ({
  sectionId,
  activeReportId = 'sf1',
  onSelectReport = () => {},
}) => {
  const [sections, setSections] = useState<any[]>([]);
  const [selectedSectionId, setSelectedSectionId] = useState<string>(
    sectionId ? String(sectionId) : ''
  );
  const [selectedAcademicYear, setSelectedAcademicYear] = useState<string>('');
  const [selectedGradeLevel, setSelectedGradeLevel] = useState<string>('ALL');
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [reportData, setReportData] = useState<SF1Data | null>(null);
  const [loading, setLoading] = useState(false);
  const [exportingPdf, setExportingPdf] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isPageSetupOpen, setIsPageSetupOpen] = useState(false);

  // Persistent Page Setup Hook
  const { config: savedPageConfig, saveConfig: savePageConfig } = usePageSetup('sf1');
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

  const fetchSF1 = useCallback(async () => {
    if (!selectedSectionId) return;
    setLoading(true);
    setError(null);
    try {
      const res = await apiClient.get<SF1Data>(`/reports/sf1/${selectedSectionId}/`);
      setReportData(res.data);
      if (res.data?.academic_year && !selectedAcademicYear) {
        setSelectedAcademicYear(res.data.academic_year);
      }
    } catch (err: any) {
      setError(err.response?.data?.error || 'Failed to generate official DepEd SF1 report.');
    } finally {
      setLoading(false);
    }
  }, [selectedSectionId, selectedAcademicYear]);

  useEffect(() => {
    fetchSF1();
  }, [fetchSF1]);

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

  const sortedLearners = useMemo(() => {
    if (!reportData) return [];
    const combined = [
      ...(reportData.males || []),
      ...(reportData.females || []),
    ];
    const sorted = combined.sort((a, b) => a.name.localeCompare(b.name));
    if (!searchQuery.trim()) return sorted;

    const q = searchQuery.toLowerCase().trim();
    return sorted.filter(
      (l) => l.name.toLowerCase().includes(q) || l.lrn.toLowerCase().includes(q)
    );
  }, [reportData, searchQuery]);

  // Document Tracking ID and Printed Date/Time (Solid Black)
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
    const trackingId = `DOC-SF1-${schoolIdStr}-${dateStamp}-${timeCode}`;

    return { printedAt, trackingId };
  }, [reportData, selectedSectionId]);

  // Database audit log dispatch
  const logReportAudit = async (actionType: 'VIEW' | 'PRINT' | 'PDF' | 'EXCEL' | 'WORD' | 'CSV' | 'JSON') => {
    try {
      await apiClient.post('/reports/audit-logs/', {
        report_name: 'School Form 1 (SF1)',
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

  // Dynamic Pagination Engine: Only moves to next page when data cannot fit
  const paginatedPages = useMemo(() => {
    if (activePageConfig.layoutMode === 'pageless') {
      return [
        {
          pageNumber: 1,
          totalPages: 1,
          learners: sortedLearners,
          startIndex: 0,
          showFullHeader: true,
          showFooter: true,
        },
      ];
    }

    const paper = PAPER_SIZES[activePageConfig.paperSize] || PAPER_SIZES.legal;
    const isLandscape = activePageConfig.orientation === 'landscape';
    const pageHeightInches = isLandscape ? paper.width : paper.height;
    const printableHeight = Math.max(
      4,
      pageHeightInches - (activePageConfig.margins.top || 0.25) - (activePageConfig.margins.bottom || 0.25)
    );

    const fullHeaderH = 1.15;
    const theadH = 0.40;
    const trackingH = 0.22;
    const footerH = 1.75;
    const rowH = 0.175;

    // Check if entire section fits on 1 page
    const singlePageOverhead = fullHeaderH + theadH + footerH + trackingH;
    const singlePageCapacity = Math.floor((printableHeight - singlePageOverhead) / rowH);

    if (sortedLearners.length <= singlePageCapacity) {
      return [
        {
          pageNumber: 1,
          totalPages: 1,
          learners: sortedLearners,
          startIndex: 0,
          showFullHeader: true,
          showFooter: true,
        },
      ];
    }

    // When data exceeds 1 page, chunk dynamically
    const pages: SF1PageChunk[] = [];
    let currentIdx = 0;
    const totalLearners = sortedLearners.length;

    while (currentIdx < totalLearners) {
      const pageNum: number = pages.length + 1;
      const isFirstPage = pageNum === 1;
      const showFullHeader = isFirstPage || (activePageConfig.headerRepeat || 'all_pages') === 'all_pages';

      const remaining = totalLearners - currentIdx;
      const overheadWithFooter = (showFullHeader ? fullHeaderH : 0) + theadH + footerH + trackingH;
      const capacityWithFooter = Math.floor((printableHeight - overheadWithFooter) / rowH);

      if (remaining <= capacityWithFooter) {
        pages.push({
          pageNumber: pageNum,
          learners: sortedLearners.slice(currentIdx, currentIdx + remaining),
          startIndex: currentIdx,
          showFullHeader,
          showFooter: true,
        });
        currentIdx += remaining;
      } else {
        const overheadWithoutFooter = (showFullHeader ? fullHeaderH : 0) + theadH + trackingH;
        const capacityWithoutFooter = Math.max(5, Math.floor((printableHeight - overheadWithoutFooter) / rowH));
        const sliceCount = Math.min(remaining, capacityWithoutFooter);

        pages.push({
          pageNumber: pageNum,
          learners: sortedLearners.slice(currentIdx, currentIdx + sliceCount),
          startIndex: currentIdx,
          showFullHeader,
          showFooter: false,
        });
        currentIdx += sliceCount;
      }
    }

    // Safety check for summary footer placement
    if (pages.length > 0 && !pages[pages.length - 1].showFooter) {
      const pageNum: number = pages.length + 1;
      const showFullHeader = (activePageConfig.headerRepeat || 'all_pages') === 'all_pages';
      pages.push({
        pageNumber: pageNum,
        learners: [],
        startIndex: totalLearners,
        showFullHeader,
        showFooter: true,
      });
    }

    const totalPages: number = pages.length;
    return pages.map((p) => ({ ...p, totalPages }));
  }, [activePageConfig, sortedLearners]);

  const parseGuardian = (name: string, rel: string) => {
    const commonRel = ['MOTHER', 'FATHER', 'AUNT', 'UNCLE', 'GRANDMOTHER', 'GRANDFATHER', 'GUARDIAN'];
    const cleanName = (name || '').trim();
    const cleanRel = (rel || '').trim();

    if (commonRel.includes(cleanName.toUpperCase()) && !commonRel.includes(cleanRel.toUpperCase())) {
      return { gName: cleanRel, gRel: cleanName };
    }
    return { gName: cleanName, gRel: cleanRel === 'Mather' ? 'Mother' : cleanRel };
  };

  const getBaseFilename = () => {
    const now = new Date();
    const pad = (n: number) => String(n).padStart(2, '0');
    const timestamp = `${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}_${pad(now.getHours())}${pad(now.getMinutes())}${pad(now.getSeconds())}`;
    const cleanGrade = (reportData?.grade_level || 'Grade').replace(/[^a-zA-Z0-9]/g, '_');
    const cleanSection = (reportData?.section_name || 'Section').replace(/[^a-zA-Z0-9]/g, '_');
    return `SF1_Report_${cleanGrade}_${cleanSection}_${timestamp}`;
  };

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
    logReportAudit('PDF');
    try {
      let html2pdfInstance = (window as any).html2pdf;
      if (!html2pdfInstance) {
        await new Promise((resolve, reject) => {
          const script = document.createElement('script');
          script.src = 'https://cdnjs.cloudflare.com/ajax/libs/html2pdf.js/0.10.1/html2pdf.bundle.min.js';
          script.onload = () => resolve((window as any).html2pdf);
          script.onerror = reject;
        });
        html2pdfInstance = (window as any).html2pdf;
      }

      const isLandscape = activePageConfig.orientation === 'landscape';
      const isPageless = activePageConfig.layoutMode === 'pageless';
      const isSingle = paginatedPages.length === 1;
      const paper = PAPER_SIZES[activePageConfig.paperSize] || PAPER_SIZES.legal;
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
    } catch (err) {
      alert('Unable to generate PDF directly. Please use the Print button and choose "Save as PDF".');
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
          <table border="0" style="font-size:7pt; color:#000000; font-family:Arial;">
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
          <p style="font-size:7pt; color:#000000; font-family:Arial;">
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
      'No', 'LRN', 'Learner Name', 'Sex', 'Birth Date', 'Age',
      'Birth Place', 'Mother Tongue', 'IP Ethnic Group', 'Religion',
      'House Street', 'Barangay', 'Municipality City', 'Province',
      'Father Name', 'Mother Maiden Name', 'Guardian Name', 'Guardian Relationship',
      'Contact Number', 'Remarks'
    ];
    const rows = sortedLearners.map((l, idx) => {
      const { gName, gRel } = parseGuardian(l.guardian_name, l.guardian_relationship);
      return [
        idx + 1,
        `"${l.lrn}"`,
        `"${l.name.replace(/"/g, '""')}"`,
        l.sex,
        l.birthdate,
        l.age,
        `"${(l.birth_place || l.province || '').replace(/"/g, '""')}"`,
        `"${l.mother_tongue.replace(/"/g, '""')}"`,
        `"${l.ethnic_group.replace(/"/g, '""')}"`,
        `"${l.religion.replace(/"/g, '""')}"`,
        `"${l.house_street.replace(/"/g, '""')}"`,
        `"${l.barangay.replace(/"/g, '""')}"`,
        `"${l.municipality_city.replace(/"/g, '""')}"`,
        `"${l.province.replace(/"/g, '""')}"`,
        `"${l.father_name.replace(/"/g, '""')}"`,
        `"${l.mother_maiden_name.replace(/"/g, '""')}"`,
        `"${gName.replace(/"/g, '""')}"`,
        `"${gRel.replace(/"/g, '""')}"`,
        `"${l.parent_contact}"`,
        `"${l.remarks.replace(/"/g, '""')}"`,
      ];
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

  // Full Official Top Header Box
  const renderHeader = () => (
    <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12, marginBottom: 8, width: '100%', boxSizing: 'border-box' }}>
      <div style={{ flexShrink: 0, width: 75, display: 'flex', justifyContent: 'center' }}>
        {reportData?.left_logo ? (
          <img src={reportData.left_logo} alt="School Seal" style={{ width: 68, height: 68, objectFit: 'contain' }} />
        ) : (
          <KagawaranNgEdukasyonLogo size={68} />
        )}
      </div>

      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ textAlign: 'center', marginBottom: 6 }}>
          <div style={{ fontSize: '9pt', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.4px', margin: 0, color: '#000000' }}>
            School Form 1 (SF 1) School Register
          </div>
          <div style={{ fontSize: '6.2pt', fontStyle: 'italic', color: '#000000', marginTop: 1 }}>
            (This replaces Form 1, Master List &amp; STS Form 2-Family Background and Profile)
          </div>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 4, width: '100%' }}>
          <div style={{ display: 'flex', alignItems: 'center', width: '100%' }}>
            <div style={{ display: 'flex', alignItems: 'center', width: '25%' }}>
              <span style={{ fontWeight: 700, fontSize: '7.2pt', width: 68, flexShrink: 0, color: '#000000' }}>School ID</span>
              <div style={{ ...fieldBoxStyle, width: 100 }}>{reportData?.school_id}</div>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', width: '28%', paddingRight: 12 }}>
              <span style={{ fontWeight: 700, fontSize: '7.2pt', width: 54, flexShrink: 0, color: '#000000' }}>Division</span>
              <div style={{ ...fieldBoxStyle, flex: 1, textAlign: 'left', paddingLeft: 6 }}>{reportData?.division}</div>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', width: '47%' }}>
              <div style={{ display: 'flex', alignItems: 'center', width: '74%' }}>
                <span style={{ fontWeight: 700, fontSize: '7.2pt', width: 54, flexShrink: 0, color: '#000000' }}>District</span>
                <div style={{ ...fieldBoxStyle, flex: 1, textAlign: 'left', paddingLeft: 6 }}>{reportData?.district}</div>
              </div>
              <div style={{ width: '26%' }} />
            </div>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', width: '100%' }}>
            <div style={{ display: 'flex', alignItems: 'center', width: '25%' }}>
              <span style={{ fontWeight: 700, fontSize: '7.2pt', width: 68, flexShrink: 0, color: '#000000' }}>School Name</span>
              <div style={{ ...fieldBoxStyle, flex: 1, textAlign: 'left', paddingLeft: 6, marginRight: 8 }}>{reportData?.school_name}</div>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', width: '28%', paddingRight: 12 }}>
              <span style={{ fontWeight: 700, fontSize: '7.2pt', width: 68, flexShrink: 0, color: '#000000' }}>School Year</span>
              <div style={{ ...fieldBoxStyle, width: 110 }}>{reportData?.academic_year}</div>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', width: '47%' }}>
              <span style={{ fontWeight: 700, fontSize: '7.2pt', width: 64, flexShrink: 0, color: '#000000' }}>Grade Level</span>
              <div style={{ ...fieldBoxStyle, width: 52, flexShrink: 0, marginRight: 8 }}>{reportData?.grade_level}</div>
              <span style={{ fontWeight: 700, fontSize: '7.2pt', width: 44, flexShrink: 0, color: '#000000' }}>Section</span>
              <div style={{ ...fieldBoxStyle, flex: 1, textAlign: 'left', paddingLeft: 6 }}>{reportData?.section_name}</div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );

  // Table Column Headers (# through REMARKS)
  const renderTableHeader = () => (
    <thead>
      <tr>
        <th rowSpan={2} style={{ width: '1.8%', ...headerCell }}>#</th>
        <th rowSpan={2} style={{ width: '6.6%', ...headerCell }}>LRN</th>
        <th rowSpan={2} style={{ width: '13.0%', ...headerCell }}>
          NAME<br />
          <span style={subHeaderSpan}>(Last Name, First Name, Middle Name)</span>
        </th>
        <th rowSpan={2} style={{ width: '2.4%', ...headerCell }}>Sex (M/F)</th>
        <th rowSpan={2} style={{ width: '4.6%', ...headerCell }}>
          BIRTH DATE<br />
          <span style={subHeaderSpan}>(mm/dd/yyyy)</span>
        </th>
        <th rowSpan={2} style={{ width: '3.4%', ...headerCell }}>
          AGE as of 1st<br />
          <span style={subHeaderSpan}>Friday June</span>
        </th>
        <th rowSpan={2} style={{ width: '4.6%', ...headerCell }}>
          BIRTH PLACE<br />
          <span style={subHeaderSpan}>(Province)</span>
        </th>
        <th rowSpan={2} style={{ width: '4.2%', ...headerCell }}>MOTHER TONGUE</th>
        <th rowSpan={2} style={{ width: '4.0%', ...headerCell }}>
          IP<br />
          <span style={subHeaderSpan}>(Ethnic Group)</span>
        </th>
        <th rowSpan={2} style={{ width: '4.2%', ...headerCell }}>RELIGION</th>
        <th colSpan={4} style={{ textAlign: 'center', ...headerCell }}>ADDRESS</th>
        <th colSpan={2} style={{ textAlign: 'center', ...headerCell }}>PARENTS</th>
        <th colSpan={2} style={{ textAlign: 'center', ...headerCell }}>GUARDIAN (if not Parent)</th>
        <th rowSpan={2} style={{ width: '6.0%', ...headerCell }}>
          Contact Number of Parent or<br />Guardian
        </th>
        <th style={{ width: '6.2%', ...headerCell }}>REMARKS</th>
      </tr>
      <tr>
        <th style={{ width: '4.8%', ...headerCell }}>House #/ Street/ Sitio/ Purok</th>
        <th style={{ width: '4.0%', ...headerCell }}>Barangay</th>
        <th style={{ width: '4.4%', ...headerCell }}>Municipality/ City</th>
        <th style={{ width: '4.0%', ...headerCell }}>Province</th>
        <th style={{ width: '6.8%', ...headerCell }}>Father's Name</th>
        <th style={{ width: '6.8%', ...headerCell }}>Mother's Maiden Name</th>
        <th style={{ width: '4.6%', ...headerCell }}>Name</th>
        <th style={{ width: '3.6%', ...headerCell }}>Relation-ship</th>
        <th style={{ width: '6.2%', ...headerCell, fontSize: '4.1pt', lineHeight: 1.05 }}>
          (Please refer to the<br />legend on last page)
        </th>
      </tr>
    </thead>
  );

  // Summary Footer (Remarks legend + BoSY/EoSY table + Signatures)
  const renderSummaryFooter = () => (
    <div style={footerLayoutGridStyle}>
      <div style={{ display: 'flex', flexDirection: 'column' }}>
        <div style={{ fontWeight: 800, fontSize: '5.8pt', textAlign: 'center', marginBottom: 2, color: '#000000' }}>
          List and Code of Indicators under REMARKS column
        </div>
        <table style={indicatorsTableStyle}>
          <thead>
            <tr>
              <th style={{ width: '15%', ...indicatorHeaderCell }}>Indicator</th>
              <th style={{ width: '5%', ...indicatorHeaderCell }}>Code</th>
              <th style={{ width: '30%', ...indicatorHeaderCell }}>Required Information</th>
              <th style={{ width: '15%', ...indicatorHeaderCell }}>Indicator</th>
              <th style={{ width: '5%', ...indicatorHeaderCell }}>Code</th>
              <th style={{ width: '30%', ...indicatorHeaderCell }}>Required Information</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td style={indicatorCellBold}>Transferred Out</td>
              <td style={indicatorCellCenter}>T/O</td>
              <td style={indicatorCellText}>Name of School &amp; Effectivity Date</td>
              <td style={indicatorCellBold}>CCT Recipient</td>
              <td style={indicatorCellCenter}>CCT</td>
              <td style={indicatorCellText}>CCT Control number &amp; Effectivity Date</td>
            </tr>
            <tr>
              <td style={indicatorCellBold}>Transferred IN</td>
              <td style={indicatorCellCenter}>T/I</td>
              <td style={indicatorCellText}>Name of School &amp; Effectivity Date</td>
              <td style={indicatorCellBold}>Balik-Aral</td>
              <td style={indicatorCellCenter}>B/A</td>
              <td style={indicatorCellText}>Name of school last attended &amp; Year</td>
            </tr>
            <tr>
              <td style={indicatorCellBold}>Dropped</td>
              <td style={indicatorCellCenter}>DRP</td>
              <td style={indicatorCellText}>Reason and Effectivity Date</td>
              <td style={indicatorCellBold}>Learner With Disability</td>
              <td style={indicatorCellCenter}>LWD</td>
              <td style={indicatorCellText}>Specify</td>
            </tr>
            <tr>
              <td style={indicatorCellBold}>Late Enrollment</td>
              <td style={indicatorCellCenter}>LE</td>
              <td style={indicatorCellText}>Reason (Enrollment beyond 1st Friday of June)</td>
              <td style={indicatorCellBold}>Accelerated</td>
              <td style={indicatorCellCenter}>ACL</td>
              <td style={indicatorCellText}>Specify Level &amp; Effectivity Date</td>
            </tr>
          </tbody>
        </table>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', justifyContent: 'flex-end' }}>
        <table style={summaryTableStyle}>
          <thead>
            <tr>
              <th style={{ width: '40%', ...indicatorHeaderCell, fontSize: '4.8pt' }}>REGISTERED</th>
              <th style={{ width: '30%', ...indicatorHeaderCell }}>BoSY</th>
              <th style={{ width: '30%', ...indicatorHeaderCell }}>EoSY</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td style={{ ...indicatorCellCenter, fontWeight: 700, fontSize: '4.8pt' }}>MALE</td>
              <td style={indicatorCellCenter}>{reportData?.total_male}</td>
              <td style={indicatorCellCenter}></td>
            </tr>
            <tr>
              <td style={{ ...indicatorCellCenter, fontWeight: 700, fontSize: '4.8pt' }}>FEMALE</td>
              <td style={indicatorCellCenter}>{reportData?.total_female}</td>
              <td style={indicatorCellCenter}></td>
            </tr>
            <tr>
              <td style={{ ...indicatorCellCenter, fontWeight: 700, fontSize: '4.8pt' }}>TOTAL</td>
              <td style={{ ...indicatorCellCenter, fontWeight: 800 }}>{reportData?.total_combined}</td>
              <td style={indicatorCellCenter}></td>
            </tr>
          </tbody>
        </table>
      </div>

      <div style={signatureBlockStyle}>
        <div style={{ fontSize: '5.2pt', fontWeight: 700, textAlign: 'left', marginBottom: 12, color: '#000000' }}>Prepared by :</div>
        <div style={signatureLineStyle}>{reportData?.adviser_name}</div>
        <div style={{ fontSize: '4.8pt', textAlign: 'center', marginTop: 1, color: '#000000' }}>(Signature of Adviser over Printed Name)</div>
        <div style={datesRowStyle}>
          <span>BoSY Date:</span><span>EoSY Date:</span>
        </div>
      </div>

      <div style={signatureBlockStyle}>
        <div style={{ fontSize: '5.2pt', fontWeight: 700, textAlign: 'left', marginBottom: 12, color: '#000000' }}>Certified Correct:</div>
        <div style={signatureLineStyle}>{reportData?.school_head}</div>
        <div style={{ fontSize: '4.8pt', textAlign: 'center', marginTop: 1, color: '#000000' }}>(Signature of School Head over Printed Name)</div>
        <div style={datesRowStyle}>
          <span>BoSY Date:</span><span>EoSY Date:</span>
        </div>
      </div>
    </div>
  );

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
        searchQuery={searchQuery}
        onSearchChange={setSearchQuery}
        showSearch={true}
        layoutMode={activePageConfig.layoutMode}
        onToggleLayoutMode={handleToggleLayoutMode}
        showLayoutModeToggle={true}
        onRefresh={fetchSF1}
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
            <Loader2 className="animate-spin" size={28} color="#0284c7" />
            <span>Loing...</span>
          </div>
        ) : error ? (
          <div style={errorStateStyle}>
            <AlertCircle size={24} color="#dc2626" />
            <span>{error}</span>
          </div>
        ) : reportData ? (
          <div id="sf1-print-document" ref={reportRef} style={{ width: '100%', display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
            {paginatedPages.map((page) => (
              <div
                key={`sf1-page-${page.pageNumber}`}
                className="sf1-page-sheet"
                style={{
                  ...sheetWrapperStyle,
                  ...sheetDimensions,
                  backgroundColor: activePageConfig.pageColor,
                  pageBreakBefore: page.pageNumber > 1 ? 'always' : 'auto',
                }}
              >
                {/* Full Header: Shown on Page 1 or if "Every Page" is selected */}
                {page.showFullHeader && renderHeader()}

                {/* Main Table: Always starts with standard column headers (# through REMARKS) */}
                <table style={mainTableStyle}>
                  {renderTableHeader()}
                  <tbody>
                    {page.learners.map((learner, idx) => {
                      const absoluteIndex = page.startIndex + idx;
                      const { gName, gRel } = parseGuardian(learner.guardian_name, learner.guardian_relationship);
                      return (
                        <tr key={`learner-${learner.id}`} style={dataRowStyle}>
                          <td style={centerCell}>{absoluteIndex + 1}</td>
                          <td style={{ ...centerCell, fontFamily: 'monospace', fontWeight: 700 }}>{learner.lrn}</td>
                          <td style={{ ...leftCell, fontWeight: 700 }}>{learner.name}</td>
                          <td style={centerCell}>{learner.sex}</td>
                          <td style={centerCell}>{learner.birthdate}</td>
                          <td style={centerCell}>{learner.age}</td>
                          <td style={centerCell}>{learner.birth_place || learner.province || ''}</td>
                          <td style={centerCell}>{learner.mother_tongue}</td>
                          <td style={centerCell}>{learner.ethnic_group}</td>
                          <td style={centerCell}>{learner.religion}</td>
                          <td style={leftCell}>{learner.house_street}</td>
                          <td style={leftCell}>{learner.barangay}</td>
                          <td style={leftCell}>{learner.municipality_city}</td>
                          <td style={leftCell}>{learner.province}</td>
                          <td style={leftCell}>{learner.father_name}</td>
                          <td style={leftCell}>{learner.mother_maiden_name}</td>
                          <td style={leftCell}>{gName}</td>
                          <td style={centerCell}>{gRel}</td>
                          <td style={{ ...centerCell, fontFamily: 'monospace' }}>{learner.parent_contact}</td>
                          <td style={centerCell}>{learner.remarks}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>

                {/* Summary Footer: Only rendered on the final page of data */}
                {page.showFooter && renderSummaryFooter()}

                {/* Tracking ID & Printed Date/Time - Pure Black */}
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
        reportTitle="SF1 School Register"
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

          #sf1-print-document {
            width: 100% !important;
            max-width: 100% !important;
            margin: 0 !important;
            padding: 0 !important;
            display: block !important;
          }

          .sf1-page-sheet {
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

          .sf1-page-sheet:last-child {
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
  fontSize: '5.2pt',
  border: '1.5px solid #000000',
};

const headerCell: React.CSSProperties = {
  border: '1px solid #000000',
  padding: '2px 1px',
  backgroundColor: '#ffffff',
  fontWeight: 700,
  textAlign: 'center',
  verticalAlign: 'middle',
  color: '#000000',
};

const subHeaderSpan: React.CSSProperties = {
  fontSize: '4.4pt',
  fontWeight: 400,
  fontStyle: 'italic',
  color: '#000000',
};

const dataRowStyle: React.CSSProperties = {
  borderBottom: '1px solid #000000',
  verticalAlign: 'middle',
  height: '17px',
};

const centerCell: React.CSSProperties = {
  textAlign: 'center',
  border: '1px solid #000000',
  padding: '1px 1px',
  color: '#000000',
  whiteSpace: 'normal',
  wordBreak: 'break-word',
  lineHeight: 1.1,
};

const leftCell: React.CSSProperties = {
  textAlign: 'left',
  border: '1px solid #000000',
  padding: '1px 2px',
  color: '#000000',
  whiteSpace: 'normal',
  wordBreak: 'break-word',
  lineHeight: 1.1,
};

const footerLayoutGridStyle: React.CSSProperties = {
  width: '100%',
  display: 'grid',
  gridTemplateColumns: '57.8fr 12.8fr 14.7fr 14.7fr',
  gap: '8px',
  marginTop: '6px',
  alignItems: 'end',
  boxSizing: 'border-box',
  color: '#000000',
};

const indicatorsTableStyle: React.CSSProperties = {
  width: '100%',
  borderCollapse: 'collapse',
  fontSize: '4.8pt',
  border: '1px solid #000000',
  color: '#000000',
};

const indicatorHeaderCell: React.CSSProperties = {
  border: '1px solid #000000',
  padding: '1px 2px',
  fontWeight: 700,
  textAlign: 'center',
  backgroundColor: '#ffffff',
  color: '#000000',
};

const indicatorCellBold: React.CSSProperties = {
  border: '1px solid #000000',
  padding: '1px 2px',
  fontWeight: 600,
  fontSize: '4.7pt',
  color: '#000000',
};

const indicatorCellCenter: React.CSSProperties = {
  border: '1px solid #000000',
  padding: '1px',
  textAlign: 'center',
  fontWeight: 700,
  fontSize: '4.8pt',
  fontFamily: 'Arial, sans-serif',
  color: '#000000',
};

const indicatorCellText: React.CSSProperties = {
  border: '1px solid #000000',
  padding: '1px 2px',
  fontSize: '4.6pt',
  lineHeight: 1.05,
  color: '#000000',
};

const summaryTableStyle: React.CSSProperties = {
  width: '100%',
  borderCollapse: 'collapse',
  border: '1px solid #000000',
  fontSize: '4.9pt',
  color: '#000000',
};

const signatureBlockStyle: React.CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  width: '100%',
  boxSizing: 'border-box',
  color: '#000000',
};

const signatureLineStyle: React.CSSProperties = {
  borderBottom: '1px solid #000000',
  minHeight: 14,
  display: 'flex',
  alignItems: 'flex-end',
  justifyContent: 'center',
  fontWeight: 800,
  fontSize: '5.8pt',
  textTransform: 'uppercase',
  paddingBottom: 1,
  color: '#000000',
};

const datesRowStyle: React.CSSProperties = {
  display: 'flex',
  justifyContent: 'space-between',
  fontSize: '4.8pt',
  marginTop: 4,
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

export default SF1ReportTab;