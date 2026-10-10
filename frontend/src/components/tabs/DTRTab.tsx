/**
 * AttendSure V3 - Faculty Daily Time Record (Civil Service Form No. 48)
 * File: frontend/src/components/tabs/DTRTab.tsx
 *
 * Exact implementation based on CSC Form No. 48 template:
 * - Front: Exact CSC Form 48 layout with 31 days, Undertimes, Certification, In-Charge, and "(See Instructions on back)"
 * - Back: Official CSC Form 48 instructions and legal citations
 * - Real-time database sync: Silent 3-second polling ensures fresh attendance logs without manual refresh
 * - Modern Alert modals: All confirmations handled through AlertContext
 * - Default avatar: Profile displays neutral <User /> icon when no photo is uploaded
 */

import React, { useState, useEffect, useCallback, useRef } from 'react';
import apiClient from '../../api/client';
import { Button } from '../ui/Button';
import { Modal } from '../ui/Modal';
import { useAlert } from '../../context/AlertContext';
import {
  Printer,
  Download,
  RefreshCw,
  User,
  Calendar,
  Clock,
  AlertCircle,
  Loader2,
  Layers,
  ShieldCheck,
  ShieldAlert,
  Lock,
  CheckCircle2,
  AlertTriangle,
} from 'lucide-react';

// ============================================================================
// TYPE DEFINITIONS
// ============================================================================

interface FacultyMember {
  id: number;
  employee_id: string;
  first_name: string;
  last_name: string;
  middle_name?: string;
  full_name?: string;
  department?: string;
  designation?: string;
  photo?: string | null;
}

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
  faculty_id: number;
  faculty_name: string;
  employee_id: string;
  department?: string;
  month: string;
  month_number: number;
  year: number;
  regular_days_hours: string;
  saturdays_hours: string;
  school_head: string;
  dept_head_approved: boolean;
  approved_by_dept_head_at?: string | null;
  user_role?: string;
  can_approve_dept?: boolean;
  can_clear_loafing?: boolean;
  rows: DailyDTRRow[];
  total_undertime_hours: number;
  total_undertime_minutes: number;
  days_present: number;
}

// ============================================================================
// REUSABLE DEFAULT USER AVATAR COMPONENT
// ============================================================================

interface ProfileAvatarProps {
  photoUrl?: string | null;
  name?: string;
  size?: number;
  iconSize?: number;
}

const ProfileAvatar: React.FC<ProfileAvatarProps> = ({
  photoUrl,
  name = 'Faculty Member',
  size = 36,
  iconSize = 18,
}) => {
  const [imageFailed, setImageFailed] = useState(false);

  useEffect(() => {
    setImageFailed(false);
  }, [photoUrl]);

  const hasPhoto = Boolean(
    photoUrl &&
    typeof photoUrl === 'string' &&
    photoUrl.trim() !== '' &&
    photoUrl.trim().toLowerCase() !== 'null' &&
    photoUrl.trim().toLowerCase() !== 'undefined'
  );

  return (
    <div
      style={{
        width: size,
        height: size,
        borderRadius: '50%',
        backgroundColor: '#f1f5f9',
        border: '1px solid #e2e8f0',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        overflow: 'hidden',
        flexShrink: 0,
      }}
      title={name}
    >
      {hasPhoto && !imageFailed ? (
        <img
          src={photoUrl!}
          alt={name}
          style={{ width: '100%', height: '100%', objectFit: 'cover' }}
          onError={() => setImageFailed(true)}
        />
      ) : (
        <User size={iconSize} color="#94a3b8" />
      )}
    </div>
  );
};

// ============================================================================
// MAIN COMPONENT
// ============================================================================

export const DTRTab: React.FC = () => {
  const { showAlert, showConfirm } = useAlert();

  // Selection & Period Filters
  const [facultyList, setFacultyList] = useState<FacultyMember[]>([]);
  const [selectedFacultyId, setSelectedFacultyId] = useState<string>('');
  const [selectedMonth, setSelectedMonth] = useState<number>(new Date().getMonth() + 1);
  const [selectedYear, setSelectedYear] = useState<number>(new Date().getFullYear());

  // Prescribed Working Hours
  const [regularHours, setRegularHours] = useState('8:00 to 12:00 and 1:00 to 5:00');
  const [saturdayHours, setSaturdayHours] = useState('As Required');
  const [viewSide, setViewSide] = useState<'BOTH' | 'FRONT' | 'BACK'>('BOTH');

  // Report Data & Action States
  const [dtrData, setDtrData] = useState<DTRReportData | null>(null);
  const [loading, setLoading] = useState(false);
  const [actionProcessing, setActionProcessing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [exportingPdf, setExportingPdf] = useState(false);

  // Principal Review Modal State
  const [selectedViolationRow, setSelectedViolationRow] = useState<DailyDTRRow | null>(null);
  const [pardonRemarks, setPardonRemarks] = useState('Official school assignment / DepEd duty authorized');

  const printAreaRef = useRef<HTMLDivElement>(null);

  // Prevent background polling from overriding inputs when modal is active
  const isInteracting = useRef(false);
  isInteracting.current = Boolean(selectedViolationRow) || actionProcessing;

  const activeFaculty = facultyList.find((f) => String(f.id) === selectedFacultyId);

  // ============================================================================
  // DATABASE DATA FETCHING
  // ============================================================================

  // 1. Fetch real faculty records from PostgreSQL
  useEffect(() => {
    let isMounted = true;

    const loadFaculty = async () => {
      try {
        let res;
        try {
          res = await apiClient.get<any>('/faculty/?page_size=100');
        } catch (firstErr: any) {
          if (firstErr?.response?.status === 404) {
            res = await apiClient.get<any>('/teachers/?page_size=100');
          } else {
            throw firstErr;
          }
        }

        if (!isMounted || !res) return;

        const raw = res.data;
        const items: FacultyMember[] = Array.isArray(raw)
          ? raw
          : raw?.results && Array.isArray(raw.results)
          ? raw.results
          : [];

        setFacultyList(items);
        if (items.length > 0 && !selectedFacultyId) {
          setSelectedFacultyId(String(items[0].id));
        }
      } catch (err: any) {
        if (isMounted) {
          setError(
            err?.response?.data?.detail ||
            err?.response?.data?.error ||
            'Could not load faculty profiles. Please verify backend routing.'
          );
        }
      }
    };

    loadFaculty();

    return () => {
      isMounted = false;
    };
  }, [selectedFacultyId]);

  // 2. Fetch real DTR attendance logs from database
  const fetchDTR = useCallback(
    async (silent = false) => {
      if (!selectedFacultyId) return;
      if (!silent) setLoading(true);
      setError(null);

      try {
        const res = await apiClient.get<DTRReportData>(`/reports/dtr/${selectedFacultyId}/`, {
          params: {
            month: selectedMonth,
            year: selectedYear,
          },
        });

        const loadedData = res.data;
        const rows31: DailyDTRRow[] = [];
        const currentRows = loadedData.rows || [];

        // Build complete 31-day timesheet
        for (let dayNum = 1; dayNum <= 31; dayNum++) {
          const found = currentRows.find((r) => r.day === dayNum);
          if (found) {
            rows31.push(found);
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
            });
          }
        }

        setDtrData({
          ...loadedData,
          rows: rows31,
        });
      } catch (err: any) {
        if (!silent) {
          setError(
            err?.response?.data?.detail ||
            err?.response?.data?.error ||
            'Failed to retrieve DTR data for the selected faculty member.'
          );
        }
      } finally {
        if (!silent) setLoading(false);
      }
    },
    [selectedFacultyId, selectedMonth, selectedYear]
  );

  useEffect(() => {
    fetchDTR(false);
  }, [fetchDTR]);

  // LIVE ZERO-REFRESH POLLING: Silent 3-second database check
  useEffect(() => {
    const liveHeartbeat = setInterval(() => {
      if (!isInteracting.current && selectedFacultyId) {
        fetchDTR(true);
      }
    }, 3000);

    return () => clearInterval(liveHeartbeat);
  }, [fetchDTR, selectedFacultyId]);

  // ============================================================================
  // GOVERNANCE & APPROVAL ACTIONS
  // ============================================================================

  // 3. Department Head Digital Endorsement
  const handleApproveByDeptHead = () => {
    if (!dtrData) return;

    showConfirm({
      title: 'Approve Official DTR',
      message: `Approve official Form 48 for ${dtrData.faculty_name} (${dtrData.month} ${dtrData.year})? This will endorse records, remove the DRAFT watermark, and unlock official hard-copy printing.`,
      confirmLabel: 'Approve & Endorse',
      isDestructive: false,
      onConfirm: async () => {
        setActionProcessing(true);
        try {
          await apiClient.post(`/reports/dtr/${dtrData.faculty_id}/`, {
            action: 'APPROVE_DEPT_HEAD',
            faculty_id: dtrData.faculty_id,
            month: dtrData.month_number,
            year: dtrData.year,
          });
          showAlert({
            title: 'DTR Endorsed',
            message: `Official Form 48 for ${dtrData.faculty_name} has been verified and cleared for printing.`,
            type: 'success',
          });
          fetchDTR(true);
        } catch (err: any) {
          showAlert({
            title: 'Approval Failed',
            message: err?.response?.data?.error || 'Failed to submit Department Head endorsement.',
            type: 'error',
          });
        } finally {
          setActionProcessing(false);
        }
      },
    });
  };

  // 4. Principal Pardon for Loafing Violation
  const handleExcuseLoafingByPrincipal = async () => {
    if (!dtrData || !selectedViolationRow) return;

    setActionProcessing(true);
    try {
      await apiClient.post(`/reports/dtr/${dtrData.faculty_id}/`, {
        action: 'EXCUSE_LOAFING',
        faculty_id: dtrData.faculty_id,
        date_str: selectedViolationRow.date_str,
        remarks: pardonRemarks.trim(),
      });
      showAlert({
        title: 'Violation Excused',
        message: `Loafing record on ${selectedViolationRow.date_str} has been excused by the Principal. Salary deduction removed.`,
        type: 'success',
      });
      setSelectedViolationRow(null);
      fetchDTR(true);
    } catch (err: any) {
      showAlert({
        title: 'Action Denied',
        message: err?.response?.data?.error || 'Only authorized leadership can excuse loafing records.',
        type: 'error',
      });
    } finally {
      setActionProcessing(false);
    }
  };

  // ============================================================================
  // EXPORT & PRINT HANDLING
  // ============================================================================

  const handleDownloadPdf = async () => {
    if (!printAreaRef.current || !dtrData) return;
    if (!dtrData.dept_head_approved) {
      showAlert({
        title: 'Approval Required',
        message: 'This DTR must be approved by the Department Head before exporting official copies. Current view contains the DRAFT watermark.',
        type: 'warning',
      });
      return;
    }

    setExportingPdf(true);
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
        margin: [0.15, 0.15, 0.15, 0.15],
        filename: `CSC_Form_48_${(dtrData.faculty_name || 'Faculty').replace(/[^a-zA-Z0-9]/g, '_')}_${dtrData.month}_${dtrData.year}.pdf`,
        image: { type: 'jpeg', quality: 0.98 },
        html2canvas: {
          scale: 2,
          useCORS: true,
          logging: false,
          scrollX: 0,
          scrollY: 0,
        },
        jsPDF: {
          unit: 'in',
          format: 'legal',
          orientation: 'portrait',
        },
        pagebreak: { mode: ['css', 'legacy'], after: '.csc-print-page' },
      };

      await html2pdfInstance().from(printAreaRef.current).set(opt).save();
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
        message: 'Official hard-copy printing is locked until the Department Head endorses this record.',
        type: 'warning',
      });
      return;
    }
    window.print();
  };

  // ============================================================================
  // EXACT CSC FORM NO. 48 TEMPLATE RENDERERS
  // ============================================================================

  // Front Side: Exact reproduction of CSC Form No. 48 front layout
  const renderDTRCopy = () => {
    if (!dtrData) return null;

    return (
      <div style={formCardContainer}>
        {/* DRAFT WATERMARK (Rendered when Department Head approval is pending) */}
        {!dtrData.dept_head_approved && (
          <div style={draftWatermarkStyle}>
            <div style={{ transform: 'rotate(-32deg)', display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
              <div style={draftWatermarkText}>DRAFT</div>
              <div style={draftWatermarkSub}>NOT APPROVED BY DEPT HEAD</div>
            </div>
          </div>
        )}

        {/* Top Header Block */}
        <div style={{ textAlign: 'center', marginBottom: 2 }}>
          <div style={{ fontSize: '7.5pt', fontStyle: 'italic', fontFamily: "'Times New Roman', Times, serif" }}>
            Civil Service Form No. 48
          </div>
          <div style={{ fontSize: '11.5pt', fontWeight: 900, textTransform: 'uppercase', letterSpacing: '0.6px', marginTop: 1 }}>
            DAILY TIME RECORD
          </div>

          {/* Name Field */}
          <div style={{ marginTop: 8, borderBottom: '1.2px solid #000', paddingBottom: 1, minHeight: 18 }}>
            <span style={{ fontSize: '9.2pt', fontWeight: 800, textTransform: 'uppercase' }}>
              {dtrData.faculty_name}
            </span>
          </div>
          <div style={{ fontSize: '6.5pt', fontStyle: 'italic', marginTop: 1 }}>(Name)</div>
        </div>

        {/* Period & Official Hours Block */}
        <div style={{ fontSize: '6.8pt', marginBottom: 4, lineHeight: 1.25 }}>
          <div style={{ borderBottom: '0.8px solid #000', paddingBottom: 2 }}>
            <span>
              For the month of <u>&nbsp;<strong>{dtrData.month}</strong>&nbsp;</u>, 20<u>&nbsp;<strong>{String(dtrData.year).slice(-2)}</strong>&nbsp;</u>
            </span>
          </div>

          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginTop: 3 }}>
            <div style={{ width: '46%', fontSize: '6.2pt', lineHeight: 1.15 }}>
              Official hours of arrival<br />
              and departure
            </div>
            <div style={{ width: '54%', fontSize: '6.2pt', lineHeight: 1.15 }}>
              <div>Regular Days: <u>{regularHours}</u></div>
              <div style={{ marginTop: 1 }}>Saturdays: <u>{saturdayHours}</u></div>
            </div>
          </div>
        </div>

        {/* 31-Day Attendance Table matching CSC Form 48 */}
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
              const isViolating = row.is_loafing && !row.loafing_excused;

              return (
                <tr
                  key={row.day}
                  style={{
                    height: 14,
                    backgroundColor: isViolating
                      ? '#fee2e2'
                      : row.is_weekend
                      ? '#fafafa'
                      : '#ffffff',
                  }}
                >
                  <td style={{ ...dtrTdCenter, fontWeight: 700 }}>
                    {row.day}
                    {row.is_loafing && (
                      <span
                        onClick={() => dtrData.can_clear_loafing && setSelectedViolationRow(row)}
                        title={isViolating ? 'Loafing flag. Click for review.' : 'Excused by Principal'}
                        style={{
                          marginLeft: 2,
                          fontSize: '5.2pt',
                          color: isViolating ? '#dc2626' : '#059669',
                          cursor: dtrData.can_clear_loafing ? 'pointer' : 'default',
                        }}
                      >
                        {isViolating ? '(!)' : '(✓)'}
                      </span>
                    )}
                  </td>
                  <td style={{ ...dtrTdCenter, color: isViolating ? '#dc2626' : 'inherit', fontWeight: isViolating ? 700 : 'normal' }}>
                    {row.am_arrival}
                  </td>
                  <td style={{ ...dtrTdCenter, color: isViolating ? '#dc2626' : 'inherit', fontWeight: isViolating ? 700 : 'normal' }}>
                    {row.am_departure}
                  </td>
                  <td style={{ ...dtrTdCenter, color: isViolating ? '#dc2626' : 'inherit', fontWeight: isViolating ? 700 : 'normal' }}>
                    {row.pm_arrival}
                  </td>
                  <td style={{ ...dtrTdCenter, color: isViolating ? '#dc2626' : 'inherit', fontWeight: isViolating ? 700 : 'normal' }}>
                    {row.pm_departure}
                  </td>
                  <td style={{ ...dtrTdCenter, color: isViolating ? '#dc2626' : 'inherit', fontWeight: isViolating ? 800 : 'normal' }}>
                    {row.undertime_hours}
                  </td>
                  <td style={{ ...dtrTdCenter, color: isViolating ? '#dc2626' : 'inherit', fontWeight: isViolating ? 800 : 'normal' }}>
                    {row.undertime_minutes}
                  </td>
                </tr>
              );
            })}

            {/* Total Row */}
            <tr style={{ height: 16, borderTop: '1.2px solid #000', fontWeight: 800 }}>
              <td style={{ ...dtrTdCenter, fontWeight: 900 }}>TOTAL</td>
              <td colSpan={4} style={{ ...dtrTdCenter, fontSize: '5.6pt' }}>
                Days Present: <strong>{dtrData.days_present}</strong> &bull; Total Undertime:
              </td>
              <td style={dtrTdCenter}>{dtrData.total_undertime_hours || ''}</td>
              <td style={dtrTdCenter}>{dtrData.total_undertime_minutes || ''}</td>
            </tr>
          </tbody>
        </table>

        {/* Certification Oath Statement */}
        <div style={{ marginTop: 6, fontSize: '5.8pt', textAlign: 'justify', lineHeight: 1.25 }}>
          I CERTIFY on my honor that the above is a true and correct report of the hours of work performed, record of which was made daily at the time of arrival and departure from office.
        </div>

        {/* Employee Signature Line */}
        <div style={{ marginTop: 16, textAlign: 'center' }}>
          <div style={{ borderBottom: '1px solid #000', width: '82%', margin: '0 auto' }}></div>
          <div style={{ fontSize: '5.6pt', fontStyle: 'italic', marginTop: 1 }}>
            (Signature of Teacher / Employee)
          </div>
        </div>

        {/* In-Charge Line matching CSC Form 48 Template */}
        <div style={{ marginTop: 10, textAlign: 'center' }}>
          <div style={{ borderBottom: '1px solid #000', width: '82%', margin: '0 auto', minHeight: 14 }}>
            <span style={{ fontSize: '7.5pt', fontWeight: 800, textTransform: 'uppercase' }}>
              {dtrData.school_head || 'JACQUELINE GALUPO'}
            </span>
          </div>
          <div style={{ fontSize: '6.4pt', fontWeight: 700, marginTop: 1 }}>
            In-Charge
          </div>
        </div>

        {/* Instructions Back Pointer */}
        <div style={{ textAlign: 'center', marginTop: 4, fontSize: '5.6pt', fontStyle: 'italic' }}>
          (See Instructions on back)
        </div>
      </div>
    );
  };

  // Back Side: Exact reproduction of CSC Form No. 48 Instructions
  const renderInstructionsCopy = () => (
    <div style={formCardContainer}>
      <div style={{ textAlign: 'center', marginBottom: 8, borderBottom: '1px solid #000', paddingBottom: 4 }}>
        <div style={{ fontSize: '11pt', fontWeight: 900, letterSpacing: '0.8px' }}>
          INSTRUCTIONS
        </div>
      </div>

      <div style={{ fontSize: '6.0pt', textAlign: 'justify', lineHeight: 1.35, display: 'flex', flexDirection: 'column', gap: 6 }}>
        <p style={{ margin: 0 }}>
          Civil Service Form No. 48, after completion, Should be filed in the records of the Bureau or Office which submits the monthly report on Civil Service Form No. 3 to the Bureau of Civil Service.
        </p>

        <p style={{ margin: 0 }}>
          In lieu of the above, court interpreters and stenographers who accompany the judges of the Court of First Instance will fill out the daily time reports on this form in triplicate, after which they should be approved by the judge with whom service has been rendered, or by an officer of the Department of Justice authorized to do so. The original should be forwarded promptly after the end of the month to the Bureau of Civil Service, thru the Department of Justice; the duplicate to kept in the department of justice; and the triplicate, in the office of the Clerk of Court where service was rendered.
        </p>

        <p style={{ margin: 0 }}>
          In the space provided for the purpose on the other side will be indicated the office hours the employee is required to observe, as for example, &ldquo;Regular days, 8:00 to 12:00 and 1:00 to 4:00; Saturdays 8:00 to 1:00.&rdquo;
        </p>

        <p style={{ margin: 0 }}>
          Attention is invited to paragraph 3, Civil Service Rule XV, Executive Order No. 5, series of 1909, which reads as follows:
        </p>

        <blockquote style={{ margin: '0 0 0 8px', borderLeft: '1.5px solid #000', paddingLeft: 6, fontStyle: 'italic' }}>
          &ldquo;Each chief of a Bureau or Office shall require a daily record of attendance of all the officers and employees under him entitled to leave or absence or vacation (including teachers) to be kept on the proper form and also a systematic office record showing for each day all absences from duty from any cause whatever. At the beginning of each month he shall report to the Commissioner on the proper form of all absences from any cause whatever, including the exact amount of undertime of each person for each day. Officers or employees serving in the field or on the water need not be required to keep a daily record, but all absences of such employees must be included in the monthly report of changes and absences. Falsification of time records will render the offending officers or employee liable to summary removal from the service and criminal prosecution.&rdquo;
        </blockquote>

        <p style={{ margin: '4px 0 0 0', fontSize: '5.7pt' }}>
          <strong>(NOTE</strong> A record made from memory at sometime subsequent to the occurrence of as event is not reliable. Non observance of office hours deprives the employee of the leave privileges although he may have rendered overtime service. Where service rendered outside of the Office for the whole morning or afternoon, notation to that effect should be made clearly.)
        </p>
      </div>
    </div>
  );

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      
      {/* 1. Control Header Bar */}
      <div style={controlBar}>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10, alignItems: 'center' }}>
          {/* Default User Icon / Real Photo Avatar */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <ProfileAvatar
              photoUrl={activeFaculty?.photo}
              name={activeFaculty?.full_name || 'Faculty Profile'}
              size={36}
              iconSize={18}
            />
            <select
              value={selectedFacultyId}
              onChange={(e) => setSelectedFacultyId(e.target.value)}
              style={selectControl}
            >
              {facultyList.map((f) => (
                <option key={f.id} value={f.id}>
                  {f.full_name || `${f.last_name}, ${f.first_name}`} ({f.employee_id})
                </option>
              ))}
            </select>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <Calendar size={15} color="#0284c7" />
            <select
              value={selectedMonth}
              onChange={(e) => setSelectedMonth(Number(e.target.value))}
              style={selectControl}
            >
              {[
                'January', 'February', 'March', 'April', 'May', 'June',
                'July', 'August', 'September', 'October', 'November', 'December',
              ].map((m, idx) => (
                <option key={m} value={idx + 1}>{m}</option>
              ))}
            </select>
          </div>

          <select
            value={selectedYear}
            onChange={(e) => setSelectedYear(Number(e.target.value))}
            style={selectControl}
          >
            {[2025, 2026, 2027].map((y) => (
              <option key={y} value={y}>{y}</option>
            ))}
          </select>

          <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
            <Layers size={14} color="#64748b" />
            <select
              value={viewSide}
              onChange={(e) => setViewSide(e.target.value as any)}
              style={selectControl}
            >
              <option value="BOTH">Full Form (Front &amp; Back)</option>
              <option value="FRONT">Front Side Only (Form 48)</option>
              <option value="BACK">Back Side Only (Instructions)</option>
            </select>
          </div>

          <Button variant="secondary" size="md" onClick={() => fetchDTR(false)} disabled={loading}>
            {loading ? <Loader2 className="animate-spin" size={14} /> : <RefreshCw size={14} />}
            <span style={{ marginLeft: 6 }}>Refresh</span>
          </Button>
        </div>

        {/* Action Controls & Department Head Approval */}
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          {dtrData?.can_approve_dept && !dtrData?.dept_head_approved && (
            <Button
              variant="primary"
              size="md"
              onClick={handleApproveByDeptHead}
              disabled={actionProcessing}
              style={{ backgroundColor: '#059669', borderColor: '#059669' }}
            >
              {actionProcessing ? <Loader2 className="animate-spin" size={14} /> : <CheckCircle2 size={14} />}
              <span style={{ marginLeft: 6 }}>Approve as Dept Head</span>
            </Button>
          )}

          <Button
            variant="secondary"
            size="md"
            onClick={handleDownloadPdf}
            disabled={exportingPdf || !dtrData || !dtrData.dept_head_approved}
            title={!dtrData?.dept_head_approved ? 'Department Head endorsement required before exporting.' : 'Export Form 48 PDF'}
          >
            {exportingPdf ? <Loader2 className="animate-spin" size={14} /> : !dtrData?.dept_head_approved ? <Lock size={14} color="#dc2626" /> : <Download size={14} />}
            <span style={{ marginLeft: 6 }}>Export PDF</span>
          </Button>

          <Button
            variant="primary"
            size="md"
            onClick={handlePrint}
            disabled={!dtrData || !dtrData.dept_head_approved}
            title={!dtrData?.dept_head_approved ? 'Department Head endorsement required before printing.' : 'Print Hard Copy Form 48'}
          >
            {!dtrData?.dept_head_approved ? <Lock size={14} /> : <Printer size={14} />}
            <span style={{ marginLeft: 6 }}>Print Form 48</span>
          </Button>
        </div>
      </div>

      {/* 2. Department Head & Principal Governance Banner */}
      {dtrData && (
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            padding: '10px 16px',
            borderRadius: 8,
            backgroundColor: dtrData.dept_head_approved ? '#ecfdf5' : '#fffbeb',
            border: `1px solid ${dtrData.dept_head_approved ? '#a7f3d0' : '#fde68a'}`,
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            {dtrData.dept_head_approved ? (
              <ShieldCheck size={20} color="#059669" />
            ) : (
              <ShieldAlert size={20} color="#d97706" />
            )}
            <div>
              <div style={{ fontSize: '0.82rem', fontWeight: 800, color: dtrData.dept_head_approved ? '#065f46' : '#92400e' }}>
                {dtrData.dept_head_approved
                  ? 'DEPARTMENT HEAD APPROVED — OFFICIAL COPY UNLOCKED (DRAFT WATERMARK REMOVED)'
                  : 'PENDING DEPARTMENT HEAD APPROVAL — MARKED AS DRAFT (OFFICIAL PRINTING LOCKED)'}
              </div>
              <div style={{ fontSize: '0.72rem', color: '#475569', marginTop: 2 }}>
                Teachers must secure their Department Head's digital endorsement before submitting the physically signed copy to the Principal.
              </div>
            </div>
          </div>

          <div style={{ fontSize: '0.74rem', fontWeight: 700, color: '#334155' }}>
            Status:{' '}
            <span style={{ color: dtrData.dept_head_approved ? '#059669' : '#d97706' }}>
              {dtrData.dept_head_approved ? 'APPROVED & CLEARED' : 'DRAFT / PENDING'}
            </span>
          </div>
        </div>
      )}

      {/* 3. Official Working Hours Bar */}
      <div style={scheduleBar}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: '0.78rem' }}>
          <Clock size={15} color="#64748b" />
          <span style={{ fontWeight: 700, color: '#334155' }}>Prescribed Hours:</span>
        </div>
        <div style={{ display: 'flex', gap: 14, flexWrap: 'wrap', alignItems: 'center' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: '0.76rem' }}>
            <span style={{ color: '#64748b' }}>Regular:</span>
            <input
              type="text"
              value={regularHours}
              onChange={(e) => setRegularHours(e.target.value)}
              style={inputSchedule}
            />
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: '0.76rem' }}>
            <span style={{ color: '#64748b' }}>Saturdays:</span>
            <input
              type="text"
              value={saturdayHours}
              onChange={(e) => setSaturdayHours(e.target.value)}
              style={inputSchedule}
            />
          </div>
        </div>
      </div>

      {error && (
        <div style={errorBanner}>
          <AlertCircle size={18} />
          <span>{error}</span>
        </div>
      )}

      {/* 4. Official Printable Sheets Container (2-Up Side-by-Side) */}
      <div style={{ overflowX: 'auto', paddingBottom: 24 }}>
        {loading ? (
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: 320, gap: 10 }}>
            <Loader2 className="animate-spin" size={26} color="#0284c7" />
            <span style={{ fontSize: '0.88rem', fontWeight: 600, color: '#475569' }}>
              Loading attendance logs and verifying Department Head clearance...
            </span>
          </div>
        ) : dtrData ? (
          <div ref={printAreaRef} style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
            {(viewSide === 'BOTH' || viewSide === 'FRONT') && (
              <div id="csc-form-48-front" className="csc-print-page" style={printableSheetContainer}>
                {renderDTRCopy()}
                <div style={perforationLine}></div>
                {renderDTRCopy()}
              </div>
            )}

            {(viewSide === 'BOTH' || viewSide === 'BACK') && (
              <div id="csc-form-48-back" className="csc-print-page" style={printableSheetContainer}>
                {renderInstructionsCopy()}
                <div style={perforationLine}></div>
                {renderInstructionsCopy()}
              </div>
            )}
          </div>
        ) : null}
      </div>

      {/* 5. Principal Loafing Violation Review Modal */}
      {selectedViolationRow && (
        <Modal
          isOpen={Boolean(selectedViolationRow)}
          onClose={() => setSelectedViolationRow(null)}
          title="Principal Discretion: Loafing Violation Review"
        >
          <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: 12, backgroundColor: '#fef2f2', borderRadius: 8, border: '1px solid #fee2e2' }}>
              <AlertTriangle size={24} color="#dc2626" style={{ flexShrink: 0 }} />
              <div style={{ fontSize: '0.78rem', color: '#991b1b', lineHeight: 1.35 }}>
                An unexcused departure or loafing flag was recorded for <strong>{dtrData?.faculty_name}</strong> on <strong>{selectedViolationRow.date_str}</strong>.
                If not excused by the Principal, this date will incur a salary deduction.
              </div>
            </div>

            <div style={{ fontSize: '0.80rem', color: '#334155' }}>
              <strong>Recorded Gate Note:</strong> {selectedViolationRow.loafing_remarks || 'Teacher scanned OUT without authorized Gate Pass.'}
            </div>

            <div>
              <label style={{ display: 'block', fontSize: '0.78rem', fontWeight: 700, color: '#334155', marginBottom: 4 }}>
                Principal Pardon Reason / Official Remarks:
              </label>
              <input
                type="text"
                value={pardonRemarks}
                onChange={(e) => setPardonRemarks(e.target.value)}
                style={{
                  width: '100%',
                  padding: '8px 12px',
                  borderRadius: 6,
                  border: '1px solid #cbd5e1',
                  fontSize: '0.84rem',
                  outline: 'none',
                  boxSizing: 'border-box',
                }}
                placeholder="Enter justification for excusing departure..."
              />
            </div>

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, marginTop: 10 }}>
              <Button variant="secondary" size="md" onClick={() => setSelectedViolationRow(null)}>
                Leave as Deduction
              </Button>
              <Button
                variant="primary"
                size="md"
                onClick={handleExcuseLoafingByPrincipal}
                disabled={actionProcessing}
                style={{ backgroundColor: '#059669', borderColor: '#059669' }}
              >
                {actionProcessing ? <Loader2 className="animate-spin" size={14} /> : <CheckCircle2 size={14} />}
                <span style={{ marginLeft: 6 }}>Pardon &amp; Clear Deduction</span>
              </Button>
            </div>
          </div>
        </Modal>
      )}

      {/* High-Precision Print Media Styles */}
      <style>{`
        @media print {
          @page {
            size: 8.5in 13in;
            margin: 0.2in !important;
          }
          html, body, #root {
            background: #ffffff !important;
            margin: 0 !important;
            padding: 0 !important;
          }
          body * {
            visibility: hidden;
          }
          .csc-print-page, .csc-print-page * {
            visibility: visible;
          }
          .csc-print-page {
            position: relative;
            left: 0;
            top: 0;
            width: 8.5in !important;
            min-height: 12.5in !important;
            margin: 0 auto !important;
            padding: 0.25in !important;
            box-shadow: none !important;
            border: none !important;
            page-break-after: always !important;
            break-after: page !important;
          }
          .csc-print-page:last-child {
            page-break-after: avoid !important;
            break-after: avoid !important;
          }
        }
      `}</style>
    </div>
  );
};

// ============================================================================
// STYLES
// ============================================================================

const controlBar: React.CSSProperties = {
  display: 'flex',
  justifyContent: 'space-between',
  alignItems: 'center',
  backgroundColor: '#ffffff',
  padding: '12px 18px',
  borderRadius: 8,
  border: '1px solid #e2e8f0',
  boxShadow: '0 1px 2px rgba(0,0,0,0.02)',
};

const scheduleBar: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
  backgroundColor: '#f8fafc',
  padding: '8px 16px',
  borderRadius: 8,
  border: '1px solid #cbd5e1',
};

const selectControl: React.CSSProperties = {
  padding: '6px 10px',
  borderRadius: 6,
  border: '1px solid #cbd5e1',
  fontSize: '0.82rem',
  color: '#0f172a',
  backgroundColor: '#ffffff',
  outline: 'none',
};

const inputSchedule: React.CSSProperties = {
  padding: '4px 8px',
  borderRadius: 4,
  border: '1px solid #cbd5e1',
  fontSize: '0.76rem',
  color: '#0f172a',
  backgroundColor: '#ffffff',
  width: 220,
};

const errorBanner: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: 8,
  padding: '10px 14px',
  backgroundColor: '#fef2f2',
  color: '#dc2626',
  borderRadius: 8,
  fontSize: '0.82rem',
};

const printableSheetContainer: React.CSSProperties = {
  display: 'grid',
  gridTemplateColumns: '1fr auto 1fr',
  gap: 20,
  backgroundColor: '#ffffff',
  width: '8.5in',
  margin: '0 auto',
  padding: '0.35in 0.35in',
  borderRadius: 4,
  boxShadow: '0 4px 18px rgba(0,0,0,0.08)',
  boxSizing: 'border-box',
};

const perforationLine: React.CSSProperties = {
  width: '1px',
  borderLeft: '1px dashed #94a3b8',
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
  fontSize: '52pt',
  fontWeight: 900,
  fontFamily: "'Arial Black', Impact, sans-serif",
  color: 'rgba(239, 68, 68, 0.22)',
  border: '5px dashed rgba(239, 68, 68, 0.28)',
  padding: '4px 28px',
  borderRadius: 10,
  letterSpacing: '10px',
  lineHeight: 1,
  textAlign: 'center',
};

const draftWatermarkSub: React.CSSProperties = {
  fontSize: '8pt',
  fontWeight: 800,
  fontFamily: 'Arial, sans-serif',
  color: 'rgba(239, 68, 68, 0.32)',
  letterSpacing: '2px',
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