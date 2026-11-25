/**
 * AttendSure - DepEd Campus Safety, SARDO Early-Warning, Division Data Export & Emergency Roll-Call
 * File: web/src/components/dashboard/EnterpriseSDGWidget.tsx
 */

import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  AlertTriangle,
  Award,
  Briefcase,
  CheckCircle2,
  Download,
  FileSpreadsheet,
  Leaf,
  Lock,
  RefreshCw,
  ShieldAlert,
  ShieldCheck,
  Smartphone,
  Users,
  X,
} from 'lucide-react';
import apiClient from '../../api/client';
import { API_ROUTES, extractApiError } from '../../api/routes';
import { useApiResource } from '../../hooks/useApiResource';
import { useTheme } from '../../context/ThemeContext';
import { getCurrentUserFromStorage, isSchoolLeader } from '../../utils/permissions';

interface EmergencyStudent {
  student_id: number;
  lrn: string;
  full_name: string;
  section: string;
  guardian_contact?: string;
}

interface EmergencyTeacher {
  teacher_id: number;
  employee_id: string;
  full_name: string;
  department: string;
}

interface EmergencyRollCallData {
  timestamp: string;
  total_people_on_campus: number;
  students_count: number;
  teachers_count: number;
  students: EmergencyStudent[];
  teachers: EmergencyTeacher[];
}

export const EnterpriseSDGWidget: React.FC = () => {
  const { tokens, brand } = useTheme();
  const isLeader = isSchoolLeader(getCurrentUserFromStorage());

  const { data: impactData, loading: loadingImpact, reload: reloadImpact } = useApiResource<any>(
    API_ROUTES.reports.sdgImpact,
    null
  );
  const { data: sardoData, loading: loadingSardo, reload: reloadSardo } = useApiResource<any>(
    API_ROUTES.reports.dropoutRisk,
    null
  );

  const [showAtRiskList, setShowAtRiskList] = useState<boolean>(true);
  const [rollCallOpen, setRollCallOpen] = useState<boolean>(false);
  const [rollCallLoading, setRollCallLoading] = useState<boolean>(false);
  const [rollCallData, setRollCallData] = useState<EmergencyRollCallData | null>(null);
  const [rollCallSearch, setRollCallSearch] = useState<string>('');
  const [safeStudentIds, setSafeStudentIds] = useState<Record<number, boolean>>({});
  const [exportingFormat, setExportingFormat] = useState<'json' | 'csv' | null>(null);
  const [maskPersonalIds, setMaskPersonalIds] = useState<boolean>(true);
  const [exportStatus, setExportStatus] = useState<string | null>(null);

  const rollCallAbortRef = useRef<AbortController | null>(null);
  const exportAbortRef = useRef<AbortController | null>(null);
  const revokeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    return () => {
      rollCallAbortRef.current?.abort();
      exportAbortRef.current?.abort();
      if (revokeTimerRef.current) clearTimeout(revokeTimerRef.current);
    };
  }, []);

  const loading = loadingImpact || loadingSardo;

  const handleRefresh = () => {
    void reloadImpact(false, true);
    void reloadSardo(false, true);
  };

  const handleOpenEmergencyRollCall = async () => {
    rollCallAbortRef.current?.abort();
    const controller = new AbortController();
    rollCallAbortRef.current = controller;

    setRollCallOpen(true);
    setRollCallLoading(true);
    try {
      const res = await apiClient.get(API_ROUTES.campus.rollCall, {
        params: { nocache: 1 },
        signal: controller.signal,
      });
      if (controller.signal.aborted) return;
      setRollCallData(res.data);
    } catch (err: unknown) {
      const anyErr = err as { name?: string; code?: string };
      if (
        controller.signal.aborted ||
        anyErr?.name === 'CanceledError' ||
        anyErr?.name === 'AbortError' ||
        anyErr?.code === 'ERR_CANCELED'
      ) {
        return;
      }
      setRollCallData(null);
    } finally {
      if (!controller.signal.aborted) {
        setRollCallLoading(false);
      }
    }
  };

  const handleCloseEmergencyRollCall = () => {
    rollCallAbortRef.current?.abort();
    setRollCallOpen(false);
  };

  const toggleStudentSafe = (studentId: number) => {
    setSafeStudentIds((prev) => ({
      ...prev,
      [studentId]: !prev[studentId],
    }));
  };

  const handleDivisionExport = async (exportFmt: 'json' | 'csv') => {
    exportAbortRef.current?.abort();
    const controller = new AbortController();
    exportAbortRef.current = controller;

    setExportingFormat(exportFmt);
    setExportStatus(null);
    try {
      const res = await apiClient.get(API_ROUTES.reports.divisionExport, {
        params: {
          days: 30,
          anonymize: maskPersonalIds ? 1 : 0,
          export_format: exportFmt,
        },
        responseType: exportFmt === 'csv' ? 'text' : 'json',
        signal: controller.signal,
      });
      if (controller.signal.aborted) return;

      const today = new Date().toISOString().slice(0, 10);
      const modeTag = maskPersonalIds ? 'privacy_masked' : 'official';
      const content =
        exportFmt === 'csv'
          ? String(res.data || '')
          : JSON.stringify(res.data, null, 2);
      const mime = exportFmt === 'csv' ? 'text/csv;charset=utf-8' : 'application/json';
      const blob = new Blob([content], { type: mime });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `attendsure_deped_division_export_${modeTag}_${today}.${exportFmt}`;
      a.click();
      if (revokeTimerRef.current) clearTimeout(revokeTimerRef.current);
      revokeTimerRef.current = setTimeout(() => {
        URL.revokeObjectURL(url);
      }, 1000);

      const eventCount =
        exportFmt === 'json' ? res.data?.recordCounts?.studentSchoolAttendanceEvents ?? 0 : null;
      setExportStatus(
        exportFmt === 'csv'
          ? `Downloaded DepEd Division Data Export (.CSV • ${
              maskPersonalIds ? 'Privacy-Masked' : 'Full Official'
            }).`
          : `Downloaded DepEd Division Data Export (.JSON • ${eventCount} attendance events • ${
              maskPersonalIds ? 'Privacy-Masked' : 'Full Official'
            }).`
      );
    } catch (err: unknown) {
      const anyErr = err as { name?: string; code?: string };
      if (
        controller.signal.aborted ||
        anyErr?.name === 'CanceledError' ||
        anyErr?.name === 'AbortError' ||
        anyErr?.code === 'ERR_CANCELED'
      ) {
        return;
      }
      setExportStatus(
        extractApiError(
          err,
          'DepEd Division Data Export requires School Leadership permissions (Admin / Principal / Department Head).'
        )
      );
    } finally {
      if (!controller.signal.aborted) {
        setExportingFormat(null);
      }
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

  const eduMetrics = impactData?.sdg_metrics?.sdg_4_quality_education;
  const inclusionMetrics = impactData?.sdg_metrics?.sdg_5_and_10_equality_and_inclusion;
  const workloadMetrics = impactData?.sdg_metrics?.sdg_8_decent_work;
  const paperlessMetrics = impactData?.sdg_metrics?.sdg_12_and_13_climate_and_sustainability;
  const governanceMetrics = impactData?.sdg_metrics?.sdg_16_accountable_institutions;
  const atRiskStudents = Array.isArray(sardoData?.at_risk_students) ? sardoData.at_risk_students : [];

  return (
    <div style={{ ...containerStyle, backgroundColor: tokens.bgSurface, borderColor: tokens.borderSubtle }}>
      <div style={headerBarStyle}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
            <span style={{ ...badgePillStyle, backgroundColor: tokens.primaryLight, color: brand.primary }}>
              <ShieldAlert size={13} /> DEPED CAMPUS SAFETY &amp; SARDO MONITORING
            </span>
            <span style={{ ...privacyPillStyle, backgroundColor: tokens.successLight, color: brand.success }}>
              <ShieldCheck size={13} /> DepEd PH &bull; Data Privacy Act (RA 10173) &bull; Pure Software
            </span>
          </div>
          <h3 style={{ margin: '4px 0 0', fontSize: '1.08rem', fontWeight: 900, color: tokens.textPrimary }}>
            School Operations, SARDO Early-Warning &amp; Emergency Campus Roll-Call
          </h3>
          <p style={{ margin: 0, fontSize: '0.78rem', color: tokens.textSecondary }}>
            Live school data from Built-In Camera QR Scans, Teacher Phone Fingerprint / Biometric &amp; Campus GPS Time In / Time Out, and Campus Geofence Loafing Audits
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
              color: tokens.onPrimary,
              fontSize: '0.76rem',
              fontWeight: 800,
              cursor: 'pointer',
            }}
          >
            <ShieldAlert size={14} /> Emergency Campus Roll-Call
          </button>

          {isLeader && (
            <>
              <label
                title="Replaces personal learner and teacher identifiers with privacy-safe codes under the Philippine Data Privacy Act (RA 10173)"
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: 6,
                  padding: '6px 10px',
                  borderRadius: 8,
                  border: `1px solid ${tokens.borderStrong}`,
                  backgroundColor: tokens.bgSurfaceSubtle,
                  color: tokens.textPrimary,
                  fontSize: '0.72rem',
                  fontWeight: 700,
                  cursor: 'pointer',
                }}
              >
                <input
                  type="checkbox"
                  checked={maskPersonalIds}
                  onChange={(e) => setMaskPersonalIds(e.target.checked)}
                  style={{ accentColor: brand.success }}
                />
                <Lock size={12} color={brand.success} /> Privacy Mask (RA 10173)
              </label>

              <button
                type="button"
                onClick={() => void handleDivisionExport('json')}
                disabled={exportingFormat !== null}
                style={{
                  ...secondaryBtnStyle,
                  backgroundColor: tokens.primaryLight,
                  borderColor: brand.primary,
                  color: brand.primary,
                }}
              >
                <Download size={14} />
                {exportingFormat === 'json'
                  ? 'Exporting JSON...'
                  : 'DepEd Division Data Export (.JSON)'}
              </button>

              <button
                type="button"
                onClick={() => void handleDivisionExport('csv')}
                disabled={exportingFormat !== null}
                style={{
                  ...secondaryBtnStyle,
                  backgroundColor: tokens.successLight,
                  borderColor: brand.success,
                  color: brand.success,
                }}
              >
                <FileSpreadsheet size={14} />
                {exportingFormat === 'csv'
                  ? 'Exporting CSV...'
                  : 'DepEd Division Data Export (.CSV)'}
              </button>
            </>
          )}

          <button
            type="button"
            onClick={handleRefresh}
            disabled={loading}
            style={{
              ...secondaryBtnStyle,
              backgroundColor: tokens.bgSurfaceSubtle,
              borderColor: tokens.borderStrong,
              color: tokens.textPrimary,
            }}
          >
            <RefreshCw size={14} className={loading ? 'animate-spin' : ''} /> {loading ? 'Updating...' : 'Refresh'}
          </button>
        </div>
      </div>

      {exportStatus && (
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            padding: '8px 12px',
            borderRadius: 8,
            backgroundColor: tokens.successLight,
            color: brand.success,
            fontSize: '0.76rem',
            fontWeight: 700,
          }}
        >
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
            <CheckCircle2 size={14} /> {exportStatus}
          </span>
          <button
            type="button"
            onClick={() => setExportStatus(null)}
            style={{ background: 'none', border: 'none', color: brand.success, cursor: 'pointer' }}
          >
            <X size={14} />
          </button>
        </div>
      )}

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
                <ShieldAlert size={18} /> EMERGENCY EVACUATION CAMPUS ROLL-CALL
              </div>
              <div style={{ fontSize: '0.76rem', color: tokens.textSecondary }}>
                {rollCallData
                  ? `Snapshot as of ${rollCallData.timestamp} • ${rollCallData.total_people_on_campus} People Verified on Campus`
                  : 'Loading live campus headcount...'}
              </div>
            </div>

            <button
              type="button"
              onClick={handleCloseEmergencyRollCall}
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
              Fetching active learner and teacher headcount...
            </div>
          ) : rollCallData ? (
            <>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(170px, 1fr))', gap: 10 }}>
                <div style={{ backgroundColor: tokens.bgSurface, padding: 10, borderRadius: 8, border: `1px solid ${tokens.borderSubtle}` }}>
                  <div style={{ fontSize: '0.68rem', fontWeight: 800, color: tokens.textMuted }}>LEARNERS ON CAMPUS</div>
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
                  <div style={{ fontSize: '0.68rem', fontWeight: 800, color: brand.primary }}>TEACHERS ON CAMPUS</div>
                  <div style={{ fontSize: '1.3rem', fontWeight: 800, color: brand.primary }}>{rollCallData.teachers_count ?? 0}</div>
                </div>
              </div>

              <input
                type="text"
                maxLength={80}
                value={rollCallSearch}
                onChange={(e) => setRollCallSearch(e.target.value.replace(/[\u0000-\u001F\u007F<>]/g, ''))}
                placeholder="Filter learner class list by name, 12-digit LRN, or section..."
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
                    No learners currently checked in on campus today.
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
                              LRN: {st.lrn} &bull; {st.section}
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

      <div style={cardsGridStyle}>
        <div style={{ ...cardStyle, backgroundColor: tokens.bgSurfaceSubtle, borderColor: tokens.borderSubtle }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ ...pillTagStyle, backgroundColor: tokens.dangerLight, color: brand.danger }}>
              CLASSROOM ATTENDANCE &amp; SARDO
            </span>
            <Award size={18} color={brand.danger} />
          </div>
          <div style={{ ...metricValueStyle, color: tokens.textPrimary }}>
            {loading ? '...' : (eduMetrics?.verified_classroom_qr_scans ?? 0).toLocaleString()}
          </div>
          <div style={{ ...metricSubStyle, color: tokens.textMuted }}>
            Verified Signed Classroom QR Scans ({eduMetrics?.attendance_rate_today ?? 0}% Present Today)
          </div>
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
            <span style={{ ...pillTagStyle, backgroundColor: tokens.infoLight, color: brand.secondary }}>
              LEARNER INCLUSION &amp; 4Ps TRACKING
            </span>
            <Users size={18} color={brand.secondary} />
          </div>
          <div style={{ ...metricValueStyle, color: tokens.textPrimary }}>
            {loading
              ? '...'
              : `${inclusionMetrics?.male_attendance_rate_today ?? 0}% M / ${inclusionMetrics?.female_attendance_rate_today ?? 0}% F`}
          </div>
          <div style={{ ...metricSubStyle, color: tokens.textMuted }}>
            Live Gender Parity Index: {inclusionMetrics?.gender_parity_index ?? '1.00'}
          </div>
          <div style={{ ...dividerStyle, backgroundColor: tokens.borderSubtle }} />
          <div style={{ ...metaRowStyle, color: tokens.textSecondary }}>
            <span>Enrolled Male / Female:</span>
            <strong style={{ color: tokens.textPrimary }}>
              {inclusionMetrics?.male_learners ?? 0} M &bull; {inclusionMetrics?.female_learners ?? 0} F
            </strong>
          </div>
          <div style={{ ...metaRowStyle, color: tokens.textSecondary }}>
            <span>4Ps / CCT Beneficiaries:</span>
            <strong style={{ color: brand.secondary }}>{inclusionMetrics?.cct_4ps_beneficiaries_monitored ?? 0} Learners</strong>
          </div>
        </div>

        <div style={{ ...cardStyle, backgroundColor: tokens.bgSurfaceSubtle, borderColor: tokens.borderSubtle }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ ...pillTagStyle, backgroundColor: tokens.warningLight, color: brand.warning }}>
              TEACHER WORKLOAD &amp; SAVINGS
            </span>
            <Briefcase size={18} color={brand.warning} />
          </div>
          <div style={{ ...metricValueStyle, color: tokens.textPrimary }}>
            {loading ? '...' : `${workloadMetrics?.teacher_hours_saved_monthly ?? 0} hrs/mo`}
          </div>
          <div style={{ ...metricSubStyle, color: tokens.textMuted }}>
            Teacher Clerical Time Saved on SF1/SF2/DTR
          </div>
          <div style={{ ...dividerStyle, backgroundColor: tokens.borderSubtle }} />
          <div style={{ ...metaRowStyle, color: tokens.textSecondary }}>
            <span>Pure-Software Savings:</span>
            <strong style={{ color: brand.success }}>
              PHP {((workloadMetrics?.zero_hardware_capex_saved_usd ?? 0) * 56).toLocaleString()}
            </strong>
          </div>
          <div style={{ ...metaRowStyle, color: tokens.textSecondary }}>
            <span>Active Class Schedules:</span>
            <strong style={{ color: tokens.textPrimary }}>{workloadMetrics?.active_schedules ?? 0} Periods</strong>
          </div>
        </div>

        <div style={{ ...cardStyle, backgroundColor: tokens.bgSurfaceSubtle, borderColor: tokens.borderSubtle }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ ...pillTagStyle, backgroundColor: tokens.successLight, color: brand.success }}>
              PAPERLESS SCHOOL OPERATIONS
            </span>
            <Leaf size={18} color={brand.success} />
          </div>
          <div style={{ ...metricValueStyle, color: brand.success }}>
            {loading ? '...' : `${(paperlessMetrics?.paper_sheets_saved ?? 0).toLocaleString()} Sheets`}
          </div>
          <div style={{ ...metricSubStyle, color: tokens.textMuted }}>
            Paper Class Lists Saved ({paperlessMetrics?.estimated_co2_reduced_kg ?? 0} kg CO2e reduced)
          </div>
          <div style={{ ...dividerStyle, backgroundColor: tokens.borderSubtle }} />
          <div style={{ ...metaRowStyle, color: tokens.textSecondary }}>
            <span>Hardware Waste Avoided:</span>
            <strong style={{ color: tokens.textPrimary }}>{paperlessMetrics?.hardware_ewaste_avoided_kg ?? 0} kg</strong>
          </div>
          <div style={{ ...metaRowStyle, color: tokens.textSecondary }}>
            <span>Est. Annual Savings:</span>
            <strong style={{ color: brand.success }}>
              PHP {(paperlessMetrics?.estimated_annual_savings_php ?? 0).toLocaleString()}
            </strong>
          </div>
        </div>

        <div style={{ ...cardStyle, backgroundColor: tokens.bgSurfaceSubtle, borderColor: tokens.borderSubtle }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ ...pillTagStyle, backgroundColor: tokens.accentPurpleBg, color: brand.accentPurple }}>
              CAMPUS GEOFENCE &amp; AUDIT TRAIL
            </span>
            <Smartphone size={18} color={brand.accentPurple} />
          </div>
          <div style={{ ...metricValueStyle, color: tokens.textPrimary }}>
            {loading
              ? '...'
              : `${governanceMetrics?.teachers_face_gps_verified_today ?? 0} / ${governanceMetrics?.total_active_teachers ?? 0}`}
          </div>
          <div style={{ ...metricSubStyle, color: tokens.textMuted }}>
            Teachers Verified via Phone Fingerprint / Biometric &amp; Campus GPS Today
          </div>
          <div style={{ ...dividerStyle, backgroundColor: tokens.borderSubtle }} />
          <div style={{ ...metaRowStyle, color: tokens.textSecondary }}>
            <span>Open Loafing &amp; Cutting Alerts:</span>
            <strong style={{ color: tokens.textPrimary }}>
              {(governanceMetrics?.open_loafing_incidents ?? 0).toLocaleString()} Active
            </strong>
          </div>
          <div style={{ ...metaRowStyle, color: tokens.textSecondary }}>
            <span>Audit Logs (Month):</span>
            <strong style={{ color: tokens.textPrimary }}>
              {(governanceMetrics?.tamper_evident_audit_logs_this_month ?? 0).toLocaleString()} Records
            </strong>
          </div>
        </div>
      </div>

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
              style={{
                ...toggleBtnStyle,
                backgroundColor: tokens.bgSurface,
                borderColor: tokens.borderStrong,
                color: tokens.textPrimary,
              }}
            >
              {showAtRiskList ? 'Hide Class List' : 'Show Class List'}
            </button>
          )}
        </div>

        {atRiskStudents.length === 0 ? (
          <div style={{ ...healthyBannerStyle, backgroundColor: tokens.successLight, color: brand.success }}>
            <CheckCircle2 size={16} color={brand.success} />
            <span>
              Zero learners are currently flagged for SARDO dropout risk over the last 30 days. All class lists have healthy attendance.
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
                    <th style={{ ...thStyle, color: tokens.textMuted }}>SARDO Risk Score</th>
                    <th style={{ ...thStyle, color: tokens.textMuted }}>Recommended Intervention</th>
                  </tr>
                </thead>
                <tbody>
                  {atRiskStudents.slice(0, 12).map((st: any) => {
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
  gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 230px), 1fr))',
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

const pillTagStyle: React.CSSProperties = {
  fontSize: '0.64rem',
  fontWeight: 900,
  padding: '3px 8px',
  borderRadius: 999,
  letterSpacing: '0.04em',
};

const metricValueStyle: React.CSSProperties = {
  fontSize: '1.35rem',
  fontWeight: 900,
  marginTop: 4,
};

const metricSubStyle: React.CSSProperties = {
  fontSize: '0.72rem',
  lineHeight: 1.35,
};

const dividerStyle: React.CSSProperties = {
  height: 1,
  margin: '4px 0',
};

const metaRowStyle: React.CSSProperties = {
  display: 'flex',
  justifyContent: 'space-between',
  alignItems: 'center',
  fontSize: '0.72rem',
};

const sardoBoxStyle: React.CSSProperties = {
  borderRadius: 10,
  borderWidth: 1,
  borderStyle: 'solid',
  padding: 14,
};

const toggleBtnStyle: React.CSSProperties = {
  padding: '5px 10px',
  borderRadius: 6,
  borderWidth: 1,
  borderStyle: 'solid',
  fontSize: '0.72rem',
  fontWeight: 700,
  cursor: 'pointer',
};

const healthyBannerStyle: React.CSSProperties = {
  marginTop: 10,
  padding: '10px 12px',
  borderRadius: 8,
  display: 'flex',
  alignItems: 'center',
  gap: 8,
  fontSize: '0.78rem',
  fontWeight: 700,
};

const tableStyle: React.CSSProperties = {
  width: '100%',
  borderCollapse: 'collapse',
  borderRadius: 8,
  overflow: 'hidden',
};

const thStyle: React.CSSProperties = {
  padding: '8px 10px',
  fontSize: '0.68rem',
  fontWeight: 800,
  textTransform: 'uppercase',
};

const tdStyle: React.CSSProperties = {
  padding: '9px 10px',
  fontSize: '0.78rem',
  verticalAlign: 'middle',
};

export default EnterpriseSDGWidget;
