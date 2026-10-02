import React, { useEffect, useState, useCallback } from 'react';
import apiClient from '../../api/client';
import { 
  CheckCircle2, 
  AlertCircle, 
  Radio, 
  Clock, 
  RefreshCw, 
  Calendar, 
  Users, 
  BarChart3, 
  Loader2 
} from 'lucide-react';

interface DashboardStats {
  academic_year: string;
  gate_node_online: boolean;
  turnstiles_active: boolean;
  telemetry_status: string;
  present_learners: number;
  total_enrolled: number;
  unexcused_absences: number;
  gate_throughput: number;
  faculty_dtr_percentage: number;
  total_faculty: number;
  faculty_tapped_today: number;
  influx_distribution: { hour: string; count: number }[];
  section_attendance: { section_id: number; section_name: string; enrolled: number; present: number; rate: number }[];
}

interface DashboardViewProps {
  onGateStatusChange?: (online: boolean) => void;
}

export const DashboardView: React.FC<DashboardViewProps> = ({ onGateStatusChange }) => {
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [sectionFilter, setSectionFilter] = useState<'SECTIONS' | 'TOP'>('SECTIONS');

  const fetchStats = useCallback(async (isManual = false) => {
    if (isManual) setRefreshing(true);
    try {
      const res = await apiClient.get<DashboardStats>('/dashboard/overview/');
      setStats(res.data);
      if (onGateStatusChange) {
        onGateStatusChange(res.data.gate_node_online);
      }
    } catch (err) {
      console.error('Failed to load dashboard metrics:', err);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [onGateStatusChange]);

  useEffect(() => {
    fetchStats();
    const interval = setInterval(() => fetchStats(), 15000);
    return () => clearInterval(interval);
  }, [fetchStats]);

  if (loading) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', gap: 10, color: '#64748b' }}>
        <Loader2 className="animate-spin" size={24} color="#0284c7" />
        <span style={{ fontWeight: 600 }}>Loading AttendSure overview metrics...</span>
      </div>
    );
  }

  return (
    <div className="dashboard-viewport">
      <style>{`
        .dashboard-viewport {
          height: 100%;
          width: 100%;
          display: flex;
          flex-direction: column;
          padding: 16px 24px;
          box-sizing: border-box;
          overflow: hidden;
          text-align: left;
        }

        /* 4 Cards Grid - minmax(0, 1fr) prevents container blowout */
        .metrics-grid {
          display: grid;
          grid-template-columns: repeat(4, minmax(0, 1fr));
          gap: 14px;
          margin-bottom: 14px;
          flex-shrink: 0;
          width: 100%;
        }

        /* Bottom 2 Panels Grid */
        .panels-grid {
          display: grid;
          grid-template-columns: repeat(2, minmax(0, 1fr));
          gap: 14px;
          flex: 1;
          min-height: 0; /* Critical for flex container child sizing */
          width: 100%;
        }

        @media (max-width: 1200px) {
          .metrics-grid {
            grid-template-columns: repeat(2, minmax(0, 1fr));
          }
          .dashboard-viewport {
            overflow-y: auto;
          }
          .panels-grid {
            min-height: 240px;
          }
        }

        @media (max-width: 640px) {
          .metrics-grid {
            grid-template-columns: 1fr;
          }
          .panels-grid {
            grid-template-columns: 1fr;
          }
        }
      `}</style>

      {/* Top Banner: Status & School Year */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12, flexShrink: 0 }}>
        <div
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: 6,
            padding: '3px 12px',
            backgroundColor: '#e0f2fe',
            color: '#0369a1',
            borderRadius: '20px',
            fontSize: '0.72rem',
            fontWeight: 700,
            letterSpacing: '0.3px',
          }}
        >
          <span style={{ width: 6, height: 6, borderRadius: '50%', backgroundColor: '#0284c7' }} />
          {stats?.telemetry_status || 'WAITING FOR GATE TAPS'}
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <div
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 6,
              padding: '4px 12px',
              backgroundColor: '#ffffff',
              border: '1px solid #e2e8f0',
              borderRadius: '6px',
              fontSize: '0.75rem',
              fontWeight: 700,
              color: '#334155',
            }}
          >
            <Calendar size={13} color="#64748b" />
            <span>{stats?.academic_year || 'S.Y. 2026 - 2027'}</span>
          </div>

          <button
            onClick={() => fetchStats(true)}
            disabled={refreshing}
            title="Refresh statistics"
            style={{
              padding: '4px 8px',
              backgroundColor: '#ffffff',
              border: '1px solid #e2e8f0',
              borderRadius: '6px',
              cursor: 'pointer',
              color: '#64748b',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <RefreshCw size={13} className={refreshing ? 'animate-spin' : ''} />
          </button>
        </div>
      </div>

      {/* Main Left-Aligned Heading */}
      <div style={{ marginBottom: 14, flexShrink: 0, textAlign: 'left' }}>
        <h1 style={{ margin: 0, fontSize: '1.4rem', fontWeight: 800, color: '#0f172a', lineHeight: 1.2 }}>
          Attendance Overview
        </h1>
        <p style={{ margin: '3px 0 0 0', fontSize: '0.82rem', color: '#64748b' }}>
          Live gate check-ins, classroom attendance, and staff time records.
        </p>
      </div>

      {/* Responsive 4-Stat Cards Grid */}
      <div className="metrics-grid">
        <div style={cardStyle}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={metricLabelStyle}>STUDENTS IN SCHOOL</span>
            <div style={{ backgroundColor: '#ecfdf5', padding: 3, borderRadius: '50%', color: '#10b981' }}>
              <CheckCircle2 size={15} />
            </div>
          </div>
          <div style={metricValueStyle}>{stats?.present_learners ?? 0}</div>
          <div style={dividerStyle} />
          <div style={metricSubtextStyle}>
            {stats && stats.present_learners > 0
              ? `${stats.present_learners} of ${stats.total_enrolled} enrolled active`
              : 'Waiting for student gate transactions'}
          </div>
        </div>

        <div style={cardStyle}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={metricLabelStyle}>ABSENT STUDENTS</span>
            <div style={{ backgroundColor: '#fef2f2', padding: 3, borderRadius: '50%', color: '#ef4444' }}>
              <AlertCircle size={15} />
            </div>
          </div>
          <div style={metricValueStyle}>{stats?.unexcused_absences ?? 0}</div>
          <div style={dividerStyle} />
          <div style={metricSubtextStyle}>
            {stats && stats.unexcused_absences > 0
              ? `${stats.unexcused_absences} flagged in SMS outbox`
              : 'Parent SMS notifications idle'}
          </div>
        </div>

        <div style={cardStyle}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={metricLabelStyle}>TOTAL GATE SCANS</span>
            <div style={{ backgroundColor: '#f0f9ff', padding: 3, borderRadius: '50%', color: '#0284c7' }}>
              <Radio size={15} />
            </div>
          </div>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 6, margin: '5px 0 6px 0' }}>
            <span style={{ fontSize: '1.6rem', fontWeight: 800, color: '#0f172a' }}>
              {stats?.gate_throughput ?? 0}
            </span>
            <span style={{ fontSize: '0.75rem', color: '#64748b', fontWeight: 600 }}>scans today</span>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 4 }}>
            <span
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: 4,
                padding: '2px 7px',
                borderRadius: '10px',
                fontSize: '0.65rem',
                fontWeight: 600,
                backgroundColor: stats?.turnstiles_active ? '#ecfdf5' : '#f1f5f9',
                color: stats?.turnstiles_active ? '#059669' : '#64748b',
              }}
            >
              <span
                style={{
                  width: 5,
                  height: 5,
                  borderRadius: '50%',
                  backgroundColor: stats?.turnstiles_active ? '#10b981' : '#94a3b8',
                }}
              />
              {stats?.turnstiles_active ? 'Gate Readers Online' : 'Gate Readers Offline'}
            </span>
          </div>
          <div style={metricSubtextStyle}>Card taps and QR scans</div>
        </div>

        <div style={cardStyle}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={metricLabelStyle}>TEACHER DTR (FORM 48)</span>
            <div style={{ backgroundColor: '#faf5ff', padding: 3, borderRadius: '50%', color: '#a855f7' }}>
              <Clock size={15} />
            </div>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, margin: '5px 0 8px 0' }}>
            <span style={{ fontSize: '1.6rem', fontWeight: 800, color: '#0f172a' }}>
              {stats?.faculty_dtr_percentage ?? 0}%
            </span>
            <span
              style={{
                backgroundColor: '#f3e8ff',
                color: '#7e22ce',
                padding: '2px 6px',
                borderRadius: '4px',
                fontSize: '0.68rem',
                fontWeight: 700,
              }}
            >
              Form 48
            </span>
          </div>
          <div style={dividerStyle} />
          <div style={metricSubtextStyle}>
            {stats && stats.total_faculty > 0
              ? `${stats.faculty_tapped_today} of ${stats.total_faculty} faculty verified`
              : 'No faculty registered'}
          </div>
        </div>
      </div>

      {/* Bottom Panels - Fills Remaining Vertical Space */}
      <div className="panels-grid">
        {/* Panel 1: Influx Distribution */}
        <div style={panelCardStyle}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 8, flexShrink: 0 }}>
            <div>
              <h3 style={{ margin: 0, fontSize: '0.92rem', fontWeight: 800, color: '#0f172a' }}>
                Arrivals by Hour
              </h3>
              <div style={{ fontSize: '0.72rem', color: '#64748b', marginTop: 1 }}>
                Arrival volume recorded across turnstiles today
              </div>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: '0.68rem', color: '#475569', fontWeight: 600 }}>
              <span style={{ width: 8, height: 8, backgroundColor: '#0284c7', borderRadius: 2 }} />
              <span>Total Taps</span>
            </div>
          </div>

          <div style={{ flex: 1, minHeight: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            {stats && stats.influx_distribution.length > 0 ? (
              <div style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'flex-end', gap: 6, padding: '4px 0' }}>
                {stats.influx_distribution.map((item, i) => (
                  <div key={i} style={{ flex: 1, height: '100%', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'flex-end', gap: 4 }}>
                    <div
                      style={{
                        width: '100%',
                        backgroundColor: '#0284c7',
                        borderRadius: '3px 3px 0 0',
                        height: `${Math.min(item.count * 15, 100)}%`,
                        minHeight: '6px',
                      }}
                    />
                    <span style={{ fontSize: '0.62rem', color: '#64748b' }}>{item.hour}</span>
                  </div>
                ))}
              </div>
            ) : (
              <div style={emptyStateContainerStyle}>
                <BarChart3 size={32} color="#cbd5e1" />
                <div style={{ fontWeight: 700, fontSize: '0.85rem', color: '#1e293b', marginTop: 6 }}>
                  No Gate Check-ins Yet Today
                </div>
                <div style={{ fontSize: '0.72rem', color: '#94a3b8', maxWidth: 300, marginTop: 2 }}>
                  Numbers update automatically as students tap at the entrance.
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Panel 2: Section Attendance */}
        <div style={panelCardStyle}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 8, flexShrink: 0 }}>
            <div>
              <h3 style={{ margin: 0, fontSize: '0.92rem', fontWeight: 800, color: '#0f172a' }}>
                Class Attendance
              </h3>
              <div style={{ fontSize: '0.72rem', color: '#64748b', marginTop: 1 }}>
                Based on teacher classroom scans today
              </div>
            </div>

            <div style={{ display: 'flex', backgroundColor: '#f1f5f9', padding: 2, borderRadius: 5 }}>
              <button
                onClick={() => setSectionFilter('SECTIONS')}
                style={{
                  border: 'none',
                  padding: '3px 8px',
                  borderRadius: 4,
                  fontSize: '0.7rem',
                  fontWeight: 600,
                  backgroundColor: sectionFilter === 'SECTIONS' ? '#ffffff' : 'transparent',
                  color: sectionFilter === 'SECTIONS' ? '#0f172a' : '#64748b',
                  cursor: 'pointer',
                }}
              >
                All Classes
              </button>
              <button
                onClick={() => setSectionFilter('TOP')}
                style={{
                  border: 'none',
                  padding: '3px 8px',
                  borderRadius: 4,
                  fontSize: '0.7rem',
                  fontWeight: 600,
                  backgroundColor: sectionFilter === 'TOP' ? '#ffffff' : 'transparent',
                  color: sectionFilter === 'TOP' ? '#0f172a' : '#64748b',
                  cursor: 'pointer',
                }}
              >
                Highest
              </button>
            </div>
          </div>

          <div style={{ flex: 1, minHeight: 0, overflowY: 'auto' }}>
            {stats && stats.section_attendance.length > 0 ? (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                {stats.section_attendance.map((sec) => (
                  <div key={sec.section_id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '6px 0', borderBottom: '1px solid #f1f5f9' }}>
                    <div style={{ fontSize: '0.82rem', fontWeight: 600, color: '#334155' }}>{sec.section_name}</div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <span style={{ fontSize: '0.72rem', color: '#64748b' }}>{sec.present}/{sec.enrolled}</span>
                      <span style={{ fontSize: '0.78rem', fontWeight: 700, color: sec.rate > 80 ? '#16a34a' : '#0284c7' }}>{sec.rate}%</span>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div style={emptyStateContainerStyle}>
                <Users size={32} color="#cbd5e1" />
                <div style={{ fontWeight: 700, fontSize: '0.85rem', color: '#1e293b', marginTop: 6 }}>
                  No Class Attendance Yet
                </div>
                <div style={{ fontSize: '0.72rem', color: '#94a3b8', maxWidth: 300, marginTop: 2 }}>
                  Class attendance will show here once teachers scan their students.
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

const cardStyle: React.CSSProperties = {
  backgroundColor: '#ffffff',
  borderRadius: '10px',
  border: '1px solid #f1f5f9',
  padding: '12px 16px',
  boxShadow: '0 1px 3px rgba(0, 0, 0, 0.04)',
  minWidth: 0,
  textAlign: 'left',
};

const panelCardStyle: React.CSSProperties = {
  backgroundColor: '#ffffff',
  borderRadius: '10px',
  border: '1px solid #f1f5f9',
  padding: '14px 18px',
  boxShadow: '0 1px 3px rgba(0, 0, 0, 0.04)',
  display: 'flex',
  flexDirection: 'column',
  minWidth: 0,
  textAlign: 'left',
};

const metricLabelStyle: React.CSSProperties = {
  fontSize: '0.65rem',
  fontWeight: 700,
  color: '#64748b',
  letterSpacing: '0.3px',
};

const metricValueStyle: React.CSSProperties = {
  fontSize: '1.5rem',
  fontWeight: 800,
  color: '#0f172a',
  margin: '5px 0 6px 0',
};

const dividerStyle: React.CSSProperties = {
  height: '1px',
  backgroundColor: '#f8fafc',
  marginBottom: '6px',
};

const metricSubtextStyle: React.CSSProperties = {
  fontSize: '0.7rem',
  color: '#94a3b8',
};

const emptyStateContainerStyle: React.CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  alignItems: 'center',
  justifyContent: 'center',
  height: '100%',
  textAlign: 'center',
};