import React, { useState, useEffect, useMemo } from 'react';
import apiClient from '../../api/client';
import { 
  Calendar, 
  Layers, 
  DoorOpen, 
  Users, 
  Search, 
  Filter, 
  Edit2, 
  Trash2, 
  Clock, 
  MapPin, 
  UserCheck, 
  BookOpen, 
  Loader2, 
  AlertCircle, 
  RefreshCw 
} from 'lucide-react';
import { AcademicSetupModal, type TabType as AcademicTabType } from '../modals/AcademicSetupModal';

interface ScheduleItem {
  id: number;
  schedule_code?: string;
  code?: string;
  section?: any;
  section_name?: string;
  grade_level_name?: string;
  subject?: any;
  subject_code?: string;
  subject_name?: string;
  faculty?: any;
  faculty_name?: string;
  faculty_id?: number;
  teacher?: any;
  teacher_name?: string;
  room?: any;
  room_name?: string;
  room_number?: string;
  start_time: string;
  end_time: string;
  days_of_week?: string;
}

interface SectionOption {
  id: number;
  name: string;
  grade_level_name?: string;
}

export const SchedulesTab: React.FC = () => {
  const [schedules, setSchedules] = useState<ScheduleItem[]>([]);
  const [sections, setSections] = useState<SectionOption[]>([]);
  const [facultyList, setFacultyList] = useState<any[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string>('');

  const [searchQuery, setSearchQuery] = useState<string>('');
  const [selectedSectionFilter, setSelectedSectionFilter] = useState<string>('ALL');

  const [isModalOpen, setIsModalOpen] = useState<boolean>(false);
  const [modalTab, setModalTab] = useState<AcademicTabType>('SCHEDULE');

  const loadData = async () => {
    setLoading(true);
    setError('');
    try {
      const [schedRes, secRes, facRes] = await Promise.all([
        apiClient.get('/schedules/'),
        apiClient.get('/sections/'),
        apiClient.get('/facultys/'),
      ]);

      setSchedules(Array.isArray(schedRes.data) ? schedRes.data : schedRes.data.results || []);
      setSections(Array.isArray(secRes.data) ? secRes.data : secRes.data.results || []);
      setFacultyList(Array.isArray(facRes.data) ? facRes.data : facRes.data.results || []);
    } catch (err: any) {
      const status = err?.response?.status;
      const detail = err?.response?.data?.detail || err.message;
      setError(`[HTTP ${status || 'Error'}] Could not load timetable data: ${detail}`);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  const handleDelete = async (id: number, code: string) => {
    if (!window.confirm(`Are you sure you want to delete schedule ${code}?`)) return;
    try {
      await apiClient.delete(`/schedules/${id}/`);
      setSchedules((prev) => prev.filter((item) => item.id !== id));
    } catch (err: any) {
      alert(`Delete failed: ${err?.response?.data?.detail || err.message}`);
    }
  };

  const handleOpenModal = (tab: AcademicTabType) => {
    setModalTab(tab);
    setIsModalOpen(true);
  };

  const formatTime = (timeStr?: string) => {
    if (!timeStr) return '--:--';
    const parts = timeStr.split(':');
    if (parts.length < 2) return timeStr;
    let hours = parseInt(parts[0], 10);
    const minutes = parts[1];
    const ampm = hours >= 12 ? 'PM' : 'AM';
    hours = hours % 12 || 12;
    const strHours = hours < 10 ? `0${hours}` : `${hours}`;
    return `${strHours}:${minutes} ${ampm}`;
  };

  const getScheduleCode = (item: ScheduleItem) => {
    return item.schedule_code || item.code || `SCH-${String(item.id).padStart(3, '0')}`;
  };

  const getFacultyDisplay = (item: ScheduleItem) => {
    if (item.faculty_name) return item.faculty_name;
    if (item.teacher_name) return item.teacher_name;
    if (typeof item.faculty === 'object' && item.faculty) return item.faculty.full_name || item.faculty.name;
    if (typeof item.faculty === 'string') return item.faculty;

    const rawId = item.faculty || item.faculty_id || item.teacher;
    if (rawId) {
      const matched = facultyList.find((f) => f.id === rawId || f.user_id === rawId);
      if (matched) return matched.full_name || matched.name;
    }

    return 'Unassigned';
  };

  const getSubjectCode = (item: ScheduleItem) => {
    if (item.subject_code) return item.subject_code;
    if (typeof item.subject === 'object' && item.subject) return item.subject.code || item.subject.name;
    if (typeof item.subject === 'string') return item.subject;
    return item.subject ? `SUB-${item.subject}` : '—';
  };

  const getSubjectName = (item: ScheduleItem) => {
    if (item.subject_name) return item.subject_name;
    if (typeof item.subject === 'object' && item.subject) return item.subject.name;
    return '';
  };

  const getRoomDisplay = (item: ScheduleItem) => {
    if (item.room_name) return item.room_name;
    if (item.room_number) return item.room_number;
    if (typeof item.room === 'object' && item.room) return item.room.name || item.room.room_number;
    if (typeof item.room === 'string') return item.room;
    if (item.room) return `Rm ${item.room}`;
    return '—';
  };

  const filteredSchedules = useMemo(() => {
    return schedules.filter((s) => {
      if (selectedSectionFilter !== 'ALL') {
        const matchesSection = 
          String(s.section) === selectedSectionFilter ||
          String(s.section_name) === selectedSectionFilter;
        if (!matchesSection) return false;
      }

      if (searchQuery.trim() !== '') {
        const q = searchQuery.toLowerCase();
        const code = getScheduleCode(s).toLowerCase();
        const sec = (s.section_name || String(s.section || '')).toLowerCase();
        const sub = (getSubjectCode(s) + ' ' + getSubjectName(s)).toLowerCase();
        const fac = getFacultyDisplay(s).toLowerCase();
        const rm = getRoomDisplay(s).toLowerCase();

        return code.includes(q) || sec.includes(q) || sub.includes(q) || fac.includes(q) || rm.includes(q);
      }

      return true;
    });
  }, [schedules, selectedSectionFilter, searchQuery, facultyList]);

  return (
    <div style={{ padding: '20px 24px', backgroundColor: '#f8fafc', minHeight: '100vh', fontFamily: 'sans-serif' }}>
      {/* Top Filter Bar */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, color: '#0284c7', fontWeight: 700, fontSize: '0.82rem' }}>
            <Filter size={16} /> Filter Section:
          </div>
          <select
            value={selectedSectionFilter}
            onChange={(e) => setSelectedSectionFilter(e.target.value)}
            style={selectStyle}
          >
            <option value="ALL">All Sections ({schedules.length} periods)</option>
            {sections.map((sec) => (
              <option key={sec.id} value={sec.id}>
                {sec.name} {sec.grade_level_name ? `(${sec.grade_level_name})` : ''}
              </option>
            ))}
          </select>
        </div>

        <div style={{ fontSize: '0.80rem', color: '#64748b' }}>
          Displaying <strong style={{ color: '#0f172a' }}>{filteredSchedules.length}</strong> of{' '}
          <strong style={{ color: '#0f172a' }}>{schedules.length}</strong> timetable slots
        </div>
      </div>

      {/* Main Content Card */}
      <div style={cardStyle}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 18, flexWrap: 'wrap', gap: 12 }}>
          <div>
            <h2 style={{ margin: 0, fontSize: '1.25rem', fontWeight: 800, color: '#0f172a' }}>
              Classes, Sections & Schedules
            </h2>
            <p style={{ margin: '4px 0 0 0', fontSize: '0.80rem', color: '#64748b' }}>
              Manage academic section timetables, subject room assignments, and assigned faculty.
            </p>
          </div>

          <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
            <button
              onClick={() => handleOpenModal('YEAR_LEVEL')}
              style={secondaryBtnStyle}
              title="Add a Grade Level"
            >
              <Layers size={14} color="#0284c7" /> + Year Level
            </button>

            <button
              onClick={() => handleOpenModal('ROOM')}
              style={secondaryBtnStyle}
              title="Add a Classroom / Lab"
            >
              <DoorOpen size={14} color="#0284c7" /> + Room
            </button>

            <button
              onClick={() => handleOpenModal('SUBJECT')}
              style={secondaryBtnStyle}
              title="Add a Subject"
            >
              <BookOpen size={14} color="#0284c7" /> + Subject
            </button>

            <button
              onClick={() => handleOpenModal('SECTION')}
              style={secondaryBtnStyle}
              title="Add a Section"
            >
              <Users size={14} color="#0284c7" /> + Section
            </button>

            <button
              onClick={() => handleOpenModal('SCHEDULE')}
              style={primaryBtnStyle}
              title="Add a Class Schedule"
            >
              <Calendar size={15} /> + Add Schedule Period
            </button>
          </div>
        </div>

        {/* Search */}
        <div style={{ display: 'flex', justifyContent: 'flex-start', marginBottom: 16 }}>
          <div style={searchContainerStyle}>
            <Search size={16} color="#94a3b8" />
            <input
              type="text"
              placeholder="Search by section, subject code, room..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              style={searchInputStyle}
            />
          </div>
        </div>

        {/* Error Banner */}
        {error && (
          <div style={errorBannerStyle}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <AlertCircle size={18} color="#991b1b" />
              <span>{error}</span>
            </div>
            <button onClick={loadData} style={retryBtnStyle}>
              <RefreshCw size={14} /> Retry
            </button>
          </div>
        )}

        {/* Table */}
        {loading ? (
          <div style={loadingContainerStyle}>
            <Loader2 size={28} className="animate-spin" color="#0284c7" />
            <span style={{ fontSize: '0.85rem', color: '#64748b' }}>Loading schedules from database...</span>
          </div>
        ) : filteredSchedules.length === 0 ? (
          <div style={emptyContainerStyle}>
            <Calendar size={40} color="#cbd5e1" />
            <p style={{ margin: '8px 0 2px 0', fontWeight: 700, color: '#334155', fontSize: '0.90rem' }}>
              No timetable records found
            </p>
            <p style={{ margin: 0, fontSize: '0.78rem', color: '#94a3b8' }}>
              Click <strong>"+ Add Schedule Period"</strong> above to schedule your first class.
            </p>
          </div>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table style={tableStyle}>
              <thead>
                <tr style={tableHeaderRowStyle}>
                  <th style={thStyle}>Code</th>
                  <th style={thStyle}>Section</th>
                  <th style={thStyle}>Subject / Course</th>
                  <th style={thStyle}>Assigned Faculty</th>
                  <th style={thStyle}>Time Period</th>
                  <th style={thStyle}>Room</th>
                  <th style={{ ...thStyle, textAlign: 'center' }}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {filteredSchedules.map((row) => {
                  const displayCode = getScheduleCode(row);
                  return (
                    <tr key={row.id} style={tableRowStyle}>
                      <td style={tdStyle}>
                        <span style={{ color: '#0284c7', fontWeight: 700, fontSize: '0.80rem' }}>
                          {displayCode}
                        </span>
                      </td>

                      <td style={tdStyle}>
                        <div style={{ fontWeight: 700, color: '#0f172a', fontSize: '0.82rem' }}>
                          {row.section_name || (typeof row.section === 'object' ? row.section?.name : `Section #${row.section}`)}
                        </div>
                        {row.grade_level_name && (
                          <div style={{ fontSize: '0.72rem', color: '#64748b' }}>
                            {row.grade_level_name}
                          </div>
                        )}
                      </td>

                      <td style={tdStyle}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                          <BookOpen size={14} color="#0284c7" />
                          <span style={{ fontWeight: 700, color: '#0f172a', fontSize: '0.82rem' }}>
                            {getSubjectCode(row)}
                          </span>
                        </div>
                        {getSubjectName(row) && (
                          <div style={{ fontSize: '0.72rem', color: '#64748b', marginLeft: 20 }}>
                            {getSubjectName(row)}
                          </div>
                        )}
                      </td>

                      <td style={tdStyle}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: '0.80rem', color: '#334155' }}>
                          <UserCheck size={14} color="#10b981" />
                          <span>{getFacultyDisplay(row)}</span>
                        </div>
                      </td>

                      <td style={tdStyle}>
                        <div style={pillStyle}>
                          <Clock size={13} color="#64748b" />
                          <span>{formatTime(row.start_time)} - {formatTime(row.end_time)}</span>
                        </div>
                      </td>

                      <td style={tdStyle}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: '0.80rem', color: '#64748b' }}>
                          <MapPin size={13} color="#94a3b8" />
                          <span>{getRoomDisplay(row)}</span>
                        </div>
                      </td>

                      <td style={{ ...tdStyle, textAlign: 'center' }}>
                        <div style={{ display: 'flex', justifyContent: 'center', gap: 6 }}>
                          <button
                            onClick={() => handleOpenModal('SCHEDULE')}
                            style={iconBtnStyle}
                            title="Edit Schedule"
                          >
                            <Edit2 size={14} color="#0284c7" />
                          </button>
                          <button
                            onClick={() => handleDelete(row.id, displayCode)}
                            style={{ ...iconBtnStyle, borderColor: '#fecaca' }}
                            title="Delete Schedule"
                          >
                            <Trash2 size={14} color="#ef4444" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <AcademicSetupModal
        isOpen={isModalOpen}
        initialTab={modalTab}
        onClose={() => setIsModalOpen(false)}
        onSuccess={loadData}
      />
    </div>
  );
};

const cardStyle: React.CSSProperties = {
  backgroundColor: '#ffffff',
  borderRadius: 8,
  padding: '20px 22px',
  boxShadow: '0 1px 3px rgba(0, 0, 0, 0.05)',
  border: '1px solid #e2e8f0',
};

const selectStyle: React.CSSProperties = {
  padding: '6px 12px',
  borderRadius: 6,
  border: '1px solid #cbd5e1',
  backgroundColor: '#ffffff',
  fontSize: '0.80rem',
  color: '#334155',
  fontWeight: 600,
  outline: 'none',
  cursor: 'pointer',
};

const secondaryBtnStyle: React.CSSProperties = {
  display: 'inline-flex',
  alignItems: 'center',
  gap: 6,
  backgroundColor: '#f8fafc',
  color: '#334155',
  border: '1px solid #cbd5e1',
  padding: '8px 12px',
  borderRadius: 6,
  fontWeight: 700,
  fontSize: '0.78rem',
  cursor: 'pointer',
};

const primaryBtnStyle: React.CSSProperties = {
  display: 'inline-flex',
  alignItems: 'center',
  gap: 6,
  backgroundColor: '#0284c7',
  color: '#ffffff',
  border: 'none',
  padding: '8px 14px',
  borderRadius: 6,
  fontWeight: 700,
  fontSize: '0.80rem',
  cursor: 'pointer',
};

const searchContainerStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: 8,
  padding: '6px 12px',
  borderRadius: 6,
  border: '1px solid #cbd5e1',
  backgroundColor: '#ffffff',
  width: '100%',
  maxWidth: 320,
};

const searchInputStyle: React.CSSProperties = {
  border: 'none',
  outline: 'none',
  fontSize: '0.80rem',
  width: '100%',
};

const tableStyle: React.CSSProperties = {
  width: '100%',
  borderCollapse: 'collapse',
  textAlign: 'left',
};

const tableHeaderRowStyle: React.CSSProperties = {
  borderBottom: '1px solid #e2e8f0',
  backgroundColor: '#f8fafc',
};

const thStyle: React.CSSProperties = {
  padding: '12px 14px',
  fontSize: '0.75rem',
  fontWeight: 700,
  color: '#475569',
  textTransform: 'uppercase',
  letterSpacing: '0.03em',
};

const tableRowStyle: React.CSSProperties = {
  borderBottom: '1px solid #f1f5f9',
};

const tdStyle: React.CSSProperties = {
  padding: '12px 14px',
  verticalAlign: 'middle',
};

const pillStyle: React.CSSProperties = {
  display: 'inline-flex',
  alignItems: 'center',
  gap: 6,
  backgroundColor: '#f1f5f9',
  padding: '4px 8px',
  borderRadius: 6,
  fontSize: '0.74rem',
  color: '#475569',
  fontWeight: 600,
};

const iconBtnStyle: React.CSSProperties = {
  background: '#ffffff',
  border: '1px solid #e2e8f0',
  borderRadius: 6,
  padding: '6px 8px',
  cursor: 'pointer',
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
};

const loadingContainerStyle: React.CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  alignItems: 'center',
  justifyContent: 'center',
  gap: 10,
  padding: '50px 0',
};

const emptyContainerStyle: React.CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  alignItems: 'center',
  justifyContent: 'center',
  padding: '40px 0',
};

const errorBannerStyle: React.CSSProperties = {
  display: 'flex',
  justifyContent: 'space-between',
  alignItems: 'center',
  backgroundColor: '#fef2f2',
  border: '1px solid #fecaca',
  color: '#991b1b',
  borderRadius: 6,
  padding: '10px 14px',
  marginBottom: 16,
  fontSize: '0.80rem',
};

const retryBtnStyle: React.CSSProperties = {
  display: 'inline-flex',
  alignItems: 'center',
  gap: 4,
  backgroundColor: '#ffffff',
  border: '1px solid #fca5a5',
  color: '#991b1b',
  padding: '4px 8px',
  borderRadius: 4,
  fontSize: '0.74rem',
  cursor: 'pointer',
  fontWeight: 700,
};