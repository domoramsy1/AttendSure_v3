// AttendSure Web - SF1 Report Tab
// File: D:\AttendSure_V3\web\src\components\tabs\SF1ReportTab.tsx

/**
 * AttendSure - Official DepEd School Form 1 (SF1) School Register
 * File: web/src/components/tabs/SF1ReportTab.tsx
 */

import React, { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import apiClient, { peekApiCache } from '../../api/client';
import { API_ROUTES, extractApiError } from '../../api/routes';
import { PageSetupModal } from '../common/PageSetupModal';
import { DepEdReportHeader, DepEdReportFooter } from '../reports/DepEdReportHeaderFooter';
import { ReportViewerShell, ReportHeaderBar } from '../reports/ReportViewerShell';
import { useOfficialReportExport } from '../../hooks/useOfficialReportExport';
import { useTheme } from '../../context/ThemeContext';
import { useSchool } from '../../context/SchoolContext';
import { BookOpen, RefreshCw, Search, Users, Split } from 'lucide-react';

interface SectionOption {
  id: number;
  name: string;
  code?: string;
  grade_level_name?: string;
  adviser_name?: string;
}

interface SF1LearnerRow {
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
  address?: string;
  house_street?: string;
  house_street_sitio?: string;
  barangay?: string;
  municipality_city?: string;
  province?: string;
  father_name: string;
  mother_maiden_name: string;
  guardian_name: string;
  guardian_rel?: string;
  guardian_relationship?: string;
  guardian_contact: string;
  remarks: string;
}

interface SF1ReportResponse {
  school_id: string;
  school_name: string;
  region: string;
  division: string;
  district: string;
  academic_year: string;
  grade_level: string;
  section_name: string;
  adviser_name: string;
  school_head: string;
  school_address?: string;
  school_contact?: string;
  school_email?: string;
  left_logo?: string | null;
  right_logo?: string | null;
  school_logo?: string | null;
  students: SF1LearnerRow[];
  males: SF1LearnerRow[];
  females: SF1LearnerRow[];
  total_male: number;
  total_female: number;
  total_combined: number;
}

export interface SF1ReportTabProps {
  sectionId?: number | string;
  activeReportId?: string;
  onSelectReport?: (reportId: string) => void;
}

const sanitizeSearchText = (raw: string): string =>
  String(raw || '')
    .replace(/[\u0000-\u001F\u007F<>]/g, '')
    .trim()
    .slice(0, 80);

const parseGuardianFields = (name?: string, rel?: string) => {
  const roles = ['MOTHER', 'FATHER', 'AUNT', 'UNCLE', 'GRANDMOTHER', 'GRANDFATHER', 'GUARDIAN'];
  const cleanName = String(name || '').trim();
  const cleanRel = String(rel || '').trim();

  if (roles.includes(cleanName.toUpperCase()) && !roles.includes(cleanRel.toUpperCase())) {
    return { gName: cleanRel, gRel: cleanName };
  }
  return {
    gName: cleanName,
    gRel: cleanRel.toLowerCase() === 'mather' ? 'Mother' : cleanRel,
  };
};

const splitAddressParts = (st: SF1LearnerRow) => {
  const street = st.house_street_sitio || st.house_street || '';
  const brgy = st.barangay || '';
  const city = st.municipality_city || '';
  const prov = st.province || '';

  if (street || brgy || city || prov) {
    return { street, brgy, city, prov };
  }

  const parts = String(st.address || '')
    .split(',')
    .map((p) => p.trim())
    .filter(Boolean);

  return {
    street: parts[0] || '',
    brgy: parts[1] || '',
    city: parts[2] || '',
    prov: parts[3] || '',
  };
};

export const SF1ReportTab: React.FC<SF1ReportTabProps> = ({
  sectionId,
  activeReportId = 'sf1',
  onSelectReport,
}) => {
  const { tokens, brand } = useTheme();
  const { school: globalSchool } = useSchool();

  const cachedSectionsPayload = peekApiCache<any>(API_ROUTES.school.sections, { page_size: 250 });
  const initialSections: SectionOption[] = Array.isArray(cachedSectionsPayload)
    ? cachedSectionsPayload
    : cachedSectionsPayload?.results || [];

  const [sections, setSections] = useState<SectionOption[]>(initialSections);
  const [selectedSectionId, setSelectedSectionId] = useState<string>(
    sectionId ? String(sectionId) : initialSections[0] ? String(initialSections[0].id) : ''
  );

  const [searchQuery, setSearchQuery] = useState<string>('');
  const [groupingMode, setGroupingMode] = useState<'COMBINED' | 'SEPARATED'>('COMBINED');

  const [reportData, setReportData] = useState<SF1ReportResponse | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [refreshing, setRefreshing] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  const reportRef = useRef<HTMLDivElement>(null);
  const abortRef = useRef<AbortController | null>(null);

  const cleanSearch = useMemo(() => sanitizeSearchText(searchQuery).toLowerCase(), [searchQuery]);

  const { maleLearners, femaleLearners, combinedLearners } = useMemo(() => {
    if (!reportData) {
      return { maleLearners: [], femaleLearners: [], combinedLearners: [] };
    }
    const rawAll = Array.isArray(reportData.students) ? reportData.students : [];
    const rawMales = Array.isArray(reportData.males)
      ? reportData.males
      : rawAll.filter((s) => String(s.sex || '').toUpperCase().startsWith('M'));
    const rawFemales = Array.isArray(reportData.females)
      ? reportData.females
      : rawAll.filter((s) => !String(s.sex || '').toUpperCase().startsWith('M'));

    const match = (s: SF1LearnerRow) =>
      !cleanSearch ||
      String(s.name || '').toLowerCase().includes(cleanSearch) ||
      String(s.lrn || '').toLowerCase().includes(cleanSearch);

    const sortedAll = [...rawAll].filter(match).sort((a, b) => (a.name || '').localeCompare(b.name || ''));
    const sortedM = [...rawMales].filter(match).sort((a, b) => (a.name || '').localeCompare(b.name || ''));
    const sortedF = [...rawFemales].filter(match).sort((a, b) => (a.name || '').localeCompare(b.name || ''));

    return {
      maleLearners: sortedM,
      femaleLearners: sortedF,
      combinedLearners: sortedAll,
    };
  }, [reportData, cleanSearch]);

  const activeLearnerList = useMemo(
    () => (groupingMode === 'COMBINED' ? combinedLearners : [...maleLearners, ...femaleLearners]),
    [groupingMode, combinedLearners, maleLearners, femaleLearners]
  );

  const getBaseFilename = useCallback(() => {
    const sectionClean = (reportData?.section_name || 'Section').replace(/[^a-zA-Z0-9_-]/g, '_');
    const syClean = (reportData?.academic_year || 'SY').replace(/[^a-zA-Z0-9_-]/g, '_');
    return `DepEd_SF1_${sectionClean}_${syClean}`;
  }, [reportData?.section_name, reportData?.academic_year]);

  const buildCsvRows = useCallback(() => {
    if (!reportData) return { headers: [] as string[], rows: [] as Array<Array<string | number>> };
    const headers = [
      'No',
      'LRN',
      'Learner Name (Last, First, Middle)',
      'Sex',
      'Birth Date',
      'Age',
      'Mother Tongue',
      'IP (Ethnic Group)',
      'Religion',
      'House # / Street / Sitio / Purok',
      'Barangay',
      'Municipality / City',
      'Province',
      'Father Name',
      'Mother Maiden Name',
      'Guardian Name',
      'Relationship',
      'Contact Number',
      'Remarks',
    ];
    const rows = activeLearnerList.map((st, idx) => {
      const addr = splitAddressParts(st);
      const { gName, gRel } = parseGuardianFields(st.guardian_name, st.guardian_relationship || st.guardian_rel);
      return [
        idx + 1,
        st.lrn || '',
        st.name || '',
        st.sex || '',
        st.birthdate || '',
        st.age ?? '',
        st.mother_tongue || '',
        st.ethnic_group || '',
        st.religion || '',
        addr.street,
        addr.brgy,
        addr.city,
        addr.prov,
        st.father_name || '',
        st.mother_maiden_name || '',
        gName,
        gRel,
        st.guardian_contact || '',
        st.remarks || '',
      ];
    });
    return { headers, rows };
  }, [reportData, activeLearnerList]);

  const {
    auditMeta,
    isExportingPdf,
    isPrinting,
    pageConfig,
    setPageConfig,
    isPageSetupOpen,
    setIsPageSetupOpen,
    pageWidthInches,
    pageHeightInches,
    stampView,
    handleDirectPrint,
    handleExportPdf,
    handleExportCsv,
    handleExportExcel,
    handleExportWord,
    handleExportJson,
  } = useOfficialReportExport({
    formCode: 'SF1',
    reportData,
    reportRef,
    schoolId: reportData?.school_id || globalSchool.school_id,
    sectionId: selectedSectionId,
    getBaseFilename,
    buildCsvData: buildCsvRows,
  });

  useEffect(() => {
    if (sectionId) {
      setSelectedSectionId(String(sectionId));
    }
  }, [sectionId]);

  useEffect(() => {
    const controller = new AbortController();
    apiClient
      .get(API_ROUTES.school.sections, {
        params: { page_size: 250 },
        signal: controller.signal,
      })
      .then((res) => {
        if (controller.signal.aborted) return;
        const list: SectionOption[] = Array.isArray(res.data) ? res.data : res.data?.results || [];
        setSections(list);
        if (list.length > 0) {
          setSelectedSectionId((prev) => prev || String(list[0].id));
        } else {
          setLoading(false);
        }
      })
      .catch((err: unknown) => {
        const anyErr = err as { name?: string; code?: string };
        if (controller.signal.aborted || anyErr?.name === 'CanceledError' || anyErr?.code === 'ERR_CANCELED') {
          return;
        }
        setError(extractApiError(err, 'Could not load class sections.'));
        setLoading(false);
      });
    return () => {
      controller.abort();
    };
  }, []);

  const fetchSF1 = useCallback(
    async (silent = false, bypassCache = false) => {
      if (!selectedSectionId) return;

      abortRef.current?.abort();
      const controller = new AbortController();
      abortRef.current = controller;

      const endpoint = `${API_ROUTES.reports.sf1}${encodeURIComponent(selectedSectionId)}/`;
      const warmHit = !bypassCache ? peekApiCache<SF1ReportResponse>(endpoint) : undefined;

      if (warmHit) {
        setReportData(warmHit);
        setLoading(false);
        if (silent) setRefreshing(true);
      } else if (!silent) {
        setLoading(true);
      } else {
        setRefreshing(true);
      }
      setError(null);

      try {
        const res = await apiClient.get<SF1ReportResponse>(endpoint, {
          params: bypassCache ? { nocache: 1 } : undefined,
          signal: controller.signal,
        });
        if (controller.signal.aborted) return;
        const payload = res.data;
        setReportData(payload);
        stampView(payload?.school_id || globalSchool.school_id);
      } catch (err: unknown) {
        const anyErr = err as { name?: string; code?: string };
        if (controller.signal.aborted || anyErr?.name === 'CanceledError' || anyErr?.code === 'ERR_CANCELED') {
          return;
        }
        if (!silent) {
          setError(extractApiError(err, 'Could not load DepEd SF1 School Register.'));
        }
      } finally {
        if (!controller.signal.aborted) {
          setLoading(false);
          setRefreshing(false);
        }
      }
    },
    [selectedSectionId, globalSchool.school_id, stampView]
  );

  useEffect(() => {
    void fetchSF1(false, false);
    return () => {
      abortRef.current?.abort();
    };
  }, [fetchSF1]);

  const maleCount = reportData?.total_male ?? maleLearners.length;
  const femaleCount = reportData?.total_female ?? femaleLearners.length;
  const totalCount = reportData?.total_combined ?? maleCount + femaleCount;

  const paginatedLearners = useMemo(() => {
    if (!reportData) return [];
    if (pageConfig.layoutMode === 'pageless' || activeLearnerList.length === 0) {
      return [activeLearnerList];
    }
    const baseFirstRows = pageConfig.orientation === 'portrait' ? 26 : 18;
    const baseNextRows = pageConfig.orientation === 'portrait' ? 36 : 26;
    const heightScale = pageHeightInches / 8.5;
    const rowsFirst = Math.max(10, Math.floor(baseFirstRows * heightScale));
    const rowsNext = Math.max(14, Math.floor(baseNextRows * heightScale));

    if (activeLearnerList.length <= rowsFirst) {
      return [activeLearnerList];
    }

    const pages: SF1LearnerRow[][] = [];
    pages.push(activeLearnerList.slice(0, rowsFirst));
    let idx = rowsFirst;
    while (idx < activeLearnerList.length) {
      pages.push(activeLearnerList.slice(idx, idx + rowsNext));
      idx += rowsNext;
    }
    return pages;
  }, [reportData, activeLearnerList, pageConfig.layoutMode, pageConfig.orientation, pageHeightInches]);

  const renderLearnerRow = (st: SF1LearnerRow, rowNum: number) => {
    const addr = splitAddressParts(st);
    const { gName, gRel } = parseGuardianFields(st.guardian_name, st.guardian_relationship || st.guardian_rel);
    return (
      <tr key={`${st.id || st.lrn}-${rowNum}`}>
        <td style={tdCenter}>{rowNum}</td>
        <td style={{ ...tdCenter, fontFamily: 'monospace', fontWeight: 700 }}>{st.lrn}</td>
        <td style={{ ...tdLeft, fontWeight: 700 }}>{st.name}</td>
        <td style={tdCenter}>{st.sex}</td>
        <td style={tdCenter}>{st.birthdate}</td>
        <td style={tdCenter}>{st.age}</td>
        <td style={tdCenter}>{st.mother_tongue}</td>
        <td style={tdCenter}>{st.ethnic_group}</td>
        <td style={tdCenter}>{st.religion}</td>
        <td style={tdLeft}>{addr.street}</td>
        <td style={tdLeft}>{addr.brgy}</td>
        <td style={tdLeft}>{addr.city}</td>
        <td style={tdLeft}>{addr.prov}</td>
        <td style={tdLeft}>{st.father_name}</td>
        <td style={tdLeft}>{st.mother_maiden_name}</td>
        <td style={tdLeft}>{gName}</td>
        <td style={tdCenter}>{gRel}</td>
        <td style={{ ...tdCenter, fontFamily: 'monospace' }}>{st.guardian_contact}</td>
        <td style={tdCenter}>{st.remarks}</td>
      </tr>
    );
  };

  const schoolName = reportData?.school_name || globalSchool.school_name || '';
  const schoolId = reportData?.school_id || globalSchool.school_id || '';
  const schoolHead = reportData?.school_head || globalSchool.principal_name || '';

  return (
    <div
      className="report-tab-root"
      style={{
        display: 'flex',
        flexDirection: 'column',
        width: '100%',
        height: '100%',
        backgroundColor: tokens.bgApp,
      }}
    >
      <div className="no-print">
        <ReportHeaderBar
          activeReportId={activeReportId}
          onSelectReport={onSelectReport}
          documentTitle={
            reportData
              ? `SF1_Register_${reportData.section_name}_${reportData.academic_year}`
              : 'DepEd_SF1_School_Register'
          }
          subtitle="Official DepEd School Form 1 (SF1) School Register"
          isSavingPdf={isExportingPdf}
          onOpenPageSetup={() => setIsPageSetupOpen(true)}
          onPrint={handleDirectPrint}
          onSavePdf={() => void handleExportPdf(false)}
          onSavePdfAs={() => void handleExportPdf(true)}
          onDownloadExcel={() => void handleExportExcel(false)}
          onSaveExcelAs={() => void handleExportExcel(true)}
          onDownloadCsv={() => void handleExportCsv(false)}
          onSaveCsvAs={() => void handleExportCsv(true)}
          onDownloadWord={() => void handleExportWord(false)}
          onSaveWordAs={() => void handleExportWord(true)}
          onDownloadJson={() => void handleExportJson(false)}
          onSaveJsonAs={() => void handleExportJson(true)}
        />
      </div>

      <ReportViewerShell
        loading={loading}
        loadingMessage="Generating Official DepEd SF1 School Register..."
        error={error}
        hasData={Boolean(reportData)}
        isPrinting={isPrinting}
        isExportingPdf={isExportingPdf}
        pageWidthInches={pageWidthInches}
        pageHeightInches={pageHeightInches}
        pageConfig={pageConfig}
        sheetClassName="sf1-sheet-page"
        documentId="sf1-official-document"
        reportRef={reportRef}
        leftToolbarContent={
          <>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <BookOpen size={15} color={brand.primary} />
              <span style={{ fontSize: '0.78rem', fontWeight: 700, color: tokens.textSecondary }}>Section:</span>
              <select
                aria-label="Select Class Section"
                value={selectedSectionId}
                onChange={(e) => setSelectedSectionId(e.target.value)}
                style={{
                  padding: '5px 10px',
                  borderRadius: 6,
                  fontSize: '0.80rem',
                  fontWeight: 700,
                  cursor: 'pointer',
                  border: `1px solid ${tokens.borderStrong}`,
                  backgroundColor: tokens.bgInput,
                  color: tokens.textPrimary,
                }}
              >
                {sections.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.grade_level_name ? `${s.grade_level_name} - ` : ''}
                    {s.name}
                  </option>
                ))}
              </select>
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 6,
                  padding: '4px 10px',
                  borderRadius: 6,
                  border: `1px solid ${tokens.borderStrong}`,
                  backgroundColor: tokens.bgInput,
                }}
              >
                <Search size={13} color={tokens.textMuted} />
                <input
                  type="text"
                  maxLength={80}
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Search name or LRN..."
                  style={{
                    border: 'none',
                    outline: 'none',
                    background: 'transparent',
                    color: tokens.textPrimary,
                    fontSize: '0.78rem',
                    width: 155,
                  }}
                />
              </div>
            </div>

            <div
              style={{
                display: 'flex',
                backgroundColor: tokens.bgSurfaceSubtle,
                padding: 2,
                borderRadius: 6,
                border: `1px solid ${tokens.borderStrong}`,
              }}
            >
              <button
                type="button"
                onClick={() => setGroupingMode('COMBINED')}
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: 5,
                  padding: '4px 9px',
                  borderRadius: 5,
                  border: 'none',
                  fontSize: '0.72rem',
                  fontWeight: 700,
                  cursor: 'pointer',
                  backgroundColor: groupingMode === 'COMBINED' ? brand.buttonBg : 'transparent',
                  color: groupingMode === 'COMBINED' ? '#ffffff' : tokens.textSecondary,
                }}
              >
                <Users size={12} /> One List
              </button>
              <button
                type="button"
                onClick={() => setGroupingMode('SEPARATED')}
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: 5,
                  padding: '4px 9px',
                  borderRadius: 5,
                  border: 'none',
                  fontSize: '0.72rem',
                  fontWeight: 700,
                  cursor: 'pointer',
                  backgroundColor: groupingMode === 'SEPARATED' ? brand.buttonBg : 'transparent',
                  color: groupingMode === 'SEPARATED' ? '#ffffff' : tokens.textSecondary,
                }}
              >
                <Split size={12} /> By Sex
              </button>
            </div>

            <button
              type="button"
              onClick={() => void fetchSF1(true, true)}
              disabled={loading || refreshing}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: 6,
                padding: '5px 10px',
                borderRadius: 6,
                fontSize: '0.76rem',
                fontWeight: 700,
                cursor: 'pointer',
                backgroundColor: tokens.bgSurfaceSubtle,
                border: `1px solid ${tokens.borderStrong}`,
                color: tokens.textPrimary,
              }}
            >
              <RefreshCw size={13} className={refreshing ? 'animate-spin' : ''} />
              <span>Refresh</span>
            </button>
          </>
        }
      >
        {reportData &&
          paginatedLearners.map((pageRows, pageIdx) => {
            const isFirstPage = pageIdx === 0;
            const isLastPage = pageIdx === paginatedLearners.length - 1;
            const totalSheetCount = paginatedLearners.length;
            const startIdx = paginatedLearners.slice(0, pageIdx).reduce((sum, rows) => sum + rows.length, 0);

            const pageMales = pageRows.filter((s) => String(s.sex || '').toUpperCase().startsWith('M'));
            const pageFemales = pageRows.filter((s) => !String(s.sex || '').toUpperCase().startsWith('M'));

            return (
              <div
                key={pageIdx}
                className="sf1-sheet-page"
                data-print-page="true"
                style={{
                  backgroundColor: pageConfig.pageColor || '#ffffff',
                  color: '#000000',
                  width: isPrinting ? '100%' : `${pageWidthInches}in`,
                  minHeight:
                    pageConfig.layoutMode === 'pageless'
                      ? 'auto'
                      : isExportingPdf
                        ? `${Math.max(1, pageHeightInches - 0.08)}in`
                        : `${pageHeightInches}in`,
                  paddingTop: `${pageConfig.margins.top}in`,
                  paddingRight: `${pageConfig.margins.right}in`,
                  paddingBottom: `${pageConfig.margins.bottom}in`,
                  paddingLeft: `${pageConfig.margins.left}in`,
                  marginBottom: isPrinting || isLastPage ? 0 : '20px',
                  boxShadow: isPrinting ? 'none' : '0 4px 20px rgba(0, 0, 0, 0.22)',
                  border: isPrinting ? 'none' : '1px solid #cbd5e1',
                  boxSizing: 'border-box',
                  fontFamily: 'Arial, Helvetica, sans-serif',
                  display: 'flex',
                  flexDirection: 'column',
                  justifyContent: 'space-between',
                }}
              >
                <div>
                  {isFirstPage ? (
                    <DepEdReportHeader
                      formTitle="School Form 1 (SF 1) School Register"
                      formSubtitle="(This replaces Form 1, Master List & STS Form 2-Family Background and Profile)"
                      formType="SF1"
                      reportData={reportData}
                    />
                  ) : (
                    <div
                      style={{
                        display: 'flex',
                        justifyContent: 'space-between',
                        alignItems: 'center',
                        borderBottom: '1.5px solid #000',
                        paddingBottom: 4,
                        marginBottom: 6,
                        fontSize: '7.5pt',
                        fontWeight: 700,
                      }}
                    >
                      <span>
                        School Form 1 (SF1) School Register — {schoolName} ({schoolId})
                      </span>
                      <span>
                        {reportData.grade_level} - {reportData.section_name} | SY {reportData.academic_year} (Page {pageIdx + 1} of {totalSheetCount})
                      </span>
                    </div>
                  )}

                  <table style={sf1MainTable}>
                    <thead>
                      <tr>
                        <th rowSpan={2} style={{ ...thCell, width: '2.2%' }}>#</th>
                        <th rowSpan={2} style={{ ...thCell, width: '7.0%' }}>LRN</th>
                        <th rowSpan={2} style={{ ...thCell, width: '12.5%' }}>
                          NAME<br />
                          <span style={subThText}>(Last Name, First Name, Middle Name)</span>
                        </th>
                        <th rowSpan={2} style={{ ...thCell, width: '2.4%' }}>
                          Sex<br />
                          <span style={subThText}>(M/F)</span>
                        </th>
                        <th rowSpan={2} style={{ ...thCell, width: '5.2%' }}>
                          BIRTH DATE<br />
                          <span style={subThText}>(mm/dd/yyyy)</span>
                        </th>
                        <th rowSpan={2} style={{ ...thCell, width: '2.6%' }}>
                          AGE as of<br />1st Friday<br />June
                        </th>
                        <th rowSpan={2} style={{ ...thCell, width: '4.8%' }}>MOTHER<br />TONGUE</th>
                        <th rowSpan={2} style={{ ...thCell, width: '4.6%' }}>
                          IP<br />
                          <span style={subThText}>(Ethnic Group)</span>
                        </th>
                        <th rowSpan={2} style={{ ...thCell, width: '4.6%' }}>RELIGION</th>
                        <th colSpan={4} style={thCell}>ADDRESS</th>
                        <th colSpan={2} style={thCell}>PARENTS</th>
                        <th colSpan={2} style={thCell}>
                          GUARDIAN <span style={subThText}>(If not Parent)</span>
                        </th>
                        <th rowSpan={2} style={{ ...thCell, width: '6.0%' }}>
                          Contact Number<br />of Parent or<br />Guardian
                        </th>
                        <th rowSpan={2} style={{ ...thCell, width: '5.4%' }}>
                          REMARKS<br />
                          <span style={subThText}>(Refer to legend)</span>
                        </th>
                      </tr>
                      <tr>
                        <th style={{ ...thCell, width: '6.5%' }}>House #/ Street/<br />Sitio/ Purok</th>
                        <th style={{ ...thCell, width: '5.5%' }}>Barangay</th>
                        <th style={{ ...thCell, width: '5.8%' }}>Municipality/<br />City</th>
                        <th style={{ ...thCell, width: '5.2%' }}>Province</th>
                        <th style={{ ...thCell, width: '6.3%' }}>Father&apos;s Name</th>
                        <th style={{ ...thCell, width: '6.3%' }}>Mother&apos;s Maiden Name</th>
                        <th style={{ ...thCell, width: '4.0%' }}>Name</th>
                        <th style={{ ...thCell, width: '3.5%' }}>Relation-<br />ship</th>
                      </tr>
                    </thead>

                    <tbody>
                      {pageRows.length === 0 ? (
                        <tr>
                          <td colSpan={19} style={{ ...tdCenter, padding: '16px', fontStyle: 'italic' }}>
                            No learners enrolled in Section {reportData.section_name} yet.
                          </td>
                        </tr>
                      ) : groupingMode === 'COMBINED' ? (
                        pageRows.map((st, idx) => renderLearnerRow(st, startIdx + idx + 1))
                      ) : (
                        <>
                          {pageMales.length > 0 && (
                            <>
                              <tr style={{ backgroundColor: '#f1f5f9', fontWeight: 800 }}>
                                <td colSpan={19} style={{ ...tdLeft, color: '#0284c7', paddingLeft: 6 }}>
                                  MALE ({maleCount})
                                </td>
                              </tr>
                              {pageMales.map((st) => {
                                const mIdx = maleLearners.findIndex((m) => m.id === st.id || m.lrn === st.lrn);
                                return renderLearnerRow(st, mIdx >= 0 ? mIdx + 1 : 1);
                              })}
                            </>
                          )}
                          {pageFemales.length > 0 && (
                            <>
                              <tr style={{ backgroundColor: '#fdf2f8', fontWeight: 800 }}>
                                <td colSpan={19} style={{ ...tdLeft, color: '#db2777', paddingLeft: 6 }}>
                                  FEMALE ({femaleCount})
                                </td>
                              </tr>
                              {pageFemales.map((st) => {
                                const fIdx = femaleLearners.findIndex((f) => f.id === st.id || f.lrn === st.lrn);
                                return renderLearnerRow(st, fIdx >= 0 ? fIdx + 1 : 1);
                              })}
                            </>
                          )}
                        </>
                      )}

                      {isLastPage && activeLearnerList.length > 0 && (
                        <>
                          <tr style={{ backgroundColor: '#f8fafc', fontWeight: 800 }}>
                            <td colSpan={3} style={{ ...tdLeft, paddingLeft: 8 }}>TOTAL MALE</td>
                            <td style={tdCenter}>{maleCount}</td>
                            <td colSpan={15} style={tdLeft} />
                          </tr>
                          <tr style={{ backgroundColor: '#f8fafc', fontWeight: 800 }}>
                            <td colSpan={3} style={{ ...tdLeft, paddingLeft: 8 }}>TOTAL FEMALE</td>
                            <td style={tdCenter}>{femaleCount}</td>
                            <td colSpan={15} style={tdLeft} />
                          </tr>
                          <tr style={{ backgroundColor: '#e2e8f0', fontWeight: 900 }}>
                            <td colSpan={3} style={{ ...tdLeft, paddingLeft: 8 }}>COMBINED TOTAL</td>
                            <td style={tdCenter}>{totalCount}</td>
                            <td colSpan={15} style={tdLeft} />
                          </tr>
                        </>
                      )}
                    </tbody>
                  </table>

                  {isLastPage && (
                    <>
                      <div
                        style={{
                          display: 'grid',
                          gridTemplateColumns: '48% 22% 28%',
                          gap: '1%',
                          marginTop: 8,
                          alignItems: 'start',
                        }}
                      >
                        <table style={legendTable}>
                          <thead>
                            <tr>
                              <th colSpan={6} style={{ ...legendTh, textAlign: 'center', fontWeight: 800 }}>
                                List and Code of Indicators under REMARKS column
                              </th>
                            </tr>
                            <tr>
                              <th style={legendTh}>Indicator</th>
                              <th style={legendTh}>Code</th>
                              <th style={legendTh}>Required Information</th>
                              <th style={legendTh}>Indicator</th>
                              <th style={legendTh}>Code</th>
                              <th style={legendTh}>Required Information</th>
                            </tr>
                          </thead>
                          <tbody>
                            <tr>
                              <td style={legendTd}>Transferred Out</td>
                              <td style={legendTdCenter}>T/O</td>
                              <td style={legendTd}>Public (P) / Private (PR) School &amp; Date</td>
                              <td style={legendTd}>CCT Recipient</td>
                              <td style={legendTdCenter}>CCT</td>
                              <td style={legendTd}>CCT Control # &amp; Effectivity Date</td>
                            </tr>
                            <tr>
                              <td style={legendTd}>Transferred In</td>
                              <td style={legendTdCenter}>T/I</td>
                              <td style={legendTd}>Public (P) / Private (PR) School &amp; Date</td>
                              <td style={legendTd}>Balik-Aral</td>
                              <td style={legendTdCenter}>B/A</td>
                              <td style={legendTd}>Name of school last attended &amp; Year</td>
                            </tr>
                            <tr>
                              <td style={legendTd}>Dropped</td>
                              <td style={legendTdCenter}>DRP</td>
                              <td style={legendTd}>Reason and Effectivity Date</td>
                              <td style={legendTd}>Learner w/ Disability</td>
                              <td style={legendTdCenter}>LWD</td>
                              <td style={legendTd}>Specify condition</td>
                            </tr>
                            <tr>
                              <td style={legendTd}>Late Enrollment</td>
                              <td style={legendTdCenter}>LE</td>
                              <td style={legendTd}>Reason (beyond 1st Friday of June)</td>
                              <td style={legendTd}>Accelerated</td>
                              <td style={legendTdCenter}>ACL</td>
                              <td style={legendTd}>Specify Level &amp; Effectivity Date</td>
                            </tr>
                          </tbody>
                        </table>

                        <table style={legendTable}>
                          <thead>
                            <tr>
                              <th style={legendTh}>REGISTERED</th>
                              <th style={legendTh}>BoSY</th>
                              <th style={legendTh}>EoSY</th>
                            </tr>
                          </thead>
                          <tbody>
                            <tr>
                              <td style={{ ...legendTd, fontWeight: 700 }}>MALE</td>
                              <td style={legendTdCenter}>{maleCount}</td>
                              <td style={legendTdCenter}></td>
                            </tr>
                            <tr>
                              <td style={{ ...legendTd, fontWeight: 700 }}>FEMALE</td>
                              <td style={legendTdCenter}>{femaleCount}</td>
                              <td style={legendTdCenter}></td>
                            </tr>
                            <tr style={{ fontWeight: 900, backgroundColor: '#f1f5f9' }}>
                              <td style={legendTd}>TOTAL</td>
                              <td style={legendTdCenter}>{totalCount}</td>
                              <td style={legendTdCenter}></td>
                            </tr>
                          </tbody>
                        </table>

                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, fontSize: '6.2pt' }}>
                          <div>
                            <div style={{ fontWeight: 700, marginBottom: 14 }}>Prepared by:</div>
                            <div style={{ borderBottom: '1px solid #000', textAlign: 'center', fontWeight: 800, textTransform: 'uppercase', paddingBottom: 1, minHeight: 13 }}>
                              {reportData.adviser_name}
                            </div>
                            <div style={{ textAlign: 'center', fontSize: '5.5pt', marginTop: 2 }}>
                              (Signature of Adviser over Printed Name)
                            </div>
                          </div>

                          <div>
                            <div style={{ fontWeight: 700, marginBottom: 14 }}>Certified Correct:</div>
                            <div style={{ borderBottom: '1px solid #000', textAlign: 'center', fontWeight: 800, textTransform: 'uppercase', paddingBottom: 1, minHeight: 13 }}>
                              {schoolHead}
                            </div>
                            <div style={{ textAlign: 'center', fontSize: '5.5pt', marginTop: 2 }}>
                              (Signature of School Head over Printed Name)
                            </div>
                          </div>
                        </div>
                      </div>

                      <DepEdReportFooter
                        sealUrl={globalSchool.school_logo}
                        address={reportData.school_address || globalSchool.address}
                        contactNumber={reportData.school_contact || globalSchool.contact_number}
                        email={reportData.school_email || globalSchool.email}
                        reportData={reportData}
                      />
                    </>
                  )}
                </div>

                <div
                  style={{
                    marginTop: 6,
                    paddingTop: 3,
                    borderTop: '0.8px dashed #000000',
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    fontSize: '5.6pt',
                    color: '#000000',
                  }}
                >
                  <span>
                    School Form 1 (SF1) — Page {pageIdx + 1} of {totalSheetCount}
                  </span>
                  <span style={{ fontFamily: 'monospace', fontWeight: 700 }}>
                    PRINTED: {auditMeta.printedAt} &nbsp;|&nbsp; TRACKING ID: {auditMeta.trackingId}
                  </span>
                </div>
              </div>
            );
          })}
      </ReportViewerShell>

      <PageSetupModal
        isOpen={isPageSetupOpen}
        currentConfig={pageConfig}
        onLiveChange={setPageConfig}
        onApply={(cfg) => setPageConfig(cfg)}
        onClose={() => setIsPageSetupOpen(false)}
        reportTitle="SF1 School Register"
      />
    </div>
  );
};

const sf1MainTable: React.CSSProperties = {
  width: '100%',
  borderCollapse: 'collapse',
  tableLayout: 'fixed',
  border: '1.2px solid #000000',
};

const thCell: React.CSSProperties = {
  border: '1px solid #000000',
  padding: '2px 1.5px',
  fontSize: '5.6pt',
  fontWeight: 800,
  textAlign: 'center',
  verticalAlign: 'middle',
  backgroundColor: '#f1f5f9',
  lineHeight: 1.08,
  wordBreak: 'break-word',
};

const subThText: React.CSSProperties = {
  fontSize: '4.7pt',
  fontWeight: 400,
};

const tdLeft: React.CSSProperties = {
  border: '1px solid #000000',
  padding: '1.5px 2.5px',
  fontSize: '5.8pt',
  textAlign: 'left',
  verticalAlign: 'middle',
  lineHeight: 1.12,
  wordBreak: 'break-word',
};

const tdCenter: React.CSSProperties = {
  border: '1px solid #000000',
  padding: '1.5px 1.5px',
  fontSize: '5.8pt',
  textAlign: 'center',
  verticalAlign: 'middle',
  lineHeight: 1.12,
  wordBreak: 'break-word',
};

const legendTable: React.CSSProperties = {
  width: '100%',
  borderCollapse: 'collapse',
  border: '1px solid #000000',
  fontSize: '5.4pt',
};

const legendTh: React.CSSProperties = {
  border: '1px solid #000000',
  padding: '1.5px 2.5px',
  backgroundColor: '#f1f5f9',
  fontWeight: 700,
};

const legendTd: React.CSSProperties = {
  border: '1px solid #000000',
  padding: '1.5px 2.5px',
  lineHeight: 1.1,
};

const legendTdCenter: React.CSSProperties = {
  border: '1px solid #000000',
  padding: '1.5px 2.5px',
  textAlign: 'center',
  fontWeight: 700,
};

export default SF1ReportTab;
