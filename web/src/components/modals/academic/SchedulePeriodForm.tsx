/**
 * AttendSure - Class Period & Subject Teacher Schedule CRUD Sub-Form
 * File: web/src/components/modals/academic/SchedulePeriodForm.tsx
 */

import React, { useEffect, useRef, useState } from 'react';
import apiClient from '../../../api/client';
import { API_ROUTES, extractApiError } from '../../../api/routes';
import { useTheme } from '../../../context/ThemeContext';
import { Button } from '../../ui/Button';
import { AlertCircle, CheckCircle2, Edit2, Loader2, Trash2 } from 'lucide-react';
import {
  DAY_SCHEDULE_OPTIONS,
  extractTeacherId,
  extractTeacherName,
  formCardStyle,
  inputStyle,
  labelStyle,
  sanitizeAcademicField,
  tableContainerStyle,
  type AcademicScheduleItem,
  type AcademicSectionItem,
  type AcademicSubjectItem,
  type AcademicTeacherOption,
} from './academicShared';

export interface ScheduleFormState {
  id: number | null;
  section_id: string;
  subject_id: string;
  teacher_id: string;
  room_id: string;
  start_time: string;
  end_time: string;
  days_of_week: string;
}

const EMPTY_SCHEDULE_FORM: ScheduleFormState = {
  id: null,
  section_id: '',
  subject_id: '',
  teacher_id: '',
  room_id: '',
  start_time: '07:30',
  end_time: '08:30',
  days_of_week: 'ALL_WEEKDAYS',
};

const EMPTY_PERIOD_CONFLICT = {
  checking: false,
  has_conflict: false,
  time_error: null as string | null,
  section_conflict: null as string | null,
  teacher_conflict: null as string | null,
  room_conflict: null as string | null,
};

interface SchedulePeriodFormProps {
  isOpen: boolean;
  initialEditItem?: AcademicScheduleItem | null;
  sections: AcademicSectionItem[];
  subjects: AcademicSubjectItem[];
  schedules: AcademicScheduleItem[];
  teacherList: AcademicTeacherOption[];
  teachingTeachers: AcademicTeacherOption[];
  onReload: () => Promise<void>;
  onDelete: (route: string, id: number, label: string) => void;
  onStatus: (error: string | null, success: string | null) => void;
}

const mapPeriodToForm = (item: AcademicScheduleItem): ScheduleFormState => {
  const secId =
    item.section_id ?? (typeof item.section === 'object' && item.section ? item.section.id : item.section) ?? '';
  const subId =
    item.subject_id ?? (typeof item.subject === 'object' && item.subject ? item.subject.id : item.subject) ?? '';
  const roomId = item.room_id ?? (typeof item.room === 'object' && item.room ? item.room.id : item.room) ?? '';

  return {
    id: item.id || null,
    section_id: String(secId || ''),
    subject_id: String(subId || ''),
    teacher_id: extractTeacherId(item),
    room_id: typeof roomId === 'number' || /^\d+$/.test(String(roomId)) ? String(roomId) : '',
    start_time: item.start_time ? String(item.start_time).slice(0, 5) : '07:30',
    end_time: item.end_time ? String(item.end_time).slice(0, 5) : '08:30',
    days_of_week: item.day_of_week || item.days_of_week || 'ALL_WEEKDAYS',
  };
};

export const SchedulePeriodForm: React.FC<SchedulePeriodFormProps> = ({
  isOpen,
  initialEditItem,
  sections,
  subjects,
  schedules,
  teacherList,
  teachingTeachers,
  onReload,
  onDelete,
  onStatus,
}) => {
  const { tokens, brand } = useTheme();
  const [scheduleForm, setScheduleForm] = useState<ScheduleFormState>(() =>
    initialEditItem ? mapPeriodToForm(initialEditItem) : EMPTY_SCHEDULE_FORM
  );
  const [asyncConflict, setAsyncConflict] = useState<{
    key: string;
    state: typeof EMPTY_PERIOD_CONFLICT;
  }>({ key: '', state: EMPTY_PERIOD_CONFLICT });
  const [submitting, setSubmitting] = useState(false);
  const checkAbortRef = useRef<AbortController | null>(null);

  const hasValidRange = Boolean(
    isOpen &&
      scheduleForm.start_time &&
      scheduleForm.end_time &&
      scheduleForm.start_time < scheduleForm.end_time &&
      (scheduleForm.section_id || scheduleForm.teacher_id)
  );
  const conflictKey = hasValidRange
    ? JSON.stringify([
        scheduleForm.id,
        scheduleForm.section_id,
        scheduleForm.subject_id,
        scheduleForm.teacher_id,
        scheduleForm.days_of_week,
        scheduleForm.start_time,
        scheduleForm.end_time,
      ])
    : '';

  useEffect(() => {
    if (!conflictKey) {
      checkAbortRef.current?.abort();
      return;
    }

    const timer = setTimeout(async () => {
      checkAbortRef.current?.abort();
      const controller = new AbortController();
      checkAbortRef.current = controller;
      setAsyncConflict((prev) => ({
        key: conflictKey,
        state: {
          ...(prev.key === conflictKey ? prev.state : EMPTY_PERIOD_CONFLICT),
          checking: true,
          time_error: null,
        },
      }));
      try {
        const res = await apiClient.get(API_ROUTES.school.checkConflict, {
          params: {
            type: 'period',
            section_id: scheduleForm.section_id || undefined,
            subject_id: scheduleForm.subject_id || undefined,
            teacher_id: scheduleForm.teacher_id || undefined,
            day_of_week: scheduleForm.days_of_week || 'ALL_WEEKDAYS',
            start_time: scheduleForm.start_time,
            end_time: scheduleForm.end_time,
            exclude_id: scheduleForm.id || undefined,
            nocache: 1,
          },
          signal: controller.signal,
        });
        if (controller.signal.aborted || !res.data) return;
        setAsyncConflict({
          key: conflictKey,
          state: {
            checking: false,
            has_conflict: Boolean(res.data.has_conflict),
            time_error: res.data.time_error || null,
            section_conflict: res.data.section_conflict || null,
            teacher_conflict: res.data.teacher_conflict || null,
            room_conflict: res.data.room_conflict || null,
          },
        });
      } catch {
        if (!controller.signal.aborted) {
          setAsyncConflict((prev) => ({
            key: conflictKey,
            state: {
              ...(prev.key === conflictKey ? prev.state : EMPTY_PERIOD_CONFLICT),
              checking: false,
            },
          }));
        }
      }
    }, 300);

    return () => {
      clearTimeout(timer);
      checkAbortRef.current?.abort();
    };
  }, [
    conflictKey,
    scheduleForm.id,
    scheduleForm.section_id,
    scheduleForm.subject_id,
    scheduleForm.teacher_id,
    scheduleForm.days_of_week,
    scheduleForm.start_time,
    scheduleForm.end_time,
  ]);

  const periodConflict =
    isOpen &&
    scheduleForm.start_time &&
    scheduleForm.end_time &&
    scheduleForm.start_time >= scheduleForm.end_time
      ? {
          ...EMPTY_PERIOD_CONFLICT,
          has_conflict: true,
          time_error: 'End time must be later than start time.',
        }
      : conflictKey && asyncConflict.key === conflictKey
        ? asyncConflict.state
        : EMPTY_PERIOD_CONFLICT;

  const scheduleBlocked = periodConflict.checking || periodConflict.has_conflict;

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!scheduleForm.section_id) {
      onStatus('Please select a class section.', null);
      return;
    }
    if (!scheduleForm.subject_id) {
      onStatus('Please select a subject.', null);
      return;
    }
    if (scheduleForm.start_time >= scheduleForm.end_time) {
      onStatus('End time must be later than start time.', null);
      return;
    }

    setSubmitting(true);
    onStatus(null, null);

    const teacherPk = scheduleForm.teacher_id ? Number(scheduleForm.teacher_id) : null;
    const payload = {
      section: Number(scheduleForm.section_id),
      section_id: Number(scheduleForm.section_id),
      subject: Number(scheduleForm.subject_id),
      subject_id: Number(scheduleForm.subject_id),
      teacher: teacherPk,
      teacher_id: teacherPk,
      start_time: scheduleForm.start_time,
      end_time: scheduleForm.end_time,
      day_of_week: sanitizeAcademicField(scheduleForm.days_of_week || 'ALL_WEEKDAYS', 30).trim() || 'ALL_WEEKDAYS',
    };

    try {
      if (scheduleForm.id) {
        await apiClient.patch(`${API_ROUTES.school.periods}${scheduleForm.id}/`, payload);
        onStatus(null, 'Class schedule and Subject Teacher updated.');
      } else {
        await apiClient.post(API_ROUTES.school.periods, payload);
        onStatus(null, 'New class period and Subject Teacher saved.');
      }
      setScheduleForm(EMPTY_SCHEDULE_FORM);
      await onReload();
    } catch (err: unknown) {
      onStatus(extractApiError(err, 'Failed to save class schedule.'), null);
    } finally {
      setSubmitting(false);
    }
  };

  const hasTimeError = Boolean(
    periodConflict.time_error || periodConflict.section_conflict || periodConflict.room_conflict
  );

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      <form onSubmit={handleSave} style={formCardStyle(tokens)}>
        <div style={{ fontSize: '0.82rem', fontWeight: 800, color: tokens.textPrimary, marginBottom: 8 }}>
          {scheduleForm.id ? 'Edit Class Schedule & Teacher' : 'Add Subject Period & Assign Teacher'}
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 10 }}>
          <div>
            <label style={labelStyle(tokens)}>Class Section *</label>
            <select
              required
              value={scheduleForm.section_id}
              onChange={(e) => setScheduleForm({ ...scheduleForm, section_id: e.target.value })}
              style={inputStyle(tokens)}
            >
              <option value="">Select Section</option>
              {sections.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name} ({s.grade_level_name || (typeof s.grade_level === 'object' ? s.grade_level?.name : '') || 'Section'})
                </option>
              ))}
            </select>
          </div>

          <div>
            <label style={labelStyle(tokens)}>Subject *</label>
            <select
              required
              value={scheduleForm.subject_id}
              onChange={(e) => setScheduleForm({ ...scheduleForm, subject_id: e.target.value })}
              style={inputStyle(tokens)}
            >
              <option value="">Select Subject</option>
              {subjects.map((sub) => (
                <option key={sub.id} value={sub.id}>
                  {sub.code} - {sub.title}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label style={labelStyle(tokens)}>Subject Teacher</label>
            <select
              value={scheduleForm.teacher_id}
              onChange={(e) => setScheduleForm({ ...scheduleForm, teacher_id: e.target.value })}
              style={{
                ...inputStyle(tokens),
                borderColor: periodConflict.teacher_conflict ? brand.danger : tokens.borderStrong,
              }}
            >
              <option value="">(None / Unassigned)</option>
              {teachingTeachers.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.full_name || t.name} {t.employee_id ? `(${t.employee_id})` : ''}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label style={labelStyle(tokens)}>Class Days *</label>
            <select
              value={scheduleForm.days_of_week}
              onChange={(e) => setScheduleForm({ ...scheduleForm, days_of_week: e.target.value })}
              style={inputStyle(tokens)}
            >
              {DAY_SCHEDULE_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label style={labelStyle(tokens)}>Start Time</label>
            <input
              type="time"
              required
              value={scheduleForm.start_time}
              onChange={(e) => setScheduleForm({ ...scheduleForm, start_time: e.target.value })}
              style={{ ...inputStyle(tokens), borderColor: hasTimeError ? brand.danger : tokens.borderStrong }}
            />
          </div>

          <div>
            <label style={labelStyle(tokens)}>End Time</label>
            <input
              type="time"
              required
              value={scheduleForm.end_time}
              onChange={(e) => setScheduleForm({ ...scheduleForm, end_time: e.target.value })}
              style={{ ...inputStyle(tokens), borderColor: hasTimeError ? brand.danger : tokens.borderStrong }}
            />
          </div>
        </div>

        {periodConflict.has_conflict && (
          <div
            style={{
              marginTop: 10,
              padding: '9px 12px',
              borderRadius: 8,
              backgroundColor: tokens.dangerLight,
              border: `1px solid ${brand.danger}`,
              color: brand.danger,
              display: 'flex',
              flexDirection: 'column',
              gap: 5,
              fontSize: '0.75rem',
              fontWeight: 700,
            }}
          >
            {[
              periodConflict.time_error,
              periodConflict.section_conflict,
              periodConflict.teacher_conflict,
              periodConflict.room_conflict,
            ]
              .filter(Boolean)
              .map((msg) => (
                <div key={msg} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  <AlertCircle size={14} style={{ flexShrink: 0 }} />
                  <span>{msg}</span>
                </div>
              ))}
          </div>
        )}

        {!periodConflict.checking && !periodConflict.has_conflict && scheduleForm.section_id && (
          <div
            style={{
              marginTop: 8,
              fontSize: '0.72rem',
              color: brand.success,
              fontWeight: 700,
              display: 'inline-flex',
              alignItems: 'center',
              gap: 5,
            }}
          >
            <CheckCircle2 size={13} />
            <span>No section, teacher, or classroom schedule conflicts found.</span>
          </div>
        )}

        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 12 }}>
          {scheduleForm.id && (
            <Button variant="secondary" size="sm" type="button" onClick={() => setScheduleForm(EMPTY_SCHEDULE_FORM)}>
              Cancel Edit
            </Button>
          )}
          <Button variant="primary" size="sm" type="submit" disabled={submitting || scheduleBlocked}>
            {submitting || periodConflict.checking ? (
              <Loader2 className="animate-spin" size={14} />
            ) : scheduleForm.id ? (
              'Save Changes'
            ) : (
              'Create Class Period'
            )}
          </Button>
        </div>
      </form>

      <div style={tableContainerStyle(tokens)}>
        <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: '0.78rem' }}>
          <thead>
            <tr style={{ borderBottom: `1px solid ${tokens.borderSubtle}`, backgroundColor: tokens.bgSurfaceSubtle }}>
              <th style={{ padding: '8px 10px', color: tokens.textMuted }}>Section</th>
              <th style={{ padding: '8px 10px', color: tokens.textMuted }}>Subject</th>
              <th style={{ padding: '8px 10px', color: tokens.textMuted }}>Subject Teacher</th>
              <th style={{ padding: '8px 10px', color: tokens.textMuted }}>Time</th>
              <th style={{ padding: '8px 10px', textAlign: 'right', color: tokens.textMuted }}>Actions</th>
            </tr>
          </thead>
          <tbody>
            {schedules.map((sc) => {
              const secName =
                sc.section_name || (typeof sc.section === 'object' ? sc.section?.name : '') || 'Section';
              const subCode =
                sc.subject_code || (typeof sc.subject === 'object' ? sc.subject?.code : '') || 'SUB';
              const teacherName = extractTeacherName(sc, teacherList);

              return (
                <tr key={sc.id} style={{ borderBottom: `1px solid ${tokens.borderSubtle}` }}>
                  <td style={{ padding: '8px 10px', fontWeight: 700, color: tokens.textPrimary }}>{secName}</td>
                  <td style={{ padding: '8px 10px', color: brand.primary, fontWeight: 700 }}>{subCode}</td>
                  <td
                    style={{
                      padding: '8px 10px',
                      color: teacherName === 'Unassigned' ? brand.warning : tokens.textSecondary,
                      fontWeight: 600,
                    }}
                  >
                    {teacherName}
                  </td>
                  <td style={{ padding: '8px 10px', color: tokens.textMuted }}>
                    {String(sc.start_time).slice(0, 5)} - {String(sc.end_time).slice(0, 5)}
                  </td>
                  <td style={{ padding: '8px 10px', textAlign: 'right' }}>
                    <button
                      type="button"
                      onClick={() => setScheduleForm(mapPeriodToForm(sc))}
                      style={{ background: 'none', border: 'none', color: brand.primary, cursor: 'pointer', marginRight: 8 }}
                      title="Edit Schedule & Teacher"
                      aria-label={`Edit schedule ${subCode}`}
                    >
                      <Edit2 size={13} />
                    </button>
                    <button
                      type="button"
                      onClick={() => onDelete(API_ROUTES.school.periods, sc.id, 'Class Schedule')}
                      style={{ background: 'none', border: 'none', color: brand.danger, cursor: 'pointer' }}
                      title="Delete Schedule"
                      aria-label={`Delete schedule ${subCode}`}
                    >
                      <Trash2 size={13} />
                    </button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
};
