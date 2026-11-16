/**
 * AttendSure V3 - Academic Timetables, Sections & Schedules
 * File: web/src/components/tabs/SchedulesTab.tsx
 */

import React, { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import apiClient from '../../api/client';
import { useAlert } from '../../context/AlertContext';
import { 
  Calendar, 
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
  User as UserIcon,
  Plus,
  UserCheck,
  GraduationCap,
  Sparkles
} from 'lucide-react';
import { AcademicSetupModal, type TabType as AcademicTabType } from '../modals/AcademicSetupModal';

interface ScheduleItem {
  id: number;
  schedule_code?: string;
  code?: string;
  section?: number | { id: number; name?: string; section_name?: string } | null;
  section_id?: number;
  section_name?: string;
  grade_level_name?: string;
  subject?: number | { id: number; code?: string; title?: string; name?: string } | null;
  subject_id?: number;
  subject_code?: string;
  subject_name?: string; 
  subject_title?: string;
  faculty_id?: number;
  faculty?: number | { id: number; full_name?: string; name?: string; photo_url?: string; photo?: string; employee_id?: string } | null;
  faculty_name?: string;
  faculty_title?: string;
  room?: number | string | { id?: number; name?: string; room_number?: string } | null;
  room_name?: string;
  room_number?: string;
  start_time: string;
  end_time: string;
  days_of_week?: string;
}

interface SectionOption {
  id: number;
  name?: string;
  section_name?: string;
  code?: string;
  grade_level?: number | string | { id?: number; name?: string; code?: string };
  grade_level_name?: string;
  grade_level_code?: string;
  adviser?: number | string | { id?: number; full_name?: string; name?: string; photo_url?: string; photo?: string; employee_id?: string } | null;
  adviser_id?: number | null;
  adviser_name?: string;
  adviser_full_name?: string;
  adviser_employee_id?: string;
  adviser_photo_url?: string | null;
  room_number?: string;
  capacity?: number;
  is_adviser?: boolean;
}

interface FacultyOption {
  id: number;
  full_name: string;
  name?: string;
  employee_id?: string;
  photo?: string | null;
  photo_url?: string | null;
  position?: string;
  department?: string;
  can_teach?: boolean;
}

// Cybersecurity helper: blocks dangerous URI schemes
const isSafeImageUrl = (url?: string | null): boolean => {
  if (!url || typeof url !== 'string') return false;
  const clean = url.trim().toLowerCase();
  if (!clean || clean === 'null' || clean === 'undefined' || clean === 'none') return false;
  if (clean.startsWith('javascript:') || clean.startsWith('vbscript:')) return false;
  return clean.startsWith('http://') || clean.startsWith('https://') || clean.startsWith('/') || clean.startsWith('data:image/');
};

// Reads user role from local storage safely
const getUserRole = (): string => {
  try {
    const raw = localStorage.getItem('attendsure_user') || localStorage.getItem('user');
    if (raw) {
      const parsed = JSON.parse(raw);
      return String(parsed.role || parsed.system_role || '').toUpperCase();
    }
    return String(localStorage.getItem('attendsure_role') || '').toUpperCase();
  } catch {
    return '';
  }
};

const getSectionDisplayName = (sec: SectionOption): string => {
  return sec.name || sec.section_name || `Section #${sec.id}`;
};

interface ProfileAvatarProps {
  photoUrl?: string | null;
  name?: string;
  size?: number;
  iconSize?: number;
}

const ProfileAvatar: React.FC<ProfileAvatarProps> = ({
  photoUrl,
  name = 'Faculty',
  size = 30,
  iconSize = 15,
}) => {
  const [imageFailed, setImageFailed] = useState(false);

  useEffect(() => {
    setImageFailed(false);
  }, [photoUrl]);

  const safePhoto = isSafeImageUrl(photoUrl) ? photoUrl : null;

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
      {safePhoto && !imageFailed ? (
        <img
          src={safePhoto}
          alt={name}
          style={{ width: '100%', height: '100%', objectFit: 'cover' }}
          onError={() => setImageFailed(true)}
          loading="lazy"
        />
      ) : (
        <UserIcon size={iconSize} color="#94a3b8" />
      )}
    </div>
  );
};

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
  const [editItem, setEditItem] = useState<any>(null);

  const isInteracting = useRef(false);
  isInteracting.current = isModalOpen;

  const isMounted = useRef(true);
  useEffect(() => {
    isMounted.current = true;
    return () => {
      isMounted.current = false;
    };
  }, []);

  const userRole = useMemo(() => getUserRole(), []);
  const canManageSchedule = useMemo(() => {
    return ['ADMIN', 'SUPERADMIN', 'PRINCIPAL', 'DEPT_HEAD'].includes(userRole) || userRole === '';
  }, [userRole]);

  // Read stored identity for advisory identification
  const loggedInFacultyName = useMemo(() => {
    return (
      localStorage.getItem('attendsure_faculty_name') ||
      localStorage.getItem('faculty_name') ||
      ''
    ).trim().toLowerCase();
  }, []);

  const loggedInUsername = useMemo(() => {
    return (
      localStorage.getItem('attendsure_username') ||
      localStorage.getItem('username') ||
      ''
    ).trim().toLowerCase();
  }, []);

  // Check if a section is the advisory class of the logged-in faculty
  const isSectionAdvisoryForUser = useCallback((sec: SectionOption): boolean => {
    if (sec.is_adviser) return true;

    if (loggedInUsername) {
      if (sec.adviser_employee_id && sec.adviser_employee_id.toLowerCase() === loggedInUsername) {
        return true;
      }
    }

    if (loggedInFacultyName) {
      if (sec.adviser_name && sec.adviser_name.toLowerCase().includes(loggedInFacultyName)) {
        return true;
      }
      if (sec.adviser_full_name && sec.adviser_full_name.toLowerCase().includes(loggedInFacultyName)) {
        return true;
      }
      if (typeof sec.adviser === 'string' && sec.adviser.toLowerCase().includes(loggedInFacultyName)) {
        return true;
      }
      if (typeof sec.adviser === 'object' && sec.adviser) {
        const advName = (sec.adviser.full_name || sec.adviser.name || '').toLowerCase();
        if (advName && (advName.includes(loggedInFacultyName) || loggedInFacultyName.includes(advName))) {
          return true;
        }
      }
    }

    return false;
  }, [loggedInFacultyName, loggedInUsername]);

  // Resolves the logged-in faculty's advisory section
  const myAdvisorySection = useMemo(() => {
    return sections.find((sec) => isSectionAdvisoryForUser(sec)) || null;
  }, [sections, isSectionAdvisoryForUser]);

  // Resilient data loading using Promise.allSettled
  const loadData = useCallback(async (silent = false) => {
    if (!silent) setLoading(true);
    setError('');
    try {
      const results = await Promise.allSettled([
        apiClient.get('/schedules/?page_size=500'),
        apiClient.get('/sections/?page_size=500'),
        apiClient.get('/faculty/dropdown/'),
      ]);

      if (!isMounted.current) return;

      const schedRes = results[0].status === 'fulfilled' ? results[0].value : null;
      const secRes = results[1].status === 'fulfilled' ? results[1].value : null;
      const facRes = results[2].status === 'fulfilled' ? results[2].value : null;

      if (schedRes?.data) {
        const schedData = Array.isArray(schedRes.data) ? schedRes.data : schedRes.data?.results || [];
        setSchedules(schedData);
      }

      if (secRes?.data) {
        const secData = Array.isArray(secRes.data) ? secRes.data : secRes.data?.results || [];
        setSections(secData);
      }

      if (facRes?.data) {
        const facData = Array.isArray(facRes.data) ? facRes.data : facRes.data?.results || [];
        setFacultyList(facData);
      }

      if (results[0].status === 'rejected' && results[1].status === 'rejected') {
        const errReason: any = results[0].reason;
        const status = errReason?.response?.status;
        const detail = errReason?.response?.data?.detail || errReason?.response?.data?.error || errReason?.message;
        setError(`[Error ${status || 'Network'}] Could not load timetable data: ${detail}`);
      }
    } catch (err: any) {
      if (!isMounted.current) return;
      if (!silent) {
        setError(`Could not load timetable records. Please check server connection.`);
      }
    } finally {
      if (!silent && isMounted.current) {
        setLoading(false);
      }
    }
  }, []);

  useEffect(() => {
    loadData(false);
  }, [loadData]);

  // Auto-select the advisory section for faculty members on initial load
  const hasAutoSelectedRef = useRef(false);
  useEffect(() => {
    if (!hasAutoSelectedRef.current && myAdvisorySection && userRole === 'FACULTY') {
      setSelectedSectionFilter(String(myAdvisorySection.id));
      hasAutoSelectedRef.current = true;
    }
  }, [myAdvisorySection, userRole]);

  // Background refresh when tab is visible
  useEffect(() => {
    const liveInterval = setInterval(() => {
      if (!isInteracting.current && isMounted.current && document.visibilityState === 'visible') {
        loadData(true);
      }
    }, 12000);

    return () => clearInterval(liveInterval);
  }, [loadData]);

  const handleDelete = (id: number, code: string) => {
    if (!canManageSchedule) {
      showAlert({
        title: 'Access Denied',
        message: 'Only school administrators can delete class schedules.',
        type: 'error',
      });
      return;
    }

    showConfirm({
      title: 'Delete Class Schedule',
      message: `Are you sure you want to delete class period "${code}"? The assigned subject faculty will be unassigned.`,
      confirmLabel: 'Delete Schedule',
      isDestructive: true,
      onConfirm: async () => {
        try {
          await apiClient.delete(`/schedules/${id}/`);
          if (isMounted.current) {
            setSchedules((prev) => prev.filter((item) => item.id !== id));
          }
          showAlert({
            title: 'Schedule Removed',
            message: `Schedule ${code} was deleted successfully.`,
            type: 'info',
          });
          loadData(true);
        } catch (err: any) {
          showAlert({
            title: 'Delete Error',
            message: err?.response?.data?.detail || err?.response?.data?.error || err.message || 'Failed to delete schedule period.',
            type: 'error',
          });
        }
      },
    });
  };

  const handleOpenModal = (tab: AcademicTabType, item: any = null) => {
    setModalTab(tab);
    setEditItem(item);
    setIsModalOpen(true);
  };

  const handleCloseModal = () => {
    setIsModalOpen(false);
    setEditItem(null);
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
    return item.schedule_code || item.code || `SCH-${String(item.id).padStart(4, '0')}`;
  };

  // Fixed faculty resolution without duplicate checks
  const getFacultyInfo = useCallback((item: ScheduleItem) => {
    let name = 'Unassigned';
    let photo: string | null = null;
    let employeeId = '';

    if (item.faculty_name && item.faculty_name.trim() !== '') {
      name = item.faculty_name.trim();
    } else if (item.faculty_title && item.faculty_title.trim() !== '') {
      name = item.faculty_title.trim();
    } else if (typeof item.faculty === 'object' && item.faculty) {
      name = item.faculty.full_name || item.faculty.name || name;
      photo = item.faculty.photo_url || item.faculty.photo || null;
      employeeId = item.faculty.employee_id || '';
    }

    let targetFacultyId: number | undefined;
    if (typeof item.faculty_id === 'number') {
      targetFacultyId = item.faculty_id;
    } else if (typeof item.faculty === 'number') {
      targetFacultyId = item.faculty;
    } else if (typeof item.faculty === 'string' && !isNaN(Number(item.faculty))) {
      targetFacultyId = Number(item.faculty);
    } else if (typeof item.faculty === 'object' && item.faculty && typeof item.faculty.id === 'number') {
      targetFacultyId = item.faculty.id;
    }

    if (targetFacultyId !== undefined) {
      const matched = facultyList.find((f) => f.id === targetFacultyId);
      if (matched) {
        name = matched.full_name || matched.name || name;
        photo = matched.photo_url || matched.photo || photo;
        employeeId = matched.employee_id || employeeId;
      }
    }

    return { name, photo, employeeId };
  }, [facultyList]);

  const getSubjectCode = (item: ScheduleItem) => {
    if (item.subject_code) return item.subject_code;
    if (typeof item.subject === 'object' && item.subject) {
      return item.subject.code || item.subject.title || item.subject.name || '—';
    }
    if (typeof item.subject === 'string') return item.subject;
    return item.subject ? `SUB-${item.subject}` : '—';
  };

  const getSubjectName = (item: ScheduleItem) => {
    if (item.subject_title) return item.subject_title;
    if (item.subject_name) return item.subject_name;
    if (typeof item.subject === 'object' && item.subject) {
      return item.subject.title || item.subject.name || '';
    }
    return '';
  };

  const getSectionName = (item: ScheduleItem) => {
    if (item.section_name) return item.section_name;
    if (typeof item.section === 'object' && item.section) {
      return item.section.name || item.section.section_name || `Section #${item.section.id}`;
    }
    return item.section ? `Section #${item.section}` : 'Unassigned';
  };

  const getRoomDisplay = (item: ScheduleItem) => {
    if (item.room_number) return item.room_number;
    if (item.room_name) return item.room_name;
    if (typeof item.room === 'object' && item.room) {
      return item.room.room_number || item.room.name || '—';
    }
    if (typeof item.room === 'string') return item.room;
    if (item.room) return `Rm ${item.room}`;
    return '—';
  };

  // Safe search query sanitization
  const cleanSearchQuery = useMemo(() => {
    return searchQuery.trim().toLowerCase().slice(0, 60);
  }, [searchQuery]);

  const filteredSchedules = useMemo(() => {
    return schedules.filter((s) => {
      if (selectedSectionFilter !== 'ALL') {
        const secId = typeof s.section === 'object' && s.section ? s.section.id : s.section;
        const matchesId = String(secId) === selectedSectionFilter;
        const matchesName = String(s.section_name) === selectedSectionFilter;
        if (!matchesId && !matchesName) return false;
      }

      if (cleanSearchQuery !== '') {
        const code = getScheduleCode(s).toLowerCase();
        const sec = getSectionName(s).toLowerCase();
        const sub = (getSubjectCode(s) + ' ' + getSubjectName(s)).toLowerCase();
        const fac = getFacultyInfo(s).name.toLowerCase();
        const rm = getRoomDisplay(s).toLowerCase();

        return (
          code.includes(cleanSearchQuery) ||
          sec.includes(cleanSearchQuery) ||
          sub.includes(cleanSearchQuery) ||
          fac.includes(cleanSearchQuery) ||
          rm.includes(cleanSearchQuery)
        );
      }

      return true;
    });
  }, [schedules, selectedSectionFilter, cleanSearchQuery, getFacultyInfo]);

  // Selected Section Object
  const currentSelectedSectionObj = useMemo(() => {
    if (selectedSectionFilter === 'ALL') return null;
    return sections.find((sec) => String(sec.id) === selectedSectionFilter) || null;
  }, [selectedSectionFilter, sections]);

  // Robust adviser resolution checking direct properties, nested objects, and ID lookup
  const getAdviserDetails = useCallback((sec: SectionOption | null) => {
    if (!sec) return null;

    let name = '';
    let photo: string | null = null;
    let employeeId = '';

    if (sec.adviser_name) name = sec.adviser_name;
    if (sec.adviser_full_name) name = sec.adviser_full_name;
    if (sec.adviser_photo_url) photo = sec.adviser_photo_url;
    if (sec.adviser_employee_id) employeeId = sec.adviser_employee_id;

    if (typeof sec.adviser === 'object' && sec.adviser) {
      if (!name) name = sec.adviser.full_name || sec.adviser.name || '';
      if (!photo) photo = sec.adviser.photo_url || sec.adviser.photo || null;
      if (!employeeId) employeeId = sec.adviser.employee_id || '';
    } else if (typeof sec.adviser === 'string' && !name) {
      name = sec.adviser;
    }

    let adviserId: number | undefined;
    if (typeof sec.adviser_id === 'number') {
      adviserId = sec.adviser_id;
    } else if (typeof sec.adviser === 'number') {
      adviserId = sec.adviser;
    } else if (typeof sec.adviser === 'object' && sec.adviser && typeof sec.adviser.id === 'number') {
      adviserId = sec.adviser.id;
    }

    if (adviserId !== undefined) {
      const match = facultyList.find((f) => f.id === adviserId);
      if (match) {
        if (!name) name = match.full_name || match.name || '';
        if (!photo) photo = match.photo_url || match.photo || null;
        if (!employeeId) employeeId = match.employee_id || '';
      }
    }

    return {
      name: name || null,
      photo: photo || null,
      employeeId: employeeId || '',
    };
  }, [facultyList]);

  const resolvedAdviser = useMemo(() => {
    return getAdviserDetails(currentSelectedSectionObj);
  }, [currentSelectedSectionObj, getAdviserDetails]);

  const resolvedMyAdviser = useMemo(() => {
    return getAdviserDetails(myAdvisorySection);
  }, [myAdvisorySection, getAdviserDetails]);

  const uniqueSectionsCount = useMemo(() => {
    return new Set(schedules.map((s) => getSectionName(s)).filter((n) => n !== 'Unassigned')).size;
  }, [schedules]);

  const uniqueFacultyCount = useMemo(() => {
    return new Set(schedules.map((s) => getFacultyInfo(s).name).filter((n) => n !== 'Unassigned')).size;
  }, [schedules, getFacultyInfo]);

  const uniqueRoomsCount = useMemo(() => {
    return new Set(schedules.map((s) => getRoomDisplay(s)).filter((r) => r !== '—')).size;
  }, [schedules]);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14, padding: 'clamp(12px, 2.5vw, 20px)' }}>
      {/* 1. Summary Cards */}
      <div style={statsGrid}>
        <div style={statCard}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={statLabel}>SCHEDULE PERIODS</span>
            <Calendar size={18} color="#004b87" />
          </div>
          <div style={statVal}>{schedules.length}</div>
          <div style={statSub}>Active timetable slots</div>
        </div>

        <div style={statCard}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={statLabel}>SCHEDULED SECTIONS</span>
            <Users size={18} color="#059669" />
          </div>
          <div style={{ ...statVal, color: '#059669' }}>{uniqueSectionsCount}</div>
          <div style={statSub}>Sections with class schedules</div>
        </div>

        <div style={statCard}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={statLabel}>SUBJECT FACULTY</span>
            <GraduationCap size={18} color="#004b87" />
          </div>
          <div style={{ ...statVal, color: '#004b87' }}>{uniqueFacultyCount}</div>
          <div style={statSub}>Faculty with class loads</div>
        </div>

        <div style={statCard}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={statLabel}>OCCUPIED ROOMS</span>
            <DoorOpen size={18} color="#d97706" />
          </div>
          <div style={{ ...statVal, color: '#d97706' }}>{uniqueRoomsCount}</div>
          <div style={statSub}>Rooms currently scheduled</div>
        </div>
      </div>

      {/* 2. Top Filter and Setup Navigation Bar */}
      <div style={controlBar}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, color: '#004b87', fontWeight: 800, fontSize: '0.80rem' }}>
            <Filter size={15} /> Class Section:
          </div>
          <select
            value={selectedSectionFilter}
            onChange={(e) => setSelectedSectionFilter(e.target.value)}
            style={selectStyle}
          >
            <option value="ALL">All Sections ({schedules.length} periods)</option>
            {sections.map((sec) => {
              const displayName = getSectionDisplayName(sec);
              const isMine = isSectionAdvisoryForUser(sec);
              return (
                <option key={sec.id} value={sec.id}>
                  {displayName} {isMine ? '★ (Your Advisory Class)' : (sec.code ? `(${sec.code})` : '')}
                </option>
              );
            })}
          </select>

          {/* Quick jump to advisory section */}
          {myAdvisorySection && selectedSectionFilter !== String(myAdvisorySection.id) && (
            <button
              type="button"
              onClick={() => setSelectedSectionFilter(String(myAdvisorySection.id))}
              style={advisoryJumpBtn}
              title="Jump directly to your advisory class section"
            >
              <Sparkles size={13} color="#004b87" />
              <span>View My Advisory Class</span>
            </button>
          )}
        </div>

        {canManageSchedule && (
          <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
            <button
              type="button"
              onClick={() => handleOpenModal('SECTION')}
              style={secondaryBtnStyle}
              title="Add a Section and Assign an Adviser"
            >
              <Users size={13} color="#004b87" /> + Section &amp; Adviser
            </button>

            <button
              type="button"
              onClick={() => handleOpenModal('ROOM')}
              style={secondaryBtnStyle}
              title="Add a Classroom or Laboratory"
            >
              <DoorOpen size={13} color="#004b87" /> + Room
            </button>

            <button
              type="button"
              onClick={() => handleOpenModal('SUBJECT')}
              style={secondaryBtnStyle}
              title="Add an Academic Subject"
            >
              <BookOpen size={13} color="#004b87" /> + Subject
            </button>

            <button
              type="button"
              onClick={() => handleOpenModal('SCHEDULE')}
              style={primaryBtnStyle}
              title="Assign a Subject Faculty to this Section"
            >
              <Plus size={15} /> Add Subject Faculty Slot
            </button>
          </div>
        )}
      </div>

      {/* 3A. Dedicated Advisory Class Banner (Displayed when in ALL view and user has an advisory class) */}
      {selectedSectionFilter === 'ALL' && myAdvisorySection && (
        <div style={myAdvisoryCalloutBanner}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
            <div style={avatarCircle}>
              {resolvedMyAdviser?.photo ? (
                <img
                  src={resolvedMyAdviser.photo}
                  alt={resolvedMyAdviser.name || 'Adviser'}
                  style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                />
              ) : (
                <UserCheck size={20} color="#004b87" />
              )}
            </div>

            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <span style={{ fontSize: '0.96rem', fontWeight: 800, color: '#0f172a' }}>
                  Your Advisory Class: {getSectionDisplayName(myAdvisorySection)}
                </span>
                <span style={advisoryTagPill}>Official Class Adviser</span>
              </div>

              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 3, fontSize: '0.76rem' }}>
                <span style={{ color: '#004b87', fontWeight: 700 }}>
                  Assigned Adviser:
                </span>
                <strong style={{ color: '#0f172a' }}>
                  {resolvedMyAdviser?.name || 'You are designated Class Adviser'}
                </strong>
                {resolvedMyAdviser?.employeeId && (
                  <span style={{ fontFamily: 'monospace', color: '#64748b' }}>
                    ({resolvedMyAdviser.employeeId})
                  </span>
                )}
              </div>
            </div>
          </div>

          <button
            type="button"
            onClick={() => setSelectedSectionFilter(String(myAdvisorySection.id))}
            style={primaryBtnStyle}
          >
            <span>Filter to My Advisory Class</span>
          </button>
        </div>
      )}

      {/* 3B. Section Overview Banner (Shown when a specific section is chosen) */}
      {currentSelectedSectionObj && (
        <div style={sectionOverviewBanner}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
            <div style={avatarCircle}>
              {resolvedAdviser?.photo ? (
                <img
                  src={resolvedAdviser.photo}
                  alt={resolvedAdviser.name || 'Adviser'}
                  style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                />
              ) : (
                <UserCheck size={20} color="#004b87" />
              )}
            </div>

            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <span style={{ fontSize: '0.96rem', fontWeight: 800, color: '#0f172a' }}>
                  {getSectionDisplayName(currentSelectedSectionObj)}
                </span>
                <span style={codeBadgePill}>
                  {currentSelectedSectionObj.code || 'SEC'}
                </span>
                {currentSelectedSectionObj.grade_level_name && (
                  <span style={{ fontSize: '0.74rem', color: '#64748b' }}>
                    &bull; {currentSelectedSectionObj.grade_level_name}
                  </span>
                )}
                {isSectionAdvisoryForUser(currentSelectedSectionObj) && (
                  <span style={advisoryTagPill}>Your Advisory Section</span>
                )}
              </div>

              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 3, fontSize: '0.76rem' }}>
                <span style={{ color: '#004b87', fontWeight: 700 }}>
                  Class Adviser:
                </span>
                <strong style={{ color: resolvedAdviser?.name ? '#0f172a' : '#d97706' }}>
                  {resolvedAdviser?.name || 'No Homeroom Adviser Assigned'}
                </strong>
                {resolvedAdviser?.employeeId && (
                  <span style={{ fontFamily: 'monospace', color: '#64748b' }}>
                    ({resolvedAdviser.employeeId})
                  </span>
                )}
              </div>
            </div>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
            <div style={{ textAlign: 'right' }}>
              <span style={{ fontSize: '0.68rem', fontWeight: 800, color: '#64748b', display: 'block' }}>
                SUBJECT FACULTY
              </span>
              <strong style={{ fontSize: '1.05rem', color: '#004b87' }}>
                {filteredSchedules.length} classes scheduled
              </strong>
            </div>

            {canManageSchedule && (
              <button
                type="button"
                onClick={() => handleOpenModal('SECTION', currentSelectedSectionObj)}
                style={editSectionBtn}
              >
                <Edit2 size={12} />
                <span>Change Adviser</span>
              </button>
            )}
          </div>
        </div>
      )}

      {/* 4. Main Timetable List */}
      <div style={cardStyle}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16, flexWrap: 'wrap', gap: 10 }}>
          <div style={searchContainerStyle}>
            <Search size={15} color="#94a3b8" />
            <input
              type="text"
              placeholder="Search by section, subject, faculty, room..."
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

        {error && (
          <div style={errorBannerStyle}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <AlertCircle size={18} color="#991b1b" />
              <span>{error}</span>
            </div>
            <button type="button" onClick={() => loadData(false)} style={retryBtnStyle}>
              <RefreshCw size={13} /> Retry
            </button>
          </div>
        )}

        {loading ? (
          <div style={loadingContainerStyle}>
            <Loader2 size={26} className="animate-spin" color="#004b87" />
            <span style={{ fontSize: '0.84rem', color: '#64748b' }}>Loading schedules from database...</span>
          </div>
        ) : filteredSchedules.length === 0 ? (
          <div style={emptyContainerStyle}>
            <Calendar size={38} color="#cbd5e1" />
            <p style={{ margin: '8px 0 2px 0', fontWeight: 700, color: '#334155', fontSize: '0.88rem' }}>
              No timetable records found
            </p>
            <p style={{ margin: 0, fontSize: '0.76rem', color: '#94a3b8' }}>
              Click <strong>&quot;+ Add Subject Faculty Slot&quot;</strong> above to schedule a class for this section.
            </p>
          </div>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table style={tableStyle}>
              <thead>
                <tr style={tableHeaderRowStyle}>
                  <th style={thStyle}>Code</th>
                  <th style={thStyle}>Class Section</th>
                  <th style={thStyle}>Subject</th>
                  <th style={thStyle}>Subject Faculty</th>
                  <th style={thStyle}>Time Period</th>
                  <th style={thStyle}>Room</th>
                  {canManageSchedule && <th style={{ ...thStyle, textAlign: 'center' }}>Actions</th>}
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
                          {getSectionName(row)}
                        </div>
                        {row.grade_level_name && (
                          <div style={{ fontSize: '0.72rem', color: '#64748b', marginTop: 1 }}>
                            {row.grade_level_name}
                          </div>
                        )}
                      </td>

                      <td style={tdStyle}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                          <BookOpen size={13} color="#004b87" />
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
                          <div>
                            <span style={{ fontSize: '0.80rem', fontWeight: 600, color: '#334155', display: 'block' }}>
                              {facultyInfo.name}
                            </span>
                            {facultyInfo.employeeId && (
                              <span style={{ fontSize: '0.68rem', fontFamily: 'monospace', color: '#94a3b8' }}>
                                {facultyInfo.employeeId}
                              </span>
                            )}
                          </div>
                        </div>
                      </td>

                      <td style={tdStyle}>
                        <div style={pillStyle}>
                          <Clock size={12} color="#64748b" />
                          <span>{formatTime(row.start_time)} - {formatTime(row.end_time)}</span>
                          <span style={{ color: '#94a3b8' }}>&bull; {row.days_of_week || 'MON-FRI'}</span>
                        </div>
                      </td>

                      <td style={tdStyle}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: '0.80rem', color: '#64748b' }}>
                          <MapPin size={13} color="#94a3b8" />
                          <span>{getRoomDisplay(row)}</span>
                        </div>
                      </td>

                      {canManageSchedule && (
                        <td style={{ ...tdStyle, textAlign: 'center' }}>
                          <div style={{ display: 'flex', justifyContent: 'center', gap: 6 }}>
                            <button
                              type="button"
                              onClick={() => handleOpenModal('SCHEDULE', row)}
                              style={iconBtnStyle}
                              title="Edit Class Schedule"
                            >
                              <Edit2 size={13} color="#004b87" />
                            </button>
                            <button
                              type="button"
                              onClick={() => handleDelete(row.id, displayCode)}
                              style={{ ...iconBtnStyle, borderColor: '#fee2e2', backgroundColor: '#fef2f2' }}
                              title="Delete Class Schedule"
                            >
                              <Trash2 size={13} color="#dc2626" />
                            </button>
                          </div>
                        </td>
                      )}
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
        editItem={editItem}
        onClose={handleCloseModal}
        onSuccess={() => {
          loadData(true);
          handleCloseModal();
        }}
      />
    </div>
  );
};

export default SchedulesTab;

const statsGrid: React.CSSProperties = {
  display: 'grid',
  gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 220px), 1fr))',
  gap: 12,
};

const statCard: React.CSSProperties = {
  backgroundColor: '#ffffff',
  borderRadius: 10,
  border: '1px solid #e2e8f0',
  padding: '12px 16px',
};

const statLabel: React.CSSProperties = {
  fontSize: '0.64rem',
  fontWeight: 800,
  color: '#64748b',
  letterSpacing: '0.4px',
};

const statVal: React.CSSProperties = {
  fontSize: '1.40rem',
  fontWeight: 800,
  color: '#0f172a',
  lineHeight: 1.1,
  marginTop: 4,
};

const statSub: React.CSSProperties = {
  fontSize: '0.68rem',
  color: '#94a3b8',
  marginTop: 3,
};

const controlBar: React.CSSProperties = {
  display: 'flex',
  justifyContent: 'space-between',
  alignItems: 'center',
  padding: '10px 14px',
  backgroundColor: '#ffffff',
  borderRadius: 10,
  border: '1px solid #e2e8f0',
  flexWrap: 'wrap',
  gap: 10,
};

const sectionOverviewBanner: React.CSSProperties = {
  display: 'flex',
  justifyContent: 'space-between',
  alignItems: 'center',
  padding: '12px 18px',
  backgroundColor: '#f0f9ff',
  borderRadius: 10,
  border: '1px solid #bae6fd',
  flexWrap: 'wrap',
  gap: 12,
};

const myAdvisoryCalloutBanner: React.CSSProperties = {
  display: 'flex',
  justifyContent: 'space-between',
  alignItems: 'center',
  padding: '12px 18px',
  backgroundColor: '#eff6ff',
  borderRadius: 10,
  border: '1.5px solid #93c5fd',
  flexWrap: 'wrap',
  gap: 12,
};

const avatarCircle: React.CSSProperties = {
  width: 44,
  height: 44,
  borderRadius: '50%',
  backgroundColor: '#ffffff',
  border: '1.5px solid #004b87',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  overflow: 'hidden',
  flexShrink: 0,
};

const codeBadgePill: React.CSSProperties = {
  padding: '2px 8px',
  borderRadius: 4,
  backgroundColor: '#e0f2fe',
  color: '#004b87',
  fontFamily: 'monospace',
  fontSize: '0.70rem',
  fontWeight: 800,
  border: '1px solid #bae6fd',
};

const advisoryTagPill: React.CSSProperties = {
  padding: '2px 8px',
  borderRadius: 4,
  backgroundColor: '#ecfdf5',
  color: '#059669',
  fontSize: '0.70rem',
  fontWeight: 800,
  border: '1px solid #a7f3d0',
};

const advisoryJumpBtn: React.CSSProperties = {
  display: 'inline-flex',
  alignItems: 'center',
  gap: 5,
  padding: '5px 10px',
  backgroundColor: '#eff6ff',
  color: '#004b87',
  border: '1px solid #93c5fd',
  borderRadius: 6,
  fontSize: '0.74rem',
  fontWeight: 700,
  cursor: 'pointer',
};

const editSectionBtn: React.CSSProperties = {
  display: 'inline-flex',
  alignItems: 'center',
  gap: 5,
  padding: '5px 10px',
  backgroundColor: '#ffffff',
  color: '#004b87',
  border: '1px solid #004b87',
  borderRadius: 6,
  fontSize: '0.72rem',
  fontWeight: 700,
  cursor: 'pointer',
};

const cardStyle: React.CSSProperties = {
  backgroundColor: '#ffffff',
  borderRadius: 12,
  padding: '16px 18px',
  border: '1px solid #e2e8f0',
};

const selectStyle: React.CSSProperties = {
  padding: '6px 12px',
  borderRadius: 6,
  border: '1px solid #cbd5e1',
  backgroundColor: '#f8fafc',
  fontSize: '0.78rem',
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
  padding: '6px 11px',
  borderRadius: 6,
  fontWeight: 700,
  fontSize: '0.74rem',
  cursor: 'pointer',
};

const primaryBtnStyle: React.CSSProperties = {
  display: 'inline-flex',
  alignItems: 'center',
  gap: 5,
  backgroundColor: '#004b87',
  color: '#ffffff',
  border: 'none',
  padding: '6px 13px',
  borderRadius: 6,
  fontWeight: 700,
  fontSize: '0.74rem',
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
  fontSize: '0.78rem',
  width: '100%',
  color: '#0f172a',
};

const tableStyle: React.CSSProperties = {
  width: '100%',
  minWidth: 640,
  borderCollapse: 'collapse',
  textAlign: 'left',
};

const tableHeaderRowStyle: React.CSSProperties = {
  borderBottom: '2px solid #e2e8f0',
  backgroundColor: '#f8fafc',
};

const thStyle: React.CSSProperties = {
  padding: '10px 14px',
  fontSize: '0.72rem',
  fontWeight: 800,
  color: '#475569',
  textTransform: 'uppercase',
  letterSpacing: '0.04em',
};

const tableRowStyle: React.CSSProperties = {
  borderBottom: '1px solid #f1f5f9',
};

const tdStyle: React.CSSProperties = {
  padding: '10px 14px',
  verticalAlign: 'middle',
};

const codeBadge: React.CSSProperties = {
  fontFamily: 'monospace',
  fontSize: '0.74rem',
  fontWeight: 800,
  color: '#004b87',
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
  fontSize: '0.78rem',
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
  fontSize: '0.72rem',
  cursor: 'pointer',
  fontWeight: 700,
};