import React, { useState, useEffect } from 'react';
import { useAlert } from '../../context/AlertContext';
import apiClient from '../../api/client';
import {
  UserCheck,
  UserX,
  Clock,
  Send,
  Radio,
  RefreshCw,
  Scan,
  TrendingUp,
  FileSpreadsheet,
  BellRing,
  Activity,
  Layers,
  Inbox,
} from 'lucide-react';

interface HourlyScanItem {
  hour: string;
  count: number;
  height: number;
  is_peak: boolean;
}

interface GradeBreakdown {
  grade: string;
  present: number;
  total: number;
  percentage: number;
}

interface RecentScan {
  id: string | number;
  person_name: string;
  role_label: string;
  grade_section: string;
  direction: 'IN' | 'OUT';
  scan_time: string;
  scan_method: 'RFID' | 'QR';
}

interface DashboardMetrics {
  total_students: number;
  students_present: number;
  students_absent: number;
  attendance_rate: number;
  faculty_on_duty: number;
  total_faculty: number;
  gate_scans_today: number;
  active_gate_passes: number;
  sms_sent_today: number;
  sms_pending_count: number;
  kiosks_online: number;
  total_kiosks: number;
  hourly_scans: HourlyScanItem[];
  grade_levels: GradeBreakdown[];
  recent_scans: RecentScan[];
}

interface DashboardViewProps {
  onGateStatusChange?: (online: boolean) => void;
}

export const DashboardView: React.FC<DashboardViewProps> = ({ onGateStatusChange }) => {
  const [loading, setLoading] = useState<boolean>(true);
  const [refreshing, setRefreshing] = useState<boolean>(false);
  const { showAlert } = useAlert();

const handleIssueGatePass = () => {
  showAlert({
    title: 'Gate Pass Manager',
    message: 'You can issue student and faculty gate passes, specify authorized departure reasons, and print departure slips from the Gate Passes section.',
    type: 'info',
    actionLabel: 'Open Gate Passes',
    onAction: () => {
      // Switch active tab or trigger gate pass modal
      window.dispatchEvent(new CustomEvent('attendsure:navigate', { detail: 'gate-passes' }));
    },
  });
};

  // Real database metrics with zero initial defaults
  const [data, setData] = useState<DashboardMetrics>({
    total_students: 0,
    students_present: 0,
    students_absent: 0,
    attendance_rate: 0,
    faculty_on_duty: 0,
    total_faculty: 0,
    gate_scans_today: 0,
    active_gate_passes: 0,
    sms_sent_today: 0,
    sms_pending_count: 0,
    kiosks_online: 0,
    total_kiosks: 0,
    hourly_scans: [],
    grade_levels: [],
    recent_scans: [],
  });

  const fetchDashboardData = async () => {
    try {
      setRefreshing(true);
      const res = await apiClient.get<DashboardMetrics>('/dashboard/overview/');
      if (res.data) {
        setData({
          total_students: res.data.total_students || 0,
          students_present: res.data.students_present || 0,
          students_absent: res.data.students_absent || 0,
          attendance_rate: res.data.attendance_rate || 0,
          faculty_on_duty: res.data.faculty_on_duty || 0,
          total_faculty: res.data.total_faculty || 0,
          gate_scans_today: res.data.gate_scans_today || 0,
          active_gate_passes: res.data.active_gate_passes || 0,
          sms_sent_today: res.data.sms_sent_today || 0,
          sms_pending_count: res.data.sms_pending_count || 0,
          kiosks_online: res.data.kiosks_online || 0,
          total_kiosks: res.data.total_kiosks || 0,
          hourly_scans: res.data.hourly_scans || [],
          grade_levels: res.data.grade_levels || [],
          recent_scans: res.data.recent_scans || [],
        });

        if (onGateStatusChange) {
          onGateStatusChange((res.data.kiosks_online || 0) > 0);
        }
      }
    } catch {
      // In case of error, data remains as real empty state
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    fetchDashboardData();
    // Refresh every 20 seconds so real gate taps appear live
    const interval = setInterval(fetchDashboardData, 20000);
    return () => clearInterval(interval);
  }, []);


  if (loading) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '100%', minHeight: 400, gap: 10 }}>
        <RefreshCw className="animate-spin" size={26} color="#0284c7" />
        <span style={{ fontSize: '0.85rem', color: '#64748b', fontWeight: 600 }}>Loading school attendance data...</span>
      </div>
    );
  }

  const hasHourlyScans = data.hourly_scans.some((h) => h.count > 0);

  return (
    <div style={{ height: '100%', overflowY: 'auto', backgroundColor: '#f8fafc', padding: '20px 28px' }}>
      <div style={{ maxWidth: 1240, margin: '0 auto' }}>
        
        {/* Top Header */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 }}>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <h1 style={{ fontSize: '1.30rem', fontWeight: 800, color: '#0f172a', margin: 0 }}>
                School Attendance Dashboard
              </h1>
              <span style={livePulseBadge}>
                <span style={pulseDot} />
                LIVE
              </span>
            </div>
            <p style={{ fontSize: '0.80rem', color: '#64748b', margin: '4px 0 0 0' }}>
              Real-time gate scans, classroom attendance, and parent SMS delivery from the database.
            </p>
          </div>

          <button
            onClick={fetchDashboardData}
            disabled={refreshing}
            title="Refresh Numbers"
            style={refreshBtnStyle}
          >
            <RefreshCw size={14} className={refreshing ? 'animate-spin' : ''} color="#334155" />
            <span style={{ fontSize: '0.78rem', fontWeight: 600, color: '#334155' }}>Refresh</span>
          </button>
        </div>

        {/* 1. Main Number Cards */}
        <div style={kpiGrid}>
          {/* Students in School */}
          <div style={kpiCard}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
              <div>
                <span style={kpiLabel}>STUDENTS IN SCHOOL</span>
                <div style={kpiValue}>{data.students_present.toLocaleString()}</div>
              </div>
              <div style={{ ...kpiIconBox, backgroundColor: '#ecfdf5', color: '#059669' }}>
                <UserCheck size={20} />
              </div>
            </div>
            <div style={kpiFooter}>
              <span style={{ color: '#059669', fontWeight: 700 }}>
                {data.attendance_rate}%
              </span>
              <span style={kpiSubtext}>of {data.total_students.toLocaleString()} enrolled</span>
            </div>
          </div>

          {/* Absent Students */}
          <div style={kpiCard}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
              <div>
                <span style={kpiLabel}>ABSENT STUDENTS</span>
                <div style={{ ...kpiValue, color: data.students_absent > 0 ? '#e11d48' : '#0f172a' }}>
                  {data.students_absent.toLocaleString()}
                </div>
              </div>
              <div style={{ ...kpiIconBox, backgroundColor: '#fff1f2', color: '#e11d48' }}>
                <UserX size={20} />
              </div>
            </div>
            <div style={kpiFooter}>
              <span style={kpiSubtext}>No entrance gate scan recorded today</span>
            </div>
          </div>

          {/* Facultys on Duty */}
          <div style={kpiCard}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
              <div>
                <span style={kpiLabel}>TEACHERS PRESENT</span>
                <div style={kpiValue}>
                  {data.faculty_on_duty}
                  <span style={{ fontSize: '0.85rem', color: '#64748b', fontWeight: 500 }}>/{data.total_faculty}</span>
                </div>
              </div>
              <div style={{ ...kpiIconBox, backgroundColor: '#f0fdf4', color: '#16a34a' }}>
                <Clock size={20} />
              </div>
            </div>
            <div style={kpiFooter}>
              <span style={kpiSubtext}>Faculty Daily Time Record</span>
            </div>
          </div>

          {/* Gate Scans Today */}
          <div style={kpiCard}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
              <div>
                <span style={kpiLabel}>TOTAL GATE SCANS</span>
                <div style={kpiValue}>{data.gate_scans_today.toLocaleString()}</div>
              </div>
              <div style={{ ...kpiIconBox, backgroundColor: '#eff6ff', color: '#0284c7' }}>
                <Scan size={20} />
              </div>
            </div>
            <div style={kpiFooter}>
              <span style={{ color: '#0284c7', fontWeight: 700, display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                <Radio size={12} /> {data.kiosks_online}/{data.total_kiosks} Scanners Online
              </span>
            </div>
          </div>
        </div>

        {/* 2. Middle Row: Hourly Arrivals + Real Recent Gate Scans */}
        <div style={twoColGrid}>
          
          {/* Hourly Arrivals Chart */}
          <div style={sectionCard}>
            <div style={sectionCardHeader}>
              <div>
                <h3 style={sectionTitle}>Arrivals by Hour</h3>
                <span style={sectionSubtitle}>Number of gate taps recorded throughout the day</span>
              </div>
              <div style={badgeStyle}>
                <TrendingUp size={12} color="#0284c7" />
                <span>Today's Log</span>
              </div>
            </div>

            {hasHourlyScans ? (
              <div style={{ height: 200, display: 'flex', alignItems: 'flex-end', gap: 10, padding: '14px 4px 6px 4px' }}>
                {data.hourly_scans.map((item, idx) => (
                  <div key={idx} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', height: '100%', justifyContent: 'flex-end' }}>
                    <span style={{ fontSize: '0.64rem', fontWeight: 700, color: item.is_peak ? '#0284c7' : '#64748b', marginBottom: 4 }}>
                      {item.count > 0 ? item.count : ''}
                    </span>
                    <div
                      style={{
                        width: '100%',
                        maxWidth: 32,
                        height: `${Math.max(item.height, item.count > 0 ? 8 : 2)}%`,
                        backgroundColor: item.is_peak ? '#0284c7' : (item.count > 0 ? '#93c5fd' : '#e2e8f0'),
                        borderRadius: '4px 4px 0 0',
                      }}
                    />
                    <span style={{ fontSize: '0.62rem', fontWeight: 600, color: '#64748b', marginTop: 6 }}>
                      {item.hour}
                    </span>
                  </div>
                ))}
              </div>
            ) : (
              <div style={emptyBox}>
                <Inbox size={26} color="#94a3b8" />
                <span style={{ fontSize: '0.78rem', color: '#64748b', marginTop: 6, fontWeight: 600 }}>
                  No Gate Check-ins Yet Today
                </span>
                <span style={{ fontSize: '0.70rem', color: '#94a3b8' }}>
                  Numbers update automatically as students tap their card or QR code at the entrance gate.
                </span>
              </div>
            )}
          </div>

          {/* Recent Gate Activity */}
          <div style={sectionCard}>
            <div style={sectionCardHeader}>
              <div>
                <h3 style={sectionTitle}>Latest Gate Scans</h3>
                <span style={sectionSubtitle}>Live check-ins from the school gate scanners</span>
              </div>
            </div>

            {data.recent_scans.length > 0 ? (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginTop: 4 }}>
                {data.recent_scans.map((scan) => (
                  <div key={scan.id} style={scanRow}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                      <div
                        style={{
                          ...directionBadge,
                          backgroundColor: scan.direction === 'IN' ? '#ecfdf5' : '#fef2f2',
                          color: scan.direction === 'IN' ? '#059669' : '#dc2626',
                        }}
                      >
                        {scan.direction}
                      </div>
                      <div>
                        <div style={{ fontSize: '0.80rem', fontWeight: 700, color: '#0f172a' }}>
                          {scan.person_name}
                        </div>
                        <div style={{ fontSize: '0.68rem', color: '#64748b' }}>
                          {scan.grade_section} &bull; {scan.scan_method} Tap
                        </div>
                      </div>
                    </div>

                    <div style={{ textAlign: 'right' }}>
                      <div style={{ fontSize: '0.74rem', fontWeight: 700, color: '#1e293b' }}>
                        {scan.scan_time}
                      </div>
                      <span style={{ fontSize: '0.62rem', color: '#059669', fontWeight: 600 }}>Recorded</span>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div style={emptyBox}>
                <Inbox size={26} color="#94a3b8" />
                <span style={{ fontSize: '0.78rem', color: '#64748b', marginTop: 6, fontWeight: 600 }}>
                  No Gate Scans Recorded Today
                </span>
                <span style={{ fontSize: '0.70rem', color: '#94a3b8' }}>
                  Waiting for student or faculty gate check-ins.
                </span>
              </div>
            )}
          </div>
        </div>

        {/* 3. Bottom Row: Real Grade Level Attendance + Fast Actions */}
        <div style={bottomGrid}>
          
          {/* Real Grade Level Breakdown */}
          <div style={sectionCard}>
            <div style={sectionCardHeader}>
              <div>
                <h3 style={sectionTitle}>Class Attendance by Grade Level</h3>
                <span style={sectionSubtitle}>Today's student turnout across all grade levels</span>
              </div>
              <Layers size={16} color="#64748b" />
            </div>

            {data.grade_levels.length > 0 ? (
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginTop: 4 }}>
                {data.grade_levels.map((lvl, index) => (
                  <div key={index} style={gradeCard}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
                      <span style={{ fontSize: '0.76rem', fontWeight: 700, color: '#1e293b' }}>{lvl.grade}</span>
                      <span style={{ fontSize: '0.76rem', fontWeight: 800, color: lvl.percentage >= 80 ? '#059669' : '#d97706' }}>
                        {lvl.percentage}%
                      </span>
                    </div>
                    <div style={progressBarTrack}>
                      <div
                        style={{
                          ...progressBarFill,
                          width: `${lvl.percentage}%`,
                          backgroundColor: lvl.percentage >= 80 ? '#10b981' : '#f59e0b',
                        }}
                      />
                    </div>
                    <div style={{ fontSize: '0.66rem', color: '#64748b', marginTop: 4 }}>
                      {lvl.present} present out of {lvl.total}
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div style={emptyBox}>
                <span style={{ fontSize: '0.78rem', color: '#64748b' }}>
                  No grade levels or enrolled students found in database.
                </span>
              </div>
            )}
          </div>

          {/* Quick Actions & Parent SMS Gateway */}
          <div style={sectionCard}>
            <div style={sectionCardHeader}>
              <div>
                <h3 style={sectionTitle}>Parent SMS &amp; Quick Actions</h3>
                <span style={sectionSubtitle}>Status of automated text notifications</span>
              </div>
              <Send size={15} color="#0284c7" />
            </div>

            {/* Real SMS Delivery Box */}
            <div style={smsStatusBox}>
              <div>
                <div style={{ fontSize: '0.78rem', fontWeight: 700, color: '#0f172a' }}>
                  {data.sms_sent_today.toLocaleString()} Parent SMS Sent Today
                </div>
                <div style={{ fontSize: '0.66rem', color: '#64748b' }}>
                  {data.sms_pending_count} pending messages in queue
                </div>
              </div>
              <span style={activeBadge}>SMS ACTIVE</span>
            </div>

            {/* Quick Action Buttons */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginTop: 12 }}>
              <button
                style={actionBtnStyle}
                onClick={() => alert('Feature: Issue Student Gate Pass modal.')}
              >
                <Activity size={14} color="#0284c7" />
                <span>Issue Student Gate Pass / Exit Permit</span>
              </button>

              <button
                type="button"
                onClick={handleIssueGatePass}
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: 6,
                  padding: '7px 12px',
                  backgroundColor: '#0284c7',
                  color: '#ffffff',
                  borderRadius: 6,
                  border: 'none',
                  fontSize: '0.78rem',
                  fontWeight: 700,
                  cursor: 'pointer',
                }}
              >
                Issue Gate Pass
              </button>

              <button
                style={actionBtnStyle}
                onClick={() => alert('Feature: Export Daily Attendance Register.')}
              >
                <FileSpreadsheet size={14} color="#059669" />
                <span>Open Daily Attendance Register (SF2)</span>
              </button>
            </div>
          </div>
        </div>

      </div>
    </div>
  );
};

// ============================================================================
// STYLES
// ============================================================================

const livePulseBadge: React.CSSProperties = {
  display: 'inline-flex',
  alignItems: 'center',
  gap: 5,
  padding: '2px 8px',
  borderRadius: 12,
  backgroundColor: '#ecfdf5',
  color: '#059669',
  fontSize: '0.64rem',
  fontWeight: 800,
  letterSpacing: '0.5px',
  border: '1px solid #a7f3d0',
};

const pulseDot: React.CSSProperties = {
  width: 6,
  height: 6,
  borderRadius: '50%',
  backgroundColor: '#10b981',
};

const refreshBtnStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: 6,
  padding: '6px 12px',
  backgroundColor: '#ffffff',
  border: '1px solid #cbd5e1',
  borderRadius: 8,
  cursor: 'pointer',
};

const kpiGrid: React.CSSProperties = {
  display: 'grid',
  gridTemplateColumns: 'repeat(4, 1fr)',
  gap: 16,
  marginBottom: 20,
};

const kpiCard: React.CSSProperties = {
  backgroundColor: '#ffffff',
  borderRadius: 10,
  border: '1px solid #e2e8f0',
  padding: '16px 18px',
  boxShadow: '0 1px 2px rgba(0,0,0,0.02)',
};

const kpiLabel: React.CSSProperties = {
  display: 'block',
  fontSize: '0.68rem',
  fontWeight: 700,
  color: '#64748b',
  marginBottom: 4,
};

const kpiValue: React.CSSProperties = {
  fontSize: '1.60rem',
  fontWeight: 800,
  color: '#0f172a',
  lineHeight: 1.1,
};

const kpiIconBox: React.CSSProperties = {
  width: 38,
  height: 38,
  borderRadius: 8,
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
};

const kpiFooter: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: 6,
  marginTop: 10,
  paddingTop: 8,
  borderTop: '1px solid #f8fafc',
  fontSize: '0.72rem',
};

const kpiSubtext: React.CSSProperties = {
  color: '#94a3b8',
};

const twoColGrid: React.CSSProperties = {
  display: 'grid',
  gridTemplateColumns: '1.3fr 1fr',
  gap: 16,
  marginBottom: 20,
};

const bottomGrid: React.CSSProperties = {
  display: 'grid',
  gridTemplateColumns: '1.2fr 1fr',
  gap: 16,
};

const sectionCard: React.CSSProperties = {
  backgroundColor: '#ffffff',
  borderRadius: 10,
  border: '1px solid #e2e8f0',
  padding: '16px 18px',
  boxShadow: '0 1px 2px rgba(0,0,0,0.02)',
};

const sectionCardHeader: React.CSSProperties = {
  display: 'flex',
  justifyContent: 'space-between',
  alignItems: 'flex-start',
  marginBottom: 12,
};

const sectionTitle: React.CSSProperties = {
  fontSize: '0.90rem',
  fontWeight: 800,
  color: '#0f172a',
  margin: 0,
};

const sectionSubtitle: React.CSSProperties = {
  fontSize: '0.70rem',
  color: '#64748b',
  marginTop: 2,
  display: 'block',
};

const badgeStyle: React.CSSProperties = {
  display: 'inline-flex',
  alignItems: 'center',
  gap: 4,
  padding: '3px 8px',
  borderRadius: 6,
  backgroundColor: '#f0f9ff',
  color: '#0284c7',
  fontSize: '0.68rem',
  fontWeight: 700,
};

const scanRow: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
  padding: '8px 10px',
  backgroundColor: '#f8fafc',
  borderRadius: 6,
  border: '1px solid #f1f5f9',
};

const directionBadge: React.CSSProperties = {
  padding: '2px 6px',
  borderRadius: 4,
  fontSize: '0.66rem',
  fontWeight: 800,
};

const gradeCard: React.CSSProperties = {
  padding: '8px 12px',
  backgroundColor: '#f8fafc',
  borderRadius: 6,
  border: '1px solid #f1f5f9',
};

const progressBarTrack: React.CSSProperties = {
  width: '100%',
  height: 6,
  backgroundColor: '#e2e8f0',
  borderRadius: 99,
  overflow: 'hidden',
};

const progressBarFill: React.CSSProperties = {
  height: '100%',
  borderRadius: 99,
};

const smsStatusBox: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
  padding: '10px 14px',
  backgroundColor: '#f0f9ff',
  borderRadius: 6,
  border: '1px solid #e0f2fe',
};

const activeBadge: React.CSSProperties = {
  padding: '2px 6px',
  borderRadius: 4,
  backgroundColor: '#0284c7',
  color: '#ffffff',
  fontSize: '0.60rem',
  fontWeight: 800,
};

const actionBtnStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: 10,
  width: '100%',
  padding: '9px 12px',
  backgroundColor: '#ffffff',
  border: '1px solid #e2e8f0',
  borderRadius: 6,
  fontSize: '0.76rem',
  fontWeight: 700,
  color: '#1e293b',
  cursor: 'pointer',
  textAlign: 'left',
};

const emptyBox: React.CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  alignItems: 'center',
  justifyContent: 'center',
  padding: '30px 16px',
  textAlign: 'center',
};

export default DashboardView;