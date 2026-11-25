/**
 * AttendSure - Official DepEd School Form 4 (SF4) Monthly Learner's Movement and Attendance
 * File: web/src/components/tabs/SF4ReportTab.tsx
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
import { Calendar, RefreshCw, Search } from 'lucide-react';

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
  school_address?: string;
  school_contact?: string;
  school_email?: string;
  left_logo?: string | null;
  right_logo?: string | null;
  school_logo?: string | null;
  grade_groups: SF4GradeGroup[];
  non_graded_summary: SF4SectionRecord | null;
  total_summary: SF4SectionRecord;
}

interface SF4PageChunk {
  pageNumber: number;
  totalPages: number;
  groups: SF4GradeGroup[];
  isFinalPage: boolean;
}

export interface SF4ReportTabProps {
  activeReportId?: string;
  onSelectReport?: (reportId: string) => void;
}

const MONTH_NAMES = [
  'January',
  'February',
  'March',
  'April',
  'May',
  'June',
  'July',
  'August',
  'September',
  'October',
  'November',
  'December',
];

const getDynamicSchoolYear = (): string => {
  const now = new Date();
  const y = now.getFullYear();
  return now.getMonth() >= 5 ? `${y}-${y + 1}` : `${y - 1}-${y}`;
};

const sanitizeSearchText = (raw: string): string =>
  String(raw || '')
    .replace(/[\u0000-\u001F\u007F<>]/g, '')
    .trim()
    .slice(0, 80);

export const SF4ReportTab: React.FC<SF4ReportTabProps> = ({
  activeReportId = 'sf4',
  onSelectReport,
}) => {
  const { tokens, brand } = useTheme();
  const { school: globalSchool } = useSchool();

  const now = useMemo(() => new Date(), []);
  const yearOptions = useMemo(() => {
    const cur = now.getFullYear();
    return [cur - 1, cur, cur + 1];
  }, [now]);

  const [schoolYearOptions, setSchoolYearOptions] = useState<string[]>([]);
  const [selectedAcademicYear, setSelectedAcademicYear] = useState<string>(
    () => globalSchool.academic_year || getDynamicSchoolYear()
  );
  const [selectedMonth, setSelectedMonth] = useState<string>(
    () => MONTH_NAMES[now.getMonth()] || 'October'
  );
  const [selectedYear, setSelectedYear] = useState<number>(now.getFullYear());
  const [searchQuery, setSearchQuery] = useState<string>('');

  const [reportData, setReportData] = useState<SF4ReportData | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [refreshing, setRefreshing] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  const reportRef = useRef<HTMLDivElement>(null);
  const abortRef = useRef<AbortController | null>(null);

  const filteredGradeGroups = useMemo(() => {
    const groups = Array.isArray(reportData?.grade_groups) ? reportData!.grade_groups : [];
    const q = sanitizeSearchText(searchQuery).toLowerCase();
    if (!q) return groups;

    return groups
      .map((g) => ({
        ...g,
        sections: (g.sections || []).filter(
          (s) =>
            s.section_name.toLowerCase().includes(q) ||
            s.adviser_name.toLowerCase().includes(q) ||
            s.grade_level.toLowerCase().includes(q)
        ),
      }))
      .filter((g) => g.sections.length > 0 || g.grade_level.toLowerCase().includes(q));
  }, [reportData, searchQuery]);

  const getBaseFilename = useCallback(
    () => `DepEd_SF4_${reportData?.month || selectedMonth}_${selectedYear}`,
    [reportData?.month, selectedMonth, selectedYear]
  );

  const buildCsvData = useCallback(() => {
    if (!reportData) return { headers: [] as string[], rows: [] as Array<Array<string | number>> };
    const headers = [
      'Name of Adviser',
      'Grade Level',
      'Section',
      'Registered End M',
      'Registered End F',
      'Registered End T',
      'Daily Avg M',
      'Daily Avg F',
      'Daily Avg T',
      'Attendance % M',
      'Attendance % F',
      'Attendance % T',
      'Dropped Out Cum T',
      'Transferred Out Cum T',
      'Transferred In Cum T',
    ];
    const rows: Array<Array<string | number>> = [];
    filteredGradeGroups.forEach((grp) => {
      grp.sections.forEach((s) => {
        rows.push([
          s.adviser_name,
          s.grade_level,
          s.section_name,
          s.registered_end.m,
          s.registered_end.f,
          s.registered_end.total,
          s.daily_average.m,
          s.daily_average.f,
          s.daily_average.total,
          s.attendance_percentage.m,
          s.attendance_percentage.f,
          s.attendance_percentage.total,
          s.dropped_out_cumulative.total,
          s.transferred_out_cumulative.total,
          s.transferred_in_cumulative.total,
        ]);
      });
    });
    return { headers, rows };
  }, [reportData, filteredGradeGroups]);

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
    formCode: 'SF4',
    reportData,
    reportRef,
    schoolId: reportData?.school_id || globalSchool.school_id,
    getBaseFilename,
    buildCsvData,
  });

  useEffect(() => {
    const controller = new AbortController();
    apiClient
      .get(API_ROUTES.school.schoolYears, { signal: controller.signal })
      .then((res) => {
        if (controller.signal.aborted) return;
        const list = Array.isArray(res.data) ? res.data : res.data?.results || [];
        const codes = list
          .map((item: any) => (typeof item === 'string' ? item : item?.code || item?.name || ''))
          .filter(Boolean);
        setSchoolYearOptions(codes);
      })
      .catch(() => {});
    return () => controller.abort();
  }, []);

  const availableSchoolYears = useMemo(
    () =>
      Array.from(
        new Set(
          [
            ...schoolYearOptions,
            reportData?.school_year,
            globalSchool.academic_year,
            selectedAcademicYear,
            getDynamicSchoolYear(),
          ].filter(Boolean)
        )
      ) as string[],
    [schoolYearOptions, reportData?.school_year, globalSchool.academic_year, selectedAcademicYear]
  );

  const fetchSF4 = useCallback(
    async (silent = false, bypassCache = false) => {
      abortRef.current?.abort();
      const controller = new AbortController();
      abortRef.current = controller;

      const baseParams = {
        month: selectedMonth,
        year: selectedYear,
        school_year: selectedAcademicYear,
      };
      const warmHit = !bypassCache
        ? peekApiCache<SF4ReportData>(API_ROUTES.reports.sf4, baseParams)
        : undefined;

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
        const res = await apiClient.get<SF4ReportData>(API_ROUTES.reports.sf4, {
          params: bypassCache ? { ...baseParams, nocache: 1 } : baseParams,
          signal: controller.signal,
        });
        if (controller.signal.aborted) return;
        setReportData(res.data);
        stampView(res.data?.school_id || globalSchool.school_id);
      } catch (err: unknown) {
        const anyErr = err as { name?: string; code?: string };
        if (controller.signal.aborted || anyErr?.name === 'CanceledError' || anyErr?.code === 'ERR_CANCELED') {
          return;
        }
        if (!silent) {
          setError(extractApiError(err, 'Could not load DepEd SF4 School Summary Report.'));
        }
      } finally {
        if (!controller.signal.aborted) {
          setLoading(false);
          setRefreshing(false);
        }
      }
    },
    [selectedMonth, selectedYear, selectedAcademicYear, globalSchool.school_id, stampView]
  );

  useEffect(() => {
    void fetchSF4(false, false);
    return () => {
      abortRef.current?.abort();
    };
  }, [fetchSF4]);

  const paginatedPages = useMemo<SF4PageChunk[]>(() => {
    if (pageConfig.layoutMode === 'pageless' || filteredGradeGroups.length === 0) {
      return [{ pageNumber: 1, totalPages: 1, groups: filteredGradeGroups, isFinalPage: true }];
    }

    const printableHeight = Math.max(
      3.5,
      pageHeightInches - (pageConfig.margins.top || 0.25) - (pageConfig.margins.bottom || 0.25)
    );
    const rowH = 0.22;
    const totalRows = filteredGradeGroups.reduce(
      (acc, g) => acc + (g.sections.length > 0 ? g.sections.length + 1 : 1),
      3
    );

    if (totalRows * rowH + 3.6 <= printableHeight) {
      return [{ pageNumber: 1, totalPages: 1, groups: filteredGradeGroups, isFinalPage: true }];
    }

    const rawPages: Array<{ groups: SF4GradeGroup[] }> = [];
    let currentGroups: SF4GradeGroup[] = [];
    let currentRows = 0;

    filteredGradeGroups.forEach((grp) => {
      const grpRows = grp.sections.length > 0 ? grp.sections.length + 1 : 1;
      const cap = rawPages.length === 0 ? 18 : 26;
      if (currentRows + grpRows <= cap || currentGroups.length === 0) {
        currentGroups.push(grp);
        currentRows += grpRows;
      } else {
        rawPages.push({ groups: currentGroups });
        currentGroups = [grp];
        currentRows = grpRows;
      }
    });

    if (currentGroups.length > 0) {
      rawPages.push({ groups: currentGroups });
    }

    const total = rawPages.length;
    return rawPages.map((p, idx) => ({
      pageNumber: idx + 1,
      totalPages: total,
      groups: p.groups,
      isFinalPage: idx === total - 1,
    }));
  }, [filteredGradeGroups, pageConfig, pageHeightInches]);

  const renderTripletCells = (triplet?: MetricTriplet) => (
    <>
      <td style={tdNum}>{triplet ? triplet.m : 0}</td>
      <td style={tdNum}>{triplet ? triplet.f : 0}</td>
      <td style={tdNumBold}>{triplet ? triplet.total : 0}</td>
    </>
  );

  const renderSectionMetricCols = (rec?: SF4SectionRecord | null) => (
    <>
      {renderTripletCells(rec?.registered_end)}
      {renderTripletCells(rec?.daily_average)}
      {renderTripletCells(rec?.attendance_percentage)}
      {renderTripletCells(rec?.dropped_out_prev)}
      {renderTripletCells(rec?.dropped_out_month)}
      {renderTripletCells(rec?.dropped_out_cumulative)}
      {renderTripletCells(rec?.transferred_out_prev)}
      {renderTripletCells(rec?.transferred_out_month)}
      {renderTripletCells(rec?.transferred_out_cumulative)}
      {renderTripletCells(rec?.transferred_in_prev)}
      {renderTripletCells(rec?.transferred_in_month)}
      {renderTripletCells(rec?.transferred_in_cumulative)}
    </>
  );

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
              ? `SF4_Movement_Attendance_${reportData.month}_${reportData.year}`
              : 'DepEd_SF4_Monthly_Movement'
          }
          subtitle="Official DepEd School Form 4 (SF4) Monthly Learner's Movement and Attendance"
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
        loadingMessage="Consolidating Official DepEd SF4 Summary..."
        error={error}
        hasData={Boolean(reportData)}
        isPrinting={isPrinting}
        isExportingPdf={isExportingPdf}
        pageWidthInches={pageWidthInches}
        pageHeightInches={pageHeightInches}
        pageConfig={pageConfig}
        sheetClassName="sf4-sheet-page"
        documentId="sf4-official-document"
        reportRef={reportRef}
        leftToolbarContent={
          <>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <span style={{ fontSize: '0.78rem', fontWeight: 700, color: tokens.textSecondary }}>SY:</span>
              <select
                aria-label="Select School Year"
                value={selectedAcademicYear}
                onChange={(e) => setSelectedAcademicYear(e.target.value)}
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
                {availableSchoolYears.map((sy) => (
                  <option key={sy} value={sy}>
                    {sy}
                  </option>
                ))}
              </select>
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <Calendar size={15} color={brand.primary} />
              <select
                aria-label="Select Month"
                value={selectedMonth}
                onChange={(e) => setSelectedMonth(e.target.value)}
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
                {MONTH_NAMES.map((m) => (
                  <option key={m} value={m}>
                    {m}
                  </option>
                ))}
              </select>

              <select
                aria-label="Select Year"
                value={selectedYear}
                onChange={(e) => setSelectedYear(Number(e.target.value))}
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
                {yearOptions.map((y) => (
                  <option key={y} value={y}>
                    {y}
                  </option>
                ))}
              </select>
            </div>

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
                placeholder="Search section or adviser..."
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

            <button
              type="button"
              onClick={() => void fetchSF4(true, true)}
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
          paginatedPages.map((page) => (
            <div
              key={`sf4-page-${page.pageNumber}`}
              className="sf4-sheet-page"
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
                marginBottom: isPrinting || page.isFinalPage ? 0 : '20px',
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
                {page.pageNumber === 1 ? (
                  <DepEdReportHeader
                    formTitle="School Form 4 (SF 4) Monthly Learner's Movement and Attendance"
                    formSubtitle="(Consolidated Learner Movement and Monthly Attendance Summary)"
                    formType="SF4"
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
                      School Form 4 (SF4) — {schoolName} ({schoolId})
                    </span>
                    <span>
                      {reportData.month} {reportData.year} | SY {reportData.school_year} (Page {page.pageNumber} of {page.totalPages})
                    </span>
                  </div>
                )}

                <table style={sf4Table}>
                  <thead>
                    <tr>
                      <th rowSpan={3} style={{ ...thCell, width: '9.0%' }}>NAME OF ADVISER</th>
                      <th rowSpan={3} style={{ ...thCell, width: '6.8%' }}>GRADE/<br />YEAR<br />LEVEL</th>
                      <th rowSpan={3} style={{ ...thCell, width: '6.6%' }}>SECTION</th>
                      <th colSpan={3} rowSpan={2} style={thCell}>
                        REGISTERED LEARNER<br />
                        <span style={{ fontSize: '4.6pt', fontWeight: 400 }}>(As of End of Month)</span>
                      </th>
                      <th colSpan={6} style={thCell}>ATTENDANCE</th>
                      <th colSpan={9} style={thCell}>DROPPED OUT</th>
                      <th colSpan={9} style={thCell}>TRANSFERRED OUT</th>
                      <th colSpan={9} style={thCell}>TRANSFERRED IN</th>
                    </tr>
                    <tr>
                      <th colSpan={3} style={thSubGroup}>Daily Average</th>
                      <th colSpan={3} style={thSubGroup}>Percentage for Month</th>
                      <th colSpan={3} style={thSubGroup}>(A) Prev Month</th>
                      <th colSpan={3} style={thSubGroup}>(B) For Month</th>
                      <th colSpan={3} style={thSubGroup}>(A+B) Cumulative</th>
                      <th colSpan={3} style={thSubGroup}>(A) Prev Month</th>
                      <th colSpan={3} style={thSubGroup}>(B) For Month</th>
                      <th colSpan={3} style={thSubGroup}>(A+B) Cumulative</th>
                      <th colSpan={3} style={thSubGroup}>(A) Prev Month</th>
                      <th colSpan={3} style={thSubGroup}>(B) For Month</th>
                      <th colSpan={3} style={thSubGroup}>(A+B) Cumulative</th>
                    </tr>
                    <tr>
                      {Array.from({ length: 12 }).map((_, idx) => (
                        <React.Fragment key={`mft-${idx}`}>
                          <th style={thMFT}>M</th>
                          <th style={thMFT}>F</th>
                          <th style={thMFT}>T</th>
                        </React.Fragment>
                      ))}
                    </tr>
                  </thead>

                  <tbody>
                    <tr style={{ backgroundColor: '#f8fafc', fontWeight: 800 }}>
                      <td colSpan={39} style={{ ...tdText, paddingLeft: 6 }}>
                        ELEMENTARY / SECONDARY:
                      </td>
                    </tr>

                    {page.groups.map((grp) => (
                      <React.Fragment key={`grp-${grp.grade_level}`}>
                        {grp.sections && grp.sections.length > 0 ? (
                          <>
                            {grp.sections.map((sec) => (
                              <tr key={`sec-${sec.section_id}`}>
                                <td style={tdText}>{sec.adviser_name}</td>
                                <td style={{ ...tdText, fontWeight: 700 }}>{sec.grade_level}</td>
                                <td style={tdText}>{sec.section_name}</td>
                                {renderSectionMetricCols(sec)}
                              </tr>
                            ))}
                            <tr style={{ backgroundColor: '#f8fafc', fontWeight: 800 }}>
                              <td colSpan={3} style={{ ...tdText, fontWeight: 800 }}>
                                TOTAL FOR {grp.grade_level.toUpperCase()}
                              </td>
                              {renderSectionMetricCols(grp.subtotal)}
                            </tr>
                          </>
                        ) : (
                          <tr>
                            <td style={tdText}></td>
                            <td style={{ ...tdText, fontWeight: 700 }}>{grp.grade_level}</td>
                            <td style={tdText}></td>
                            {renderSectionMetricCols(grp.subtotal)}
                          </tr>
                        )}
                      </React.Fragment>
                    ))}

                    {page.isFinalPage && reportData.non_graded_summary && (
                      <tr style={{ backgroundColor: '#f8fafc', fontWeight: 800 }}>
                        <td colSpan={3} style={{ ...tdText, fontWeight: 800 }}>TOTAL FOR NON-GRADED</td>
                        {renderSectionMetricCols(reportData.non_graded_summary)}
                      </tr>
                    )}

                    {page.isFinalPage && reportData.total_summary && (
                      <tr style={{ backgroundColor: '#e2e8f0', fontWeight: 900 }}>
                        <td colSpan={3} style={{ ...tdText, fontWeight: 900 }}>TOTAL</td>
                        {renderSectionMetricCols(reportData.total_summary)}
                      </tr>
                    )}
                  </tbody>
                </table>

                {page.isFinalPage && (
                  <>
                    <div
                      style={{
                        display: 'grid',
                        gridTemplateColumns: '68% 30%',
                        gap: '2%',
                        marginTop: 8,
                        fontSize: '6.4pt',
                      }}
                    >
                      <div style={{ border: '1px solid #000', padding: '5px 8px', lineHeight: 1.25 }}>
                        <div style={{ fontWeight: 800, marginBottom: 2 }}>GUIDELINES:</div>
                        <div>1. This form shall be accomplished every end of the month using the summary box of SF2 submitted by the teachers/advisers.</div>
                        <div>2. Furnish copy to Division Office a week after June 30, October 30 &amp; March 31.</div>
                        <div>3. Only teachers handling advisory classes shall be reported.</div>
                      </div>

                      <div style={{ display: 'flex', flexDirection: 'column', justifyContent: 'flex-end' }}>
                        <div style={{ fontWeight: 700, marginBottom: 16 }}>Prepared and Submitted by:</div>
                        <div style={{ borderBottom: '1px solid #000', textAlign: 'center', fontWeight: 800, textTransform: 'uppercase', fontSize: '7.5pt', minHeight: 14 }}>
                          {schoolHead}
                        </div>
                        <div style={{ textAlign: 'center', fontSize: '6pt', marginTop: 2 }}>
                          (Signature of School Head over Printed Name)
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
                  School Form 4 (SF4) — Page {page.pageNumber} of {page.totalPages}
                </span>
                <span style={{ fontFamily: 'monospace', fontWeight: 700 }}>
                  PRINTED: {auditMeta.printedAt} &nbsp;|&nbsp; TRACKING ID: {auditMeta.trackingId}
                </span>
              </div>
            </div>
          ))}
      </ReportViewerShell>

      <PageSetupModal
        isOpen={isPageSetupOpen}
        currentConfig={pageConfig}
        onLiveChange={setPageConfig}
        onApply={(cfg) => setPageConfig(cfg)}
        onClose={() => setIsPageSetupOpen(false)}
        reportTitle="SF4 Monthly Learner Movement"
      />
    </div>
  );
};

const sf4Table: React.CSSProperties = {
  width: '100%',
  borderCollapse: 'collapse',
  tableLayout: 'fixed',
  border: '1.2px solid #000000',
};

const thCell: React.CSSProperties = {
  border: '1px solid #000000',
  padding: '2px 1px',
  fontSize: '5.5pt',
  fontWeight: 800,
  textAlign: 'center',
  verticalAlign: 'middle',
  backgroundColor: '#f1f5f9',
  lineHeight: 1.06,
};

const thSubGroup: React.CSSProperties = {
  border: '1px solid #000000',
  padding: '1.5px 1px',
  fontSize: '4.8pt',
  fontWeight: 700,
  textAlign: 'center',
  verticalAlign: 'middle',
  backgroundColor: '#f8fafc',
  lineHeight: 1.05,
};

const thMFT: React.CSSProperties = {
  border: '1px solid #000000',
  padding: '1px 0',
  width: '2.15%',
  fontSize: '5.2pt',
  fontWeight: 800,
  textAlign: 'center',
  backgroundColor: '#f1f5f9',
};

const tdText: React.CSSProperties = {
  border: '1px solid #000000',
  padding: '2px 3px',
  fontSize: '5.8pt',
  textAlign: 'left',
  verticalAlign: 'middle',
  overflow: 'hidden',
  textOverflow: 'ellipsis',
  whiteSpace: 'nowrap',
};

const tdNum: React.CSSProperties = {
  border: '1px solid #000000',
  padding: '2px 1px',
  fontSize: '5.6pt',
  textAlign: 'center',
  verticalAlign: 'middle',
};

const tdNumBold: React.CSSProperties = {
  ...tdNum,
  fontWeight: 800,
};

export default SF4ReportTab;