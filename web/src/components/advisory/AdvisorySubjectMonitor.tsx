/**
 * AttendSure V3 - Class Adviser Subject Attendance & Loafing Monitor
 * File: web/src/components/advisory/AdvisorySubjectMonitor.tsx
 */

import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import apiClient from '../../api/client';
import { useTheme } from '../../context/ThemeContext';
import {
  AlertTriangle,
  RefreshCw,
  Search,
  BookOpen,
  CheckCircle2,
  Clock,
  Info,
  ChevronDown,
} from 'lucide-react';

interface AvailableSection {
  id: number;
  name: string;
  grade_level: string;
  is_adviser: boolean;
}

interface SubjectHeader {
  schedule_id: number;
  subject_code: string;
  subject_name: string;
  faculty_name: string;
  time_window: string;
}

interface StudentSubjectStatus {
  schedule_id: number;
  subject_code: string;
  status: 'PRESENT' | 'LATE' | 'CUTTING' | 'UNVERIFIED' | 'UNSCANNED';
  time: string;
}

interface StudentMatrixRow {
  number: number;
  student_id: number;
  student_name: string;
  lrn: string;
  photo_url?: string | null;
  campus_status: string;
  presence_state: 'ACTIVE' | 'NONE';
  attended_count: number;
  cutting_count: number;
  total_subjects: number;
  compliance_rate: number;
  subjects: StudentSubjectStatus[];
}

// Security check: blocks unsafe image URLs
const isSafeImageUrl = (url?: string | null): boolean => {
  if (!url || typeof url !== 'string') return false;
  const clean = url.trim().toLowerCase();
  if (!clean || clean === 'null' || clean === 'undefined' || clean === 'none') return false;
  if (clean.startsWith('javascript:') || clean.startsWith('vbscript:')) return false;
  if (clean.startsWith('data:') && !clean.startsWith('data:image/')) return false;
  return (
    clean.startsWith('http://') ||
    clean.startsWith('https://') ||
    clean.startsWith('/') ||
    clean.startsWith('data:image/') ||
    clean.startsWith('blob:')
  );
};

export const AdvisorySubjectMonitor: React.FC = () => {
  const { tokens, brand } = useTheme();

  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [search, setSearch] = useState('');
  const [filterMode, setFilterMode] = useState<'ALL' | 'CUTTING' | 'ABSENT'>('ALL');

  const [hasAdvisoryClass, setHasAdvisoryClass] = useState(false);
  const [selectedSectionId, setSelectedSectionId] = useState<number | null>(null);
  const [availableSections, setAvailableSections] = useState<AvailableSection[]>([]);
  const [isAdviserOfSection, setIsAdviserOfSection] = useState(false);
  const [schedules, setSchedules] = useState<SubjectHeader[]>([]);
  const [matrix, setMatrix] = useState<StudentMatrixRow[]>([]);

  const abortControllerRef = useRef<AbortController | null>(null);

  const fetchMatrixData = useCallback(
    async (targetSectionId?: number | null, silent = false) => {
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
      }
      abortControllerRef.current = new AbortController();

      if (!silent) setLoading(true);
      else setRefreshing(true);

      try {
        const params: Record<string, any> = {};
        if (targetSectionId) {
          params.section_id = targetSectionId;
        }

        const res = await apiClient.get('classroom/adviser-matrix/', {
          params,
          signal: abortControllerRef.current.signal,
        });

        if (res.data) {
          const sectionsList: AvailableSection[] = res.data.available_sections || [];
          setAvailableSections(sectionsList);

          if (res.data.has_advisory_class) {
            setHasAdvisoryClass(true);
            setSelectedSectionId(res.data.section_id || null);
            setIsAdviserOfSection(Boolean(res.data.is_adviser));
            setSchedules(res.data.schedules || []);
            setMatrix(res.data.matrix || []);
          } else {
            setHasAdvisoryClass(false);
            setMatrix([]);
            setSchedules([]);
          }
        }
      } catch (err: any) {
        if (err.name !== 'CanceledError' && err.code !== 'ERR_CANCELED') {
          console.error('Failed to load subject attendance matrix:', err);
        }
      } finally {
        setLoading(false);
        setRefreshing(false);
      }
    },
    []
  );

  useEffect(() => {
    fetchMatrixData(null);
    return () => {
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
      }
    };
  }, [fetchMatrixData]);

  const handleSectionChange = (newSectionId: number) => {
    setSelectedSectionId(newSectionId);
    fetchMatrixData(newSectionId, false);
  };

  const sanitizedSearch = useMemo(() => {
    return search.trim().toLowerCase().slice(0, 50);
  }, [search]);

  const filteredMatrix = useMemo(() => {
    return matrix.filter((row) => {
      const matchSearch =
        sanitizedSearch === '' ||
        row.student_name.toLowerCase().includes(sanitizedSearch) ||
        row.lrn.includes(sanitizedSearch);

      if (!matchSearch) return false;

      if (filterMode === 'CUTTING') {
        return row.cutting_count > 0;
      }
      if (filterMode === 'ABSENT') {
        return row.attended_count === 0;
      }
      return true;
    });
  }, [matrix, sanitizedSearch, filterMode]);

  const summaryMetrics = useMemo(() => {
    const total = matrix.length;
    const cutting = matrix.filter((m) => m.cutting_count > 0).length;
    const complete = matrix.filter(
      (m) => m.attended_count === m.total_subjects && m.total_subjects > 0
    ).length;
    return { total, cutting, complete };
  }, [matrix]);

  const getInitials = (name: string) => {
    const parts = name.replace(/,/g, '').trim().split(/\s+/).filter(Boolean);
    if (parts.length >= 2) return `${parts[0][0]}${parts[1][0]}`.toUpperCase();
    return name.slice(0, 2).toUpperCase();
  };

  const renderStatusPill = (status: string, time: string) => {
    switch (status) {
      case 'PRESENT':
        return (
          <span
            style={{
              ...badgeStyle,
              backgroundColor: 'rgba(16, 185, 129, 0.12)',
              color: brand.success,
            }}
            title={time ? `Scanned at ${time}` : 'Present'}
          >
            <CheckCircle2 size={11} /> Present
          </span>
        );
      case 'LATE':
        return (
          <span
            style={{
              ...badgeStyle,
              backgroundColor: 'rgba(245, 158, 11, 0.12)',
              color: brand.warning,
            }}
            title={time ? `Late at ${time}` : 'Late'}
          >
            <Clock size={11} /> Late
          </span>
        );
      case 'CUTTING':
        return (
          <span
            style={{
              ...badgeStyle,
              backgroundColor: 'rgba(239, 68, 68, 0.14)',
              color: brand.danger,
              fontWeight: 900,
            }}
            title="Loafing Alert: Student attended another subject today but missed this period"
          >
            <AlertTriangle size={11} /> Loafing / Cutting
          </span>
        );
      default:
        return (
          <span
            style={{
              ...badgeStyle,
              backgroundColor: tokens.bgSurfaceSubtle,
              color: tokens.textMuted,
            }}
            title="Not scanned in this period"
          >
            —
          </span>
        );
    }
  };

  if (loading && !refreshing) {
    return (
      <div style={{ padding: 48, textAlign: 'center', color: tokens.textMuted }}>
        <RefreshCw
          size={24}
          className="animate-spin"
          style={{ margin: '0 auto 8px auto', display: 'block', color: brand.primary }}
        />
        <span style={{ fontSize: '0.86rem', fontWeight: 600 }}>
          Loading class list attendance and loafing monitor...
        </span>
      </div>
    );
  }

  if (!hasAdvisoryClass && availableSections.length === 0) {
    return (
      <div
        style={{
          backgroundColor: tokens.bgSurface,
          borderRadius: 14,
          border: `1px dashed ${tokens.borderStrong}`,
          padding: 48,
          textAlign: 'center',
        }}
      >
        <Info size={36} color={tokens.textMuted} style={{ margin: '0 auto 12px auto' }} />
        <h3 style={{ fontSize: '1rem', fontWeight: 800, color: tokens.textPrimary, margin: 0 }}>
          No Assigned Class Section Found
        </h3>
        <p
          style={{
            fontSize: '0.78rem',
            color: tokens.textSecondary,
            maxWidth: 420,
            margin: '6px auto 16px auto',
          }}
        >
          Your account is not registered as a Class Adviser or assigned to any subject
          schedules. Contact your school administrator to link your faculty account to a
          section.
        </p>
        <button
          type="button"
          onClick={() => fetchMatrixData(null, false)}
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: 6,
            padding: '8px 16px',
            backgroundColor: brand.primary,
            color: '#ffffff',
            borderRadius: 8,
            border: 'none',
            fontWeight: 700,
            cursor: 'pointer',
          }}
        >
          <RefreshCw size={14} /> Refresh Class Assignment
        </button>
      </div>
    );
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14, width: '100%' }}>
      {/* 1. Header Toolbar with Section Selector */}
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          flexWrap: 'wrap',
          gap: 12,
          padding: '12px 18px',
          backgroundColor: tokens.bgSurface,
          borderRadius: 14,
          border: `1px solid ${tokens.borderSubtle}`,
          boxShadow: tokens.cardShadow,
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <div
            style={{
              width: 36,
              height: 36,
              borderRadius: 8,
              backgroundColor: tokens.primaryLight,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <BookOpen size={18} color={brand.primary} />
          </div>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <h2
                style={{
                  fontSize: '1.02rem',
                  fontWeight: 800,
                  color: tokens.textPrimary,
                  margin: 0,
                }}
              >
                Classroom Attendance &amp; Loafing Monitor
              </h2>
              {isAdviserOfSection && (
                <span
                  style={{
                    fontSize: '0.66rem',
                    fontWeight: 800,
                    padding: '2px 8px',
                    borderRadius: 6,
                    backgroundColor: 'rgba(0, 75, 135, 0.1)',
                    color: brand.primary,
                  }}
                >
                  Class Adviser
                </span>
              )}
            </div>

            {/* Section Selector Dropdown */}
            {availableSections.length > 0 && (
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 4 }}>
                <span style={{ fontSize: '0.72rem', color: tokens.textSecondary }}>Section:</span>
                <div style={{ position: 'relative', display: 'inline-block' }}>
                  <select
                    value={selectedSectionId || ''}
                    onChange={(e) => handleSectionChange(Number(e.target.value))}
                    style={{
                      appearance: 'none',
                      WebkitAppearance: 'none',
                      padding: '3px 24px 3px 8px',
                      borderRadius: 6,
                      border: `1px solid ${tokens.borderStrong}`,
                      backgroundColor: tokens.bgSurfaceSubtle,
                      fontSize: '0.72rem',
                      fontWeight: 700,
                      color: tokens.textPrimary,
                      cursor: 'pointer',
                      outline: 'none',
                    }}
                  >
                    {availableSections.map((sec) => (
                      <option key={sec.id} value={sec.id}>
                        {sec.grade_level} - {sec.name} {sec.is_adviser ? '(Advisory)' : ''}
                      </option>
                    ))}
                  </select>
                  <ChevronDown
                    size={12}
                    color={tokens.textMuted}
                    style={{
                      position: 'absolute',
                      right: 6,
                      top: '50%',
                      transform: 'translateY(-50%)',
                      pointerEvents: 'none',
                    }}
                  />
                </div>
                <span style={{ fontSize: '0.70rem', color: tokens.textMuted }}>
                  &bull; Class List: <strong>{summaryMetrics.total}</strong> students
                </span>
              </div>
            )}
          </div>
        </div>

        {/* Filter Buttons & Sync */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
          <button
            type="button"
            onClick={() => setFilterMode('ALL')}
            style={filterBtn(filterMode === 'ALL', brand.primary, tokens)}
          >
            All Students ({summaryMetrics.total})
          </button>
          <button
            type="button"
            onClick={() => setFilterMode('CUTTING')}
            style={filterBtn(filterMode === 'CUTTING', brand.danger, tokens)}
          >
            Loafing / Cutting ({summaryMetrics.cutting})
          </button>
          <button
            type="button"
            onClick={() => fetchMatrixData(selectedSectionId, true)}
            disabled={refreshing}
            style={refreshBtn(tokens)}
            title="Refresh Attendance"
          >
            <RefreshCw size={13} className={refreshing ? 'animate-spin' : ''} />
            <span>Refresh</span>
          </button>
        </div>
      </div>

      {/* 2. Search & Summary Badges */}
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          gap: 12,
          flexWrap: 'wrap',
        }}
      >
        <div style={{ position: 'relative', width: '100%', maxWidth: 280 }}>
          <Search
            size={14}
            color={tokens.textMuted}
            style={{
              position: 'absolute',
              left: 10,
              top: '50%',
              transform: 'translateY(-50%)',
            }}
          />
          <input
            type="text"
            placeholder="Search student name or LRN..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            style={searchInput(tokens)}
          />
        </div>

        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
          <span style={statBadge(brand.success)}>
            {summaryMetrics.complete} Complete Attendance Today
          </span>
          {summaryMetrics.cutting > 0 && (
            <span style={statBadge(brand.danger)}>
              {summaryMetrics.cutting} Flagged Loafing / Cutting
            </span>
          )}
        </div>
      </div>

      {/* 3. Cross-Subject Attendance & Loafing Matrix Table */}
      <div
        style={{
          backgroundColor: tokens.bgSurface,
          borderRadius: 14,
          border: `1px solid ${tokens.borderSubtle}`,
          boxShadow: tokens.cardShadow,
          overflowX: 'auto',
        }}
      >
        <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', minWidth: 860 }}>
          <thead>
            <tr
              style={{
                backgroundColor: tokens.bgSurfaceSubtle,
                borderBottom: `1px solid ${tokens.borderSubtle}`,
              }}
            >
              <th style={{ ...thStyle, width: 44, textAlign: 'center' }}>#</th>
              <th style={{ ...thStyle, width: 220 }}>Student</th>
              <th style={{ ...thStyle, width: 150 }}>First Seen Today</th>
              {schedules.map((sched) => (
                <th key={sched.schedule_id} style={{ ...thStyle, textAlign: 'center' }}>
                  <div style={{ fontWeight: 800, color: brand.primary }}>{sched.subject_code}</div>
                  <div style={{ fontSize: '0.62rem', color: tokens.textMuted, fontWeight: 500 }}>
                    {sched.time_window}
                  </div>
                  <div style={{ fontSize: '0.58rem', color: tokens.textSecondary }}>
                    {sched.faculty_name}
                  </div>
                </th>
              ))}
              <th style={{ ...thStyle, width: 110, textAlign: 'center' }}>Attendance</th>
            </tr>
          </thead>
          <tbody>
            {filteredMatrix.length > 0 ? (
              filteredMatrix.map((row) => (
                <tr
                  key={row.student_id}
                  style={{
                    borderBottom: `1px solid ${tokens.borderSubtle}`,
                    backgroundColor:
                      row.cutting_count > 0 ? 'rgba(239, 68, 68, 0.03)' : 'transparent',
                  }}
                >
                  <td
                    style={{
                      ...tdStyle,
                      textAlign: 'center',
                      fontWeight: 800,
                      color: tokens.textMuted,
                      fontFamily: 'monospace',
                    }}
                  >
                    {row.number}
                  </td>

                  <td style={tdStyle}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                      <div style={avatarCircle}>
                        {isSafeImageUrl(row.photo_url) ? (
                          <img
                            src={row.photo_url!}
                            alt={row.student_name}
                            style={avatarImg}
                          />
                        ) : (
                          <span
                            style={{
                              fontSize: '0.72rem',
                              fontWeight: 800,
                              color: brand.primary,
                            }}
                          >
                            {getInitials(row.student_name)}
                          </span>
                        )}
                      </div>
                      <div style={{ minWidth: 0 }}>
                        <strong
                          style={{
                            fontSize: '0.82rem',
                            color: tokens.textPrimary,
                            display: 'block',
                          }}
                        >
                          {row.student_name}
                        </strong>
                        <span
                          style={{
                            fontSize: '0.68rem',
                            color: tokens.textMuted,
                            fontFamily: 'monospace',
                          }}
                        >
                          LRN: {row.lrn}
                        </span>
                      </div>
                    </div>
                  </td>

                  <td style={tdStyle}>
                    <span
                      style={{
                        fontSize: '0.70rem',
                        fontWeight: 700,
                        color:
                          row.presence_state === 'ACTIVE'
                            ? brand.success
                            : tokens.textMuted,
                      }}
                    >
                      {row.campus_status}
                    </span>
                  </td>

                  {row.subjects.map((sub) => (
                    <td key={sub.schedule_id} style={{ ...tdStyle, textAlign: 'center' }}>
                      {renderStatusPill(sub.status, sub.time)}
                    </td>
                  ))}

                  <td style={{ ...tdStyle, textAlign: 'center' }}>
                    <div
                      style={{
                        fontSize: '0.78rem',
                        fontWeight: 800,
                        color: row.compliance_rate >= 80 ? brand.success : brand.danger,
                      }}
                    >
                      {row.attended_count} / {row.total_subjects}
                    </div>
                    <div style={{ fontSize: '0.62rem', color: tokens.textMuted }}>
                      {row.compliance_rate}% Attended
                    </div>
                  </td>
                </tr>
              ))
            ) : (
              <tr>
                <td
                  colSpan={4 + schedules.length}
                  style={{
                    padding: 36,
                    textAlign: 'center',
                    color: tokens.textMuted,
                    fontSize: '0.80rem',
                  }}
                >
                  No student records match the current filter.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
};

// Styles
const thStyle: React.CSSProperties = {
  padding: '10px 12px',
  fontSize: '0.70rem',
  fontWeight: 800,
  color: '#475569',
  letterSpacing: '0.3px',
};

const tdStyle: React.CSSProperties = {
  padding: '10px 12px',
  fontSize: '0.78rem',
  verticalAlign: 'middle',
};

const avatarCircle: React.CSSProperties = {
  width: 32,
  height: 32,
  borderRadius: '50%',
  backgroundColor: 'rgba(0, 75, 135, 0.1)',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  overflow: 'hidden',
  flexShrink: 0,
};

const avatarImg: React.CSSProperties = {
  width: '100%',
  height: '100%',
  objectFit: 'cover',
};

const badgeStyle: React.CSSProperties = {
  display: 'inline-flex',
  alignItems: 'center',
  gap: 3,
  padding: '2px 8px',
  borderRadius: 6,
  fontSize: '0.66rem',
  fontWeight: 700,
};

const searchInput = (tokens: any): React.CSSProperties => ({
  width: '100%',
  padding: '7px 10px 7px 30px',
  borderRadius: 8,
  border: `1px solid ${tokens.borderStrong}`,
  backgroundColor: tokens.bgSurface,
  fontSize: '0.76rem',
  color: tokens.textPrimary,
  outline: 'none',
  boxSizing: 'border-box',
});

const filterBtn = (active: boolean, color: string, tokens: any): React.CSSProperties => ({
  padding: '6px 12px',
  borderRadius: 8,
  fontSize: '0.72rem',
  fontWeight: 700,
  cursor: 'pointer',
  border: `1px solid ${active ? color : tokens.borderStrong}`,
  backgroundColor: active ? color : tokens.bgSurfaceSubtle,
  color: active ? '#ffffff' : tokens.textSecondary,
});

const refreshBtn = (tokens: any): React.CSSProperties => ({
  display: 'inline-flex',
  alignItems: 'center',
  gap: 4,
  padding: '6px 10px',
  borderRadius: 8,
  border: `1px solid ${tokens.borderStrong}`,
  backgroundColor: tokens.bgSurfaceSubtle,
  fontSize: '0.72rem',
  fontWeight: 700,
  color: tokens.textSecondary,
  cursor: 'pointer',
});

const statBadge = (color: string): React.CSSProperties => ({
  padding: '4px 10px',
  borderRadius: 6,
  fontSize: '0.70rem',
  fontWeight: 700,
  backgroundColor: `${color}15`,
  color,
});

export default AdvisorySubjectMonitor;