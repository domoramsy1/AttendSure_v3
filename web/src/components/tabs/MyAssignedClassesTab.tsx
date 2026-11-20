/**
 * AttendSure - My Classes & Student Attendance List
 * File: web/src/components/tabs/MyAssignedClassesTab.tsx
 */

import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import apiClient, { peekApiCache } from '../../api/client';
import { API_ROUTES, extractApiError } from '../../api/routes';
import { useTheme } from '../../context/ThemeContext';
import { useSchool } from '../../context/SchoolContext';
import { useAlert } from '../../context/AlertContext';
import { isSafeImageUrl } from '../../theme/tokens';
import { StatsCard } from '../common/StatsCard';
import { ProfileAvatar } from '../common/ProfileAvatar';
import { QrCodeSvg } from '../common/QrCodeSvg';
import { exportToCsv } from '../common/Pagination';
import { ControlSwitch } from '../ui/ControlSwitch';
import { Modal } from '../ui/Modal';
import { Button } from '../ui/Button';
import {
  Search,
  RefreshCw,
  CreditCard,
  Clock,
  Download,
  Copy,
  Check,
  Phone,
  QrCode,
  MapPin,
  AlertCircle,
  Printer,
  ShieldCheck,
  BookOpen,
  UserCheck,
  Trash2,
} from 'lucide-react';

export interface StudentItem {
  id: number;
  lrn: string;
  name: string;
  gender: string;
  photo_url?: string | null;
  attendance_status: string;
  attendance_record_id?: number | null;
  parent_contact?: string;
  qr_token?: string;
  qr_payload?: string;
}

const sanitizeInput = (raw: string, maxLength = 60): string =>
  String(raw || '')
    .replace(/[\u0000-\u001F\u007F<>]/g, '')
    .trim()
    .slice(0, maxLength);

export interface AssignedClass {
  schedule_id: number;
  section_id: number;
  section_name: string;
  grade_level?: string;
  display_name: string;
  subject_code: string;
  subject_title: string;
  start_time: string;
  end_time: string;
  time_display?: string;
  room_number?: string;
  total_students: number;
  students: StudentItem[];
  is_adviser?: boolean;
}

type ViewScope = 'MY_CLASSES' | 'ALL_CLASSES';
type StatusFilter = 'ALL' | 'PRESENT' | 'LATE' | 'CUTTING' | 'UNSCANNED';

const copyTextSafely = async (textToCopy: string): Promise<boolean> => {
  const cleanText = String(textToCopy || '').trim();
  if (!cleanText) return false;

  if (typeof navigator !== 'undefined' && navigator.clipboard?.writeText) {
    try {
      await navigator.clipboard.writeText(cleanText);
      return true;
    } catch {
      // Fall through to legacy copy helper on non-HTTPS LAN origins
    }
  }

  if (typeof document !== 'undefined') {
    const textArea = document.createElement('textarea');
    textArea.value = cleanText;
    textArea.setAttribute('readonly', '');
    textArea.style.position = 'fixed';
    textArea.style.top = '-9999px';
    document.body.appendChild(textArea);
    textArea.select();
    let copied = false;
    try {
      copied = document.execCommand('copy');
    } catch {
      copied = false;
    }
    document.body.removeChild(textArea);
    return copied;
  }
  return false;
};

const extractGradeLevelText = (val: unknown): string => {
  if (val === null || val === undefined) return '';
  if (typeof val === 'string') return val.trim();
  if (typeof val === 'number') return `Grade ${val}`;
  if (typeof val === 'object') {
    const obj = val as Record<string, unknown>;
    const label = obj.name ?? obj.level ?? obj.grade_name ?? obj.grade;
    return label ? String(label).trim() : '';
  }
  return String(val).trim();
};

const maskQrToken = (token?: string): string => {
  const clean = String(token || '').trim();
  if (!clean) return '';
  return clean.length <= 4 ? 'Linked' : `••••${clean.slice(-4)}`;
};

const formatStatusLabel = (status: string): string => {
  const code = status.toUpperCase();
  if (code === 'UNSCANNED') return 'NOT SCANNED';
  return code;
};

export const MyAssignedClassesTab: React.FC = () => {
  const { tokens, brand, fonts, ui } = useTheme();
  const { school } = useSchool();
  const { showAlert, showConfirm } = useAlert();

  const [classes, setClasses] = useState<AssignedClass[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [refreshing, setRefreshing] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [selectedClass, setSelectedClass] = useState<AssignedClass | null>(null);

  const [searchQuery, setSearchQuery] = useState<string>('');
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('ALL');
  const [viewScope, setViewScope] = useState<ViewScope>('MY_CLASSES');
  const [copiedValue, setCopiedValue] = useState<string | null>(null);
  const [badgeStudent, setBadgeStudent] = useState<StudentItem | null>(null);
  const [savingStudentId, setSavingStudentId] = useState<number | null>(null);

  const userRole = useMemo(
    () => String(localStorage.getItem('attendsure_role') || 'FACULTY').toUpperCase(),
    []
  );
  const isAdmin = ['ADMIN', 'SUPERADMIN', 'FACULTY_ADMIN', 'PRINCIPAL'].includes(userRole);
  const canEditAttendance = userRole !== 'PARENT';

  const abortRef = useRef<AbortController | null>(null);
  const copyTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const isInteracting = useRef<boolean>(false);
  isInteracting.current = Boolean(badgeStudent);

  const normalizeClassList = useCallback((rawPayload: unknown): AssignedClass[] => {
    const rawData: Record<string, unknown>[] = Array.isArray(rawPayload)
      ? rawPayload
      : Array.isArray((rawPayload as { results?: Record<string, unknown>[] })?.results)
        ? ((rawPayload as { results: Record<string, unknown>[] }).results)
        : [];

    return rawData.map((item, idx) => {
      const rawStudents = Array.isArray(item.students) ? item.students : [];
      const students: StudentItem[] = rawStudents.map((st: Record<string, unknown>) => {
        const rawPhoto = (st.photo_url || st.photo) as string | null | undefined;
        const fullName =
          String(st.name || st.full_name || '').trim() ||
          `${String(st.first_name || '')} ${String(st.last_name || '')}`.trim() ||
          'Student';

        return {
          id: Number(st.id) || 0,
          lrn: String(st.lrn || '—').trim(),
          name: fullName,
          gender: String(st.sex || st.gender || '—').trim(),
          photo_url: isSafeImageUrl(rawPhoto) ? rawPhoto : null,
          attendance_status: String(st.attendance_status || 'UNSCANNED').toUpperCase(),
          attendance_record_id: st.attendance_record_id ? Number(st.attendance_record_id) : null,
          parent_contact: String(st.parent_contact || '').trim(),
          qr_token: String(st.qr_token || '').trim(),
          qr_payload: String(st.qr_payload || '').trim() || undefined,
        };
      });

      const sectionName = String(item.section_name || item.name || 'Section').trim();
      const subjectTitle = String(item.subject_title || item.subject_name || 'Homeroom').trim();
      const startTime = item.start_time ? String(item.start_time).slice(0, 5) : '';
      const endTime = item.end_time ? String(item.end_time).slice(0, 5) : '';
      const timeDisplay =
        String(item.time_display || '').trim() ||
        (startTime && endTime ? `${startTime} - ${endTime}` : 'Homeroom');
      const roomVal = String(item.room_number || item.room || '').trim();

      return {
        schedule_id: Number(item.schedule_id || item.id || idx + 1),
        section_id: Number(item.section_id || idx + 1),
        section_name: sectionName,
        grade_level: extractGradeLevelText(item.grade_level),
        display_name: String(item.display_name || `${sectionName} • ${subjectTitle}`),
        subject_code: String(item.subject_code || 'CLASS'),
        subject_title: subjectTitle,
        start_time: startTime,
        end_time: endTime,
        time_display: timeDisplay,
        room_number: roomVal || '—',
        total_students: students.length || Number(item.total_students) || 0,
        students,
        is_adviser: Boolean(item.is_adviser),
      };
    });
  }, []);

  const applyNormalizedClasses = useCallback((normalized: AssignedClass[]) => {
    setClasses(normalized);
    setSelectedClass((prev) => {
      if (normalized.length === 0) return null;
      if (!prev) return normalized[0];
      return (
        normalized.find(
          (c) => c.schedule_id === prev.schedule_id && c.section_id === prev.section_id
        ) ||
        normalized.find((c) => c.section_id === prev.section_id) ||
        normalized[0]
      );
    });
  }, []);

  const fetchClasses = useCallback(
    async (silent = false, bypassCache = false) => {
      abortRef.current?.abort();
      const controller = new AbortController();
      abortRef.current = controller;

      const baseParams: Record<string, string | number> = {};
      if (viewScope === 'ALL_CLASSES') baseParams.mode = 'all';

      const cached = !bypassCache
        ? peekApiCache(API_ROUTES.attendance.classes, Object.keys(baseParams).length ? baseParams : undefined)
        : undefined;
      if (cached !== undefined) {
        applyNormalizedClasses(normalizeClassList(cached));
        setLoading(false);
        if (silent) setRefreshing(true);
      } else if (!silent) {
        setLoading(true);
      } else {
        setRefreshing(true);
      }
      setError(null);

      try {
        const params: Record<string, string | number> = { ...baseParams };
        if (bypassCache) params.nocache = 1;

        const res = await apiClient.get(API_ROUTES.attendance.classes, {
          params,
          signal: controller.signal,
        });
        if (controller.signal.aborted) return;

        applyNormalizedClasses(normalizeClassList(res.data));
      } catch (err: unknown) {
        const anyErr = err as { name?: string; code?: string };
        if (controller.signal.aborted || anyErr?.name === 'CanceledError' || anyErr?.code === 'ERR_CANCELED') {
          return;
        }
        if (!silent) {
          setError(extractApiError(err, 'Could not load your assigned classes.'));
        }
      } finally {
        if (!controller.signal.aborted) {
          setLoading(false);
          setRefreshing(false);
        }
      }
    },
    [viewScope, normalizeClassList, applyNormalizedClasses]
  );

  useEffect(() => {
    void fetchClasses(false, false);
    return () => {
      abortRef.current?.abort();
    };
  }, [fetchClasses]);

  useEffect(() => {
    return () => {
      if (copyTimerRef.current) {
        clearTimeout(copyTimerRef.current);
        copyTimerRef.current = null;
      }
    };
  }, []);

  useEffect(() => {
    const liveInterval = setInterval(() => {
      if (!isInteracting.current && document.visibilityState === 'visible') {
        void fetchClasses(true, true);
      }
    }, 15000);
    return () => clearInterval(liveInterval);
  }, [fetchClasses]);

  const handleCopy = async (val: string) => {
    if (!val || val === '—') return;
    const ok = await copyTextSafely(val);
    if (ok) {
      setCopiedValue(val);
      if (copyTimerRef.current) clearTimeout(copyTimerRef.current);
      copyTimerRef.current = setTimeout(() => {
        setCopiedValue((prev) => (prev === val ? null : prev));
        copyTimerRef.current = null;
      }, 2000);
    }
  };

  const cleanSearch = useMemo(() => sanitizeInput(searchQuery, 60).toLowerCase(), [searchQuery]);

  const filteredStudents = useMemo(() => {
    if (!selectedClass) return [];
    return selectedClass.students.filter((st) => {
      if (statusFilter !== 'ALL') {
        if (statusFilter === 'CUTTING') {
          if (st.attendance_status !== 'CUTTING' && st.attendance_status !== 'ABSENT') return false;
        } else if (st.attendance_status !== statusFilter) {
          return false;
        }
      }
      if (!cleanSearch) return true;
      return st.name.toLowerCase().includes(cleanSearch) || st.lrn.toLowerCase().includes(cleanSearch);
    });
  }, [selectedClass, statusFilter, cleanSearch]);

  const stats = useMemo(() => {
    const studentsList = selectedClass?.students || [];
    const classTotal = studentsList.length;
    const inClassToday = studentsList.filter(
      (s) => s.attendance_status === 'PRESENT' || s.attendance_status === 'LATE'
    ).length;
    const cardsLinked = studentsList.filter((s) => Boolean(s.qr_token)).length;
    return {
      totalClasses: classes.length,
      classTotal,
      inClassToday,
      cardsLinked,
    };
  }, [classes.length, selectedClass]);

  const handleExportCsv = () => {
    if (!selectedClass || filteredStudents.length === 0) return;
    exportToCsv(
      `AttendSure_ClassList_${selectedClass.section_name}_${new Date().toISOString().slice(0, 10)}.csv`,
      [
        'LRN',
        'Student Name',
        'Sex',
        'Section',
        'Subject',
        'QR Card Status',
        'Parent Contact',
        'Attendance Today',
      ],
      filteredStudents.map((st) => [
        st.lrn,
        st.name,
        st.gender,
        selectedClass.section_name,
        selectedClass.subject_title,
        st.qr_token ? 'Linked' : 'Not Linked',
        st.parent_contact || '',
        formatStatusLabel(st.attendance_status),
      ])
    );
  };

  const handleManualAttendanceChange = async (st: StudentItem, nextStatus: string) => {
    if (!selectedClass || savingStudentId === st.id) return;
    setSavingStudentId(st.id);
    try {
      const periodId = selectedClass.subject_code === 'ADV' ? undefined : selectedClass.schedule_id;
      if (st.attendance_record_id) {
        await apiClient.put(API_ROUTES.attendance.records, {
          id: st.attendance_record_id,
          status: nextStatus,
        });
      } else {
        await apiClient.post(API_ROUTES.attendance.records, {
          student_id: st.id,
          schedule_id: periodId,
          status: nextStatus,
        });
      }
      await fetchClasses(true, true);
    } catch (err: unknown) {
      showAlert({
        title: 'Attendance Update Failed',
        message: extractApiError(err, 'Could not save attendance status.'),
        type: 'error',
      });
    } finally {
      setSavingStudentId(null);
    }
  };

  const handleClearAttendance = (st: StudentItem) => {
    if (!st.attendance_record_id) return;
    showConfirm({
      title: 'Clear Attendance Record',
      message: `Remove today's attendance entry for ${st.name}?`,
      confirmLabel: 'Remove',
      isDestructive: true,
      onConfirm: async () => {
        setSavingStudentId(st.id);
        try {
          await apiClient.delete(API_ROUTES.attendance.records, {
            params: { id: st.attendance_record_id },
          });
          await fetchClasses(true, true);
        } catch (err: unknown) {
          showAlert({
            title: 'Remove Failed',
            message: extractApiError(err, 'Could not remove attendance record.'),
            type: 'error',
          });
        } finally {
          setSavingStudentId(null);
        }
      },
    });
  };

  const renderStatusPill = (rawStatus: string) => {
    const status = rawStatus.toUpperCase();
    if (status === 'PRESENT') {
      return (
        <span style={statusBadgeStyle(tokens.successLight, brand.success)}>
          PRESENT
        </span>
      );
    }
    if (status === 'LATE') {
      return (
        <span style={statusBadgeStyle(tokens.warningLight, brand.warning)}>
          LATE
        </span>
      );
    }
    if (status === 'CUTTING' || status === 'ABSENT') {
      return (
        <span style={statusBadgeStyle(tokens.dangerLight, brand.danger)}>
          {status}
        </span>
      );
    }
    return (
      <span style={statusBadgeStyle(tokens.bgSurfaceSubtle, tokens.textMuted)}>
        NOT SCANNED
      </span>
    );
  };

  const activeSchoolName = school.school_name || 'Official School Pass';

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16, padding: 'clamp(12px, 2vw, 20px)' }}>
      {/* 1. Summary KPI Cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(210px, 1fr))', gap: 12 }}>
        <StatsCard
          label="ASSIGNED CLASSES"
          value={stats.totalClasses}
          helpText="Active class periods in your schedule"
          badge={<BookOpen size={18} color={brand.primary} />}
        />
        <StatsCard
          label="CLASS LIST"
          value={stats.classTotal}
          valueColor={brand.success}
          helpText="Enrolled students in selected class"
          badge={<UserCheck size={18} color={brand.success} />}
        />
        <StatsCard
          label="IN CLASS TODAY"
          value={`${stats.inClassToday} / ${stats.classTotal}`}
          valueColor={brand.primary}
          helpText="Present and late QR scans today"
          badge={<Clock size={18} color={brand.primary} />}
        />
        <StatsCard
          label="QR CARDS LINKED"
          value={`${stats.cardsLinked} / ${stats.classTotal}`}
          valueColor={brand.secondary}
          helpText="Students with active QR ID cards"
          badge={<CreditCard size={18} color={brand.secondary} />}
        />
      </div>

      {/* 2. Class Selector & View Controls */}
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
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
          <select
            aria-label="Select assigned class"
            value={selectedClass ? `${selectedClass.schedule_id}:${selectedClass.section_id}` : ''}
            onChange={(e) => {
              const found = classes.find(
                (c) => `${c.schedule_id}:${c.section_id}` === e.target.value
              );
              if (found) {
                setSelectedClass(found);
                setSearchQuery('');
                setStatusFilter('ALL');
              }
            }}
            style={{ ...ui.input, width: 'auto', minWidth: 260, fontWeight: 700, cursor: 'pointer' }}
          >
            {classes.length === 0 && <option value="">No classes available</option>}
            {classes.map((c, idx) => (
              <option
                key={`cls-${c.schedule_id}-${c.section_id}-${idx}`}
                value={`${c.schedule_id}:${c.section_id}`}
              >
                {c.grade_level ? `${c.grade_level} - ` : ''}
                {c.section_name} &bull; {c.subject_title} ({c.total_students}){' '}
                {c.is_adviser ? '★ Adviser' : ''}
              </option>
            ))}
          </select>

          {isAdmin && (
            <ControlSwitch<ViewScope>
              options={[
                { value: 'MY_CLASSES', label: 'My Classes' },
                { value: 'ALL_CLASSES', label: 'All School Classes' },
              ]}
              value={viewScope}
              onChange={setViewScope}
              size="sm"
              ariaLabel="Class Scope"
            />
          )}
        </div>

        <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
          <button
            type="button"
            onClick={handleExportCsv}
            disabled={!selectedClass || filteredStudents.length === 0}
            style={ui.btnSecondary}
          >
            <Download size={14} />
            <span>Export CSV ({filteredStudents.length})</span>
          </button>

          <button
            type="button"
            onClick={() => fetchClasses(true, true)}
            disabled={loading || refreshing}
            style={ui.btnPrimary}
          >
            <RefreshCw size={14} className={refreshing ? 'animate-spin' : ''} />
            <span>{refreshing ? 'Refreshing...' : 'Refresh Class List'}</span>
          </button>
        </div>
      </div>

      {/* 3. Main Class List Table Card */}
      <div style={{ ...ui.card, padding: '18px 20px' }}>
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'flex-start',
            flexWrap: 'wrap',
            gap: 12,
            marginBottom: 14,
          }}
        >
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
              <h3 style={{ margin: 0, fontSize: fonts.size.lg, fontWeight: 800, color: tokens.textPrimary }}>
                {selectedClass
                  ? `${selectedClass.section_name} • ${selectedClass.subject_title}`
                  : 'Assigned Classes'}
              </h3>
              {selectedClass?.is_adviser && (
                <span style={ui.badge(tokens.primaryLight, brand.primary)}>Class Adviser</span>
              )}
            </div>
            <p style={{ margin: '4px 0 0', fontSize: fonts.size.sm, color: tokens.textSecondary }}>
              {selectedClass
                ? `${selectedClass.grade_level ? `${selectedClass.grade_level} • ` : ''}Room: ${selectedClass.room_number} • Time: ${selectedClass.time_display}`
                : 'View enrolled students, check today’s classroom attendance, and print student QR ID cards.'}
            </p>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
            <ControlSwitch<StatusFilter>
              options={[
                { value: 'ALL', label: 'All' },
                { value: 'PRESENT', label: 'Present' },
                { value: 'LATE', label: 'Late' },
                { value: 'CUTTING', label: 'Absent / Cutting' },
                { value: 'UNSCANNED', label: 'Not Scanned' },
              ]}
              value={statusFilter}
              onChange={setStatusFilter}
              size="sm"
              ariaLabel="Attendance Status Filter"
            />

            <div style={{ position: 'relative', width: 240 }}>
              <Search
                size={14}
                color={tokens.textMuted}
                style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)' }}
              />
              <input
                type="text"
                maxLength={60}
                placeholder="Search student or LRN..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                style={{ ...ui.input, paddingLeft: 32 }}
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
              marginBottom: 14,
              fontWeight: 600,
            }}
          >
            <AlertCircle size={16} />
            <span>{error}</span>
          </div>
        )}

        {loading ? (
          <div style={{ padding: '44px 0', textAlign: 'center', color: tokens.textMuted }}>
            <RefreshCw
              size={26}
              className="animate-spin"
              color={brand.primary}
              style={{ margin: '0 auto 8px', display: 'block' }}
            />
            <span style={{ fontSize: fonts.size.base, fontWeight: 600 }}>Loading class list...</span>
          </div>
        ) : classes.length === 0 ? (
          <div style={{ padding: '44px 0', textAlign: 'center' }}>
            <BookOpen size={38} color={tokens.textMuted} style={{ margin: '0 auto 8px', display: 'block' }} />
            <div style={{ fontWeight: 800, color: tokens.textPrimary, fontSize: fonts.size.md }}>
              No Assigned Classes Found
            </div>
            <p style={{ margin: '4px 0 0', fontSize: fonts.size.sm, color: tokens.textMuted }}>
              No class schedules or advisory sections are linked to your profile yet.
            </p>
          </div>
        ) : filteredStudents.length === 0 ? (
          <div style={{ padding: '36px 0', textAlign: 'center', color: tokens.textMuted, fontSize: fonts.size.base }}>
            No students match the selected filter.
          </div>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', minWidth: 720, borderCollapse: 'collapse', textAlign: 'left' }}>
              <thead>
                <tr>
                  <th style={ui.th}>Student</th>
                  <th style={ui.th}>LRN</th>
                  <th style={ui.th}>Room &amp; Time</th>
                  <th style={ui.th}>QR ID Card</th>
                  <th style={ui.th}>Parent Contact</th>
                  <th style={ui.th}>Attendance Today</th>
                  <th style={{ ...ui.th, textAlign: 'right' }}>ID Card</th>
                </tr>
              </thead>
              <tbody>
                {filteredStudents.map((st) => (
                  <tr key={st.id || st.lrn}>
                    <td style={ui.td}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                        <ProfileAvatar photoUrl={st.photo_url} name={st.name} size={36} iconSize={17} />
                        <div>
                          <div style={{ fontWeight: 800, color: tokens.textPrimary, fontSize: fonts.size.base }}>
                            {st.name}
                          </div>
                          <div style={{ fontSize: fonts.size.xs, color: tokens.textMuted, marginTop: 1 }}>
                            {st.gender}
                            {selectedClass?.grade_level ? ` • ${selectedClass.grade_level}` : ''}
                          </div>
                        </div>
                      </div>
                    </td>

                    <td style={ui.td}>
                      <div
                        style={{
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: 6,
                          padding: '3px 8px',
                          backgroundColor: tokens.bgSurfaceSubtle,
                          borderWidth: 1,
                          borderStyle: 'solid',
                          borderColor: tokens.borderSubtle,
                          borderRadius: 6,
                          fontFamily: fonts.mono,
                          fontSize: fonts.size.sm,
                          fontWeight: 700,
                          color: tokens.textPrimary,
                        }}
                      >
                        <span>{st.lrn}</span>
                        <button
                          type="button"
                          onClick={() => handleCopy(st.lrn)}
                          title="Copy LRN"
                          aria-label={`Copy LRN ${st.lrn}`}
                          style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 0, display: 'flex' }}
                        >
                          {copiedValue === st.lrn ? (
                            <Check size={12} color={brand.success} />
                          ) : (
                            <Copy size={12} color={tokens.textMuted} />
                          )}
                        </button>
                      </div>
                    </td>

                    <td style={ui.td}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 5, fontWeight: 700, color: tokens.textPrimary, fontSize: fonts.size.sm }}>
                        <MapPin size={13} color={brand.primary} />
                        <span>{selectedClass?.room_number || '—'}</span>
                      </div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: fonts.size.xs, color: tokens.textMuted, marginTop: 2 }}>
                        <Clock size={11} />
                        <span>{selectedClass?.time_display || 'Homeroom'}</span>
                      </div>
                    </td>

                    <td style={ui.td}>
                      {st.qr_token ? (
                        <span
                          style={{
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: 5,
                            fontSize: fonts.size.sm,
                            fontWeight: 700,
                            color: brand.success,
                            fontFamily: fonts.mono,
                          }}
                        >
                          <CreditCard size={13} />
                          <span>{maskQrToken(st.qr_token)}</span>
                        </span>
                      ) : (
                        <span
                          style={{
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: 5,
                            fontSize: fonts.size.sm,
                            color: tokens.textMuted,
                          }}
                        >
                          <CreditCard size={13} />
                          <span>Not Linked</span>
                        </span>
                      )}
                    </td>

                    <td style={ui.td}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: fonts.size.sm, color: tokens.textSecondary }}>
                        <Phone size={13} color={tokens.textMuted} />
                        <span>{st.parent_contact || '—'}</span>
                      </div>
                    </td>

                    <td style={ui.td}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                        {renderStatusPill(st.attendance_status)}
                        {canEditAttendance && (
                          <select
                            aria-label={`Set attendance status for ${st.name}`}
                            disabled={savingStudentId === st.id}
                            value={st.attendance_status === 'UNSCANNED' ? '' : st.attendance_status}
                            onChange={(e) => {
                              if (e.target.value) void handleManualAttendanceChange(st, e.target.value);
                            }}
                            style={{
                              ...ui.input,
                              width: 'auto',
                              padding: '3px 6px',
                              fontSize: '0.70rem',
                              fontWeight: 700,
                              cursor: 'pointer',
                            }}
                          >
                            <option value="">Mark...</option>
                            <option value="PRESENT">Present</option>
                            <option value="LATE">Late</option>
                            <option value="ABSENT">Absent</option>
                            <option value="EXCUSED">Excused</option>
                            <option value="CUTTING">Cutting</option>
                          </select>
                        )}
                        {canEditAttendance && st.attendance_record_id && (
                          <button
                            type="button"
                            disabled={savingStudentId === st.id}
                            onClick={() => handleClearAttendance(st)}
                            title="Clear today's attendance record"
                            aria-label={`Clear attendance record for ${st.name}`}
                            style={{
                              background: 'none',
                              border: 'none',
                              cursor: 'pointer',
                              color: brand.danger,
                              padding: 2,
                              display: 'inline-flex',
                            }}
                          >
                            <Trash2 size={12} />
                          </button>
                        )}
                      </div>
                    </td>

                    <td style={{ ...ui.td, textAlign: 'right' }}>
                      <button
                        type="button"
                        onClick={() => setBadgeStudent(st)}
                        title="View or Print Student QR ID Card"
                        aria-label={`Open QR ID card for ${st.name}`}
                        style={{ ...ui.btnSecondary, padding: '6px 8px' }}
                      >
                        <QrCode size={14} color={brand.primary} />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* 4. Student QR ID Card Modal */}
      {badgeStudent && (
        <Modal
          isOpen={Boolean(badgeStudent)}
          onClose={() => setBadgeStudent(null)}
          title="Student QR ID Card"
        >
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', textAlign: 'center' }}>
            <div
              style={{
                width: 296,
                backgroundColor: tokens.bgSurface,
                borderWidth: 2,
                borderStyle: 'solid',
                borderColor: brand.primary,
                borderRadius: 14,
                overflow: 'hidden',
                boxShadow: tokens.cardShadow,
              }}
            >
              <div style={{ backgroundColor: brand.buttonBg, color: '#ffffff', padding: '12px 14px' }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 5, fontSize: fonts.size.xs, fontWeight: 800 }}>
                  <ShieldCheck size={14} />
                  <span>OFFICIAL STUDENT QR ID</span>
                </div>
                <div style={{ fontSize: '0.64rem', opacity: 0.9, marginTop: 2 }}>{activeSchoolName}</div>
              </div>

              <div style={{ padding: '16px 14px' }}>
                <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 10 }}>
                  <ProfileAvatar photoUrl={badgeStudent.photo_url} name={badgeStudent.name} size={56} iconSize={26} />
                </div>

                <div style={{ fontSize: fonts.size.md, fontWeight: 800, color: tokens.textPrimary }}>
                  {badgeStudent.name}
                </div>
                <div style={{ fontSize: fonts.size.sm, color: tokens.textSecondary, marginTop: 2 }}>
                  {selectedClass?.grade_level ? `${selectedClass.grade_level} - ` : ''}
                  {selectedClass?.section_name || 'Enrolled Student'}
                </div>

                <button
                  type="button"
                  onClick={() => handleCopy(badgeStudent.lrn)}
                  style={{ ...ui.btnSecondary, margin: '10px auto', fontFamily: fonts.mono }}
                  title="Copy LRN"
                >
                  <span>LRN: {badgeStudent.lrn}</span>
                  {copiedValue === badgeStudent.lrn ? (
                    <Check size={12} color={brand.success} />
                  ) : (
                    <Copy size={12} color={tokens.textMuted} />
                  )}
                </button>

                <div
                  style={{
                    margin: '6px auto',
                    padding: 6,
                    backgroundColor: '#ffffff',
                    borderWidth: 1,
                    borderStyle: 'solid',
                    borderColor: tokens.borderSubtle,
                    borderRadius: 10,
                    width: 124,
                    height: 124,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                  }}
                >
                  <QrCodeSvg
                    value={badgeStudent.qr_payload || badgeStudent.lrn}
                    size={112}
                    label={`QR code for ${badgeStudent.name}`}
                  />
                </div>
              </div>

              <div
                style={{
                  backgroundColor: tokens.bgSurfaceSubtle,
                  borderTopWidth: 1,
                  borderTopStyle: 'solid',
                  borderTopColor: tokens.borderSubtle,
                  padding: '8px 12px',
                  fontSize: fonts.size.xs,
                  color: tokens.textSecondary,
                }}
              >
                Card Status:{' '}
                <strong style={{ color: badgeStudent.qr_token ? brand.success : brand.warning }}>
                  {badgeStudent.qr_token ? `Active (${maskQrToken(badgeStudent.qr_token)})` : 'LRN Mode'}
                </strong>
              </div>
            </div>

            <div style={{ display: 'flex', gap: 10, marginTop: 14 }}>
              <Button variant="secondary" size="md" type="button" onClick={() => setBadgeStudent(null)}>
                Close
              </Button>
              <Button variant="primary" size="md" type="button" onClick={() => window.print()}>
                <Printer size={14} /> Print ID Card
              </Button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
};

const statusBadgeStyle = (bg: string, color: string): React.CSSProperties => ({
  display: 'inline-flex',
  alignItems: 'center',
  padding: '3px 10px',
  borderRadius: 9999,
  borderWidth: 1,
  borderStyle: 'solid',
  borderColor: color,
  backgroundColor: bg,
  color,
  fontSize: '0.68rem',
  fontWeight: 800,
});

export default MyAssignedClassesTab;