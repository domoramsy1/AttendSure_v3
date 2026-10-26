/**
 * AttendSure - Assigned Classes & Student Attendance
 * File: web/src/components/tabs/MyAssignedClassesTab.tsx
 */

import React, { useState, useEffect, useMemo, useCallback } from 'react';
import apiClient from '../../api/client';
import {
  BookOpen,
  Users,
  MapPin,
  Search,
  RefreshCw,
  ShieldCheck,
  X,
  CreditCard,
  School,
  Clock,
  ChevronDown,
} from 'lucide-react';

export interface StudentItem {
  id: number;
  lrn: string;
  name: string;
  gender: string;
  photo_url?: string | null;
  attendance_status: string;
  parent_contact?: string;
  rfid_uid?: string;
}

export interface AssignedClass {
  schedule_id: number;
  section_id: number;
  section_name: string;
  grade_level?: string;
  display_name: string;
  subject_code: string;
  subject_title: string;
  start_time: string;
  end_time: string;
  room_number?: string;
  total_students: number;
  students: StudentItem[];
  is_adviser?: boolean;
}

const extractGradeLevelString = (val: any): string => {
  if (val === null || val === undefined) return 'Grade 7';
  if (typeof val === 'string') return val.trim() || 'Grade 7';
  if (typeof val === 'number') return `Grade ${val}`;
  if (typeof val === 'object') {
    const name = val.name || val.level || val.grade_name || val.grade || val.id;
    return name !== undefined && name !== null ? String(name).trim() : 'Grade 7';
  }
  return String(val).trim() || 'Grade 7';
};

const sanitizeImageUrl = (url?: string | null): string | null => {
  if (!url || typeof url !== 'string') return null;
  const clean = url.trim();
  if (/^(https?:\/\/|\/media\/|\/static\/|data:image\/(png|jpe?g|webp|gif);base64,)/i.test(clean)) {
    return clean;
  }
  return null;
};

export const MyAssignedClassesTab: React.FC = () => {
  const [classes, setClasses] = useState<AssignedClass[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [selectedClass, setSelectedClass] = useState<AssignedClass | null>(null);
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [userRole, setUserRole] = useState<string>('FACULTY');
  const [viewScope, setViewScope] = useState<'MY_CLASSES' | 'ALL_CLASSES'>('MY_CLASSES');

  const isAdmin = ['ADMIN', 'SUPERADMIN', 'PRINCIPAL'].includes(userRole);

  const fetchClasses = useCallback(async () => {
    try {
      setLoading(true);

      const userRes = await apiClient.get('/me/');
      if (userRes.data) {
        setUserRole(String(userRes.data.role || 'FACULTY').toUpperCase());
      }

      const params: Record<string, string> = {};
      if (viewScope === 'ALL_CLASSES') {
        params.mode = 'all';
      }

      let rawData: any[] = [];
      try {
        const classListRes = await apiClient.get('/classroom/student_list/', { params });
        rawData = Array.isArray(classListRes.data) ? classListRes.data : classListRes.data?.results || [];
      } catch {
        try {
          const fallbackRes = await apiClient.get('/classroom/class_list/', { params });
          rawData = Array.isArray(fallbackRes.data) ? fallbackRes.data : fallbackRes.data?.results || [];
        } catch {
          rawData = [];
        }
      }

      const normalized: AssignedClass[] = rawData.map((item: any, idx: number) => {
        const rawStudents = Array.isArray(item.students) ? item.students : [];
        const students: StudentItem[] = rawStudents.map((st: any) => ({
          id: st.id,
          lrn: String(st.lrn || '—').trim(),
          name:
            st.name ||
            st.full_name ||
            `${st.first_name || ''} ${st.last_name || ''}`.trim() ||
            'Learner',
          gender: st.gender || st.sex || '—',
          photo_url: sanitizeImageUrl(st.photo_url || st.photo),
          attendance_status: String(st.attendance_status || 'UNSCANNED').toUpperCase(),
          parent_contact: st.parent_contact || '',
          rfid_uid: st.rfid_uid || '',
        }));

        const sectionName = item.section_name || item.name || 'Garnet';
        const subjectTitle = item.subject_title || item.subject_name || 'English 7';

        return {
          schedule_id: item.schedule_id || item.id || idx + 1,
          section_id: item.section_id || item.section?.id || item.id || idx + 1,
          section_name: sectionName,
          grade_level: extractGradeLevelString(item.grade_level || item.section?.grade_level),
          display_name: item.display_name || `${sectionName} • ${subjectTitle}`,
          subject_code: item.subject_code || item.subject?.code || 'ENG-7',
          subject_title: subjectTitle,
          start_time: item.start_time ? String(item.start_time).slice(0, 5) : '07:00',
          end_time: item.end_time ? String(item.end_time).slice(0, 5) : '09:00',
          room_number: item.room_number || item.room || 'Rm-293',
          total_students: students.length || Number(item.total_students) || 0,
          students,
          is_adviser: Boolean(item.is_adviser),
        };
      });

      setClasses(normalized);
      if (normalized.length > 0) {
        setSelectedClass((prev) => {
          if (!prev) return normalized[0];
          const exists = normalized.find(
            (c) =>
              (c.schedule_id && prev.schedule_id && c.schedule_id === prev.schedule_id) ||
              c.section_id === prev.section_id
          );
          return exists || normalized[0];
        });
      } else {
        setSelectedClass(null);
      }
    } catch (err) {
      console.error('Failed to load classes:', err);
    } finally {
      setLoading(false);
    }
  }, [viewScope]);

  useEffect(() => {
    fetchClasses();
  }, [fetchClasses]);

  const filteredStudents = useMemo(() => {
    if (!selectedClass) return [];
    const query = searchQuery.trim().toLowerCase();
    if (!query) return selectedClass.students;
    return selectedClass.students.filter(
      (st) =>
        st.name.toLowerCase().includes(query) ||
        st.lrn.toLowerCase().includes(query) ||
        (st.rfid_uid && st.rfid_uid.toLowerCase().includes(query))
    );
  }, [selectedClass, searchQuery]);

  const stats = useMemo(() => {
    const list = selectedClass?.students || [];
    const present = list.filter((s) => s.attendance_status === 'PRESENT').length;
    const late = list.filter((s) => s.attendance_status === 'LATE').length;
    const flagged = list.filter(
      (s) => s.attendance_status === 'UNVERIFIED' || s.attendance_status === 'CUTTING'
    ).length;
    const unscanned = list.filter((s) => s.attendance_status === 'UNSCANNED').length;

    return { total: list.length, present, late, flagged, unscanned };
  }, [selectedClass]);

  if (loading) {
    return (
      <div style={{ padding: 60, textAlign: 'center', color: '#64748b' }}>
        <RefreshCw size={26} className="animate-spin" style={{ margin: '0 auto 10px auto', display: 'block', color: '#004b87' }} />
        <span style={{ fontWeight: 600, fontSize: '0.86rem' }}>Loading teaching sessions and students...</span>
      </div>
    );
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14, padding: 'clamp(12px, 2.5vw, 20px)' }}>
      {/* 1. Header Bar with Dynamic Scope */}
      <div style={headerCardStyle}>
        <div>
          <h2 style={{ fontSize: '1.20rem', fontWeight: 800, color: '#003460', margin: 0 }}>
            My Assigned Classes &amp; Student Attendance
          </h2>
          <span style={{ fontSize: '0.78rem', color: '#64748b' }}>
            {isAdmin && viewScope === 'ALL_CLASSES'
              ? 'Institutional View: Showing all school sections (Administrator mode).'
              : 'Faculty View: Assigned teaching sessions and class advisory rosters.'}
          </span>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
          {isAdmin && (
            <div style={toggleContainerStyle}>
              <button
                type="button"
                onClick={() => setViewScope('MY_CLASSES')}
                style={{
                  ...toggleButtonStyle,
                  backgroundColor: viewScope === 'MY_CLASSES' ? '#004b87' : 'transparent',
                  color: viewScope === 'MY_CLASSES' ? '#ffffff' : '#64748b',
                }}
              >
                My Classes
              </button>
              <button
                type="button"
                onClick={() => setViewScope('ALL_CLASSES')}
                style={{
                  ...toggleButtonStyle,
                  backgroundColor: viewScope === 'ALL_CLASSES' ? '#004b87' : 'transparent',
                  color: viewScope === 'ALL_CLASSES' ? '#ffffff' : '#64748b',
                }}
              >
                All School Classes
              </button>
            </div>
          )}

          <div style={roleBadgeStyle}>
            <ShieldCheck size={13} />
            <span>{isAdmin ? 'ADMINISTRATOR' : selectedClass?.is_adviser ? 'CLASS ADVISER' : 'SUBJECT TEACHER'}</span>
          </div>

          <button
            type="button"
            onClick={fetchClasses}
            style={refreshButtonStyle}
          >
            <RefreshCw size={12} /> Refresh
          </button>
        </div>
      </div>

      {classes.length === 0 ? (
        <div style={emptyCardStyle}>
          <BookOpen size={44} color="#94a3b8" style={{ margin: '0 auto 10px auto' }} />
          <h3 style={{ fontSize: '1.10rem', fontWeight: 800, color: '#0f172a', margin: 0 }}>
            No Assigned Classes Found
          </h3>
          <p style={{ fontSize: '0.82rem', color: '#64748b', maxWidth: 460, margin: '8px auto 0', lineHeight: 1.5 }}>
            No teaching timetable slots or advisory sections are currently linked to your faculty profile. Please contact your school administrator or check the Schedules tab.
          </p>
        </div>
      ) : (
        <>
          {/* 2. Top Class Selector */}
          <div style={selectorCardStyle}>
            <div style={selectorHeaderRow}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, flex: 1, minWidth: 'min(100%, 280px)' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, color: '#004b87', fontWeight: 800, fontSize: '0.80rem', flexShrink: 0 }}>
                  <School size={16} />
                  <span>TEACHING CLASS:</span>
                </div>

                <div style={{ position: 'relative', flex: 1, maxWidth: 380 }}>
                  <select
                    value={
                      selectedClass
                        ? String(selectedClass.schedule_id || selectedClass.section_id)
                        : ''
                    }
                    onChange={(e) => {
                      const found = classes.find(
                        (c) => String(c.schedule_id || c.section_id) === e.target.value
                      );
                      if (found) {
                        setSelectedClass(found);
                        setSearchQuery('');
                      }
                    }}
                    style={dropdownSelectStyle}
                  >
                    {classes.map((c, idx) => (
                      <option
                        key={`dropdown-class-${c.schedule_id || c.section_id}-${idx}`}
                        value={String(c.schedule_id || c.section_id)}
                      >
                        {c.section_name} ({c.grade_level}) &bull; {c.subject_title} — {c.total_students} Students {c.is_adviser ? '(Adviser)' : ''}
                      </option>
                    ))}
                  </select>
                  <ChevronDown
                    size={16}
                    color="#004b87"
                    style={{ position: 'absolute', right: 10, top: '50%', transform: 'translateY(-50%)', pointerEvents: 'none' }}
                  />
                </div>
              </div>

              {/* Search Box */}
              <div style={searchWrapperStyle}>
                <Search size={14} color="#94a3b8" style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)' }} />
                <input
                  type="text"
                  placeholder="Search student or LRN..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  style={searchFieldStyle}
                />
                {searchQuery.length > 0 && (
                  <button
                    type="button"
                    onClick={() => setSearchQuery('')}
                    style={clearSearchButtonStyle}
                  >
                    <X size={13} color="#94a3b8" />
                  </button>
                )}
              </div>
            </div>

            {/* Quick-Select Chips */}
            <div style={quickChipsContainer}>
              <span style={quickSelectLabelStyle}>QUICK SELECT:</span>
              {classes.map((c, idx) => {
                const isSelected =
                  selectedClass &&
                  ((c.schedule_id && selectedClass.schedule_id && c.schedule_id === selectedClass.schedule_id) ||
                    c.section_id === selectedClass.section_id);

                return (
                  <button
                    key={`quick-chip-${c.schedule_id || c.section_id}-${idx}`}
                    type="button"
                    onClick={() => {
                      setSelectedClass(c);
                      setSearchQuery('');
                    }}
                    style={{
                      ...chipButtonStyle,
                      border: isSelected ? '1px solid #004b87' : '1px solid #e2e8f0',
                      backgroundColor: isSelected ? '#004b87' : '#f8fafc',
                      color: isSelected ? '#ffffff' : '#334155',
                    }}
                  >
                    <span>{c.section_name} ({c.subject_code})</span>
                    <span
                      style={{
                        padding: '1px 6px',
                        borderRadius: 10,
                        fontSize: '0.66rem',
                        fontWeight: 800,
                        backgroundColor: isSelected ? 'rgba(255,255,255,0.25)' : '#e2e8f0',
                        color: isSelected ? '#ffffff' : '#475569',
                      }}
                    >
                      {c.total_students}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>

          {/* 3. Class Details & Student Attendance Table */}
          {selectedClass && (
            <div style={ledgerCardStyle}>
              <div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <h3 style={{ fontSize: '1.20rem', fontWeight: 800, color: '#0f172a', margin: 0 }}>
                    {selectedClass.section_name} ({selectedClass.grade_level}) &bull; {selectedClass.subject_title}
                  </h3>
                  {selectedClass.is_adviser && (
                    <span style={adviserTagStyle}>Official Class Adviser</span>
                  )}
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, fontSize: '0.76rem', color: '#64748b', marginTop: 3, flexWrap: 'wrap' }}>
                  <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                    <MapPin size={12} color="#004b87" /> {selectedClass.room_number || 'Room —'}
                  </span>
                  <span>&bull;</span>
                  <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                    <Clock size={12} color="#64748b" /> {selectedClass.start_time} - {selectedClass.end_time}
                  </span>
                  <span>&bull;</span>
                  <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                    <Users size={12} color="#004b87" /> {selectedClass.total_students} Enrolled Students
                  </span>
                </div>

                <div style={responsiveMetricGrid}>
                  <div style={statCardStyle}>
                    <span style={statLabelStyle}>TOTAL STUDENTS</span>
                    <span style={{ ...statValueStyle, color: '#0f172a' }}>{stats.total}</span>
                  </div>
                  <div style={{ ...statCardStyle, backgroundColor: '#f0fdf4', borderColor: '#bbf7d0' }}>
                    <span style={{ ...statLabelStyle, color: '#16a34a' }}>PRESENT TODAY</span>
                    <span style={{ ...statValueStyle, color: '#16a34a' }}>{stats.present}</span>
                  </div>
                  <div style={{ ...statCardStyle, backgroundColor: '#fffbeb', borderColor: '#fef3c7' }}>
                    <span style={{ ...statLabelStyle, color: '#d97706' }}>LATE TODAY</span>
                    <span style={{ ...statValueStyle, color: '#d97706' }}>{stats.late}</span>
                  </div>
                  <div style={{ ...statCardStyle, backgroundColor: '#fef2f2', borderColor: '#fecaca' }}>
                    <span style={{ ...statLabelStyle, color: '#dc2626' }}>FLAGGED / ANOMALY</span>
                    <span style={{ ...statValueStyle, color: '#dc2626' }}>{stats.flagged}</span>
                  </div>
                  <div style={{ ...statCardStyle, backgroundColor: '#f8fafc', borderColor: '#e2e8f0' }}>
                    <span style={statLabelStyle}>PENDING SCANS</span>
                    <span style={{ ...statValueStyle, color: '#64748b' }}>{stats.unscanned}</span>
                  </div>
                </div>
              </div>

              {/* Roster Table */}
              <div style={{ border: '1px solid #e2e8f0', borderRadius: 8, overflowX: 'auto' }}>
                <table style={{ width: '100%', minWidth: 640, borderCollapse: 'collapse', fontSize: '0.82rem' }}>
                  <thead>
                    <tr style={{ backgroundColor: '#f8fafc', borderBottom: '2px solid #e2e8f0', textAlign: 'left', color: '#475569' }}>
                      <th style={{ padding: '10px 14px', width: 34 }}>#</th>
                      <th style={{ padding: '10px 14px' }}>Student Name &amp; Photo</th>
                      <th style={{ padding: '10px 14px' }}>12-Digit LRN</th>
                      <th style={{ padding: '10px 14px' }}>Sex</th>
                      <th style={{ padding: '10px 14px' }}>Parent Contact (SMS)</th>
                      <th style={{ padding: '10px 14px' }}>Gate RFID Card</th>
                      <th style={{ padding: '10px 14px', textAlign: 'center' }}>Attendance Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredStudents.length > 0 ? (
                      filteredStudents.map((st, idx) => {
                        const isPresent = st.attendance_status === 'PRESENT';
                        const isLate = st.attendance_status === 'LATE';
                        const isFlagged =
                          st.attendance_status === 'UNVERIFIED' || st.attendance_status === 'CUTTING';

                        return (
                          <tr key={`student-row-${st.id || st.lrn}-${idx}`} style={{ borderBottom: '1px solid #f1f5f9' }}>
                            <td style={{ padding: '10px 14px', color: '#94a3b8' }}>{idx + 1}</td>
                            <td style={{ padding: '10px 14px', display: 'flex', alignItems: 'center', gap: 10 }}>
                              {st.photo_url ? (
                                <img
                                  src={st.photo_url}
                                  alt={st.name}
                                  style={{
                                    width: 34,
                                    height: 34,
                                    borderRadius: '50%',
                                    objectFit: 'cover',
                                    border: '1px solid #cbd5e1',
                                  }}
                                  onError={(e) => {
                                    (e.target as HTMLElement).style.display = 'none';
                                  }}
                                />
                              ) : (
                                <div
                                  style={{
                                    width: 34,
                                    height: 34,
                                    borderRadius: '50%',
                                    backgroundColor: '#e0f2fe',
                                    color: '#004b87',
                                    display: 'flex',
                                    alignItems: 'center',
                                    justifyContent: 'center',
                                    fontWeight: 800,
                                    fontSize: '0.74rem',
                                  }}
                                >
                                  {st.name.charAt(0)}
                                </div>
                              )}
                              <span style={{ fontWeight: 700, color: '#0f172a' }}>{st.name}</span>
                            </td>
                            <td style={{ padding: '10px 14px', fontFamily: 'monospace', color: '#334155' }}>
                              {st.lrn}
                            </td>
                            <td style={{ padding: '10px 14px', color: '#64748b' }}>{st.gender}</td>
                            <td style={{ padding: '10px 14px', color: '#475569' }}>
                              {st.parent_contact || '—'}
                            </td>
                            <td style={{ padding: '10px 14px' }}>
                              {st.rfid_uid ? (
                                <span style={rfidBadgeStyle}>
                                  <CreditCard size={11} color="#059669" />
                                  {st.rfid_uid}
                                </span>
                              ) : (
                                <span style={{ fontSize: '0.72rem', color: '#94a3b8' }}>No card</span>
                              )}
                            </td>
                            <td style={{ padding: '10px 14px', textAlign: 'center' }}>
                              <span
                                style={{
                                  padding: '4px 10px',
                                  borderRadius: 10,
                                  fontSize: '0.70rem',
                                  fontWeight: 800,
                                  backgroundColor: isPresent
                                    ? '#ecfdf5'
                                    : isLate
                                    ? '#fffbeb'
                                    : isFlagged
                                    ? '#fef2f2'
                                    : '#f1f5f9',
                                  color: isPresent
                                    ? '#059669'
                                    : isLate
                                    ? '#d97706'
                                    : isFlagged
                                    ? '#dc2626'
                                    : '#64748b',
                                }}
                              >
                                {st.attendance_status}
                              </span>
                            </td>
                          </tr>
                        );
                      })
                    ) : (
                      <tr>
                        <td colSpan={7} style={{ padding: 36, textAlign: 'center', color: '#94a3b8' }}>
                          {searchQuery
                            ? 'No students match your search query.'
                            : 'No students registered in this section.'}
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
};

// Styles
const headerCardStyle: React.CSSProperties = {
  display: 'flex',
  justifyContent: 'space-between',
  alignItems: 'center',
  backgroundColor: '#ffffff',
  padding: '12px 16px',
  borderRadius: 12,
  border: '1px solid #e2e8f0',
  flexWrap: 'wrap',
  gap: 12,
};

const toggleContainerStyle: React.CSSProperties = {
  display: 'flex',
  backgroundColor: '#f1f5f9',
  borderRadius: 8,
  padding: 2,
  border: '1px solid #e2e8f0',
};

const toggleButtonStyle: React.CSSProperties = {
  border: 'none',
  padding: '5px 12px',
  borderRadius: 6,
  fontSize: '0.74rem',
  fontWeight: 700,
  cursor: 'pointer',
};

const roleBadgeStyle: React.CSSProperties = {
  display: 'inline-flex',
  alignItems: 'center',
  gap: 5,
  padding: '5px 12px',
  borderRadius: 20,
  backgroundColor: '#ecfdf5',
  border: '1px solid #a7f3d0',
  color: '#047857',
  fontSize: '0.72rem',
  fontWeight: 800,
};

const adviserTagStyle: React.CSSProperties = {
  backgroundColor: '#e0f2fe',
  color: '#0369a1',
  border: '1px solid #bae6fd',
  borderRadius: 12,
  padding: '2px 8px',
  fontSize: '0.68rem',
  fontWeight: 800,
};

const refreshButtonStyle: React.CSSProperties = {
  display: 'inline-flex',
  alignItems: 'center',
  gap: 6,
  backgroundColor: '#f1f5f9',
  border: '1px solid #cbd5e1',
  padding: '6px 12px',
  borderRadius: 8,
  fontSize: '0.76rem',
  fontWeight: 700,
  cursor: 'pointer',
  color: '#334155',
};

const emptyCardStyle: React.CSSProperties = {
  padding: 48,
  textAlign: 'center',
  backgroundColor: '#ffffff',
  borderRadius: 14,
  border: '1px solid #e2e8f0',
};

const selectorCardStyle: React.CSSProperties = {
  backgroundColor: '#ffffff',
  borderRadius: 12,
  border: '1px solid #e2e8f0',
  padding: '14px 16px',
  display: 'flex',
  flexDirection: 'column',
  gap: 12,
};

const selectorHeaderRow: React.CSSProperties = {
  display: 'flex',
  justifyContent: 'space-between',
  alignItems: 'center',
  flexWrap: 'wrap',
  gap: 12,
};

const dropdownSelectStyle: React.CSSProperties = {
  width: '100%',
  padding: '8px 32px 8px 12px',
  borderRadius: 8,
  border: '2px solid #004b87',
  fontSize: '0.82rem',
  fontWeight: 700,
  color: '#0f172a',
  backgroundColor: '#f0f9ff',
  outline: 'none',
  cursor: 'pointer',
  appearance: 'none',
};

const searchWrapperStyle: React.CSSProperties = {
  position: 'relative',
  width: '100%',
  maxWidth: 280,
};

const searchFieldStyle: React.CSSProperties = {
  width: '100%',
  padding: '8px 28px 8px 30px',
  borderRadius: 8,
  border: '1px solid #cbd5e1',
  fontSize: '0.78rem',
  outline: 'none',
  boxSizing: 'border-box',
};

const clearSearchButtonStyle: React.CSSProperties = {
  position: 'absolute',
  right: 8,
  top: '50%',
  transform: 'translateY(-50%)',
  background: 'none',
  border: 'none',
  cursor: 'pointer',
  padding: 2,
};

const quickChipsContainer: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: 8,
  overflowX: 'auto',
  paddingBottom: 2,
};

const quickSelectLabelStyle: React.CSSProperties = {
  fontSize: '0.70rem',
  fontWeight: 800,
  color: '#64748b',
  letterSpacing: '0.4px',
  flexShrink: 0,
};

const chipButtonStyle: React.CSSProperties = {
  display: 'inline-flex',
  alignItems: 'center',
  gap: 6,
  padding: '5px 12px',
  borderRadius: 8,
  fontSize: '0.74rem',
  fontWeight: 700,
  cursor: 'pointer',
  whiteSpace: 'nowrap',
  transition: 'all 0.15s ease',
  flexShrink: 0,
};

const ledgerCardStyle: React.CSSProperties = {
  backgroundColor: '#ffffff',
  borderRadius: 12,
  border: '1px solid #e2e8f0',
  padding: '16px 18px',
  display: 'flex',
  flexDirection: 'column',
  gap: 16,
};

const responsiveMetricGrid: React.CSSProperties = {
  display: 'grid',
  gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 150px), 1fr))',
  gap: 10,
  marginTop: 12,
};

const statCardStyle: React.CSSProperties = {
  backgroundColor: '#ffffff',
  borderRadius: 8,
  padding: '10px 12px',
  border: '1px solid #e2e8f0',
  display: 'flex',
  flexDirection: 'column',
};

const statLabelStyle: React.CSSProperties = {
  fontSize: '0.62rem',
  fontWeight: 800,
  color: '#64748b',
  letterSpacing: '0.4px',
};

const statValueStyle: React.CSSProperties = {
  fontSize: '1.20rem',
  fontWeight: 800,
  marginTop: 2,
};

const rfidBadgeStyle: React.CSSProperties = {
  display: 'inline-flex',
  alignItems: 'center',
  gap: 4,
  padding: '2px 8px',
  borderRadius: 4,
  backgroundColor: '#ecfdf5',
  color: '#059669',
  fontFamily: 'monospace',
  fontSize: '0.70rem',
  fontWeight: 700,
  border: '1px solid #a7f3d0',
};

export default MyAssignedClassesTab;