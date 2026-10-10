/**
 * AttendSure V3 - DepEd School Form 1 (SF 1) School Register
 * File: frontend/src/components/tabs/SF1ReportTab.tsx
 *
 * Fixes Applied:
 * 1. IMPLEMENTED EXPORT HANDLERS: Added handleExportWord and mapped handleExportJSON to onExportJson.
 * 2. HEADER LOCKED TO PAGE 1: DepEd letterhead only appears on page 1 across all layout modes.
 * 3. DMOS COMPLIANCE: 0.76" seals, Old English Text MT, Tahoma headings, and Calibri footer.
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
import { Loader2, AlertCircle, ZoomIn, ZoomOut, Maximize2, Users, Split } from 'lucide-react';

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
  as_of_date?: string;
  section_name: string;
  grade_level: string;
  left_logo?: string | null;
  right_logo?: string | null;
  has_enrolled_students?: boolean;
  notice?: string;
  total_male: number;
  total_female: number;
  total_combined: number;
  males?: Learner[];
  females?: Learner[];
  students?: Learner[];
  learners?: Learner[];
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
  const { school } = useSchool();
  const { showAlert } = useAlert();

  const [sections, setSections] = useState<any[]>([]);
  const [selectedSectionId, setSelectedSectionId] = useState<string>(
    sectionId ? String(sectionId) : ''
  );
  const [selectedAcademicYear, setSelectedAcademicYear] = useState<string>('');
  const [selectedGradeLevel, setSelectedGradeLevel] = useState<string>('ALL');
  const [selectedDate, setSelectedDate] = useState<string>(
    new Date().toISOString().split('T')[0]
  );
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [reportData, setReportData] = useState<SF1Data | null>(null);
  const [loading, setLoading] = useState(false);
  const [exportingPdf, setExportingPdf] = useState(false);
  const [isPrinting, setIsPrinting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isPageSetupOpen, setIsPageSetupOpen] = useState(false);

  const [groupingMode, setGroupingMode] = useState<'COMBINED' | 'SEPARATED'>('COMBINED');

  const { config: savedPageConfig, saveConfig: savePageConfig } = usePageSetup('sf1');
  const [activePageConfig, setActivePageConfig] = useState<PageSetupConfig>(savedPageConfig);

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

  useEffect(() => {
    if (sectionId) setSelectedSectionId(String(sectionId));
  }, [sectionId]);

  useEffect(() => {
    const fetchSections = async () => {
      try {
        const res = await apiClient.get('/sections/');
        const data = Array.isArray(res.data) ? res.data : res.data.results || [];
        setSections(data);
        if (!selectedSectionId && data.length > 0) {
          setSelectedSectionId(String(data[0].id));
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
      const res = await apiClient.get<SF1Data>(`/reports/sf1/${selectedSectionId}/`, {
        params: {
          as_of_date: selectedDate || '',
          date: selectedDate || '',
          academic_year: selectedAcademicYear || '',
          school_year: selectedAcademicYear || '',
        },
      });
      setReportData(res.data);
      if (res.data?.academic_year) {
        setSelectedAcademicYear(res.data.academic_year);
      }
    } catch (err: any) {
      setError(err?.response?.data?.error || 'Failed to generate official SF1 report.');
    } finally {
      setLoading(false);
    }
  }, [selectedSectionId, selectedAcademicYear, selectedDate]);

  useEffect(() => {
    fetchSF1();
  }, [fetchSF1]);

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

  const fontSizes = useMemo(() => {
    const raw = (activePageConfig as any)?.fontSize;
    let base = 5.2;

    if (typeof raw === 'number' && raw > 0) {
      base = raw;
    } else if (raw === 'small' || raw === 'compact') {
      base = 4.6;
    } else if (raw === 'large') {
      base = 5.8;
    } else if (raw === 'xlarge') {
      base = 6.4;
    }

    return {
      table: `${base}pt`,
      header: `${(base * 0.96).toFixed(1)}pt`,
      subHeader: `${(base * 0.8).toFixed(1)}pt`,
      legend: `${(base * 0.88).toFixed(1)}pt`,
      footer: `${(base * 0.9).toFixed(1)}pt`,
    };
  }, [activePageConfig]);

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

  const sortedCombinedLearners = useMemo(() => {
    if (!reportData || reportData.has_enrolled_students === false) return [];
    const raw = reportData.students || reportData.learners || [];
    const sorted = [...raw].sort((a, b) => a.name.localeCompare(b.name));
    if (!searchQuery.trim()) return sorted;

    const q = searchQuery.toLowerCase().trim();
    return sorted.filter(
      (l) => l.name.toLowerCase().includes(q) || l.lrn.toLowerCase().includes(q)
    );
  }, [reportData, searchQuery]);

  const { maleLearners, femaleLearners } = useMemo(() => {
    if (!reportData || reportData.has_enrolled_students === false) {
      return { maleLearners: [], femaleLearners: [] };
    }

    const rawMales =
      reportData.males ||
      (reportData.students || reportData.learners || []).filter(
        (l) => l.sex === 'M' || l.sex === 'Male'
      );
    const rawFemales =
      reportData.females ||
      (reportData.students || reportData.learners || []).filter(
        (l) => l.sex === 'F' || l.sex === 'Female'
      );

    const sortedMales = [...rawMales].sort((a, b) => a.name.localeCompare(b.name));
    const sortedFemales = [...rawFemales].sort((a, b) => a.name.localeCompare(b.name));

    if (!searchQuery.trim()) {
      return { maleLearners: sortedMales, femaleLearners: sortedFemales };
    }

    const q = searchQuery.toLowerCase().trim();
    return {
      maleLearners: sortedMales.filter(
        (l) => l.name.toLowerCase().includes(q) || l.lrn.toLowerCase().includes(q)
      ),
      femaleLearners: sortedFemales.filter(
        (l) => l.name.toLowerCase().includes(q) || l.lrn.toLowerCase().includes(q)
      ),
    };
  }, [reportData, searchQuery]);

  const maleCount = useMemo(
    () => (reportData?.has_enrolled_students === false ? 0 : reportData?.total_male ?? maleLearners.length),
    [reportData, maleLearners]
  );
  const femaleCount = useMemo(
    () => (reportData?.has_enrolled_students === false ? 0 : reportData?.total_female ?? femaleLearners.length),
    [reportData, femaleLearners]
  );
  const totalCount = useMemo(
    () => (reportData?.has_enrolled_students === false ? 0 : reportData?.total_combined ?? (maleCount + femaleCount)),
    [reportData, maleCount, femaleCount]
  );

  const activeRosterList = useMemo(() => {
    return groupingMode === 'COMBINED' ? sortedCombinedLearners : [...maleLearners, ...femaleLearners];
  }, [groupingMode, sortedCombinedLearners, maleLearners, femaleLearners]);

  const isRosterEmpty = activeRosterList.length === 0;

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
    const trackingId = `DOC-SF1-${schoolIdStr}-${dateStamp}-${timeCode}`;

    return { printedAt, trackingId };
  }, [reportData, school]);

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

  const paginatedPages = useMemo(() => {
    if (activePageConfig.layoutMode === 'pageless' || activeRosterList.length <= 25) {
      return [
        {
          pageNumber: 1,
          totalPages: 1,
          learners: activeRosterList,
          startIndex: 0,
          showFullHeader: true,
          showFooter: true,
        },
      ];
    }

    const printableHeight = Math.max(
      4,
      pageHeightInches - (activePageConfig.margins.top || 0.25) - (activePageConfig.margins.bottom || 0.25)
    );

    const fullHeaderH = 1.35;
    const theadH = 0.40;
    const trackingH = 0.22;
    const footerH = 2.10;
    const rowH = 0.18;

    const singlePageOverhead = fullHeaderH + theadH + footerH + trackingH;
    const singlePageCapacity = Math.floor((printableHeight - singlePageOverhead) / rowH);

    if (activeRosterList.length <= singlePageCapacity) {
      return [
        {
          pageNumber: 1,
          totalPages: 1,
          learners: activeRosterList,
          startIndex: 0,
          showFullHeader: true,
          showFooter: true,
        },
      ];
    }

    const pages: SF1PageChunk[] = [];
    let currentIdx = 0;
    const totalLearners = activeRosterList.length;

    while (currentIdx < totalLearners) {
      const pageNum: number = pages.length + 1;
      const isFirstPage = pageNum === 1;
      const showFullHeader = isFirstPage; // STRICT: Only Page 1 gets the letterhead

      const remaining = totalLearners - currentIdx;
      const overheadWithFooter = (showFullHeader ? fullHeaderH : 0) + theadH + footerH + trackingH;
      const capacityWithFooter = Math.floor((printableHeight - overheadWithFooter) / rowH);

      if (remaining <= capacityWithFooter) {
        pages.push({
          pageNumber: pageNum,
          learners: activeRosterList.slice(currentIdx, currentIdx + remaining),
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
          learners: activeRosterList.slice(currentIdx, currentIdx + sliceCount),
          startIndex: currentIdx,
          showFullHeader,
          showFooter: false,
        });
        currentIdx += sliceCount;
      }
    }

    if (pages.length > 0 && !pages[pages.length - 1].showFooter) {
      const pageNum: number = pages.length + 1;
      pages.push({
        pageNumber: pageNum,
        learners: [],
        startIndex: totalLearners,
        showFullHeader: false,
        showFooter: true,
      });
    }

    const totalPages: number = pages.length;
    return pages.map((p) => ({ ...p, totalPages }));
  }, [activePageConfig, activeRosterList, pageHeightInches]);

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
      await saveFileWithPicker(pdfBlob, `${getBaseFilename()}.pdf`, 'application/pdf', 'pdf', 'PDF Document (*.pdf)');
      showAlert({ title: 'PDF Exported', message: 'School Form 1 successfully saved.', type: 'success' });
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
    showAlert({ title: 'Excel Exported', message: 'SF1 spreadsheet exported successfully.', type: 'success' });
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
    showAlert({ title: 'Word Exported', message: 'SF1 document exported successfully.', type: 'success' });
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

    const rows = activeRosterList.map((l, idx) => {
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

    const csvContent = '\uFEFF' + [
      `# DOCUMENT TRACKING ID: ${auditMeta.trackingId}`,
      `# DATE AND TIME PRINTED: ${auditMeta.printedAt}`,
      headers.join(','),
      ...rows.map((r) => r.join(','))
    ].join('\r\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    await saveFileWithPicker(blob, `${getBaseFilename()}.csv`, 'text/csv', 'csv', 'CSV Document (*.csv)');
    showAlert({ title: 'CSV Exported', message: 'SF1 CSV export ready.', type: 'success' });
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
    showAlert({ title: 'JSON Exported', message: 'SF1 JSON export ready.', type: 'success' });
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
            <div style={republicStyle}>
              Republic of the Philippines
            </div>
            <div style={depedTitleStyle}>
              Department of Education
            </div>
            {effectiveRegion && (
              <div style={regionalOfficeStyle}>
                {effectiveRegion.toUpperCase()}
              </div>
            )}
            {effectiveDivision && (
              <div style={officeStyle}>
                {effectiveDivision.toUpperCase()}
              </div>
            )}

            <div style={{ fontFamily: 'Tahoma, Arial, sans-serif', fontSize: '10.5pt', fontWeight: 900, textTransform: 'uppercase', letterSpacing: '0.5px', marginTop: 4, color: '#000000' }}>
              School Form 1 (SF 1) School Register
            </div>
            <div style={{ fontSize: '6.0pt', fontStyle: 'italic', color: '#000000', marginTop: 1 }}>
              (This replaces Form 1, Master List &amp; STS Form 2-Family Background and Profile)
            </div>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 4, width: '100%' }}>
            <div style={{ display: 'flex', alignItems: 'center', width: '100%' }}>
              <div style={{ display: 'flex', alignItems: 'center', width: '22%' }}>
                <span style={{ fontWeight: 700, fontSize: '7.2pt', width: 62, flexShrink: 0, color: '#000000' }}>School ID</span>
                <div style={{ ...fieldBoxStyle, width: 88 }}>{effectiveSchoolId}</div>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', width: '26%', paddingRight: 8 }}>
                <span style={{ fontWeight: 700, fontSize: '7.2pt', width: 48, flexShrink: 0, color: '#000000' }}>Region</span>
                <div style={{ ...fieldBoxStyle, flex: 1, textAlign: 'left', paddingLeft: 6 }}>{effectiveRegion}</div>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', width: '28%', paddingRight: 8 }}>
                <span style={{ fontWeight: 700, fontSize: '7.2pt', width: 52, flexShrink: 0, color: '#000000' }}>Division</span>
                <div style={{ ...fieldBoxStyle, flex: 1, textAlign: 'left', paddingLeft: 6 }}>{effectiveDivision}</div>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', width: '24%' }}>
                <span style={{ fontWeight: 700, fontSize: '7.2pt', width: 48, flexShrink: 0, color: '#000000' }}>District</span>
                <div style={{ ...fieldBoxStyle, flex: 1, textAlign: 'left', paddingLeft: 6 }}>{effectiveDistrict}</div>
              </div>
            </div>

            <div style={{ display: 'flex', alignItems: 'center', width: '100%' }}>
              <div style={{ display: 'flex', alignItems: 'center', width: '42%' }}>
                <span style={{ fontWeight: 700, fontSize: '7.2pt', width: 78, flexShrink: 0, color: '#000000' }}>School Name</span>
                <div style={{ ...fieldBoxStyle, flex: 1, textAlign: 'left', paddingLeft: 6, marginRight: 8 }}>{effectiveSchoolName}</div>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', width: '25%', paddingRight: 8 }}>
                <span style={{ fontWeight: 700, fontSize: '7.2pt', width: 68, flexShrink: 0, color: '#000000' }}>School Year</span>
                <div style={{ ...fieldBoxStyle, flex: 1 }}>{reportData?.academic_year}</div>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', width: '33%' }}>
                <span style={{ fontWeight: 700, fontSize: '7.2pt', width: 62, flexShrink: 0, color: '#000000' }}>Grade Level</span>
                <div style={{ ...fieldBoxStyle, width: 48, flexShrink: 0, marginRight: 8 }}>{reportData?.grade_level}</div>
                <span style={{ fontWeight: 700, fontSize: '7.2pt', width: 42, flexShrink: 0, color: '#000000' }}>Section</span>
                <div style={{ ...fieldBoxStyle, flex: 1, textAlign: 'left', paddingLeft: 6 }}>{reportData?.section_name}</div>
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
    <thead>
      <tr>
        <th rowSpan={2} style={{ width: '1.8%', ...headerCell, fontSize: fontSizes.header }}>#</th>
        <th rowSpan={2} style={{ width: '6.6%', ...headerCell, fontSize: fontSizes.header }}>LRN</th>
        <th rowSpan={2} style={{ width: '13.0%', ...headerCell, fontSize: fontSizes.header }}>
          NAME<br />
          <span style={subHeaderSpan}>(Last Name, First Name, Middle Name)</span>
        </th>
        <th rowSpan={2} style={{ width: '2.4%', ...headerCell, fontSize: fontSizes.header }}>Sex (M/F)</th>
        <th rowSpan={2} style={{ width: '4.6%', ...headerCell, fontSize: fontSizes.header }}>
          BIRTH DATE<br />
          <span style={subHeaderSpan}>(mm/dd/yyyy)</span>
        </th>
        <th rowSpan={2} style={{ width: '3.4%', ...headerCell, fontSize: fontSizes.header }}>
          AGE as of 1st<br />
          <span style={subHeaderSpan}>Friday June</span>
        </th>
        <th rowSpan={2} style={{ width: '4.6%', ...headerCell, fontSize: fontSizes.header }}>
          BIRTH PLACE<br />
          <span style={subHeaderSpan}>(Province)</span>
        </th>
        <th rowSpan={2} style={{ width: '4.2%', ...headerCell, fontSize: fontSizes.header }}>MOTHER TONGUE</th>
        <th rowSpan={2} style={{ width: '4.0%', ...headerCell, fontSize: fontSizes.header }}>
          IP<br />
          <span style={subHeaderSpan}>(Ethnic Group)</span>
        </th>
        <th rowSpan={2} style={{ width: '4.2%', ...headerCell, fontSize: fontSizes.header }}>RELIGION</th>
        <th colSpan={4} style={{ textAlign: 'center', ...headerCell, fontSize: fontSizes.header }}>ADDRESS</th>
        <th colSpan={2} style={{ textAlign: 'center', ...headerCell, fontSize: fontSizes.header }}>PARENTS</th>
        <th colSpan={2} style={{ textAlign: 'center', ...headerCell, fontSize: fontSizes.header }}>GUARDIAN (if not Parent)</th>
        <th rowSpan={2} style={{ width: '6.0%', ...headerCell, fontSize: fontSizes.header }}>
          Contact Number of Parent or<br />Guardian
        </th>
        <th style={{ width: '6.2%', ...headerCell, fontSize: fontSizes.header }}>REMARKS</th>
      </tr>
      <tr>
        <th style={{ width: '4.8%', ...headerCell, fontSize: fontSizes.subHeader }}>House #/ Street/ Sitio/ Purok</th>
        <th style={{ width: '4.0%', ...headerCell, fontSize: fontSizes.subHeader }}>Barangay</th>
        <th style={{ width: '4.4%', ...headerCell, fontSize: fontSizes.subHeader }}>Municipality/ City</th>
        <th style={{ width: '4.0%', ...headerCell, fontSize: fontSizes.subHeader }}>Province</th>
        <th style={{ width: '6.8%', ...headerCell, fontSize: fontSizes.subHeader }}>Father&apos;s Name</th>
        <th style={{ width: '6.8%', ...headerCell, fontSize: fontSizes.subHeader }}>Mother&apos;s Maiden Name</th>
        <th style={{ width: '4.6%', ...headerCell, fontSize: fontSizes.subHeader }}>Name</th>
        <th style={{ width: '3.6%', ...headerCell, fontSize: fontSizes.subHeader }}>Relationship</th>
        <th style={{ width: '6.2%', ...headerCell, fontSize: fontSizes.subHeader, lineHeight: 1.05 }}>
          (Please refer to the<br />legend on last page)
        </th>
      </tr>
    </thead>
  );

  const renderSummaryFooter = () => (
    <div style={{ marginTop: 8, width: '100%' }}>
      <table style={{ width: '100%', borderCollapse: 'collapse', border: 'none' }}>
        <tbody>
          <tr style={{ verticalAlign: 'bottom' }}>
            <td style={{ width: '56%', paddingRight: 8, verticalAlign: 'bottom', border: 'none' }}>
              <div style={{ fontWeight: 800, fontSize: '5.8pt', textAlign: 'center', marginBottom: 2, color: '#000000' }}>
                List and Code of Indicators under REMARKS column
              </div>
              <table style={indicatorsTableStyle}>
                <thead>
                  <tr>
                    <th style={{ width: '15%', ...indicatorHeaderCell, fontSize: fontSizes.legend }}>Indicator</th>
                    <th style={{ width: '5%', ...indicatorHeaderCell, fontSize: fontSizes.legend }}>Code</th>
                    <th style={{ width: '30%', ...indicatorHeaderCell, fontSize: fontSizes.legend }}>Required Information</th>
                    <th style={{ width: '15%', ...indicatorHeaderCell, fontSize: fontSizes.legend }}>Indicator</th>
                    <th style={{ width: '5%', ...indicatorHeaderCell, fontSize: fontSizes.legend }}>Code</th>
                    <th style={{ width: '30%', ...indicatorHeaderCell, fontSize: fontSizes.legend }}>Required Information</th>
                  </tr>
                </thead>
                <tbody>
                  <tr>
                    <td style={{ ...indicatorCellBold, fontSize: fontSizes.legend }}>Transferred Out</td>
                    <td style={{ ...indicatorCellCenter, fontSize: fontSizes.legend }}>T/O</td>
                    <td style={{ ...indicatorCellText, fontSize: fontSizes.legend }}>Name of Public (P) Private (PR) School &amp; Effectivity Date</td>
                    <td style={{ ...indicatorCellBold, fontSize: fontSizes.legend }}>CCT Recipient</td>
                    <td style={{ ...indicatorCellCenter, fontSize: fontSizes.legend }}>CCT</td>
                    <td style={{ ...indicatorCellText, fontSize: fontSizes.legend }}>CCT Control Number &amp; Effectivity Date</td>
                  </tr>
                  <tr>
                    <td style={{ ...indicatorCellBold, fontSize: fontSizes.legend }}>Transferred IN</td>
                    <td style={{ ...indicatorCellCenter, fontSize: fontSizes.legend }}>T/I</td>
                    <td style={{ ...indicatorCellText, fontSize: fontSizes.legend }}>Name of Public (P) Private (PR) School &amp; Effectivity Date</td>
                    <td style={{ ...indicatorCellBold, fontSize: fontSizes.legend }}>Balik-Aral</td>
                    <td style={{ ...indicatorCellCenter, fontSize: fontSizes.legend }}>B/A</td>
                    <td style={{ ...indicatorCellText, fontSize: fontSizes.legend }}>Name of school last attended &amp; Year</td>
                  </tr>
                  <tr>
                    <td style={{ ...indicatorCellBold, fontSize: fontSizes.legend }}>Dropped</td>
                    <td style={{ ...indicatorCellCenter, fontSize: fontSizes.legend }}>DRP</td>
                    <td style={{ ...indicatorCellText, fontSize: fontSizes.legend }}>Reason and Effectivity Date</td>
                    <td style={{ ...indicatorCellBold, fontSize: fontSizes.legend }}>Learner With Disability</td>
                    <td style={{ ...indicatorCellCenter, fontSize: fontSizes.legend }}>LWD</td>
                    <td style={{ ...indicatorCellText, fontSize: fontSizes.legend }}>Specify</td>
                  </tr>
                  <tr>
                    <td style={{ ...indicatorCellBold, fontSize: fontSizes.legend }}>Late Enrollment</td>
                    <td style={{ ...indicatorCellCenter, fontSize: fontSizes.legend }}>LE</td>
                    <td style={{ ...indicatorCellText, fontSize: fontSizes.legend }}>Reason (Enrollment beyond 1st Friday of June)</td>
                    <td style={{ ...indicatorCellBold, fontSize: fontSizes.legend }}>Accelerated</td>
                    <td style={{ ...indicatorCellCenter, fontSize: fontSizes.legend }}>ACL</td>
                    <td style={{ ...indicatorCellText, fontSize: fontSizes.legend }}>Specify Level &amp; Effectivity Date</td>
                  </tr>
                </tbody>
              </table>
            </td>

            <td style={{ width: '14%', paddingRight: 8, verticalAlign: 'bottom', border: 'none' }}>
              <table style={summaryTableStyle}>
                <thead>
                  <tr>
                    <th style={{ width: '40%', ...indicatorHeaderCell, fontSize: fontSizes.footer }}>REGISTERED</th>
                    <th style={{ width: '30%', ...indicatorHeaderCell, fontSize: fontSizes.footer }}>BoSY</th>
                    <th style={{ width: '30%', ...indicatorHeaderCell, fontSize: fontSizes.footer }}>EoSY</th>
                  </tr>
                </thead>
                <tbody>
                  <tr>
                    <td style={{ ...indicatorCellCenter, fontWeight: 700, fontSize: fontSizes.footer }}>MALE</td>
                    <td style={{ ...indicatorCellCenter, fontSize: fontSizes.footer }}>{maleCount}</td>
                    <td style={indicatorCellCenter}></td>
                  </tr>
                  <tr>
                    <td style={{ ...indicatorCellCenter, fontWeight: 700, fontSize: fontSizes.footer }}>FEMALE</td>
                    <td style={{ ...indicatorCellCenter, fontSize: fontSizes.footer }}>{femaleCount}</td>
                    <td style={indicatorCellCenter}></td>
                  </tr>
                  <tr>
                    <td style={{ ...indicatorCellCenter, fontWeight: 700, fontSize: fontSizes.footer }}>TOTAL</td>
                    <td style={{ ...indicatorCellCenter, fontWeight: 800, fontSize: fontSizes.footer }}>{totalCount}</td>
                    <td style={indicatorCellCenter}></td>
                  </tr>
                </tbody>
              </table>
            </td>

            <td style={{ width: '15%', paddingRight: 8, verticalAlign: 'bottom', border: 'none' }}>
              <div style={signatureBlockStyle}>
                <div style={{ fontSize: '5.2pt', fontWeight: 700, textAlign: 'left', marginBottom: 14, color: '#000000' }}>Prepared by :</div>
                <div style={signatureLineStyle}>{reportData?.adviser_name}</div>
                <div style={{ fontSize: '4.8pt', textAlign: 'center', marginTop: 2, color: '#000000' }}>(Signature of Adviser over Printed Name)</div>
                <div style={datesRowStyle}>
                  <span>BoSY Date: ________</span><span>EoSY Date: ________</span>
                </div>
              </div>
            </td>

            <td style={{ width: '15%', verticalAlign: 'bottom', border: 'none' }}>
              <div style={signatureBlockStyle}>
                <div style={{ fontSize: '5.2pt', fontWeight: 700, textAlign: 'left', marginBottom: 14, color: '#000000' }}>Certified Correct:</div>
                <div style={signatureLineStyle}>{reportData?.school_head || school.principal_name}</div>
                <div style={{ fontSize: '4.8pt', textAlign: 'center', marginTop: 2, color: '#000000' }}>(Signature of School Head over Printed Name)</div>
                <div style={datesRowStyle}>
                  <span>BoSY Date: ________</span><span>EoSY Date: ________</span>
                </div>
              </div>
            </td>
          </tr>
        </tbody>
      </table>

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
          onExportGoogleSheets: () => {
            window.open('https://sheets.new', '_blank');
          },
          onExportWord: handleExportWord,
          onExportGoogleDocs: () => {
            window.open('https://docs.new', '_blank');
          },
          onExportCsv: handleExportCSV,
          onExportJson: handleExportJSON,
        }}
        onPrint={handlePrint}
        isExporting={exportingPdf}
      />

      {/* Control Strip */}
      <div className="no-print" style={controlStripStyle}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 14, flexWrap: 'wrap' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <label style={{ fontWeight: 700, color: '#334155', fontSize: '0.80rem' }}>As of Date:</label>
            <input
              type="date"
              value={selectedDate}
              onChange={(e) => setSelectedDate(e.target.value)}
              style={dateInputStyle}
            />
          </div>

          <div style={{ height: 20, width: 1, backgroundColor: '#cbd5e1' }} />

          {/* Roster Grouping Mode Toggle */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <span style={{ fontSize: '0.78rem', fontWeight: 700, color: '#475569' }}>Roster Layout:</span>
            <div style={{ display: 'flex', backgroundColor: '#f1f5f9', padding: 2, borderRadius: 6, border: '1px solid #cbd5e1' }}>
              <button
                type="button"
                onClick={() => setGroupingMode('COMBINED')}
                style={{
                  ...formatToggleBtn,
                  backgroundColor: groupingMode === 'COMBINED' ? '#0284c7' : 'transparent',
                  color: groupingMode === 'COMBINED' ? '#ffffff' : '#64748b',
                }}
                title="Single combined alphabetical learner roster (Default)"
              >
                <Users size={12} />
                <span>One List (Default)</span>
              </button>

              <button
                type="button"
                onClick={() => setGroupingMode('SEPARATED')}
                style={{
                  ...formatToggleBtn,
                  backgroundColor: groupingMode === 'SEPARATED' ? '#0284c7' : 'transparent',
                  color: groupingMode === 'SEPARATED' ? '#ffffff' : '#64748b',
                }}
                title="Separate male and female roster sections"
              >
                <Split size={12} />
                <span>Separate by Sex</span>
              </button>
            </div>
          </div>
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

      {/* Synchronized Viewport Preview Container */}
      <div ref={viewportContainerRef} style={viewerScrollContainerStyle}>
        {loading ? (
          <div style={loadingStateStyle}>
            <Loader2 className="animate-spin" size={28} color="#0284c7" />
            <span>Generating School Form 1...</span>
          </div>
        ) : error ? (
          <div style={errorStateStyle}>
            <AlertCircle size={24} color="#dc2626" />
            <span>{error}</span>
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
                id="sf1-print-document"
                ref={reportRef}
                style={{ width: '100%', display: 'flex', flexDirection: 'column', alignItems: 'center' }}
              >
                {paginatedPages.map((page) => (
                  <div
                    key={`sf1-page-${page.pageNumber}`}
                    className="sf1-page-sheet"
                    style={{
                      ...sheetWrapperStyle,
                      width: isPrinting ? '100%' : `${pageWidthInches}in`,
                      minWidth: isPrinting ? '100%' : `${pageWidthInches}in`,
                      maxWidth: isPrinting ? '100%' : `${pageWidthInches}in`,
                      minHeight: activePageConfig.layoutMode === 'pageless' ? 'auto' : `${pageHeightInches}in`,
                      boxShadow: isPrinting ? 'none' : '0 4px 24px rgba(0,0,0,0.12)',
                      padding: `${activePageConfig.margins.top}in ${activePageConfig.margins.right}in ${activePageConfig.margins.bottom}in ${activePageConfig.margins.left}in`,
                      backgroundColor: activePageConfig.pageColor || '#ffffff',
                      fontSize: fontSizes.table,
                      pageBreakBefore: page.pageNumber > 1 ? 'always' : 'auto',
                    }}
                  >
                    {/* Header ALWAYS ONLY on Page 1 */}
                    {page.pageNumber === 1 && renderHeader()}

                    <table style={mainTableStyle}>
                      {renderTableHeader()}
                      <tbody>
                        {isRosterEmpty ? (
                          <tr>
                            <td colSpan={20} style={{ textAlign: 'center', padding: '36px', fontWeight: 'bold', fontSize: '7.5pt' }}>
                              {reportData.notice || `Notice: No students enrolled in Section ${reportData.section_name} as of ${selectedDate}.`}
                            </td>
                          </tr>
                        ) : groupingMode === 'COMBINED' ? (
                          <>
                            {page.learners.map((learner, idx) => {
                              const absoluteIndex = page.startIndex + idx;
                              const { gName, gRel } = parseGuardian(learner.guardian_name, learner.guardian_relationship);
                              return (
                                <tr key={`combined-${learner.id}`} style={dataRowStyle}>
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
                            {page.showFooter && (
                              <tr style={{ backgroundColor: '#e2e8f0', fontWeight: 900, borderTop: '1.5px solid #000' }}>
                                <td colSpan={3} style={{ ...leftCell, paddingLeft: 12, fontWeight: 900 }}>
                                  TOTAL ENROLLED LEARNERS
                                </td>
                                <td style={{ ...centerCell, fontWeight: 900 }}>{totalCount}</td>
                                <td colSpan={16} style={{ ...leftCell, paddingLeft: 12, fontSize: '5pt', color: '#475569' }}>
                                  (Male: <strong>{maleCount}</strong> &bull; Female: <strong>{femaleCount}</strong>)
                                </td>
                              </tr>
                            )}
                          </>
                        ) : (
                          <>
                            {maleLearners.length > 0 && (
                              <>
                                <tr style={{ backgroundColor: '#f1f5f9', fontWeight: 800 }}>
                                  <td colSpan={20} style={{ padding: '2px 8px', fontSize: fontSizes.header, textAlign: 'left', color: '#0284c7' }}>
                                    MALE
                                  </td>
                                </tr>
                                {maleLearners.map((learner, idx) => {
                                  const { gName, gRel } = parseGuardian(learner.guardian_name, learner.guardian_relationship);
                                  return (
                                    <tr key={`male-${learner.id}`} style={dataRowStyle}>
                                      <td style={centerCell}>{idx + 1}</td>
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
                                <tr style={{ backgroundColor: '#f8fafc', fontWeight: 800 }}>
                                  <td colSpan={3} style={{ ...leftCell, paddingLeft: 12, fontWeight: 800 }}>
                                    TOTAL MALE
                                  </td>
                                  <td style={centerCell}>{maleCount}</td>
                                  <td colSpan={16} style={centerCell}></td>
                                </tr>
                              </>
                            )}

                            {femaleLearners.length > 0 && (
                              <>
                                <tr style={{ backgroundColor: '#fdf2f8', fontWeight: 800 }}>
                                  <td colSpan={20} style={{ padding: '2px 8px', fontSize: fontSizes.header, textAlign: 'left', color: '#db2777' }}>
                                    FEMALE
                                  </td>
                                </tr>
                                {femaleLearners.map((learner, idx) => {
                                  const { gName, gRel } = parseGuardian(learner.guardian_name, learner.guardian_relationship);
                                  return (
                                    <tr key={`female-${learner.id}`} style={dataRowStyle}>
                                      <td style={centerCell}>{idx + 1}</td>
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
                                <tr style={{ backgroundColor: '#f8fafc', fontWeight: 800 }}>
                                  <td colSpan={3} style={{ ...leftCell, paddingLeft: 12, fontWeight: 800 }}>
                                    TOTAL FEMALE
                                  </td>
                                  <td style={centerCell}>{femaleCount}</td>
                                  <td colSpan={16} style={centerCell}></td>
                                </tr>
                              </>
                            )}

                            {page.showFooter && (
                              <tr style={{ backgroundColor: '#e2e8f0', fontWeight: 900, borderTop: '1.5px solid #000' }}>
                                <td colSpan={3} style={{ ...leftCell, paddingLeft: 12, fontWeight: 900 }}>
                                  COMBINED TOTAL
                                </td>
                                <td style={{ ...centerCell, fontWeight: 900 }}>{totalCount}</td>
                                <td colSpan={16} style={centerCell}></td>
                              </tr>
                            )}
                          </>
                        )}
                      </tbody>
                    </table>

                    {page.showFooter && renderSummaryFooter()}

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
        reportTitle="SF1 School Register"
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

          #sf1-print-document {
            width: 100% !important;
            max-width: 100% !important;
            min-width: 100% !important;
            margin: 0 auto !important;
            padding: 0 !important;
            display: block !important;
          }

          .sf1-page-sheet {
            width: ${pageWidthInches}in !important;
            min-width: ${pageWidthInches}in !important;
            max-width: ${pageWidthInches}in !important;
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

          .sf1-page-sheet:last-child {
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

export default SF1ReportTab;

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
  flexWrap: 'wrap',
  gap: 10,
};

const dateInputStyle: React.CSSProperties = {
  padding: '4px 8px',
  borderRadius: 6,
  border: '1px solid #cbd5e1',
  fontSize: '0.80rem',
  color: '#0f172a',
};

const formatToggleBtn: React.CSSProperties = {
  display: 'inline-flex',
  alignItems: 'center',
  gap: 5,
  padding: '4px 9px',
  borderRadius: 5,
  border: 'none',
  fontSize: '0.72rem',
  fontWeight: 700,
  cursor: 'pointer',
  transition: 'all 0.15s ease',
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