// AttendSure Web - Dtr Tab
// File: D:\AttendSure_V3\web\src\components\tabs\DTRTab.tsx

/**
 * AttendSure - Monthly Time Record (Civil Service Form No. 48)
 * File: web/src/components/tabs/DTRTab.tsx
 */

import React, { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import apiClient, { peekApiCache } from '../../api/client';
import { API_ROUTES, extractApiError } from '../../api/routes';
import { exportElementToLocalPdf, printHtmlWithPageSetup } from '../../utils/reportExporters';
import { Button } from '../ui/Button';
import { Modal } from '../ui/Modal';
import { ControlSwitch } from '../ui/ControlSwitch';
import { ProfileAvatar } from '../common/ProfileAvatar';
import { PageSetupModal } from '../common/PageSetupModal';
import {
  DEFAULT_PAGE_SETUP,
  PAPER_SIZES,
  type PageSetupConfig,
} from '../../types/pageSetup';
import { useAlert } from '../../context/AlertContext';
import { useSchool } from '../../context/SchoolContext';
import { useTheme } from '../../context/ThemeContext';
import {
  canResolveLoafing,
  canViewTeacherDirectory,
  getCurrentUserFromStorage,
  isAdminOrPrincipal,
} from '../../utils/permissions';
import {
  Printer,
  Download,
  RefreshCw,
  Calendar,
  Clock,
  AlertCircle,
  Loader2,
  ShieldCheck,
  ShieldAlert,
  Lock,
  CheckCircle2,
  AlertTriangle,
  Send,
  SlidersHorizontal,
} from 'lucide-react';

const DEFAULT_DTR_PAGE_SETUP: PageSetupConfig = {
  ...DEFAULT_PAGE_SETUP,
  layoutMode: 'pages',
  orientation: 'portrait',
  paperSize: 'folio',
  pageColor: '#ffffff',
  marginPreset: 'compact',
  margins: { top: 0.25, right: 0.25, bottom: 0.25, left: 0.25 },
  headerRepeat: 'first_page_only',
};

interface TeacherDropdownItem {
  id: number;
  employee_id: string;
  first_name: string;
  last_name: string;
  full_name: string;
  department?: string;
  position?: string;
  photo_url?: string | null;
}

const sanitizeInput = (raw: string, maxLength = 150): string =>
  String(raw || '')
    .replace(/[\u0000-\u001F\u007F<>]/g, '')
    .trim()
    .slice(0, maxLength);

interface DailyDTRRow {
  day: number;
  date_str: string;
  day_of_week: string;
  is_weekend: boolean;
  am_arrival: string;
  am_departure: string;
  pm_arrival: string;
  pm_departure: string;
  undertime_hours: number | string;
  undertime_minutes: number | string;
  is_loafing?: boolean;
  loafing_excused?: boolean;
  loafing_remarks?: string;
}

interface DTRReportData {
  teacher_id: number;
  teacher_name: string;
  employee_id: string;
  department?: string;
  month: string;
  month_number: number;
  year: number;
  regular_days_hours: string;
  saturdays_hours: string;
  school_head: string;
  school_head_title?: string;
  dtr_submitted?: boolean;
  dept_head_approved: boolean;
  can_approve_dept?: boolean;
  can_clear_loafing?: boolean;
  rows: DailyDTRRow[];
  daily_logs?: DailyDTRRow[];
  total_undertime_hours: number;
  total_undertime_minutes: number;
  days_present: number;
}

type FormSide = 'BOTH' | 'FRONT' | 'BACK';

const MONTH_NAMES = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];

export const DTRTab: React.FC = () => {
  const { showAlert, showConfirm } = useAlert();
  const { mode, tokens, brand, ui } = useTheme();
  const { school } = useSchool();
  const successBtnBg = mode === 'dark' ? '#059669' : brand.success;

  const currentUser = useMemo(() => getCurrentUserFromStorage(), []);
  const isTeacher = !canViewTeacherDirectory(currentUser);

  const nowDate = useMemo(() => new Date(), []);
  const yearOptions = useMemo(() => {
    const cur = nowDate.getFullYear();
    return [cur - 1, cur, cur + 1];
  }, [nowDate]);

  const [teacherList, setTeacherList] = useState<TeacherDropdownItem[]>(() => {
    if (isTeacher) return [];
    const cached = peekApiCache<TeacherDropdownItem[]>(API_ROUTES.accounts.teachersDropdown);
    return Array.isArray(cached) ? cached : [];
  });
  const [selectedTeacherId, setSelectedTeacherId] = useState<string>(() => {
    if (isTeacher) return '';
    const cached = peekApiCache<TeacherDropdownItem[]>(API_ROUTES.accounts.teachersDropdown);
    return Array.isArray(cached) && cached.length > 0 ? String(cached[0].id) : '';
  });
  const [selectedMonth, setSelectedMonth] = useState<number>(nowDate.getMonth() + 1);
  const [selectedYear, setSelectedYear] = useState<number>(nowDate.getFullYear());

  const [regularHours, setRegularHours] = useState<string>('');
  const [saturdayHours, setSaturdayHours] = useState<string>('');
  const [hoursDirty, setHoursDirty] = useState<boolean>(false);
  const [viewSide, setViewSide] = useState<FormSide>('BOTH');

  const [dtrData, setDtrData] = useState<DTRReportData | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [refreshing, setRefreshing] = useState<boolean>(false);
  const [actionProcessing, setActionProcessing] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [exportingPdf, setExportingPdf] = useState<boolean>(false);
  const [pageConfig, setPageConfig] = useState<PageSetupConfig>(DEFAULT_DTR_PAGE_SETUP);
  const [isPageSetupOpen, setIsPageSetupOpen] = useState<boolean>(false);

  const dtrPaperDims = useMemo(() => {
    const p = PAPER_SIZES[pageConfig.paperSize] || PAPER_SIZES.folio;
    return pageConfig.orientation === 'landscape'
      ? { widthIn: p.height, heightIn: p.width }
      : { widthIn: p.width, heightIn: p.height };
  }, [pageConfig.paperSize, pageConfig.orientation]);

  const [selectedAlertRow, setSelectedAlertRow] = useState<DailyDTRRow | null>(null);
  const [excuseRemarks, setExcuseRemarks] = useState<string>('');

  const printAreaRef = useRef<HTMLDivElement>(null);
  const abortRef = useRef<AbortController | null>(null);
  const isInteracting = useRef<boolean>(false);
  isInteracting.current = Boolean(selectedAlertRow) || actionProcessing || hoursDirty;

  const activeTeacher = useMemo(
    () => teacherList.find((t) => String(t.id) === selectedTeacherId),
    [teacherList, selectedTeacherId]
  );

  useEffect(() => {
    if (isTeacher) return;
    const controller = new AbortController();

    apiClient
      .get<TeacherDropdownItem[]>(API_ROUTES.accounts.teachersDropdown, {
        signal: controller.signal,
      })
      .then((res) => {
        if (controller.signal.aborted) return;
        const list = Array.isArray(res.data) ? res.data : [];
        setTeacherList(list);
        if (list.length > 0) {
          setSelectedTeacherId((prev) => prev || String(list[0].id));
        }
      })
      .catch((err: unknown) => {
        const anyErr = err as { name?: string; code?: string };
        if (controller.signal.aborted || anyErr?.name === 'CanceledError' || anyErr?.code === 'ERR_CANCELED') {
          return;
        }
        setError(extractApiError(err, 'Could not load teacher list.'));
      });

    return () => {
      controller.abort();
    };
  }, [isTeacher]);

  useEffect(() => {
    setHoursDirty(false);
  }, [selectedTeacherId, selectedMonth, selectedYear]);

  const normalizeDtrPayload = useCallback(
    (raw: any): DTRReportData => {
      const rawRows: any[] = Array.isArray(raw.rows)
        ? raw.rows
        : Array.isArray(raw.daily_logs)
          ? raw.daily_logs
          : [];

      const rowsByDay = new Map<number, any>();
      rawRows.forEach((r) => {
        if (r && typeof r.day === 'number') rowsByDay.set(r.day, r);
      });

      const rows31: DailyDTRRow[] = [];
      for (let dayNum = 1; dayNum <= 31; dayNum++) {
        const found = rowsByDay.get(dayNum);
        if (found) {
          rows31.push({
            day: dayNum,
            date_str: String(found.date_str || found.date || ''),
            day_of_week: String(found.day_of_week || found.weekday || ''),
            is_weekend: Boolean(found.is_weekend || found.status === 'WEEKEND'),
            am_arrival: String(found.am_arrival || ''),
            am_departure: String(found.am_departure || ''),
            pm_arrival: String(found.pm_arrival || ''),
            pm_departure: String(found.pm_departure || ''),
            undertime_hours: found.undertime_hours ?? '',
            undertime_minutes: found.undertime_minutes ?? '',
            is_loafing: Boolean(found.is_loafing),
            loafing_excused: Boolean(found.loafing_excused),
            loafing_remarks: String(found.loafing_remarks || ''),
          });
        } else {
          rows31.push({
            day: dayNum,
            date_str: '',
            day_of_week: '',
            is_weekend: false,
            am_arrival: '',
            am_departure: '',
            pm_arrival: '',
            pm_departure: '',
            undertime_hours: '',
            undertime_minutes: '',
            is_loafing: false,
            loafing_excused: false,
            loafing_remarks: '',
          });
        }
      }

      const resolvedMonthNum = Number(raw.month_number || selectedMonth);
      const resolvedMonthName =
        typeof raw.month === 'string' && isNaN(Number(raw.month))
          ? raw.month
          : MONTH_NAMES[resolvedMonthNum - 1] || 'Month';

      const regHrs = String(raw.regular_days_hours ?? raw.regular_hours ?? '');
      const satHrs = String(raw.saturdays_hours ?? raw.saturday_hours ?? '');

      if (!isInteracting.current) {
        setRegularHours(regHrs);
        setSaturdayHours(satHrs);
      }

      if (!isTeacher && raw.teacher_id && !selectedTeacherId) {
        setSelectedTeacherId(String(raw.teacher_id));
      }

      return {
        teacher_id: Number(raw.teacher_id || 0),
        teacher_name: String(raw.teacher_name || ''),
        employee_id: String(raw.employee_id || ''),
        department: String(raw.department || ''),
        month: resolvedMonthName,
        month_number: resolvedMonthNum,
        year: Number(raw.year || selectedYear),
        regular_days_hours: regHrs,
        saturdays_hours: satHrs,
        school_head: String(raw.school_head || raw.school?.school_head || ''),
        school_head_title: String(raw.school_head_title || raw.school?.principal_title || ''),
        dtr_submitted: Boolean(raw.dtr_submitted ?? raw.is_submitted),
        dept_head_approved: Boolean(raw.dept_head_approved ?? raw.is_dept_head_approved),
        can_approve_dept: Boolean(
          raw.can_approve_dept ?? canResolveLoafing(currentUser)
        ),
        can_clear_loafing: Boolean(
          raw.can_clear_loafing ?? isAdminOrPrincipal(currentUser)
        ),
        rows: rows31,
        total_undertime_hours: Number(raw.total_undertime_hours || 0),
        total_undertime_minutes: Number(raw.total_undertime_minutes || 0),
        days_present: Number(raw.days_present || 0),
      };
    },
    [selectedTeacherId, selectedMonth, selectedYear, currentUser, isTeacher]
  );

  const fetchDTR = useCallback(
    async (silent = false, bypassCache = false) => {
      if (!isTeacher && !selectedTeacherId && teacherList.length > 0) return;

      abortRef.current?.abort();
      const controller = new AbortController();
      abortRef.current = controller;

      const endpoint =
        !isTeacher && selectedTeacherId
          ? `${API_ROUTES.reports.dtr}${selectedTeacherId}/`
          : API_ROUTES.reports.dtr;

      const baseParams = { month: selectedMonth, year: selectedYear };
      const cached = !bypassCache ? peekApiCache<any>(endpoint, baseParams) : undefined;
      if (cached) {
        setDtrData(normalizeDtrPayload(cached));
        setLoading(false);
        if (silent) setRefreshing(true);
      } else if (!silent) {
        setLoading(true);
      } else {
        setRefreshing(true);
      }
      setError(null);

      try {
        const res = await apiClient.get<any>(endpoint, {
          params: {
            ...baseParams,
            ...(bypassCache ? { nocache: 1 } : {}),
          },
          signal: controller.signal,
        });

        if (controller.signal.aborted) return;
        setDtrData(normalizeDtrPayload(res.data || {}));
      } catch (err: unknown) {
        const anyErr = err as { name?: string; code?: string };
        if (controller.signal.aborted || anyErr?.name === 'CanceledError' || anyErr?.code === 'ERR_CANCELED') {
          return;
        }
        if (!silent) {
          setError(extractApiError(err, 'Could not load Daily Time Record.'));
        }
      } finally {
        if (!controller.signal.aborted) {
          setLoading(false);
          setRefreshing(false);
        }
      }
    },
    [isTeacher, selectedTeacherId, selectedMonth, selectedYear, teacherList.length, normalizeDtrPayload]
  );

  useEffect(() => {
    void fetchDTR(false, false);
    return () => {
      abortRef.current?.abort();
    };
  }, [fetchDTR]);

  useEffect(() => {
    const timer = setInterval(() => {
      if (!isInteracting.current && document.visibilityState === 'visible') {
        void fetchDTR(true, true);
      }
    }, 20000);
    return () => clearInterval(timer);
  }, [fetchDTR]);

  const handleSubmitDTR = () => {
    if (!dtrData) return;

    showConfirm({
      title: 'Certify & Submit DTR',
      message: `Certify and submit your Daily Time Record for ${dtrData.month} ${dtrData.year} to your Department Head for review?`,
      confirmLabel: 'Certify & Submit',
      isDestructive: false,
      onConfirm: async () => {
        setActionProcessing(true);
        try {
          await apiClient.post(`${API_ROUTES.reports.dtr}${dtrData.teacher_id}/`, {
            action: 'SUBMIT_DTR',
            teacher_id: dtrData.teacher_id,
            month: dtrData.month_number,
            year: dtrData.year,
            regular_days_hours: sanitizeInput(regularHours, 100),
            saturdays_hours: sanitizeInput(saturdayHours, 100),
          });
          setHoursDirty(false);
          showAlert({
            title: 'DTR Submitted',
            message: 'Your Daily Time Record was submitted for Department Head approval.',
            type: 'success',
          });
          void fetchDTR(true, true);
        } catch (err) {
          showAlert({
            title: 'Submission Failed',
            message: extractApiError(err, 'Could not submit DTR.'),
            type: 'error',
          });
        } finally {
          setActionProcessing(false);
        }
      },
    });
  };

  const handleApproveByDeptHead = () => {
    if (!dtrData) return;

    showConfirm({
      title: 'Approve Official DTR',
      message: `Approve the Daily Time Record for ${dtrData.teacher_name} (${dtrData.month} ${dtrData.year})? This removes the DRAFT watermark and unlocks printing.`,
      confirmLabel: 'Approve DTR',
      isDestructive: false,
      onConfirm: async () => {
        setActionProcessing(true);
        try {
          await apiClient.post(`${API_ROUTES.reports.dtr}${dtrData.teacher_id}/`, {
            action: 'APPROVE_DEPT_HEAD',
            teacher_id: dtrData.teacher_id,
            month: dtrData.month_number,
            year: dtrData.year,
            regular_days_hours: sanitizeInput(regularHours, 100),
            saturdays_hours: sanitizeInput(saturdayHours, 100),
          });
          setHoursDirty(false);
          showAlert({
            title: 'DTR Approved',
            message: `Official DTR for ${dtrData.teacher_name} is now unlocked for printing.`,
            type: 'success',
          });
          void fetchDTR(true, true);
        } catch (err) {
          showAlert({
            title: 'Approval Failed',
            message: extractApiError(err, 'Could not approve DTR.'),
            type: 'error',
          });
        } finally {
          setActionProcessing(false);
        }
      },
    });
  };

  const handleExcuseAlertByPrincipal = async () => {
    if (!dtrData || !selectedAlertRow) return;
    const cleanReason = sanitizeInput(excuseRemarks, 240);
    if (!cleanReason) {
      showAlert({
        title: 'Reason Required',
        message: 'Please enter official remarks explaining why this teacher loafing alert is excused.',
        type: 'warning',
      });
      return;
    }

    setActionProcessing(true);
    try {
      await apiClient.post(`${API_ROUTES.reports.dtr}${dtrData.teacher_id}/`, {
        action: 'EXCUSE_LOAFING',
        teacher_id: dtrData.teacher_id,
        date_str: selectedAlertRow.date_str,
        month: dtrData.month_number,
        year: dtrData.year,
        remarks: cleanReason,
      });
      showAlert({
        title: 'Alert Excused',
        message: `Teacher loafing alert on ${selectedAlertRow.date_str} has been marked as excused.`,
        type: 'success',
      });
      setSelectedAlertRow(null);
      setExcuseRemarks('');
      void fetchDTR(true, true);
    } catch (err) {
      showAlert({
        title: 'Action Denied',
        message: extractApiError(err, 'Only authorized leadership can excuse campus alerts.'),
        type: 'error',
      });
    } finally {
      setActionProcessing(false);
    }
  };

  const handleDownloadPdf = async () => {
    if (!printAreaRef.current || !dtrData) return;
    if (!dtrData.dept_head_approved) {
      showAlert({
        title: 'Approval Required',
        message: 'Department Head approval is required before exporting official PDF copies.',
        type: 'warning',
      });
      return;
    }

    setExportingPdf(true);
    try {
      const safeName = (dtrData.teacher_name || 'Teacher').replace(/[^a-zA-Z0-9]/g, '_');
      await exportElementToLocalPdf({
        element: printAreaRef.current,
        filename: `CSC_Form_48_${safeName}_${dtrData.month}_${dtrData.year}.pdf`,
        pageWidthInches: dtrPaperDims.widthIn,
        pageHeightInches: dtrPaperDims.heightIn,
        orientation: pageConfig.orientation,
        pageColor: pageConfig.pageColor,
        pageless: pageConfig.layoutMode === 'pageless',
        marginsInches: [0, 0, 0, 0],
      });
    } catch {
      window.print();
    } finally {
      setExportingPdf(false);
    }
  };

  const handlePrint = () => {
    if (!dtrData?.dept_head_approved) {
      showAlert({
        title: 'Printing Locked',
        message: 'Printing is locked until the Department Head approves this record.',
        type: 'warning',
      });
      return;
    }
    if (!printAreaRef.current) return;
    printHtmlWithPageSetup({
      title: `CSC Form 48 - ${dtrData.teacher_name || 'Teacher'} (${dtrData.month} ${dtrData.year})`,
      bodyHtml: printAreaRef.current.innerHTML,
      pageConfig,
      extraCss: `
        .csc-print-page {
          width: 100% !important;
          margin: 0 !important;
          padding: 0 !important;
          box-shadow: none !important;
          border: none !important;
          border-radius: 0 !important;
          page-break-inside: avoid !important;
          break-inside: avoid !important;
        }
      `,
    });
  };

  const resolvedSchoolHead = (dtrData?.school_head || school.principal_name || '').trim();
  const resolvedSchoolHeadTitle = (dtrData?.school_head_title || school.principal_title || '').trim();

  const renderDTRCopy = () => {
    if (!dtrData) return null;

    return (
      <div style={formCardContainer}>
        {!dtrData.dept_head_approved && (
          <div style={draftWatermarkStyle}>
            <div style={{ transform: 'rotate(-32deg)', display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
              <div style={draftWatermarkText}>DRAFT</div>
              <div style={draftWatermarkSub}>PENDING DEPT HEAD APPROVAL</div>
            </div>
          </div>
        )}

        <div style={{ textAlign: 'center', marginBottom: 2 }}>
          <div style={{ fontSize: '7.5pt', fontStyle: 'italic', fontFamily: "'Times New Roman', Times, serif" }}>
            Civil Service Form No. 48
          </div>
          <div style={{ fontSize: '11.5pt', fontWeight: 900, textTransform: 'uppercase', letterSpacing: '0.6px', marginTop: 1 }}>
            DAILY TIME RECORD
          </div>

          <div style={{ marginTop: 8, borderBottom: '1.2px solid #000', paddingBottom: 1, minHeight: 18 }}>
            <span style={{ fontSize: '9.2pt', fontWeight: 800, textTransform: 'uppercase' }}>
              {dtrData.teacher_name}
            </span>
          </div>
          <div style={{ fontSize: '6.5pt', fontStyle: 'italic', marginTop: 1 }}>(Name)</div>
        </div>

        <div style={{ fontSize: '6.8pt', marginBottom: 4, lineHeight: 1.25 }}>
          <div style={{ borderBottom: '0.8px solid #000', paddingBottom: 2 }}>
            <span>
              For the month of <u>&nbsp;<strong>{dtrData.month}</strong>&nbsp;</u>, {dtrData.year}
            </span>
          </div>

          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginTop: 3 }}>
            <div style={{ width: '46%', fontSize: '6.2pt', lineHeight: 1.15 }}>
              Official hours of arrival<br />
              and departure
            </div>
            <div style={{ width: '54%', fontSize: '6.2pt', lineHeight: 1.15 }}>
              <div>Regular Days: <u>{regularHours || '\u00A0\u00A0\u00A0\u00A0\u00A0\u00A0\u00A0\u00A0\u00A0\u00A0\u00A0\u00A0\u00A0\u00A0\u00A0\u00A0\u00A0\u00A0'}</u></div>
              <div style={{ marginTop: 1 }}>Saturdays: <u>{saturdayHours || '\u00A0\u00A0\u00A0\u00A0\u00A0\u00A0\u00A0\u00A0\u00A0\u00A0\u00A0\u00A0\u00A0\u00A0\u00A0\u00A0\u00A0\u00A0'}</u></div>
            </div>
          </div>
        </div>

        <table style={dtrTable}>
          <thead>
            <tr>
              <th rowSpan={2} style={{ width: '10%', ...dtrTh }}>Days</th>
              <th colSpan={2} style={dtrTh}>A. M.</th>
              <th colSpan={2} style={dtrTh}>P. M.</th>
              <th colSpan={2} style={dtrTh}>
                UNDER<br />TIME
              </th>
            </tr>
            <tr>
              <th style={{ width: '17.5%', ...dtrThSub }}>ARRIVAL</th>
              <th style={{ width: '17.5%', ...dtrThSub }}>DEPAR-<br />TURE</th>
              <th style={{ width: '17.5%', ...dtrThSub }}>ARRIVAL</th>
              <th style={{ width: '17.5%', ...dtrThSub }}>DEPAR-<br />TURE</th>
              <th style={{ width: '10%', ...dtrThSub }}>Hours</th>
              <th style={{ width: '10%', ...dtrThSub }}>Minutes</th>
            </tr>
          </thead>
          <tbody>
            {dtrData.rows.map((row) => {
              const hasOpenAlert = Boolean(row.is_loafing && !row.loafing_excused);

              return (
                <tr
                  key={row.day}
                  style={{
                    height: 14,
                    backgroundColor: hasOpenAlert ? '#fee2e2' : row.is_weekend ? '#fafafa' : '#ffffff',
                  }}
                >
                  <td style={{ ...dtrTdCenter, fontWeight: 700 }}>
                    {row.day}
                    {row.is_loafing && (
                      <span
                        onClick={() => dtrData.can_clear_loafing && setSelectedAlertRow(row)}
                        title={hasOpenAlert ? 'Teacher loafing alert. Click to review.' : 'Excused by Principal'}
                        style={{
                          marginLeft: 2,
                          fontSize: '5.2pt',
                          color: hasOpenAlert ? '#dc2626' : '#059669',
                          cursor: dtrData.can_clear_loafing ? 'pointer' : 'default',
                        }}
                      >
                        {hasOpenAlert ? '(!)' : '(✓)'}
                      </span>
                    )}
                  </td>
                  <td style={{ ...dtrTdCenter, color: hasOpenAlert ? '#dc2626' : '#000', fontWeight: hasOpenAlert ? 700 : 400 }}>
                    {row.am_arrival}
                  </td>
                  <td style={{ ...dtrTdCenter, color: hasOpenAlert ? '#dc2626' : '#000', fontWeight: hasOpenAlert ? 700 : 400 }}>
                    {row.am_departure}
                  </td>
                  <td style={{ ...dtrTdCenter, color: hasOpenAlert ? '#dc2626' : '#000', fontWeight: hasOpenAlert ? 700 : 400 }}>
                    {row.pm_arrival}
                  </td>
                  <td style={{ ...dtrTdCenter, color: hasOpenAlert ? '#dc2626' : '#000', fontWeight: hasOpenAlert ? 700 : 400 }}>
                    {row.pm_departure}
                  </td>
                  <td style={{ ...dtrTdCenter, color: hasOpenAlert ? '#dc2626' : '#000', fontWeight: hasOpenAlert ? 800 : 400 }}>
                    {row.undertime_hours}
                  </td>
                  <td style={{ ...dtrTdCenter, color: hasOpenAlert ? '#dc2626' : '#000', fontWeight: hasOpenAlert ? 800 : 400 }}>
                    {row.undertime_minutes}
                  </td>
                </tr>
              );
            })}

            <tr style={{ height: 16, borderTop: '1.2px solid #000', fontWeight: 800 }}>
              <td style={{ ...dtrTdCenter, fontWeight: 900 }}>TOTAL</td>
              <td colSpan={4} style={{ ...dtrTdCenter, fontSize: '5.6pt' }}>
                Days Present: <strong>{dtrData.days_present}</strong> &bull; Undertime:
              </td>
              <td style={dtrTdCenter}>{dtrData.total_undertime_hours || ''}</td>
              <td style={dtrTdCenter}>{dtrData.total_undertime_minutes || ''}</td>
            </tr>
          </tbody>
        </table>

        <div style={{ marginTop: 6, fontSize: '5.8pt', textAlign: 'justify', lineHeight: 1.25 }}>
          I CERTIFY on my honor that the above is a true and correct report of the hours of work performed, record of which was made daily at the time of arrival and departure from office.
        </div>

        <div style={{ marginTop: 16, textAlign: 'center' }}>
          <div style={{ borderBottom: '1px solid #000', width: '82%', margin: '0 auto' }} />
          <div style={{ fontSize: '5.6pt', fontStyle: 'italic', marginTop: 1 }}>
            (Signature of Teacher / Employee)
          </div>
        </div>

        <div style={{ marginTop: 10, textAlign: 'center' }}>
          <div style={{ borderBottom: '1px solid #000', width: '82%', margin: '0 auto', minHeight: 14 }}>
            <span style={{ fontSize: '7.5pt', fontWeight: 800, textTransform: 'uppercase' }}>
              {resolvedSchoolHead}
            </span>
          </div>
          <div style={{ fontSize: '6.4pt', fontWeight: 700, marginTop: 1 }}>
            {resolvedSchoolHeadTitle || 'In-Charge'}
          </div>
        </div>

        <div style={{ textAlign: 'center', marginTop: 4, fontSize: '5.6pt', fontStyle: 'italic' }}>
          (See Instructions on back)
        </div>
      </div>
    );
  };

  const renderInstructionsCopy = () => (
    <div style={formCardContainer}>
      <div style={{ textAlign: 'center', marginBottom: 8, borderBottom: '1px solid #000', paddingBottom: 4 }}>
        <div style={{ fontSize: '11pt', fontWeight: 900, letterSpacing: '0.8px' }}>INSTRUCTIONS</div>
      </div>

      <div style={{ fontSize: '6.0pt', textAlign: 'justify', lineHeight: 1.35, display: 'flex', flexDirection: 'column', gap: 6 }}>
        <p style={{ margin: 0 }}>
          Civil Service Form No. 48, after completion, should be filed in the records of the Bureau or Office which submits the monthly report on Civil Service Form No. 3 to the Bureau of Civil Service.
        </p>
        <p style={{ margin: 0 }}>
          In the space provided for the purpose on the other side will be indicated the office hours the employee is required to observe, as for example, &ldquo;Regular days, 8:00 to 12:00 and 1:00 to 4:00; Saturdays, 8:00 to 1:00.&rdquo;
        </p>
        <p style={{ margin: 0 }}>
          Attention is invited to paragraph 3, Civil Service Rule XV, Executive Order No. 5, series of 1909, which reads as follows:
        </p>
        <blockquote style={{ margin: '0 0 0 8px', borderLeft: '1.5px solid #000', paddingLeft: 6, fontStyle: 'italic' }}>
          &ldquo;Each chief of a Bureau or Office shall require a daily record of attendance of all the officers and employees under him entitled to leave of absence or vacation (including teachers) to be kept on the proper form and also a systematic office record showing for each day all absences from duty from any cause whatever. At the beginning of each month he shall report to the Commissioner on the proper form of all absences from any cause whatever, including the exact amount of undertime of each person for each day. Falsification of time records will render the offending officer or employee liable to summary removal from the service and criminal prosecution.&rdquo;
        </blockquote>
        <p style={{ margin: '4px 0 0 0', fontSize: '5.7pt' }}>
          <strong>(NOTE:</strong> A record made from memory at sometime subsequent to the occurrence of an event is not reliable. Non-observance of office hours deprives the employee of leave privileges although he may have rendered overtime service. Where service is rendered outside of the Office for the whole morning or afternoon, notation to that effect should be made clearly.)
        </p>
      </div>
    </div>
  );

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14, padding: 'clamp(12px, 2vw, 20px)' }}>
      <div
        style={{
          ...ui.card,
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          flexWrap: 'wrap',
          gap: 12,
          padding: '12px 16px',
        }}
      >
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10, alignItems: 'center' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <ProfileAvatar
              photoUrl={activeTeacher?.photo_url}
              name={activeTeacher?.full_name || dtrData?.teacher_name || 'Teacher'}
              size={36}
              iconSize={18}
            />

            {isTeacher ? (
              <div
                style={{
                  ...ui.subtleBox,
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: 6,
                  padding: '6px 12px',
                  fontSize: '0.82rem',
                  fontWeight: 700,
                  color: tokens.textPrimary,
                }}
                title="Locked to your personal time record"
              >
                <Lock size={13} color={tokens.textMuted} />
                <span>
                  {dtrData?.teacher_name || 'My Time Record'}
                  {dtrData?.employee_id ? ` (${dtrData.employee_id})` : ''}
                </span>
              </div>
            ) : (
              <select
                aria-label="Select teacher"
                value={selectedTeacherId}
                onChange={(e) => setSelectedTeacherId(e.target.value)}
                style={{ ...ui.input, width: 'auto', minWidth: 220, fontWeight: 700 }}
              >
                {teacherList.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.full_name} ({t.employee_id})
                  </option>
                ))}
              </select>
            )}
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <Calendar size={15} color={brand.primary} />
            <select
              aria-label="Select month"
              value={selectedMonth}
              onChange={(e) => setSelectedMonth(Number(e.target.value))}
              style={{ ...ui.input, width: 'auto', padding: '6px 10px' }}
            >
              {MONTH_NAMES.map((m, idx) => (
                <option key={m} value={idx + 1}>
                  {m}
                </option>
              ))}
            </select>
          </div>

          <select
            aria-label="Select year"
            value={selectedYear}
            onChange={(e) => setSelectedYear(Number(e.target.value))}
            style={{ ...ui.input, width: 'auto', padding: '6px 10px' }}
          >
            {yearOptions.map((y) => (
              <option key={y} value={y}>
                {y}
              </option>
            ))}
          </select>

          <ControlSwitch<FormSide>
            options={[
              { value: 'BOTH', label: 'Front & Back' },
              { value: 'FRONT', label: 'Front Only' },
              { value: 'BACK', label: 'Instructions' },
            ]}
            value={viewSide}
            onChange={setViewSide}
            size="sm"
            ariaLabel="Form Side View"
          />

          <Button
            variant="secondary"
            size="md"
            type="button"
            onClick={() => void fetchDTR(true, true)}
            disabled={loading || refreshing}
          >
            <RefreshCw size={14} className={refreshing ? 'animate-spin' : ''} />
            <span>Refresh</span>
          </Button>
        </div>

        <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
          {isTeacher && dtrData && !dtrData.dtr_submitted && !dtrData.dept_head_approved && (
            <Button
              variant="primary"
              size="md"
              type="button"
              onClick={handleSubmitDTR}
              disabled={actionProcessing}
            >
              {actionProcessing ? <Loader2 className="animate-spin" size={14} /> : <Send size={14} />}
              <span>Certify &amp; Submit</span>
            </Button>
          )}

          {dtrData?.can_approve_dept && !dtrData.dept_head_approved && (
            <Button
              variant="primary"
              size="md"
              type="button"
              onClick={handleApproveByDeptHead}
              disabled={actionProcessing}
              style={{ backgroundColor: successBtnBg, borderColor: successBtnBg }}
            >
              {actionProcessing ? <Loader2 className="animate-spin" size={14} /> : <CheckCircle2 size={14} />}
              <span>Approve DTR</span>
            </Button>
          )}

          <Button
            variant="secondary"
            size="md"
            type="button"
            onClick={() => setIsPageSetupOpen(true)}
            title="Configure paper size, orientation, margins, and paper color"
          >
            <SlidersHorizontal size={14} />
            <span>Page Setup</span>
          </Button>

          <Button
            variant="secondary"
            size="md"
            type="button"
            onClick={() => void handleDownloadPdf()}
            disabled={exportingPdf || !dtrData || !dtrData.dept_head_approved}
            title={!dtrData?.dept_head_approved ? 'Requires Department Head approval first' : 'Download PDF'}
          >
            {exportingPdf ? (
              <Loader2 className="animate-spin" size={14} />
            ) : !dtrData?.dept_head_approved ? (
              <Lock size={14} color={brand.danger} />
            ) : (
              <Download size={14} />
            )}
            <span>Export PDF</span>
          </Button>

          <Button
            variant="primary"
            size="md"
            type="button"
            onClick={handlePrint}
            disabled={!dtrData || !dtrData.dept_head_approved}
            title={!dtrData?.dept_head_approved ? 'Requires Department Head approval first' : 'Print Form 48'}
          >
            {!dtrData?.dept_head_approved ? <Lock size={14} /> : <Printer size={14} />}
            <span>Print DTR</span>
          </Button>
        </div>
      </div>

      {dtrData && (
        <div
          style={{
            ...ui.subtleBox,
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            flexWrap: 'wrap',
            gap: 10,
            backgroundColor: dtrData.dept_head_approved
              ? tokens.successLight
              : dtrData.dtr_submitted
              ? tokens.infoLight
              : tokens.warningLight,
            borderColor: dtrData.dept_head_approved
              ? brand.success
              : dtrData.dtr_submitted
              ? brand.secondary
              : brand.warning,
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            {dtrData.dept_head_approved ? (
              <ShieldCheck size={20} color={brand.success} />
            ) : (
              <ShieldAlert size={20} color={dtrData.dtr_submitted ? brand.secondary : brand.warning} />
            )}
            <div>
              <div
                style={{
                  fontSize: '0.82rem',
                  fontWeight: 800,
                  color: dtrData.dept_head_approved
                    ? brand.success
                    : dtrData.dtr_submitted
                    ? brand.secondary
                    : brand.warning,
                }}
              >
                {dtrData.dept_head_approved
                  ? 'APPROVED BY DEPARTMENT HEAD — READY TO PRINT'
                  : dtrData.dtr_submitted
                  ? 'SUBMITTED — WAITING FOR DEPARTMENT HEAD APPROVAL'
                  : 'DRAFT — REVIEW WORKING HOURS AND SUBMIT TO DEPARTMENT HEAD'}
              </div>
              <div style={{ fontSize: '0.72rem', color: tokens.textSecondary, marginTop: 2 }}>
                {dtrData.dept_head_approved
                  ? 'Watermark removed. Print two copies and sign above your name.'
                  : 'Official PDF export and printing unlock once approved by your Department Head.'}
              </div>
            </div>
          </div>

          <div style={{ fontSize: '0.76rem', fontWeight: 800, color: tokens.textPrimary }}>
            Days Logged: <span style={{ color: brand.primary }}>{dtrData.days_present}</span>
          </div>
        </div>
      )}

      <div
        style={{
          ...ui.subtleBox,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          flexWrap: 'wrap',
          gap: 12,
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: '0.78rem' }}>
          <Clock size={15} color={brand.primary} />
          <span style={{ fontWeight: 700, color: tokens.textPrimary }}>Official Working Hours:</span>
        </div>

        <div style={{ display: 'flex', gap: 14, flexWrap: 'wrap', alignItems: 'center' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: '0.76rem' }}>
            <span style={{ color: tokens.textSecondary, fontWeight: 600 }}>Regular Days:</span>
            <input
              type="text"
              maxLength={100}
              disabled={Boolean(dtrData?.dept_head_approved && isTeacher)}
              value={regularHours}
              placeholder="e.g. 7:30 AM - 12:00 NN, 1:00 - 4:30 PM"
              onChange={(e) => {
                setHoursDirty(true);
                setRegularHours(e.target.value);
              }}
              style={{ ...ui.input, width: 250, padding: '5px 10px', fontSize: '0.76rem' }}
            />
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: '0.76rem' }}>
            <span style={{ color: tokens.textSecondary, fontWeight: 600 }}>Saturdays:</span>
            <input
              type="text"
              maxLength={100}
              disabled={Boolean(dtrData?.dept_head_approved && isTeacher)}
              value={saturdayHours}
              placeholder="e.g. As Required / None"
              onChange={(e) => {
                setHoursDirty(true);
                setSaturdayHours(e.target.value);
              }}
              style={{ ...ui.input, width: 190, padding: '5px 10px', fontSize: '0.76rem' }}
            />
          </div>
        </div>
      </div>

      {error && (
        <div
          style={{
            ...ui.subtleBox,
            backgroundColor: tokens.dangerLight,
            borderColor: brand.danger,
            color: brand.danger,
            display: 'flex',
            alignItems: 'center',
            gap: 8,
            fontWeight: 600,
          }}
        >
          <AlertCircle size={17} />
          <span>{error}</span>
        </div>
      )}

      <div style={{ ...ui.subtleBox, overflowX: 'auto', padding: 16 }}>
        {loading ? (
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: 320, gap: 10 }}>
            <Loader2 className="animate-spin" size={26} color={brand.primary} />
            <span style={{ fontSize: '0.86rem', fontWeight: 600, color: tokens.textMuted }}>
              Loading Daily Time Record from database...
            </span>
          </div>
        ) : dtrData ? (
          <div ref={printAreaRef} style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
            {(viewSide === 'BOTH' || viewSide === 'FRONT') && (
              <div
                id="csc-form-48-front"
                className="csc-print-page"
                data-print-page="true"
                style={{
                  ...printableSheetContainer,
                  width: `${dtrPaperDims.widthIn}in`,
                  backgroundColor: pageConfig.pageColor || '#ffffff',
                  paddingTop: `${pageConfig.margins.top}in`,
                  paddingRight: `${pageConfig.margins.right}in`,
                  paddingBottom: `${pageConfig.margins.bottom}in`,
                  paddingLeft: `${pageConfig.margins.left}in`,
                }}
              >
                {renderDTRCopy()}
                <div style={perforationLine} />
                {renderDTRCopy()}
              </div>
            )}

            {(viewSide === 'BOTH' || viewSide === 'BACK') && (
              <div
                id="csc-form-48-back"
                className="csc-print-page"
                data-print-page="true"
                style={{
                  ...printableSheetContainer,
                  width: `${dtrPaperDims.widthIn}in`,
                  backgroundColor: pageConfig.pageColor || '#ffffff',
                  paddingTop: `${pageConfig.margins.top}in`,
                  paddingRight: `${pageConfig.margins.right}in`,
                  paddingBottom: `${pageConfig.margins.bottom}in`,
                  paddingLeft: `${pageConfig.margins.left}in`,
                }}
              >
                {renderInstructionsCopy()}
                <div style={perforationLine} />
                {renderInstructionsCopy()}
              </div>
            )}
          </div>
        ) : null}
      </div>

      {selectedAlertRow && (
        <Modal
          isOpen={Boolean(selectedAlertRow)}
          onClose={() => setSelectedAlertRow(null)}
          title="Principal Review: Teacher Loafing Alert"
        >
          <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            <div
              style={{
                ...ui.subtleBox,
                backgroundColor: tokens.dangerLight,
                borderColor: brand.danger,
                color: brand.danger,
                display: 'flex',
                alignItems: 'center',
                gap: 10,
              }}
            >
              <AlertTriangle size={22} color={brand.danger} style={{ flexShrink: 0 }} />
              <div style={{ fontSize: '0.78rem', lineHeight: 1.4 }}>
                An unexcused teacher loafing alert was recorded for <strong>{dtrData?.teacher_name}</strong> on{' '}
                <strong>{selectedAlertRow.date_str}</strong>.
              </div>
            </div>

            <div style={{ fontSize: '0.80rem', color: tokens.textPrimary }}>
              <strong>Loafing Alert Note:</strong> {selectedAlertRow.loafing_remarks || 'No note recorded'}
            </div>

            <div>
              <label style={ui.label}>Official Reason to Excuse Alert *</label>
              <input
                type="text"
                maxLength={240}
                value={excuseRemarks}
                onChange={(e) => setExcuseRemarks(e.target.value)}
                style={ui.input}
                placeholder="e.g. Authorized division seminar / official school errand"
              />
            </div>

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, marginTop: 8 }}>
              <Button variant="secondary" size="md" type="button" onClick={() => setSelectedAlertRow(null)}>
                Keep Alert Unexcused
              </Button>
              <Button
                variant="primary"
                size="md"
                type="button"
                onClick={() => void handleExcuseAlertByPrincipal()}
                disabled={actionProcessing}
                style={{ backgroundColor: successBtnBg, borderColor: successBtnBg }}
              >
                {actionProcessing ? <Loader2 className="animate-spin" size={14} /> : <CheckCircle2 size={14} />}
                <span>Excuse Alert</span>
              </Button>
            </div>
          </div>
        </Modal>
      )}

      <PageSetupModal
        isOpen={isPageSetupOpen}
        onClose={() => setIsPageSetupOpen(false)}
        currentConfig={pageConfig}
        onLiveChange={setPageConfig}
        onApply={(cfg) => setPageConfig(cfg)}
        reportTitle="CSC Form 48 (Daily Time Record)"
      />
    </div>
  );
};

const printableSheetContainer: React.CSSProperties = {
  display: 'grid',
  gridTemplateColumns: '1fr auto 1fr',
  gap: 20,
  backgroundColor: '#ffffff',
  width: '8.5in',
  margin: '0 auto',
  padding: '0.35in',
  borderRadius: 4,
  boxShadow: '0 4px 18px rgba(0,0,0,0.20)',
  boxSizing: 'border-box',
};

const perforationLine: React.CSSProperties = {
  width: 1,
  borderLeftWidth: 1,
  borderLeftStyle: 'dashed',
  borderLeftColor: '#94a3b8',
  margin: '0 2px',
};

const formCardContainer: React.CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  justifyContent: 'space-between',
  fontFamily: "'Times New Roman', Times, serif",
  color: '#000000',
  boxSizing: 'border-box',
  position: 'relative',
  overflow: 'hidden',
};

const draftWatermarkStyle: React.CSSProperties = {
  position: 'absolute',
  top: '50%',
  left: '50%',
  transform: 'translate(-50%, -50%)',
  pointerEvents: 'none',
  userSelect: 'none',
  zIndex: 30,
  width: '100%',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
};

const draftWatermarkText: React.CSSProperties = {
  fontSize: '50pt',
  fontWeight: 900,
  fontFamily: "'Arial Black', Impact, sans-serif",
  color: 'rgba(239, 68, 68, 0.20)',
  borderWidth: 5,
  borderStyle: 'dashed',
  borderColor: 'rgba(239, 68, 68, 0.26)',
  padding: '4px 26px',
  borderRadius: 10,
  letterSpacing: '8px',
  lineHeight: 1,
  textAlign: 'center',
};

const draftWatermarkSub: React.CSSProperties = {
  fontSize: '7.5pt',
  fontWeight: 800,
  fontFamily: 'Arial, sans-serif',
  color: 'rgba(239, 68, 68, 0.30)',
  letterSpacing: '1.5px',
  marginTop: 6,
  textAlign: 'center',
};

const dtrTable: React.CSSProperties = {
  width: '100%',
  borderCollapse: 'collapse',
  border: '1.2px solid #000000',
  fontSize: '6.2pt',
  tableLayout: 'fixed',
};

const dtrTh: React.CSSProperties = {
  border: '1px solid #000000',
  textAlign: 'center',
  verticalAlign: 'middle',
  fontWeight: 800,
  padding: '2px 1px',
  lineHeight: 1.1,
};

const dtrThSub: React.CSSProperties = {
  border: '1px solid #000000',
  textAlign: 'center',
  verticalAlign: 'middle',
  fontWeight: 700,
  fontSize: '5.2pt',
  padding: '1px 0',
  lineHeight: 1.05,
};

const dtrTdCenter: React.CSSProperties = {
  border: '1px solid #000000',
  textAlign: 'center',
  verticalAlign: 'middle',
  padding: '1px 0',
  fontSize: '5.6pt',
  whiteSpace: 'nowrap',
};

export default DTRTab;
