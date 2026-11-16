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

export const EnterpriseSDGWidget: React.FC = () => {
  const { data: sdgData, loading: loadingSdg, reload: reloadSdg } = useApiResource<any>('/enterprise/sdg-impact/', null);
  const { data: sardoData, loading: loadingSardo, reload: reloadSardo } = useApiResource<any>('/enterprise/sardo-early-warning/', null);

  const [showAtRiskList, setShowAtRiskList] = useState<boolean>(true);
  const [rollCallOpen, setRollCallOpen] = useState<boolean>(false);
  const [rollCallLoading, setRollCallLoading] = useState<boolean>(false);
  const [rollCallData, setRollCallData] = useState<any>(null);
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
    const list = Array.isArray(rollCallData?.students) ? rollCallData.students : [];
    const q = rollCallSearch.trim().toLowerCase();
    if (!q) return list;
    return list.filter(
      (s: any) =>
        String(s.full_name || '').toLowerCase().includes(q) ||
        String(s.lrn || '').toLowerCase().includes(q) ||
        String(s.section || '').toLowerCase().includes(q)
    );
  }, [rollCallData, rollCallSearch]);

  const safeCount = useMemo(() => {
    const list = Array.isArray(rollCallData?.students) ? rollCallData.students : [];
    return list.filter((s: any) => Boolean(safeStudentIds[s.student_id])).length;
  }, [rollCallData, safeStudentIds]);

  const sdg4 = sdgData?.sdg_metrics?.sdg_4_quality_education;
  const sdg5 = sdgData?.sdg_metrics?.sdg_5_and_10_equality_and_inclusion;
  const sdg12 = sdgData?.sdg_metrics?.sdg_12_and_13_climate_and_sustainability;
  const sdg16 = sdgData?.sdg_metrics?.sdg_16_accountable_institutions;
  const atRiskStudents = Array.isArray(sardoData?.at_risk_students) ? sardoData.at_risk_students : [];

  return (
    <div style={{ backgroundColor: '#ffffff', borderRadius: 12, border: '1px solid #e2e8f0', padding: 18, display: 'flex', flexDirection: 'column', gap: 16, marginBottom: 16 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: 12 }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, padding: '3px 10px', borderRadius: 12, backgroundColor: '#eff6ff', color: '#004b87', fontSize: '0.68rem', fontWeight: 800 }}>
              <Globe size={13} /> UN SDG &amp; ENTERPRISE IMPACT
            </span>
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, padding: '3px 10px', borderRadius: 12, backgroundColor: '#ecfdf5', color: '#047857', fontSize: '0.68rem', fontWeight: 700 }}>
              <ShieldCheck size={13} /> RA 10173 &amp; GDPR Compliant • Zero Gate Hardware E-Waste
            </span>
          </div>
          <h3 style={{ margin: '4px 0 0', fontSize: '1.05rem', fontWeight: 800, color: '#0f172a' }}>
            Sustainable Development Goals, SARDO Early-Warning &amp; Campus Safety
          </h3>
          <p style={{ margin: 0, fontSize: '0.78rem', color: '#64748b' }}>
            Student attendance via USB QR Scanner on Faculty PC/Laptop • Faculty attendance via Mobile Facial Recognition &amp; Campus GPS
          </p>
        </div>

        <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
          <button type="button" onClick={handleOpenEmergencyRollCall} style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '7px 13px', borderRadius: 8, border: 'none', backgroundColor: '#dc2626', color: '#ffffff', fontSize: '0.76rem', fontWeight: 800, cursor: 'pointer' }}>
            <ShieldAlert size={14} /> Emergency Campus Roll-Call
          </button>
          <button type="button" onClick={handleExportEdFi} disabled={exportingEdFi} style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '7px 12px', borderRadius: 8, border: '1px solid #cbd5e1', backgroundColor: '#f8fafc', color: '#0f172a', fontSize: '0.76rem', fontWeight: 700, cursor: 'pointer' }}>
            <Download size={14} /> {exportingEdFi ? 'Exporting...' : 'Export Ed-Fi JSON'}
          </button>
          <button type="button" onClick={handleRefresh} disabled={loading} style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '7px 12px', borderRadius: 8, border: '1px solid #cbd5e1', backgroundColor: '#f8fafc', color: '#0f172a', fontSize: '0.76rem', fontWeight: 700, cursor: 'pointer' }}>
            <RefreshCw size={14} /> {loading ? 'Updating...' : 'Refresh'}
          </button>
        </div>
      </div>

      {rollCallOpen && (
        <div style={{ backgroundColor: '#fef2f2', border: '2px solid #dc2626', borderRadius: 10, padding: 16, display: 'flex', flexDirection: 'column', gap: 12 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 8 }}>
            <div>
              <div style={{ fontSize: '0.95rem', fontWeight: 800, color: '#991b1b', display: 'flex', alignItems: 'center', gap: 6 }}>
                <ShieldAlert size={18} /> SDG 11 • EMERGENCY EVACUATION CAMPUS ROLL-CALL
              </div>
              <div style={{ fontSize: '0.76rem', color: '#7f1d1d' }}>
                {rollCallData ? `Snapshot as of ${rollCallData.timestamp} • ${rollCallData.total_people_on_campus} People Verified on Campus` : 'Loading live campus headcount...'}
              </div>
            </div>
            <button type="button" onClick={() => setRollCallOpen(false)} style={{ display: 'inline-flex', alignItems: 'center', gap: 4, padding: '5px 10px', borderRadius: 6, border: '1px solid #fecaca', backgroundColor: '#ffffff', color: '#991b1b', fontWeight: 700, fontSize: '0.75rem', cursor: 'pointer' }}>
              <X size={14} /> Close Roll-Call
            </button>
          </div>

          {rollCallLoading ? (
            <div style={{ fontSize: '0.82rem', color: '#7f1d1d', fontWeight: 700 }}>Fetching active student and faculty headcount...</div>
          ) : rollCallData ? (
            <>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 10 }}>
                <div style={{ backgroundColor: '#ffffff', padding: 10, borderRadius: 8, border: '1px solid #fecaca' }}>
                  <div style={{ fontSize: '0.68rem', fontWeight: 800, color: '#64748b' }}>STUDENTS ON CAMPUS</div>
                  <div style={{ fontSize: '1.3rem', fontWeight: 800, color: '#0f172a' }}>{rollCallData.students_count}</div>
                </div>
                <div style={{ backgroundColor: '#ffffff', padding: 10, borderRadius: 8, border: '1px solid #fecaca' }}>
                  <div style={{ fontSize: '0.68rem', fontWeight: 800, color: '#059669' }}>CHECKED SAFE AT ASSEMBLY</div>
                  <div style={{ fontSize: '1.3rem', fontWeight: 800, color: '#059669' }}>{safeCount}</div>
                </div>
                <div style={{ backgroundColor: '#ffffff', padding: 10, borderRadius: 8, border: '1px solid #fecaca' }}>
                  <div style={{ fontSize: '0.68rem', fontWeight: 800, color: '#dc2626' }}>UNACCOUNTED FOR</div>
                  <div style={{ fontSize: '1.3rem', fontWeight: 800, color: '#dc2626' }}>{Math.max(0, rollCallData.students_count - safeCount)}</div>
                </div>
                <div style={{ backgroundColor: '#ffffff', padding: 10, borderRadius: 8, border: '1px solid #fecaca' }}>
                  <div style={{ fontSize: '0.68rem', fontWeight: 800, color: '#004b87' }}>FACULTY ON CAMPUS</div>
                  <div style={{ fontSize: '1.3rem', fontWeight: 800, color: '#004b87' }}>{rollCallData.faculty_count}</div>
                </div>
              </div>

              <input type="text" value={rollCallSearch} onChange={(e) => setRollCallSearch(e.target.value)} placeholder="Filter student class list by name, LRN, or section..." style={{ padding: '8px 12px', borderRadius: 8, border: '1px solid #fca5a5', backgroundColor: '#ffffff', fontSize: '0.82rem' }} />

              <div style={{ maxHeight: 240, overflowY: 'auto', backgroundColor: '#ffffff', borderRadius: 8, border: '1px solid #fecaca' }}>
                {filteredRollCallStudents.length === 0 ? (
                  <div style={{ padding: 12, fontSize: '0.8rem', color: '#64748b' }}>No students currently checked in on campus today.</div>
                ) : (
                  filteredRollCallStudents.map((st: any) => {
                    const isSafe = Boolean(safeStudentIds[st.student_id]);
                    return (
                      <label key={st.student_id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '8px 12px', borderBottom: '1px solid #f1f5f9', backgroundColor: isSafe ? '#ecfdf5' : '#ffffff', cursor: 'pointer', fontSize: '0.8rem' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                          <input type="checkbox" checked={isSafe} onChange={() => toggleStudentSafe(st.student_id)} style={{ width: 16, height: 16, accentColor: '#059669' }} />
                          <div>
                            <strong style={{ color: '#0f172a' }}>{st.full_name}</strong>
                            <span style={{ color: '#64748b', marginLeft: 8 }}>LRN: {st.lrn} • {st.section}</span>
                          </div>
                        </div>
                        <span style={{ fontSize: '0.7rem', fontWeight: 800, color: isSafe ? '#059669' : '#dc2626' }}>{isSafe ? 'SAFE' : 'UNACCOUNTED'}</span>
                      </label>
                    );
                  })
                )}
              </div>
            </>
          ) : null}
        </div>
      )}

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(230px, 1fr))', gap: 12 }}>
        <div style={{ backgroundColor: '#f8fafc', borderRadius: 10, border: '1px solid #e2e8f0', padding: 14, display: 'flex', flexDirection: 'column', gap: 6 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ fontSize: '0.64rem', fontWeight: 800, padding: '2px 7px', borderRadius: 6, backgroundColor: '#fee2e2', color: '#b91c1c' }}>SDG 4 • QUALITY EDUCATION</span>
            <Award size={18} color="#b91c1c" />
          </div>
          <div style={{ fontSize: '1.35rem', fontWeight: 800, color: '#0f172a', marginTop: 4 }}>{loading ? '...' : (sdg4?.verified_classroom_qr_scans ?? 0).toLocaleString()}</div>
          <div style={{ fontSize: '0.72rem', color: '#64748b', fontWeight: 600 }}>Verified Classroom USB QR Scans</div>
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.73rem', color: '#475569', marginTop: 4 }}>
            <span>Critical SARDO Risk:</span>
            <strong style={{ color: '#dc2626' }}>{sardoData?.critical_sardo_count ?? 0} Learners</strong>
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.73rem', color: '#475569' }}>
            <span>Early-Warning Watch:</span>
            <strong style={{ color: '#d97706' }}>{sardoData?.early_warning_count ?? 0} Learners</strong>
          </div>
        </div>

        <div style={{ backgroundColor: '#f8fafc', borderRadius: 10, border: '1px solid #e2e8f0', padding: 14, display: 'flex', flexDirection: 'column', gap: 6 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ fontSize: '0.64rem', fontWeight: 800, padding: '2px 7px', borderRadius: 6, backgroundColor: '#e0f2fe', color: '#0369a1' }}>SDG 5 &amp; 10 • EQUALITY &amp; INCLUSION</span>
            <Users size={18} color="#0369a1" />
          </div>
          <div style={{ fontSize: '1.35rem', fontWeight: 800, color: '#0f172a', marginTop: 4 }}>{loading ? '...' : `${sdg5?.male_attendance_rate_today ?? 0}% M / ${sdg5?.female_attendance_rate_today ?? 0}% F`}</div>
          <div style={{ fontSize: '0.72rem', color: '#64748b', fontWeight: 600 }}>Live Gender Attendance Parity Today</div>
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.73rem', color: '#475569', marginTop: 4 }}>
            <span>Enrolled Male / Female:</span>
            <strong>{sdg5?.male_learners ?? 0} M • {sdg5?.female_learners ?? 0} F</strong>
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.73rem', color: '#475569' }}>
            <span>4Ps / CCT Beneficiaries:</span>
            <strong style={{ color: '#0284c7' }}>{sdg5?.cct_4ps_beneficiaries_monitored ?? 0} Monitored</strong>
          </div>
        </div>

        <div style={{ backgroundColor: '#f8fafc', borderRadius: 10, border: '1px solid #e2e8f0', padding: 14, display: 'flex', flexDirection: 'column', gap: 6 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ fontSize: '0.64rem', fontWeight: 800, padding: '2px 7px', borderRadius: 6, backgroundColor: '#dcfce7', color: '#15803d' }}>SDG 12 &amp; 13 • CLIMATE &amp; ROI</span>
            <Leaf size={18} color="#15803d" />
          </div>
          <div style={{ fontSize: '1.35rem', fontWeight: 800, color: '#059669', marginTop: 4 }}>{loading ? '...' : `${sdg12?.estimated_co2_reduced_kg ?? 180} kg CO2e`}</div>
          <div style={{ fontSize: '0.72rem', color: '#64748b', fontWeight: 600 }}>Carbon Reduced &amp; Zero Gate Hardware E-Waste</div>
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.73rem', color: '#475569', marginTop: 4 }}>
            <span>Paper Sheets Saved:</span>
            <strong>{(sdg12?.paper_sheets_saved ?? 0).toLocaleString()} Sheets</strong>
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.73rem', color: '#475569' }}>
            <span>Est. Annual Savings:</span>
            <strong style={{ color: '#059669' }}>PHP {(sdg12?.estimated_annual_savings_php ?? 145000).toLocaleString()}</strong>
          </div>
        </div>

        <div style={{ backgroundColor: '#f8fafc', borderRadius: 10, border: '1px solid #e2e8f0', padding: 14, display: 'flex', flexDirection: 'column', gap: 6 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ fontSize: '0.64rem', fontWeight: 800, padding: '2px 7px', borderRadius: 6, backgroundColor: '#ede9fe', color: '#6d28d9' }}>SDG 16 • ACCOUNTABLE SCHOOLS</span>
            <Smartphone size={18} color="#6d28d9" />
          </div>
          <div style={{ fontSize: '1.35rem', fontWeight: 800, color: '#0f172a', marginTop: 4 }}>{loading ? '...' : `${sdg16?.faculty_face_gps_verified_today ?? 0} / ${sdg16?.total_active_faculty ?? 0}`}</div>
          <div style={{ fontSize: '0.72rem', color: '#64748b', fontWeight: 600 }}>Faculty Verified via Mobile Face &amp; GPS Today</div>
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.73rem', color: '#475569', marginTop: 4 }}>
            <span>Parent Push Alerts:</span>
            <strong>{(sdg12?.mobile_push_alerts_delivered ?? 0).toLocaleString()} Delivered</strong>
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.73rem', color: '#475569' }}>
            <span>Audit Logs (Month):</span>
            <strong>{(sdg16?.tamper_evident_audit_logs_this_month ?? 0).toLocaleString()} Records</strong>
          </div>
        </div>
      </div>

      <div style={{ backgroundColor: '#f8fafc', borderRadius: 10, border: '1px solid #e2e8f0', padding: 14 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 8 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <AlertTriangle size={17} color={atRiskStudents.length > 0 ? '#dc2626' : '#059669'} />
            <span style={{ fontSize: '0.88rem', fontWeight: 800, color: '#0f172a' }}>
              SARDO Dropout Early-Warning Class List (Last 30 Days: {atRiskStudents.length} Flagged)
            </span>
          </div>
          {atRiskStudents.length > 0 && (
            <button type="button" onClick={() => setShowAtRiskList(!showAtRiskList)} style={{ padding: '4px 10px', borderRadius: 6, border: '1px solid #cbd5e1', backgroundColor: '#ffffff', fontSize: '0.72rem', fontWeight: 700, cursor: 'pointer' }}>
              {showAtRiskList ? 'Hide Class List' : 'Show Class List'}
            </button>
          )}
        </div>

        {atRiskStudents.length === 0 ? (
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 8, padding: '8px 12px', borderRadius: 8, backgroundColor: '#ecfdf5', color: '#065f46', fontSize: '0.78rem', fontWeight: 700 }}>
            <CheckCircle2 size={16} color="#059669" />
            <span>Zero students are currently at risk of dropping out over the last 30 days. All class lists have healthy attendance.</span>
          </div>
        ) : (
          showAtRiskList && (
            <div style={{ overflowX: 'auto', marginTop: 10 }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.78rem', backgroundColor: '#ffffff', borderRadius: 8 }}>
                <thead>
                  <tr style={{ backgroundColor: '#f1f5f9', textAlign: 'left' }}>
                    <th style={{ padding: '8px 10px' }}>Learner Name &amp; LRN</th>
                    <th style={{ padding: '8px 10px' }}>Grade &amp; Section</th>
                    <th style={{ padding: '8px 10px' }}>30-Day Attendance</th>
                    <th style={{ padding: '8px 10px' }}>Risk Level</th>
                    <th style={{ padding: '8px 10px' }}>Recommended Action</th>
                  </tr>
                </thead>
                <tbody>
                  {atRiskStudents.slice(0, 10).map((st: any) => {
                    const isCritical = st.risk_level === 'CRITICAL_SARDO';
                    return (
                      <tr key={st.student_id} style={{ borderTop: '1px solid #e2e8f0' }}>
                        <td style={{ padding: '8px 10px' }}>
                          <div style={{ fontWeight: 800, color: '#0f172a' }}>{st.full_name}</div>
                          <div style={{ fontSize: '0.7rem', color: '#64748b' }}>LRN: {st.lrn} {st.is_4ps_beneficiary ? '• 4Ps Beneficiary' : ''}</div>
                        </td>
                        <td style={{ padding: '8px 10px' }}>{st.section}</td>
                        <td style={{ padding: '8px 10px' }}>
                          <span style={{ color: '#dc2626', fontWeight: 700 }}>{st.absent_days_30d} Absent</span>
                          {' • '}
                          <span style={{ color: '#d97706', fontWeight: 700 }}>{st.cutting_days_30d} Cutting</span>
                          {' • '}
                          <span style={{ color: '#64748b' }}>{st.late_days_30d} Late</span>
                        </td>
                        <td style={{ padding: '8px 10px' }}>
                          <span style={{ padding: '3px 8px', borderRadius: 10, fontSize: '0.68rem', fontWeight: 800, backgroundColor: isCritical ? '#fef2f2' : '#fffbeb', color: isCritical ? '#dc2626' : '#d97706' }}>
                            {isCritical ? 'CRITICAL SARDO' : 'EARLY WARNING'} ({st.risk_score}%)
                          </span>
                        </td>
                        <td style={{ padding: '8px 10px', fontSize: '0.74rem', color: '#334155' }}>{st.recommended_intervention}</td>
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

export default EnterpriseSDGWidget;
