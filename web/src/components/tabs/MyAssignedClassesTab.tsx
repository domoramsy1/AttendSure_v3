/**
 * AttendSure - Assigned Classes & Student Attendance Directory
 * File: web/src/components/tabs/MyAssignedClassesTab.tsx
 */

import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import apiClient from '../../api/client';
import { exportToCsv } from '../common/Pagination';
import { Modal } from '../ui/Modal';
import { Button } from '../ui/Button';
import {
  Search,
  RefreshCw,
  CreditCard,
  Clock,
  Download,
  Copy,
  Check,
  User as UserIcon,
  Phone,
  QrCode,
  MapPin,
  AlertCircle,
  Printer,
  ShieldCheck,
  BookOpen,
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

const isSafeImageUrl = (url?: string | null): boolean => {
  if (!url || typeof url !== 'string') return false;
  const clean = url.trim().toLowerCase();
  if (!clean || clean === 'null' || clean === 'undefined' || clean === 'none') return false;
  if (clean.startsWith('javascript:') || clean.startsWith('vbscript:')) return false;
  return clean.startsWith('http://') || clean.startsWith('https://') || clean.startsWith('/') || clean.startsWith('data:image/');
};

const copyTextSafely = async (textToCopy: string): Promise<boolean> => {
  const cleanText = String(textToCopy || '').trim();
  if (!cleanText) return false;

  if (typeof navigator !== 'undefined' && navigator.clipboard?.writeText) {
    try {
      await navigator.clipboard.writeText(cleanText);
      return true;
    } catch {}
  }

  if (typeof document !== 'undefined') {
    const textArea = document.createElement('textarea');
    textArea.value = cleanText;
    textArea.setAttribute('readonly', '');
    textArea.style.position = 'fixed';
    textArea.style.top = '-9999px';
    document.body.appendChild(textArea);
    textArea.select();
    let copied = false;
    try {
      copied = document.execCommand('copy');
    } catch {
      copied = false;
    }
    document.body.removeChild(textArea);
    return copied;
  }
  return false;
};

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

export const MyAssignedClassesTab: React.FC = () => {
  const [classes, setClasses] = useState<AssignedClass[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedClass, setSelectedClass] = useState<AssignedClass | null>(null);
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [userRole, setUserRole] = useState<string>('FACULTY');
  const [viewScope, setViewScope] = useState<'MY_CLASSES' | 'ALL_CLASSES'>('MY_CLASSES');
  const [copiedValue, setCopiedValue] = useState<string | null>(null);
  const [badgeStudent, setBadgeStudent] = useState<StudentItem | null>(null);

  const isAdmin = ['ADMIN', 'SUPERADMIN', 'PRINCIPAL'].includes(userRole);
  const isInteracting = useRef<boolean>(false);
  isInteracting.current = Boolean(badgeStudent);

  const fetchClasses = useCallback(async (silent = false) => {
    try {
      if (!silent) setLoading(true);
      setError(null);

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
          gender: st.gender || st.sex || 'Male',
          photo_url: isSafeImageUrl(st.photo_url || st.photo) ? (st.photo_url || st.photo) : null,
          attendance_status: String(st.attendance_status || 'UNSCANNED').toUpperCase(),
          parent_contact: st.parent_contact || '',
          rfid_uid: st.rfid_uid || '',
        }));

        const sectionName = item.section_name || item.name || 'Section';
        const subjectTitle = item.subject_title || item.subject_name || 'Subject';

        return {
          schedule_id: item.schedule_id || item.id || idx + 1,
          section_id: item.section_id || item.section?.id || item.id || idx + 1,
          section_name: sectionName,
          grade_level: extractGradeLevelString(item.grade_level || item.section?.grade_level),
          display_name: item.display_name || `${sectionName} • ${subjectTitle}`,
          subject_code: item.subject_code || item.subject?.code || 'SUB',
          subject_title: subjectTitle,
          start_time: item.start_time ? String(item.start_time).slice(0, 5) : '07:30',
          end_time: item.end_time ? String(item.end_time).slice(0, 5) : '08:30',
          room_number: item.room_number || item.room || 'Room —',
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
    } catch (err: any) {
      if (!silent) {
        setError(err.response?.data?.detail || err.response?.data?.error || 'Failed to load assigned classes.');
      }
    } finally {
      if (!silent) setLoading(false);
    }
  }, [viewScope]);

  useEffect(() => {
    fetchClasses(false);
  }, [fetchClasses]);

  // Safe live background refresh
  useEffect(() => {
    const liveInterval = setInterval(() => {
      if (!isInteracting.current && document.visibilityState === 'visible') {
        fetchClasses(true);
      }
    }, 10000);
    return () => clearInterval(liveInterval);
  }, [fetchClasses]);

  const handleCopy = async (val: string) => {
    const ok = await copyTextSafely(val);
    if (ok) {
      setCopiedValue(val);
      setTimeout(() => setCopiedValue((prev) => (prev === val ? null : prev)), 2000);
    }
  };

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

  // 4 Top Metrics matching the screenshot design
  const stats = useMemo(() => {
    const totalClasses = classes.length;
    const currentRosterCount = selectedClass?.students.length || 0;
    const presentToday = (selectedClass?.students || []).filter((s) => s.attendance_status === 'PRESENT').length;
    const cardsPaired = (selectedClass?.students || []).filter((s) => Boolean(s.rfid_uid)).length;

    return { totalClasses, currentRosterCount, presentToday, cardsPaired };
  }, [classes, selectedClass]);

  const handleExportCsv = () => {
    if (!selectedClass) return;
    exportToCsv(
      `AttendSure_ClassAttendance_${selectedClass.section_name}_${new Date().toISOString().slice(0, 10)}.csv`,
      ['LRN', 'Student Name', 'Sex', 'Class Section', 'Subject', 'RFID UID', 'Parent Contact', 'Attendance Status'],
      filteredStudents.map((st) => [
        st.lrn,
        st.name,
        st.gender,
        selectedClass.section_name,
        selectedClass.subject_title,
        st.rfid_uid || '',
        st.parent_contact || '',
        st.attendance_status,
      ])
    );
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      {/* 1. Four Metric Cards */}
      <div style={statsGrid}>
        <div style={statCard}>
          <div style={statLabel}>ASSIGNED CLASSES</div>
          <div style={{ ...statVal, color: '#0f172a' }}>{stats.totalClasses}</div>
          <div style={statSub}>Active teaching timetable sessions</div>
        </div>

        <div style={statCard}>
          <div style={statLabel}>CLASS ROSTER</div>
          <div style={{ ...statVal, color: '#16a34a' }}>{stats.currentRosterCount}</div>
          <div style={statSub}>Enrolled learners in selected class</div>
        </div>

        <div style={statCard}>
          <div style={statLabel}>PRESENT TODAY</div>
          <div style={{ ...statVal, color: '#004b87' }}>
            {stats.presentToday} <span style={{ fontSize: '1rem', color: '#94a3b8', fontWeight: 600 }}>/ {stats.currentRosterCount}</span>
          </div>
          <div style={statSub}>Verified classroom attendance scans</div>
        </div>

        <div style={statCard}>
          <div style={statLabel}>RFID CARDS PAIRED</div>
          <div style={{ ...statVal, color: '#d97706' }}>
            {stats.cardsPaired} <span style={{ fontSize: '1rem', color: '#94a3b8', fontWeight: 600 }}>/ {stats.currentRosterCount}</span>
          </div>
          <div style={statSub}>Learners with linked gate cards</div>
        </div>
      </div>

      {/* 2. Top Filter and Actions Bar */}
      <div style={controlBar}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
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
            style={selectStyle}
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
        </div>

        <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
          <button type="button" onClick={handleExportCsv} style={secondaryBtnStyle}>
            <Download size={14} />
            <span>Export CSV ({filteredStudents.length})</span>
          </button>

          <button type="button" onClick={() => fetchClasses(false)} style={primaryBtnStyle}>
            <RefreshCw size={14} />
            <span>Refresh Roster</span>
          </button>
        </div>
      </div>

      {/* 3. Main Directory White Card */}
      <div style={mainCard}>
        <div style={mainCardHeader}>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <h3 style={titleHeading}>
                {selectedClass ? `${selectedClass.section_name} • ${selectedClass.subject_title}` : 'Assigned Classes Directory'}
              </h3>
              {selectedClass?.is_adviser && (
                <span style={adviserTagStyle}>Official Class Adviser</span>
              )}
            </div>
            <p style={subtitleText}>
              {selectedClass
                ? `${selectedClass.grade_level || 'Grade 7'} • Room: ${selectedClass.room_number || 'Room —'} • Time: ${selectedClass.start_time} - ${selectedClass.end_time}`
                : 'Manage verified student attendance, check gate scan entries, and inspect class rosters.'}
            </p>
          </div>

          <div style={searchWrapper}>
            <Search size={15} color="#94a3b8" style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)' }} />
            <input
              type="text"
              placeholder="Search by Student Name, LRN..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              style={searchInput}
            />
          </div>
        </div>

        {error && (
          <div style={errorBanner}>
            <AlertCircle size={16} />
            <span>{error}</span>
          </div>
        )}

        {loading ? (
          <div style={loadingContainer}>
            <RefreshCw size={28} className="animate-spin" color="#004b87" />
            <span style={{ fontSize: '0.84rem', color: '#64748b' }}>Loading class roster...</span>
          </div>
        ) : classes.length === 0 ? (
          <div style={emptyContainer}>
            <BookOpen size={40} color="#cbd5e1" />
            <p style={{ margin: '8px 0 2px 0', fontWeight: 700, color: '#334155', fontSize: '0.90rem' }}>
              No Assigned Classes Found
            </p>
            <p style={{ margin: 0, fontSize: '0.78rem', color: '#94a3b8' }}>
              No teaching timetable slots or advisory sections are currently linked to your faculty profile.
            </p>
          </div>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table style={tableStyle}>
              <thead>
                <tr style={tableHeaderRow}>
                  <th style={thStyle}>Learner Member</th>
                  <th style={thStyle}>Learner LRN</th>
                  <th style={thStyle}>Classroom &amp; Time</th>
                  <th style={thStyle}>School Gate Card</th>
                  <th style={thStyle}>Parent Contact</th>
                  <th style={thStyle}>Attendance Status</th>
                  <th style={{ ...thStyle, textAlign: 'right' }}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {filteredStudents.map((st) => {
                  const isPresent = st.attendance_status === 'PRESENT';
                  const isLate = st.attendance_status === 'LATE';
                  const isCutting = st.attendance_status === 'CUTTING' || st.attendance_status === 'UNVERIFIED';

                  return (
                    <tr key={st.id || st.lrn} style={tableRowStyle}>
                      {/* 1. Learner Member with Avatar */}
                      <td style={tdStyle}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                          <div style={avatarStyle}>
                            {st.photo_url ? (
                              <img src={st.photo_url} alt={st.name} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                            ) : (
                              <UserIcon size={18} color="#94a3b8" />
                            )}
                          </div>
                          <div>
                            <div style={{ fontWeight: 800, color: '#0f172a', fontSize: '0.86rem' }}>
                              {st.name}
                            </div>
                            <div style={{ fontSize: '0.74rem', color: '#64748b', marginTop: 1 }}>
                              {st.gender} &bull; {selectedClass?.grade_level || 'Grade 7'}
                            </div>
                          </div>
                        </div>
                      </td>

                      {/* 2. Learner LRN with Copy Button */}
                      <td style={tdStyle}>
                        <div style={codePill}>
                          <span>{st.lrn}</span>
                          <button
                            type="button"
                            onClick={() => handleCopy(st.lrn)}
                            style={copyBtn}
                            title="Copy LRN"
                          >
                            {copiedValue === st.lrn ? <Check size={11} color="#16a34a" /> : <Copy size={11} color="#64748b" />}
                          </button>
                        </div>
                      </td>

                      {/* 3. Classroom & Time */}
                      <td style={tdStyle}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: '0.82rem', fontWeight: 700, color: '#0f172a' }}>
                          <MapPin size={14} color="#004b87" />
                          <span>{selectedClass?.room_number || 'Room —'}</span>
                        </div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: '0.72rem', color: '#64748b', marginTop: 2 }}>
                          <Clock size={11} color="#94a3b8" />
                          <span>{selectedClass?.start_time} - {selectedClass?.end_time}</span>
                        </div>
                      </td>

                      {/* 4. School Gate Card */}
                      <td style={tdStyle}>
                        {st.rfid_uid ? (
                          <div style={cardPairedBadge}>
                            <CreditCard size={13} color="#16a34a" />
                            <span>{st.rfid_uid}</span>
                          </div>
                        ) : (
                          <div style={cardUnpairedBadge}>
                            <CreditCard size={13} color="#94a3b8" />
                            <span>Not Paired</span>
                          </div>
                        )}
                      </td>

                      {/* 5. Parent Contact */}
                      <td style={tdStyle}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: '0.80rem', color: '#334155' }}>
                          <Phone size={13} color="#64748b" />
                          <span>{st.parent_contact || 'None'}</span>
                        </div>
                      </td>

                      {/* 6. Attendance Status */}
                      <td style={tdStyle}>
                        <span
                          style={{
                            ...activePill,
                            backgroundColor: isPresent ? '#f0fdf4' : isLate ? '#fffbeb' : isCutting ? '#fef2f2' : '#f1f5f9',
                            borderColor: isPresent ? '#bbf7d0' : isLate ? '#fef3c7' : isCutting ? '#fecaca' : '#e2e8f0',
                            color: isPresent ? '#16a34a' : isLate ? '#d97706' : isCutting ? '#dc2626' : '#64748b',
                          }}
                        >
                          {st.attendance_status}
                        </span>
                      </td>

                      {/* 7. Actions */}
                      <td style={{ ...tdStyle, textAlign: 'right' }}>
                        <div style={{ display: 'flex', gap: 6, justifyContent: 'flex-end', alignItems: 'center' }}>
                          <button
                            type="button"
                            onClick={() => setBadgeStudent(st)}
                            style={actionBtn}
                            title="Print / View ID Pass"
                          >
                            <QrCode size={14} color="#004b87" />
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

      {/* Student ID Pass Modal */}
      {badgeStudent && (
        <Modal
          isOpen={Boolean(badgeStudent)}
          onClose={() => setBadgeStudent(null)}
          title="Student Classroom & Gate ID Pass"
        >
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', textAlign: 'center', padding: '6px 0' }}>
            <div
              style={{
                width: 300,
                backgroundColor: '#ffffff',
                border: '2px solid #004b87',
                borderRadius: 14,
                overflow: 'hidden',
                boxShadow: '0 8px 24px rgba(0, 75, 135, 0.12)',
              }}
            >
              <div style={{ background: '#004b87', color: '#ffffff', padding: '12px 14px' }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 5, fontSize: '0.68rem', fontWeight: 800 }}>
                  <ShieldCheck size={14} color="#38bdf8" />
                  <span>ATTENDSURE STUDENT PASS</span>
                </div>
                <div style={{ fontSize: '0.58rem', color: '#e0f2fe', marginTop: 2 }}>
                  Department of Education &bull; Classroom &amp; Gate Pass
                </div>
              </div>

              <div style={{ padding: '16px 14px' }}>
                <div style={{ margin: '0 auto 10px auto', display: 'flex', justifyContent: 'center' }}>
                  <div style={avatarStyle}>
                    {badgeStudent.photo_url ? (
                      <img src={badgeStudent.photo_url} alt={badgeStudent.name} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                    ) : (
                      <UserIcon size={34} color="#94a3b8" />
                    )}
                  </div>
                </div>

                <div style={{ fontSize: '0.98rem', fontWeight: 800, color: '#0f172a', lineHeight: 1.2 }}>
                  {badgeStudent.name}
                </div>

                <div style={{ fontSize: '0.74rem', fontWeight: 600, color: '#64748b', marginTop: 3 }}>
                  Section: {selectedClass?.section_name || 'Class Roster'}
                </div>

                <div
                  onClick={() => handleCopy(badgeStudent.lrn)}
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: 6,
                    margin: '8px 0',
                    padding: '4px 10px',
                    backgroundColor: '#f1f5f9',
                    borderRadius: 6,
                    fontFamily: 'monospace',
                    fontSize: '0.76rem',
                    fontWeight: 700,
                    color: '#0f172a',
                    cursor: 'pointer',
                  }}
                  title="Click to copy LRN"
                >
                  <span>LRN: {badgeStudent.lrn}</span>
                  <Copy size={11} color="#64748b" />
                </div>

                <div
                  style={{
                    margin: '8px auto',
                    padding: 6,
                    backgroundColor: '#ffffff',
                    border: '1px solid #e2e8f0',
                    borderRadius: 10,
                    width: 118,
                    height: 118,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                  }}
                >
                  <img
                    src={`https://api.qrserver.com/v1/create-qr-code/?size=120x120&data=${encodeURIComponent(
                      badgeStudent.lrn
                    )}`}
                    alt="Student QR Code"
                    style={{ width: '100%', height: '100%', objectFit: 'contain' }}
                  />
                </div>
              </div>

              <div
                style={{
                  backgroundColor: '#f8fafc',
                  borderTop: '1px solid #e2e8f0',
                  padding: '8px 12px',
                  fontSize: '0.66rem',
                  color: '#64748b',
                }}
              >
                Card UID:{' '}
                <strong style={{ color: badgeStudent.rfid_uid ? '#059669' : '#d97706' }}>
                  {badgeStudent.rfid_uid || 'No Card Linked'}
                </strong>
              </div>
            </div>

            <div style={{ display: 'flex', gap: 10, marginTop: 16, width: '100%', justifyContent: 'center' }}>
              <Button variant="secondary" size="md" type="button" onClick={() => setBadgeStudent(null)}>
                Close
              </Button>
              <Button
                variant="primary"
                size="md"
                type="button"
                onClick={() => {
                  window.print();
                }}
              >
                <Printer size={15} style={{ marginRight: 6 }} />
                Print ID Card
              </Button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
};

export default MyAssignedClassesTab;

// Visual Design Styles Matching the Faculty Screenshot Exactly
const statsGrid: React.CSSProperties = {
  display: 'grid',
  gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 220px), 1fr))',
  gap: 12,
};

const statCard: React.CSSProperties = {
  backgroundColor: '#ffffff',
  borderRadius: 10,
  border: '1px solid #e2e8f0',
  padding: '14px 18px',
};

const statLabel: React.CSSProperties = {
  fontSize: '0.66rem',
  fontWeight: 800,
  color: '#64748b',
  letterSpacing: '0.4px',
  textTransform: 'uppercase',
};

const statVal: React.CSSProperties = {
  fontSize: '1.60rem',
  fontWeight: 800,
  marginTop: 4,
  lineHeight: 1.1,
};

const statSub: React.CSSProperties = {
  fontSize: '0.72rem',
  color: '#94a3b8',
  marginTop: 3,
};

const controlBar: React.CSSProperties = {
  display: 'flex',
  justifyContent: 'space-between',
  alignItems: 'center',
  flexWrap: 'wrap',
  gap: 12,
};

const selectStyle: React.CSSProperties = {
  padding: '8px 14px',
  borderRadius: 6,
  border: '1px solid #cbd5e1',
  backgroundColor: '#ffffff',
  fontSize: '0.82rem',
  color: '#334155',
  fontWeight: 600,
  outline: 'none',
  cursor: 'pointer',
  minWidth: 260,
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
  padding: '6px 12px',
  borderRadius: 6,
  fontSize: '0.74rem',
  fontWeight: 700,
  cursor: 'pointer',
};

const secondaryBtnStyle: React.CSSProperties = {
  display: 'inline-flex',
  alignItems: 'center',
  gap: 6,
  backgroundColor: '#ffffff',
  color: '#0f172a',
  border: '1px solid #cbd5e1',
  padding: '8px 14px',
  borderRadius: 6,
  fontWeight: 700,
  fontSize: '0.80rem',
  cursor: 'pointer',
};

const primaryBtnStyle: React.CSSProperties = {
  display: 'inline-flex',
  alignItems: 'center',
  gap: 6,
  backgroundColor: '#004b87',
  color: '#ffffff',
  border: 'none',
  padding: '8px 16px',
  borderRadius: 6,
  fontWeight: 700,
  fontSize: '0.80rem',
  cursor: 'pointer',
};

const mainCard: React.CSSProperties = {
  backgroundColor: '#ffffff',
  borderRadius: 12,
  padding: '20px 24px',
  border: '1px solid #e2e8f0',
};

const mainCardHeader: React.CSSProperties = {
  display: 'flex',
  justifyContent: 'space-between',
  alignItems: 'flex-start',
  flexWrap: 'wrap',
  gap: 14,
  marginBottom: 16,
};

const titleHeading: React.CSSProperties = {
  margin: 0,
  fontSize: '1.20rem',
  fontWeight: 800,
  color: '#0f172a',
};

const subtitleText: React.CSSProperties = {
  margin: '4px 0 0 0',
  fontSize: '0.80rem',
  color: '#64748b',
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

const searchWrapper: React.CSSProperties = {
  position: 'relative',
  width: '100%',
  maxWidth: 290,
};

const searchInput: React.CSSProperties = {
  width: '100%',
  padding: '8px 14px 8px 34px',
  borderRadius: 8,
  border: '1px solid #cbd5e1',
  fontSize: '0.80rem',
  outline: 'none',
  boxSizing: 'border-box',
  color: '#0f172a',
};

const tableStyle: React.CSSProperties = {
  width: '100%',
  minWidth: 700,
  borderCollapse: 'collapse',
  textAlign: 'left',
};

const tableHeaderRow: React.CSSProperties = {
  borderBottom: '2px solid #e2e8f0',
};

const thStyle: React.CSSProperties = {
  padding: '12px 14px',
  fontSize: '0.74rem',
  fontWeight: 700,
  color: '#475569',
};

const tableRowStyle: React.CSSProperties = {
  borderBottom: '1px solid #f1f5f9',
};

const tdStyle: React.CSSProperties = {
  padding: '14px 14px',
  verticalAlign: 'middle',
};

const avatarStyle: React.CSSProperties = {
  width: 38,
  height: 38,
  borderRadius: '50%',
  backgroundColor: '#f1f5f9',
  border: '1px solid #e2e8f0',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  overflow: 'hidden',
  flexShrink: 0,
};

const codePill: React.CSSProperties = {
  display: 'inline-flex',
  alignItems: 'center',
  gap: 6,
  padding: '3px 8px',
  backgroundColor: '#f8fafc',
  border: '1px solid #e2e8f0',
  borderRadius: 6,
  fontFamily: 'monospace',
  fontSize: '0.76rem',
  fontWeight: 700,
  color: '#0f172a',
};

const copyBtn: React.CSSProperties = {
  background: 'none',
  border: 'none',
  cursor: 'pointer',
  padding: 0,
  display: 'flex',
  alignItems: 'center',
};

const cardPairedBadge: React.CSSProperties = {
  display: 'inline-flex',
  alignItems: 'center',
  gap: 5,
  fontSize: '0.76rem',
  fontWeight: 700,
  color: '#16a34a',
  fontFamily: 'monospace',
};

const cardUnpairedBadge: React.CSSProperties = {
  display: 'inline-flex',
  alignItems: 'center',
  gap: 5,
  fontSize: '0.76rem',
  color: '#94a3b8',
};

const activePill: React.CSSProperties = {
  display: 'inline-flex',
  alignItems: 'center',
  padding: '3px 10px',
  borderRadius: 14,
  fontSize: '0.70rem',
  fontWeight: 800,
};

const actionBtn: React.CSSProperties = {
  background: '#ffffff',
  border: '1px solid #cbd5e1',
  borderRadius: 6,
  padding: '6px 8px',
  cursor: 'pointer',
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
};

const errorBanner: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: 8,
  backgroundColor: '#fef2f2',
  border: '1px solid #fecaca',
  color: '#991b1b',
  borderRadius: 6,
  padding: '10px 14px',
  marginBottom: 14,
  fontSize: '0.80rem',
};

const loadingContainer: React.CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  alignItems: 'center',
  justifyContent: 'center',
  gap: 10,
  padding: '40px 0',
};

const emptyContainer: React.CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  alignItems: 'center',
  justifyContent: 'center',
  padding: '40px 0',
};