/**
 * AttendSure - Section & Homeroom Class Adviser CRUD Sub-Form
 * File: web/src/components/modals/academic/SectionAdviserForm.tsx
 */

import React, { useEffect, useRef, useState } from 'react';
import apiClient from '../../../api/client';
import { API_ROUTES, extractApiError } from '../../../api/routes';
import { useTheme } from '../../../context/ThemeContext';
import { Button } from '../../ui/Button';
import { AlertCircle, AlertTriangle, Edit2, Info, Loader2, Trash2 } from 'lucide-react';
import {
  alertBoxStyle,
  formCardStyle,
  inputStyle,
  labelStyle,
  sanitizeAcademicField,
  tableContainerStyle,
  type AcademicGradeItem,
  type AcademicSectionItem,
  type AcademicTeacherOption,
} from './academicShared';

export interface SectionFormState {
  id: number | null;
  name: string;
  grade_level: string;
  adviser_id: string;
  room_number: string;
  capacity: number;
  allow_multiple_advisories: boolean;
}

const EMPTY_SECTION_FORM: SectionFormState = {
  id: null,
  name: '',
  grade_level: '',
  adviser_id: '',
  room_number: '',
  capacity: 45,
  allow_multiple_advisories: false,
};

const mapSectionToForm = (item?: AcademicSectionItem | null): SectionFormState => {
  if (!item) return EMPTY_SECTION_FORM;
  const advId =
    item.adviser_id ??
    (typeof item.adviser === 'object' && item.adviser ? item.adviser.id : item.adviser) ??
    '';
  const gradeId =
    item.grade_level_id ??
    (typeof item.grade_level === 'object' && item.grade_level
      ? item.grade_level.id
      : item.grade_level) ??
    '';

  return {
    id: item.id || null,
    name: item.name || item.section_name || '',
    grade_level: String(gradeId || ''),
    adviser_id: String(advId || ''),
    room_number: item.room_number || item.room_name || '',
    capacity: item.capacity || 45,
    allow_multiple_advisories: false,
  };
};

const EMPTY_CONFLICT = {
  checking: false,
  name_taken: false,
  name_message: '',
  adviser_conflict: {
    has_existing_advisory: false,
    existing_sections: [] as string[],
    can_handle_classes: true,
    message: '',
  },
  room_in_use_by_sections: [] as string[],
  room_message: '',
};

interface SectionAdviserFormProps {
  isOpen: boolean;
  initialEditItem?: AcademicSectionItem | null;
  grades: AcademicGradeItem[];
  sections: AcademicSectionItem[];
  teacherList: AcademicTeacherOption[];
  teachingTeachers: AcademicTeacherOption[];
  onReload: () => Promise<void>;
  onDelete: (route: string, id: number, label: string) => void;
  onStatus: (error: string | null, success: string | null) => void;
}

export const SectionAdviserForm: React.FC<SectionAdviserFormProps> = ({
  isOpen,
  initialEditItem,
  grades,
  sections,
  teacherList,
  teachingTeachers,
  onReload,
  onDelete,
  onStatus,
}) => {
  const { tokens, brand } = useTheme();
  const [sectionForm, setSectionForm] = useState<SectionFormState>(() =>
    mapSectionToForm(initialEditItem)
  );
  const [asyncConflict, setAsyncConflict] = useState<{
    key: string;
    state: typeof EMPTY_CONFLICT;
  }>({ key: '', state: EMPTY_CONFLICT });
  const [submitting, setSubmitting] = useState(false);
  const checkAbortRef = useRef<AbortController | null>(null);

  const cleanName = sanitizeAcademicField(sectionForm.name, 80).trim();
  const cleanRoom = sanitizeAcademicField(sectionForm.room_number, 50).trim();
  const shouldCheck = Boolean(isOpen && (cleanName || sectionForm.adviser_id || cleanRoom));
  const conflictKey = shouldCheck
    ? JSON.stringify([
        sectionForm.id,
        cleanName,
        sectionForm.grade_level,
        sectionForm.adviser_id,
        cleanRoom,
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
          ...(prev.key === conflictKey ? prev.state : EMPTY_CONFLICT),
          checking: true,
        },
      }));
      try {
        const res = await apiClient.get(API_ROUTES.school.checkConflict, {
          params: {
            type: 'section',
            name: cleanName || undefined,
            grade_level: sectionForm.grade_level || undefined,
            adviser_id: sectionForm.adviser_id || undefined,
            room_name: cleanRoom || undefined,
            exclude_id: sectionForm.id || undefined,
            nocache: 1,
          },
          signal: controller.signal,
        });
        if (controller.signal.aborted || !res.data) return;
        setAsyncConflict({
          key: conflictKey,
          state: {
            checking: false,
            name_taken: Boolean(res.data.name_taken),
            name_message: String(res.data.name_message || ''),
            adviser_conflict: {
              has_existing_advisory: Boolean(res.data.adviser_conflict?.has_existing_advisory),
              existing_sections: Array.isArray(res.data.adviser_conflict?.existing_sections)
                ? res.data.adviser_conflict.existing_sections
                : [],
              can_handle_classes: res.data.adviser_conflict?.can_handle_classes !== false,
              message: String(res.data.adviser_conflict?.message || ''),
            },
            room_in_use_by_sections: Array.isArray(res.data.room_in_use_by_sections)
              ? res.data.room_in_use_by_sections
              : [],
            room_message: String(res.data.room_message || ''),
          },
        });
      } catch {
        if (!controller.signal.aborted) {
          setAsyncConflict((prev) => ({
            key: conflictKey,
            state: {
              ...(prev.key === conflictKey ? prev.state : EMPTY_CONFLICT),
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
  }, [conflictKey, cleanName, cleanRoom, sectionForm.id, sectionForm.grade_level, sectionForm.adviser_id]);

  const sectionConflict =
    conflictKey && asyncConflict.key === conflictKey ? asyncConflict.state : EMPTY_CONFLICT;

  const sectionBlocked =
    sectionConflict.checking ||
    sectionConflict.name_taken ||
    !sectionConflict.adviser_conflict.can_handle_classes ||
    (sectionConflict.adviser_conflict.has_existing_advisory && !sectionForm.allow_multiple_advisories);

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    const cleanName = sanitizeAcademicField(sectionForm.name, 80).trim();
    const cleanRoomNumber = sanitizeAcademicField(sectionForm.room_number, 50).trim();
    if (!cleanName) {
      onStatus('Section name is required.', null);
      return;
    }
    if (!sectionForm.grade_level) {
      onStatus('Please select a grade level.', null);
      return;
    }

    setSubmitting(true);
    onStatus(null, null);

    const adviserPk = sectionForm.adviser_id ? Number(sectionForm.adviser_id) : null;
    const payload = {
      name: cleanName,
      grade_level: Number(sectionForm.grade_level),
      adviser: adviserPk,
      adviser_id: adviserPk,
      room_number: cleanRoomNumber,
      capacity: Number(sectionForm.capacity) || 45,
      allow_multiple_advisories: Boolean(sectionForm.allow_multiple_advisories),
    };

    try {
      if (sectionForm.id) {
        await apiClient.patch(`${API_ROUTES.school.sections}${sectionForm.id}/`, payload);
        onStatus(null, 'Section and Class Adviser updated.');
      } else {
        await apiClient.post(API_ROUTES.school.sections, payload);
        onStatus(null, 'New section and Class Adviser saved.');
      }
      setSectionForm(EMPTY_SECTION_FORM);
      await onReload();
    } catch (err: unknown) {
      onStatus(extractApiError(err, 'Failed to save section.'), null);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      <form onSubmit={handleSave} style={formCardStyle(tokens)}>
        <div style={{ fontSize: '0.82rem', fontWeight: 800, color: tokens.textPrimary, marginBottom: 8 }}>
          {sectionForm.id ? 'Edit Section & Adviser' : 'Add Section & Assign Class Adviser'}
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 10 }}>
          <div>
            <label style={labelStyle(tokens)}>Section Name *</label>
            <input
              type="text"
              required
              maxLength={80}
              placeholder="e.g. Diamond"
              value={sectionForm.name}
              onChange={(e) => setSectionForm({ ...sectionForm, name: sanitizeAcademicField(e.target.value, 80) })}
              style={{
                ...inputStyle(tokens),
                borderColor: sectionConflict.name_taken ? brand.danger : tokens.borderStrong,
              }}
            />
            {sectionConflict.name_taken && (
              <div style={{ fontSize: '0.70rem', color: brand.danger, fontWeight: 700, marginTop: 4 }}>
                {sectionConflict.name_message || 'A section with this name already exists for this grade level.'}
              </div>
            )}
          </div>

          <div>
            <label style={labelStyle(tokens)}>Grade Level *</label>
            <select
              required
              value={sectionForm.grade_level}
              onChange={(e) => setSectionForm({ ...sectionForm, grade_level: e.target.value })}
              style={inputStyle(tokens)}
            >
              <option value="">Select Grade Level</option>
              {grades.map((g) => (
                <option key={g.id} value={g.id}>
                  {g.name || g.code}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label style={labelStyle(tokens)}>Class Adviser</label>
            <select
              value={sectionForm.adviser_id}
              onChange={(e) =>
                setSectionForm({
                  ...sectionForm,
                  adviser_id: e.target.value,
                  allow_multiple_advisories: false,
                })
              }
              style={{
                ...inputStyle(tokens),
                borderColor: !sectionConflict.adviser_conflict.can_handle_classes
                  ? brand.danger
                  : sectionConflict.adviser_conflict.has_existing_advisory
                    ? brand.warning
                    : tokens.borderStrong,
              }}
            >
              <option value="">(None / Unassigned)</option>
              {teachingTeachers.map((t) => {
                const advisedList: string[] = Array.isArray(t.advised_sections) ? t.advised_sections : [];
                const advisedBadge =
                  advisedList.length > 0 ? ` (Already Adviser: ${advisedList.join(', ')})` : '';
                return (
                  <option key={t.id} value={t.id}>
                    {t.full_name || t.name}
                    {t.employee_id ? ` [${t.employee_id}]` : ''}
                    {advisedBadge}
                  </option>
                );
              })}
            </select>
          </div>

          <div>
            <label style={labelStyle(tokens)}>Default Room Number</label>
            <input
              type="text"
              maxLength={50}
              placeholder="e.g. Room 204"
              value={sectionForm.room_number}
              onChange={(e) =>
                setSectionForm({ ...sectionForm, room_number: sanitizeAcademicField(e.target.value, 50) })
              }
              style={inputStyle(tokens)}
            />
            {sectionConflict.room_in_use_by_sections.length > 0 && (
              <div
                style={{
                  display: 'flex',
                  alignItems: 'flex-start',
                  gap: 5,
                  fontSize: '0.70rem',
                  color: brand.primary,
                  fontWeight: 600,
                  marginTop: 4,
                }}
              >
                <Info size={12} style={{ flexShrink: 0, marginTop: 1 }} />
                <span>{sectionConflict.room_message}</span>
              </div>
            )}
          </div>
        </div>

        {!sectionConflict.adviser_conflict.can_handle_classes && (
          <div style={{ ...alertBoxStyle(tokens.dangerLight, brand.danger), marginTop: 10 }}>
            <AlertCircle size={15} style={{ flexShrink: 0 }} />
            <span>{sectionConflict.adviser_conflict.message}</span>
          </div>
        )}

        {sectionConflict.adviser_conflict.has_existing_advisory && (
          <div
            style={{
              marginTop: 10,
              padding: '10px 12px',
              borderRadius: 8,
              backgroundColor: tokens.warningLight,
              border: `1px solid ${brand.warning}`,
              display: 'flex',
              flexDirection: 'column',
              gap: 8,
            }}
          >
            <div style={{ display: 'flex', alignItems: 'flex-start', gap: 8, color: brand.warning, fontSize: '0.76rem', fontWeight: 700 }}>
              <AlertTriangle size={16} style={{ flexShrink: 0, marginTop: 1 }} />
              <span>
                DepEd Adviser Workload Notice: This teacher is already the adviser of{' '}
                {sectionConflict.adviser_conflict.existing_sections.join(', ')}. Under DepEd guidelines, teachers normally hold one homeroom advisory class.
              </span>
            </div>
            <label
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: 8,
                fontSize: '0.75rem',
                fontWeight: 700,
                color: tokens.textPrimary,
                cursor: 'pointer',
              }}
            >
              <input
                type="checkbox"
                checked={sectionForm.allow_multiple_advisories}
                onChange={(e) => setSectionForm({ ...sectionForm, allow_multiple_advisories: e.target.checked })}
                style={{ accentColor: brand.warning }}
              />
              <span>Allow second advisory class (approved double-shift, multigrade, or substitute load)</span>
            </label>
          </div>
        )}

        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 12 }}>
          {sectionForm.id && (
            <Button variant="secondary" size="sm" type="button" onClick={() => setSectionForm(EMPTY_SECTION_FORM)}>
              Cancel Edit
            </Button>
          )}
          <Button variant="primary" size="sm" type="submit" disabled={submitting || sectionBlocked}>
            {submitting || sectionConflict.checking ? (
              <Loader2 className="animate-spin" size={14} />
            ) : sectionForm.id ? (
              'Save Changes'
            ) : (
              'Create Section'
            )}
          </Button>
        </div>
      </form>

      <div style={tableContainerStyle(tokens)}>
        <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: '0.78rem' }}>
          <thead>
            <tr style={{ borderBottom: `1px solid ${tokens.borderSubtle}`, backgroundColor: tokens.bgSurfaceSubtle }}>
              <th style={{ padding: '8px 10px', color: tokens.textMuted }}>Section</th>
              <th style={{ padding: '8px 10px', color: tokens.textMuted }}>Grade</th>
              <th style={{ padding: '8px 10px', color: tokens.textMuted }}>Class Adviser</th>
              <th style={{ padding: '8px 10px', textAlign: 'right', color: tokens.textMuted }}>Actions</th>
            </tr>
          </thead>
          <tbody>
            {sections.map((sec) => {
              const adviserName =
                sec.adviser_name ||
                sec.adviser_full_name ||
                (typeof sec.adviser === 'object' && sec.adviser ? sec.adviser.full_name || sec.adviser.name : null) ||
                teacherList.find((t) => t.id === sec.adviser_id || t.id === sec.adviser)?.full_name ||
                'Unassigned';

              return (
                <tr key={sec.id} style={{ borderBottom: `1px solid ${tokens.borderSubtle}` }}>
                  <td style={{ padding: '8px 10px', fontWeight: 700, color: tokens.textPrimary }}>{sec.name}</td>
                  <td style={{ padding: '8px 10px', color: tokens.textSecondary }}>
                    {sec.grade_level_name || (typeof sec.grade_level === 'object' ? sec.grade_level?.name : '') || '—'}
                  </td>
                  <td
                    style={{
                      padding: '8px 10px',
                      color: adviserName === 'Unassigned' ? brand.warning : brand.primary,
                      fontWeight: 600,
                    }}
                  >
                    {adviserName}
                  </td>
                  <td style={{ padding: '8px 10px', textAlign: 'right' }}>
                    <button
                      type="button"
                      onClick={() => setSectionForm(mapSectionToForm(sec))}
                      style={{ background: 'none', border: 'none', color: brand.primary, cursor: 'pointer', marginRight: 8 }}
                      title="Edit Section & Adviser"
                      aria-label={`Edit section ${sec.name}`}
                    >
                      <Edit2 size={13} />
                    </button>
                    <button
                      type="button"
                      onClick={() => onDelete(API_ROUTES.school.sections, sec.id, 'Section')}
                      style={{ background: 'none', border: 'none', color: brand.danger, cursor: 'pointer' }}
                      title="Delete Section"
                      aria-label={`Delete section ${sec.name}`}
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
