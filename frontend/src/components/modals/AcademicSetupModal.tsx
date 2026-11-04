/**
 * AttendSure V3 - Academic Setup & Institutional Structure Modal
 * File: frontend/src/components/modals/AcademicSetupModal.tsx
 *
 * Capabilities:
 * - Schedules: Live conflict checking, duplicate detection, and full Create/Edit/Delete lifecycle.
 * - Sections: Double-booking prevention for class advisers and homerooms.
 * - Subjects: Code uniqueness validation and unit classification.
 * - Rooms: Capacity tracking and facility classification.
 * - Year Levels: Automated stage progression (Elementary, JHS, SHS).
 * - Safe rendering: Unwraps nested DRF serializer objects to avoid React child crashes.
 * - Modal controls: Escape key and backdrop dismissal.
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
  CheckCircle2,
  Clock,
  ShieldAlert,
  Hash,
  Database,
  Pencil,
  Trash2
} from 'lucide-react';

export type TabType = 'SCHEDULE' | 'SECTION' | 'SUBJECT' | 'ROOM' | 'YEAR_LEVEL';

export interface ModalProps {
  isOpen: boolean;
  initialTab?: TabType;
  onClose: () => void;
  onSuccess: () => void;
}

// Converts 24-hour time string ("07:30", "13:45:00") into 12-hour format ("07:30 AM", "01:45 PM")
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

function getErrorMessage(err: any): string {
  const data = err?.response?.data;
  if (!err.response) return 'Cannot reach server. Please check your network connection.';
  if (typeof data === 'string') return data.slice(0, 120);
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
  onClose,
  onSuccess,
}) => {
  const [activeTab, setActiveTab] = useState<TabType>(initialTab);

  useEffect(() => {
    if (isOpen) {
      setActiveTab(initialTab);
    }
  }, [isOpen, initialTab]);

  // Keyboard shortcut (Escape to dismiss)
  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  return (
    <div
      style={backdropStyle}
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-labelledby="academic-setup-title"
    >
      <div style={boxStyle} onClick={(e) => e.stopPropagation()}>
        {/* Header */}
        <div style={headerStyle}>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <div style={iconBadgeStyle}>
                <Database size={16} color="#0284c7" />
              </div>
              <h3 id="academic-setup-title" style={titleStyle}>
                Academic Setup
              </h3>
            </div>
            <p style={subtitleStyle}>Manage schedules, sections, subjects, rooms, and year levels</p>
          </div>
          <button
            onClick={onClose}
            style={closeButtonStyle}
            type="button"
            aria-label="Close dialog"
          >
            <X size={18} />
          </button>
        </div>

        {/* Tab Buttons */}
        <div style={tabGroupStyle}>
          <button
            type="button"
            onClick={() => setActiveTab('SCHEDULE')}
            style={activeTab === 'SCHEDULE' ? activeTabStyle : inactiveTabStyle}
          >
            <Calendar size={14} /> Schedules
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('SECTION')}
            style={activeTab === 'SECTION' ? activeTabStyle : inactiveTabStyle}
          >
            <Users size={14} /> Sections
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

        {/* Tab Views */}
        <div style={{ marginTop: 16 }}>
          {activeTab === 'SCHEDULE' && <ScheduleForm onSuccess={onSuccess} />}
          {activeTab === 'SECTION' && <SectionForm onSuccess={onSuccess} />}
          {activeTab === 'SUBJECT' && <SubjectForm onSuccess={onSuccess} />}
          {activeTab === 'ROOM' && <RoomForm onSuccess={onSuccess} />}
          {activeTab === 'YEAR_LEVEL' && <YearLevelForm onSuccess={onSuccess} />}
        </div>
      </div>
    </div>
  );
};

// ===========================================================================
// 1. SCHEDULE FORM
// ===========================================================================
const ScheduleForm: React.FC<{ onSuccess: () => void }> = ({ onSuccess }) => {
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
  const [clashList, setClashList] = useState<string[]>([]);
  const [checkingClash, setCheckingClash] = useState(false);

  const loadAllData = useCallback(async () => {
    try {
      const [secRes, subRes, teachRes, roomRes, schedRes] = await Promise.all([
        apiClient.get('/sections/'),
        apiClient.get('/subjects/'),
        apiClient.get('/facultys/'),
        apiClient.get('/rooms/'),
        apiClient.get('/schedules/'),
      ]);
      setSections(Array.isArray(secRes.data) ? secRes.data : secRes.data.results || []);
      setSubjects(Array.isArray(subRes.data) ? subRes.data : subRes.data.results || []);
      setTeachers(Array.isArray(teachRes.data) ? teachRes.data : teachRes.data.results || []);
      setRooms(Array.isArray(roomRes.data) ? roomRes.data : roomRes.data.results || []);
      setAllSchedules(Array.isArray(schedRes.data) ? schedRes.data : schedRes.data.results || []);
    } catch (err) {
      console.error('Cannot load schedule metadata:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadAllData();
  }, [loadAllData]);

  const isCodeDuplicate = useMemo(() => {
    const clean = code.trim().toLowerCase();
    if (!clean) return false;
    return allSchedules.some(
      (s) => (editingId ? s.id !== editingId : true) && (s.code || s.schedule_code)?.trim().toLowerCase() === clean
    );
  }, [code, editingId, allSchedules]);

  // Live conflict checking with debounce
  useEffect(() => {
    if (startTime && endTime && startTime >= endTime) {
      setClashList(['Start time must be before end time.']);
      return;
    }

    if (!startTime || !endTime || (!sectionId && !facultyId && !roomId)) {
      setClashList([]);
      return;
    }

    const timer = setTimeout(async () => {
      setCheckingClash(true);
      try {
        const res = await apiClient.post('/schedules/validate-conflict/', {
          exclude_id: editingId || null,
          section_id: sectionId ? parseInt(sectionId, 10) : null,
          faculty_id: facultyId ? parseInt(facultyId, 10) : null,
          room_id: roomId ? parseInt(roomId, 10) : null,
          days_of_week: daysOfWeek,
          start_time: startTime,
          end_time: endTime,
        });

        if (res.data?.has_conflict) {
          setClashList(res.data.conflicts || []);
        } else {
          setClashList([]);
        }
      } catch {
        setClashList([]);
      } finally {
        setCheckingClash(false);
      }
    }, 250);

    return () => clearTimeout(timer);
  }, [sectionId, facultyId, roomId, daysOfWeek, startTime, endTime, editingId]);

  // Safe Section filtering across object and ID references
  const sectionClasses = useMemo(() => {
    if (!sectionId) return [];
    return allSchedules.filter((s) => {
      const secVal = typeof s.section === 'object' ? s.section?.id : s.section;
      return String(secVal) === String(sectionId) || String(s.section_id) === String(sectionId);
    });
  }, [sectionId, allSchedules]);

  const handleEdit = (item: any) => {
    setEditingId(item.id);
    setCode(item.code || item.schedule_code || '');
    const secVal = typeof item.section === 'object' ? item.section?.id : (item.section_id || item.section);
    setSectionId(secVal ? String(secVal) : '');
    const subVal = typeof item.subject === 'object' ? item.subject?.id : (item.subject_id || item.subject);
    setSubjectId(subVal ? String(subVal) : '');
    const facVal = typeof item.faculty === 'object' ? item.faculty?.id : (item.faculty_id || item.teacher || item.faculty);
    setFacultyId(facVal ? String(facVal) : '');
    const rmVal = typeof item.room === 'object' ? item.room?.id : (item.room_id || item.room);
    setRoomId(rmVal ? String(rmVal) : '');
    setDaysOfWeek(item.days_of_week || 'MON-FRI');
    setStartTime(item.start_time ? item.start_time.slice(0, 5) : '07:30');
    setEndTime(item.end_time ? item.end_time.slice(0, 5) : '08:30');
    setServerError('');
  };

  const handleCancelEdit = () => {
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
  };

  const handleDeleteSchedule = async (id: number) => {
    if (!window.confirm('Are you sure you want to delete this schedule period?')) return;
    try {
      await apiClient.delete(`/schedules/${id}/`);
      if (editingId === id) handleCancelEdit();
      await loadAllData();
      onSuccess();
    } catch (err: any) {
      alert(getErrorMessage(err));
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (clashList.length > 0 || isCodeDuplicate) return;

    setSaving(true);
    setServerError('');

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
      teacher: facNum,
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
      setServerError(getErrorMessage(err));
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div style={loadingBoxStyle}>
        <Loader2 size={24} className="animate-spin" color="#0284c7" />
        <span style={{ fontSize: '0.80rem', color: '#64748b' }}>Loading records...</span>
      </div>
    );
  }

  const hasClash = clashList.length > 0;

  return (
    <form onSubmit={handleSubmit} style={formStyle}>
      {serverError && <div style={errorCardStyle}><AlertCircle size={15} /> {serverError}</div>}

      {hasClash && (
        <div style={warningBoxStyle}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, color: '#b91c1c', fontWeight: 700, fontSize: '0.78rem' }}>
            <ShieldAlert size={16} /> Conflict Found
          </div>
          {clashList.map((msg, idx) => (
            <div key={idx} style={{ color: '#991b1b', fontSize: '0.74rem', marginLeft: 22 }}>
              • {msg}
            </div>
          ))}
        </div>
      )}

      <div style={rowStyle}>
        <div style={{ flex: 1 }}>
          <label style={labelStyle}>Schedule Code *</label>
          <input
            type="text"
            required
            placeholder="e.g. SCH-001"
            value={code}
            onChange={(e) => setCode(e.target.value)}
            style={
              code.trim() === ''
                ? inputStyle
                : isCodeDuplicate
                ? badInputStyle
                : goodInputStyle
            }
          />
          {code.trim() !== '' && (
            isCodeDuplicate ? (
              <div style={invalidFeedbackStyle}>
                <AlertCircle size={12} /> Code already exists
              </div>
            ) : (
              <div style={validFeedbackStyle}>
                <CheckCircle2 size={12} /> Code available
              </div>
            )
          )}
        </div>
        <div style={{ flex: 1 }}>
          <label style={labelStyle}>Section *</label>
          <select 
            required 
            value={sectionId} 
            onChange={(e) => setSectionId(e.target.value)} 
            style={inputStyle}
          >
            <option value="">-- Choose Section --</option>
            {sections.map((s) => {
              const glName = typeof s.grade_level === 'object' ? s.grade_level?.name : (s.grade_level_name || s.grade_level);
              return (
                <option key={s.id} value={s.id}>
                  {s.name} {glName ? `(${glName})` : ''}
                </option>
              );
            })}
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
            <option value="">-- Choose Subject --</option>
            {subjects.map((sub) => (
              <option key={sub.id} value={sub.id}>
                {sub.code ? `${sub.code} - ` : ''}{sub.title || sub.name}
              </option>
            ))}
          </select>
        </div>
        <div style={{ flex: 1 }}>
          <label style={labelStyle}>Teacher *</label>
          <select 
            required 
            value={facultyId} 
            onChange={(e) => setFacultyId(e.target.value)} 
            style={inputStyle}
          >
            <option value="">-- Choose Teacher --</option>
            {teachers.map((t) => {
              const tName = t.full_name || `${t.first_name || ''} ${t.last_name || ''}`.trim() || t.name;
              return (
                <option key={t.id} value={t.id}>{tName}</option>
              );
            })}
          </select>
        </div>
      </div>

      <div style={rowStyle}>
        <div style={{ flex: 1 }}>
          <label style={labelStyle}>Room</label>
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
            <option value="MON-FRI">Monday to Friday</option>
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
            style={hasClash ? badInputStyle : inputStyle} 
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
            style={hasClash ? badInputStyle : inputStyle} 
          />
        </div>
      </div>

      <div style={{ display: 'flex', gap: 8 }}>
        <button 
          type="submit" 
          disabled={saving || hasClash || checkingClash || isCodeDuplicate || !code.trim()} 
          style={{
            ...saveButtonStyle,
            flex: 1,
            backgroundColor: (hasClash || isCodeDuplicate || !code.trim()) ? '#94a3b8' : '#0284c7',
            cursor: (hasClash || isCodeDuplicate || !code.trim()) ? 'not-allowed' : 'pointer'
          }}
        >
          {saving ? <Loader2 size={16} className="animate-spin" /> : editingId ? 'Update Schedule Period' : 'Save Schedule Period'}
        </button>

        {editingId && (
          <button type="button" onClick={handleCancelEdit} style={cancelBtnStyle}>
            Cancel
          </button>
        )}
      </div>

      {sectionId && (
        <div style={listCardStyle}>
          <div style={listHeaderStyle}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <Clock size={13} color="#0284c7" />
              <span>Current Classes for this Section</span>
            </div>
            <span style={countTagStyle}>{sectionClasses.length} slots</span>
          </div>

          {sectionClasses.length === 0 ? (
            <div style={emptyTextStyle}>No classes yet for this section. All times are open.</div>
          ) : (
            <div style={gridStyle}>
              {sectionClasses.map((item) => {
                const subDisplay = item.subject_code || (typeof item.subject === 'object' ? item.subject?.code : '') || item.code;
                return (
                  <div key={item.id} style={itemCardStyle}>
                    <div>
                      <div style={{ fontWeight: 700, color: '#0f172a' }}>
                        {formatTime12Hour(item.start_time)} - {formatTime12Hour(item.end_time)}
                      </div>
                      <div style={{ fontSize: '0.70rem', color: '#64748b' }}>
                        {subDisplay} • {item.days_of_week || 'MON-FRI'}
                      </div>
                    </div>
                    <div style={{ display: 'flex', gap: 4 }}>
                      <button
                        type="button"
                        onClick={() => handleEdit(item)}
                        style={iconActionBtn}
                        title="Edit schedule period"
                      >
                        <Pencil size={13} color="#0284c7" />
                      </button>
                      <button
                        type="button"
                        onClick={() => handleDeleteSchedule(item.id)}
                        style={iconActionBtn}
                        title="Delete period"
                      >
                        <Trash2 size={13} color="#ef4444" />
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}
    </form>
  );
};

// ===========================================================================
// 2. SECTION FORM
// ===========================================================================
const SectionForm: React.FC<{ onSuccess: () => void }> = ({ onSuccess }) => {
  const [editingId, setEditingId] = useState<number | null>(null);
  const [name, setName] = useState('');
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
        apiClient.get('/grade-levels/'),
        apiClient.get('/facultys/'),
        apiClient.get('/rooms/'),
        apiClient.get('/sections/'),
      ]);
      setGradeLevels(Array.isArray(glRes.data) ? glRes.data : glRes.data.results || []);
      setTeachers(Array.isArray(teachRes.data) ? teachRes.data : teachRes.data.results || []);
      setRooms(Array.isArray(roomRes.data) ? roomRes.data : roomRes.data.results || []);
      setExistingSections(Array.isArray(secRes.data) ? secRes.data : secRes.data.results || []);
    } catch (err: any) {
      setError(getErrorMessage(err));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadAllData();
  }, [loadAllData]);

  const isNameDuplicate = useMemo(() => {
    const clean = name.trim().toLowerCase();
    if (!clean) return false;
    return existingSections.some((s) => {
      if (editingId && s.id === editingId) return false;
      const sameName = s.name?.trim().toLowerCase() === clean;
      const sLevel = typeof s.grade_level === 'object' ? s.grade_level?.id : (s.grade_level_id || s.grade_level);
      const sameLevel = gradeLevelId ? String(sLevel) === String(gradeLevelId) : true;
      return sameName && sameLevel;
    });
  }, [name, gradeLevelId, editingId, existingSections]);

  const adviserBusyError = useMemo(() => {
    if (!adviserId) return '';
    const busy = existingSections.find((s) => {
      if (editingId && s.id === editingId) return false;
      const sAdvId = typeof s.adviser === 'object' ? s.adviser?.id : (s.adviser_id || s.adviser);
      return String(sAdvId) === String(adviserId);
    });
    if (busy) {
      const teacherObj = teachers.find((t) => String(t.id) === String(adviserId));
      const tName = teacherObj ? (teacherObj.full_name || `${teacherObj.first_name || ''} ${teacherObj.last_name || ''}`.trim() || teacherObj.name) : 'Selected Teacher';
      return `Teacher conflict: ${tName} is already adviser for "${busy.name}".`;
    }
    return '';
  }, [adviserId, editingId, existingSections, teachers]);

  const handleEdit = (sec: any) => {
    setEditingId(sec.id);
    setName(sec.name || '');
    const glVal = typeof sec.grade_level === 'object' ? sec.grade_level?.id : (sec.grade_level_id || sec.grade_level);
    setGradeLevelId(glVal ? String(glVal) : '');
    const advVal = typeof sec.adviser === 'object' ? sec.adviser?.id : (sec.adviser_id || sec.adviser);
    setAdviserId(advVal ? String(advVal) : '');
    setRoomId(sec.room_number || sec.room_name || '');
    setError('');
  };

  const handleCancelEdit = () => {
    setEditingId(null);
    setName('');
    setGradeLevelId('');
    setAdviserId('');
    setRoomId('');
    setError('');
  };

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
    if (isNameDuplicate || adviserBusyError) return;

    setSaving(true);
    setError('');

    const glNum = gradeLevelId ? parseInt(gradeLevelId, 10) : null;
    const advNum = adviserId ? parseInt(adviserId, 10) : null;

    const payload = {
      name: name.trim(),
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
        <Loader2 size={24} className="animate-spin" color="#0284c7" />
        <span style={{ fontSize: '0.80rem', color: '#64748b' }}>Loading records...</span>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} style={formStyle}>
      {error && <div style={errorCardStyle}><AlertCircle size={15} /> {error}</div>}

      {adviserBusyError && (
        <div style={warningBoxStyle}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, color: '#b91c1c', fontWeight: 700, fontSize: '0.78rem' }}>
            <ShieldAlert size={16} /> Adviser Conflict
          </div>
          <div style={{ color: '#991b1b', fontSize: '0.74rem', marginLeft: 22 }}>
            • {adviserBusyError}
          </div>
        </div>
      )}

      <div>
        <label style={labelStyle}>Section Name *</label>
        <input
          type="text"
          required
          placeholder="e.g. Diamond, Emerald, Ruby, Sapphire"
          value={name}
          onChange={(e) => setName(e.target.value)}
          style={
            name.trim() === ''
              ? inputStyle
              : isNameDuplicate
              ? badInputStyle
              : goodInputStyle
          }
        />
        {name.trim() !== '' && (
          isNameDuplicate ? (
            <div style={invalidFeedbackStyle}>
              <AlertCircle size={12} /> Section name already exists in this level
            </div>
          ) : (
            <div style={validFeedbackStyle}>
              <CheckCircle2 size={12} /> Section name available
            </div>
          )
        )}
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
          <label style={labelStyle}>Class Adviser</label>
          <select 
            value={adviserId} 
            onChange={(e) => setAdviserId(e.target.value)} 
            style={adviserBusyError ? badInputStyle : inputStyle}
          >
            <option value="">-- Optional: Choose Teacher --</option>
            {teachers.map((t) => {
              const tName = t.full_name || `${t.first_name || ''} ${t.last_name || ''}`.trim() || t.name;
              return (
                <option key={t.id} value={t.id}>{tName}</option>
              );
            })}
          </select>
        </div>
        <div style={{ flex: 1 }}>
          <label style={labelStyle}>Homeroom</label>
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

      <div style={{ display: 'flex', gap: 8 }}>
        <button 
          type="submit" 
          disabled={saving || isNameDuplicate || !!adviserBusyError || !name.trim()} 
          style={{
            ...saveButtonStyle,
            flex: 1,
            backgroundColor: (isNameDuplicate || !!adviserBusyError || !name.trim()) ? '#94a3b8' : '#0284c7',
            cursor: (isNameDuplicate || !!adviserBusyError || !name.trim()) ? 'not-allowed' : 'pointer'
          }}
        >
          {saving ? <Loader2 size={16} className="animate-spin" /> : editingId ? 'Update Section' : 'Create Section'}
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
            <Users size={13} color="#0284c7" />
            <span>Existing Sections</span>
          </div>
          <span style={countTagStyle}>{existingSections.length} sections</span>
        </div>

        {existingSections.length === 0 ? (
          <div style={emptyTextStyle}>No sections saved yet.</div>
        ) : (
          <div style={gridStyle}>
            {existingSections.map((sec) => {
              const glDisplayName = typeof sec.grade_level === 'object' ? sec.grade_level?.name : (sec.grade_level_name || sec.grade_level);
              return (
                <div key={sec.id} style={itemCardStyle}>
                  <div>
                    <span style={{ fontWeight: 700, color: '#0f172a' }}>{sec.name}</span>
                    {glDisplayName && (
                      <span style={{ ...blueTagStyle, marginLeft: 6 }}>{String(glDisplayName)}</span>
                    )}
                  </div>
                  <div style={{ display: 'flex', gap: 4 }}>
                    <button type="button" onClick={() => handleEdit(sec)} style={iconActionBtn} title="Edit section">
                      <Pencil size={13} color="#0284c7" />
                    </button>
                    <button type="button" onClick={() => handleDelete(sec.id)} style={iconActionBtn} title="Delete section">
                      <Trash2 size={13} color="#ef4444" />
                    </button>
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
// 3. SUBJECT FORM
// ===========================================================================
const SubjectForm: React.FC<{ onSuccess: () => void }> = ({ onSuccess }) => {
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
      const res = await apiClient.get('/subjects/');
      setExistingSubjects(Array.isArray(res.data) ? res.data : res.data.results || []);
    } catch (err) {
      console.error('Cannot load subjects:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadSubjects();
  }, [loadSubjects]);

  const isCodeDuplicate = useMemo(() => {
    const clean = code.trim().toLowerCase();
    if (!clean) return false;
    return existingSubjects.some(
      (s) => (editingId ? s.id !== editingId : true) && s.code?.trim().toLowerCase() === clean
    );
  }, [code, editingId, existingSubjects]);

  const handleEdit = (sub: any) => {
    setEditingId(sub.id);
    setCode(sub.code || '');
    setTitle(sub.title || sub.name || '');
    setUnits(String(sub.units || '1'));
    setSubjectType(sub.subject_type || sub.tier || 'Core');
    setError('');
  };

  const handleCancelEdit = () => {
    setEditingId(null);
    setCode('');
    setTitle('');
    setUnits('1');
    setSubjectType('Core');
    setError('');
  };

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
    if (isCodeDuplicate) return;

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
        <Loader2 size={24} className="animate-spin" color="#0284c7" />
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
            style={
              code.trim() === ''
                ? inputStyle
                : isCodeDuplicate
                ? badInputStyle
                : goodInputStyle
            }
          />
          {code.trim() !== '' && (
            isCodeDuplicate ? (
              <div style={invalidFeedbackStyle}>
                <AlertCircle size={12} /> Subject code already exists
              </div>
            ) : (
              <div style={validFeedbackStyle}>
                <CheckCircle2 size={12} /> Code available
              </div>
            )
          )}
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
          disabled={saving || isCodeDuplicate || !code.trim() || !title.trim()} 
          style={{
            ...saveButtonStyle,
            flex: 1,
            backgroundColor: (isCodeDuplicate || !code.trim() || !title.trim()) ? '#94a3b8' : '#0284c7',
            cursor: (isCodeDuplicate || !code.trim() || !title.trim()) ? 'not-allowed' : 'pointer'
          }}
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
            <BookOpen size={13} color="#0284c7" />
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
                    <Pencil size={13} color="#0284c7" />
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
const RoomForm: React.FC<{ onSuccess: () => void }> = ({ onSuccess }) => {
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
      setExistingRooms(Array.isArray(res.data) ? res.data : res.data.results || []);
    } catch (err) {
      console.error('Cannot load rooms:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadRooms();
  }, [loadRooms]);

  const isRoomDuplicate = useMemo(() => {
    const clean = name.trim().toLowerCase();
    if (!clean) return false;
    return existingRooms.some(
      (r) => (editingId ? r.id !== editingId : true) && r.name?.trim().toLowerCase() === clean
    );
  }, [name, editingId, existingRooms]);

  const handleEdit = (r: any) => {
    setEditingId(r.id);
    setName(r.name || '');
    setBuilding(r.building || '');
    setCapacity(String(r.capacity || '45'));
    setRoomType(r.room_type || 'LECTURE');
    setError('');
  };

  const handleCancelEdit = () => {
    setEditingId(null);
    setName('');
    setBuilding('');
    setCapacity('45');
    setRoomType('LECTURE');
    setError('');
  };

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
    if (isRoomDuplicate) return;

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
        <Loader2 size={24} className="animate-spin" color="#0284c7" />
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
          style={
            name.trim() === ''
              ? inputStyle
              : isRoomDuplicate
              ? badInputStyle
              : goodInputStyle
          }
        />
        {name.trim() !== '' && (
          isRoomDuplicate ? (
            <div style={invalidFeedbackStyle}>
              <AlertCircle size={12} /> Room &quot;{name.trim()}&quot; is already saved
            </div>
          ) : (
            <div style={validFeedbackStyle}>
              <CheckCircle2 size={12} /> Room name available
            </div>
          )
        )}
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
          disabled={saving || isRoomDuplicate || !name.trim()} 
          style={{
            ...saveButtonStyle,
            flex: 1,
            backgroundColor: (isRoomDuplicate || !name.trim()) ? '#94a3b8' : '#0284c7',
            cursor: (isRoomDuplicate || !name.trim()) ? 'not-allowed' : 'pointer'
          }}
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
            <DoorOpen size={13} color="#0284c7" />
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
                    <Pencil size={13} color="#0284c7" />
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
const YearLevelForm: React.FC<{ onSuccess: () => void }> = ({ onSuccess }) => {
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
      const res = await apiClient.get('/grade-levels/');
      setExistingLevels(Array.isArray(res.data) ? res.data : res.data.results || []);
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

  const isLevelDuplicate = useMemo(() => {
    const clean = name.trim().toLowerCase();
    if (!clean) return false;
    return existingLevels.some(
      (l) => (editingId ? l.id !== editingId : true) && l.name?.trim().toLowerCase() === clean
    );
  }, [name, editingId, existingLevels]);

  const handleEdit = (lvl: any) => {
    setEditingId(lvl.id);
    setName(lvl.name || '');
    setLevelNumber(String(lvl.level_number || lvl.level_order || '7'));
    setStage(lvl.stage || 'JHS');
    setError('');
  };

  const handleCancelEdit = () => {
    setEditingId(null);
    setName('');
    setLevelNumber('7');
    setStage('JHS');
    setError('');
  };

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
    if (isLevelDuplicate) return;

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
        <Loader2 size={24} className="animate-spin" color="#0284c7" />
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
          style={
            name.trim() === ''
              ? inputStyle
              : isLevelDuplicate
              ? badInputStyle
              : goodInputStyle
          }
        />
        {name.trim() !== '' && (
          isLevelDuplicate ? (
            <div style={invalidFeedbackStyle}>
              <AlertCircle size={12} /> Year level &quot;{name.trim()}&quot; already exists
            </div>
          ) : (
            <div style={validFeedbackStyle}>
              <CheckCircle2 size={12} /> Name available
            </div>
          )
        )}
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
          disabled={saving || isLevelDuplicate || !name.trim()} 
          style={{
            ...saveButtonStyle,
            flex: 1,
            backgroundColor: (isLevelDuplicate || !name.trim()) ? '#94a3b8' : '#0284c7',
            cursor: (isLevelDuplicate || !name.trim()) ? 'not-allowed' : 'pointer'
          }}
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
            <Layers size={13} color="#0284c7" />
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
                    <Pencil size={13} color="#0284c7" />
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

// ===========================================================================
// STYLES
// ===========================================================================
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
  maxWidth: 640,
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
  color: '#0284c7',
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
  transition: 'border-color 0.15s ease, background-color 0.15s ease',
};

const badInputStyle: React.CSSProperties = {
  ...inputStyle,
  border: '1.5px solid #ef4444',
  backgroundColor: '#fff1f2',
  color: '#991b1b',
};

const goodInputStyle: React.CSSProperties = {
  ...inputStyle,
  border: '1.5px solid #16a34a',
  backgroundColor: '#f0fdf4',
  color: '#166534',
};

const validFeedbackStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: 4,
  marginTop: 4,
  fontSize: '0.70rem',
  fontWeight: 700,
  color: '#16a34a',
};

const invalidFeedbackStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: 4,
  marginTop: 4,
  fontSize: '0.70rem',
  fontWeight: 700,
  color: '#ef4444',
};

const saveButtonStyle: React.CSSProperties = {
  marginTop: 4,
  padding: '11px 16px',
  backgroundColor: '#0284c7',
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
  gap: 6,
  maxHeight: 180,
  overflowY: 'auto',
};

const itemCardStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
  gap: 8,
  backgroundColor: '#ffffff',
  border: '1px solid #e2e8f0',
  borderRadius: 6,
  padding: '6px 10px',
  fontSize: '0.74rem',
};

const blueTagStyle: React.CSSProperties = {
  backgroundColor: '#f0f9ff',
  color: '#0284c7',
  border: '1px solid #bae6fd',
  borderRadius: 4,
  padding: '1px 5px',
  fontSize: '0.66rem',
  fontWeight: 700,
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