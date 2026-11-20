/**
 * AttendSure - Academic Structure Setup Modal (Themed)
 * File: web/src/components/modals/AcademicSetupModal.tsx
 * Manages Sections, Advisers, Schedules, Subject Faculty, Rooms, Subjects, and Grade Levels.
 */

import React, { useState, useEffect, useCallback, useRef } from 'react';
import apiClient from '../../api/client';
import { API_ROUTES, extractApiError } from '../../api/routes';
import { useTheme } from '../../context/ThemeContext';
import { useAlert } from '../../context/AlertContext';
import { Modal } from '../ui/Modal';
import { Button } from '../ui/Button';
import {
  Calendar,
  BookOpen,
  DoorOpen,
  Layers,
  Users,
  Clock,
  Loader2,
  AlertCircle,
  Trash2,
  Edit2,
  CheckCircle2,
} from 'lucide-react';

export type TabType =
  | 'SECTIONS'
  | 'SCHEDULE'
  | 'SECTION'
  | 'ROOM'
  | 'ROOMS'
  | 'SUBJECT'
  | 'SUBJECTS'
  | 'GRADES'
  | 'YEARS'
  | 'HOLIDAYS';

export interface AcademicSetupModalProps {
  isOpen: boolean;
  onClose: () => void;
  onUpdated?: () => void;
  onSuccess?: () => void;
  initialTab?: TabType;
  editItem?: any;
}

type ActiveSubTab = 'SECTIONS' | 'SCHEDULE' | 'ROOMS' | 'SUBJECTS' | 'GRADES' | 'YEARS' | 'HOLIDAYS';

const normalizeTab = (tab: TabType): ActiveSubTab => {
  if (tab === 'SECTION' || tab === 'SECTIONS') return 'SECTIONS';
  if (tab === 'SCHEDULE') return 'SCHEDULE';
  if (tab === 'ROOM' || tab === 'ROOMS') return 'ROOMS';
  if (tab === 'SUBJECT' || tab === 'SUBJECTS') return 'SUBJECTS';
  if (tab === 'GRADES') return 'GRADES';
  if (tab === 'HOLIDAYS') return 'HOLIDAYS';
  return 'YEARS';
};

const sanitizeField = (raw: string, maxLength = 100): string =>
  String(raw || '').replace(/[\u0000-\u001F\u007F<>]/g, '').slice(0, maxLength);

const extractFacultyId = (item: any): string => {
  if (!item) return '';
  const candidate =
    item.faculty_id ??
    (typeof item.faculty === 'object' && item.faculty ? item.faculty.id : item.faculty) ??
    '';
  return candidate !== null && candidate !== undefined ? String(candidate) : '';
};

const extractFacultyName = (item: any, facultyList: any[]): string => {
  if (!item) return 'Unassigned';
  const directName =
    item.faculty_name ||
    (typeof item.faculty === 'object' && item.faculty ? item.faculty.full_name || item.faculty.name : null);
  if (directName && String(directName).trim()) return String(directName).trim();

  const fid = extractFacultyId(item);
  if (fid) {
    const match = facultyList.find((f) => String(f.id) === fid);
    if (match) return match.full_name || match.name || 'Unassigned';
  }
  return 'Unassigned';
};

export const AcademicSetupModal: React.FC<AcademicSetupModalProps> = ({
  isOpen,
  onClose,
  onUpdated,
  onSuccess,
  initialTab = 'SECTIONS',
  editItem = null,
}) => {
  const { tokens, brand } = useTheme();
  const { showConfirm } = useAlert();

  const [activeSubTab, setActiveSubTab] = useState<ActiveSubTab>(normalizeTab(initialTab));

  const [loading, setLoading] = useState<boolean>(false);
  const [submitting, setSubmitting] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  const abortRef = useRef<AbortController | null>(null);

  const [years, setYears] = useState<any[]>([]);
  const [grades, setGrades] = useState<any[]>([]);
  const [rooms, setRooms] = useState<any[]>([]);
  const [subjects, setSubjects] = useState<any[]>([]);
  const [sections, setSections] = useState<any[]>([]);
  const [facultyList, setFacultyList] = useState<any[]>([]);
  const [schedules, setSchedules] = useState<any[]>([]);
  const [holidays, setHolidays] = useState<any[]>([]);

  const [sectionForm, setSectionForm] = useState({
    id: null as number | null,
    name: '',
    grade_level: '',
    adviser_id: '',
    room_number: '',
    capacity: 45,
  });

  const [scheduleForm, setScheduleForm] = useState({
    id: null as number | null,
    section_id: '',
    subject_id: '',
    faculty_id: '',
    room_id: '',
    start_time: '07:30',
    end_time: '08:30',
    days_of_week: 'MON-FRI',
  });

  const [simpleForm, setSimpleForm] = useState({
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
  });

  const resetSimpleForm = () =>
    setSimpleForm({
      id: null,
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
    });

  useEffect(() => {
    if (!initialTab) return;
    const target = normalizeTab(initialTab);
    setActiveSubTab(target);
    setError(null);
    setSuccessMessage(null);

    if (editItem) {
      if (target === 'SECTIONS') {
        const advId =
          editItem.adviser_id ??
          (typeof editItem.adviser === 'object' && editItem.adviser ? editItem.adviser.id : editItem.adviser) ??
          '';
        const gradeId =
          editItem.grade_level_id ??
          (typeof editItem.grade_level === 'object' && editItem.grade_level
            ? editItem.grade_level.id
            : editItem.grade_level) ??
          '';

        setSectionForm({
          id: editItem.id || null,
          name: editItem.name || editItem.section_name || '',
          grade_level: String(gradeId || ''),
          adviser_id: String(advId || ''),
          room_number: editItem.room_number || '',
          capacity: editItem.capacity || 45,
        });
      } else if (target === 'SCHEDULE') {
        const secId =
          editItem.section_id ??
          (typeof editItem.section === 'object' && editItem.section ? editItem.section.id : editItem.section) ??
          '';
        const subId =
          editItem.subject_id ??
          (typeof editItem.subject === 'object' && editItem.subject ? editItem.subject.id : editItem.subject) ??
          '';
        const facId = extractFacultyId(editItem);
        const roomId =
          editItem.room_id ??
          (typeof editItem.room === 'object' && editItem.room ? editItem.room.id : editItem.room) ??
          '';

        setScheduleForm({
          id: editItem.id || null,
          section_id: String(secId || ''),
          subject_id: String(subId || ''),
          faculty_id: facId,
          room_id: typeof roomId === 'number' || /^\d+$/.test(String(roomId)) ? String(roomId) : '',
          start_time: editItem.start_time ? String(editItem.start_time).slice(0, 5) : '07:30',
          end_time: editItem.end_time ? String(editItem.end_time).slice(0, 5) : '08:30',
          days_of_week: editItem.days_of_week || 'MON-FRI',
        });
      }
    } else {
      setSectionForm({ id: null, name: '', grade_level: '', adviser_id: '', room_number: '', capacity: 45 });
      setScheduleForm({
        id: null,
        section_id: '',
        subject_id: '',
        faculty_id: '',
        room_id: '',
        start_time: '07:30',
        end_time: '08:30',
        days_of_week: 'MON-FRI',
      });
    }
  }, [initialTab, editItem]);

  const loadData = useCallback(async () => {
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    setLoading(true);
    setError(null);
    try {
      const results = await Promise.allSettled([
        apiClient.get(API_ROUTES.school.schoolYears, { signal: controller.signal }),
        apiClient.get(API_ROUTES.school.gradeLevels, { signal: controller.signal }),
        apiClient.get(API_ROUTES.school.rooms, { signal: controller.signal }),
        apiClient.get(API_ROUTES.school.subjects, { signal: controller.signal }),
        apiClient.get(API_ROUTES.school.sections, { params: { page_size: 300 }, signal: controller.signal }),
        apiClient
          .get(API_ROUTES.accounts.facultyDropdown, { signal: controller.signal })
          .catch(() => apiClient.get(API_ROUTES.accounts.faculty, { params: { page_size: 300 }, signal: controller.signal })),
        apiClient.get(API_ROUTES.school.periods, { params: { page_size: 300 }, signal: controller.signal }),
        apiClient.get(API_ROUTES.school.holidays, { params: { page_size: 200 }, signal: controller.signal }),
      ]);

      if (controller.signal.aborted) return;

      const getData = (res: PromiseSettledResult<any>) =>
        res.status === 'fulfilled' && res.value?.data
          ? Array.isArray(res.value.data)
            ? res.value.data
            : res.value.data.results || []
          : [];

      setYears(getData(results[0]));
      setGrades(getData(results[1]));
      setRooms(getData(results[2]));
      setSubjects(getData(results[3]));
      setSections(getData(results[4]));
      setFacultyList(getData(results[5]));
      setSchedules(getData(results[6]));
      setHolidays(getData(results[7]));
    } catch (err: unknown) {
      if (!controller.signal.aborted) {
        setError(extractApiError(err, 'Could not load academic records.'));
      }
    } finally {
      if (!controller.signal.aborted) {
        setLoading(false);
      }
    }
  }, []);

  useEffect(() => {
    if (isOpen) {
      void loadData();
    }
    return () => {
      abortRef.current?.abort();
    };
  }, [isOpen, loadData]);

  const handleSaveSection = async (e: React.FormEvent) => {
    e.preventDefault();
    const cleanName = sanitizeField(sectionForm.name, 80).trim();
    const cleanRoomNumber = sanitizeField(sectionForm.room_number, 50).trim();
    if (!cleanName) {
      setError('Section name is required.');
      return;
    }
    if (!sectionForm.grade_level) {
      setError('Please select a grade level.');
      return;
    }

    setSubmitting(true);
    setError(null);
    setSuccessMessage(null);

    const adviserPk = sectionForm.adviser_id ? Number(sectionForm.adviser_id) : null;
    const payload = {
      name: cleanName,
      grade_level: Number(sectionForm.grade_level),
      adviser: adviserPk,
      adviser_id: adviserPk,
      room_number: cleanRoomNumber,
      capacity: Number(sectionForm.capacity) || 45,
    };

    try {
      if (sectionForm.id) {
        await apiClient.patch(`${API_ROUTES.school.sections}${sectionForm.id}/`, payload);
        setSuccessMessage('Section and Class Adviser updated.');
      } else {
        await apiClient.post(API_ROUTES.school.sections, payload);
        setSuccessMessage('New section and Class Adviser saved.');
      }

      setSectionForm({ id: null, name: '', grade_level: '', adviser_id: '', room_number: '', capacity: 45 });
      await loadData();
      if (onUpdated) onUpdated();
      if (onSuccess) onSuccess();
    } catch (err: unknown) {
      setError(extractApiError(err, 'Failed to save section.'));
    } finally {
      setSubmitting(false);
    }
  };

  const handleSaveSchedule = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!scheduleForm.section_id) {
      setError('Please select a class section.');
      return;
    }
    if (!scheduleForm.subject_id) {
      setError('Please select a subject.');
      return;
    }
    if (scheduleForm.start_time >= scheduleForm.end_time) {
      setError('End time must be later than start time.');
      return;
    }

    setSubmitting(true);
    setError(null);
    setSuccessMessage(null);

    const facultyPk = scheduleForm.faculty_id ? Number(scheduleForm.faculty_id) : null;
    const roomPk = scheduleForm.room_id ? Number(scheduleForm.room_id) : null;

    const payload = {
      section: Number(scheduleForm.section_id),
      section_id: Number(scheduleForm.section_id),
      subject: Number(scheduleForm.subject_id),
      subject_id: Number(scheduleForm.subject_id),
      faculty: facultyPk,
      faculty_id: facultyPk,
      room: roomPk,
      room_id: roomPk,
      start_time: scheduleForm.start_time,
      end_time: scheduleForm.end_time,
      days_of_week: sanitizeField(scheduleForm.days_of_week || 'MON-FRI', 30).trim() || 'MON-FRI',
    };

    try {
      if (scheduleForm.id) {
        await apiClient.patch(`${API_ROUTES.school.periods}${scheduleForm.id}/`, payload);
        setSuccessMessage('Class schedule and Subject Faculty updated.');
      } else {
        await apiClient.post(API_ROUTES.school.periods, payload);
        setSuccessMessage('New class period and Subject Faculty saved.');
      }

      setScheduleForm({
        id: null,
        section_id: '',
        subject_id: '',
        faculty_id: '',
        room_id: '',
        start_time: '07:30',
        end_time: '08:30',
        days_of_week: 'MON-FRI',
      });
      await loadData();
      if (onUpdated) onUpdated();
      if (onSuccess) onSuccess();
    } catch (err: unknown) {
      setError(extractApiError(err, 'Failed to save class schedule.'));
    } finally {
      setSubmitting(false);
    }
  };

  const handleSaveSimpleItem = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    setError(null);
    setSuccessMessage(null);

    try {
      const isEdit = Boolean(simpleForm.id);
      if (activeSubTab === 'ROOMS') {
        const cleanRoomName = sanitizeField(simpleForm.name, 60).trim();
        const cleanBuilding = sanitizeField(simpleForm.building, 80).trim();
        if (!cleanRoomName) {
          setError('Room name is required.');
          setSubmitting(false);
          return;
        }
        const payload = {
          name: cleanRoomName,
          building: cleanBuilding,
          capacity: Math.max(1, Number(simpleForm.capacity) || 45),
        };
        if (isEdit) {
          await apiClient.patch(`${API_ROUTES.school.rooms}${simpleForm.id}/`, payload);
        } else {
          await apiClient.post(API_ROUTES.school.rooms, payload);
        }
      } else if (activeSubTab === 'SUBJECTS') {
        const cleanCode = sanitizeField(simpleForm.code, 30).trim().toUpperCase();
        const cleanTitle = sanitizeField(simpleForm.title, 100).trim();
        if (!cleanCode || !cleanTitle) {
          setError('Subject code and title are required.');
          setSubmitting(false);
          return;
        }
        const payload = {
          code: cleanCode,
          title: cleanTitle,
          units: Math.max(1, Number(simpleForm.units) || 1),
        };
        if (isEdit) {
          await apiClient.patch(`${API_ROUTES.school.subjects}${simpleForm.id}/`, payload);
        } else {
          await apiClient.post(API_ROUTES.school.subjects, payload);
        }
      } else if (activeSubTab === 'GRADES') {
        const cleanCode = sanitizeField(simpleForm.code, 20).trim().toUpperCase();
        const cleanName = sanitizeField(simpleForm.name, 60).trim();
        if (!cleanCode || !cleanName) {
          setError('Grade code and name are required.');
          setSubmitting(false);
          return;
        }
        const payload = {
          code: cleanCode,
          name: cleanName,
          stage: sanitizeField(simpleForm.stage || 'JHS', 20).trim() || 'JHS',
          level_order: Number(simpleForm.level_order) || 1,
        };
        if (isEdit) {
          await apiClient.patch(`${API_ROUTES.school.gradeLevels}${simpleForm.id}/`, payload);
        } else {
          await apiClient.post(API_ROUTES.school.gradeLevels, payload);
        }
      } else if (activeSubTab === 'YEARS') {
        const cleanCode = sanitizeField(simpleForm.code, 20).trim();
        if (!cleanCode || !simpleForm.start_date || !simpleForm.end_date) {
          setError('School year code, start date, and end date are required.');
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
        if (isEdit) {
          await apiClient.patch(`${API_ROUTES.school.schoolYears}${simpleForm.id}/`, payload);
        } else {
          await apiClient.post(API_ROUTES.school.schoolYears, payload);
        }
      } else if (activeSubTab === 'HOLIDAYS') {
        const cleanReason = sanitizeField(simpleForm.holiday_reason, 140).trim();
        if (!simpleForm.holiday_date || !cleanReason) {
          setError('Holiday date and title/reason are required.');
          setSubmitting(false);
          return;
        }
        const payload = {
          date: simpleForm.holiday_date,
          type: simpleForm.holiday_type || 'HOLIDAY',
          reason: cleanReason,
        };
        if (isEdit) {
          await apiClient.patch(`${API_ROUTES.school.holidays}${simpleForm.id}/`, payload);
        } else {
          await apiClient.post(API_ROUTES.school.holidays, payload);
        }
      }

      resetSimpleForm();
      setSuccessMessage(isEdit ? 'Record updated.' : 'Record added.');
      await loadData();
      if (onUpdated) onUpdated();
      if (onSuccess) onSuccess();
    } catch (err: unknown) {
      setError(extractApiError(err, 'Failed to save record.'));
    } finally {
      setSubmitting(false);
    }
  };

  const handleDeleteItem = (baseRoute: string, id: number, label = 'Record') => {
    showConfirm({
      title: `Delete ${label}`,
      message: `Are you sure you want to permanently delete this ${label.toLowerCase()}?`,
      confirmLabel: 'Delete',
      isDestructive: true,
      onConfirm: async () => {
        setError(null);
        setSuccessMessage(null);
        try {
          await apiClient.delete(`${baseRoute}${id}/`);
          setSuccessMessage(`${label} deleted.`);
          await loadData();
          if (onUpdated) onUpdated();
          if (onSuccess) onSuccess();
        } catch (err: unknown) {
          setError(extractApiError(err, `Could not delete ${label.toLowerCase()}.`));
        }
      },
    });
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Academic Structure & Faculty Assignments">
      <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
        {/* Navigation Tabs */}
        <div
          style={{
            display: 'flex',
            gap: 8,
            borderBottom: `1px solid ${tokens.borderSubtle}`,
            paddingBottom: 8,
            overflowX: 'auto',
          }}
        >
          <button
            type="button"
            onClick={() => { setActiveSubTab('SECTIONS'); setError(null); setSuccessMessage(null); }}
            style={tabBtnStyle(activeSubTab === 'SECTIONS', brand.primary, tokens)}
          >
            <Users size={14} /> Sections &amp; Advisers
          </button>

          <button
            type="button"
            onClick={() => { setActiveSubTab('SCHEDULE'); setError(null); setSuccessMessage(null); }}
            style={tabBtnStyle(activeSubTab === 'SCHEDULE', brand.primary, tokens)}
          >
            <Clock size={14} /> Schedules &amp; Subject Faculty
          </button>

          <button
            type="button"
            onClick={() => { setActiveSubTab('SUBJECTS'); resetSimpleForm(); setError(null); setSuccessMessage(null); }}
            style={tabBtnStyle(activeSubTab === 'SUBJECTS', brand.primary, tokens)}
          >
            <BookOpen size={14} /> Subjects
          </button>

          <button
            type="button"
            onClick={() => { setActiveSubTab('ROOMS'); resetSimpleForm(); setError(null); setSuccessMessage(null); }}
            style={tabBtnStyle(activeSubTab === 'ROOMS', brand.primary, tokens)}
          >
            <DoorOpen size={14} /> Classrooms
          </button>

          <button
            type="button"
            onClick={() => { setActiveSubTab('GRADES'); resetSimpleForm(); setError(null); setSuccessMessage(null); }}
            style={tabBtnStyle(activeSubTab === 'GRADES', brand.primary, tokens)}
          >
            <Layers size={14} /> Grade Levels
          </button>

          <button
            type="button"
            onClick={() => { setActiveSubTab('YEARS'); resetSimpleForm(); setError(null); setSuccessMessage(null); }}
            style={tabBtnStyle(activeSubTab === 'YEARS', brand.primary, tokens)}
          >
            <Calendar size={14} /> School Years
          </button>

          <button
            type="button"
            onClick={() => { setActiveSubTab('HOLIDAYS'); resetSimpleForm(); setError(null); setSuccessMessage(null); }}
            style={tabBtnStyle(activeSubTab === 'HOLIDAYS', brand.primary, tokens)}
          >
            <Calendar size={14} /> Holidays
          </button>
        </div>

        {/* Status Alerts */}
        {loading && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: '0.76rem', color: tokens.textMuted }}>
            <Loader2 size={14} className="animate-spin" color={brand.primary} />
            <span>Loading academic records...</span>
          </div>
        )}

        {error && (
          <div style={alertBoxStyle(tokens.dangerLight, brand.danger)}>
            <AlertCircle size={15} />
            <span>{error}</span>
          </div>
        )}

        {successMessage && (
          <div style={alertBoxStyle(tokens.successLight, brand.success)}>
            <CheckCircle2 size={15} />
            <span>{successMessage}</span>
          </div>
        )}

        {/* 1. SECTIONS & CLASS ADVISER FORM */}
        {activeSubTab === 'SECTIONS' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            <form onSubmit={handleSaveSection} style={formCardStyle(tokens)}>
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
                    onChange={(e) => setSectionForm({ ...sectionForm, name: sanitizeField(e.target.value, 80) })}
                    style={inputStyle(tokens)}
                  />
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
                  <label style={labelStyle(tokens)}>Class Adviser (Faculty)</label>
                  <select
                    value={sectionForm.adviser_id}
                    onChange={(e) => setSectionForm({ ...sectionForm, adviser_id: e.target.value })}
                    style={inputStyle(tokens)}
                  >
                    <option value="">(None / Unassigned)</option>
                    {facultyList.map((f) => (
                      <option key={f.id} value={f.id}>
                        {f.full_name || f.name} {f.employee_id ? `(${f.employee_id})` : ''}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label style={labelStyle(tokens)}>Default Room Number</label>
                  <input
                    type="text"
                    maxLength={50}
                    placeholder="e.g. Room 204"
                    value={sectionForm.room_number}
                    onChange={(e) => setSectionForm({ ...sectionForm, room_number: sanitizeField(e.target.value, 50) })}
                    style={inputStyle(tokens)}
                  />
                </div>
              </div>

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 12 }}>
                {sectionForm.id && (
                  <Button
                    variant="secondary"
                    size="sm"
                    type="button"
                    onClick={() =>
                      setSectionForm({ id: null, name: '', grade_level: '', adviser_id: '', room_number: '', capacity: 45 })
                    }
                  >
                    Cancel Edit
                  </Button>
                )}
                <Button variant="primary" size="sm" type="submit" disabled={submitting}>
                  {submitting ? <Loader2 className="animate-spin" size={14} /> : sectionForm.id ? 'Save Changes' : 'Create Section'}
                </Button>
              </div>
            </form>

            <div style={tableContainer(tokens)}>
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
                      facultyList.find((f) => f.id === sec.adviser_id || f.id === sec.adviser)?.full_name ||
                      'Unassigned';

                    return (
                      <tr key={sec.id} style={{ borderBottom: `1px solid ${tokens.borderSubtle}` }}>
                        <td style={{ padding: '8px 10px', fontWeight: 700, color: tokens.textPrimary }}>{sec.name}</td>
                        <td style={{ padding: '8px 10px', color: tokens.textSecondary }}>
                          {sec.grade_level_name || sec.grade_level?.name || '—'}
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
                            onClick={() => {
                              const advId =
                                sec.adviser_id ??
                                (typeof sec.adviser === 'object' && sec.adviser ? sec.adviser.id : sec.adviser) ??
                                '';
                              setSectionForm({
                                id: sec.id,
                                name: sec.name,
                                grade_level: String(sec.grade_level?.id || sec.grade_level || ''),
                                adviser_id: String(advId || ''),
                                room_number: sec.room_number || '',
                                capacity: sec.capacity || 45,
                              });
                            }}
                            style={{ background: 'none', border: 'none', color: brand.primary, cursor: 'pointer', marginRight: 8 }}
                            title="Edit Section & Adviser"
                            aria-label={`Edit section ${sec.name}`}
                          >
                            <Edit2 size={13} />
                          </button>
                          <button
                            type="button"
                            onClick={() => handleDeleteItem(API_ROUTES.school.sections, sec.id, 'Section')}
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
        )}

        {/* 2. SCHEDULES & SUBJECT FACULTY FORM */}
        {activeSubTab === 'SCHEDULE' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            <form onSubmit={handleSaveSchedule} style={formCardStyle(tokens)}>
              <div style={{ fontSize: '0.82rem', fontWeight: 800, color: tokens.textPrimary, marginBottom: 8 }}>
                {scheduleForm.id ? 'Edit Class Schedule & Faculty' : 'Add Subject Period & Assign Faculty'}
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
                        {s.name} ({s.grade_level_name || s.grade_level?.name || 'Section'})
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
                  <label style={labelStyle(tokens)}>Subject Faculty</label>
                  <select
                    value={scheduleForm.faculty_id}
                    onChange={(e) => setScheduleForm({ ...scheduleForm, faculty_id: e.target.value })}
                    style={inputStyle(tokens)}
                  >
                    <option value="">(None / Unassigned)</option>
                    {facultyList.map((f) => (
                      <option key={f.id} value={f.id}>
                        {f.full_name || f.name} {f.employee_id ? `(${f.employee_id})` : ''}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label style={labelStyle(tokens)}>Classroom</label>
                  <select
                    value={scheduleForm.room_id}
                    onChange={(e) => setScheduleForm({ ...scheduleForm, room_id: e.target.value })}
                    style={inputStyle(tokens)}
                  >
                    <option value="">(Select Room)</option>
                    {rooms.map((r) => (
                      <option key={r.id} value={r.id}>
                        {r.name} {r.building ? `(${r.building})` : ''}
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
                    style={inputStyle(tokens)}
                  />
                </div>

                <div>
                  <label style={labelStyle(tokens)}>End Time</label>
                  <input
                    type="time"
                    required
                    value={scheduleForm.end_time}
                    onChange={(e) => setScheduleForm({ ...scheduleForm, end_time: e.target.value })}
                    style={inputStyle(tokens)}
                  />
                </div>
              </div>

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 12 }}>
                {scheduleForm.id && (
                  <Button
                    variant="secondary"
                    size="sm"
                    type="button"
                    onClick={() =>
                      setScheduleForm({
                        id: null,
                        section_id: '',
                        subject_id: '',
                        faculty_id: '',
                        room_id: '',
                        start_time: '07:30',
                        end_time: '08:30',
                        days_of_week: 'MON-FRI',
                      })
                    }
                  >
                    Cancel Edit
                  </Button>
                )}
                <Button variant="primary" size="sm" type="submit" disabled={submitting}>
                  {submitting
                    ? <Loader2 className="animate-spin" size={14} />
                    : scheduleForm.id
                      ? 'Save Changes'
                      : 'Create Class Period'}
                </Button>
              </div>
            </form>

            <div style={tableContainer(tokens)}>
              <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: '0.78rem' }}>
                <thead>
                  <tr style={{ borderBottom: `1px solid ${tokens.borderSubtle}`, backgroundColor: tokens.bgSurfaceSubtle }}>
                    <th style={{ padding: '8px 10px', color: tokens.textMuted }}>Section</th>
                    <th style={{ padding: '8px 10px', color: tokens.textMuted }}>Subject</th>
                    <th style={{ padding: '8px 10px', color: tokens.textMuted }}>Subject Faculty</th>
                    <th style={{ padding: '8px 10px', color: tokens.textMuted }}>Time</th>
                    <th style={{ padding: '8px 10px', textAlign: 'right', color: tokens.textMuted }}>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {schedules.map((sc) => {
                    const secName = sc.section_name || sc.section?.name || 'Section';
                    const subCode = sc.subject_code || sc.subject?.code || 'SUB';
                    const facultyName = extractFacultyName(sc, facultyList);

                    return (
                      <tr key={sc.id} style={{ borderBottom: `1px solid ${tokens.borderSubtle}` }}>
                        <td style={{ padding: '8px 10px', fontWeight: 700, color: tokens.textPrimary }}>{secName}</td>
                        <td style={{ padding: '8px 10px', color: brand.primary, fontWeight: 700 }}>{subCode}</td>
                        <td
                          style={{
                            padding: '8px 10px',
                            color: facultyName === 'Unassigned' ? brand.warning : tokens.textSecondary,
                            fontWeight: 600,
                          }}
                        >
                          {facultyName}
                        </td>
                        <td style={{ padding: '8px 10px', color: tokens.textMuted }}>
                          {String(sc.start_time).slice(0, 5)} - {String(sc.end_time).slice(0, 5)}
                        </td>
                        <td style={{ padding: '8px 10px', textAlign: 'right' }}>
                          <button
                            type="button"
                            onClick={() => {
                              const secId =
                                sc.section_id ??
                                (typeof sc.section === 'object' && sc.section ? sc.section.id : sc.section) ??
                                '';
                              const subId =
                                sc.subject_id ??
                                (typeof sc.subject === 'object' && sc.subject ? sc.subject.id : sc.subject) ??
                                '';
                              const facId = extractFacultyId(sc);
                              const roomId =
                                sc.room_id ??
                                (typeof sc.room === 'object' && sc.room ? sc.room.id : sc.room) ??
                                '';

                              setScheduleForm({
                                id: sc.id,
                                section_id: String(secId || ''),
                                subject_id: String(subId || ''),
                                faculty_id: facId,
                                room_id:
                                  typeof roomId === 'number' || /^\d+$/.test(String(roomId))
                                    ? String(roomId)
                                    : '',
                                start_time: sc.start_time ? String(sc.start_time).slice(0, 5) : '07:30',
                                end_time: sc.end_time ? String(sc.end_time).slice(0, 5) : '08:30',
                                days_of_week: sc.days_of_week || 'MON-FRI',
                              });
                            }}
                            style={{ background: 'none', border: 'none', color: brand.primary, cursor: 'pointer', marginRight: 8 }}
                            title="Edit Schedule & Faculty"
                            aria-label={`Edit schedule ${subCode}`}
                          >
                            <Edit2 size={13} />
                          </button>
                          <button
                            type="button"
                            onClick={() => handleDeleteItem(API_ROUTES.school.periods, sc.id, 'Class Schedule')}
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
        )}

        {/* 3. FULL CRUD MODES: ROOMS, SUBJECTS, GRADES, YEARS, HOLIDAYS */}
        {!['SECTIONS', 'SCHEDULE'].includes(activeSubTab) && (
          <form onSubmit={handleSaveSimpleItem} style={{ ...formCardStyle(tokens), display: 'flex', flexDirection: 'column', gap: 10 }}>
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
                      onChange={(e) => setSimpleForm({ ...simpleForm, name: sanitizeField(e.target.value, 60) })}
                      style={inputStyle(tokens)}
                    />
                  </div>
                  <div style={{ flex: 1, minWidth: 120 }}>
                    <label style={labelStyle(tokens)}>Building</label>
                    <input
                      type="text"
                      maxLength={80}
                      placeholder="e.g. Science Wing"
                      value={simpleForm.building}
                      onChange={(e) => setSimpleForm({ ...simpleForm, building: sanitizeField(e.target.value, 80) })}
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
                      onChange={(e) => setSimpleForm({ ...simpleForm, code: sanitizeField(e.target.value, 20) })}
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
                      onChange={(e) => setSimpleForm({ ...simpleForm, name: sanitizeField(e.target.value, 60) })}
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
                      onChange={(e) => setSimpleForm({ ...simpleForm, code: sanitizeField(e.target.value, 30) })}
                      style={inputStyle(tokens)}
                    />
                  </div>
                  <div style={{ flex: 2, minWidth: 140 }}>
                    <label style={labelStyle(tokens)}>Subject Title *</label>
                    <input
                      type="text"
                      required
                      maxLength={100}
                      placeholder="e.g. Mathematics 7"
                      value={simpleForm.title}
                      onChange={(e) => setSimpleForm({ ...simpleForm, title: sanitizeField(e.target.value, 100) })}
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
                      onChange={(e) => setSimpleForm({ ...simpleForm, code: sanitizeField(e.target.value, 20) })}
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
                  <label style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: '0.74rem', color: tokens.textPrimary, paddingBottom: 6, cursor: 'pointer' }}>
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
                      onChange={(e) => setSimpleForm({ ...simpleForm, holiday_reason: sanitizeField(e.target.value, 140) })}
                      style={inputStyle(tokens)}
                    />
                  </div>
                </>
              )}

              <div style={{ display: 'inline-flex', gap: 6 }}>
                {simpleForm.id && (
                  <Button variant="secondary" size="sm" type="button" onClick={resetSimpleForm}>
                    Cancel
                  </Button>
                )}
                <Button variant="primary" size="sm" type="submit" disabled={submitting}>
                  {submitting ? <Loader2 className="animate-spin" size={14} /> : simpleForm.id ? 'Save Changes' : 'Add Record'}
                </Button>
              </div>
            </div>
          </form>
        )}

        {!['SECTIONS', 'SCHEDULE'].includes(activeSubTab) && (
          <div style={tableContainer(tokens)}>
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
                      <td style={{ padding: '8px 10px', textAlign: 'right' }}>
                        <button
                          type="button"
                          onClick={() =>
                            setSimpleForm({
                              ...simpleForm,
                              id: y.id,
                              code: y.code || '',
                              start_date: y.start_date || '',
                              baseline_cutoff_date: y.baseline_cutoff_date || y.start_date || '',
                              end_date: y.end_date || '',
                              is_active: Boolean(y.is_active),
                            })
                          }
                          aria-label={`Edit school year ${y.code}`}
                          title="Edit School Year"
                          style={{ background: 'none', border: 'none', color: brand.primary, cursor: 'pointer', marginRight: 8 }}
                        >
                          <Edit2 size={13} />
                        </button>
                        <button
                          type="button"
                          onClick={() => handleDeleteItem(API_ROUTES.school.schoolYears, y.id, 'School Year')}
                          aria-label={`Delete school year ${y.code}`}
                          title="Delete School Year"
                          style={{ background: 'none', border: 'none', color: brand.danger, cursor: 'pointer' }}
                        >
                          <Trash2 size={13} />
                        </button>
                      </td>
                    </tr>
                  ))}

                {activeSubTab === 'GRADES' &&
                  grades.map((g) => (
                    <tr key={g.id} style={{ borderBottom: `1px solid ${tokens.borderSubtle}` }}>
                      <td style={{ padding: '8px 10px', fontWeight: 700, color: tokens.textPrimary }}>{g.code}</td>
                      <td style={{ padding: '8px 10px', color: tokens.textSecondary }}>
                        {g.name} {g.stage ? `• ${g.stage}` : ''}
                      </td>
                      <td style={{ padding: '8px 10px', textAlign: 'right' }}>
                        <button
                          type="button"
                          onClick={() =>
                            setSimpleForm({
                              ...simpleForm,
                              id: g.id,
                              code: g.code || '',
                              name: g.name || '',
                              stage: g.stage || 'JHS',
                              level_order: Number(g.level_order) || 1,
                            })
                          }
                          aria-label={`Edit grade ${g.name}`}
                          title="Edit Grade Level"
                          style={{ background: 'none', border: 'none', color: brand.primary, cursor: 'pointer', marginRight: 8 }}
                        >
                          <Edit2 size={13} />
                        </button>
                        <button
                          type="button"
                          onClick={() => handleDeleteItem(API_ROUTES.school.gradeLevels, g.id, 'Grade Level')}
                          aria-label={`Delete grade ${g.name}`}
                          title="Delete Grade Level"
                          style={{ background: 'none', border: 'none', color: brand.danger, cursor: 'pointer' }}
                        >
                          <Trash2 size={13} />
                        </button>
                      </td>
                    </tr>
                  ))}

                {activeSubTab === 'ROOMS' &&
                  rooms.map((r) => (
                    <tr key={r.id} style={{ borderBottom: `1px solid ${tokens.borderSubtle}` }}>
                      <td style={{ padding: '8px 10px', fontWeight: 700, color: tokens.textPrimary }}>{r.name}</td>
                      <td style={{ padding: '8px 10px', color: tokens.textSecondary }}>
                        {r.building ? `${r.building} • ` : ''}Cap: {r.capacity}
                      </td>
                      <td style={{ padding: '8px 10px', textAlign: 'right' }}>
                        <button
                          type="button"
                          onClick={() =>
                            setSimpleForm({
                              ...simpleForm,
                              id: r.id,
                              name: r.name || '',
                              building: r.building || '',
                              capacity: Number(r.capacity) || 45,
                            })
                          }
                          aria-label={`Edit classroom ${r.name}`}
                          title="Edit Classroom"
                          style={{ background: 'none', border: 'none', color: brand.primary, cursor: 'pointer', marginRight: 8 }}
                        >
                          <Edit2 size={13} />
                        </button>
                        <button
                          type="button"
                          onClick={() => handleDeleteItem(API_ROUTES.school.rooms, r.id, 'Classroom')}
                          aria-label={`Delete classroom ${r.name}`}
                          title="Delete Classroom"
                          style={{ background: 'none', border: 'none', color: brand.danger, cursor: 'pointer' }}
                        >
                          <Trash2 size={13} />
                        </button>
                      </td>
                    </tr>
                  ))}

                {activeSubTab === 'SUBJECTS' &&
                  subjects.map((s) => (
                    <tr key={s.id} style={{ borderBottom: `1px solid ${tokens.borderSubtle}` }}>
                      <td style={{ padding: '8px 10px', fontWeight: 700, color: tokens.textPrimary }}>{s.code}</td>
                      <td style={{ padding: '8px 10px', color: tokens.textSecondary }}>
                        {s.title} {s.units ? `• ${s.units} unit(s)` : ''}
                      </td>
                      <td style={{ padding: '8px 10px', textAlign: 'right' }}>
                        <button
                          type="button"
                          onClick={() =>
                            setSimpleForm({
                              ...simpleForm,
                              id: s.id,
                              code: s.code || '',
                              title: s.title || '',
                              units: Number(s.units) || 1,
                            })
                          }
                          aria-label={`Edit subject ${s.code}`}
                          title="Edit Subject"
                          style={{ background: 'none', border: 'none', color: brand.primary, cursor: 'pointer', marginRight: 8 }}
                        >
                          <Edit2 size={13} />
                        </button>
                        <button
                          type="button"
                          onClick={() => handleDeleteItem(API_ROUTES.school.subjects, s.id, 'Subject')}
                          aria-label={`Delete subject ${s.code}`}
                          title="Delete Subject"
                          style={{ background: 'none', border: 'none', color: brand.danger, cursor: 'pointer' }}
                        >
                          <Trash2 size={13} />
                        </button>
                      </td>
                    </tr>
                  ))}

                {activeSubTab === 'HOLIDAYS' &&
                  holidays.map((h) => (
                    <tr key={h.id} style={{ borderBottom: `1px solid ${tokens.borderSubtle}` }}>
                      <td style={{ padding: '8px 10px', fontWeight: 700, color: tokens.textPrimary }}>
                        {h.date}
                      </td>
                      <td style={{ padding: '8px 10px', color: tokens.textSecondary }}>
                        <strong style={{ color: brand.primary, marginRight: 6 }}>[{h.type || 'HOLIDAY'}]</strong>
                        {h.reason || h.title}
                      </td>
                      <td style={{ padding: '8px 10px', textAlign: 'right' }}>
                        <button
                          type="button"
                          onClick={() =>
                            setSimpleForm({
                              ...simpleForm,
                              id: h.id,
                              holiday_date: h.date || '',
                              holiday_type: h.type || 'HOLIDAY',
                              holiday_reason: h.reason || h.title || '',
                            })
                          }
                          aria-label={`Edit holiday ${h.date}`}
                          title="Edit Holiday"
                          style={{ background: 'none', border: 'none', color: brand.primary, cursor: 'pointer', marginRight: 8 }}
                        >
                          <Edit2 size={13} />
                        </button>
                        <button
                          type="button"
                          onClick={() => handleDeleteItem(API_ROUTES.school.holidays, h.id, 'Calendar Override')}
                          aria-label={`Delete holiday ${h.date}`}
                          title="Delete Holiday"
                          style={{ background: 'none', border: 'none', color: brand.danger, cursor: 'pointer' }}
                        >
                          <Trash2 size={13} />
                        </button>
                      </td>
                    </tr>
                  ))}
              </tbody>
            </table>
          </div>
        )}

        <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 8 }}>
          <Button variant="secondary" size="md" type="button" onClick={onClose}>
            Close
          </Button>
        </div>
      </div>
    </Modal>
  );
};

const tabBtnStyle = (active: boolean, brandColor: string, tokens: any): React.CSSProperties => ({
  padding: '6px 12px',
  borderRadius: 6,
  border: active ? `1px solid ${brandColor}` : '1px solid transparent',
  backgroundColor: active ? tokens.primaryLight : 'transparent',
  color: active ? brandColor : tokens.textSecondary,
  fontWeight: 700,
  fontSize: '0.78rem',
  cursor: 'pointer',
  display: 'flex',
  alignItems: 'center',
  gap: 6,
  whiteSpace: 'nowrap',
});

const formCardStyle = (tokens: any): React.CSSProperties => ({
  padding: 12,
  borderRadius: 8,
  backgroundColor: tokens.bgSurfaceSubtle,
  border: `1px solid ${tokens.borderSubtle}`,
});

const labelStyle = (tokens: any): React.CSSProperties => ({
  display: 'block',
  fontSize: '0.70rem',
  fontWeight: 700,
  color: tokens.textSecondary,
  marginBottom: 3,
});

const inputStyle = (tokens: any): React.CSSProperties => ({
  width: '100%',
  padding: '6px 10px',
  borderRadius: 6,
  border: `1px solid ${tokens.borderStrong}`,
  backgroundColor: tokens.bgSurface,
  color: tokens.textPrimary,
  fontSize: '0.78rem',
  boxSizing: 'border-box',
  outline: 'none',
});

const tableContainer = (tokens: any): React.CSSProperties => ({
  maxHeight: 240,
  overflowY: 'auto',
  backgroundColor: tokens.bgSurface,
  border: `1px solid ${tokens.borderSubtle}`,
  borderRadius: 8,
});

const alertBoxStyle = (bg: string, color: string): React.CSSProperties => ({
  display: 'flex',
  alignItems: 'center',
  gap: 8,
  padding: '8px 12px',
  borderRadius: 6,
  backgroundColor: bg,
  color,
  fontSize: '0.78rem',
  fontWeight: 600,
});

export default AcademicSetupModal;