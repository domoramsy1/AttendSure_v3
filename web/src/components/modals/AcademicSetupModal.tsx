/**
 * AttendSure - Academic Structure Setup Modal
 * File: web/src/components/modals/AcademicSetupModal.tsx
 * Allows management of Sections, Advisers, Schedules, and Subject Faculty.
 */

import React, { useState, useEffect, useCallback } from 'react';
import apiClient from '../../api/client';
import { useTheme } from '../../context/ThemeContext';
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
  | 'YEARS';

export interface AcademicSetupModalProps {
  isOpen: boolean;
  onClose: () => void;
  onUpdated?: () => void;
  onSuccess?: () => void;
  initialTab?: TabType;
  editItem?: any;
}

const normalizeTab = (tab: TabType): 'SECTIONS' | 'SCHEDULE' | 'ROOMS' | 'SUBJECTS' | 'GRADES' | 'YEARS' => {
  if (tab === 'SECTION' || tab === 'SECTIONS') return 'SECTIONS';
  if (tab === 'SCHEDULE') return 'SCHEDULE';
  if (tab === 'ROOM' || tab === 'ROOMS') return 'ROOMS';
  if (tab === 'SUBJECT' || tab === 'SUBJECTS') return 'SUBJECTS';
  if (tab === 'GRADES') return 'GRADES';
  return 'YEARS';
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

  const [activeSubTab, setActiveSubTab] = useState<
    'SECTIONS' | 'SCHEDULE' | 'ROOMS' | 'SUBJECTS' | 'GRADES' | 'YEARS'
  >(normalizeTab(initialTab));

  const [loading, setLoading] = useState<boolean>(false);
  const [submitting, setSubmitting] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  // Database Records
  const [years, setYears] = useState<any[]>([]);
  const [grades, setGrades] = useState<any[]>([]);
  const [rooms, setRooms] = useState<any[]>([]);
  const [subjects, setSubjects] = useState<any[]>([]);
  const [sections, setSections] = useState<any[]>([]);
  const [facultyList, setFacultyList] = useState<any[]>([]);
  const [schedules, setSchedules] = useState<any[]>([]);

  // Section & Adviser Form State
  const [sectionForm, setSectionForm] = useState({
    id: null as number | null,
    name: '',
    grade_level: '',
    adviser_id: '',
    room_number: '',
    capacity: 45,
  });

  // Schedule & Subject Faculty Form State
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

  // Simple Structural Forms (Rooms, Subjects, Grades)
  const [simpleForm, setSimpleForm] = useState({
    code: '',
    name: '',
    building: '',
    capacity: 45,
    title: '',
    units: 1,
  });

  // Synchronize Tab & Edit Item
  useEffect(() => {
    if (initialTab) {
      const target = normalizeTab(initialTab);
      setActiveSubTab(target);

      if (editItem) {
        if (target === 'SECTIONS') {
          const advId =
            editItem.adviser_id ||
            (typeof editItem.adviser === 'object' && editItem.adviser ? editItem.adviser.id : editItem.adviser) ||
            '';
          const gradeId =
            editItem.grade_level_id ||
            (typeof editItem.grade_level === 'object' && editItem.grade_level ? editItem.grade_level.id : editItem.grade_level) ||
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
            editItem.section_id ||
            (typeof editItem.section === 'object' && editItem.section ? editItem.section.id : editItem.section) ||
            '';
          const subId =
            editItem.subject_id ||
            (typeof editItem.subject === 'object' && editItem.subject ? editItem.subject.id : editItem.subject) ||
            '';
          const facId =
            editItem.faculty_id ||
            (typeof editItem.faculty === 'object' && editItem.faculty ? editItem.faculty.id : editItem.faculty) ||
            '';
          const roomId =
            (typeof editItem.room === 'object' && editItem.room ? editItem.room.id : editItem.room) || '';

          setScheduleForm({
            id: editItem.id || null,
            section_id: String(secId || ''),
            subject_id: String(subId || ''),
            faculty_id: String(facId || ''),
            room_id: String(roomId || ''),
            start_time: editItem.start_time ? String(editItem.start_time).slice(0, 5) : '07:30',
            end_time: editItem.end_time ? String(editItem.end_time).slice(0, 5) : '08:30',
            days_of_week: editItem.days_of_week || 'MON-FRI',
          });
        }
      } else {
        // Reset to clean states
        setSectionForm({ id: null, name: '', grade_level: '', adviser_id: '', room_number: '', capacity: 45 });
        setScheduleForm({ id: null, section_id: '', subject_id: '', faculty_id: '', room_id: '', start_time: '07:30', end_time: '08:30', days_of_week: 'MON-FRI' });
      }
    }
  }, [initialTab, editItem]);

  // Fast Batch Data Loading
  const loadData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const results = await Promise.allSettled([
        apiClient.get('/academic-years/'),
        apiClient.get('/grade-levels/'),
        apiClient.get('/rooms/'),
        apiClient.get('/subjects/'),
        apiClient.get('/sections/?page_size=300'),
        apiClient.get('/faculty/dropdown/').catch(() => apiClient.get('/faculties/')),
        apiClient.get('/schedules/?page_size=300'),
      ]);

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
    } catch {
      setError('Could not fetch academic records.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (isOpen) {
      loadData();
    }
  }, [isOpen, loadData]);

  // Handle Section & Adviser Save
  const handleSaveSection = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!sectionForm.name.trim()) {
      setError('Section name is required.');
      return;
    }
    if (!sectionForm.grade_level) {
      setError('Please select a grade level.');
      return;
    }

    setSubmitting(true);
    setError(null);

    const payload = {
      name: sectionForm.name.trim(),
      grade_level: Number(sectionForm.grade_level),
      adviser_id: sectionForm.adviser_id ? Number(sectionForm.adviser_id) : null,
      adviser: sectionForm.adviser_id ? Number(sectionForm.adviser_id) : null,
      room_number: sectionForm.room_number.trim(),
      capacity: Number(sectionForm.capacity) || 45,
    };

    try {
      if (sectionForm.id) {
        await apiClient.patch(`/sections/${sectionForm.id}/`, payload);
        setSuccessMessage('Section and Class Adviser updated successfully.');
      } else {
        await apiClient.post('/sections/', payload);
        setSuccessMessage('New Section and Class Adviser assigned.');
      }

      setSectionForm({ id: null, name: '', grade_level: '', adviser_id: '', room_number: '', capacity: 45 });
      loadData();
      if (onUpdated) onUpdated();
      if (onSuccess) onSuccess();
    } catch (err: any) {
      setError(err.response?.data?.detail || err.response?.data?.error || 'Failed to save section.');
    } finally {
      setSubmitting(false);
    }
  };

  // Handle Class Schedule & Subject Faculty Save
  const handleSaveSchedule = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!scheduleForm.section_id) {
      setError('Please select a class section.');
      return;
    }
    if (!scheduleForm.subject_id) {
      setError('Please select an academic subject.');
      return;
    }

    setSubmitting(true);
    setError(null);

    const payload = {
      section: Number(scheduleForm.section_id),
      section_id: Number(scheduleForm.section_id),
      subject: Number(scheduleForm.subject_id),
      subject_id: Number(scheduleForm.subject_id),
      faculty: scheduleForm.faculty_id ? Number(scheduleForm.faculty_id) : null,
      faculty_id: scheduleForm.faculty_id ? Number(scheduleForm.faculty_id) : null,
      room: scheduleForm.room_id ? Number(scheduleForm.room_id) : null,
      start_time: scheduleForm.start_time,
      end_time: scheduleForm.end_time,
      days_of_week: scheduleForm.days_of_week || 'MON-FRI',
    };

    try {
      if (scheduleForm.id) {
        await apiClient.patch(`/schedules/${scheduleForm.id}/`, payload);
        setSuccessMessage('Class schedule and Subject Faculty updated.');
      } else {
        await apiClient.post('/schedules/', payload);
        setSuccessMessage('New class period and Subject Faculty assigned.');
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
      loadData();
      if (onUpdated) onUpdated();
      if (onSuccess) onSuccess();
    } catch (err: any) {
      setError(err.response?.data?.detail || err.response?.data?.error || 'Failed to save schedule period.');
    } finally {
      setSubmitting(false);
    }
  };

  // Handle Simple Items (Rooms, Subjects, Grades)
  const handleAddSimpleItem = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    setError(null);

    try {
      if (activeSubTab === 'ROOMS') {
        await apiClient.post('/rooms/', {
          name: simpleForm.name.trim(),
          building: simpleForm.building.trim(),
          capacity: Number(simpleForm.capacity) || 45,
        });
      } else if (activeSubTab === 'SUBJECTS') {
        await apiClient.post('/subjects/', {
          code: simpleForm.code.trim().toUpperCase(),
          title: simpleForm.title.trim(),
          units: Number(simpleForm.units) || 1,
        });
      } else if (activeSubTab === 'GRADES') {
        await apiClient.post('/grade-levels/', {
          code: simpleForm.code.trim().toUpperCase(),
          name: simpleForm.name.trim(),
        });
      }

      setSimpleForm({ code: '', name: '', building: '', capacity: 45, title: '', units: 1 });
      loadData();
      if (onUpdated) onUpdated();
      if (onSuccess) onSuccess();
    } catch (err: any) {
      setError(err.response?.data?.detail || 'Failed to save record.');
    } finally {
      setSubmitting(false);
    }
  };

  const handleDeleteItem = async (endpoint: string, id: number) => {
    if (!confirm('Are you sure you want to delete this record?')) return;
    try {
      await apiClient.delete(`/${endpoint}/${id}/`);
      loadData();
      if (onUpdated) onUpdated();
      if (onSuccess) onSuccess();
    } catch {
      alert('Could not delete record.');
    }
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
            onClick={() => { setActiveSubTab('SUBJECTS'); setError(null); setSuccessMessage(null); }}
            style={tabBtnStyle(activeSubTab === 'SUBJECTS', brand.primary, tokens)}
          >
            <BookOpen size={14} /> Subjects
          </button>

          <button
            type="button"
            onClick={() => { setActiveSubTab('ROOMS'); setError(null); setSuccessMessage(null); }}
            style={tabBtnStyle(activeSubTab === 'ROOMS', brand.primary, tokens)}
          >
            <DoorOpen size={14} /> Classrooms
          </button>

          <button
            type="button"
            onClick={() => { setActiveSubTab('GRADES'); setError(null); setSuccessMessage(null); }}
            style={tabBtnStyle(activeSubTab === 'GRADES', brand.primary, tokens)}
          >
            <Layers size={14} /> Grade Levels
          </button>

          <button
            type="button"
            onClick={() => { setActiveSubTab('YEARS'); setError(null); setSuccessMessage(null); }}
            style={tabBtnStyle(activeSubTab === 'YEARS', brand.primary, tokens)}
          >
            <Calendar size={14} /> School Years
          </button>
        </div>

        {/* Status Alerts */}
        {error && (
          <div style={alertBoxStyle('rgba(239, 68, 68, 0.12)', brand.danger)}>
            <AlertCircle size={15} />
            <span>{error}</span>
          </div>
        )}

        {successMessage && (
          <div style={alertBoxStyle('rgba(16, 185, 129, 0.12)', brand.success)}>
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
                    placeholder="e.g. Diamond"
                    value={sectionForm.name}
                    onChange={(e) => setSectionForm({ ...sectionForm, name: e.target.value })}
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

                {/* Class Adviser Selection */}
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
                    placeholder="e.g. Room 204"
                    value={sectionForm.room_number}
                    onChange={(e) => setSectionForm({ ...sectionForm, room_number: e.target.value })}
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
                    onClick={() => setSectionForm({ id: null, name: '', grade_level: '', adviser_id: '', room_number: '', capacity: 45 })}
                  >
                    Cancel Edit
                  </Button>
                )}
                <Button variant="primary" size="sm" type="submit" disabled={submitting}>
                  {submitting ? <Loader2 className="animate-spin" size={14} /> : sectionForm.id ? 'Save Changes' : 'Create Section'}
                </Button>
              </div>
            </form>

            {/* List Existing Sections with Adviser */}
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
                        <td style={{ padding: '8px 10px', color: tokens.textSecondary }}>{sec.grade_level_name || sec.grade_level?.name || '—'}</td>
                        <td style={{ padding: '8px 10px', color: adviserName === 'Unassigned' ? brand.warning : brand.primary, fontWeight: 600 }}>
                          {adviserName}
                        </td>
                        <td style={{ padding: '8px 10px', textAlign: 'right' }}>
                          <button
                            type="button"
                            onClick={() => {
                              const advId = sec.adviser_id || (typeof sec.adviser === 'object' && sec.adviser ? sec.adviser.id : sec.adviser) || '';
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
                          >
                            <Edit2 size={13} />
                          </button>
                          <button
                            type="button"
                            onClick={() => handleDeleteItem('sections', sec.id)}
                            style={{ background: 'none', border: 'none', color: brand.danger, cursor: 'pointer' }}
                            title="Delete Section"
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

                {/* Subject Faculty Selection */}
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
                    onClick={() => setScheduleForm({ id: null, section_id: '', subject_id: '', faculty_id: '', room_id: '', start_time: '07:30', end_time: '08:30', days_of_week: 'MON-FRI' })}
                  >
                    Cancel Edit
                  </Button>
                )}
                <Button variant="primary" size="sm" type="submit" disabled={submitting}>
                  {submitting ? <Loader2 className="animate-spin" size={14} /> : scheduleForm.id ? 'Save Changes' : 'Create Class Period'}
                </Button>
              </div>
            </form>

            {/* List Existing Schedules */}
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
                    const facultyName =
                      sc.faculty_name ||
                      (typeof sc.faculty === 'object' && sc.faculty ? sc.faculty.full_name || sc.faculty.name : null) ||
                      facultyList.find((f) => f.id === sc.faculty_id || f.id === sc.faculty)?.full_name ||
                      'Unassigned';

                    return (
                      <tr key={sc.id} style={{ borderBottom: `1px solid ${tokens.borderSubtle}` }}>
                        <td style={{ padding: '8px 10px', fontWeight: 700, color: tokens.textPrimary }}>{secName}</td>
                        <td style={{ padding: '8px 10px', color: brand.primary, fontWeight: 700 }}>{subCode}</td>
                        <td style={{ padding: '8px 10px', color: facultyName === 'Unassigned' ? brand.warning : tokens.textSecondary, fontWeight: 600 }}>
                          {facultyName}
                        </td>
                        <td style={{ padding: '8px 10px', color: tokens.textMuted }}>
                          {String(sc.start_time).slice(0, 5)} - {String(sc.end_time).slice(0, 5)}
                        </td>
                        <td style={{ padding: '8px 10px', textAlign: 'right' }}>
                          <button
                            type="button"
                            onClick={() => {
                              const secId = sc.section_id || (typeof sc.section === 'object' && sc.section ? sc.section.id : sc.section) || '';
                              const subId = sc.subject_id || (typeof sc.subject === 'object' && sc.subject ? sc.subject.id : sc.subject) || '';
                              const facId = sc.faculty_id || (typeof sc.faculty === 'object' && sc.faculty ? sc.faculty.id : sc.faculty) || '';
                              const roomId = (typeof sc.room === 'object' && sc.room ? sc.room.id : sc.room) || '';

                              setScheduleForm({
                                id: sc.id,
                                section_id: String(secId || ''),
                                subject_id: String(subId || ''),
                                faculty_id: String(facId || ''),
                                room_id: String(roomId || ''),
                                start_time: sc.start_time ? String(sc.start_time).slice(0, 5) : '07:30',
                                end_time: sc.end_time ? String(sc.end_time).slice(0, 5) : '08:30',
                                days_of_week: sc.days_of_week || 'MON-FRI',
                              });
                            }}
                            style={{ background: 'none', border: 'none', color: brand.primary, cursor: 'pointer', marginRight: 8 }}
                            title="Edit Schedule & Faculty"
                          >
                            <Edit2 size={13} />
                          </button>
                          <button
                            type="button"
                            onClick={() => handleDeleteItem('schedules', sc.id)}
                            style={{ background: 'none', border: 'none', color: brand.danger, cursor: 'pointer' }}
                            title="Delete Schedule"
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

        {/* 3. SIMPLE MODES: ROOMS, SUBJECTS, GRADES, YEARS */}
        {!['SECTIONS', 'SCHEDULE'].includes(activeSubTab) && (
          <form onSubmit={handleAddSimpleItem} style={{ display: 'flex', gap: 8, alignItems: 'flex-end', flexWrap: 'wrap' }}>
            {activeSubTab === 'ROOMS' && (
              <>
                <div style={{ flex: 1, minWidth: 120 }}>
                  <label style={labelStyle(tokens)}>Room Name</label>
                  <input
                    type="text"
                    required
                    placeholder="e.g. Room 101"
                    value={simpleForm.name}
                    onChange={(e) => setSimpleForm({ ...simpleForm, name: e.target.value })}
                    style={inputStyle(tokens)}
                  />
                </div>
                <div style={{ flex: 1, minWidth: 120 }}>
                  <label style={labelStyle(tokens)}>Building</label>
                  <input
                    type="text"
                    placeholder="e.g. Science Wing"
                    value={simpleForm.building}
                    onChange={(e) => setSimpleForm({ ...simpleForm, building: e.target.value })}
                    style={inputStyle(tokens)}
                  />
                </div>
              </>
            )}

            {activeSubTab === 'GRADES' && (
              <>
                <div style={{ flex: 1, minWidth: 100 }}>
                  <label style={labelStyle(tokens)}>Grade Code</label>
                  <input
                    type="text"
                    required
                    placeholder="e.g. G7"
                    value={simpleForm.code}
                    onChange={(e) => setSimpleForm({ ...simpleForm, code: e.target.value })}
                    style={inputStyle(tokens)}
                  />
                </div>
                <div style={{ flex: 2, minWidth: 140 }}>
                  <label style={labelStyle(tokens)}>Grade Name</label>
                  <input
                    type="text"
                    required
                    placeholder="e.g. Grade 7"
                    value={simpleForm.name}
                    onChange={(e) => setSimpleForm({ ...simpleForm, name: e.target.value })}
                    style={inputStyle(tokens)}
                  />
                </div>
              </>
            )}

            {activeSubTab === 'SUBJECTS' && (
              <>
                <div style={{ flex: 1, minWidth: 100 }}>
                  <label style={labelStyle(tokens)}>Subject Code</label>
                  <input
                    type="text"
                    required
                    placeholder="e.g. MATH7"
                    value={simpleForm.code}
                    onChange={(e) => setSimpleForm({ ...simpleForm, code: e.target.value })}
                    style={inputStyle(tokens)}
                  />
                </div>
                <div style={{ flex: 2, minWidth: 140 }}>
                  <label style={labelStyle(tokens)}>Subject Title</label>
                  <input
                    type="text"
                    required
                    placeholder="e.g. Mathematics 7"
                    value={simpleForm.title}
                    onChange={(e) => setSimpleForm({ ...simpleForm, title: e.target.value })}
                    style={inputStyle(tokens)}
                  />
                </div>
              </>
            )}

            {activeSubTab !== 'YEARS' && (
              <Button variant="primary" size="sm" type="submit" disabled={submitting}>
                {submitting ? <Loader2 className="animate-spin" size={14} /> : 'Add Record'}
              </Button>
            )}
          </form>
        )}

        {/* Simple Tables */}
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
                        {y.is_active ? <span style={{ color: brand.success, fontWeight: 700 }}>Active School Year</span> : 'Archived'}
                      </td>
                      <td style={{ padding: '8px 10px', textAlign: 'right' }}>
                        <span style={{ fontSize: '0.70rem', color: tokens.textMuted }}>Locked</span>
                      </td>
                    </tr>
                  ))}

                {activeSubTab === 'GRADES' &&
                  grades.map((g) => (
                    <tr key={g.id} style={{ borderBottom: `1px solid ${tokens.borderSubtle}` }}>
                      <td style={{ padding: '8px 10px', fontWeight: 700, color: tokens.textPrimary }}>{g.code}</td>
                      <td style={{ padding: '8px 10px', color: tokens.textSecondary }}>{g.name}</td>
                      <td style={{ padding: '8px 10px', textAlign: 'right' }}>
                        <button type="button" onClick={() => handleDeleteItem('grade-levels', g.id)} style={{ background: 'none', border: 'none', color: brand.danger, cursor: 'pointer' }}>
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
                        <button type="button" onClick={() => handleDeleteItem('rooms', r.id)} style={{ background: 'none', border: 'none', color: brand.danger, cursor: 'pointer' }}>
                          <Trash2 size={13} />
                        </button>
                      </td>
                    </tr>
                  ))}

                {activeSubTab === 'SUBJECTS' &&
                  subjects.map((s) => (
                    <tr key={s.id} style={{ borderBottom: `1px solid ${tokens.borderSubtle}` }}>
                      <td style={{ padding: '8px 10px', fontWeight: 700, color: tokens.textPrimary }}>{s.code}</td>
                      <td style={{ padding: '8px 10px', color: tokens.textSecondary }}>{s.title}</td>
                      <td style={{ padding: '8px 10px', textAlign: 'right' }}>
                        <button type="button" onClick={() => handleDeleteItem('subjects', s.id)} style={{ background: 'none', border: 'none', color: brand.danger, cursor: 'pointer' }}>
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

// Styling definitions
const tabBtnStyle = (active: boolean, brandColor: string, tokens: any): React.CSSProperties => ({
  padding: '6px 12px',
  borderRadius: 6,
  border: 'none',
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