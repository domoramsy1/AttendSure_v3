// AttendSure Web - Simple Lookup Crud Form
// File: D:\AttendSure_V3\web\src\components\modals\academic\SimpleLookupCrudForm.tsx

/**
 * AttendSure - Reusable Lookup CRUD Sub-Form (Rooms, Subjects, Grades, School Years, Holidays)
 * File: web/src/components/modals/academic/SimpleLookupCrudForm.tsx
 */

import React, { useState } from 'react';
import apiClient from '../../../api/client';
import { API_ROUTES, extractApiError } from '../../../api/routes';
import { useTheme } from '../../../context/ThemeContext';
import { useFieldAvailability } from '../../../hooks/useFieldAvailability';
import { Button } from '../../ui/Button';
import { Edit2, Loader2, Trash2 } from 'lucide-react';
import {
  formCardStyle,
  inputStyle,
  labelStyle,
  sanitizeAcademicField,
  tableContainerStyle,
  type AcademicGradeItem,
  type AcademicHolidayItem,
  type AcademicRoomItem,
  type AcademicSubjectItem,
  type AcademicYearItem,
} from './academicShared';

export type SimpleLookupTab = 'ROOMS' | 'SUBJECTS' | 'GRADES' | 'YEARS' | 'HOLIDAYS';

const EMPTY_SIMPLE_FORM = {
  id: null as number | null,
  code: '',
  name: '',
  building: '',
  capacity: 45,
  title: '',
  units: 1,
  stage: 'JHS',
  level_order: 1,
  start_date: '',
  baseline_cutoff_date: '',
  end_date: '',
  is_active: true,
  holiday_date: '',
  holiday_type: 'HOLIDAY',
  holiday_reason: '',
};

interface SimpleLookupCrudFormProps {
  isOpen: boolean;
  activeSubTab: SimpleLookupTab;
  rooms: AcademicRoomItem[];
  subjects: AcademicSubjectItem[];
  grades: AcademicGradeItem[];
  years: AcademicYearItem[];
  holidays: AcademicHolidayItem[];
  onReload: () => Promise<void>;
  onDelete: (route: string, id: number, label: string) => void;
  onStatus: (error: string | null, success: string | null) => void;
}

export const SimpleLookupCrudForm: React.FC<SimpleLookupCrudFormProps> = ({
  isOpen,
  activeSubTab,
  rooms,
  subjects,
  grades,
  years,
  holidays,
  onReload,
  onDelete,
  onStatus,
}) => {
  const { tokens, brand } = useTheme();
  const [simpleForm, setSimpleForm] = useState(EMPTY_SIMPLE_FORM);
  const [submitting, setSubmitting] = useState(false);

  const checkFieldType = activeSubTab === 'SUBJECTS' ? 'subject_code' : 'room_name';
  const checkValue =
    activeSubTab === 'SUBJECTS'
      ? sanitizeAcademicField(simpleForm.code, 30).trim()
      : sanitizeAcademicField(simpleForm.name, 60).trim();

  const fieldAvail = useFieldAvailability({
    enabled: isOpen && (activeSubTab === 'SUBJECTS' || activeSubTab === 'ROOMS'),
    field: checkFieldType,
    value: checkValue,
    minLength: 2,
    fallbackMessage:
      activeSubTab === 'SUBJECTS'
        ? 'A subject with this code already exists.'
        : 'A classroom with this name already exists.',
    excludeId: simpleForm.id ?? undefined,
  });

  const simpleBlocked =
    (activeSubTab === 'SUBJECTS' || activeSubTab === 'ROOMS') && (fieldAvail.checking || fieldAvail.isTaken);

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    onStatus(null, null);

    try {
      const isEdit = Boolean(simpleForm.id);
      if (activeSubTab === 'ROOMS') {
        const cleanRoomName = sanitizeAcademicField(simpleForm.name, 60).trim();
        const cleanBuilding = sanitizeAcademicField(simpleForm.building, 80).trim();
        if (!cleanRoomName) {
          onStatus('Room name is required.', null);
          setSubmitting(false);
          return;
        }
        const payload = {
          name: cleanRoomName,
          building: cleanBuilding,
          capacity: Math.max(1, Number(simpleForm.capacity) || 45),
        };
        if (isEdit) await apiClient.patch(`${API_ROUTES.school.rooms}${simpleForm.id}/`, payload);
        else await apiClient.post(API_ROUTES.school.rooms, payload);
      } else if (activeSubTab === 'SUBJECTS') {
        const cleanCode = sanitizeAcademicField(simpleForm.code, 30).trim().toUpperCase();
        const cleanTitle = sanitizeAcademicField(simpleForm.title, 100).trim();
        if (!cleanCode || !cleanTitle) {
          onStatus('Subject code and title are required.', null);
          setSubmitting(false);
          return;
        }
        const payload = {
          code: cleanCode,
          title: cleanTitle,
          units: Math.max(1, Number(simpleForm.units) || 1),
        };
        if (isEdit) await apiClient.patch(`${API_ROUTES.school.subjects}${simpleForm.id}/`, payload);
        else await apiClient.post(API_ROUTES.school.subjects, payload);
      } else if (activeSubTab === 'GRADES') {
        const cleanCode = sanitizeAcademicField(simpleForm.code, 20).trim().toUpperCase();
        const cleanName = sanitizeAcademicField(simpleForm.name, 60).trim();
        if (!cleanCode || !cleanName) {
          onStatus('Grade code and name are required.', null);
          setSubmitting(false);
          return;
        }
        const payload = {
          code: cleanCode,
          name: cleanName,
          stage: sanitizeAcademicField(simpleForm.stage || 'JHS', 20).trim() || 'JHS',
          level_order: Number(simpleForm.level_order) || 1,
        };
        if (isEdit) await apiClient.patch(`${API_ROUTES.school.gradeLevels}${simpleForm.id}/`, payload);
        else await apiClient.post(API_ROUTES.school.gradeLevels, payload);
      } else if (activeSubTab === 'YEARS') {
        const cleanCode = sanitizeAcademicField(simpleForm.code, 20).trim();
        if (!cleanCode || !simpleForm.start_date || !simpleForm.end_date) {
          onStatus('School year code, start date, and end date are required.', null);
          setSubmitting(false);
          return;
        }
        const payload = {
          code: cleanCode,
          start_date: simpleForm.start_date,
          baseline_cutoff_date: simpleForm.baseline_cutoff_date || simpleForm.start_date,
          end_date: simpleForm.end_date,
          is_active: Boolean(simpleForm.is_active),
        };
        if (isEdit) await apiClient.patch(`${API_ROUTES.school.schoolYears}${simpleForm.id}/`, payload);
        else await apiClient.post(API_ROUTES.school.schoolYears, payload);
      } else if (activeSubTab === 'HOLIDAYS') {
        const cleanReason = sanitizeAcademicField(simpleForm.holiday_reason, 140).trim();
        if (!simpleForm.holiday_date || !cleanReason) {
          onStatus('Holiday date and title/reason are required.', null);
          setSubmitting(false);
          return;
        }
        const payload = {
          date: simpleForm.holiday_date,
          type: simpleForm.holiday_type || 'HOLIDAY',
          reason: cleanReason,
        };
        if (isEdit) await apiClient.patch(`${API_ROUTES.school.holidays}${simpleForm.id}/`, payload);
        else await apiClient.post(API_ROUTES.school.holidays, payload);
      }

      setSimpleForm(EMPTY_SIMPLE_FORM);
      onStatus(null, isEdit ? 'Record updated.' : 'Record added.');
      await onReload();
    } catch (err: unknown) {
      onStatus(extractApiError(err, 'Failed to save record.'), null);
    } finally {
      setSubmitting(false);
    }
  };

  const renderRowActions = (
    label: string,
    itemLabel: string,
    route: string,
    id: number,
    onEdit: () => void
  ) => (
    <td style={{ padding: '8px 10px', textAlign: 'right' }}>
      <button
        type="button"
        onClick={onEdit}
        aria-label={`Edit ${label}`}
        title={`Edit ${itemLabel}`}
        style={{ background: 'none', border: 'none', color: brand.primary, cursor: 'pointer', marginRight: 8 }}
      >
        <Edit2 size={13} />
      </button>
      <button
        type="button"
        onClick={() => onDelete(route, id, itemLabel)}
        aria-label={`Delete ${label}`}
        title={`Delete ${itemLabel}`}
        style={{ background: 'none', border: 'none', color: brand.danger, cursor: 'pointer' }}
      >
        <Trash2 size={13} />
      </button>
    </td>
  );

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      <form
        onSubmit={handleSave}
        style={{ ...formCardStyle(tokens), display: 'flex', flexDirection: 'column', gap: 10 }}
      >
        <div style={{ display: 'flex', gap: 8, alignItems: 'flex-end', flexWrap: 'wrap' }}>
          {activeSubTab === 'ROOMS' && (
            <>
              <div style={{ flex: 1, minWidth: 120 }}>
                <label style={labelStyle(tokens)}>Room Name *</label>
                <input
                  type="text"
                  required
                  maxLength={60}
                  placeholder="e.g. Room 101"
                  value={simpleForm.name}
                  onChange={(e) => setSimpleForm({ ...simpleForm, name: sanitizeAcademicField(e.target.value, 60) })}
                  style={{
                    ...inputStyle(tokens),
                    borderColor: fieldAvail.isTaken
                      ? brand.danger
                      : fieldAvail.verified
                        ? brand.success
                        : tokens.borderStrong,
                  }}
                />
                {fieldAvail.isTaken && (
                  <div style={{ fontSize: '0.70rem', color: brand.danger, fontWeight: 700, marginTop: 3 }}>
                    {fieldAvail.error}
                  </div>
                )}
              </div>
              <div style={{ flex: 1, minWidth: 120 }}>
                <label style={labelStyle(tokens)}>Building</label>
                <input
                  type="text"
                  maxLength={80}
                  placeholder="e.g. Science Wing"
                  value={simpleForm.building}
                  onChange={(e) =>
                    setSimpleForm({ ...simpleForm, building: sanitizeAcademicField(e.target.value, 80) })
                  }
                  style={inputStyle(tokens)}
                />
              </div>
              <div style={{ width: 90 }}>
                <label style={labelStyle(tokens)}>Capacity</label>
                <input
                  type="number"
                  min={1}
                  max={500}
                  value={simpleForm.capacity}
                  onChange={(e) => setSimpleForm({ ...simpleForm, capacity: Number(e.target.value) || 45 })}
                  style={inputStyle(tokens)}
                />
              </div>
            </>
          )}

          {activeSubTab === 'GRADES' && (
            <>
              <div style={{ flex: 1, minWidth: 90 }}>
                <label style={labelStyle(tokens)}>Grade Code *</label>
                <input
                  type="text"
                  required
                  maxLength={20}
                  placeholder="e.g. G7"
                  value={simpleForm.code}
                  onChange={(e) => setSimpleForm({ ...simpleForm, code: sanitizeAcademicField(e.target.value, 20) })}
                  style={inputStyle(tokens)}
                />
              </div>
              <div style={{ flex: 2, minWidth: 140 }}>
                <label style={labelStyle(tokens)}>Grade Name *</label>
                <input
                  type="text"
                  required
                  maxLength={60}
                  placeholder="e.g. Grade 7"
                  value={simpleForm.name}
                  onChange={(e) => setSimpleForm({ ...simpleForm, name: sanitizeAcademicField(e.target.value, 60) })}
                  style={inputStyle(tokens)}
                />
              </div>
              <div style={{ width: 95 }}>
                <label style={labelStyle(tokens)}>Stage</label>
                <select
                  value={simpleForm.stage}
                  onChange={(e) => setSimpleForm({ ...simpleForm, stage: e.target.value })}
                  style={inputStyle(tokens)}
                >
                  <option value="ELEM">ELEM</option>
                  <option value="JHS">JHS</option>
                  <option value="SHS">SHS</option>
                </select>
              </div>
              <div style={{ width: 76 }}>
                <label style={labelStyle(tokens)}>Order</label>
                <input
                  type="number"
                  min={1}
                  max={20}
                  value={simpleForm.level_order}
                  onChange={(e) => setSimpleForm({ ...simpleForm, level_order: Number(e.target.value) || 1 })}
                  style={inputStyle(tokens)}
                />
              </div>
            </>
          )}

          {activeSubTab === 'SUBJECTS' && (
            <>
              <div style={{ flex: 1, minWidth: 100 }}>
                <label style={labelStyle(tokens)}>Subject Code *</label>
                <input
                  type="text"
                  required
                  maxLength={30}
                  placeholder="e.g. MATH7"
                  value={simpleForm.code}
                  onChange={(e) => setSimpleForm({ ...simpleForm, code: sanitizeAcademicField(e.target.value, 30) })}
                  style={{
                    ...inputStyle(tokens),
                    borderColor: fieldAvail.isTaken
                      ? brand.danger
                      : fieldAvail.verified
                        ? brand.success
                        : tokens.borderStrong,
                  }}
                />
                {fieldAvail.isTaken && (
                  <div style={{ fontSize: '0.70rem', color: brand.danger, fontWeight: 700, marginTop: 3 }}>
                    {fieldAvail.error}
                  </div>
                )}
              </div>
              <div style={{ flex: 2, minWidth: 140 }}>
                <label style={labelStyle(tokens)}>Subject Title *</label>
                <input
                  type="text"
                  required
                  maxLength={100}
                  placeholder="e.g. Mathematics 7"
                  value={simpleForm.title}
                  onChange={(e) =>
                    setSimpleForm({ ...simpleForm, title: sanitizeAcademicField(e.target.value, 100) })
                  }
                  style={inputStyle(tokens)}
                />
              </div>
              <div style={{ width: 76 }}>
                <label style={labelStyle(tokens)}>Units</label>
                <input
                  type="number"
                  min={1}
                  max={10}
                  value={simpleForm.units}
                  onChange={(e) => setSimpleForm({ ...simpleForm, units: Number(e.target.value) || 1 })}
                  style={inputStyle(tokens)}
                />
              </div>
            </>
          )}

          {activeSubTab === 'YEARS' && (
            <>
              <div style={{ flex: 1, minWidth: 110 }}>
                <label style={labelStyle(tokens)}>School Year *</label>
                <input
                  type="text"
                  required
                  maxLength={20}
                  placeholder="e.g. 2026-2027"
                  value={simpleForm.code}
                  onChange={(e) => setSimpleForm({ ...simpleForm, code: sanitizeAcademicField(e.target.value, 20) })}
                  style={inputStyle(tokens)}
                />
              </div>
              <div style={{ flex: 1, minWidth: 125 }}>
                <label style={labelStyle(tokens)}>Start Date *</label>
                <input
                  type="date"
                  required
                  value={simpleForm.start_date}
                  onChange={(e) => setSimpleForm({ ...simpleForm, start_date: e.target.value })}
                  style={inputStyle(tokens)}
                />
              </div>
              <div style={{ flex: 1, minWidth: 125 }}>
                <label style={labelStyle(tokens)}>Cutoff Date</label>
                <input
                  type="date"
                  value={simpleForm.baseline_cutoff_date}
                  onChange={(e) => setSimpleForm({ ...simpleForm, baseline_cutoff_date: e.target.value })}
                  style={inputStyle(tokens)}
                />
              </div>
              <div style={{ flex: 1, minWidth: 125 }}>
                <label style={labelStyle(tokens)}>End Date *</label>
                <input
                  type="date"
                  required
                  value={simpleForm.end_date}
                  onChange={(e) => setSimpleForm({ ...simpleForm, end_date: e.target.value })}
                  style={inputStyle(tokens)}
                />
              </div>
              <label
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: 6,
                  fontSize: '0.74rem',
                  color: tokens.textPrimary,
                  paddingBottom: 6,
                  cursor: 'pointer',
                }}
              >
                <input
                  type="checkbox"
                  checked={simpleForm.is_active}
                  onChange={(e) => setSimpleForm({ ...simpleForm, is_active: e.target.checked })}
                />
                <span>Active</span>
              </label>
            </>
          )}

          {activeSubTab === 'HOLIDAYS' && (
            <>
              <div style={{ width: 135 }}>
                <label style={labelStyle(tokens)}>Date *</label>
                <input
                  type="date"
                  required
                  value={simpleForm.holiday_date}
                  onChange={(e) => setSimpleForm({ ...simpleForm, holiday_date: e.target.value })}
                  style={inputStyle(tokens)}
                />
              </div>
              <div style={{ width: 130 }}>
                <label style={labelStyle(tokens)}>Category</label>
                <select
                  value={simpleForm.holiday_type}
                  onChange={(e) => setSimpleForm({ ...simpleForm, holiday_type: e.target.value })}
                  style={inputStyle(tokens)}
                >
                  <option value="HOLIDAY">Holiday</option>
                  <option value="SUSPENSION">Suspension</option>
                  <option value="EVENT">School Event</option>
                </select>
              </div>
              <div style={{ flex: 2, minWidth: 160 }}>
                <label style={labelStyle(tokens)}>Title / Official Reason *</label>
                <input
                  type="text"
                  required
                  maxLength={140}
                  placeholder="e.g. National Heroes Day"
                  value={simpleForm.holiday_reason}
                  onChange={(e) =>
                    setSimpleForm({ ...simpleForm, holiday_reason: sanitizeAcademicField(e.target.value, 140) })
                  }
                  style={inputStyle(tokens)}
                />
              </div>
            </>
          )}

          <div style={{ display: 'inline-flex', gap: 6 }}>
            {simpleForm.id && (
              <Button variant="secondary" size="sm" type="button" onClick={() => setSimpleForm(EMPTY_SIMPLE_FORM)}>
                Cancel
              </Button>
            )}
            <Button variant="primary" size="sm" type="submit" disabled={submitting || simpleBlocked}>
              {submitting || fieldAvail.checking ? (
                <Loader2 className="animate-spin" size={14} />
              ) : simpleForm.id ? (
                'Save Changes'
              ) : (
                'Add Record'
              )}
            </Button>
          </div>
        </div>
      </form>

      <div style={tableContainerStyle(tokens)}>
        <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: '0.78rem' }}>
          <thead>
            <tr style={{ borderBottom: `1px solid ${tokens.borderSubtle}`, backgroundColor: tokens.bgSurfaceSubtle }}>
              <th style={{ padding: '8px 10px', color: tokens.textMuted }}>Item Name / Code</th>
              <th style={{ padding: '8px 10px', color: tokens.textMuted }}>Details</th>
              <th style={{ padding: '8px 10px', textAlign: 'right', color: tokens.textMuted }}>Action</th>
            </tr>
          </thead>
          <tbody>
            {activeSubTab === 'YEARS' &&
              years.map((y) => (
                <tr key={y.id} style={{ borderBottom: `1px solid ${tokens.borderSubtle}` }}>
                  <td style={{ padding: '8px 10px', fontWeight: 700, color: tokens.textPrimary }}>{y.code}</td>
                  <td style={{ padding: '8px 10px', color: tokens.textSecondary }}>
                    {y.is_active ? <span style={{ color: brand.success, fontWeight: 700 }}>Active</span> : 'Archived'}
                    {y.start_date && y.end_date ? ` • ${y.start_date} to ${y.end_date}` : ''}
                  </td>
                  {renderRowActions(`school year ${y.code}`, 'School Year', API_ROUTES.school.schoolYears, y.id, () =>
                    setSimpleForm({
                      ...EMPTY_SIMPLE_FORM,
                      id: y.id,
                      code: y.code || '',
                      start_date: y.start_date || '',
                      baseline_cutoff_date: y.baseline_cutoff_date || y.start_date || '',
                      end_date: y.end_date || '',
                      is_active: Boolean(y.is_active),
                    })
                  )}
                </tr>
              ))}

            {activeSubTab === 'GRADES' &&
              grades.map((g) => (
                <tr key={g.id} style={{ borderBottom: `1px solid ${tokens.borderSubtle}` }}>
                  <td style={{ padding: '8px 10px', fontWeight: 700, color: tokens.textPrimary }}>{g.code}</td>
                  <td style={{ padding: '8px 10px', color: tokens.textSecondary }}>
                    {g.name} {g.stage ? `• ${g.stage}` : ''}
                  </td>
                  {renderRowActions(`grade ${g.name}`, 'Grade Level', API_ROUTES.school.gradeLevels, g.id, () =>
                    setSimpleForm({
                      ...EMPTY_SIMPLE_FORM,
                      id: g.id,
                      code: g.code || '',
                      name: g.name || '',
                      stage: g.stage || 'JHS',
                      level_order: Number(g.level_order) || 1,
                    })
                  )}
                </tr>
              ))}

            {activeSubTab === 'ROOMS' &&
              rooms.map((r) => (
                <tr key={r.id} style={{ borderBottom: `1px solid ${tokens.borderSubtle}` }}>
                  <td style={{ padding: '8px 10px', fontWeight: 700, color: tokens.textPrimary }}>{r.name}</td>
                  <td style={{ padding: '8px 10px', color: tokens.textSecondary }}>
                    {r.building ? `${r.building} • ` : ''}Cap: {r.capacity}
                  </td>
                  {renderRowActions(`classroom ${r.name}`, 'Classroom', API_ROUTES.school.rooms, r.id, () =>
                    setSimpleForm({
                      ...EMPTY_SIMPLE_FORM,
                      id: r.id,
                      name: r.name || '',
                      building: r.building || '',
                      capacity: Number(r.capacity) || 45,
                    })
                  )}
                </tr>
              ))}

            {activeSubTab === 'SUBJECTS' &&
              subjects.map((s) => (
                <tr key={s.id} style={{ borderBottom: `1px solid ${tokens.borderSubtle}` }}>
                  <td style={{ padding: '8px 10px', fontWeight: 700, color: tokens.textPrimary }}>{s.code}</td>
                  <td style={{ padding: '8px 10px', color: tokens.textSecondary }}>
                    {s.title} {s.units ? `• ${s.units} unit(s)` : ''}
                  </td>
                  {renderRowActions(`subject ${s.code}`, 'Subject', API_ROUTES.school.subjects, s.id, () =>
                    setSimpleForm({
                      ...EMPTY_SIMPLE_FORM,
                      id: s.id,
                      code: s.code || '',
                      title: s.title || '',
                      units: Number(s.units) || 1,
                    })
                  )}
                </tr>
              ))}

            {activeSubTab === 'HOLIDAYS' &&
              holidays.map((h) => (
                <tr key={h.id} style={{ borderBottom: `1px solid ${tokens.borderSubtle}` }}>
                  <td style={{ padding: '8px 10px', fontWeight: 700, color: tokens.textPrimary }}>{h.date}</td>
                  <td style={{ padding: '8px 10px', color: tokens.textSecondary }}>
                    <strong style={{ color: brand.primary, marginRight: 6 }}>[{h.type || 'HOLIDAY'}]</strong>
                    {h.reason || h.title}
                  </td>
                  {renderRowActions(`holiday ${h.date}`, 'Calendar Override', API_ROUTES.school.holidays, h.id, () =>
                    setSimpleForm({
                      ...EMPTY_SIMPLE_FORM,
                      id: h.id,
                      holiday_date: h.date || '',
                      holiday_type: h.type || 'HOLIDAY',
                      holiday_reason: h.reason || h.title || '',
                    })
                  )}
                </tr>
              ))}
          </tbody>
        </table>
      </div>
    </div>
  );
};
