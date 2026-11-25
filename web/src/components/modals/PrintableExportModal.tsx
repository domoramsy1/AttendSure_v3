// AttendSure Web - Printable Export Modal
// File: D:\AttendSure_V3\web\src\components\modals\PrintableExportModal.tsx

/**
 * AttendSure - Printable & Downloadable Schedules, Class Lists, QR ID Cards & Directory Modal
 * File: web/src/components/modals/PrintableExportModal.tsx
 *
 * Supports Print, PDF (.pdf), Excel (.xls), Word (.doc), and CSV (.csv) exports
 * with All vs Selected Only filtering, DepEd headers/signatures, and AuditLog recording.
 */

import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import apiClient from '../../api/client';
import { API_ROUTES, extractApiError } from '../../api/routes';
import { useTheme } from '../../context/ThemeContext';
import { useAlert } from '../../context/AlertContext';
import { isSafeImageUrl, QR_COLORS } from '../../theme/tokens';
import { Modal } from '../ui/Modal';
import { Button } from '../ui/Button';
import { QrCodeSvg } from '../common/QrCodeSvg';
import { PageSetupModal } from '../common/PageSetupModal';
import {
  DEFAULT_PAGE_SETUP,
  PAPER_SIZES,
  type PageSetupConfig,
} from '../../types/pageSetup';
import {
  buildAuditStamp,
  logOfficialReportAudit,
  exportElementToLocalPdf,
  exportElementToExcel,
  exportElementToWord,
  printHtmlWithPageSetup,
  triggerBlobDownload,
} from '../../utils/reportExporters';
import {
  Printer,
  Download,
  FileSpreadsheet,
  FileText,
  RefreshCw,
  Loader2,
  AlertCircle,
  CheckSquare,
  Square,
  ShieldCheck,
  SlidersHorizontal,
} from 'lucide-react';

const DEFAULT_PRINT_PACK_PAGE_SETUP: PageSetupConfig = {
  ...DEFAULT_PAGE_SETUP,
  layoutMode: 'pages',
  orientation: 'portrait',
  paperSize: 'a4',
  pageColor: QR_COLORS.background,
  marginPreset: 'compact',
  margins: { top: 0.35, right: 0.35, bottom: 0.35, left: 0.35 },
  headerRepeat: 'first_page_only',
};

export type PrintPackType =
  | 'CLASS_SCHEDULE'
  | 'CLASS_LIST'
  | 'QR_ID_CARDS'
  | 'TEACHER_DIRECTORY'
  | 'COMPLETE_TEACHER_PACKET';

export type PrintPackScope = 'ALL' | 'SELECTED';

export interface SelectableOption {
  id: number;
  label: string;
  sublabel?: string;
}

export interface PrintableExportModalProps {
  isOpen: boolean;
  onClose: () => void;
  title?: string;
  defaultPackType: PrintPackType;
  allowedPackTypes: PrintPackType[];
  initialScope?: PrintPackScope;
  preselectedSectionIds?: number[];
  preselectedPeriodIds?: number[];
  preselectedTeacherIds?: number[];
  preselectedStudentIds?: number[];
  sectionOptions?: SelectableOption[];
  teacherOptions?: SelectableOption[];
  isSchoolLeader?: boolean;
}

interface SchoolMeta {
  school_id?: string;
  school_name?: string;
  region?: string;
  division?: string;
  district?: string;
  school_year?: string;
  principal_name?: string;
  principal_title?: string;
  school_head?: string;
  left_logo?: string | null;
  right_logo?: string | null;
  school_logo?: string | null;
}

interface PeriodRow {
  id: number;
  schedule_code: string;
  section_id: number;
  section_label: string;
  subject_code: string;
  subject_title: string;
  teacher_name: string;
  employee_id: string;
  day_label: string;
  time_range: string;
  room_name: string;
  weekly_hours: number;
  school_year: string;
}

interface TeacherScheduleBlock {
  teacher_id: number;
  teacher_name: string;
  employee_id: string;
  position: string;
  department: string;
  advisory_sections: string[];
  total_weekly_hours: number;
  periods: PeriodRow[];
}

interface ClassListStudentRow {
  row_number: number;
  student_id: number;
  lrn: string;
  full_name: string;
  sex: string;
  birth_date: string;
  guardian_name: string;
  guardian_contact: string;
  qr_status: string;
  today_status: string;
}

interface ClassListBlock {
  section_id: number;
  grade_level: string;
  section_name: string;
  section_label: string;
  school_year: string;
  room_name: string;
  adviser_name: string;
  male_count: number;
  female_count: number;
  total_count: number;
  males: ClassListStudentRow[];
  females: ClassListStudentRow[];
  students: ClassListStudentRow[];
}

interface QrCardItem {
  student_id: number;
  lrn: string;
  full_name: string;
  sex: string;
  grade_section: string;
  adviser_name: string;
  school_name: string;
  school_year: string;
  qr_status: string;
  qr_payload: string;
  photo_url?: string | null;
}

interface TeacherDirectoryRow {
  teacher_id: number;
  employee_id: string;
  full_name: string;
  role: string;
  position: string;
  department: string;
  teaching_status: string;
  advisory_label: string;
  scheduled_periods_count: number;
  weekly_hours: number;
  contact_number: string;
  email: string;
  phone_status: string;
}

interface CompletePacketBlock extends TeacherScheduleBlock {
  class_lists: ClassListBlock[];
}

interface PrintPackPayload {
  pack_type: PrintPackType;
  scope: PrintPackScope;
  generated_at: string;
  generated_by: string;
  school: SchoolMeta;
  summary?: Record<string, number>;
  periods?: PeriodRow[];
  teacher_schedules?: TeacherScheduleBlock[];
  class_lists?: ClassListBlock[];
  cards?: QrCardItem[];
  teachers?: TeacherDirectoryRow[];
  packets?: CompletePacketBlock[];
}

const PACK_LABELS: Record<PrintPackType, string> = {
  CLASS_SCHEDULE: 'Class Schedule',
  CLASS_LIST: 'Class List',
  QR_ID_CARDS: 'Student QR ID Cards',
  TEACHER_DIRECTORY: 'Teacher Directory',
  COMPLETE_TEACHER_PACKET: 'Complete Teaching Packet',
};

const EMPTY_IDS: number[] = [];
const EMPTY_OPTIONS: SelectableOption[] = [];

export const PrintableExportModal: React.FC<PrintableExportModalProps> = ({
  isOpen,
  onClose,
  title = 'Download & Print Official Sheets',
  defaultPackType,
  allowedPackTypes,
  initialScope = 'ALL',
  preselectedSectionIds = EMPTY_IDS,
  preselectedPeriodIds = EMPTY_IDS,
  preselectedTeacherIds = EMPTY_IDS,
  preselectedStudentIds = EMPTY_IDS,
  sectionOptions = EMPTY_OPTIONS,
  teacherOptions = EMPTY_OPTIONS,
  isSchoolLeader = false,
}) => {
  const { tokens, brand, fonts, radius, ui } = useTheme();
  const { showAlert } = useAlert();

  const [packType, setPackType] = useState<PrintPackType>(defaultPackType);
  const [scope, setScope] = useState<PrintPackScope>(initialScope);
  const [pickedSectionIds, setPickedSectionIds] = useState<number[]>(() => [...preselectedSectionIds]);
  const [pickedTeacherIds, setPickedTeacherIds] = useState<number[]>(() => [...preselectedTeacherIds]);
  const [pickedPeriodIds, setPickedPeriodIds] = useState<number[]>(() => [...preselectedPeriodIds]);
  const [pickedStudentIds, setPickedStudentIds] = useState<number[]>(() => [...preselectedStudentIds]);
  const [syncedOpen, setSyncedOpen] = useState<boolean>(false);
  const [refreshTick, setRefreshTick] = useState<number>(0);

  const [payload, setPayload] = useState<PrintPackPayload | null>(null);
  const [loading, setLoading] = useState(false);
  const [exporting, setExporting] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pageConfig, setPageConfig] = useState<PageSetupConfig>(DEFAULT_PRINT_PACK_PAGE_SETUP);
  const [isPageSetupOpen, setIsPageSetupOpen] = useState(false);

  const paperDims = useMemo(() => {
    const p = PAPER_SIZES[pageConfig.paperSize] || PAPER_SIZES.a4;
    return pageConfig.orientation === 'landscape'
      ? { widthIn: p.height, heightIn: p.width }
      : { widthIn: p.width, heightIn: p.height };
  }, [pageConfig.paperSize, pageConfig.orientation]);

  const sheetPageStyle = useMemo<React.CSSProperties>(
    () => ({
      width: '100%',
      maxWidth: `${paperDims.widthIn}in`,
      margin: '0 auto 18px',
      paddingTop: `${pageConfig.margins.top}in`,
      paddingRight: `${pageConfig.margins.right}in`,
      paddingBottom: `${pageConfig.margins.bottom}in`,
      paddingLeft: `${pageConfig.margins.left}in`,
      backgroundColor: pageConfig.pageColor || QR_COLORS.background,
      color: QR_COLORS.foreground,
      boxSizing: 'border-box',
      borderWidth: 1,
      borderStyle: 'solid',
      borderColor: tokens.borderSubtle,
      borderRadius: 6,
    }),
    [paperDims.widthIn, pageConfig.margins, pageConfig.pageColor, tokens.borderSubtle]
  );

  const sheetRef = useRef<HTMLDivElement | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const wasOpenRef = useRef<boolean>(false);

  // Sync incoming selection props ONLY when transitioning from closed -> open
  // (Prevents infinite re-fetch loops and avoids firing a stale preview request before props sync)
  useEffect(() => {
    if (isOpen && !wasOpenRef.current) {
      setPackType(defaultPackType);
      setScope(initialScope);
      setPickedSectionIds([...preselectedSectionIds]);
      setPickedTeacherIds([...preselectedTeacherIds]);
      setPickedPeriodIds([...preselectedPeriodIds]);
      setPickedStudentIds([...preselectedStudentIds]);
      setError(null);
      setSyncedOpen(true);
    } else if (!isOpen && wasOpenRef.current) {
      abortRef.current?.abort();
      setSyncedOpen(false);
    }
    wasOpenRef.current = isOpen;
  }, [
    isOpen,
    defaultPackType,
    initialScope,
    preselectedSectionIds,
    preselectedTeacherIds,
    preselectedPeriodIds,
    preselectedStudentIds,
  ]);

  const hasAnySelection = useMemo(() => {
    if (packType === 'TEACHER_DIRECTORY') {
      return pickedTeacherIds.length > 0;
    }
    return (
      pickedSectionIds.length > 0 ||
      pickedTeacherIds.length > 0 ||
      pickedPeriodIds.length > 0 ||
      pickedStudentIds.length > 0
    );
  }, [packType, pickedSectionIds, pickedTeacherIds, pickedPeriodIds, pickedStudentIds]);

  const buildRequestBody = useCallback(
    (exportFormat: 'json' | 'html' | 'csv', actionMode: 'PRINT' | 'EXPORT' = 'EXPORT') => {
      const body: Record<string, unknown> = {
        pack_type: packType,
        scope,
        export_format: exportFormat,
        action_mode: actionMode,
      };
      if (scope === 'SELECTED') {
        if (pickedSectionIds.length > 0 && packType !== 'TEACHER_DIRECTORY') {
          body.section_ids = pickedSectionIds;
        }
        if (pickedTeacherIds.length > 0 && isSchoolLeader) {
          body.teacher_ids = pickedTeacherIds;
        }
        if (
          pickedPeriodIds.length > 0 &&
          (packType === 'CLASS_SCHEDULE' || packType === 'COMPLETE_TEACHER_PACKET')
        ) {
          body.period_ids = pickedPeriodIds;
        }
        if (
          pickedStudentIds.length > 0 &&
          (packType === 'CLASS_LIST' ||
            packType === 'QR_ID_CARDS' ||
            packType === 'COMPLETE_TEACHER_PACKET')
        ) {
          body.student_ids = pickedStudentIds;
        }
      }
      return body;
    },
    [
      packType,
      scope,
      pickedSectionIds,
      pickedTeacherIds,
      pickedPeriodIds,
      pickedStudentIds,
      isSchoolLeader,
    ]
  );

  // Primitive serialized key guarantees preview fetches ONLY when query parameters genuinely change
  const previewRequestKey = useMemo(
    () => JSON.stringify(buildRequestBody('json', 'EXPORT')),
    [buildRequestBody]
  );

  useEffect(() => {
    if (!isOpen || !syncedOpen) return;
    if (scope === 'SELECTED' && !hasAnySelection) {
      abortRef.current?.abort();
      setPayload(null);
      setError(null);
      setLoading(false);
      return;
    }

    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    let cancelled = false;
    setLoading(true);
    setError(null);

    const requestBody = JSON.parse(previewRequestKey) as Record<string, unknown>;
    apiClient
      .post<PrintPackPayload>(API_ROUTES.reports.printPack, requestBody, {
        signal: controller.signal,
      })
      .then((res) => {
        if (!cancelled) {
          setPayload(res.data);
        }
      })
      .catch((err: unknown) => {
        const maybeCancel = err as { code?: string; name?: string };
        if (
          cancelled ||
          maybeCancel?.code === 'ERR_CANCELED' ||
          maybeCancel?.name === 'CanceledError'
        ) {
          return;
        }
        setPayload(null);
        setError(extractApiError(err, 'Could not load the printable sheet right now.'));
      })
      .finally(() => {
        if (!cancelled && abortRef.current === controller) {
          setLoading(false);
        }
      });

    return () => {
      cancelled = true;
      controller.abort();
    };
  }, [isOpen, syncedOpen, scope, hasAnySelection, previewRequestKey, refreshTick]);

  const handleRefreshPreview = () => {
    setRefreshTick((prev) => prev + 1);
  };

  const toggleId = (list: number[], id: number, setter: React.Dispatch<React.SetStateAction<number[]>>) => {
    setter(list.includes(id) ? list.filter((item) => item !== id) : [...list, id]);
  };

  const baseFilename = useMemo(() => {
    const stamp = new Date().toISOString().slice(0, 10);
    return `AttendSure_${packType.toLowerCase()}_${scope.toLowerCase()}_${stamp}`;
  }, [packType, scope]);

  const handlePrint = async () => {
    if (!sheetRef.current || !payload) return;
    setExporting('PRINT');
    try {
      const audit = buildAuditStamp(packType, payload.school?.school_id);
      printHtmlWithPageSetup({
        title: PACK_LABELS[packType],
        bodyHtml: sheetRef.current.innerHTML,
        pageConfig,
        auditFooter: audit,
        extraCss: `
          body { font-size: 11px; }
          th, td { border: 1px solid ${tokens.borderStrong}; padding: 5px 6px; text-align: left; }
        `,
      });

      void logOfficialReportAudit({
        reportName: PACK_LABELS[packType],
        trackingId: audit.trackingId,
        printedAt: audit.printedAt,
        action: 'PRINT',
      });
    } catch (err) {
      showAlert({
        title: 'Print Failed',
        message: extractApiError(err, 'Could not open the print dialog.'),
        type: 'error',
      });
    } finally {
      setExporting(null);
    }
  };

  const handleExportPdf = async () => {
    if (!sheetRef.current || !payload) return;
    setExporting('PDF');
    try {
      const audit = buildAuditStamp(packType, payload.school?.school_id);
      await exportElementToLocalPdf({
        element: sheetRef.current,
        filename: baseFilename,
        pageWidthInches: paperDims.widthIn,
        pageHeightInches: paperDims.heightIn,
        orientation: pageConfig.orientation,
        pageColor: pageConfig.pageColor || QR_COLORS.background,
        pageless: pageConfig.layoutMode === 'pageless',
        marginsInches: [0, 0, 0, 0],
      });
      void logOfficialReportAudit({
        reportName: PACK_LABELS[packType],
        trackingId: audit.trackingId,
        printedAt: audit.printedAt,
        action: 'PDF',
      });
      showAlert({
        title: 'PDF Saved',
        message: `${PACK_LABELS[packType]} was saved as a PDF file.`,
        type: 'success',
      });
    } catch (err) {
      showAlert({
        title: 'PDF Export Failed',
        message: extractApiError(err, 'Could not generate the PDF file.'),
        type: 'error',
      });
    } finally {
      setExporting(null);
    }
  };

  const handleExportOffice = async (kind: 'EXCEL' | 'WORD') => {
    if (!sheetRef.current || !payload) return;
    setExporting(kind);
    try {
      const audit = buildAuditStamp(packType, payload.school?.school_id);
      if (kind === 'EXCEL') {
        await exportElementToExcel(sheetRef.current, baseFilename, audit);
      } else {
        await exportElementToWord(sheetRef.current, baseFilename, audit);
      }
      void logOfficialReportAudit({
        reportName: PACK_LABELS[packType],
        trackingId: audit.trackingId,
        printedAt: audit.printedAt,
        action: kind,
      });
      showAlert({
        title: kind === 'EXCEL' ? 'Excel File Downloaded' : 'Word Document Downloaded',
        message: `${PACK_LABELS[packType]} is ready in your downloads folder.`,
        type: 'success',
      });
    } catch (err) {
      showAlert({
        title: 'Download Failed',
        message: extractApiError(err, 'Could not create the download file.'),
        type: 'error',
      });
    } finally {
      setExporting(null);
    }
  };

  const handleExportCsv = async () => {
    if (!payload) return;
    setExporting('CSV');
    try {
      const audit = buildAuditStamp(packType, payload.school?.school_id);
      const res = await apiClient.post(
        API_ROUTES.reports.printPack,
        buildRequestBody('csv', 'EXPORT'),
        { responseType: 'blob' }
      );
      const blob = new Blob([res.data], { type: 'text/csv;charset=utf-8;' });
      triggerBlobDownload(blob, `${baseFilename}.csv`);
      void logOfficialReportAudit({
        reportName: PACK_LABELS[packType],
        trackingId: audit.trackingId,
        printedAt: audit.printedAt,
        action: 'CSV',
      });
      showAlert({
        title: 'CSV Downloaded',
        message: `${PACK_LABELS[packType]} CSV was saved safely.`,
        type: 'success',
      });
    } catch (err) {
      showAlert({
        title: 'CSV Export Failed',
        message: extractApiError(err, 'Could not download the CSV file.'),
        type: 'error',
      });
    } finally {
      setExporting(null);
    }
  };

  const paperCellStyle: React.CSSProperties = {
    borderWidth: 1,
    borderStyle: 'solid',
    borderColor: tokens.borderStrong,
    padding: '5px 7px',
    fontSize: '0.74rem',
    color: QR_COLORS.foreground,
    verticalAlign: 'top',
  };

  const paperThStyle: React.CSSProperties = {
    ...paperCellStyle,
    backgroundColor: tokens.primaryLight,
    fontWeight: 800,
    fontSize: '0.70rem',
    textTransform: 'uppercase',
  };

  const renderDepEdHeader = (docTitle: string, subtitle: string) => {
    const meta = payload?.school || {};
    const leftLogo = isSafeImageUrl(meta.left_logo) ? meta.left_logo : null;
    const rightLogo = isSafeImageUrl(meta.right_logo || meta.school_logo)
      ? meta.right_logo || meta.school_logo
      : null;

    return (
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: 12,
          borderBottomWidth: 2,
          borderBottomStyle: 'solid',
          borderBottomColor: brand.primary,
          paddingBottom: 10,
          marginBottom: 12,
        }}
      >
        <div style={{ width: 96, height: 54, flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'flex-start' }}>
          {leftLogo && (
            <img
              src={leftLogo}
              alt="Department Seal"
              style={{ maxWidth: '100%', maxHeight: '100%', width: 'auto', height: 'auto', display: 'block', objectFit: 'contain' }}
            />
          )}
        </div>
        <div style={{ flex: 1, textAlign: 'center' }}>
          <div style={{ fontSize: '0.68rem', textTransform: 'uppercase', letterSpacing: 0.4, color: QR_COLORS.foreground }}>
            Republic of the Philippines &bull; Department of Education
          </div>
          <div style={{ fontSize: '1.05rem', fontWeight: 900, color: QR_COLORS.foreground, marginTop: 2 }}>
            {meta.school_name || 'AttendSure School'}
          </div>
          <div style={{ fontSize: '0.70rem', color: QR_COLORS.foreground, marginTop: 2 }}>
            School ID: <strong>{meta.school_id || '—'}</strong> &bull; Region:{' '}
            <strong>{meta.region || '—'}</strong> &bull; Division: <strong>{meta.division || '—'}</strong> &bull;
            SY: <strong>{meta.school_year || '—'}</strong>
          </div>
          <div
            style={{
              fontSize: '0.92rem',
              fontWeight: 800,
              color: brand.primary,
              marginTop: 6,
              textTransform: 'uppercase',
            }}
          >
            {docTitle}
          </div>
          <div style={{ fontSize: '0.74rem', fontWeight: 600, color: QR_COLORS.foreground, marginTop: 2 }}>
            {subtitle}
          </div>
        </div>
        <div style={{ width: 96, height: 54, flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'flex-end' }}>
          {rightLogo && (
            <img
              src={rightLogo}
              alt="School Logo"
              style={{ maxWidth: '100%', maxHeight: '100%', width: 'auto', height: 'auto', display: 'block', objectFit: 'contain' }}
            />
          )}
        </div>
      </div>
    );
  };

  const renderSignatures = (preparedLabel: string, preparedName: string) => {
    const meta = payload?.school || {};
    const principalName = meta.principal_name || meta.school_head || 'School Principal';
    const principalTitle = meta.principal_title || 'School Principal';
    return (
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: '1fr 1fr',
          gap: 32,
          marginTop: 22,
          paddingTop: 6,
        }}
      >
        <div style={{ textAlign: 'center' }}>
          <div style={{ fontSize: '0.70rem', textAlign: 'left', marginBottom: 22, color: QR_COLORS.foreground }}>
            {preparedLabel}
          </div>
          <div
            style={{
              borderBottomWidth: 1,
              borderBottomStyle: 'solid',
              borderBottomColor: QR_COLORS.foreground,
              fontWeight: 800,
              fontSize: '0.78rem',
              paddingBottom: 2,
              color: QR_COLORS.foreground,
            }}
          >
            {preparedName}
          </div>
          <div style={{ fontSize: '0.68rem', marginTop: 3, color: QR_COLORS.foreground }}>
            Signature over Printed Name
          </div>
        </div>
        <div style={{ textAlign: 'center' }}>
          <div style={{ fontSize: '0.70rem', textAlign: 'left', marginBottom: 22, color: QR_COLORS.foreground }}>
            Approved By:
          </div>
          <div
            style={{
              borderBottomWidth: 1,
              borderBottomStyle: 'solid',
              borderBottomColor: QR_COLORS.foreground,
              fontWeight: 800,
              fontSize: '0.78rem',
              paddingBottom: 2,
              color: QR_COLORS.foreground,
            }}
          >
            {principalName}
          </div>
          <div style={{ fontSize: '0.68rem', marginTop: 3, color: QR_COLORS.foreground }}>
            {principalTitle}
          </div>
        </div>
      </div>
    );
  };

  const renderScheduleBlock = (ts: TeacherScheduleBlock, key: string, _addBreak: boolean) => (
    <div key={key} className="print-pack-page" data-print-page="true" style={sheetPageStyle}>
      {renderDepEdHeader(
        'Official Teacher Class Schedule',
        `${ts.teacher_name} (${ts.employee_id}) • ${ts.position} • ${ts.department}`
      )}
      <div
        style={{
          display: 'flex',
          flexWrap: 'wrap',
          gap: 16,
          padding: '6px 10px',
          marginBottom: 10,
          borderWidth: 1,
          borderStyle: 'solid',
          borderColor: tokens.borderStrong,
          borderRadius: 4,
          fontSize: '0.74rem',
          color: QR_COLORS.foreground,
        }}
      >
        <span>
          <strong>Advisory Class:</strong>{' '}
          {ts.advisory_sections.length > 0 ? ts.advisory_sections.join(', ') : 'None'}
        </span>
        <span>
          <strong>Weekly Teaching Hours:</strong> {ts.total_weekly_hours.toFixed(2)} hrs
        </span>
        <span>
          <strong>Assigned Classes:</strong> {ts.periods.length}
        </span>
      </div>
      <table style={{ width: '100%', borderCollapse: 'collapse' }}>
        <thead>
          <tr>
            <th style={paperThStyle}>Period Time</th>
            <th style={paperThStyle}>Days</th>
            <th style={paperThStyle}>Subject</th>
            <th style={paperThStyle}>Grade &amp; Section</th>
            <th style={paperThStyle}>Room</th>
            <th style={{ ...paperThStyle, textAlign: 'right' }}>Weekly Hrs</th>
          </tr>
        </thead>
        <tbody>
          {ts.periods.length === 0 ? (
            <tr>
              <td colSpan={6} style={{ ...paperCellStyle, textAlign: 'center', fontStyle: 'italic' }}>
                No active class periods assigned.
              </td>
            </tr>
          ) : (
            ts.periods.map((p) => (
              <tr key={p.id}>
                <td style={paperCellStyle}>{p.time_range}</td>
                <td style={paperCellStyle}>{p.day_label}</td>
                <td style={paperCellStyle}>
                  <strong>{p.subject_code}</strong> — {p.subject_title}
                </td>
                <td style={paperCellStyle}>{p.section_label}</td>
                <td style={paperCellStyle}>{p.room_name}</td>
                <td style={{ ...paperCellStyle, textAlign: 'right' }}>{p.weekly_hours.toFixed(2)}</td>
              </tr>
            ))
          )}
        </tbody>
      </table>
      {renderSignatures('Prepared By:', ts.teacher_name)}
    </div>
  );

  const renderClassListBlock = (cl: ClassListBlock, key: string, _addBreak: boolean) => (
    <div key={key} className="print-pack-page" data-print-page="true" style={sheetPageStyle}>
      {renderDepEdHeader(
        'Official Section Class List',
        `${cl.section_label} • Room: ${cl.room_name} • Class Adviser: ${cl.adviser_name}`
      )}
      <div
        style={{
          display: 'flex',
          flexWrap: 'wrap',
          gap: 16,
          padding: '6px 10px',
          marginBottom: 10,
          borderWidth: 1,
          borderStyle: 'solid',
          borderColor: tokens.borderStrong,
          borderRadius: 4,
          fontSize: '0.74rem',
          color: QR_COLORS.foreground,
        }}
      >
        <span>
          <strong>Male:</strong> {cl.male_count}
        </span>
        <span>
          <strong>Female:</strong> {cl.female_count}
        </span>
        <span>
          <strong>Combined Total:</strong> {cl.total_count}
        </span>
        <span>
          <strong>School Year:</strong> {cl.school_year || payload?.school?.school_year || '—'}
        </span>
      </div>
      <table style={{ width: '100%', borderCollapse: 'collapse' }}>
        <thead>
          <tr>
            <th style={{ ...paperThStyle, width: 32, textAlign: 'right' }}>#</th>
            <th style={paperThStyle}>12-Digit LRN</th>
            <th style={paperThStyle}>Student Name</th>
            <th style={paperThStyle}>Sex</th>
            <th style={paperThStyle}>Birth Date</th>
            <th style={paperThStyle}>Guardian &amp; Contact</th>
            <th style={paperThStyle}>QR Status</th>
            <th style={paperThStyle}>Today</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td colSpan={8} style={{ ...paperThStyle, textTransform: 'none' }}>
              Male Students ({cl.male_count})
            </td>
          </tr>
          {cl.males.map((st) => (
            <tr key={`m-${st.student_id}`}>
              <td style={{ ...paperCellStyle, textAlign: 'right' }}>{st.row_number}</td>
              <td style={{ ...paperCellStyle, fontFamily: fonts.mono }}>{st.lrn}</td>
              <td style={{ ...paperCellStyle, fontWeight: 700 }}>{st.full_name}</td>
              <td style={paperCellStyle}>{st.sex}</td>
              <td style={paperCellStyle}>{st.birth_date || '—'}</td>
              <td style={paperCellStyle}>
                {[st.guardian_name, st.guardian_contact].filter(Boolean).join(' / ') || '—'}
              </td>
              <td style={paperCellStyle}>{st.qr_status}</td>
              <td style={paperCellStyle}>{st.today_status}</td>
            </tr>
          ))}
          <tr>
            <td colSpan={8} style={{ ...paperThStyle, textTransform: 'none' }}>
              Female Students ({cl.female_count})
            </td>
          </tr>
          {cl.females.map((st) => (
            <tr key={`f-${st.student_id}`}>
              <td style={{ ...paperCellStyle, textAlign: 'right' }}>{st.row_number}</td>
              <td style={{ ...paperCellStyle, fontFamily: fonts.mono }}>{st.lrn}</td>
              <td style={{ ...paperCellStyle, fontWeight: 700 }}>{st.full_name}</td>
              <td style={paperCellStyle}>{st.sex}</td>
              <td style={paperCellStyle}>{st.birth_date || '—'}</td>
              <td style={paperCellStyle}>
                {[st.guardian_name, st.guardian_contact].filter(Boolean).join(' / ') || '—'}
              </td>
              <td style={paperCellStyle}>{st.qr_status}</td>
              <td style={paperCellStyle}>{st.today_status}</td>
            </tr>
          ))}
        </tbody>
      </table>
      {renderSignatures('Class Adviser:', cl.adviser_name)}
    </div>
  );

  const renderPreviewBody = () => {
    if (!payload) return null;

    if (payload.pack_type === 'CLASS_SCHEDULE') {
      const blocks = payload.teacher_schedules || [];
      if (blocks.length === 0) {
        return <div style={{ textAlign: 'center', padding: 28 }}>No active class schedules matched your filter.</div>;
      }
      return blocks.map((ts, idx) => renderScheduleBlock(ts, `ts-${ts.teacher_id}`, idx > 0));
    }

    if (payload.pack_type === 'CLASS_LIST') {
      const lists = payload.class_lists || [];
      if (lists.length === 0) {
        return <div style={{ textAlign: 'center', padding: 28 }}>No enrolled students matched your filter.</div>;
      }
      return lists.map((cl, idx) => renderClassListBlock(cl, `cl-${cl.section_id}`, idx > 0));
    }

    if (payload.pack_type === 'QR_ID_CARDS') {
      const cards = payload.cards || [];
      if (cards.length === 0) {
        return (
          <div className="print-pack-page" data-print-page="true" style={sheetPageStyle}>
            {renderDepEdHeader(
              'Printable Student QR ID Cards',
              'Total Cards: 0 • Cut along dashed lines • Signed classroom camera QR codes'
            )}
            <div style={{ textAlign: 'center', padding: 28 }}>No students matched your filter for QR ID cards.</div>
          </div>
        );
      }
      const perPage = pageConfig.layoutMode === 'pageless' ? cards.length : pageConfig.orientation === 'landscape' ? 8 : 6;
      const chunks: QrCardItem[][] = [];
      for (let i = 0; i < cards.length; i += perPage) {
        chunks.push(cards.slice(i, i + perPage));
      }
      return (
        <>
          {chunks.map((chunk, chunkIdx) => (
            <div key={`qr-page-${chunkIdx}`} className="print-pack-page" data-print-page="true" style={sheetPageStyle}>
              {renderDepEdHeader(
                'Printable Student QR ID Cards',
                `Total Cards: ${cards.length} • Page ${chunkIdx + 1} of ${chunks.length} • Cut along dashed lines`
              )}
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: 12 }}>
                {chunk.map((card) => (
                  <div
                    key={card.student_id}
                    className="qr-card-item"
                    style={{
                      borderWidth: 1.5,
                      borderStyle: 'dashed',
                      borderColor: tokens.borderStrong,
                      borderRadius: 10,
                      overflow: 'hidden',
                      backgroundColor: QR_COLORS.background,
                    }}
                  >
                    <div
                      style={{
                        backgroundColor: brand.buttonBg,
                        color: tokens.onPrimary,
                        padding: '8px 10px',
                        textAlign: 'center',
                      }}
                    >
                      <div
                        style={{
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: 4,
                          fontSize: '0.68rem',
                          fontWeight: 800,
                        }}
                      >
                        <ShieldCheck size={12} />
                        <span>OFFICIAL STUDENT QR ID</span>
                      </div>
                      <div style={{ fontSize: '0.64rem', opacity: 0.92, marginTop: 1 }}>{card.school_name}</div>
                    </div>

                    <div
                      style={{
                        padding: '10px 12px',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        gap: 10,
                      }}
                    >
                      <div style={{ textAlign: 'left', flex: 1, minWidth: 0 }}>
                        <div style={{ fontWeight: 800, fontSize: '0.84rem', color: QR_COLORS.foreground }}>
                          {card.full_name}
                        </div>
                        <div style={{ fontSize: '0.72rem', color: QR_COLORS.foreground, marginTop: 2 }}>
                          {card.grade_section}
                        </div>
                        <div
                          style={{
                            fontFamily: fonts.mono,
                            fontSize: '0.74rem',
                            fontWeight: 800,
                            color: brand.primary,
                            marginTop: 5,
                          }}
                        >
                          LRN: {card.lrn}
                        </div>
                        <div style={{ fontSize: '0.66rem', color: QR_COLORS.foreground, marginTop: 4 }}>
                          Adviser: {card.adviser_name}
                        </div>
                        <div style={{ fontSize: '0.64rem', color: QR_COLORS.foreground, marginTop: 1 }}>
                          SY {card.school_year || payload.school?.school_year || '—'}
                        </div>
                      </div>

                      <div
                        style={{
                          padding: 4,
                          borderWidth: 1,
                          borderStyle: 'solid',
                          borderColor: tokens.borderStrong,
                          borderRadius: 6,
                          backgroundColor: QR_COLORS.background,
                          flexShrink: 0,
                        }}
                      >
                        <QrCodeSvg value={card.qr_payload} size={92} label={`QR code for ${card.full_name}`} />
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </>
      );
    }

    if (payload.pack_type === 'TEACHER_DIRECTORY') {
      const teachers = payload.teachers || [];
      return (
        <div className="print-pack-page" data-print-page="true" style={sheetPageStyle}>
          {renderDepEdHeader(
            'School Teachers Directory',
            `Total Teachers: ${teachers.length} • Generated: ${payload.generated_at}`
          )}
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr>
                <th style={paperThStyle}>Employee ID</th>
                <th style={paperThStyle}>Full Name</th>
                <th style={paperThStyle}>Position</th>
                <th style={paperThStyle}>Department</th>
                <th style={paperThStyle}>Status</th>
                <th style={paperThStyle}>Advisory Class</th>
                <th style={{ ...paperThStyle, textAlign: 'right' }}>Classes</th>
                <th style={paperThStyle}>Contact</th>
                <th style={paperThStyle}>Phone Binding</th>
              </tr>
            </thead>
            <tbody>
              {teachers.length === 0 ? (
                <tr>
                  <td colSpan={9} style={{ ...paperCellStyle, textAlign: 'center', fontStyle: 'italic' }}>
                    No teachers matched your filter.
                  </td>
                </tr>
              ) : (
                teachers.map((t) => (
                  <tr key={t.teacher_id}>
                    <td style={{ ...paperCellStyle, fontFamily: fonts.mono }}>{t.employee_id}</td>
                    <td style={{ ...paperCellStyle, fontWeight: 700 }}>{t.full_name}</td>
                    <td style={paperCellStyle}>{t.position}</td>
                    <td style={paperCellStyle}>{t.department}</td>
                    <td style={paperCellStyle}>{t.teaching_status}</td>
                    <td style={paperCellStyle}>{t.advisory_label}</td>
                    <td style={{ ...paperCellStyle, textAlign: 'right' }}>
                      {t.scheduled_periods_count} ({t.weekly_hours.toFixed(1)}h)
                    </td>
                    <td style={paperCellStyle}>{t.contact_number || t.email || '—'}</td>
                    <td style={paperCellStyle}>{t.phone_status}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
          {renderSignatures('Prepared By:', payload.generated_by)}
        </div>
      );
    }

    // COMPLETE_TEACHER_PACKET
    const packets = payload.packets || [];
    if (packets.length === 0) {
      return <div style={{ textAlign: 'center', padding: 28 }}>No schedules or class lists matched your filter.</div>;
    }

    const elements: React.ReactNode[] = [];
    packets.forEach((pkt, pktIdx) => {
      elements.push(renderScheduleBlock(pkt, `pkt-sched-${pkt.teacher_id}`, pktIdx > 0));
      pkt.class_lists.forEach((cl) => {
        elements.push(renderClassListBlock(cl, `pkt-${pkt.teacher_id}-cl-${cl.section_id}`, true));
      });
    });
    return <>{elements}</>;
  };

  const showSectionPicker =
    scope === 'SELECTED' && sectionOptions.length > 0 && packType !== 'TEACHER_DIRECTORY';
  const showTeacherPicker =
    scope === 'SELECTED' &&
    isSchoolLeader &&
    teacherOptions.length > 0 &&
    (packType === 'TEACHER_DIRECTORY' ||
      packType === 'CLASS_SCHEDULE' ||
      packType === 'COMPLETE_TEACHER_PACKET');

  const selectedSummaryText = useMemo(() => {
    const parts: string[] = [];
    if (pickedStudentIds.length > 0) parts.push(`${pickedStudentIds.length} students`);
    if (pickedPeriodIds.length > 0) parts.push(`${pickedPeriodIds.length} periods`);
    if (pickedSectionIds.length > 0) parts.push(`${pickedSectionIds.length} sections`);
    if (pickedTeacherIds.length > 0) parts.push(`${pickedTeacherIds.length} teachers`);
    return parts.join(', ');
  }, [pickedStudentIds, pickedPeriodIds, pickedSectionIds, pickedTeacherIds]);

  return (
    <Modal isOpen={isOpen} onClose={onClose} title={title} maxWidth="1060px">
      <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
        {/* 1. Document Type & Scope Controls */}
        <div
          style={{
            ...ui.subtleBox,
            display: 'flex',
            flexDirection: 'column',
            gap: 10,
            padding: '12px 14px',
          }}
        >
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 10 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
              {allowedPackTypes.map((type) => {
                const active = packType === type;
                return (
                  <button
                    key={type}
                    type="button"
                    onClick={() => setPackType(type)}
                    style={{
                      padding: '6px 12px',
                      borderRadius: radius.pill,
                      borderWidth: 1,
                      borderStyle: 'solid',
                      borderColor: active ? brand.primary : tokens.borderStrong,
                      backgroundColor: active ? brand.buttonBg : tokens.bgSurface,
                      color: active ? tokens.onPrimary : tokens.textPrimary,
                      fontSize: fonts.size.xs,
                      fontWeight: 800,
                      cursor: 'pointer',
                    }}
                  >
                    {PACK_LABELS[type]}
                  </button>
                );
              })}
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <button
                type="button"
                onClick={() => setScope('ALL')}
                style={{
                  padding: '6px 12px',
                  borderRadius: radius.sm,
                  borderWidth: 1,
                  borderStyle: 'solid',
                  borderColor: scope === 'ALL' ? brand.primary : tokens.borderStrong,
                  backgroundColor: scope === 'ALL' ? tokens.primaryLight : tokens.bgSurface,
                  color: scope === 'ALL' ? brand.primary : tokens.textSecondary,
                  fontSize: fonts.size.xs,
                  fontWeight: 800,
                  cursor: 'pointer',
                }}
              >
                All Accessible
              </button>
              <button
                type="button"
                onClick={() => setScope('SELECTED')}
                style={{
                  padding: '6px 12px',
                  borderRadius: radius.sm,
                  borderWidth: 1,
                  borderStyle: 'solid',
                  borderColor: scope === 'SELECTED' ? brand.primary : tokens.borderStrong,
                  backgroundColor: scope === 'SELECTED' ? tokens.primaryLight : tokens.bgSurface,
                  color: scope === 'SELECTED' ? brand.primary : tokens.textSecondary,
                  fontSize: fonts.size.xs,
                  fontWeight: 800,
                  cursor: 'pointer',
                }}
              >
                Selected Only{selectedSummaryText ? ` (${selectedSummaryText})` : ''}
              </button>
            </div>
          </div>

          {showSectionPicker && (
            <div>
              <div style={{ fontSize: fonts.size.xs, fontWeight: 800, color: tokens.textSecondary, marginBottom: 6 }}>
                Select Class Sections ({pickedSectionIds.length} selected):
              </div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, maxHeight: 100, overflowY: 'auto' }}>
                {sectionOptions.map((sec) => {
                  const checked = pickedSectionIds.includes(sec.id);
                  return (
                    <button
                      key={sec.id}
                      type="button"
                      onClick={() => toggleId(pickedSectionIds, sec.id, setPickedSectionIds)}
                      style={{
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: 5,
                        padding: '4px 9px',
                        borderRadius: radius.sm,
                        borderWidth: 1,
                        borderStyle: 'solid',
                        borderColor: checked ? brand.primary : tokens.borderSubtle,
                        backgroundColor: checked ? tokens.primaryLight : tokens.bgSurface,
                        color: checked ? brand.primary : tokens.textSecondary,
                        fontSize: fonts.size.xs,
                        fontWeight: 700,
                        cursor: 'pointer',
                      }}
                    >
                      {checked ? <CheckSquare size={12} /> : <Square size={12} />}
                      <span>{sec.label}</span>
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {showTeacherPicker && (
            <div>
              <div style={{ fontSize: fonts.size.xs, fontWeight: 800, color: tokens.textSecondary, marginBottom: 6 }}>
                Select Teachers ({pickedTeacherIds.length} selected):
              </div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, maxHeight: 100, overflowY: 'auto' }}>
                {teacherOptions.map((t) => {
                  const checked = pickedTeacherIds.includes(t.id);
                  return (
                    <button
                      key={t.id}
                      type="button"
                      onClick={() => toggleId(pickedTeacherIds, t.id, setPickedTeacherIds)}
                      style={{
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: 5,
                        padding: '4px 9px',
                        borderRadius: radius.sm,
                        borderWidth: 1,
                        borderStyle: 'solid',
                        borderColor: checked ? brand.primary : tokens.borderSubtle,
                        backgroundColor: checked ? tokens.primaryLight : tokens.bgSurface,
                        color: checked ? brand.primary : tokens.textSecondary,
                        fontSize: fonts.size.xs,
                        fontWeight: 700,
                        cursor: 'pointer',
                      }}
                    >
                      {checked ? <CheckSquare size={12} /> : <Square size={12} />}
                      <span>{t.label}</span>
                    </button>
                  );
                })}
              </div>
            </div>
          )}
        </div>

        {/* 2. Export & Print Action Toolbar */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 8 }}>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <Button
              variant="secondary"
              size="sm"
              type="button"
              onClick={() => setIsPageSetupOpen(true)}
              icon={<SlidersHorizontal size={14} />}
            >
              Page Setup ({(PAPER_SIZES[pageConfig.paperSize]?.name || 'A4').split(' ')[0]} &bull;{' '}
              {pageConfig.orientation === 'landscape' ? 'Landscape' : 'Portrait'})
            </Button>
            <Button
              variant="primary"
              size="sm"
              type="button"
              disabled={!payload || loading || exporting !== null}
              loading={exporting === 'PRINT'}
              onClick={() => void handlePrint()}
              icon={<Printer size={14} />}
            >
              Print
            </Button>
            <Button
              variant="secondary"
              size="sm"
              type="button"
              disabled={!payload || loading || exporting !== null}
              loading={exporting === 'PDF'}
              onClick={() => void handleExportPdf()}
              icon={<FileText size={14} />}
            >
              Save PDF
            </Button>
            <Button
              variant="secondary"
              size="sm"
              type="button"
              disabled={!payload || loading || exporting !== null}
              loading={exporting === 'EXCEL'}
              onClick={() => void handleExportOffice('EXCEL')}
              icon={<FileSpreadsheet size={14} />}
            >
              Excel (.xls)
            </Button>
            <Button
              variant="secondary"
              size="sm"
              type="button"
              disabled={!payload || loading || exporting !== null}
              loading={exporting === 'WORD'}
              onClick={() => void handleExportOffice('WORD')}
              icon={<FileText size={14} />}
            >
              Word (.doc)
            </Button>
            <Button
              variant="secondary"
              size="sm"
              type="button"
              disabled={!payload || loading || exporting !== null}
              loading={exporting === 'CSV'}
              onClick={() => void handleExportCsv()}
              icon={<Download size={14} />}
            >
              CSV (.csv)
            </Button>
          </div>

          <Button
            variant="secondary"
            size="sm"
            type="button"
            disabled={loading}
            onClick={handleRefreshPreview}
            icon={<RefreshCw size={13} />}
          >
            Refresh Preview
          </Button>
        </div>

        {/* 3. Live Paper Preview */}
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
              fontWeight: 700,
              fontSize: fonts.size.sm,
            }}
          >
            <AlertCircle size={16} />
            <span>{error}</span>
          </div>
        )}

        {scope === 'SELECTED' && !hasAnySelection ? (
          <div
            style={{
              ...ui.subtleBox,
              padding: 28,
              textAlign: 'center',
              color: tokens.textSecondary,
              fontSize: fonts.size.sm,
            }}
          >
            Check at least one item in the table or pick sections/teachers above to preview{' '}
            <strong>Selected Only</strong>, or switch to <strong>All Accessible</strong>.
          </div>
        ) : loading ? (
          <div style={{ padding: 48, textAlign: 'center', color: tokens.textMuted }}>
            <Loader2
              size={26}
              className="animate-spin"
              color={brand.primary}
              style={{ margin: '0 auto 8px', display: 'block' }}
            />
            <span style={{ fontSize: fonts.size.sm, fontWeight: 700 }}>
              Preparing printable {PACK_LABELS[packType].toLowerCase()}...
            </span>
          </div>
        ) : (
          <div
            style={{
              maxHeight: '52vh',
              overflowY: 'auto',
              borderWidth: 1,
              borderStyle: 'solid',
              borderColor: tokens.borderStrong,
              borderRadius: radius.md,
              backgroundColor: QR_COLORS.background,
              color: QR_COLORS.foreground,
              padding: 18,
            }}
          >
            <div ref={sheetRef}>{renderPreviewBody()}</div>
          </div>
        )}
      </div>

      <PageSetupModal
        isOpen={isPageSetupOpen}
        onClose={() => setIsPageSetupOpen(false)}
        currentConfig={pageConfig}
        onLiveChange={setPageConfig}
        onApply={(cfg) => setPageConfig(cfg)}
        reportTitle={PACK_LABELS[packType]}
      />
    </Modal>
  );
};

export default PrintableExportModal;
