/**
 * AttendSure - Academic Setup & Timetable Modal (Class Adviser & Subject Teachers)
 * File: web/src/components/modals/AcademicSetupModal.tsx
 *
 * Cybersecurity & Performance:
 * 1. Adviser & Subject Teacher Separation: Clearly assigns Homeroom Adviser on Section, and Subject Teachers on Schedules.
 * 2. Automatic Section Code Generator: Live auto-computes code (e.g. SEC-G7-DIAMOND).
 * 3. Multi-Vector Conflict Engine: Rejects overlapping faculty, room, and section slots.
 * 4. Pre-population on Edit: Populates all fields immediately when edit is clicked.
 * 5. SVG Vector Standards: Uses Lucide SVG icons only.
 */

import React, { useState, useEffect, useMemo, useCallback } from 'react';
import apiClient from '../../api/client';
import { 
  X, 
  Calendar, 
  Users, 
  BookOpen, 
  DoorOpen, 
  Layers, 
  Loader2, 
  AlertCircle, 
  Clock, 
  ShieldAlert, 
  Hash, 
  Database, 
  Pencil, 
  Trash2,
  Sparkles,
  UserCheck,
  GraduationCap
} from 'lucide-react';

export type TabType = 'SCHEDULE' | 'SECTION' | 'SUBJECT' | 'ROOM' | 'YEAR_LEVEL';

export interface ModalProps {
  isOpen: boolean;
  initialTab?: TabType;
  editItem?: any;
  onClose: () => void;
  onSuccess: () => void;
}

export function formatTime12Hour(timeStr?: string): string {
  if (!timeStr) return '';
  const parts = String(timeStr).trim().split(':');
  if (parts.length < 2) return timeStr;
  let hours = parseInt(parts[0], 10);
  const minutes = parts[1].slice(0, 2);
  if (isNaN(hours)) return timeStr;
  const ampm = hours >= 12 ? 'PM' : 'AM';
  hours = hours % 12;
  hours = hours ? hours : 12;
  return `${String(hours).padStart(2, '0')}:${minutes} ${ampm}`;
}

export function doDaysOverlap(daysA: string, daysB: string): boolean {
  const getDaysSet = (dStr: string): Set<string> => {
    const d = (dStr || '').toUpperCase().trim();
    if (d === 'MON-FRI' || d === 'DAILY' || d === 'WEEKDAYS') {
      return new Set(['MON', 'TUE', 'WED', 'THU', 'FRI']);
    }
    if (d === 'MWF') return new Set(['MON', 'WED', 'FRI']);
    if (d === 'TTH') return new Set(['TUE', 'THU']);
    if (d === 'SAT') return new Set(['SAT']);
    if (d === 'SUN') return new Set(['SUN']);
    return new Set(d.split(/[\s,\-]+/));
  };

  const setA = getDaysSet(daysA);
  const setB = getDaysSet(daysB);
  for (const day of setA) {
    if (setB.has(day)) return true;
  }
  return false;
}

function getErrorMessage(err: any): string {
  const data = err?.response?.data;
  if (!err.response) return 'Cannot reach server. Please check your network connection.';
  if (typeof data === 'string') return data.slice(0, 120);
  if (data?.conflict && Array.isArray(data.conflict)) return data.conflict.join(' | ');
  if (data?.detail) return data.detail;
  if (data?.error) return data.error;
  if (typeof data === 'object' && data !== null) {
    const lines = Object.entries(data).map(([key, val]) => `${key}: ${Array.isArray(val) ? val.join(' ') : val}`);
    if (lines.length > 0) return lines.join(' | ');
  }
  return 'Something went wrong while saving.';
}

export const AcademicSetupModal: React.FC<ModalProps> = ({
  isOpen,
  initialTab = 'SCHEDULE',
  editItem = null,
  onClose,
  onSuccess,
}) => {
  const [activeTab, setActiveTab] = useState<TabType>(initialTab);

  useEffect(() => {
    if (isOpen) {
      setActiveTab(initialTab);
    }
  }, [isOpen, initialTab]);

  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  return (
    <div style={backdropStyle} onClick={onClose} role="dialog" aria-modal="true">
      <div style={boxStyle} onClick={(e) => e.stopPropagation()}>
        <div style={headerStyle}>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <div style={iconBadgeStyle}>
                <Database size={16} color="#004b87" />
              </div>
              <h3 style={titleStyle}>Academic Setup &amp; Timetables</h3>
            </div>
            <p style={subtitleStyle}>Manage class advisers, subject teachers, sections, and schedules</p>
          </div>
          <button onClick={onClose} style={closeButtonStyle} type="button" aria-label="Close dialog">
            <X size={18} />
          </button>
        </div>

        <div style={tabGroupStyle}>
          <button
            type="button"
            onClick={() => setActiveTab('SECTION')}
            style={activeTab === 'SECTION' ? activeTabStyle : inactiveTabStyle}
          >
            <Users size={14} /> Sections &amp; Advisers
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('SCHEDULE')}
            style={activeTab === 'SCHEDULE' ? activeTabStyle : inactiveTabStyle}
          >
            <Calendar size={14} /> Subject Teachers &amp; Schedules
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('SUBJECT')}
            style={activeTab === 'SUBJECT' ? activeTabStyle : inactiveTabStyle}
          >
            <BookOpen size={14} /> Subjects
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('ROOM')}
            style={activeTab === 'ROOM' ? activeTabStyle : inactiveTabStyle}
          >
            <DoorOpen size={14} /> Rooms
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('YEAR_LEVEL')}
            style={activeTab === 'YEAR_LEVEL' ? activeTabStyle : inactiveTabStyle}
          >
            <Layers size={14} /> Year Levels
          </button>
        </div>

        <div style={{ marginTop: 16 }}>
          {activeTab === 'SECTION' && <SectionForm onSuccess={onSuccess} initialItem={activeTab === initialTab ? editItem : null} />}
          {activeTab === 'SCHEDULE' && <ScheduleForm onSuccess={onSuccess} initialItem={activeTab === initialTab ? editItem : null} />}
          {activeTab === 'SUBJECT' && <SubjectForm onSuccess={onSuccess} initialItem={activeTab === initialTab ? editItem : null} />}
          {activeTab === 'ROOM' && <RoomForm onSuccess={onSuccess} initialItem={activeTab === initialTab ? editItem : null} />}
          {activeTab === 'YEAR_LEVEL' && <YearLevelForm onSuccess={onSuccess} initialItem={activeTab === initialTab ? editItem : null} />}
        </div>
      </div>
    </div>
  );
};

// ===========================================================================
// 1. SECTION FORM (CLASS ADVISER & AUTO-CODES)
// ===========================================================================
const SectionForm: React.FC<{ onSuccess: () => void; initialItem?: any }> = ({ onSuccess, initialItem }) => {
  const [editingId, setEditingId] = useState<number | null>(null);
  const [name, setName] = useState('');
  const [code, setCode] = useState('');
  const [gradeLevelId, setGradeLevelId] = useState('');
  const [adviserId, setAdviserId] = useState('');
  const [roomId, setRoomId] = useState('');

  const [gradeLevels, setGradeLevels] = useState<any[]>([]);
  const [teachers, setTeachers] = useState<any[]>([]);
  const [rooms, setRooms] = useState<any[]>([]);
  const [existingSections, setExistingSections] = useState<any[]>([]);

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const loadAllData = useCallback(async () => {
    try {
      const [glRes, teachRes, roomRes, secRes] = await Promise.all([
        apiClient.get('/grade-levels/?page_size=ALL'),
        apiClient.get('/faculty/dropdown/').catch(() => apiClient.get('/facultys/?page_size=ALL')),
        apiClient.get('/rooms/'),
        apiClient.get('/sections/?page_size=ALL'),
      ]);

      setGradeLevels(Array.isArray(glRes.data) ? glRes.data : glRes.data?.results || []);
      setTeachers(Array.isArray(teachRes.data) ? teachRes.data : teachRes.data?.results || []);
      setRooms(Array.isArray(roomRes.data) ? roomRes.data : roomRes.data?.results || []);
      setExistingSections(Array.isArray(secRes.data) ? secRes.data : secRes.data?.results || []);
    } catch (err: any) {
      setError(getErrorMessage(err));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadAllData();
  }, [loadAllData]);

  useEffect(() => {
    if (!editingId && name.trim()) {
      const cleanName = name.trim().toUpperCase().replace(/[^A-Z0-9]/g, '');
      const selectedGL = gradeLevels.find((gl) => String(gl.id) === String(gradeLevelId));
      let gradeTag = 'GEN';

      if (selectedGL) {
        const matches = (selectedGL.name || selectedGL.code || '').match(/\d+/);
        gradeTag = matches ? `G${matches[0]}` : selectedGL.code.slice(0, 4).toUpperCase();
      }

      setCode(`SEC-${gradeTag}-${cleanName}`);
    }
  }, [name, gradeLevelId, editingId, gradeLevels]);

  const handleEdit = useCallback((sec: any) => {
    if (!sec) return;
    setEditingId(sec.id);
    setName(sec.name || '');
    setCode(sec.code || '');

    const glVal = typeof sec.grade_level === 'object' && sec.grade_level !== null
      ? sec.grade_level?.id
      : (sec.grade_level_id || sec.grade_level);
    setGradeLevelId(glVal ? String(glVal) : '');

    const advVal = typeof sec.adviser === 'object' && sec.adviser !== null
      ? sec.adviser?.id
      : (sec.adviser_id || sec.adviser);
    setAdviserId(advVal ? String(advVal) : '');
    setRoomId(sec.room_number || sec.room_name || '');
    setError('');
  }, []);

  const handleCancelEdit = useCallback(() => {
    setEditingId(null);
    setName('');
    setCode('');
    setGradeLevelId('');
    setAdviserId('');
    setRoomId('');
    setError('');
  }, []);

  useEffect(() => {
    if (initialItem) handleEdit(initialItem);
    else handleCancelEdit();
  }, [initialItem, handleEdit, handleCancelEdit]);

  const handleDelete = async (id: number) => {
    if (!window.confirm('Are you sure you want to delete this section?')) return;
    try {
      await apiClient.delete(`/sections/${id}/`);
      if (editingId === id) handleCancelEdit();
      await loadAllData();
      onSuccess();
    } catch (err: any) {
      alert(getErrorMessage(err));
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setError('');

    const glNum = gradeLevelId ? parseInt(gradeLevelId, 10) : null;
    const advNum = adviserId ? parseInt(adviserId, 10) : null;

    const payload = {
      name: name.trim(),
      code: code.trim(),
      grade_level: glNum,
      grade_level_id: glNum,
      adviser: advNum,
      adviser_id: advNum,
      room_name: roomId ? String(roomId) : '',
      room_number: roomId ? String(roomId) : '',
    };

    try {
      if (editingId) {
        await apiClient.put(`/sections/${editingId}/`, payload);
      } else {
        await apiClient.post('/sections/', payload);
      }
      handleCancelEdit();
      await loadAllData();
      onSuccess();
    } catch (err: any) {
      setError(getErrorMessage(err));
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div style={loadingBoxStyle}>
        <Loader2 size={24} className="animate-spin" color="#004b87" />
        <span style={{ fontSize: '0.80rem', color: '#64748b' }}>Loading records...</span>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} style={formStyle}>
      {error && <div style={errorCardStyle}><AlertCircle size={15} /> {error}</div>}

      <div style={rowStyle}>
        <div style={{ flex: 1.2 }}>
          <label style={labelStyle}>Section Name *</label>
          <input
            type="text"
            required
            placeholder="e.g. Diamond, Emerald, Ruby"
            value={name}
            onChange={(e) => setName(e.target.value)}
            style={inputStyle}
          />
        </div>

        <div style={{ flex: 1 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <label style={labelStyle}>Section Code *</label>
            <span style={autoBadgePill}>
              <Sparkles size={10} /> AUTO GENERATED
            </span>
          </div>
          <input
            type="text"
            required
            placeholder="e.g. SEC-G7-DIAMOND"
            value={code}
            onChange={(e) => setCode(e.target.value.toUpperCase())}
            style={{ ...inputStyle, fontFamily: 'monospace', fontWeight: 700, backgroundColor: '#f8fafc' }}
          />
        </div>
      </div>

      <div>
        <label style={labelStyle}>Year Level *</label>
        <select 
          required 
          value={gradeLevelId} 
          onChange={(e) => setGradeLevelId(e.target.value)} 
          style={inputStyle}
        >
          <option value="">-- Choose Year Level --</option>
          {gradeLevels.map((gl) => (
            <option key={gl.id} value={gl.id}>{gl.name}</option>
          ))}
        </select>
      </div>

      <div style={rowStyle}>
        <div style={{ flex: 1 }}>
          <label style={labelStyle}>
            Class Adviser (Homeroom Teacher) *
          </label>
          <select 
            required
            value={adviserId} 
            onChange={(e) => setAdviserId(e.target.value)} 
            style={inputStyle}
          >
            <option value="">-- Choose Homeroom Adviser ({teachers.length} available) --</option>
            {teachers.map((t) => (
              <option key={t.id} value={t.id}>
                {t.full_name || t.name} {t.employee_id ? `(${t.employee_id})` : ''}
              </option>
            ))}
          </select>
          <span style={{ fontSize: '0.68rem', color: '#64748b', marginTop: 3, display: 'block' }}>
            Responsible for section attendance, student records, and signing SF1 and SF2 reports.
          </span>
        </div>

        <div style={{ flex: 1 }}>
          <label style={labelStyle}>Homeroom Classroom</label>
          <select 
            value={roomId} 
            onChange={(e) => setRoomId(e.target.value)} 
            style={inputStyle}
          >
            <option value="">-- Optional: Choose Room --</option>
            {rooms.map((r) => (
              <option key={r.id} value={r.name || r.room_number}>{r.name || r.room_number}</option>
            ))}
          </select>
        </div>
      </div>

      <div style={{ display: 'flex', gap: 8, marginTop: 4 }}>
        <button 
          type="submit" 
          disabled={saving || !name.trim() || !code.trim() || !adviserId} 
          style={{ ...saveButtonStyle, flex: 1 }}
        >
          {saving ? <Loader2 size={16} className="animate-spin" /> : editingId ? 'Update Section & Adviser' : 'Save Section & Adviser'}
        </button>

        {editingId && (
          <button type="button" onClick={handleCancelEdit} style={cancelBtnStyle}>
            Cancel
          </button>
        )}
      </div>

      {/* Existing Sections with Adviser and Subject Teachers Breakdown */}
      <div style={listCardStyle}>
        <div style={listHeaderStyle}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <Users size={13} color="#004b87" />
            <span>Existing Sections (Class Advisers &amp; Subject Teachers)</span>
          </div>
          <span style={countTagStyle}>{existingSections.length} sections</span>
        </div>

        {existingSections.length === 0 ? (
          <div style={emptyTextStyle}>No sections saved yet.</div>
        ) : (
          <div style={gridStyle}>
            {existingSections.map((sec) => {
              const subTeachers = sec.subject_teachers || [];
              return (
                <div key={sec.id} style={{ ...itemCardStyle, flexDirection: 'column', alignItems: 'stretch', gap: 6 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <div>
                      <span style={{ fontWeight: 800, color: '#0f172a', fontSize: '0.84rem' }}>{sec.name}</span>
                      <span style={{ ...blueTagStyle, marginLeft: 6 }}>{sec.code || 'NO-CODE'}</span>
                      {sec.grade_level_name && (
                        <span style={{ fontSize: '0.70rem', color: '#64748b', marginLeft: 6 }}>
                          ({sec.grade_level_name})
                        </span>
                      )}
                    </div>

                    <div style={{ display: 'flex', gap: 4 }}>
                      <button type="button" onClick={() => handleEdit(sec)} style={iconActionBtn} title="Edit section and adviser">
                        <Pencil size={13} color="#004b87" />
                      </button>
                      <button type="button" onClick={() => handleDelete(sec.id)} style={iconActionBtn} title="Delete section">
                        <Trash2 size={13} color="#ef4444" />
                      </button>
                    </div>
                  </div>

                  {/* Adviser Badge */}
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: '0.74rem' }}>
                    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, color: '#004b87', fontWeight: 700 }}>
                      <UserCheck size={12} /> Class Adviser:
                    </span>
                    <strong style={{ color: sec.adviser_name ? '#0f172a' : '#d97706' }}>
                      {sec.adviser_name || 'No Adviser Assigned'}
                    </strong>
                  </div>

                  {/* Subject Teachers Summary */}
                  <div style={{ borderTop: '1px solid #f1f5f9', paddingTop: 4, marginTop: 2 }}>
                    <div style={{ fontSize: '0.68rem', fontWeight: 800, color: '#64748b', marginBottom: 2 }}>
                      Subject Teachers ({subTeachers.length} assigned):
                    </div>
                    {subTeachers.length > 0 ? (
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
                        {subTeachers.map((st: any, idx: number) => (
                          <span key={idx} style={subjectTeacherPill}>
                            <GraduationCap size={10} color="#004b87" />
                            <strong>{st.subject_code}</strong>: {st.faculty_name} ({st.time_slot})
                          </span>
                        ))}
                      </div>
                    ) : (
                      <span style={{ fontSize: '0.68rem', color: '#94a3b8', fontStyle: 'italic' }}>
                        No subject teachers assigned yet. Add timetable slots in the Schedules tab.
                      </span>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </form>
  );
};

// ===========================================================================
// 2. SCHEDULE FORM (SUBJECT TEACHER ASSIGNMENT & CONFLICT ENGINE)
// ===========================================================================
const ScheduleForm: React.FC<{ onSuccess: () => void; initialItem?: any }> = ({ onSuccess, initialItem }) => {
  const [editingId, setEditingId] = useState<number | null>(null);
  const [code, setCode] = useState('');
  const [sectionId, setSectionId] = useState('');
  const [subjectId, setSubjectId] = useState('');
  const [facultyId, setFacultyId] = useState('');
  const [roomId, setRoomId] = useState('');
  const [daysOfWeek, setDaysOfWeek] = useState('MON-FRI');
  const [startTime, setStartTime] = useState('07:30');
  const [endTime, setEndTime] = useState('08:30');

  const [sections, setSections] = useState<any[]>([]);
  const [subjects, setSubjects] = useState<any[]>([]);
  const [teachers, setTeachers] = useState<any[]>([]);
  const [rooms, setRooms] = useState<any[]>([]);
  const [allSchedules, setAllSchedules] = useState<any[]>([]);

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [serverError, setServerError] = useState('');
  const [serverClashes, setServerClashes] = useState<string[]>([]);

  const loadAllData = useCallback(async () => {
    try {
      const [secRes, subRes, teachRes, roomRes, schedRes] = await Promise.all([
        apiClient.get('/sections/?page_size=ALL'),
        apiClient.get('/subjects/?page_size=ALL'),
        apiClient.get('/faculty/dropdown/').catch(() => apiClient.get('/facultys/?page_size=ALL')),
        apiClient.get('/rooms/'),
        apiClient.get('/schedules/?page_size=ALL'),
      ]);

      setSections(Array.isArray(secRes.data) ? secRes.data : secRes.data?.results || []);
      setSubjects(Array.isArray(subRes.data) ? subRes.data : subRes.data?.results || []);
      setTeachers(Array.isArray(teachRes.data) ? teachRes.data : teachRes.data?.results || []);
      setRooms(Array.isArray(roomRes.data) ? roomRes.data : roomRes.data?.results || []);
      setAllSchedules(Array.isArray(schedRes.data) ? schedRes.data : schedRes.data?.results || []);
    } catch (err) {
      console.error('Cannot load schedule metadata:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadAllData();
  }, [loadAllData]);

  const handleEdit = useCallback((item: any) => {
    if (!item) return;
    setEditingId(item.id);
    setCode(item.code || item.schedule_code || '');

    const secVal = typeof item.section === 'object' && item.section !== null
      ? item.section?.id
      : (item.section_id || item.section);
    setSectionId(secVal ? String(secVal) : '');

    const subVal = typeof item.subject === 'object' && item.subject !== null
      ? item.subject?.id
      : (item.subject_id || item.subject);
    setSubjectId(subVal ? String(subVal) : '');

    const facVal = typeof item.faculty === 'object' && item.faculty !== null
      ? item.faculty?.id
      : (item.faculty_id || item.faculty);
    setFacultyId(facVal ? String(facVal) : '');

    const rmVal = typeof item.room === 'object' && item.room !== null
      ? item.room?.id
      : (item.room_id || item.room);
    setRoomId(rmVal ? String(rmVal) : '');

    setDaysOfWeek(item.days_of_week || 'MON-FRI');
    setStartTime(item.start_time ? item.start_time.slice(0, 5) : '07:30');
    setEndTime(item.end_time ? item.end_time.slice(0, 5) : '08:30');
    setServerError('');
  }, []);

  const handleCancelEdit = useCallback(() => {
    setEditingId(null);
    setCode('');
    setSectionId('');
    setSubjectId('');
    setFacultyId('');
    setRoomId('');
    setDaysOfWeek('MON-FRI');
    setStartTime('07:30');
    setEndTime('08:30');
    setServerError('');
    setServerClashes([]);
  }, []);

  useEffect(() => {
    if (initialItem) handleEdit(initialItem);
    else handleCancelEdit();
  }, [initialItem, handleEdit, handleCancelEdit]);

  useEffect(() => {
    if (!editingId && sectionId && subjectId) {
      const selectedSec = sections.find((s) => String(s.id) === String(sectionId));
      const selectedSub = subjects.find((s) => String(s.id) === String(subjectId));
      if (selectedSec && selectedSub) {
        const secTag = (selectedSec.code || selectedSec.name || 'SEC').replace(/[^A-Za-z0-9]/g, '').slice(0, 6).toUpperCase();
        const subTag = (selectedSub.code || selectedSub.title || 'SUB').replace(/[^A-Za-z0-9]/g, '').slice(0, 6).toUpperCase();
        setCode(`SCH-${secTag}-${subTag}`);
      }
    }
  }, [sectionId, subjectId, editingId, sections, subjects]);

  const clientClashes = useMemo(() => {
    const list: string[] = [];
    if (!startTime || !endTime) return list;
    if (startTime >= endTime) {
      list.push('Start time must be earlier than end time.');
      return list;
    }

    const curRoomObj = rooms.find((r) => String(r.id) === String(roomId));
    const curRoomNumber = curRoomObj ? (curRoomObj.name || curRoomObj.room_number) : '';

    for (const s of allSchedules) {
      if (editingId && s.id === editingId) continue;
      if (!doDaysOverlap(daysOfWeek, s.days_of_week || 'MON-FRI')) continue;

      const sStart = (s.start_time || '').slice(0, 5);
      const sEnd = (s.end_time || '').slice(0, 5);
      if (!(startTime < sEnd && endTime > sStart)) continue;

      const timeLabel = `${formatTime12Hour(sStart)} - ${formatTime12Hour(sEnd)}`;
      const subName = s.subject_code || (typeof s.subject === 'object' ? s.subject?.code : '') || 'Class';
      const secName = s.section_name || (typeof s.section === 'object' ? s.section?.name : '') || 'Section';

      // 1. Subject Teacher Conflict
      const sFacId = typeof s.faculty === 'object' ? s.faculty?.id : (s.faculty_id || s.faculty);
      if (facultyId && String(sFacId) === String(facultyId)) {
        const facName = s.faculty_name || (typeof s.faculty === 'object' ? s.faculty?.full_name : '') || 'Teacher';
        list.push(`Subject Teacher Conflict: ${facName} already has ${subName} in Section ${secName} (${timeLabel}).`);
      }

      // 2. Section Conflict
      const sSecId = typeof s.section === 'object' ? s.section?.id : (s.section_id || s.section);
      if (sectionId && String(sSecId) === String(sectionId)) {
        list.push(`Section Conflict: Section ${secName} already has ${subName} scheduled (${timeLabel}).`);
      }

      // 3. Room Conflict
      const sRoomId = typeof s.room === 'object' ? s.room?.id : (s.room_id || s.room);
      const sRoomNum = s.room_number || (typeof s.room === 'object' ? s.room?.room_number : '');
      const matchesRoomId = roomId && String(sRoomId) === String(roomId);
      const matchesRoomNum = curRoomNumber && sRoomNum && curRoomNumber.toLowerCase() === sRoomNum.toLowerCase();

      if (matchesRoomId || matchesRoomNum) {
        list.push(`Room Conflict: ${curRoomNumber || 'Room'} is already booked by Section ${secName} for ${subName} (${timeLabel}).`);
      }
    }
    return list;
  }, [startTime, endTime, daysOfWeek, sectionId, facultyId, roomId, editingId, allSchedules, rooms]);

  const allClashes = [...clientClashes, ...serverClashes];
  const hasClashes = allClashes.length > 0;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (hasClashes) return;

    setSaving(true);
    setServerError('');
    setServerClashes([]);

    const secNum = parseInt(sectionId, 10);
    const subNum = parseInt(subjectId, 10);
    const facNum = facultyId ? parseInt(facultyId, 10) : null;
    const rmNum = roomId ? parseInt(roomId, 10) : null;
    const roomObj = rooms.find((r) => String(r.id) === String(roomId));

    const payload = {
      code: code.trim(),
      schedule_code: code.trim(),
      section: secNum,
      section_id: secNum,
      subject: subNum,
      subject_id: subNum,
      faculty: facNum,
      faculty_id: facNum,
      room: rmNum,
      room_id: rmNum,
      room_number: roomObj ? (roomObj.name || roomObj.room_number) : '',
      days_of_week: daysOfWeek,
      start_time: startTime,
      end_time: endTime,
    };

    try {
      if (editingId) {
        await apiClient.put(`/schedules/${editingId}/`, payload);
      } else {
        await apiClient.post('/schedules/', payload);
      }
      handleCancelEdit();
      await loadAllData();
      onSuccess();
    } catch (err: any) {
      const respData = err?.response?.data;
      if (respData?.conflict && Array.isArray(respData.conflict)) {
        setServerClashes(respData.conflict);
      } else {
        setServerError(getErrorMessage(err));
      }
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div style={loadingBoxStyle}>
        <Loader2 size={24} className="animate-spin" color="#004b87" />
        <span style={{ fontSize: '0.80rem', color: '#64748b' }}>Loading records...</span>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} style={formStyle}>
      {serverError && <div style={errorCardStyle}><AlertCircle size={15} /> {serverError}</div>}

      {hasClashes && (
        <div style={warningBoxStyle}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, color: '#b91c1c', fontWeight: 800, fontSize: '0.80rem' }}>
            <ShieldAlert size={16} /> Scheduling Conflict Detected:
          </div>
          {allClashes.map((msg, idx) => (
            <div key={idx} style={{ color: '#991b1b', fontSize: '0.74rem', marginLeft: 22, marginTop: 2 }}>
              • {msg}
            </div>
          ))}
        </div>
      )}

      <div style={rowStyle}>
        <div style={{ flex: 1 }}>
          <label style={labelStyle}>Schedule Period Code *</label>
          <input
            type="text"
            required
            placeholder="e.g. SCH-G7-MATH"
            value={code}
            onChange={(e) => setCode(e.target.value)}
            style={inputStyle}
          />
        </div>
        <div style={{ flex: 1 }}>
          <label style={labelStyle}>Class Section *</label>
          <select 
            required 
            value={sectionId} 
            onChange={(e) => setSectionId(e.target.value)} 
            style={inputStyle}
          >
            <option value="">-- Select Section --</option>
            {sections.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name} {s.code ? `(${s.code})` : ''}
              </option>
            ))}
          </select>
        </div>
      </div>

      <div style={rowStyle}>
        <div style={{ flex: 1 }}>
          <label style={labelStyle}>Subject *</label>
          <select 
            required 
            value={subjectId} 
            onChange={(e) => setSubjectId(e.target.value)} 
            style={inputStyle}
          >
            <option value="">-- Select Subject --</option>
            {subjects.map((sub) => (
              <option key={sub.id} value={sub.id}>
                {sub.code ? `${sub.code} - ` : ''}{sub.title || sub.name}
              </option>
            ))}
          </select>
        </div>
        <div style={{ flex: 1 }}>
          <label style={labelStyle}>Subject Teacher (Faculty) *</label>
          <select 
            required 
            value={facultyId} 
            onChange={(e) => setFacultyId(e.target.value)} 
            style={inputStyle}
          >
            <option value="">-- Select Subject Teacher ({teachers.length} available) --</option>
            {teachers.map((t) => (
              <option key={t.id} value={t.id}>
                {t.full_name || `${t.first_name || ''} ${t.last_name || ''}`.trim() || t.name}
              </option>
            ))}
          </select>
        </div>
      </div>

      <div style={rowStyle}>
        <div style={{ flex: 1 }}>
          <label style={labelStyle}>Classroom / Lab</label>
          <select 
            value={roomId} 
            onChange={(e) => setRoomId(e.target.value)} 
            style={inputStyle}
          >
            <option value="">-- Optional: Select Room --</option>
            {rooms.map((r) => (
              <option key={r.id} value={r.id}>
                {r.name || r.room_number} {r.building ? `(${r.building})` : ''}
              </option>
            ))}
          </select>
        </div>
        <div style={{ flex: 1 }}>
          <label style={labelStyle}>Days *</label>
          <select 
            value={daysOfWeek} 
            onChange={(e) => setDaysOfWeek(e.target.value)} 
            style={inputStyle}
          >
            <option value="MON-FRI">Monday to Friday (Daily)</option>
            <option value="MWF">Monday / Wednesday / Friday</option>
            <option value="TTH">Tuesday / Thursday</option>
            <option value="SAT">Saturday Only</option>
          </select>
        </div>
      </div>

      <div style={rowStyle}>
        <div style={{ flex: 1 }}>
          <label style={labelStyle}>
            Start Time * <span style={{ fontWeight: 'normal', color: '#64748b' }}>({formatTime12Hour(startTime)})</span>
          </label>
          <input 
            type="time" 
            required 
            value={startTime} 
            onChange={(e) => setStartTime(e.target.value)} 
            style={inputStyle} 
          />
        </div>
        <div style={{ flex: 1 }}>
          <label style={labelStyle}>
            End Time * <span style={{ fontWeight: 'normal', color: '#64748b' }}>({formatTime12Hour(endTime)})</span>
          </label>
          <input 
            type="time" 
            required 
            value={endTime} 
            onChange={(e) => setEndTime(e.target.value)} 
            style={inputStyle} 
          />
        </div>
      </div>

      <div style={{ display: 'flex', gap: 8, marginTop: 4 }}>
        <button 
          type="submit" 
          disabled={saving || hasClashes || !code.trim() || !facultyId} 
          style={{
            ...saveButtonStyle,
            flex: 1,
            backgroundColor: hasClashes ? '#94a3b8' : '#004b87',
            cursor: hasClashes ? 'not-allowed' : 'pointer',
          }}
        >
          {saving ? <Loader2 size={16} className="animate-spin" /> : editingId ? 'Update Subject Schedule' : 'Assign Subject Teacher & Save'}
        </button>

        {editingId && (
          <button type="button" onClick={handleCancelEdit} style={cancelBtnStyle}>
            Cancel
          </button>
        )}
      </div>
    </form>
  );
};

// ===========================================================================
// 3. SUBJECT FORM
// ===========================================================================
const SubjectForm: React.FC<{ onSuccess: () => void; initialItem?: any }> = ({ onSuccess, initialItem }) => {
  const [editingId, setEditingId] = useState<number | null>(null);
  const [code, setCode] = useState('');
  const [title, setTitle] = useState('');
  const [units, setUnits] = useState('1');
  const [subjectType, setSubjectType] = useState('Core');
  const [existingSubjects, setExistingSubjects] = useState<any[]>([]);

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const loadSubjects = useCallback(async () => {
    try {
      const res = await apiClient.get('/subjects/?page_size=ALL');
      setExistingSubjects(Array.isArray(res.data) ? res.data : res.data?.results || []);
    } catch (err) {
      console.error('Cannot load subjects:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadSubjects();
  }, [loadSubjects]);

  const handleEdit = useCallback((sub: any) => {
    if (!sub) return;
    setEditingId(sub.id);
    setCode(sub.code || '');
    setTitle(sub.title || sub.name || '');
    setUnits(String(sub.units || '1'));
    setSubjectType(sub.subject_type || sub.tier || 'Core');
    setError('');
  }, []);

  const handleCancelEdit = useCallback(() => {
    setEditingId(null);
    setCode('');
    setTitle('');
    setUnits('1');
    setSubjectType('Core');
    setError('');
  }, []);

  useEffect(() => {
    if (initialItem) handleEdit(initialItem);
    else handleCancelEdit();
  }, [initialItem, handleEdit, handleCancelEdit]);

  const handleDelete = async (id: number) => {
    if (!window.confirm('Are you sure you want to delete this subject?')) return;
    try {
      await apiClient.delete(`/subjects/${id}/`);
      if (editingId === id) handleCancelEdit();
      await loadSubjects();
      onSuccess();
    } catch (err: any) {
      alert(getErrorMessage(err));
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setError('');

    const payload = {
      code: code.trim().toUpperCase(),
      title: title.trim(),
      name: title.trim(),
      units: parseInt(units, 10) || 1,
      subject_type: subjectType,
      tier: subjectType,
    };

    try {
      if (editingId) {
        await apiClient.put(`/subjects/${editingId}/`, payload);
      } else {
        await apiClient.post('/subjects/', payload);
      }
      handleCancelEdit();
      await loadSubjects();
      onSuccess();
    } catch (err: any) {
      setError(getErrorMessage(err));
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div style={loadingBoxStyle}>
        <Loader2 size={24} className="animate-spin" color="#004b87" />
        <span style={{ fontSize: '0.80rem', color: '#64748b' }}>Loading records...</span>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} style={formStyle}>
      {error && <div style={errorCardStyle}><AlertCircle size={15} /> {error}</div>}

      <div style={rowStyle}>
        <div style={{ flex: 1 }}>
          <label style={labelStyle}>Subject Code *</label>
          <input
            type="text"
            required
            placeholder="e.g. MATH-7"
            value={code}
            onChange={(e) => setCode(e.target.value)}
            style={inputStyle}
          />
        </div>
        <div style={{ flex: 2 }}>
          <label style={labelStyle}>Subject Title *</label>
          <input
            type="text"
            required
            placeholder="e.g. Mathematics 7"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            style={inputStyle}
          />
        </div>
      </div>

      <div style={rowStyle}>
        <div style={{ flex: 1 }}>
          <label style={labelStyle}>Units *</label>
          <input
            type="number"
            required
            min="1"
            max="10"
            value={units}
            onChange={(e) => setUnits(e.target.value)}
            style={inputStyle}
          />
        </div>
        <div style={{ flex: 1 }}>
          <label style={labelStyle}>Classification</label>
          <select 
            value={subjectType} 
            onChange={(e) => setSubjectType(e.target.value)} 
            style={inputStyle}
          >
            <option value="Core">Core Curriculum</option>
            <option value="Applied">Applied Subject</option>
            <option value="Specialized">Specialized Track</option>
            <option value="Elective">Elective</option>
          </select>
        </div>
      </div>

      <div style={{ display: 'flex', gap: 8 }}>
        <button 
          type="submit" 
          disabled={saving || !code.trim() || !title.trim()} 
          style={{ ...saveButtonStyle, flex: 1 }}
        >
          {saving ? <Loader2 size={16} className="animate-spin" /> : editingId ? 'Update Subject' : 'Save Subject'}
        </button>

        {editingId && (
          <button type="button" onClick={handleCancelEdit} style={cancelBtnStyle}>
            Cancel
          </button>
        )}
      </div>

      <div style={listCardStyle}>
        <div style={listHeaderStyle}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <BookOpen size={13} color="#004b87" />
            <span>Existing Subjects</span>
          </div>
          <span style={countTagStyle}>{existingSubjects.length} subjects</span>
        </div>

        {existingSubjects.length === 0 ? (
          <div style={emptyTextStyle}>No subjects saved yet.</div>
        ) : (
          <div style={gridStyle}>
            {existingSubjects.map((sub) => (
              <div key={sub.id} style={itemCardStyle}>
                <div>
                  <span style={{ fontWeight: 700, color: '#0f172a' }}>{sub.code}</span>
                  <span style={{ fontSize: '0.70rem', color: '#64748b', marginLeft: 6 }}>{sub.title || sub.name}</span>
                </div>
                <div style={{ display: 'flex', gap: 4 }}>
                  <button type="button" onClick={() => handleEdit(sub)} style={iconActionBtn} title="Edit subject">
                    <Pencil size={13} color="#004b87" />
                  </button>
                  <button type="button" onClick={() => handleDelete(sub.id)} style={iconActionBtn} title="Delete subject">
                    <Trash2 size={13} color="#ef4444" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </form>
  );
};

// ===========================================================================
// 4. ROOM FORM
// ===========================================================================
const RoomForm: React.FC<{ onSuccess: () => void; initialItem?: any }> = ({ onSuccess, initialItem }) => {
  const [editingId, setEditingId] = useState<number | null>(null);
  const [name, setName] = useState('');
  const [building, setBuilding] = useState('');
  const [capacity, setCapacity] = useState('45');
  const [roomType, setRoomType] = useState('LECTURE');
  const [existingRooms, setExistingRooms] = useState<any[]>([]);

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const loadRooms = useCallback(async () => {
    try {
      const res = await apiClient.get('/rooms/');
      setExistingRooms(Array.isArray(res.data) ? res.data : res.data?.results || []);
    } catch (err) {
      console.error('Cannot load rooms:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadRooms();
  }, [loadRooms]);

  const handleEdit = useCallback((r: any) => {
    if (!r) return;
    setEditingId(r.id);
    setName(r.name || r.room_number || '');
    setBuilding(r.building || '');
    setCapacity(String(r.capacity || '45'));
    setRoomType(r.room_type || 'LECTURE');
    setError('');
  }, []);

  const handleCancelEdit = useCallback(() => {
    setEditingId(null);
    setName('');
    setBuilding('');
    setCapacity('45');
    setRoomType('LECTURE');
    setError('');
  }, []);

  useEffect(() => {
    if (initialItem) handleEdit(initialItem);
    else handleCancelEdit();
  }, [initialItem, handleEdit, handleCancelEdit]);

  const handleDelete = async (id: number) => {
    if (!window.confirm('Are you sure you want to delete this room?')) return;
    try {
      await apiClient.delete(`/rooms/${id}/`);
      if (editingId === id) handleCancelEdit();
      await loadRooms();
      onSuccess();
    } catch (err: any) {
      alert(getErrorMessage(err));
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setError('');

    const payload = {
      name: name.trim(),
      building: building.trim(),
      capacity: parseInt(capacity, 10),
      room_type: roomType,
    };

    try {
      if (editingId) {
        await apiClient.put(`/rooms/${editingId}/`, payload);
      } else {
        await apiClient.post('/rooms/', payload);
      }
      handleCancelEdit();
      await loadRooms();
      onSuccess();
    } catch (err: any) {
      setError(getErrorMessage(err));
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div style={loadingBoxStyle}>
        <Loader2 size={24} className="animate-spin" color="#004b87" />
        <span style={{ fontSize: '0.80rem', color: '#64748b' }}>Loading records...</span>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} style={formStyle}>
      {error && <div style={errorCardStyle}><AlertCircle size={15} /> {error}</div>}

      <div>
        <label style={labelStyle}>Room Name or Number *</label>
        <input
          type="text"
          required
          placeholder="e.g. Rm 101, Rm 102"
          value={name}
          onChange={(e) => setName(e.target.value)}
          style={inputStyle}
        />
      </div>

      <div>
        <label style={labelStyle}>Building Name</label>
        <input
          type="text"
          placeholder="e.g. Main Building"
          value={building}
          onChange={(e) => setBuilding(e.target.value)}
          style={inputStyle}
        />
      </div>

      <div style={rowStyle}>
        <div style={{ flex: 1 }}>
          <label style={labelStyle}>Capacity *</label>
          <input
            type="number"
            required
            min="1"
            max="300"
            value={capacity}
            onChange={(e) => setCapacity(e.target.value)}
            style={inputStyle}
          />
        </div>
        <div style={{ flex: 1 }}>
          <label style={labelStyle}>Classification</label>
          <select 
            value={roomType} 
            onChange={(e) => setRoomType(e.target.value)} 
            style={inputStyle}
          >
            <option value="LECTURE">Regular Classroom</option>
            <option value="LAB">Computer or Science Lab</option>
            <option value="SPECIAL">Special Room / Hall</option>
          </select>
        </div>
      </div>

      <div style={{ display: 'flex', gap: 8 }}>
        <button 
          type="submit" 
          disabled={saving || !name.trim()} 
          style={{ ...saveButtonStyle, flex: 1 }}
        >
          {saving ? <Loader2 size={16} className="animate-spin" /> : editingId ? 'Update Room' : 'Save Room'}
        </button>

        {editingId && (
          <button type="button" onClick={handleCancelEdit} style={cancelBtnStyle}>
            Cancel
          </button>
        )}
      </div>

      <div style={listCardStyle}>
        <div style={listHeaderStyle}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <DoorOpen size={13} color="#004b87" />
            <span>Existing Rooms</span>
          </div>
          <span style={countTagStyle}>{existingRooms.length} rooms</span>
        </div>

        {existingRooms.length === 0 ? (
          <div style={emptyTextStyle}>No rooms saved yet.</div>
        ) : (
          <div style={gridStyle}>
            {existingRooms.map((r) => (
              <div key={r.id} style={itemCardStyle}>
                <div>
                  <span style={{ fontWeight: 700, color: '#0f172a' }}>{r.name}</span>
                  <span style={{ fontSize: '0.70rem', color: '#64748b', marginLeft: 6 }}>
                    {r.building ? `${r.building} • ` : ''}{r.capacity || 0} seats
                  </span>
                </div>
                <div style={{ display: 'flex', gap: 4 }}>
                  <button type="button" onClick={() => handleEdit(r)} style={iconActionBtn} title="Edit room">
                    <Pencil size={13} color="#004b87" />
                  </button>
                  <button type="button" onClick={() => handleDelete(r.id)} style={iconActionBtn} title="Delete room">
                    <Trash2 size={13} color="#ef4444" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </form>
  );
};

// ===========================================================================
// 5. YEAR LEVEL FORM
// ===========================================================================
const YearLevelForm: React.FC<{ onSuccess: () => void; initialItem?: any }> = ({ onSuccess, initialItem }) => {
  const [editingId, setEditingId] = useState<number | null>(null);
  const [name, setName] = useState('');
  const [levelNumber, setLevelNumber] = useState('7');
  const [stage, setStage] = useState('JHS');
  const [existingLevels, setExistingLevels] = useState<any[]>([]);

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const loadLevels = useCallback(async () => {
    try {
      const res = await apiClient.get('/grade-levels/?page_size=ALL');
      setExistingLevels(Array.isArray(res.data) ? res.data : res.data?.results || []);
    } catch (err) {
      console.error('Cannot load year levels:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadLevels();
  }, [loadLevels]);

  const handleLevelChange = (val: string) => {
    setLevelNumber(val);
    const num = parseInt(val, 10);
    if (!isNaN(num)) {
      if (num >= 1 && num <= 6) setStage('ELEM');
      else if (num >= 7 && num <= 10) setStage('JHS');
      else if (num >= 11 && num <= 12) setStage('SHS');
    }
  };

  const handleEdit = useCallback((lvl: any) => {
    if (!lvl) return;
    setEditingId(lvl.id);
    setName(lvl.name || '');
    setLevelNumber(String(lvl.level_number || lvl.level_order || lvl.order || '7'));
    setStage(lvl.stage || 'JHS');
    setError('');
  }, []);

  const handleCancelEdit = useCallback(() => {
    setEditingId(null);
    setName('');
    setLevelNumber('7');
    setStage('JHS');
    setError('');
  }, []);

  useEffect(() => {
    if (initialItem) handleEdit(initialItem);
    else handleCancelEdit();
  }, [initialItem, handleEdit, handleCancelEdit]);

  const handleDelete = async (id: number) => {
    if (!window.confirm('Are you sure you want to delete this year level?')) return;
    try {
      await apiClient.delete(`/grade-levels/${id}/`);
      if (editingId === id) handleCancelEdit();
      await loadLevels();
      onSuccess();
    } catch (err: any) {
      alert(getErrorMessage(err));
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setError('');

    const num = parseInt(levelNumber, 10);
    const payload = {
      name: name.trim(),
      level_number: num,
      level_order: num,
      order: num,
      stage,
    };

    try {
      if (editingId) {
        await apiClient.put(`/grade-levels/${editingId}/`, payload);
      } else {
        await apiClient.post('/grade-levels/', payload);
      }
      handleCancelEdit();
      await loadLevels();
      onSuccess();
    } catch (err: any) {
      setError(getErrorMessage(err));
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div style={loadingBoxStyle}>
        <Loader2 size={24} className="animate-spin" color="#004b87" />
        <span style={{ fontSize: '0.80rem', color: '#64748b' }}>Loading records...</span>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} style={formStyle}>
      {error && <div style={errorCardStyle}><AlertCircle size={15} /> {error}</div>}

      <div>
        <label style={labelStyle}>Year Level Name *</label>
        <input
          type="text"
          required
          placeholder="e.g. Grade 7, Grade 8"
          value={name}
          onChange={(e) => setName(e.target.value)}
          style={inputStyle}
        />
      </div>

      <div style={rowStyle}>
        <div style={{ flex: 1 }}>
          <label style={labelStyle}>Number Order *</label>
          <div style={{ position: 'relative', display: 'flex', alignItems: 'center' }}>
            <Hash size={14} color="#94a3b8" style={{ position: 'absolute', left: 10 }} />
            <input
              type="number"
              required
              min="1"
              max="15"
              value={levelNumber}
              onChange={(e) => handleLevelChange(e.target.value)}
              style={{ ...inputStyle, paddingLeft: 30 }}
            />
          </div>
        </div>
        <div style={{ flex: 1 }}>
          <label style={labelStyle}>School Stage *</label>
          <select 
            value={stage} 
            onChange={(e) => setStage(e.target.value)} 
            style={inputStyle}
          >
            <option value="JHS">Junior High (Grades 7–10)</option>
            <option value="SHS">Senior High (Grades 11–12)</option>
            <option value="ELEM">Elementary (Grades 1–6)</option>
          </select>
        </div>
      </div>

      <div style={{ display: 'flex', gap: 8 }}>
        <button 
          type="submit" 
          disabled={saving || !name.trim()} 
          style={{ ...saveButtonStyle, flex: 1 }}
        >
          {saving ? <Loader2 size={16} className="animate-spin" /> : editingId ? 'Update Year Level' : 'Save Year Level'}
        </button>

        {editingId && (
          <button type="button" onClick={handleCancelEdit} style={cancelBtnStyle}>
            Cancel
          </button>
        )}
      </div>

      <div style={listCardStyle}>
        <div style={listHeaderStyle}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <Layers size={13} color="#004b87" />
            <span>Existing Year Levels</span>
          </div>
          <span style={countTagStyle}>{existingLevels.length} levels</span>
        </div>

        {existingLevels.length === 0 ? (
          <div style={emptyTextStyle}>No year levels saved yet.</div>
        ) : (
          <div style={gridStyle}>
            {existingLevels.map((lvl) => (
              <div key={lvl.id} style={itemCardStyle}>
                <div>
                  <span style={{ fontWeight: 700, color: '#0f172a' }}>{lvl.name}</span>
                  <span style={{ ...blueTagStyle, marginLeft: 6 }}>{lvl.stage || 'JHS'}</span>
                </div>
                <div style={{ display: 'flex', gap: 4 }}>
                  <button type="button" onClick={() => handleEdit(lvl)} style={iconActionBtn} title="Edit year level">
                    <Pencil size={13} color="#004b87" />
                  </button>
                  <button type="button" onClick={() => handleDelete(lvl.id)} style={iconActionBtn} title="Delete year level">
                    <Trash2 size={13} color="#ef4444" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </form>
  );
};

export default AcademicSetupModal;

// Styles
const backdropStyle: React.CSSProperties = {
  position: 'fixed',
  top: 0,
  left: 0,
  width: '100vw',
  height: '100vh',
  backgroundColor: 'rgba(15, 23, 42, 0.65)',
  backdropFilter: 'blur(3px)',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  zIndex: 9999,
};

const boxStyle: React.CSSProperties = {
  backgroundColor: '#ffffff',
  borderRadius: 14,
  width: '95vw',
  maxWidth: 680,
  maxHeight: '92vh',
  overflowY: 'auto',
  padding: '24px 26px',
  boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.1), 0 10px 10px -5px rgba(0, 0, 0, 0.04)',
  fontFamily: 'Inter, system-ui, -apple-system, sans-serif',
  border: '1px solid #e2e8f0',
};

const headerStyle: React.CSSProperties = {
  display: 'flex',
  justifyContent: 'space-between',
  alignItems: 'flex-start',
  marginBottom: 16,
};

const iconBadgeStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  width: 28,
  height: 28,
  borderRadius: 6,
  backgroundColor: '#f0f9ff',
  border: '1px solid #bae6fd',
};

const titleStyle: React.CSSProperties = {
  margin: 0,
  fontSize: '1.15rem',
  fontWeight: 800,
  color: '#0f172a',
};

const subtitleStyle: React.CSSProperties = {
  margin: '4px 0 0 0',
  fontSize: '0.78rem',
  color: '#64748b',
};

const closeButtonStyle: React.CSSProperties = {
  background: 'none',
  border: 'none',
  cursor: 'pointer',
  color: '#94a3b8',
  padding: 4,
};

const tabGroupStyle: React.CSSProperties = {
  display: 'flex',
  gap: 4,
  backgroundColor: '#f1f5f9',
  padding: 4,
  borderRadius: 8,
  border: '1px solid #e2e8f0',
  flexWrap: 'wrap',
};

const baseTabStyle: React.CSSProperties = {
  flex: 1,
  minWidth: 85,
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  gap: 5,
  border: 'none',
  padding: '8px 4px',
  borderRadius: 6,
  fontSize: '0.74rem',
  fontWeight: 700,
  cursor: 'pointer',
};

const activeTabStyle: React.CSSProperties = {
  ...baseTabStyle,
  backgroundColor: '#ffffff',
  color: '#004b87',
  boxShadow: '0 1px 3px rgba(0, 0, 0, 0.08)',
};

const inactiveTabStyle: React.CSSProperties = {
  ...baseTabStyle,
  backgroundColor: 'transparent',
  color: '#64748b',
};

const formStyle: React.CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: 14,
};

const rowStyle: React.CSSProperties = {
  display: 'flex',
  gap: 12,
  flexWrap: 'wrap',
};

const labelStyle: React.CSSProperties = {
  display: 'block',
  fontSize: '0.74rem',
  fontWeight: 700,
  color: '#334155',
  marginBottom: 6,
};

const inputStyle: React.CSSProperties = {
  width: '100%',
  padding: '9px 12px',
  borderRadius: 6,
  border: '1px solid #cbd5e1',
  fontSize: '0.82rem',
  boxSizing: 'border-box',
  outline: 'none',
  backgroundColor: '#ffffff',
  color: '#0f172a',
};

const saveButtonStyle: React.CSSProperties = {
  marginTop: 4,
  padding: '11px 16px',
  backgroundColor: '#004b87',
  color: '#ffffff',
  border: 'none',
  borderRadius: 6,
  fontWeight: 700,
  fontSize: '0.84rem',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  gap: 8,
};

const cancelBtnStyle: React.CSSProperties = {
  marginTop: 4,
  padding: '11px 16px',
  backgroundColor: '#f1f5f9',
  color: '#475569',
  border: '1px solid #cbd5e1',
  borderRadius: 6,
  fontWeight: 700,
  fontSize: '0.84rem',
  cursor: 'pointer',
};

const errorCardStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: 8,
  padding: '10px 12px',
  borderRadius: 6,
  fontSize: '0.78rem',
  backgroundColor: '#fff1f2',
  color: '#991b1b',
  border: '1px solid #fecaca',
};

const warningBoxStyle: React.CSSProperties = {
  backgroundColor: '#fff1f2',
  border: '1px solid #fecaca',
  borderRadius: 8,
  padding: '12px 14px',
  display: 'flex',
  flexDirection: 'column',
  gap: 6,
  borderLeft: '4px solid #ef4444',
};

const loadingBoxStyle: React.CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  alignItems: 'center',
  justifyContent: 'center',
  gap: 10,
  padding: '48px 0',
};

const listCardStyle: React.CSSProperties = {
  marginTop: 6,
  backgroundColor: '#f8fafc',
  border: '1px solid #e2e8f0',
  borderRadius: 8,
  padding: '12px 14px',
};

const listHeaderStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
  fontSize: '0.74rem',
  fontWeight: 700,
  color: '#475569',
  marginBottom: 10,
  textTransform: 'uppercase',
};

const countTagStyle: React.CSSProperties = {
  backgroundColor: '#e2e8f0',
  color: '#475569',
  borderRadius: 12,
  padding: '2px 8px',
  fontSize: '0.68rem',
  fontWeight: 700,
  textTransform: 'none',
};

const gridStyle: React.CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: 8,
  maxHeight: 240,
  overflowY: 'auto',
};

const itemCardStyle: React.CSSProperties = {
  display: 'flex',
  backgroundColor: '#ffffff',
  border: '1px solid #e2e8f0',
  borderRadius: 8,
  padding: '10px 12px',
};

const blueTagStyle: React.CSSProperties = {
  backgroundColor: '#f0f9ff',
  color: '#004b87',
  border: '1px solid #bae6fd',
  borderRadius: 4,
  padding: '1px 5px',
  fontSize: '0.66rem',
  fontWeight: 700,
};

const autoBadgePill: React.CSSProperties = {
  display: 'inline-flex',
  alignItems: 'center',
  gap: 4,
  padding: '1px 7px',
  borderRadius: 10,
  fontSize: '0.64rem',
  fontWeight: 800,
  backgroundColor: '#ecfdf5',
  color: '#047857',
  border: '1px solid #a7f3d0',
};

const subjectTeacherPill: React.CSSProperties = {
  display: 'inline-flex',
  alignItems: 'center',
  gap: 4,
  padding: '2px 6px',
  borderRadius: 4,
  backgroundColor: '#f1f5f9',
  border: '1px solid #e2e8f0',
  fontSize: '0.68rem',
  color: '#334155',
};

const iconActionBtn: React.CSSProperties = {
  background: 'none',
  border: 'none',
  cursor: 'pointer',
  padding: 4,
  borderRadius: 4,
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
};

const emptyTextStyle: React.CSSProperties = {
  fontSize: '0.74rem',
  color: '#94a3b8',
  fontStyle: 'italic',
};