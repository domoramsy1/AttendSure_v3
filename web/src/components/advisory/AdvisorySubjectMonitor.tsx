/**
 * AttendSure V3 - Class Adviser Subject Attendance Monitor
 * File: web/src/components/advisory/AdvisorySubjectMonitor.tsx
 */

import React, { useState, useEffect, useCallback, useMemo } from 'react';
import apiClient from '../../api/client';
import { useTheme } from '../../context/ThemeContext';
import {
  AlertTriangle,
  RefreshCw,
  Search,
  BookOpen,
  CheckCircle2,
  Clock,
  User,
} from 'lucide-react';

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
  gate_status: string;
  gate_direction: 'IN' | 'OUT' | 'NONE';
  attended_count: number;
  cutting_count: number;
  total_subjects: number;
  compliance_rate: number;
  subjects: StudentSubjectStatus[];
}

export const AdvisorySubjectMonitor: React.FC = () => {
  const { tokens, brand } = useTheme();

  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [search, setSearch] = useState('');
  const [filterMode, setFilterMode] = useState<'ALL' | 'CUTTING' | 'ABSENT'>('ALL');

  const [sectionName, setSectionName] = useState('');
  const [gradeLevel, setGradeLevel] = useState('');
  const [schedules, setSchedules] = useState<SubjectHeader[]>([]);
  const [matrix, setMatrix] = useState<StudentMatrixRow[]>([]);

  const fetchMatrixData = useCallback(async (silent = false) => {
    if (!silent) setLoading(true);
    else setRefreshing(true);

    try {
      const res = await apiClient.get('/classroom/adviser-matrix/');
      if (res.data?.has_advisory_class) {
        setSectionName(res.data.section_name);
        setGradeLevel(res.data.grade_level);
        setSchedules(res.data.schedules || []);
        setMatrix(res.data.matrix || []);
      }
    } catch (err) {
      console.error('Failed to load adviser attendance matrix:', err);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    fetchMatrixData();
  }, [fetchMatrixData]);

  // Filter matrix by student name / LRN and status tabs
  const filteredMatrix = useMemo(() => {
    return matrix.filter((row) => {
      const matchSearch =
        row.student_name.toLowerCase().includes(search.toLowerCase()) ||
        row.lrn.includes(search);

      if (!matchSearch) return false;

      if (filterMode === 'CUTTING') {
        return row.cutting_count > 0;
      }
      if (filterMode === 'ABSENT') {
        return row.attended_count === 0;
      }
      return true;
    });
  }, [matrix, search, filterMode]);

  const summaryMetrics = useMemo(() => {
    const total = matrix.length;
    const cutting = matrix.filter((m) => m.cutting_count > 0).length;
    const perfect = matrix.filter((m) => m.attended_count === m.total_subjects && m.total_subjects > 0).length;
    return { total, cutting, perfect };
  }, [matrix]);

  const renderStatusPill = (status: string, time: string) => {
    switch (status) {
      case 'PRESENT':
        return (
          <span style={{ ...badgeStyle, backgroundColor: 'rgba(16, 185, 129, 0.12)', color: brand.success }} title={time || 'Present'}>
            <CheckCircle2 size={11} /> Present
          </span>
        );
      case 'LATE':
        return (
          <span style={{ ...badgeStyle, backgroundColor: 'rgba(245, 158, 11, 0.12)', color: brand.warning }} title={time || 'Late'}>
            <Clock size={11} /> Late
          </span>
        );
      case 'CUTTING':
        return (
          <span style={{ ...badgeStyle, backgroundColor: 'rgba(239, 68, 68, 0.14)', color: brand.danger, fontWeight: 900 }} title="Flagged: Missing from subject">
            <AlertTriangle size={11} /> Cutting
          </span>
        );
      case 'UNVERIFIED':
        return (
          <span style={{ ...badgeStyle, backgroundColor: '#f1f5f9', color: '#64748b' }} title="No Gate Entrance Logged">
            Unverified
          </span>
        );
      default:
        return (
          <span style={{ ...badgeStyle, backgroundColor: tokens.bgSurfaceSubtle, color: tokens.textMuted }}>
            —
          </span>
        );
    }
  };

  if (loading) {
    return (
      <div style={{ padding: 48, textAlign: 'center', color: tokens.textMuted }}>
        <RefreshCw size={24} className="animate-spin" style={{ margin: '0 auto 8px auto', display: 'block', color: brand.primary }} />
        <span>Loading adviser subject attendance matrix...</span>
      </div>
    );
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14, width: '100%' }}>
      {/* 1. Header Toolbar */}
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
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <div style={{ width: 32, height: 32, borderRadius: 8, backgroundColor: tokens.primaryLight, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <BookOpen size={18} color={brand.primary} />
            </div>
            <div>
              <h2 style={{ fontSize: '1rem', fontWeight: 800, color: tokens.textPrimary, margin: 0 }}>
                Advisory Subject Attendance Monitor
              </h2>
              <span style={{ fontSize: '0.72rem', color: tokens.textSecondary }}>
                Advisory Class: <strong>{gradeLevel} - {sectionName}</strong> ({summaryMetrics.total} Enrolled Learners)
              </span>
            </div>
          </div>
        </div>

        {/* Status Filter Tabs */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <button
            type="button"
            onClick={() => setFilterMode('ALL')}
            style={filterBtn(filterMode === 'ALL', brand.primary, tokens)}
          >
            All Advisees ({summaryMetrics.total})
          </button>
          <button
            type="button"
            onClick={() => setFilterMode('CUTTING')}
            style={filterBtn(filterMode === 'CUTTING', brand.danger, tokens)}
          >
            Cutting Subjects ({summaryMetrics.cutting})
          </button>
          <button
            type="button"
            onClick={() => fetchMatrixData(true)}
            disabled={refreshing}
            style={refreshBtn(tokens)}
            title="Refresh Subject Attendance"
          >
            <RefreshCw size={13} className={refreshing ? 'animate-spin' : ''} />
            <span>Sync</span>
          </button>
        </div>
      </div>

      {/* 2. Search & Overview Metric Strip */}
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          gap: 12,
          flexWrap: 'wrap',
        }}
      >
        <div style={{ position: 'relative', width: 280 }}>
          <Search size={14} color={tokens.textMuted} style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)' }} />
          <input
            type="text"
            placeholder="Search advisee name or LRN..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            style={searchInput(tokens)}
          />
        </div>

        <div style={{ display: 'flex', gap: 10 }}>
          <span style={statBadge(brand.success)}>
            {summaryMetrics.perfect} Complete Attendance Today
          </span>
          {summaryMetrics.cutting > 0 && (
            <span style={statBadge(brand.danger)}>
              {summaryMetrics.cutting} Flagged Skipping Class
            </span>
          )}
        </div>
      </div>

      {/* 3. Comprehensive Subject Attendance Matrix Table */}
      <div
        style={{
          backgroundColor: tokens.bgSurface,
          borderRadius: 14,
          border: `1px solid ${tokens.borderSubtle}`,
          boxShadow: tokens.cardShadow,
          overflowX: 'auto',
        }}
      >
        <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', minWidth: 840 }}>
          <thead>
            <tr style={{ backgroundColor: tokens.bgSurfaceSubtle, borderBottom: `1px solid ${tokens.borderSubtle}` }}>
              <th style={{ ...thStyle, width: 44, textAlign: 'center' }}>#</th>
              <th style={{ ...thStyle, width: 220 }}>Advisee Information</th>
              <th style={{ ...thStyle, width: 140 }}>Campus Gate</th>
              {schedules.map((sched) => (
                <th key={sched.schedule_id} style={{ ...thStyle, textAlign: 'center' }}>
                  <div style={{ fontWeight: 800, color: brand.primary }}>{sched.subject_code}</div>
                  <div style={{ fontSize: '0.62rem', color: tokens.textMuted, fontWeight: 500 }}>{sched.time_window}</div>
                  <div style={{ fontSize: '0.58rem', color: tokens.textSecondary }}>{sched.faculty_name}</div>
                </th>
              ))}
              <th style={{ ...thStyle, width: 110, textAlign: 'center' }}>Compliance</th>
            </tr>
          </thead>
          <tbody>
            {filteredMatrix.length > 0 ? (
              filteredMatrix.map((row) => (
                <tr
                  key={row.student_id}
                  style={{
                    borderBottom: `1px solid ${tokens.borderSubtle}`,
                    backgroundColor: row.cutting_count > 0 ? 'rgba(239, 68, 68, 0.02)' : 'transparent',
                  }}
                >
                  {/* Sequence Number */}
                  <td style={{ ...tdStyle, textAlign: 'center', fontWeight: 800, color: tokens.textMuted }}>
                    {row.number}
                  </td>

                  {/* Student Details with Photo */}
                  <td style={tdStyle}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                      <div style={avatarCircle}>
                        {row.photo_url ? (
                          <img src={row.photo_url} alt={row.student_name} style={avatarImg} />
                        ) : (
                          <User size={18} color="#004b87" />
                        )}
                      </div>
                      <div style={{ minWidth: 0 }}>
                        <strong style={{ fontSize: '0.82rem', color: tokens.textPrimary, display: 'block' }}>
                          {row.student_name}
                        </strong>
                        <span style={{ fontSize: '0.68rem', color: tokens.textMuted, fontFamily: 'monospace' }}>
                          LRN: {row.lrn}
                        </span>
                      </div>
                    </div>
                  </td>

                  {/* Campus Gate Entry/Exit Status */}
                  <td style={tdStyle}>
                    <span
                      style={{
                        fontSize: '0.70rem',
                        fontWeight: 700,
                        color: row.gate_direction === 'IN' ? brand.success : (row.gate_direction === 'OUT' ? brand.danger : tokens.textMuted),
                      }}
                    >
                      {row.gate_status}
                    </span>
                  </td>

                  {/* Dynamic Subject Status Columns */}
                  {row.subjects.map((sub) => (
                    <td key={sub.schedule_id} style={{ ...tdStyle, textAlign: 'center' }}>
                      {renderStatusPill(sub.status, sub.time)}
                    </td>
                  ))}

                  {/* Overall Class Compliance Progress */}
                  <td style={{ ...tdStyle, textAlign: 'center' }}>
                    <div style={{ fontSize: '0.78rem', fontWeight: 800, color: row.compliance_rate >= 80 ? brand.success : brand.danger }}>
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
                <td colSpan={4 + schedules.length} style={{ padding: 36, textAlign: 'center', color: tokens.textMuted, fontSize: '0.80rem' }}>
                  No advisee attendance records match the selected filter.
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