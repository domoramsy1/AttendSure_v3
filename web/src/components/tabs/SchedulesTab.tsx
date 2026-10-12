/**
 * AttendSure V3 - Academic Timetables, Sections & Schedules
 * File: frontend/src/components/tabs/SchedulesTab.tsx
 *
 * Key Upgrades:
 * 1. DEFAULT USER ICON: Faculty assignments render real portraits or the neutral <User /> icon fallback.
 * 2. LIVE DATABASE POLLING: Silent 3-second background polling keeps timetables updated without full page reloads.
 * 3. REUSABLE ALERTS: Uses showConfirm and showAlert from AlertContext for schedule removals.
 * 4. TELEMETRY STATS: Live summary metric cards for Periods, Sections, Assigned Teachers, and Classrooms.
 * 5. SAFE INTERACTION GUARD: Polling pauses seamlessly while the AcademicSetupModal is active.
 */

import React, { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import apiClient from '../../api/client';
import { useAlert } from '../../context/AlertContext';
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
  BookOpen, 
  Loader2, 
  AlertCircle, 
  RefreshCw,
  User,
  Plus
} from 'lucide-react';
import { AcademicSetupModal, type TabType as AcademicTabType } from '../modals/AcademicSetupModal';

// ============================================================================
// TYPE DEFINITIONS
// ============================================================================

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

interface FacultyOption {
  id: number;
  full_name: string;
  name?: string;
  user_id?: number;
  photo?: string | null;
  photo_url?: string | null;
  position?: string;
}

// ============================================================================
// REUSABLE DEFAULT USER AVATAR COMPONENT
// ============================================================================

interface ProfileAvatarProps {
  photoUrl?: string | null;
  name?: string;
  size?: number;
  iconSize?: number;
}

const ProfileAvatar: React.FC<ProfileAvatarProps> = ({
  photoUrl,
  name = 'Faculty Member',
  size = 30,
  iconSize = 16,
}) => {
  const [imageFailed, setImageFailed] = useState(false);

  useEffect(() => {
    setImageFailed(false);
  }, [photoUrl]);

  const hasPhoto = Boolean(
    photoUrl &&
    typeof photoUrl === 'string' &&
    photoUrl.trim() !== '' &&
    photoUrl.trim().toLowerCase() !== 'null' &&
    photoUrl.trim().toLowerCase() !== 'undefined'
  );

  return (
    <div
      style={{
        width: size,
        height: size,
        borderRadius: '50%',
        backgroundColor: '#f1f5f9',
        border: '1px solid #e2e8f0',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        overflow: 'hidden',
        flexShrink: 0,
      }}
      title={name}
    >
      {hasPhoto && !imageFailed ? (
        <img
          src={photoUrl!}
          alt={name}
          style={{ width: '100%', height: '100%', objectFit: 'cover' }}
          onError={() => setImageFailed(true)}
        />
      ) : (
        <User size={iconSize} color="#94a3b8" />
      )}
    </div>
  );
};

// ============================================================================
// MAIN COMPONENT
// ============================================================================

export const SchedulesTab: React.FC = () => {
  const { showAlert, showConfirm } = useAlert();

  const [schedules, setSchedules] = useState<ScheduleItem[]>([]);
  const [sections, setSections] = useState<SectionOption[]>([]);
  const [facultyList, setFacultyList] = useState<FacultyOption[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string>('');

  const [searchQuery, setSearchQuery] = useState<string>('');
  const [selectedSectionFilter, setSelectedSectionFilter] = useState<string>('ALL');

  const [isModalOpen, setIsModalOpen] = useState<boolean>(false);
  const [modalTab, setModalTab] = useState<AcademicTabType>('SCHEDULE');

  // Guard flag: prevents background polling from interrupting open modal workflows
  const isInteracting = useRef(false);
  isInteracting.current = isModalOpen;

  // ============================================================================
  // DATABASE DATA FETCHING & LIVE POLLING
  // ============================================================================

  const loadData = useCallback(async (silent = false) => {
    if (!silent) setLoading(true);
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
      if (!silent) {
        const status = err?.response?.status;
        const detail = err?.response?.data?.detail || err.message;
        setError(`[HTTP ${status || 'Error'}] Could not load timetable data: ${detail}`);
      }
    } finally {
      if (!silent) setLoading(false);
    }
  }, []);

  // Initial load
  useEffect(() => {
    loadData(false);
  }, [loadData]);

  // LIVE ZERO-REFRESH POLLING: Sync timetables every 3 seconds
  useEffect(() => {
    const liveInterval = setInterval(() => {
      if (!isInteracting.current) {
        loadData(true);
      }
    }, 3000);

    return () => clearInterval(liveInterval);
  }, [loadData]);

  // ============================================================================
  // ACTIONS
  // ============================================================================

  const handleDelete = (id: number, code: string) => {
    showConfirm({
      title: 'Delete Schedule Period',
      message: `Permanently delete schedule period "${code}" from the timetable database? This class assignment will be unassigned.`,
      confirmLabel: 'Delete Schedule',
      isDestructive: true,
      onConfirm: async () => {
        try {
          await apiClient.delete(`/schedules/${id}/`);
          setSchedules((prev) => prev.filter((item) => item.id !== id));
          showAlert({
            title: 'Schedule Removed',
            message: `Schedule ${code} was deleted successfully.`,
            type: 'info',
          });
          loadData(true);
        } catch (err: any) {
          showAlert({
            title: 'Delete Error',
            message: err?.response?.data?.detail || err.message || 'Failed to delete schedule period.',
            type: 'error',
          });
        }
      },
    });
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

  const getFacultyInfo = (item: ScheduleItem) => {
    let name = 'Unassigned';
    let photo: string | null = null;

    if (item.faculty_name) name = item.faculty_name;
    else if (item.teacher_name) name = item.teacher_name;
    else if (typeof item.faculty === 'object' && item.faculty) {
      name = item.faculty.full_name || item.faculty.name || 'Faculty Member';
      photo = item.faculty.photo_url || item.faculty.photo || null;
    }

    const rawId = item.faculty || item.faculty_id || item.teacher;
    if (rawId) {
      const matched = facultyList.find((f) => f.id === rawId || f.user_id === rawId);
      if (matched) {
        name = matched.full_name || matched.name || name;
        photo = matched.photo_url || matched.photo || photo;
      }
    }

    return { name, photo };
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
        const fac = getFacultyInfo(s).name.toLowerCase();
        const rm = getRoomDisplay(s).toLowerCase();

        return code.includes(q) || sec.includes(q) || sub.includes(q) || fac.includes(q) || rm.includes(q);
      }

      return true;
    });
  }, [schedules, selectedSectionFilter, searchQuery, facultyList]);

  // Telemetry Metrics
  const uniqueSectionsCount = new Set(schedules.map((s) => s.section_name || s.section).filter(Boolean)).size;
  const uniqueTeachersCount = new Set(schedules.map((s) => s.faculty_name || s.teacher_name || s.faculty).filter(Boolean)).size;
  const uniqueRoomsCount = new Set(schedules.map((s) => s.room_name || s.room_number || s.room).filter(Boolean)).size;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      {/* 1. Academic Telemetry Summary Cards */}
      <div style={statsGrid}>
        <div style={statCard}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={statLabel}>TOTAL TIMETABLE PERIODS</span>
            <Calendar size={18} color="#0284c7" />
          </div>
          <div style={statVal}>{schedules.length}</div>
          <div style={statSub}>Active schedule entries in database</div>
        </div>

        <div style={statCard}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={statLabel}>SCHEDULED SECTIONS</span>
            <Users size={18} color="#059669" />
          </div>
          <div style={{ ...statVal, color: '#059669' }}>{uniqueSectionsCount}</div>
          <div style={statSub}>Classes with assigned periods</div>
        </div>

        <div style={statCard}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={statLabel}>ASSIGNED TEACHERS</span>
            <User size={18} color="#0284c7" />
          </div>
          <div style={{ ...statVal, color: '#0284c7' }}>{uniqueTeachersCount}</div>
          <div style={statSub}>Faculty members teaching classes</div>
        </div>

        <div style={statCard}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={statLabel}>ROOMS UTILIZED</span>
            <DoorOpen size={18} color="#d97706" />
          </div>
          <div style={{ ...statVal, color: '#d97706' }}>{uniqueRoomsCount}</div>
          <div style={statSub}>Classrooms and labs occupied</div>
        </div>
      </div>

      {/* 2. Top Filter and Setup Navigation Bar */}
      <div style={controlBar}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, color: '#0284c7', fontWeight: 700, fontSize: '0.80rem' }}>
            <Filter size={15} /> Filter Section:
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

        <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
          <button
            onClick={() => handleOpenModal('YEAR_LEVEL')}
            style={secondaryBtnStyle}
            title="Add a Grade Level"
          >
            <Layers size={13} color="#0284c7" /> + Year Level
          </button>

          <button
            onClick={() => handleOpenModal('ROOM')}
            style={secondaryBtnStyle}
            title="Add a Classroom / Lab"
          >
            <DoorOpen size={13} color="#0284c7" /> + Room
          </button>

          <button
            onClick={() => handleOpenModal('SUBJECT')}
            style={secondaryBtnStyle}
            title="Add a Subject"
          >
            <BookOpen size={13} color="#0284c7" /> + Subject
          </button>

          <button
            onClick={() => handleOpenModal('SECTION')}
            style={secondaryBtnStyle}
            title="Add a Section"
          >
            <Users size={13} color="#0284c7" /> + Section
          </button>

          <button
            onClick={() => handleOpenModal('SCHEDULE')}
            style={primaryBtnStyle}
            title="Add a Class Schedule"
          >
            <Plus size={15} /> Add Schedule Period
          </button>
        </div>
      </div>

      {/* 3. Main Timetable Ledger */}
      <div style={cardStyle}>
        {/* Search Header */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16, flexWrap: 'wrap', gap: 10 }}>
          <div style={searchContainerStyle}>
            <Search size={15} color="#94a3b8" />
            <input
              type="text"
              placeholder="Search by section, subject code, teacher, room..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              style={searchInputStyle}
            />
          </div>

          <div style={{ fontSize: '0.78rem', color: '#64748b' }}>
            Showing <strong>{filteredSchedules.length}</strong> of{' '}
            <strong>{schedules.length}</strong> timetable slots
          </div>
        </div>

        {/* Error Banner */}
        {error && (
          <div style={errorBannerStyle}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <AlertCircle size={18} color="#991b1b" />
              <span>{error}</span>
            </div>
            <button onClick={() => loadData(false)} style={retryBtnStyle}>
              <RefreshCw size={13} /> Retry
            </button>
          </div>
        )}

        {/* Data Table */}
        {loading ? (
          <div style={loadingContainerStyle}>
            <Loader2 size={26} className="animate-spin" color="#0284c7" />
            <span style={{ fontSize: '0.84rem', color: '#64748b' }}>Loading schedules from database...</span>
          </div>
        ) : filteredSchedules.length === 0 ? (
          <div style={emptyContainerStyle}>
            <Calendar size={38} color="#cbd5e1" />
            <p style={{ margin: '8px 0 2px 0', fontWeight: 700, color: '#334155', fontSize: '0.88rem' }}>
              No timetable records found
            </p>
            <p style={{ margin: 0, fontSize: '0.76rem', color: '#94a3b8' }}>
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
                  const facultyInfo = getFacultyInfo(row);

                  return (
                    <tr key={row.id} style={tableRowStyle}>
                      <td style={tdStyle}>
                        <span style={codeBadge}>
                          {displayCode}
                        </span>
                      </td>

                      <td style={tdStyle}>
                        <div style={{ fontWeight: 800, color: '#0f172a', fontSize: '0.84rem' }}>
                          {row.section_name || (typeof row.section === 'object' ? row.section?.name : `Section #${row.section}`)}
                        </div>
                        {row.grade_level_name && (
                          <div style={{ fontSize: '0.72rem', color: '#64748b', marginTop: 1 }}>
                            {row.grade_level_name}
                          </div>
                        )}
                      </td>

                      <td style={tdStyle}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                          <BookOpen size={13} color="#0284c7" />
                          <span style={{ fontWeight: 800, color: '#0f172a', fontSize: '0.82rem' }}>
                            {getSubjectCode(row)}
                          </span>
                        </div>
                        {getSubjectName(row) && (
                          <div style={{ fontSize: '0.72rem', color: '#64748b', marginLeft: 19, marginTop: 1 }}>
                            {getSubjectName(row)}
                          </div>
                        )}
                      </td>

                      <td style={tdStyle}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                          <ProfileAvatar
                            photoUrl={facultyInfo.photo}
                            name={facultyInfo.name}
                            size={30}
                            iconSize={15}
                          />
                          <span style={{ fontSize: '0.80rem', fontWeight: 600, color: '#334155' }}>
                            {facultyInfo.name}
                          </span>
                        </div>
                      </td>

                      <td style={tdStyle}>
                        <div style={pillStyle}>
                          <Clock size={12} color="#64748b" />
                          <span>{formatTime(row.start_time)} - {formatTime(row.end_time)}</span>
                        </div>
                      </td>

                      <td style={tdStyle}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: '0.80rem', color: '#64748b' }}>
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
                            <Edit2 size={13} color="#0284c7" />
                          </button>
                          <button
                            onClick={() => handleDelete(row.id, displayCode)}
                            style={{ ...iconBtnStyle, borderColor: '#fecaca', backgroundColor: '#fef2f2' }}
                            title="Delete Schedule"
                          >
                            <Trash2 size={13} color="#ef4444" />
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
        onSuccess={() => loadData(true)}
      />
    </div>
  );
};

export default SchedulesTab;

// ============================================================================
// STYLES
// ============================================================================

const statsGrid: React.CSSProperties = {
  display: 'grid',
  gridTemplateColumns: 'repeat(4, 1fr)',
  gap: 14,
};

const statCard: React.CSSProperties = {
  backgroundColor: '#ffffff',
  borderRadius: 10,
  border: '1px solid #e2e8f0',
  padding: '16px 18px',
  boxShadow: '0 1px 3px rgba(0,0,0,0.02)',
};

const statLabel: React.CSSProperties = {
  fontSize: '0.68rem',
  fontWeight: 700,
  color: '#64748b',
  letterSpacing: '0.3px',
};

const statVal: React.CSSProperties = {
  fontSize: '1.50rem',
  fontWeight: 800,
  color: '#0f172a',
  lineHeight: 1.1,
  marginTop: 6,
};

const statSub: React.CSSProperties = {
  fontSize: '0.70rem',
  color: '#94a3b8',
  marginTop: 4,
};

const controlBar: React.CSSProperties = {
  display: 'flex',
  justifyContent: 'space-between',
  alignItems: 'center',
  padding: '10px 14px',
  backgroundColor: '#ffffff',
  borderRadius: 10,
  border: '1px solid #e2e8f0',
};

const cardStyle: React.CSSProperties = {
  backgroundColor: '#ffffff',
  borderRadius: 10,
  padding: '18px 20px',
  boxShadow: '0 1px 3px rgba(0, 0, 0, 0.03)',
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
  gap: 5,
  backgroundColor: '#f8fafc',
  color: '#334155',
  border: '1px solid #cbd5e1',
  padding: '7px 11px',
  borderRadius: 6,
  fontWeight: 700,
  fontSize: '0.76rem',
  cursor: 'pointer',
};

const primaryBtnStyle: React.CSSProperties = {
  display: 'inline-flex',
  alignItems: 'center',
  gap: 5,
  backgroundColor: '#0284c7',
  color: '#ffffff',
  border: 'none',
  padding: '7px 13px',
  borderRadius: 6,
  fontWeight: 700,
  fontSize: '0.76rem',
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
  color: '#0f172a',
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
  padding: '11px 14px',
  fontSize: '0.74rem',
  fontWeight: 700,
  color: '#475569',
  textTransform: 'uppercase',
  letterSpacing: '0.03em',
};

const tableRowStyle: React.CSSProperties = {
  borderBottom: '1px solid #f1f5f9',
};

const tdStyle: React.CSSProperties = {
  padding: '11px 14px',
  verticalAlign: 'middle',
};

const codeBadge: React.CSSProperties = {
  fontFamily: 'monospace',
  fontSize: '0.74rem',
  fontWeight: 800,
  color: '#0284c7',
  backgroundColor: '#eff6ff',
  padding: '2px 7px',
  borderRadius: 4,
  border: '1px solid #bae6fd',
};

const pillStyle: React.CSSProperties = {
  display: 'inline-flex',
  alignItems: 'center',
  gap: 5,
  backgroundColor: '#f8fafc',
  border: '1px solid #e2e8f0',
  padding: '3px 8px',
  borderRadius: 6,
  fontSize: '0.74rem',
  color: '#475569',
  fontWeight: 600,
};

const iconBtnStyle: React.CSSProperties = {
  background: '#ffffff',
  border: '1px solid #cbd5e1',
  borderRadius: 6,
  padding: '5px 7px',
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