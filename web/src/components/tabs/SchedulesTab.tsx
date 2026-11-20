/**
 * AttendSure - Academic Timetables, Sections & Schedules
 * File: web/src/components/tabs/SchedulesTab.tsx
 */

import React, { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import apiClient, { peekApiCache } from '../../api/client';
import { API_ROUTES, extractApiError } from '../../api/routes';
import { isSafeImageUrl } from '../../theme/tokens';
import { useTheme } from '../../context/ThemeContext';
import { useAlert } from '../../context/AlertContext';
import { StatsCard } from '../common/StatsCard';
import { ProfileAvatar } from '../common/ProfileAvatar';
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
  Plus,
  UserCheck,
  GraduationCap,
  Sparkles,
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
  faculty?:
    | number
    | string
    | { id?: number; full_name?: string; name?: string; photo_url?: string; photo?: string; employee_id?: string }
    | null;
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
  adviser?:
    | number
    | string
    | { id?: number; full_name?: string; name?: string; photo_url?: string; photo?: string; employee_id?: string }
    | null;
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

const sanitizeInput = (raw: string, maxLength = 60): string =>
  String(raw || '')
    .replace(/[\u0000-\u001F\u007F<>]/g, '')
    .trim()
    .slice(0, maxLength);

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

const extractList = <T,>(payload: unknown): T[] => {
  if (Array.isArray(payload)) return payload as T[];
  if (payload && typeof payload === 'object' && Array.isArray((payload as { results?: T[] }).results)) {
    return (payload as { results: T[] }).results;
  }
  return [];
};

export const SchedulesTab: React.FC = () => {
  const { showAlert, showConfirm } = useAlert();
  const { tokens, brand, ui } = useTheme();

  const cachedPeriods = peekApiCache(API_ROUTES.school.periods, { page_size: 500 });
  const cachedSections = peekApiCache(API_ROUTES.school.sections, { page_size: 500 });
  const cachedFaculty = peekApiCache(API_ROUTES.accounts.facultyDropdown);

  const [schedules, setSchedules] = useState<ScheduleItem[]>(() => extractList<ScheduleItem>(cachedPeriods));
  const [sections, setSections] = useState<SectionOption[]>(() => extractList<SectionOption>(cachedSections));
  const [facultyList, setFacultyList] = useState<FacultyOption[]>(() => extractList<FacultyOption>(cachedFaculty));
  const [loading, setLoading] = useState<boolean>(() => !cachedPeriods);
  const [error, setError] = useState<string>('');

  const [searchQuery, setSearchQuery] = useState<string>('');
  const [selectedSectionFilter, setSelectedSectionFilter] = useState<string>('ALL');

  const [isModalOpen, setIsModalOpen] = useState<boolean>(false);
  const [modalTab, setModalTab] = useState<AcademicTabType>('SCHEDULE');
  const [editItem, setEditItem] = useState<any>(null);

  const abortRef = useRef<AbortController | null>(null);
  const isInteracting = useRef(false);
  isInteracting.current = isModalOpen;

  const userRole = useMemo(() => getUserRole(), []);
  // Strict RBAC check: never fail open on empty/unknown role
  const canManageSchedule = useMemo(() => {
    return ['ADMIN', 'SUPERADMIN', 'FACULTY_ADMIN', 'PRINCIPAL', 'DEPT_HEAD'].includes(userRole);
  }, [userRole]);

  const loggedInFacultyName = useMemo(() => {
    return (localStorage.getItem('attendsure_faculty_name') || localStorage.getItem('faculty_name') || '')
      .trim()
      .toLowerCase();
  }, []);

  const loggedInUsername = useMemo(() => {
    return (localStorage.getItem('attendsure_username') || localStorage.getItem('username') || '')
      .trim()
      .toLowerCase();
  }, []);

  const isSectionAdvisoryForUser = useCallback(
    (sec: SectionOption): boolean => {
      if (sec.is_adviser) return true;

      if (loggedInUsername && sec.adviser_employee_id && sec.adviser_employee_id.toLowerCase() === loggedInUsername) {
        return true;
      }

      if (loggedInFacultyName) {
        if (sec.adviser_name && sec.adviser_name.toLowerCase().includes(loggedInFacultyName)) return true;
        if (sec.adviser_full_name && sec.adviser_full_name.toLowerCase().includes(loggedInFacultyName)) return true;
        if (typeof sec.adviser === 'string' && sec.adviser.toLowerCase().includes(loggedInFacultyName)) return true;
        if (typeof sec.adviser === 'object' && sec.adviser) {
          const advName = (sec.adviser.full_name || sec.adviser.name || '').toLowerCase();
          if (advName && (advName.includes(loggedInFacultyName) || loggedInFacultyName.includes(advName))) {
            return true;
          }
        }
      }

      return false;
    },
    [loggedInFacultyName, loggedInUsername]
  );

  const myAdvisorySection = useMemo(() => {
    return sections.find((sec) => isSectionAdvisoryForUser(sec)) || null;
  }, [sections, isSectionAdvisoryForUser]);

  const loadData = useCallback(async (silent = false, bypassCache = false) => {
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    if (!bypassCache && !silent) {
      const warmPeriods = peekApiCache(API_ROUTES.school.periods, { page_size: 500 });
      if (warmPeriods) {
        setSchedules(extractList<ScheduleItem>(warmPeriods));
        setLoading(false);
      } else {
        setLoading(true);
      }
    } else if (!silent) {
      setLoading(true);
    }
    setError('');

    try {
      const cacheParam = bypassCache ? { nocache: 1 } : {};
      const results = await Promise.allSettled([
        apiClient.get(API_ROUTES.school.periods, {
          params: { page_size: 500, ...cacheParam },
          signal: controller.signal,
        }),
        apiClient.get(API_ROUTES.school.sections, {
          params: { page_size: 500, ...cacheParam },
          signal: controller.signal,
        }),
        apiClient.get(API_ROUTES.accounts.facultyDropdown, {
          params: cacheParam,
          signal: controller.signal,
        }),
      ]);

      if (controller.signal.aborted) return;

      const schedRes = results[0].status === 'fulfilled' ? results[0].value : null;
      const secRes = results[1].status === 'fulfilled' ? results[1].value : null;
      const facRes = results[2].status === 'fulfilled' ? results[2].value : null;

      if (schedRes?.data) setSchedules(extractList<ScheduleItem>(schedRes.data));
      if (secRes?.data) setSections(extractList<SectionOption>(secRes.data));
      if (facRes?.data) setFacultyList(extractList<FacultyOption>(facRes.data));

      if (results[0].status === 'rejected' && results[1].status === 'rejected') {
        const reason = results[0].reason as { name?: string; code?: string };
        if (reason?.name !== 'CanceledError' && reason?.code !== 'ERR_CANCELED') {
          setError(extractApiError(results[0].reason, 'Could not load class schedule records.'));
        }
      }
    } catch (err: unknown) {
      const anyErr = err as { name?: string; code?: string };
      if (controller.signal.aborted || anyErr?.name === 'CanceledError' || anyErr?.code === 'ERR_CANCELED') {
        return;
      }
      if (!silent) {
        setError(extractApiError(err, 'Could not load class schedule records. Please check server connection.'));
      }
    } finally {
      if (!controller.signal.aborted && !silent) {
        setLoading(false);
      }
    }
  }, []);

  useEffect(() => {
    void loadData(false, false);
    return () => {
      abortRef.current?.abort();
    };
  }, [loadData]);

  const hasAutoSelectedRef = useRef(false);
  useEffect(() => {
    if (!hasAutoSelectedRef.current && myAdvisorySection && userRole === 'FACULTY') {
      setSelectedSectionFilter(String(myAdvisorySection.id));
      hasAutoSelectedRef.current = true;
    }
  }, [myAdvisorySection, userRole]);

  useEffect(() => {
    const liveInterval = setInterval(() => {
      if (!isInteracting.current && document.visibilityState === 'visible') {
        void loadData(true, true);
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
          await apiClient.delete(`${API_ROUTES.school.periods}${id}/`);
          setSchedules((prev) => prev.filter((item) => item.id !== id));
          showAlert({
            title: 'Schedule Removed',
            message: `Schedule ${code} was deleted successfully.`,
            type: 'info',
          });
          void loadData(true, true);
        } catch (err: unknown) {
          showAlert({
            title: 'Delete Error',
            message: extractApiError(err, 'Failed to delete schedule period.'),
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

  const getFacultyInfo = useCallback(
    (item: ScheduleItem) => {
      let name = 'Unassigned';
      let photo: string | null = null;
      let employeeId = '';

      if (item.faculty_name && item.faculty_name.trim() !== '' && item.faculty_name.trim().toLowerCase() !== 'unassigned') {
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

      return { name, photo: isSafeImageUrl(photo) ? photo : null, employeeId };
    },
    [facultyList]
  );

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

  const cleanSearchQuery = useMemo(() => sanitizeInput(searchQuery, 60).toLowerCase(), [searchQuery]);

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
        const sub = `${getSubjectCode(s)} ${getSubjectName(s)}`.toLowerCase();
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

  const currentSelectedSectionObj = useMemo(() => {
    if (selectedSectionFilter === 'ALL') return null;
    return sections.find((sec) => String(sec.id) === selectedSectionFilter) || null;
  }, [selectedSectionFilter, sections]);

  const getAdviserDetails = useCallback(
    (sec: SectionOption | null) => {
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
        photo: isSafeImageUrl(photo) ? photo : null,
        employeeId: employeeId || '',
      };
    },
    [facultyList]
  );

  const resolvedAdviser = useMemo(() => getAdviserDetails(currentSelectedSectionObj), [currentSelectedSectionObj, getAdviserDetails]);
  const resolvedMyAdviser = useMemo(() => getAdviserDetails(myAdvisorySection), [myAdvisorySection, getAdviserDetails]);

  const uniqueSectionsCount = useMemo(
    () => new Set(schedules.map((s) => getSectionName(s)).filter((n) => n !== 'Unassigned')).size,
    [schedules]
  );

  const uniqueFacultyCount = useMemo(
    () => new Set(schedules.map((s) => getFacultyInfo(s).name).filter((n) => n !== 'Unassigned')).size,
    [schedules, getFacultyInfo]
  );

  const uniqueRoomsCount = useMemo(
    () => new Set(schedules.map((s) => getRoomDisplay(s)).filter((r) => r !== '—')).size,
    [schedules]
  );

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14, padding: 'clamp(12px, 2.5vw, 20px)' }}>
      {/* 1. Summary Cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 210px), 1fr))', gap: 12 }}>
        <StatsCard
          label="SCHEDULE PERIODS"
          value={schedules.length}
          helpText="Active timetable slots"
          badge={<Calendar size={18} color={brand.primary} />}
        />
        <StatsCard
          label="SCHEDULED SECTIONS"
          value={uniqueSectionsCount}
          valueColor={brand.success}
          helpText="Sections with class schedules"
          badge={<Users size={18} color={brand.success} />}
        />
        <StatsCard
          label="SUBJECT FACULTY"
          value={uniqueFacultyCount}
          valueColor={brand.primary}
          helpText="Faculty with class loads"
          badge={<GraduationCap size={18} color={brand.primary} />}
        />
        <StatsCard
          label="OCCUPIED ROOMS"
          value={uniqueRoomsCount}
          valueColor={brand.warning}
          helpText="Rooms currently scheduled"
          badge={<DoorOpen size={18} color={brand.warning} />}
        />
      </div>

      {/* 2. Top Filter and Setup Navigation Bar */}
      <div
        style={{
          ...ui.card,
          padding: '10px 14px',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          flexWrap: 'wrap',
          gap: 10,
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, color: brand.primary, fontWeight: 800, fontSize: '0.80rem' }}>
            <Filter size={15} /> Class Section:
          </div>
          <select
            aria-label="Filter by class section"
            value={selectedSectionFilter}
            onChange={(e) => setSelectedSectionFilter(e.target.value)}
            style={{ ...ui.input, width: 'auto', minWidth: 210, fontWeight: 700, cursor: 'pointer' }}
          >
            <option value="ALL">All Sections ({schedules.length} periods)</option>
            {sections.map((sec) => {
              const displayName = getSectionDisplayName(sec);
              const isMine = isSectionAdvisoryForUser(sec);
              return (
                <option key={sec.id} value={sec.id}>
                  {displayName} {isMine ? '★ (Your Advisory Class)' : sec.code ? `(${sec.code})` : ''}
                </option>
              );
            })}
          </select>

          {myAdvisorySection && selectedSectionFilter !== String(myAdvisorySection.id) && (
            <button
              type="button"
              onClick={() => setSelectedSectionFilter(String(myAdvisorySection.id))}
              style={{
                ...ui.btnSecondary,
                backgroundColor: tokens.primaryLight,
                borderColor: brand.primary,
                color: brand.primary,
              }}
              title="Jump directly to your advisory class section"
            >
              <Sparkles size={13} color={brand.primary} />
              <span>View My Advisory Class</span>
            </button>
          )}
        </div>

        {canManageSchedule && (
          <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
            <button
              type="button"
              onClick={() => handleOpenModal('SECTION')}
              style={ui.btnSecondary}
              title="Add a Section and Assign an Adviser"
            >
              <Users size={13} color={brand.primary} /> + Section &amp; Adviser
            </button>

            <button
              type="button"
              onClick={() => handleOpenModal('ROOM')}
              style={ui.btnSecondary}
              title="Add a Classroom or Laboratory"
            >
              <DoorOpen size={13} color={brand.primary} /> + Room
            </button>

            <button
              type="button"
              onClick={() => handleOpenModal('SUBJECT')}
              style={ui.btnSecondary}
              title="Add an Academic Subject"
            >
              <BookOpen size={13} color={brand.primary} /> + Subject
            </button>

            <button
              type="button"
              onClick={() => handleOpenModal('SCHEDULE')}
              style={ui.btnPrimary}
              title="Assign a Subject Faculty to this Section"
            >
              <Plus size={15} /> Add Subject Faculty Slot
            </button>
          </div>
        )}
      </div>

      {/* 3A. Dedicated Advisory Class Banner */}
      {selectedSectionFilter === 'ALL' && myAdvisorySection && (
        <div
          style={{
            ...ui.subtleBox,
            backgroundColor: tokens.primaryLight,
            borderColor: brand.primary,
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            flexWrap: 'wrap',
            gap: 12,
            padding: '12px 18px',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
            {resolvedMyAdviser?.photo && isSafeImageUrl(resolvedMyAdviser.photo) ? (
              <ProfileAvatar
                photoUrl={resolvedMyAdviser.photo}
                name={resolvedMyAdviser.name || 'Adviser'}
                size={44}
                iconSize={20}
              />
            ) : (
              <div
                style={{
                  width: 44,
                  height: 44,
                  borderRadius: '50%',
                  backgroundColor: tokens.bgSurface,
                  border: `1.5px solid ${brand.primary}`,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  flexShrink: 0,
                }}
              >
                <UserCheck size={20} color={brand.primary} />
              </div>
            )}

            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                <span style={{ fontSize: '0.96rem', fontWeight: 800, color: tokens.textPrimary }}>
                  Your Advisory Class: {getSectionDisplayName(myAdvisorySection)}
                </span>
                <span style={ui.badge(tokens.successLight, brand.success)}>Official Class Adviser</span>
              </div>

              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 3, fontSize: '0.76rem', flexWrap: 'wrap' }}>
                <span style={{ color: brand.primary, fontWeight: 700 }}>Assigned Adviser:</span>
                <strong style={{ color: tokens.textPrimary }}>
                  {resolvedMyAdviser?.name || 'You are designated Class Adviser'}
                </strong>
                {resolvedMyAdviser?.employeeId && (
                  <span style={{ fontFamily: 'monospace', color: tokens.textMuted }}>
                    ({resolvedMyAdviser.employeeId})
                  </span>
                )}
              </div>
            </div>
          </div>

          <button
            type="button"
            onClick={() => setSelectedSectionFilter(String(myAdvisorySection.id))}
            style={ui.btnPrimary}
          >
            <span>Filter to My Advisory Class</span>
          </button>
        </div>
      )}

      {/* 3B. Section Overview Banner */}
      {currentSelectedSectionObj && (
        <div
          style={{
            ...ui.subtleBox,
            backgroundColor: tokens.infoLight,
            borderColor: brand.secondary,
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            flexWrap: 'wrap',
            gap: 12,
            padding: '12px 18px',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
            {resolvedAdviser?.photo && isSafeImageUrl(resolvedAdviser.photo) ? (
              <ProfileAvatar
                photoUrl={resolvedAdviser.photo}
                name={resolvedAdviser.name || 'Adviser'}
                size={44}
                iconSize={20}
              />
            ) : (
              <div
                style={{
                  width: 44,
                  height: 44,
                  borderRadius: '50%',
                  backgroundColor: tokens.bgSurface,
                  border: `1.5px solid ${brand.primary}`,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  flexShrink: 0,
                }}
              >
                <UserCheck size={20} color={brand.primary} />
              </div>
            )}

            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                <span style={{ fontSize: '0.96rem', fontWeight: 800, color: tokens.textPrimary }}>
                  {getSectionDisplayName(currentSelectedSectionObj)}
                </span>
                <span style={{ ...ui.badge(tokens.primaryLight, brand.primary), fontFamily: 'monospace' }}>
                  {currentSelectedSectionObj.code || 'SEC'}
                </span>
                {currentSelectedSectionObj.grade_level_name && (
                  <span style={{ fontSize: '0.74rem', color: tokens.textSecondary }}>
                    &bull; {currentSelectedSectionObj.grade_level_name}
                  </span>
                )}
                {isSectionAdvisoryForUser(currentSelectedSectionObj) && (
                  <span style={ui.badge(tokens.successLight, brand.success)}>Your Advisory Section</span>
                )}
              </div>

              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 3, fontSize: '0.76rem', flexWrap: 'wrap' }}>
                <span style={{ color: brand.primary, fontWeight: 700 }}>Class Adviser:</span>
                <strong style={{ color: resolvedAdviser?.name ? tokens.textPrimary : brand.warning }}>
                  {resolvedAdviser?.name || 'No Homeroom Adviser Assigned'}
                </strong>
                {resolvedAdviser?.employeeId && (
                  <span style={{ fontFamily: 'monospace', color: tokens.textMuted }}>
                    ({resolvedAdviser.employeeId})
                  </span>
                )}
              </div>
            </div>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: 14, flexWrap: 'wrap' }}>
            <div style={{ textAlign: 'right' }}>
              <span style={{ fontSize: '0.68rem', fontWeight: 800, color: tokens.textMuted, display: 'block' }}>
                SUBJECT FACULTY
              </span>
              <strong style={{ fontSize: '1.05rem', color: brand.primary }}>
                {filteredSchedules.length} classes scheduled
              </strong>
            </div>

            {canManageSchedule && (
              <button
                type="button"
                onClick={() => handleOpenModal('SECTION', currentSelectedSectionObj)}
                style={{ ...ui.btnSecondary, borderColor: brand.primary, color: brand.primary }}
              >
                <Edit2 size={12} />
                <span>Change Adviser</span>
              </button>
            )}
          </div>
        </div>
      )}

      {/* 4. Main Timetable List */}
      <div style={ui.card}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16, flexWrap: 'wrap', gap: 10 }}>
          <div style={{ position: 'relative', width: '100%', maxWidth: 320 }}>
            <Search
              size={15}
              color={tokens.textMuted}
              style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', pointerEvents: 'none' }}
            />
            <input
              type="text"
              maxLength={60}
              placeholder="Search by section, subject, faculty, room..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              style={{ ...ui.input, paddingLeft: 32 }}
            />
          </div>

          <div style={{ fontSize: '0.78rem', color: tokens.textSecondary }}>
            Showing <strong style={{ color: tokens.textPrimary }}>{filteredSchedules.length}</strong> of{' '}
            <strong style={{ color: tokens.textPrimary }}>{schedules.length}</strong> timetable slots
          </div>
        </div>

        {error && (
          <div
            style={{
              ...ui.subtleBox,
              backgroundColor: tokens.dangerLight,
              borderColor: brand.danger,
              color: brand.danger,
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              marginBottom: 16,
              gap: 10,
              flexWrap: 'wrap',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: '0.80rem', fontWeight: 600 }}>
              <AlertCircle size={18} color={brand.danger} />
              <span>{error}</span>
            </div>
            <button
              type="button"
              onClick={() => void loadData(false, true)}
              style={{ ...ui.btnSecondary, borderColor: brand.danger, color: brand.danger }}
            >
              <RefreshCw size={13} /> Retry
            </button>
          </div>
        )}

        {loading ? (
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 10, padding: '50px 0' }}>
            <Loader2 size={26} className="animate-spin" color={brand.primary} />
            <span style={{ fontSize: '0.84rem', color: tokens.textMuted }}>Loading schedules from database...</span>
          </div>
        ) : filteredSchedules.length === 0 ? (
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '40px 0' }}>
            <Calendar size={38} color={tokens.textMuted} />
            <p style={{ margin: '8px 0 2px 0', fontWeight: 700, color: tokens.textPrimary, fontSize: '0.88rem' }}>
              No timetable records found
            </p>
            <p style={{ margin: 0, fontSize: '0.76rem', color: tokens.textMuted }}>
              {canManageSchedule
                ? 'Click "+ Add Subject Faculty Slot" above to schedule a class for this section.'
                : 'No class schedules match your current filter.'}
            </p>
          </div>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', minWidth: 640, borderCollapse: 'collapse', textAlign: 'left' }}>
              <thead>
                <tr>
                  <th style={ui.th}>Code</th>
                  <th style={ui.th}>Class Section</th>
                  <th style={ui.th}>Subject</th>
                  <th style={ui.th}>Subject Faculty</th>
                  <th style={ui.th}>Time Period</th>
                  <th style={ui.th}>Room</th>
                  {canManageSchedule && <th style={{ ...ui.th, textAlign: 'center' }}>Actions</th>}
                </tr>
              </thead>
              <tbody>
                {filteredSchedules.map((row) => {
                  const displayCode = getScheduleCode(row);
                  const facultyInfo = getFacultyInfo(row);

                  return (
                    <tr key={row.id}>
                      <td style={ui.td}>
                        <span
                          style={{
                            ...ui.badge(tokens.primaryLight, brand.primary),
                            fontFamily: 'monospace',
                            borderRadius: 5,
                          }}
                        >
                          {displayCode}
                        </span>
                      </td>

                      <td style={ui.td}>
                        <div style={{ fontWeight: 800, color: tokens.textPrimary, fontSize: '0.84rem' }}>
                          {getSectionName(row)}
                        </div>
                        {row.grade_level_name && (
                          <div style={{ fontSize: '0.72rem', color: tokens.textSecondary, marginTop: 1 }}>
                            {row.grade_level_name}
                          </div>
                        )}
                      </td>

                      <td style={ui.td}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                          <BookOpen size={13} color={brand.primary} />
                          <span style={{ fontWeight: 800, color: tokens.textPrimary, fontSize: '0.82rem' }}>
                            {getSubjectCode(row)}
                          </span>
                        </div>
                        {getSubjectName(row) && (
                          <div style={{ fontSize: '0.72rem', color: tokens.textSecondary, marginLeft: 19, marginTop: 1 }}>
                            {getSubjectName(row)}
                          </div>
                        )}
                      </td>

                      <td style={ui.td}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                          <ProfileAvatar
                            photoUrl={facultyInfo.photo}
                            name={facultyInfo.name}
                            size={30}
                            iconSize={15}
                          />
                          <div>
                            <span style={{ fontSize: '0.80rem', fontWeight: 600, color: tokens.textPrimary, display: 'block' }}>
                              {facultyInfo.name}
                            </span>
                            {facultyInfo.employeeId && (
                              <span style={{ fontSize: '0.68rem', fontFamily: 'monospace', color: tokens.textMuted }}>
                                {facultyInfo.employeeId}
                              </span>
                            )}
                          </div>
                        </div>
                      </td>

                      <td style={ui.td}>
                        <div
                          style={{
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: 5,
                            backgroundColor: tokens.bgSurfaceSubtle,
                            border: `1px solid ${tokens.borderSubtle}`,
                            padding: '3px 8px',
                            borderRadius: 6,
                            fontSize: '0.74rem',
                            color: tokens.textPrimary,
                            fontWeight: 600,
                          }}
                        >
                          <Clock size={12} color={tokens.textMuted} />
                          <span>
                            {formatTime(row.start_time)} - {formatTime(row.end_time)}
                          </span>
                          <span style={{ color: tokens.textMuted }}>&bull; {row.days_of_week || 'MON-FRI'}</span>
                        </div>
                      </td>

                      <td style={ui.td}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: '0.80rem', color: tokens.textSecondary }}>
                          <MapPin size={13} color={tokens.textMuted} />
                          <span>{getRoomDisplay(row)}</span>
                        </div>
                      </td>

                      {canManageSchedule && (
                        <td style={{ ...ui.td, textAlign: 'center' }}>
                          <div style={{ display: 'flex', justifyContent: 'center', gap: 6 }}>
                            <button
                              type="button"
                              onClick={() => handleOpenModal('SCHEDULE', row)}
                              style={{ ...ui.btnSecondary, padding: '5px 7px' }}
                              title="Edit Class Schedule"
                              aria-label={`Edit schedule ${displayCode}`}
                            >
                              <Edit2 size={13} color={brand.primary} />
                            </button>
                            <button
                              type="button"
                              onClick={() => handleDelete(row.id, displayCode)}
                              style={{
                                ...ui.btnSecondary,
                                padding: '5px 7px',
                                backgroundColor: tokens.dangerLight,
                                borderColor: brand.danger,
                                color: brand.danger,
                              }}
                              title="Delete Class Schedule"
                              aria-label={`Delete schedule ${displayCode}`}
                            >
                              <Trash2 size={13} color={brand.danger} />
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
          void loadData(true, true);
          handleCloseModal();
        }}
      />
    </div>
  );
};

export default SchedulesTab;
