// AttendSure Web - Advisory Subject Monitor Component
// File: D:\AttendSure_V3\web\src\components\advisory\AdvisorySubjectMonitor.tsx

/**
 * AttendSure - Class Adviser Subject Attendance & Cutting Monitor
 * File: web/src/components/advisory/AdvisorySubjectMonitor.tsx
 */

import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import apiClient, { peekApiCache } from '../../api/client';
import { API_ROUTES, extractApiError } from '../../api/routes';
import { useTheme } from '../../context/ThemeContext';
import { sanitizeText } from '../../theme/tokens';
import { ProfileAvatar } from '../common/ProfileAvatar';
import { exportToCsv } from '../common/Pagination';
import { ControlSwitch } from '../ui/ControlSwitch';
import {
  AlertTriangle,
  AlertCircle,
  RefreshCw,
  Search,
  BookOpen,
  CheckCircle2,
  Clock,
  Info,
  Download,
  ShieldCheck,
} from 'lucide-react';

interface AvailableSection {
  id: number;
  name: string;
  grade_level: string;
  is_adviser: boolean;
}

interface SubjectHeader {
  schedule_id: number;
  subject_code: string;
  subject_name: string;
  teacher_name: string;
  time_window: string;
}

interface StudentSubjectStatus {
  schedule_id: number;
  subject_code: string;
  status: 'PRESENT' | 'LATE' | 'CUTTING' | 'EXCUSED' | 'ABSENT' | 'UNSCANNED';
  time: string;
}

interface StudentMatrixRow {
  number: number;
  student_id: number;
  student_name: string;
  lrn: string;
  photo_url?: string | null;
  campus_status: string;
  presence_state: 'ACTIVE' | 'NONE';
  attended_count: number;
  cutting_count: number;
  total_subjects: number;
  compliance_rate: number;
  subjects: StudentSubjectStatus[];
}

type MatrixFilterMode = 'ALL' | 'CUTTING' | 'ABSENT';

const normalizeMatrixRows = (rows: unknown): StudentMatrixRow[] =>
  (Array.isArray(rows) ? rows : []).map((row: any) => ({
    ...row,
    campus_status: String(row.campus_status || 'Not Seen Yet'),
    presence_state: row.presence_state === 'ACTIVE' ? 'ACTIVE' : 'NONE',
  }));

export const AdvisorySubjectMonitor: React.FC = () => {
  const { tokens, brand, fonts, ui } = useTheme();

  const warmData = useMemo(
    () => peekApiCache<Record<string, any>>(API_ROUTES.attendance.adviserMatrix),
    []
  );

  const [loading, setLoading] = useState<boolean>(() => warmData === undefined);
  const [refreshing, setRefreshing] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState<string>('');
  const [filterMode, setFilterMode] = useState<MatrixFilterMode>('ALL');

  const [hasAdvisoryClass, setHasAdvisoryClass] = useState<boolean>(() => Boolean(warmData?.has_advisory_class));
  const [selectedSectionId, setSelectedSectionId] = useState<number | null>(() =>
    warmData?.has_advisory_class ? warmData.section_id || null : null
  );
  const [sectionTitle, setSectionTitle] = useState<string>(() =>
    warmData?.has_advisory_class
      ? [warmData.grade_level, warmData.section_name].filter(Boolean).join(' - ') || 'Selected Section'
      : ''
  );
  const [availableSections, setAvailableSections] = useState<AvailableSection[]>(() =>
    Array.isArray(warmData?.available_sections) ? warmData.available_sections : []
  );
  const [isAdviserOfSection, setIsAdviserOfSection] = useState<boolean>(() =>
    Boolean(warmData?.has_advisory_class && warmData?.is_adviser)
  );
  const [schedules, setSchedules] = useState<SubjectHeader[]>(() =>
    warmData?.has_advisory_class && Array.isArray(warmData?.schedules) ? warmData.schedules : []
  );
  const [matrix, setMatrix] = useState<StudentMatrixRow[]>(() =>
    warmData?.has_advisory_class ? normalizeMatrixRows(warmData.matrix) : []
  );

  const abortRef = useRef<AbortController | null>(null);
  const selectedSectionRef = useRef<number | null>(null);
  selectedSectionRef.current = selectedSectionId;

  const fetchMatrixData = useCallback(
    async (targetSectionId?: number | null, silent = false, bypassCache = false) => {
      abortRef.current?.abort();
      const controller = new AbortController();
      abortRef.current = controller;

      if (!silent) setLoading(true);
      else setRefreshing(true);
      setError(null);

      try {
        const params: Record<string, number> = {};
        if (targetSectionId) params.section_id = targetSectionId;
        if (bypassCache) params.nocache = 1;

        const res = await apiClient.get(API_ROUTES.attendance.adviserMatrix, {
          params,
          signal: controller.signal,
        });
        if (controller.signal.aborted) return;

        const d = res.data || {};
        const sectionsList: AvailableSection[] = Array.isArray(d.available_sections)
          ? d.available_sections
          : [];
        setAvailableSections(sectionsList);

        if (d.has_advisory_class) {
          setHasAdvisoryClass(true);
          setSelectedSectionId(d.section_id || null);
          setSectionTitle(
            [d.grade_level, d.section_name].filter(Boolean).join(' - ') || 'Selected Section'
          );
          setIsAdviserOfSection(Boolean(d.is_adviser));
          setSchedules(Array.isArray(d.schedules) ? d.schedules : []);
          setMatrix(normalizeMatrixRows(d.matrix));
        } else {
          setHasAdvisoryClass(false);
          setMatrix([]);
          setSchedules([]);
        }
      } catch (err: unknown) {
        const anyErr = err as { name?: string; code?: string };
        if (
          controller.signal.aborted ||
          anyErr?.name === 'CanceledError' ||
          anyErr?.name === 'AbortError' ||
          anyErr?.code === 'ERR_CANCELED'
        ) {
          return;
        }
        if (!silent) {
          setError(extractApiError(err, 'Unable to load the subject attendance matrix.'));
        }
      } finally {
        if (!controller.signal.aborted) {
          setLoading(false);
          setRefreshing(false);
        }
      }
    },
    []
  );

  useEffect(() => {
    void fetchMatrixData(null, warmData !== undefined, false);
    return () => {
      abortRef.current?.abort();
    };
  }, [fetchMatrixData, warmData]);

  useEffect(() => {
    const handleAttendanceUpdated = () => {
      void fetchMatrixData(selectedSectionRef.current, true, true);
    };
    window.addEventListener('attendsure:attendance-updated', handleAttendanceUpdated);
    const timer = setInterval(() => {
      if (document.visibilityState === 'visible') {
        fetchMatrixData(selectedSectionRef.current, true, true);
      }
    }, 20000);
    return () => {
      window.removeEventListener('attendsure:attendance-updated', handleAttendanceUpdated);
      clearInterval(timer);
    };
  }, [fetchMatrixData]);

  const handleSectionChange = (nextSectionId: number) => {
    setSelectedSectionId(nextSectionId);
    setFilterMode('ALL');
    fetchMatrixData(nextSectionId, false, false);
  };

  const cleanSearch = useMemo(() => sanitizeText(search, 50).toLowerCase(), [search]);

  const summaryMetrics = useMemo(() => {
    const total = matrix.length;
    const cutting = matrix.filter((m) => m.cutting_count > 0).length;
    const absent = matrix.filter((m) => m.presence_state === 'NONE' && m.attended_count === 0).length;
    const complete = matrix.filter(
      (m) => m.attended_count === m.total_subjects && m.total_subjects > 0
    ).length;
    return { total, cutting, absent, complete };
  }, [matrix]);

  const filteredMatrix = useMemo(() => {
    return matrix.filter((row) => {
      const matchSearch =
        cleanSearch === '' ||
        row.student_name.toLowerCase().includes(cleanSearch) ||
        row.lrn.includes(cleanSearch);

      if (!matchSearch) return false;
      if (filterMode === 'CUTTING') return row.cutting_count > 0;
      if (filterMode === 'ABSENT') return row.presence_state === 'NONE' && row.attended_count === 0;
      return true;
    });
  }, [matrix, cleanSearch, filterMode]);

  const handleExportCsv = () => {
    if (filteredMatrix.length === 0) return;
    const headers = [
      '#',
      'LRN',
      'Student Name',
      'First Scan Today',
      ...schedules.map((s) => `${s.subject_code} (${s.time_window || 'Period'})`),
      'Attended Periods',
      'Compliance %',
    ];

    const rows = filteredMatrix.map((row) => [
      row.number,
      row.lrn,
      row.student_name,
      row.campus_status,
      ...schedules.map((sched) => {
        const cell = row.subjects.find((sub) => sub.schedule_id === sched.schedule_id);
        if (!cell || cell.status === 'UNSCANNED') return '—';
        return cell.time ? `${cell.status} (${cell.time})` : cell.status;
      }),
      `${row.attended_count}/${row.total_subjects}`,
      `${row.compliance_rate}%`,
    ]);

    const cleanSec = sectionTitle.replace(/[^a-zA-Z0-9]/g, '_') || 'Section';
    exportToCsv(
      `AttendSure_SubjectMatrix_${cleanSec}_${new Date().toISOString().slice(0, 10)}.csv`,
      headers,
      rows
    );
  };

  const renderStatusPill = (status: string, time: string) => {
    switch (status) {
      case 'PRESENT':
        return (
          <span
            style={pillStyle(tokens.successLight, brand.success)}
            title={time ? `Scanned at ${time}` : 'Present'}
          >
            <CheckCircle2 size={11} /> Present
          </span>
        );
      case 'LATE':
        return (
          <span
            style={pillStyle(tokens.warningLight, brand.warning)}
            title={time ? `Marked late at ${time}` : 'Late'}
          >
            <Clock size={11} /> Late
          </span>
        );
      case 'EXCUSED':
        return (
          <span
            style={pillStyle(tokens.infoLight, brand.secondary)}
            title="Authorized excuse or approved exit pass"
          >
            <ShieldCheck size={11} /> Excused
          </span>
        );
      case 'CUTTING':
        return (
          <span
            style={{ ...pillStyle(tokens.dangerLight, brand.danger), fontWeight: 900 }}
            title="Cutting Alert: Student was present earlier today but missed this subject period"
          >
            <AlertTriangle size={11} /> Cutting Class
          </span>
        );
      case 'ABSENT':
        return (
          <span
            style={pillStyle(tokens.dangerLight, brand.danger)}
            title="Marked absent for this period"
          >
            <AlertCircle size={11} /> Absent
          </span>
        );
      default:
        return (
          <span
            style={pillStyle(tokens.bgSurfaceSubtle, tokens.textMuted)}
            title="Not scanned in this period yet"
          >
            —
          </span>
        );
    }
  };

  if (loading && !refreshing) {
    return (
      <div style={{ padding: 48, textAlign: 'center', color: tokens.textMuted }}>
        <RefreshCw
          size={24}
          className="animate-spin"
          style={{ margin: '0 auto 8px', display: 'block', color: brand.primary }}
        />
        <span style={{ fontSize: fonts.size.base, fontWeight: 600 }}>
          Loading subject attendance matrix...
        </span>
      </div>
    );
  }

  if (error && !hasAdvisoryClass && availableSections.length === 0) {
    return (
      <div style={{ ...ui.card, padding: 36, textAlign: 'center' }}>
        <AlertCircle size={34} color={brand.danger} style={{ margin: '0 auto 10px', display: 'block' }} />
        <h3 style={{ margin: 0, fontSize: fonts.size.md, fontWeight: 800, color: tokens.textPrimary }}>
          Could Not Load Attendance Matrix
        </h3>
        <p style={{ margin: '6px auto 16px', fontSize: fonts.size.sm, color: tokens.textSecondary, maxWidth: 420 }}>
          {error}
        </p>
        <button
          type="button"
          onClick={() => fetchMatrixData(selectedSectionId, false, true)}
          style={ui.btnPrimary}
        >
          <RefreshCw size={14} /> Retry Now
        </button>
      </div>
    );
  }

  if (!hasAdvisoryClass && availableSections.length === 0) {
    return (
      <div
        style={{
          ...ui.card,
          borderStyle: 'dashed',
          borderColor: tokens.borderStrong,
          padding: 48,
          textAlign: 'center',
        }}
      >
        <Info size={36} color={tokens.textMuted} style={{ margin: '0 auto 12px', display: 'block' }} />
        <h3 style={{ fontSize: fonts.size.md, fontWeight: 800, color: tokens.textPrimary, margin: 0 }}>
          No Assigned Class Section Found
        </h3>
        <p
          style={{
            fontSize: fonts.size.sm,
            color: tokens.textSecondary,
            maxWidth: 420,
            margin: '6px auto 16px',
          }}
        >
          Your profile is not yet assigned as a Class Adviser or subject teacher for an active
          section. Contact your school administrator to link your schedule.
        </p>
        <button
          type="button"
          onClick={() => fetchMatrixData(null, false, true)}
          style={ui.btnPrimary}
        >
          <RefreshCw size={14} /> Check Again
        </button>
      </div>
    );
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14, width: '100%' }}>
      {/* 1. Header Toolbar with Section Selector & Filter Switch */}
      <div
        style={{
          ...ui.card,
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          flexWrap: 'wrap',
          gap: 12,
          padding: '12px 18px',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <div
            style={{
              width: 38,
              height: 38,
              borderRadius: 10,
              backgroundColor: tokens.primaryLight,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              flexShrink: 0,
            }}
          >
            <BookOpen size={18} color={brand.primary} />
          </div>

          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
              <h2 style={{ fontSize: fonts.size.md, fontWeight: 800, color: tokens.textPrimary, margin: 0 }}>
                Subject Attendance &amp; Cutting Monitor
              </h2>
              {isAdviserOfSection && (
                <span style={ui.badge(tokens.primaryLight, brand.primary)}>Class Adviser</span>
              )}
            </div>

            {availableSections.length > 0 && (
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 4, flexWrap: 'wrap' }}>
                <span style={{ fontSize: fonts.size.xs, color: tokens.textSecondary, fontWeight: 700 }}>
                  Section:
                </span>
                <select
                  aria-label="Select class section"
                  value={selectedSectionId || ''}
                  onChange={(e) => handleSectionChange(Number(e.target.value))}
                  style={{
                    ...ui.input,
                    width: 'auto',
                    padding: '3px 10px',
                    fontSize: fonts.size.xs,
                    fontWeight: 700,
                    cursor: 'pointer',
                  }}
                >
                  {availableSections.map((sec) => (
                    <option key={sec.id} value={sec.id}>
                      {sec.grade_level ? `${sec.grade_level} - ` : ''}
                      {sec.name} {sec.is_adviser ? '★ Advisory' : ''}
                    </option>
                  ))}
                </select>
                <span style={{ fontSize: fonts.size.xs, color: tokens.textMuted }}>
                  &bull; Class List: <strong style={{ color: tokens.textPrimary }}>{summaryMetrics.total}</strong> students
                </span>
              </div>
            )}
          </div>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
          <ControlSwitch<MatrixFilterMode>
            options={[
              { value: 'ALL', label: 'All Students', badge: summaryMetrics.total },
              { value: 'CUTTING', label: 'Cutting Class', badge: summaryMetrics.cutting },
              { value: 'ABSENT', label: 'Not Seen Today', badge: summaryMetrics.absent },
            ]}
            value={filterMode}
            onChange={setFilterMode}
            size="sm"
            ariaLabel="Filter Attendance Matrix"
          />

          <button
            type="button"
            onClick={handleExportCsv}
            disabled={filteredMatrix.length === 0}
            style={ui.btnSecondary}
            title="Download CSV"
          >
            <Download size={13} />
            <span>CSV</span>
          </button>

          <button
            type="button"
            onClick={() => fetchMatrixData(selectedSectionId, true, true)}
            disabled={refreshing}
            style={ui.btnSecondary}
            title="Refresh Live Matrix"
          >
            <RefreshCw size={13} className={refreshing ? 'animate-spin' : ''} />
            <span>{refreshing ? 'Syncing...' : 'Refresh'}</span>
          </button>
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
          <AlertCircle size={15} />
          <span>{error}</span>
        </div>
      )}

      {/* 2. Search Input & Summary Pills */}
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          gap: 12,
          flexWrap: 'wrap',
        }}
      >
        <div style={{ position: 'relative', width: '100%', maxWidth: 280 }}>
          <Search
            size={14}
            color={tokens.textMuted}
            style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)' }}
          />
          <input
            type="text"
            maxLength={50}
            placeholder="Search student name or LRN..."
            value={search}
            onChange={(e) => setSearch(e.target.value.replace(/[\u0000-\u001F\u007F<>]/g, ''))}
            style={{ ...ui.input, paddingLeft: 32 }}
          />
        </div>

        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <span style={ui.badge(tokens.successLight, brand.success)}>
            {summaryMetrics.complete} Complete Attendance Today
          </span>
          {summaryMetrics.cutting > 0 && (
            <span style={ui.badge(tokens.dangerLight, brand.danger)}>
              {summaryMetrics.cutting} Cutting Class Alert{summaryMetrics.cutting === 1 ? '' : 's'}
            </span>
          )}
        </div>
      </div>

      {/* 3. Cross-Subject Attendance Matrix Table */}
      <div style={{ ...ui.card, padding: 0, overflowX: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', minWidth: 860 }}>
          <thead>
            <tr>
              <th style={{ ...ui.th, width: 44, textAlign: 'center' }}>#</th>
              <th style={{ ...ui.th, width: 230 }}>Student</th>
              <th style={{ ...ui.th, width: 155 }}>First Scan Today</th>
              {schedules.map((sched) => (
                <th key={sched.schedule_id} style={{ ...ui.th, textAlign: 'center', textTransform: 'none' }}>
                  <div style={{ fontWeight: 800, fontSize: fonts.size.sm, color: brand.primary }}>
                    {sched.subject_code}
                  </div>
                  <div style={{ fontSize: '0.64rem', color: tokens.textMuted, fontWeight: 600 }}>
                    {sched.time_window || 'Scheduled'}
                  </div>
                  <div style={{ fontSize: '0.62rem', color: tokens.textSecondary, fontWeight: 500 }}>
                    {sched.teacher_name}
                  </div>
                </th>
              ))}
              <th style={{ ...ui.th, width: 115, textAlign: 'center' }}>Periods</th>
            </tr>
          </thead>
          <tbody>
            {filteredMatrix.length > 0 ? (
              filteredMatrix.map((row) => (
                <tr
                  key={row.student_id}
                  style={{
                    backgroundColor: row.cutting_count > 0 ? tokens.dangerLight : 'transparent',
                  }}
                >
                  <td
                    style={{
                      ...ui.td,
                      textAlign: 'center',
                      fontWeight: 800,
                      color: tokens.textMuted,
                      fontFamily: fonts.mono,
                    }}
                  >
                    {row.number}
                  </td>

                  <td style={ui.td}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                      <ProfileAvatar
                        photoUrl={row.photo_url}
                        name={row.student_name}
                        size={32}
                        iconSize={15}
                      />
                      <div style={{ minWidth: 0 }}>
                        <strong style={{ fontSize: fonts.size.base, color: tokens.textPrimary, display: 'block' }}>
                          {row.student_name}
                        </strong>
                        <span style={{ fontSize: fonts.size.xs, color: tokens.textMuted, fontFamily: fonts.mono }}>
                          LRN: {row.lrn}
                        </span>
                      </div>
                    </div>
                  </td>

                  <td style={ui.td}>
                    <span
                      style={{
                        fontSize: fonts.size.xs,
                        fontWeight: 700,
                        color: row.presence_state === 'ACTIVE' ? brand.success : tokens.textMuted,
                      }}
                    >
                      {row.campus_status}
                    </span>
                  </td>

                  {row.subjects.map((sub) => (
                    <td key={sub.schedule_id} style={{ ...ui.td, textAlign: 'center' }}>
                      {renderStatusPill(sub.status, sub.time)}
                    </td>
                  ))}

                  <td style={{ ...ui.td, textAlign: 'center' }}>
                    <div
                      style={{
                        fontSize: fonts.size.sm,
                        fontWeight: 800,
                        color:
                          row.total_subjects === 0
                            ? tokens.textMuted
                            : row.compliance_rate >= 80
                            ? brand.success
                            : brand.danger,
                      }}
                    >
                      {row.attended_count} / {row.total_subjects}
                    </div>
                    <div style={{ fontSize: '0.64rem', color: tokens.textMuted }}>
                      {row.compliance_rate}% Attended
                    </div>
                  </td>
                </tr>
              ))
            ) : (
              <tr>
                <td
                  colSpan={4 + schedules.length}
                  style={{
                    padding: 36,
                    textAlign: 'center',
                    color: tokens.textMuted,
                    fontSize: fonts.size.base,
                  }}
                >
                  No students match the selected filter.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
};

const pillStyle = (bg: string, color: string): React.CSSProperties => ({
  display: 'inline-flex',
  alignItems: 'center',
  gap: 4,
  padding: '2px 8px',
  borderRadius: 6,
  fontSize: '0.66rem',
  fontWeight: 700,
  backgroundColor: bg,
  color,
});

export default AdvisorySubjectMonitor;
