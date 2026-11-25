/**
 * AttendSure - Official DepEd School Form 2 (SF2) Daily Attendance Report of Learners
 * File: web/src/components/tabs/SF2ReportTab.tsx
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
import { BookOpen, Calendar, RefreshCw, Search } from 'lucide-react';

interface SectionOption {
  id: number;
  name: string;
  grade_level_name?: string;
}

export interface SchoolDay {
  dateNumber: number;
  dayOfWeek: 'M' | 'T' | 'W' | 'TH' | 'F';
  fullDate: string;
}

export interface SF2Learner {
  id: number;
  lrn: string;
  name: string;
  sex: 'M' | 'F';
  attendance: Record<number, string | number>;
  total_absent: number;
  total_tardy: number;
  remarks: string;
}

export interface MetricCounts {
  m: number;
  f: number;
  total: number;
}

export interface SF2Metrics {
  enrolment_june: MetricCounts;
  late_enrolment: MetricCounts;
  registered_end: MetricCounts;
  percentage_enrolment: MetricCounts;
  average_daily_attendance: MetricCounts;
  percentage_attendance: MetricCounts;
  consecutive_5_absent_count: MetricCounts;
  consecutive_5?: MetricCounts;
  drop_out: MetricCounts;
  transferred_out: MetricCounts;
  transferred_in: MetricCounts;
}

export interface SF2ReportData {
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
  school_address?: string;
  school_contact?: string;
  school_email?: string;
  left_logo?: string | null;
  right_logo?: string | null;
  school_logo?: string | null;
  school_days: SchoolDay[];
  has_enrolled_students?: boolean;
  males: SF2Learner[];
  females: SF2Learner[];
  metrics: SF2Metrics;
}

export interface SF2ReportTabProps {
  sectionId?: number | string;
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

const PRESENT_STATUSES = new Set(['present', 'late', 'tardy', 'cutting', 'excused']);

const SVG_DIAGONAL_ONLY =
  'data:image/svg+xml;utf8,' +
  encodeURIComponent(
    '<svg xmlns="http://www.w3.org/2000/svg" width="24" height="16" viewBox="0 0 24 16" preserveAspectRatio="none"><line x1="0" y1="16" x2="24" y2="0" stroke="#000000" stroke-width="0.6"/></svg>'
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

const AttendanceCell: React.FC<{ status?: string | number | null; isSchoolDay?: boolean }> = ({
  status,
  isSchoolDay = true,
}) => {
  if (!isSchoolDay) {
    return <div style={{ width: '100%', height: '16px', backgroundColor: '#ffffff' }} />;
  }

  const s = String(status ?? '').toLowerCase().trim();
  let src = SVG_DIAGONAL_ONLY;
  let alt = 'Present';

  if (s === 'absent' || s === 'x' || s === '1' || s === 'a') {
    src = SVG_ABSENT;
    alt = 'Absent (X)';
  } else if (s === 'tardy' || s === 'late' || s === '2' || s === 't') {
    src = SVG_TARDY;
    alt = 'Late';
  } else if (s === 'cutting' || s === 'cc' || s === '3' || s === 'c') {
    src = SVG_CUTTING;
    alt = 'Cutting Classes';
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
        style={{ width: '100%', height: '100%', display: 'block', objectFit: 'fill' }}
      />
    </div>
  );
};

const sanitizeSearchText = (raw: string): string =>
  String(raw || '')
    .replace(/[\u0000-\u001F\u007F<>]/g, '')
    .trim()
    .slice(0, 80);

export const SF2ReportTab: React.FC<SF2ReportTabProps> = ({
  sectionId,
  activeReportId = 'sf2',
  onSelectReport,
}) => {
  const { tokens, brand } = useTheme();
  const { school: globalSchool } = useSchool();

  const now = useMemo(() => new Date(), []);
  const yearOptions = useMemo(() => {
    const y = now.getFullYear();
    return [y - 1, y, y + 1];
  }, [now]);

  const cachedSectionsPayload = peekApiCache<any>(API_ROUTES.school.sections, { page_size: 250 });
  const initialSections: SectionOption[] = Array.isArray(cachedSectionsPayload)
    ? cachedSectionsPayload
    : cachedSectionsPayload?.results || [];

  const [sections, setSections] = useState<SectionOption[]>(initialSections);
  const [selectedSectionId, setSelectedSectionId] = useState<string>(
    sectionId ? String(sectionId) : initialSections[0] ? String(initialSections[0].id) : ''
  );
  const [selectedMonth, setSelectedMonth] = useState<string>(
    () => MONTH_NAMES[now.getMonth()] || 'October'
  );
  const [selectedYear, setSelectedYear] = useState<number>(now.getFullYear());
  const [searchQuery, setSearchQuery] = useState<string>('');

  const [reportData, setReportData] = useState<SF2ReportData | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [refreshing, setRefreshing] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  const reportRef = useRef<HTMLDivElement>(null);
  const abortRef = useRef<AbortController | null>(null);

  const cleanSearch = useMemo(() => sanitizeSearchText(searchQuery).toLowerCase(), [searchQuery]);

  const males = useMemo(() => {
    const list = Array.isArray(reportData?.males) ? reportData!.males : [];
    if (!cleanSearch) return list;
    return list.filter(
      (m) => m.name.toLowerCase().includes(cleanSearch) || m.lrn.toLowerCase().includes(cleanSearch)
    );
  }, [reportData, cleanSearch]);

  const females = useMemo(() => {
    const list = Array.isArray(reportData?.females) ? reportData!.females : [];
    if (!cleanSearch) return list;
    return list.filter(
      (f) => f.name.toLowerCase().includes(cleanSearch) || f.lrn.toLowerCase().includes(cleanSearch)
    );
  }, [reportData, cleanSearch]);

  const getBaseFilename = useCallback(() => {
    const secClean = (reportData?.section_name || 'Section').replace(/[^a-zA-Z0-9_-]/g, '_');
    return `DepEd_SF2_${secClean}_${reportData?.month || selectedMonth}_${selectedYear}`;
  }, [reportData?.section_name, reportData?.month, selectedMonth, selectedYear]);

  const buildCsvData = useCallback(() => {
    if (!reportData) return { headers: [] as string[], rows: [] as Array<Array<string | number>> };
    const schoolDaysList = Array.isArray(reportData.school_days) ? reportData.school_days : [];
    const dayHeaders = schoolDaysList.map((d) => `${d.dateNumber} (${d.dayOfWeek})`);
    const headers = ['LRN', 'Learner Name', 'Sex', ...dayHeaders, 'Total Absent', 'Total Tardy', 'Remarks'];

    const rows = [...males, ...females].map((st) => [
      st.lrn,
      st.name,
      st.sex,
      ...schoolDaysList.map((d) => st.attendance?.[d.dateNumber] || ''),
      st.total_absent || 0,
      st.total_tardy || 0,
      st.remarks || '',
    ]);
    return { headers, rows };
  }, [reportData, males, females]);

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
    formCode: 'SF2',
    reportData,
    reportRef,
    schoolId: reportData?.school_id || globalSchool.school_id,
    sectionId: selectedSectionId,
    getBaseFilename,
    buildCsvData,
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

  const fetchSF2 = useCallback(
    async (silent = false, bypassCache = false) => {
      if (!selectedSectionId) return;

      abortRef.current?.abort();
      const controller = new AbortController();
      abortRef.current = controller;

      const endpoint = `${API_ROUTES.reports.sf2}${encodeURIComponent(selectedSectionId)}/`;
      const baseParams = { month: selectedMonth, year: selectedYear };
      const warmHit = !bypassCache ? peekApiCache<SF2ReportData>(endpoint, baseParams) : undefined;

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
        const res = await apiClient.get<SF2ReportData>(endpoint, {
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
          setError(extractApiError(err, 'Could not generate DepEd SF2 Daily Attendance Report.'));
        }
      } finally {
        if (!controller.signal.aborted) {
          setLoading(false);
          setRefreshing(false);
        }
      }
    },
    [selectedSectionId, selectedMonth, selectedYear, globalSchool.school_id, stampView]
  );

  useEffect(() => {
    void fetchSF2(false, false);
    return () => {
      abortRef.current?.abort();
    };
  }, [fetchSF2]);

  const dailyAttendanceTotals = useMemo(() => {
    const maxCols = 25;
    const malesCount: number[] = new Array(maxCols).fill(0);
    const femalesCount: number[] = new Array(maxCols).fill(0);
    const combinedCount: number[] = new Array(maxCols).fill(0);

    if (!reportData?.school_days) {
      return { males: malesCount, females: femalesCount, combined: combinedCount };
    }

    reportData.school_days.forEach((day, idx) => {
      if (idx >= maxCols) return;
      let mPresent = 0;
      let fPresent = 0;

      males.forEach((m) => {
        const st = String(m.attendance?.[day.dateNumber] ?? '').toLowerCase().trim();
        if (PRESENT_STATUSES.has(st)) mPresent++;
      });

      females.forEach((f) => {
        const st = String(f.attendance?.[day.dateNumber] ?? '').toLowerCase().trim();
        if (PRESENT_STATUSES.has(st)) fPresent++;
      });

      malesCount[idx] = mPresent;
      femalesCount[idx] = fPresent;
      combinedCount[idx] = mPresent + fPresent;
    });

    return { males: malesCount, females: femalesCount, combined: combinedCount };
  }, [reportData, males, females]);

  const fitsOnSinglePage = useMemo(() => {
    if (pageConfig.layoutMode === 'pageless') return true;
    const printableHeight =
      pageHeightInches - (pageConfig.margins.top || 0.25) - (pageConfig.margins.bottom || 0.25);
    const totalRows = males.length + females.length;
    return 5.4 + totalRows * 0.17 <= printableHeight;
  }, [pageConfig, males.length, females.length, pageHeightInches]);

  const schoolDays = Array.isArray(reportData?.school_days) ? reportData!.school_days : [];
  const isListEmpty = males.length === 0 && females.length === 0;
  const schoolHead = reportData?.school_head || globalSchool.principal_name || '';

  const renderTableHeader = () => (
    <thead>
      <tr>
        <th rowSpan={2} style={{ width: '2.0%', ...thCell }}>#</th>
        <th rowSpan={2} style={{ width: '16.5%', ...thCell }}>
          LEARNER&apos;S NAME<br />
          <span style={{ fontSize: '4.4pt', fontWeight: 400, fontStyle: 'italic' }}>
            (Last Name, First Name, Middle Name)
          </span>
        </th>
        <th colSpan={25} style={{ width: '61.25%', ...thCell, fontSize: '4.9pt' }}>
          (1st row for date, 2nd row for Day: M, T, W, TH, F)
        </th>
        <th colSpan={2} style={{ width: '5.5%', ...thCell }}>Total for the<br />Month</th>
        <th rowSpan={2} style={{ width: '14.75%', ...thCell, fontSize: '4.6pt', lineHeight: 1.12 }}>
          REMARK/S (If DROPPED OUT, state reason; if TRANSFERRED IN/OUT, write name of School)
        </th>
      </tr>
      <tr>
        {Array.from({ length: 25 }).map((_, i) => {
          const day = schoolDays[i];
          return (
            <th key={`day-col-${i}`} style={{ width: '2.45%', ...thDateCell }}>
              <div>{day ? day.dateNumber : ''}</div>
              <div style={{ fontWeight: 800, fontSize: '4.2pt' }}>{day ? day.dayOfWeek : ''}</div>
            </th>
          );
        })}
        <th style={{ width: '2.75%', ...thCell, fontSize: '4.5pt' }}>ABSENT</th>
        <th style={{ width: '2.75%', ...thCell, fontSize: '4.5pt' }}>TARDY</th>
      </tr>
    </thead>
  );

  const renderSummaryFooter = () => {
    const m = reportData?.metrics;
    return (
      <div style={{ marginTop: 8, width: '100%' }}>
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: '38% 34% 26%',
            gap: '1%',
            alignItems: 'start',
            fontSize: '5.5pt',
            lineHeight: 1.18,
          }}
        >
          <div style={{ border: '1px solid #000', padding: '4px 6px' }}>
            <div style={{ fontWeight: 800, marginBottom: 2 }}>GUIDELINES:</div>
            <div>1. The attendance shall be accomplished daily. Refer to the codes for checking learners&apos; attendance.</div>
            <div>2. Dates shall be written in the columns beside Learner&apos;s Name.</div>
            <div>3. Compute the following at the end of the month:</div>
            <div style={{ paddingLeft: 6 }}>
              <strong>a. % of Enrolment = </strong> (Registered Learners end of month / Enrolment 1st Friday of June) x 100
            </div>
            <div style={{ paddingLeft: 6 }}>
              <strong>b. Average Daily Attendance = </strong> Total Daily Attendance / Number of School Days in month
            </div>
            <div style={{ paddingLeft: 6 }}>
              <strong>c. % of Attendance = </strong> (Average daily attendance / Registered Learners end of month) x 100
            </div>
            <div style={{ marginTop: 3 }}>
              <strong>CODES FOR CHECKING ATTENDANCE:</strong><br />
              <strong>blank</strong> - Present; <strong>(X)</strong> - Absent; <strong>Tardy</strong> (Upper shaded = Late Comer, Lower shaded = Cutting Classes)
            </div>
          </div>

          <table style={{ width: '100%', borderCollapse: 'collapse', border: '1px solid #000', fontSize: '5.4pt' }}>
            <thead>
              <tr style={{ backgroundColor: '#f1f5f9' }}>
                <th style={sumTh}>Month: {reportData?.month}</th>
                <th style={sumTh}>Days of Classes: {schoolDays.length}</th>
                <th colSpan={3} style={sumTh}>Summary</th>
              </tr>
              <tr style={{ backgroundColor: '#f8fafc' }}>
                <th colSpan={2} style={sumTh}>Indicator</th>
                <th style={{ ...sumTh, width: '13%' }}>M</th>
                <th style={{ ...sumTh, width: '13%' }}>F</th>
                <th style={{ ...sumTh, width: '15%' }}>TOTAL</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td colSpan={2} style={sumTd}>* Enrolment as of (1st Friday of June)</td>
                <td style={sumTdNum}>{m?.enrolment_june?.m ?? 0}</td>
                <td style={sumTdNum}>{m?.enrolment_june?.f ?? 0}</td>
                <td style={sumTdNum}>{m?.enrolment_june?.total ?? 0}</td>
              </tr>
              <tr>
                <td colSpan={2} style={sumTd}>Late Enrollment during the month</td>
                <td style={sumTdNum}>{m?.late_enrolment?.m ?? 0}</td>
                <td style={sumTdNum}>{m?.late_enrolment?.f ?? 0}</td>
                <td style={sumTdNum}>{m?.late_enrolment?.total ?? 0}</td>
              </tr>
              <tr style={{ fontWeight: 800 }}>
                <td colSpan={2} style={sumTd}>Registered Learners as of end of the month</td>
                <td style={sumTdNum}>{m?.registered_end?.m ?? 0}</td>
                <td style={sumTdNum}>{m?.registered_end?.f ?? 0}</td>
                <td style={sumTdNum}>{m?.registered_end?.total ?? 0}</td>
              </tr>
              <tr>
                <td colSpan={2} style={sumTd}>Percentage of Enrolment as of end of the month</td>
                <td style={sumTdNum}>{m?.percentage_enrolment?.m ?? 0}%</td>
                <td style={sumTdNum}>{m?.percentage_enrolment?.f ?? 0}%</td>
                <td style={sumTdNum}>{m?.percentage_enrolment?.total ?? 0}%</td>
              </tr>
              <tr>
                <td colSpan={2} style={sumTd}>Average Daily Attendance</td>
                <td style={sumTdNum}>{(m?.average_daily_attendance?.m ?? 0).toFixed(1)}</td>
                <td style={sumTdNum}>{(m?.average_daily_attendance?.f ?? 0).toFixed(1)}</td>
                <td style={sumTdNum}>{(m?.average_daily_attendance?.total ?? 0).toFixed(1)}</td>
              </tr>
              <tr style={{ fontWeight: 800 }}>
                <td colSpan={2} style={sumTd}>Percentage of Attendance for the month</td>
                <td style={sumTdNum}>{(m?.percentage_attendance?.m ?? 0).toFixed(1)}%</td>
                <td style={sumTdNum}>{(m?.percentage_attendance?.f ?? 0).toFixed(1)}%</td>
                <td style={sumTdNum}>{(m?.percentage_attendance?.total ?? 0).toFixed(1)}%</td>
              </tr>
              <tr>
                <td colSpan={2} style={sumTd}>Number of students absent for 5 consecutive days</td>
                <td style={sumTdNum}>{m?.consecutive_5_absent_count?.m ?? 0}</td>
                <td style={sumTdNum}>{m?.consecutive_5_absent_count?.f ?? 0}</td>
                <td style={sumTdNum}>{m?.consecutive_5_absent_count?.total ?? 0}</td>
              </tr>
              <tr>
                <td colSpan={2} style={sumTd}><strong>Dropped out</strong></td>
                <td style={sumTdNum}>{m?.drop_out?.m ?? 0}</td>
                <td style={sumTdNum}>{m?.drop_out?.f ?? 0}</td>
                <td style={sumTdNum}>{m?.drop_out?.total ?? 0}</td>
              </tr>
              <tr>
                <td colSpan={2} style={sumTd}><strong>Transferred out</strong></td>
                <td style={sumTdNum}>{m?.transferred_out?.m ?? 0}</td>
                <td style={sumTdNum}>{m?.transferred_out?.f ?? 0}</td>
                <td style={sumTdNum}>{m?.transferred_out?.total ?? 0}</td>
              </tr>
              <tr>
                <td colSpan={2} style={sumTd}><strong>Transferred in</strong></td>
                <td style={sumTdNum}>{m?.transferred_in?.m ?? 0}</td>
                <td style={sumTdNum}>{m?.transferred_in?.f ?? 0}</td>
                <td style={sumTdNum}>{m?.transferred_in?.total ?? 0}</td>
              </tr>
            </tbody>
          </table>

          <div style={{ display: 'flex', flexDirection: 'column', justifyContent: 'space-between', gap: 10 }}>
            <div style={{ fontStyle: 'italic', fontSize: '5.5pt' }}>
              I certify that this is a true and correct report:
            </div>
            <div>
              <div style={{ borderBottom: '1px solid #000', textAlign: 'center', fontWeight: 800, textTransform: 'uppercase', fontSize: '6.5pt', minHeight: 13 }}>
                {reportData?.adviser_name}
              </div>
              <div style={{ textAlign: 'center', fontSize: '5.2pt', marginTop: 1 }}>
                (Signature of Adviser over Printed Name)
              </div>
            </div>

            <div style={{ fontStyle: 'italic', fontSize: '5.5pt', marginTop: 4 }}>Attested by:</div>
            <div>
              <div style={{ borderBottom: '1px solid #000', textAlign: 'center', fontWeight: 800, textTransform: 'uppercase', fontSize: '6.5pt', minHeight: 13 }}>
                {schoolHead}
              </div>
              <div style={{ textAlign: 'center', fontSize: '5.2pt', marginTop: 1 }}>
                (Signature of School Head over Printed Name)
              </div>
            </div>
          </div>
        </div>

        <DepEdReportFooter
          sealUrl={globalSchool.school_logo}
          address={reportData?.school_address || globalSchool.address}
          contactNumber={reportData?.school_contact || globalSchool.contact_number}
          email={reportData?.school_email || globalSchool.email}
          reportData={reportData}
        />
      </div>
    );
  };

  const sheetBaseStyle: React.CSSProperties = {
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
    marginBottom: isPrinting ? 0 : '20px',
    boxShadow: isPrinting ? 'none' : '0 4px 20px rgba(0, 0, 0, 0.22)',
    border: isPrinting ? 'none' : '1px solid #cbd5e1',
    boxSizing: 'border-box',
    fontFamily: 'Arial, Helvetica, sans-serif',
    display: 'flex',
    flexDirection: 'column',
    justifyContent: 'space-between',
  };

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
              ? `SF2_Attendance_${reportData.section_name}_${reportData.month}_${reportData.year}`
              : 'DepEd_SF2_Daily_Attendance'
          }
          subtitle="Official DepEd School Form 2 (SF2) Daily Attendance Report"
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
        loadingMessage="Generating Official DepEd SF2 Daily Attendance..."
        error={error}
        hasData={Boolean(reportData)}
        isPrinting={isPrinting}
        isExportingPdf={isExportingPdf}
        pageWidthInches={pageWidthInches}
        pageHeightInches={pageHeightInches}
        pageConfig={pageConfig}
        sheetClassName="sf2-sheet-page"
        documentId="sf2-official-document"
        reportRef={reportRef}
        leftToolbarContent={
          <>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <BookOpen size={15} color={brand.primary} />
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
                placeholder="Search name or LRN..."
                style={{
                  border: 'none',
                  outline: 'none',
                  background: 'transparent',
                  color: tokens.textPrimary,
                  fontSize: '0.78rem',
                  width: 145,
                }}
              />
            </div>

            <button
              type="button"
              onClick={() => void fetchSF2(true, true)}
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
          (fitsOnSinglePage ? (
            <div className="sf2-sheet-page" data-print-page="true" style={{ ...sheetBaseStyle, marginBottom: 0 }}>
              <div>
                <DepEdReportHeader
                  formTitle="School Form 2 (SF 2) Daily Attendance Report of Learners"
                  formSubtitle="(This replaces Form 1, Form 2 & STS Form 4 - Absenteeism and Dropout Profile)"
                  formType="SF2"
                  reportData={reportData}
                />

                <table style={sf2Table}>
                  {renderTableHeader()}
                  <tbody>
                    {isListEmpty ? (
                      <tr>
                        <td colSpan={30} style={{ ...tdCenter, padding: '20px', fontStyle: 'italic' }}>
                          No learners enrolled in Section {reportData.section_name} for {reportData.month} {reportData.year}.
                        </td>
                      </tr>
                    ) : (
                      <>
                        <tr style={{ backgroundColor: '#f8fafc', fontWeight: 800 }}>
                          <td colSpan={30} style={{ ...tdLeft, paddingLeft: 6 }}>MALE</td>
                        </tr>
                        {males.map((m, idx) => (
                          <tr key={`m-${m.id}`}>
                            <td style={tdCenter}>{idx + 1}</td>
                            <td style={{ ...tdLeft, fontWeight: 700 }}>{m.name}</td>
                            {Array.from({ length: 25 }).map((_, i) => {
                              const day = schoolDays[i];
                              const st = day ? m.attendance?.[day.dateNumber] : undefined;
                              return (
                                <td key={`m-${m.id}-d-${i}`} style={tdDateCell}>
                                  <AttendanceCell status={st} isSchoolDay={Boolean(day)} />
                                </td>
                              );
                            })}
                            <td style={{ ...tdCenter, fontWeight: 700 }}>{m.total_absent || ''}</td>
                            <td style={{ ...tdCenter, fontWeight: 700 }}>{m.total_tardy || ''}</td>
                            <td style={tdLeft}>{m.remarks || ''}</td>
                          </tr>
                        ))}
                        <tr style={subtotalRowStyle}>
                          <td colSpan={2} style={{ ...tdLeft, fontWeight: 800 }}>&larr; MALE | TOTAL Per Day &rarr;</td>
                          {Array.from({ length: 25 }).map((_, i) => (
                            <td key={`m-tot-${i}`} style={{ ...tdCenter, fontWeight: 800 }}>
                              {schoolDays[i] ? dailyAttendanceTotals.males[i] : ''}
                            </td>
                          ))}
                          <td style={{ ...tdCenter, fontWeight: 800 }}>{males.reduce((a, c) => a + (c.total_absent || 0), 0)}</td>
                          <td style={{ ...tdCenter, fontWeight: 800 }}>{males.reduce((a, c) => a + (c.total_tardy || 0), 0)}</td>
                          <td style={tdCenter} />
                        </tr>

                        <tr style={{ backgroundColor: '#f8fafc', fontWeight: 800 }}>
                          <td colSpan={30} style={{ ...tdLeft, paddingLeft: 6 }}>FEMALE</td>
                        </tr>
                        {females.map((f, idx) => (
                          <tr key={`f-${f.id}`}>
                            <td style={tdCenter}>{idx + 1}</td>
                            <td style={{ ...tdLeft, fontWeight: 700 }}>{f.name}</td>
                            {Array.from({ length: 25 }).map((_, i) => {
                              const day = schoolDays[i];
                              const st = day ? f.attendance?.[day.dateNumber] : undefined;
                              return (
                                <td key={`f-${f.id}-d-${i}`} style={tdDateCell}>
                                  <AttendanceCell status={st} isSchoolDay={Boolean(day)} />
                                </td>
                              );
                            })}
                            <td style={{ ...tdCenter, fontWeight: 700 }}>{f.total_absent || ''}</td>
                            <td style={{ ...tdCenter, fontWeight: 700 }}>{f.total_tardy || ''}</td>
                            <td style={tdLeft}>{f.remarks || ''}</td>
                          </tr>
                        ))}
                        <tr style={subtotalRowStyle}>
                          <td colSpan={2} style={{ ...tdLeft, fontWeight: 800 }}>&larr; FEMALE | TOTAL Per Day &rarr;</td>
                          {Array.from({ length: 25 }).map((_, i) => (
                            <td key={`f-tot-${i}`} style={{ ...tdCenter, fontWeight: 800 }}>
                              {schoolDays[i] ? dailyAttendanceTotals.females[i] : ''}
                            </td>
                          ))}
                          <td style={{ ...tdCenter, fontWeight: 800 }}>{females.reduce((a, c) => a + (c.total_absent || 0), 0)}</td>
                          <td style={{ ...tdCenter, fontWeight: 800 }}>{females.reduce((a, c) => a + (c.total_tardy || 0), 0)}</td>
                          <td style={tdCenter} />
                        </tr>

                        <tr style={{ ...subtotalRowStyle, backgroundColor: '#e2e8f0' }}>
                          <td colSpan={2} style={{ ...tdLeft, fontWeight: 900 }}>Combined TOTAL PER DAY</td>
                          {Array.from({ length: 25 }).map((_, i) => (
                            <td key={`c-tot-${i}`} style={{ ...tdCenter, fontWeight: 900 }}>
                              {schoolDays[i] ? dailyAttendanceTotals.combined[i] : ''}
                            </td>
                          ))}
                          <td style={{ ...tdCenter, fontWeight: 900 }}>
                            {males.reduce((a, c) => a + (c.total_absent || 0), 0) +
                              females.reduce((a, c) => a + (c.total_absent || 0), 0)}
                          </td>
                          <td style={{ ...tdCenter, fontWeight: 900 }}>
                            {males.reduce((a, c) => a + (c.total_tardy || 0), 0) +
                              females.reduce((a, c) => a + (c.total_tardy || 0), 0)}
                          </td>
                          <td style={tdCenter} />
                        </tr>
                      </>
                    )}
                  </tbody>
                </table>

                {renderSummaryFooter()}
              </div>

              <div style={auditFooterStyle}>
                <span>School Form 2 (SF2) — Page 1 of 1</span>
                <span style={{ fontFamily: 'monospace', fontWeight: 700 }}>
                  PRINTED: {auditMeta.printedAt} &nbsp;|&nbsp; TRACKING ID: {auditMeta.trackingId}
                </span>
              </div>
            </div>
          ) : (
            <>
              <div className="sf2-sheet-page" style={sheetBaseStyle}>
                <div>
                  <DepEdReportHeader
                    formTitle="School Form 2 (SF 2) Daily Attendance Report of Learners"
                    formSubtitle="(This replaces Form 1, Form 2 & STS Form 4 - Absenteeism and Dropout Profile)"
                    formType="SF2"
                    reportData={reportData}
                  />
                  <table style={sf2Table}>
                    {renderTableHeader()}
                    <tbody>
                      <tr style={{ backgroundColor: '#f8fafc', fontWeight: 800 }}>
                        <td colSpan={30} style={{ ...tdLeft, paddingLeft: 6 }}>MALE</td>
                      </tr>
                      {males.map((m, idx) => (
                        <tr key={`m-p1-${m.id}`}>
                          <td style={tdCenter}>{idx + 1}</td>
                          <td style={{ ...tdLeft, fontWeight: 700 }}>{m.name}</td>
                          {Array.from({ length: 25 }).map((_, i) => {
                            const day = schoolDays[i];
                            const st = day ? m.attendance?.[day.dateNumber] : undefined;
                            return (
                              <td key={`mp1-${m.id}-d-${i}`} style={tdDateCell}>
                                <AttendanceCell status={st} isSchoolDay={Boolean(day)} />
                              </td>
                            );
                          })}
                          <td style={{ ...tdCenter, fontWeight: 700 }}>{m.total_absent || ''}</td>
                          <td style={{ ...tdCenter, fontWeight: 700 }}>{m.total_tardy || ''}</td>
                          <td style={tdLeft}>{m.remarks || ''}</td>
                        </tr>
                      ))}
                      <tr style={subtotalRowStyle}>
                        <td colSpan={2} style={{ ...tdLeft, fontWeight: 800 }}>&larr; MALE | TOTAL Per Day &rarr;</td>
                        {Array.from({ length: 25 }).map((_, i) => (
                          <td key={`mp1-tot-${i}`} style={{ ...tdCenter, fontWeight: 800 }}>
                            {schoolDays[i] ? dailyAttendanceTotals.males[i] : ''}
                          </td>
                        ))}
                        <td style={{ ...tdCenter, fontWeight: 800 }}>{males.reduce((a, c) => a + (c.total_absent || 0), 0)}</td>
                        <td style={{ ...tdCenter, fontWeight: 800 }}>{males.reduce((a, c) => a + (c.total_tardy || 0), 0)}</td>
                        <td style={tdCenter} />
                      </tr>
                    </tbody>
                  </table>
                </div>

                <div style={auditFooterStyle}>
                  <span>School Form 2 (SF2) — Page 1 of 2</span>
                  <span style={{ fontFamily: 'monospace', fontWeight: 700 }}>
                    PRINTED: {auditMeta.printedAt} &nbsp;|&nbsp; TRACKING ID: {auditMeta.trackingId}
                  </span>
                </div>
              </div>

              <div className="sf2-sheet-page" data-print-page="true" style={{ ...sheetBaseStyle, marginBottom: 0 }}>
                <div>
                  <table style={sf2Table}>
                    {renderTableHeader()}
                    <tbody>
                      <tr style={{ backgroundColor: '#f8fafc', fontWeight: 800 }}>
                        <td colSpan={30} style={{ ...tdLeft, paddingLeft: 6 }}>FEMALE</td>
                      </tr>
                      {females.map((f, idx) => (
                        <tr key={`f-p2-${f.id}`}>
                          <td style={tdCenter}>{idx + 1}</td>
                          <td style={{ ...tdLeft, fontWeight: 700 }}>{f.name}</td>
                          {Array.from({ length: 25 }).map((_, i) => {
                            const day = schoolDays[i];
                            const st = day ? f.attendance?.[day.dateNumber] : undefined;
                            return (
                              <td key={`fp2-${f.id}-d-${i}`} style={tdDateCell}>
                                <AttendanceCell status={st} isSchoolDay={Boolean(day)} />
                              </td>
                            );
                          })}
                          <td style={{ ...tdCenter, fontWeight: 700 }}>{f.total_absent || ''}</td>
                          <td style={{ ...tdCenter, fontWeight: 700 }}>{f.total_tardy || ''}</td>
                          <td style={tdLeft}>{f.remarks || ''}</td>
                        </tr>
                      ))}
                      <tr style={subtotalRowStyle}>
                        <td colSpan={2} style={{ ...tdLeft, fontWeight: 800 }}>&larr; FEMALE | TOTAL Per Day &rarr;</td>
                        {Array.from({ length: 25 }).map((_, i) => (
                          <td key={`fp2-tot-${i}`} style={{ ...tdCenter, fontWeight: 800 }}>
                            {schoolDays[i] ? dailyAttendanceTotals.females[i] : ''}
                          </td>
                        ))}
                        <td style={{ ...tdCenter, fontWeight: 800 }}>{females.reduce((a, c) => a + (c.total_absent || 0), 0)}</td>
                        <td style={{ ...tdCenter, fontWeight: 800 }}>{females.reduce((a, c) => a + (c.total_tardy || 0), 0)}</td>
                        <td style={tdCenter} />
                      </tr>

                      <tr style={{ ...subtotalRowStyle, backgroundColor: '#e2e8f0' }}>
                        <td colSpan={2} style={{ ...tdLeft, fontWeight: 900 }}>Combined TOTAL PER DAY</td>
                        {Array.from({ length: 25 }).map((_, i) => (
                          <td key={`cp2-tot-${i}`} style={{ ...tdCenter, fontWeight: 900 }}>
                            {schoolDays[i] ? dailyAttendanceTotals.combined[i] : ''}
                          </td>
                        ))}
                        <td style={{ ...tdCenter, fontWeight: 900 }}>
                          {males.reduce((a, c) => a + (c.total_absent || 0), 0) +
                            females.reduce((a, c) => a + (c.total_absent || 0), 0)}
                        </td>
                        <td style={{ ...tdCenter, fontWeight: 900 }}>
                          {males.reduce((a, c) => a + (c.total_tardy || 0), 0) +
                            females.reduce((a, c) => a + (c.total_tardy || 0), 0)}
                        </td>
                        <td style={tdCenter} />
                      </tr>
                    </tbody>
                  </table>

                  {renderSummaryFooter()}
                </div>

                <div style={auditFooterStyle}>
                  <span>School Form 2 (SF2) — Page 2 of 2</span>
                  <span style={{ fontFamily: 'monospace', fontWeight: 700 }}>
                    PRINTED: {auditMeta.printedAt} &nbsp;|&nbsp; TRACKING ID: {auditMeta.trackingId}
                  </span>
                </div>
              </div>
            </>
          ))}
      </ReportViewerShell>

      <PageSetupModal
        isOpen={isPageSetupOpen}
        currentConfig={pageConfig}
        onLiveChange={setPageConfig}
        onApply={(cfg) => setPageConfig(cfg)}
        onClose={() => setIsPageSetupOpen(false)}
        reportTitle="SF2 Daily Attendance"
      />
    </div>
  );
};

const sf2Table: React.CSSProperties = {
  width: '100%',
  tableLayout: 'fixed',
  borderCollapse: 'collapse',
  fontSize: '5.2pt',
  border: '1.2px solid #000000',
};

const thCell: React.CSSProperties = {
  border: '1px solid #000000',
  padding: '2px 1px',
  backgroundColor: '#f1f5f9',
  fontWeight: 800,
  textAlign: 'center',
  verticalAlign: 'middle',
  color: '#000000',
};

const thDateCell: React.CSSProperties = {
  border: '1px solid #000000',
  padding: '1px 0',
  backgroundColor: '#f1f5f9',
  fontWeight: 700,
  textAlign: 'center',
  verticalAlign: 'middle',
  fontSize: '4.8pt',
  lineHeight: 1.1,
};

const tdCenter: React.CSSProperties = {
  textAlign: 'center',
  border: '1px solid #000000',
  padding: '1px 1px',
  verticalAlign: 'middle',
};

const tdDateCell: React.CSSProperties = {
  textAlign: 'center',
  border: '1px solid #000000',
  padding: 0,
  verticalAlign: 'middle',
  height: '16px',
};

const tdLeft: React.CSSProperties = {
  textAlign: 'left',
  border: '1px solid #000000',
  padding: '1px 3px',
  verticalAlign: 'middle',
  whiteSpace: 'nowrap',
  overflow: 'hidden',
  textOverflow: 'ellipsis',
};

const subtotalRowStyle: React.CSSProperties = {
  backgroundColor: '#f1f5f9',
  height: '16px',
};

const sumTh: React.CSSProperties = {
  border: '1px solid #000000',
  padding: '2px 3px',
  fontWeight: 800,
  textAlign: 'center',
};

const sumTd: React.CSSProperties = {
  border: '1px solid #000000',
  padding: '1.5px 3px',
};

const sumTdNum: React.CSSProperties = {
  border: '1px solid #000000',
  padding: '1.5px 3px',
  textAlign: 'center',
  fontWeight: 700,
};

const auditFooterStyle: React.CSSProperties = {
  marginTop: 6,
  paddingTop: 3,
  borderTop: '0.8px dashed #000000',
  display: 'flex',
  justifyContent: 'space-between',
  alignItems: 'center',
  fontSize: '5.5pt',
  color: '#000000',
};

export default SF2ReportTab;