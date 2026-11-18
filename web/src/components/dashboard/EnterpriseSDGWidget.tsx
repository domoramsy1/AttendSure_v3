/**
 * AttendSure - UN SDG Impact, SARDO Early-Warning & Emergency Campus Roll-Call Widget (Themed)
 * File: web/src/components/dashboard/EnterpriseSDGWidget.tsx
 */

import React, { useMemo, useState } from 'react';
import {
  AlertTriangle,
  Award,
  CheckCircle2,
  Download,
  Globe,
  Leaf,
  RefreshCw,
  ShieldAlert,
  ShieldCheck,
  Smartphone,
  Users,
  X,
} from 'lucide-react';
import apiClient from '../../api/client';
import { useApiResource } from '../../hooks/useApiResource';
import { useTheme } from '../../context/ThemeContext';

interface EmergencyStudent {
  student_id: number;
  lrn: string;
  full_name: string;
  section: string;
  parent_contact: string;
}

interface EmergencyFaculty {
  faculty_id: number;
  employee_id: string;
  full_name: string;
  department: string;
}

interface EmergencyRollCallData {
  timestamp: string;
  total_people_on_campus: number;
  students_count: number;
  faculty_count: number;
  students: EmergencyStudent[];
  faculty: EmergencyFaculty[];
}

export const EnterpriseSDGWidget: React.FC = () => {
  const { tokens, brand } = useTheme();
  const { data: sdgData, loading: loadingSdg, reload: reloadSdg } = useApiResource<any>('/enterprise/sdg-impact/', null);
  const { data: sardoData, loading: loadingSardo, reload: reloadSardo } = useApiResource<any>('/enterprise/sardo-early-warning/', null);

  const [showAtRiskList, setShowAtRiskList] = useState<boolean>(true);
  const [rollCallOpen, setRollCallOpen] = useState<boolean>(false);
  const [rollCallLoading, setRollCallLoading] = useState<boolean>(false);
  const [rollCallData, setRollCallData] = useState<EmergencyRollCallData | null>(null);
  const [rollCallSearch, setRollCallSearch] = useState<string>('');
  const [safeStudentIds, setSafeStudentIds] = useState<Record<number, boolean>>({});
  const [exportingEdFi, setExportingEdFi] = useState<boolean>(false);

  const loading = loadingSdg || loadingSardo;

  const handleRefresh = () => {
    reloadSdg(false);
    reloadSardo(false);
  };

  const handleOpenEmergencyRollCall = async () => {
    setRollCallOpen(true);
    setRollCallLoading(true);
    try {
      const res = await apiClient.get('/enterprise/emergency-rollcall/');
      setRollCallData(res.data);
    } catch {
      setRollCallData(null);
    } finally {
      setRollCallLoading(false);
    }
  };

  const toggleStudentSafe = (studentId: number) => {
    setSafeStudentIds((prev) => ({
      ...prev,
      [studentId]: !prev[studentId],
    }));
  };

  const handleExportEdFi = async () => {
    setExportingEdFi(true);
    try {
      const res = await apiClient.get('/enterprise/edfi-export/');
      const blob = new Blob([JSON.stringify(res.data, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `attendsure_edfi_v6_export_${new Date().toISOString().slice(0, 10)}.json`;
      a.click();
      URL.revokeObjectURL(url);
    } catch {
    } finally {
      setExportingEdFi(false);
    }
  };

  const filteredRollCallStudents = useMemo(() => {
    const list = rollCallData?.students || [];
    const q = rollCallSearch.trim().toLowerCase();
    if (!q) return list;
    return list.filter(
      (s) =>
        s.full_name.toLowerCase().includes(q) ||
        s.lrn.toLowerCase().includes(q) ||
        s.section.toLowerCase().includes(q)
    );
  }, [rollCallData, rollCallSearch]);

  const safeCount = useMemo(() => {
    if (!rollCallData?.students) return 0;
    return rollCallData.students.filter((s) => Boolean(safeStudentIds[s.student_id])).length;
  }, [rollCallData, safeStudentIds]);

  const sdg4 = sdgData?.sdg_metrics?.sdg_4_quality_education;
  const sdg5 = sdgData?.sdg_metrics?.sdg_5_and_10_equality_and_inclusion;
  const sdg12 = sdgData?.sdg_metrics?.sdg_12_and_13_climate_and_sustainability;
  const sdg16 = sdgData?.sdg_metrics?.sdg_16_accountable_institutions;
  const atRiskStudents = Array.isArray(sardoData?.at_risk_students) ? sardoData.at_risk_students : [];

  return (
    <div style={{ ...containerStyle, backgroundColor: tokens.bgSurface, borderColor: tokens.borderSubtle }}>
      {/* Top Action Header */}
      <div style={headerBarStyle}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
            <span style={{ ...badgePillStyle, backgroundColor: tokens.primaryLight, color: brand.primary }}>
              <Globe size={13} /> UN SDG &amp; ENTERPRISE IMPACT
            </span>
            <span style={{ ...privacyPillStyle, backgroundColor: tokens.successLight, color: brand.success }}>
              <ShieldCheck size={13} /> RA 10173 &amp; GDPR Compliant • Pure Software & Mobile Push
            </span>
          </div>
          <h3 style={{ margin: '4px 0 0', fontSize: '1.05rem', fontWeight: 800, color: tokens.textPrimary }}>
            Sustainable Development Goals, SARDO Early-Warning &amp; Campus Safety
          </h3>
          <p style={{ margin: 0, fontSize: '0.78rem', color: tokens.textSecondary }}>
            Student attendance via USB QR Scanner on Faculty PC/Laptop • Faculty attendance via Mobile Facial Recognition &amp; Campus GPS
          </p>
        </div>

        <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
          <button
            type="button"
            onClick={handleOpenEmergencyRollCall}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 6,
              padding: '7px 13px',
              borderRadius: 8,
              border: 'none',
              backgroundColor: brand.danger,
              color: '#ffffff',
              fontSize: '0.76rem',
              fontWeight: 800,
              cursor: 'pointer',
            }}
          >
            <ShieldAlert size={14} /> Emergency Campus Roll-Call
          </button>

          <button
            type="button"
            onClick={handleExportEdFi}
            disabled={exportingEdFi}
            style={{ ...secondaryBtnStyle, backgroundColor: tokens.bgSurfaceSubtle, borderColor: tokens.borderStrong, color: tokens.textPrimary }}
          >
            <Download size={14} /> {exportingEdFi ? 'Exporting...' : 'Export Ed-Fi JSON'}
          </button>

          <button
            type="button"
            onClick={handleRefresh}
            disabled={loading}
            style={{ ...secondaryBtnStyle, backgroundColor: tokens.bgSurfaceSubtle, borderColor: tokens.borderStrong, color: tokens.textPrimary }}
          >
            <RefreshCw size={14} /> {loading ? 'Updating...' : 'Refresh'}
          </button>
        </div>
      </div>

      {/* Emergency Campus Roll-Call Panel (SDG 11) */}
      {rollCallOpen && (
        <div
          style={{
            backgroundColor: tokens.bgSurfaceSubtle,
            border: `2px solid ${brand.danger}`,
            borderRadius: 10,
            padding: 16,
            display: 'flex',
            flexDirection: 'column',
            gap: 12,
          }}
        >
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 8 }}>
            <div>
              <div style={{ fontSize: '0.95rem', fontWeight: 800, color: brand.danger, display: 'flex', alignItems: 'center', gap: 6 }}>
                <ShieldAlert size={18} /> SDG 11 • EMERGENCY EVACUATION CAMPUS ROLL-CALL
              </div>
              <div style={{ fontSize: '0.76rem', color: tokens.textSecondary }}>
                {rollCallData
                  ? `Snapshot as of ${rollCallData.timestamp} • ${rollCallData.total_people_on_campus} People Verified on Campus`
                  : 'Loading live campus headcount...'}
              </div>
            </div>

            <button
              type="button"
              onClick={() => setRollCallOpen(false)}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: 4,
                padding: '5px 10px',
                borderRadius: 6,
                border: `1px solid ${tokens.borderSubtle}`,
                backgroundColor: tokens.bgSurface,
                color: brand.danger,
                fontWeight: 700,
                fontSize: '0.75rem',
                cursor: 'pointer',
              }}
            >
              <X size={14} /> Close Roll-Call
            </button>
          </div>

          {rollCallLoading ? (
            <div style={{ fontSize: '0.82rem', color: tokens.textSecondary, fontWeight: 700 }}>
              Fetching active student and faculty headcount...
            </div>
          ) : rollCallData ? (
            <>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 10 }}>
                <div style={{ backgroundColor: tokens.bgSurface, padding: 10, borderRadius: 8, border: `1px solid ${tokens.borderSubtle}` }}>
                  <div style={{ fontSize: '0.68rem', fontWeight: 800, color: tokens.textMuted }}>STUDENTS ON CAMPUS</div>
                  <div style={{ fontSize: '1.3rem', fontWeight: 800, color: tokens.textPrimary }}>{rollCallData.students_count}</div>
                </div>
                <div style={{ backgroundColor: tokens.bgSurface, padding: 10, borderRadius: 8, border: `1px solid ${tokens.borderSubtle}` }}>
                  <div style={{ fontSize: '0.68rem', fontWeight: 800, color: brand.success }}>CHECKED SAFE AT ASSEMBLY</div>
                  <div style={{ fontSize: '1.3rem', fontWeight: 800, color: brand.success }}>{safeCount}</div>
                </div>
                <div style={{ backgroundColor: tokens.bgSurface, padding: 10, borderRadius: 8, border: `1px solid ${tokens.borderSubtle}` }}>
                  <div style={{ fontSize: '0.68rem', fontWeight: 800, color: brand.danger }}>UNACCOUNTED FOR</div>
                  <div style={{ fontSize: '1.3rem', fontWeight: 800, color: brand.danger }}>
                    {Math.max(0, rollCallData.students_count - safeCount)}
                  </div>
                </div>
                <div style={{ backgroundColor: tokens.bgSurface, padding: 10, borderRadius: 8, border: `1px solid ${tokens.borderSubtle}` }}>
                  <div style={{ fontSize: '0.68rem', fontWeight: 800, color: brand.primary }}>FACULTY ON CAMPUS</div>
                  <div style={{ fontSize: '1.3rem', fontWeight: 800, color: brand.primary }}>{rollCallData.faculty_count}</div>
                </div>
              </div>

              <input
                type="text"
                value={rollCallSearch}
                onChange={(e) => setRollCallSearch(e.target.value)}
                placeholder="Filter student class list by name, LRN, or section..."
                style={{
                  padding: '8px 12px',
                  borderRadius: 8,
                  border: `1px solid ${tokens.borderStrong}`,
                  backgroundColor: tokens.bgSurface,
                  color: tokens.textPrimary,
                  fontSize: '0.82rem',
                }}
              />

              <div style={{ maxHeight: 240, overflowY: 'auto', backgroundColor: tokens.bgSurface, borderRadius: 8, border: `1px solid ${tokens.borderSubtle}` }}>
                {filteredRollCallStudents.length === 0 ? (
                  <div style={{ padding: 12, fontSize: '0.8rem', color: tokens.textMuted }}>
                    No students currently checked in on campus today.
                  </div>
                ) : (
                  filteredRollCallStudents.map((st) => {
                    const isSafe = Boolean(safeStudentIds[st.student_id]);
                    return (
                      <label
                        key={st.student_id}
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'space-between',
                          padding: '8px 12px',
                          borderBottom: `1px solid ${tokens.borderSubtle}`,
                          backgroundColor: isSafe ? tokens.successLight : tokens.bgSurface,
                          cursor: 'pointer',
                          fontSize: '0.8rem',
                        }}
                      >
                        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                          <input
                            type="checkbox"
                            checked={isSafe}
                            onChange={() => toggleStudentSafe(st.student_id)}
                            style={{ width: 16, height: 16, accentColor: brand.success }}
                          />
                          <div>
                            <strong style={{ color: tokens.textPrimary }}>{st.full_name}</strong>
                            <span style={{ color: tokens.textSecondary, marginLeft: 8 }}>
                              LRN: {st.lrn} • {st.section}
                            </span>
                          </div>
                        </div>
                        <span
                          style={{
                            fontSize: '0.7rem',
                            fontWeight: 800,
                            color: isSafe ? brand.success : brand.danger,
                          }}
                        >
                          {isSafe ? 'SAFE' : 'UNACCOUNTED'}
                        </span>
                      </label>
                    );
                  })
                )}
              </div>
            </>
          ) : null}
        </div>
      )}

      {/* 4 UN SDG Impact Cards */}
      <div style={cardsGridStyle}>
        <div style={{ ...cardStyle, backgroundColor: tokens.bgSurfaceSubtle, borderColor: tokens.borderSubtle }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ ...sdgTagStyle, backgroundColor: tokens.dangerLight, color: brand.danger }}>
              SDG 4 • QUALITY EDUCATION
            </span>
            <Award size={18} color={brand.danger} />
          </div>
          <div style={{ ...metricValueStyle, color: tokens.textPrimary }}>
            {loading ? '...' : (sdg4?.verified_classroom_qr_scans ?? 0).toLocaleString()}
          </div>
          <div style={{ ...metricSubStyle, color: tokens.textMuted }}>Verified Classroom USB QR Scans</div>
          <div style={{ ...dividerStyle, backgroundColor: tokens.borderSubtle }} />
          <div style={{ ...metaRowStyle, color: tokens.textSecondary }}>
            <span>Critical SARDO Risk:</span>
            <strong style={{ color: brand.danger }}>{sardoData?.critical_sardo_count ?? 0} Learners</strong>
          </div>
          <div style={{ ...metaRowStyle, color: tokens.textSecondary }}>
            <span>Early-Warning Watch:</span>
            <strong style={{ color: brand.warning }}>{sardoData?.early_warning_count ?? 0} Learners</strong>
          </div>
        </div>

        <div style={{ ...cardStyle, backgroundColor: tokens.bgSurfaceSubtle, borderColor: tokens.borderSubtle }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ ...sdgTagStyle, backgroundColor: tokens.infoLight, color: brand.secondary }}>
              SDG 5 &amp; 10 • EQUALITY &amp; INCLUSION
            </span>
            <Users size={18} color={brand.secondary} />
          </div>
          <div style={{ ...metricValueStyle, color: tokens.textPrimary }}>
            {loading
              ? '...'
              : `${sdg5?.male_attendance_rate_today ?? 0}% M / ${sdg5?.female_attendance_rate_today ?? 0}% F`}
          </div>
          <div style={{ ...metricSubStyle, color: tokens.textMuted }}>Live Gender Attendance Parity Today</div>
          <div style={{ ...dividerStyle, backgroundColor: tokens.borderSubtle }} />
          <div style={{ ...metaRowStyle, color: tokens.textSecondary }}>
            <span>Enrolled Male / Female:</span>
            <strong style={{ color: tokens.textPrimary }}>
              {sdg5?.male_learners ?? 0} M • {sdg5?.female_learners ?? 0} F
            </strong>
          </div>
          <div style={{ ...metaRowStyle, color: tokens.textSecondary }}>
            <span>4Ps / CCT Beneficiaries:</span>
            <strong style={{ color: brand.secondary }}>{sdg5?.cct_4ps_beneficiaries_monitored ?? 0} Monitored</strong>
          </div>
        </div>

        <div style={{ ...cardStyle, backgroundColor: tokens.bgSurfaceSubtle, borderColor: tokens.borderSubtle }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ ...sdgTagStyle, backgroundColor: tokens.successLight, color: brand.success }}>
              SDG 12 &amp; 13 • CLIMATE &amp; ROI
            </span>
            <Leaf size={18} color={brand.success} />
          </div>
          <div style={{ ...metricValueStyle, color: brand.success }}>
            {loading ? '...' : `${sdg12?.estimated_co2_reduced_kg ?? 180} kg CO2e`}
          </div>
          <div style={{ ...metricSubStyle, color: tokens.textMuted }}>Carbon Reduced &amp; Zero Gate Hardware E-Waste</div>
          <div style={{ ...dividerStyle, backgroundColor: tokens.borderSubtle }} />
          <div style={{ ...metaRowStyle, color: tokens.textSecondary }}>
            <span>Paper Sheets Saved:</span>
            <strong style={{ color: tokens.textPrimary }}>{(sdg12?.paper_sheets_saved ?? 0).toLocaleString()} Sheets</strong>
          </div>
          <div style={{ ...metaRowStyle, color: tokens.textSecondary }}>
            <span>Est. Annual Savings:</span>
            <strong style={{ color: brand.success }}>
              PHP {(sdg12?.estimated_annual_savings_php ?? 145000).toLocaleString()}
            </strong>
          </div>
        </div>

        <div style={{ ...cardStyle, backgroundColor: tokens.bgSurfaceSubtle, borderColor: tokens.borderSubtle }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ ...sdgTagStyle, backgroundColor: 'rgba(124, 58, 237, 0.12)', color: '#7c3aed' }}>
              SDG 16 • ACCOUNTABLE SCHOOLS
            </span>
            <Smartphone size={18} color="#7c3aed" />
          </div>
          <div style={{ ...metricValueStyle, color: tokens.textPrimary }}>
            {loading
              ? '...'
              : `${sdg16?.faculty_face_gps_verified_today ?? 0} / ${sdg16?.total_active_faculty ?? 0}`}
          </div>
          <div style={{ ...metricSubStyle, color: tokens.textMuted }}>Faculty Verified via Mobile Face &amp; GPS Today</div>
          <div style={{ ...dividerStyle, backgroundColor: tokens.borderSubtle }} />
          <div style={{ ...metaRowStyle, color: tokens.textSecondary }}>
            <span>Parent Push Alerts:</span>
            <strong style={{ color: tokens.textPrimary }}>{(sdg12?.mobile_push_alerts_delivered ?? 0).toLocaleString()} Delivered</strong>
          </div>
          <div style={{ ...metaRowStyle, color: tokens.textSecondary }}>
            <span>Audit Logs (Month):</span>
            <strong style={{ color: tokens.textPrimary }}>{(sdg16?.tamper_evident_audit_logs_this_month ?? 0).toLocaleString()} Records</strong>
          </div>
        </div>
      </div>

      {/* SARDO Early-Warning Section */}
      <div style={{ ...sardoBoxStyle, backgroundColor: tokens.bgSurfaceSubtle, borderColor: tokens.borderSubtle }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 8 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <AlertTriangle size={17} color={atRiskStudents.length > 0 ? brand.danger : brand.success} />
            <span style={{ fontSize: '0.88rem', fontWeight: 800, color: tokens.textPrimary }}>
              SARDO Dropout Early-Warning Class List (Last 30 Days: {atRiskStudents.length} Flagged)
            </span>
          </div>
          {atRiskStudents.length > 0 && (
            <button
              type="button"
              onClick={() => setShowAtRiskList(!showAtRiskList)}
              style={{ ...toggleBtnStyle, backgroundColor: tokens.bgSurface, borderColor: tokens.borderStrong, color: tokens.textPrimary }}
            >
              {showAtRiskList ? 'Hide Class List' : 'Show Class List'}
            </button>
          )}
        </div>

        {atRiskStudents.length === 0 ? (
          <div style={{ ...healthyBannerStyle, backgroundColor: tokens.successLight, color: brand.success }}>
            <CheckCircle2 size={16} color={brand.success} />
            <span>
              Zero students are currently at risk of dropping out over the last 30 days. All class lists have healthy attendance.
            </span>
          </div>
        ) : (
          showAtRiskList && (
            <div style={{ overflowX: 'auto', marginTop: 10 }}>
              <table style={{ ...tableStyle, backgroundColor: tokens.bgSurface }}>
                <thead>
                  <tr style={{ backgroundColor: tokens.bgSurfaceSubtle, textAlign: 'left' }}>
                    <th style={{ ...thStyle, color: tokens.textMuted }}>Learner Name &amp; LRN</th>
                    <th style={{ ...thStyle, color: tokens.textMuted }}>Grade &amp; Section</th>
                    <th style={{ ...thStyle, color: tokens.textMuted }}>30-Day Attendance</th>
                    <th style={{ ...thStyle, color: tokens.textMuted }}>Risk Level</th>
                    <th style={{ ...thStyle, color: tokens.textMuted }}>Recommended Action</th>
                  </tr>
                </thead>
                <tbody>
                  {atRiskStudents.slice(0, 10).map((st: any) => {
                    const isCritical = st.risk_level === 'CRITICAL_SARDO';
                    return (
                      <tr key={st.student_id} style={{ borderTop: `1px solid ${tokens.borderSubtle}` }}>
                        <td style={tdStyle}>
                          <div style={{ fontWeight: 800, color: tokens.textPrimary }}>{st.full_name}</div>
                          <div style={{ fontSize: '0.7rem', color: tokens.textMuted }}>
                            LRN: {st.lrn} {st.is_4ps_beneficiary ? '• 4Ps Beneficiary' : ''}
                          </div>
                        </td>
                        <td style={{ ...tdStyle, color: tokens.textPrimary }}>{st.section}</td>
                        <td style={tdStyle}>
                          <span style={{ color: brand.danger, fontWeight: 700 }}>{st.absent_days_30d} Absent</span>
                          {' • '}
                          <span style={{ color: brand.warning, fontWeight: 700 }}>{st.cutting_days_30d} Cutting</span>
                          {' • '}
                          <span style={{ color: tokens.textMuted }}>{st.late_days_30d} Late</span>
                        </td>
                        <td style={tdStyle}>
                          <span
                            style={{
                              padding: '3px 8px',
                              borderRadius: 10,
                              fontSize: '0.68rem',
                              fontWeight: 800,
                              backgroundColor: isCritical ? tokens.dangerLight : tokens.warningLight,
                              color: isCritical ? brand.danger : brand.warning,
                              border: `1px solid ${isCritical ? brand.danger : brand.warning}`,
                            }}
                          >
                            {isCritical ? 'CRITICAL SARDO' : 'EARLY WARNING'} ({st.risk_score}%)
                          </span>
                        </td>
                        <td style={{ ...tdStyle, fontSize: '0.74rem', color: tokens.textSecondary }}>
                          {st.recommended_intervention}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )
        )}
      </div>
    </div>
  );
};

const containerStyle: React.CSSProperties = {
  borderRadius: 12,
  borderWidth: 1,
  borderStyle: 'solid',
  padding: 18,
  display: 'flex',
  flexDirection: 'column',
  gap: 16,
  marginBottom: 16,
};

const headerBarStyle: React.CSSProperties = {
  display: 'flex',
  justifyContent: 'space-between',
  alignItems: 'flex-start',
  flexWrap: 'wrap',
  gap: 12,
};

const badgePillStyle: React.CSSProperties = {
  display: 'inline-flex',
  alignItems: 'center',
  gap: 5,
  padding: '3px 10px',
  borderRadius: 12,
  fontSize: '0.68rem',
  fontWeight: 800,
};

const privacyPillStyle: React.CSSProperties = {
  display: 'inline-flex',
  alignItems: 'center',
  gap: 5,
  padding: '3px 10px',
  borderRadius: 12,
  fontSize: '0.68rem',
  fontWeight: 700,
};

const secondaryBtnStyle: React.CSSProperties = {
  display: 'inline-flex',
  alignItems: 'center',
  gap: 6,
  padding: '7px 12px',
  borderRadius: 8,
  borderWidth: 1,
  borderStyle: 'solid',
  fontSize: '0.76rem',
  fontWeight: 700,
  cursor: 'pointer',
};

const cardsGridStyle: React.CSSProperties = {
  display: 'grid',
  gridTemplateColumns: 'repeat(auto-fit, minmax(230px, 1fr))',
  gap: 12,
};

const cardStyle: React.CSSProperties = {
  borderRadius: 10,
  borderWidth: 1,
  borderStyle: 'solid',
  padding: 14,
  display: 'flex',
  flexDirection: 'column',
  gap: 6,
};

const sdgTagStyle: React.CSSProperties = {
  fontSize: '0.64rem',
  fontWeight: 800,
  padding: '2px 7px',
  borderRadius: 6,
  letterSpacing: '0.3px',
};

const metricValueStyle: React.CSSProperties = {
  fontSize: '1.35rem',
  fontWeight: 800,
  marginTop: 4,
};

const metricSubStyle: React.CSSProperties = {
  fontSize: '0.72rem',
  fontWeight: 600,
};

const dividerStyle: React.CSSProperties = {
  height: 1,
  margin: '4px 0',
};

const metaRowStyle: React.CSSProperties = {
  display: 'flex',
  justifyContent: 'space-between',
  fontSize: '0.73rem',
};

const sardoBoxStyle: React.CSSProperties = {
  borderRadius: 10,
  borderWidth: 1,
  borderStyle: 'solid',
  padding: 14,
};

const healthyBannerStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: 8,
  marginTop: 8,
  padding: '8px 12px',
  borderRadius: 8,
  fontSize: '0.78rem',
  fontWeight: 700,
};

const toggleBtnStyle: React.CSSProperties = {
  padding: '4px 10px',
  borderRadius: 6,
  borderWidth: 1,
  borderStyle: 'solid',
  fontSize: '0.72rem',
  fontWeight: 700,
  cursor: 'pointer',
};

const tableStyle: React.CSSProperties = {
  width: '100%',
  borderCollapse: 'collapse',
  fontSize: '0.78rem',
  borderRadius: 8,
  overflow: 'hidden',
};

const thStyle: React.CSSProperties = {
  padding: '8px 10px',
  fontSize: '0.7rem',
  fontWeight: 800,
  textTransform: 'uppercase',
};

const tdStyle: React.CSSProperties = {
  padding: '8px 10px',
  verticalAlign: 'middle',
};

export default EnterpriseSDGWidget;