/**
 * AttendSure Mobile - DepEd Campus Safety, SARDO Early-Warning & Emergency Roll-Call
 * File: mobile/src/screens/SardoSafetyScreen.tsx
 *
 * 100% content parity with web EnterpriseSDGWidget:
 * - Emergency Evacuation Campus Roll-Call checklist (live headcount + safe check-off)
 * - DepEd Division Data Export (.JSON / .CSV) with Philippine Data Privacy Act (RA 10173) mask
 * - Live School Operations & Attendance Equity metrics
 * - 30-Day SARDO Dropout Early-Warning Class List with recommended interventions
 */

import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  TextInput,
  Modal,
  Switch,
  RefreshControl,
  ActivityIndicator,
  Share,
  Platform,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { apiClient } from '../api/client';
import { ENDPOINTS } from '../api/endpoints';
import { useAuth } from '../context/AuthContext';
import { useThemeMode } from '../context/ThemeContext';
import { getFriendlyErrorMessage, type ThemePalette } from '../constants/theme';
import { isSchoolLeader } from '../utils/permissions';
import { showNotice } from '../utils/helpers';

interface EmergencyStudent {
  student_id: number;
  lrn: string;
  full_name: string;
  section: string;
  guardian_contact?: string;
}

interface EmergencyRollCallData {
  timestamp: string;
  total_people_on_campus: number;
  students_count: number;
  teachers_count: number;
  students: EmergencyStudent[];
}

export const SardoSafetyScreen: React.FC = () => {
  const { user } = useAuth();
  const { palette, fonts } = useThemeMode();
  const styles = useMemo(() => createStyles(palette, fonts), [palette, fonts]);
  const leader = isSchoolLeader(user);

  const [impactData, setImpactData] = useState<any>(null);
  const [sardoData, setSardoData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const [rollCallOpen, setRollCallOpen] = useState(false);
  const [rollCallLoading, setRollCallLoading] = useState(false);
  const [rollCallData, setRollCallData] = useState<EmergencyRollCallData | null>(null);
  const [rollCallSearch, setRollCallSearch] = useState('');
  const [safeStudentIds, setSafeStudentIds] = useState<Record<number, boolean>>({});

  const [maskPersonalIds, setMaskPersonalIds] = useState(true);
  const [exportingFormat, setExportingFormat] = useState<'json' | 'csv' | null>(null);

  const isMounted = useRef(true);

  const loadData = useCallback(async (silent = false) => {
    if (!silent && isMounted.current) setLoading(true);
    try {
      const [impRes, sardoRes] = await Promise.allSettled([
        apiClient.get(ENDPOINTS.REPORT_SDG_IMPACT),
        apiClient.get(ENDPOINTS.REPORT_DROPOUT_RISK),
      ]);
      if (!isMounted.current) return;
      if (impRes.status === 'fulfilled' && impRes.value?.data) {
        setImpactData(impRes.value.data);
      }
      if (sardoRes.status === 'fulfilled' && sardoRes.value?.data) {
        setSardoData(sardoRes.value.data);
      }
    } catch {}
    finally {
      if (isMounted.current) {
        setLoading(false);
        setRefreshing(false);
      }
    }
  }, []);

  useEffect(() => {
    isMounted.current = true;
    void loadData(false);
    return () => {
      isMounted.current = false;
    };
  }, [loadData]);

  const handleOpenRollCall = async () => {
    setRollCallOpen(true);
    setRollCallLoading(true);
    try {
      const res = await apiClient.get<EmergencyRollCallData>(ENDPOINTS.CAMPUS_ROLL_CALL, {
        params: { nocache: 1 },
      });
      if (isMounted.current) {
        setRollCallData(res.data);
      }
    } catch (err: unknown) {
      if (isMounted.current) {
        showNotice('Roll-Call Error', getFriendlyErrorMessage(err, 'Could not load campus headcount.'));
      }
    } finally {
      if (isMounted.current) setRollCallLoading(false);
    }
  };

  const toggleStudentSafe = (studentId: number) => {
    setSafeStudentIds((prev) => ({ ...prev, [studentId]: !prev[studentId] }));
  };

  const handleDivisionExport = async (fmt: 'json' | 'csv') => {
    if (!leader || exportingFormat) return;
    setExportingFormat(fmt);
    try {
      const res = await apiClient.get(ENDPOINTS.REPORT_DIVISION_EXPORT, {
        params: {
          days: 30,
          anonymize: maskPersonalIds ? 1 : 0,
          export_format: fmt,
        },
        responseType: fmt === 'csv' ? 'text' : 'json',
      });
      const content =
        fmt === 'csv' ? String(res.data || '') : JSON.stringify(res.data, null, 2);
      const today = new Date().toISOString().slice(0, 10);
      const modeTag = maskPersonalIds ? 'privacy_masked' : 'official';
      const filename = `attendsure_deped_division_export_${modeTag}_${today}.${fmt}`;

      if (Platform.OS === 'web' && typeof document !== 'undefined') {
        const mime = fmt === 'csv' ? 'text/csv;charset=utf-8' : 'application/json';
        const blob = new Blob([content], { type: mime });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = filename;
        a.click();
        setTimeout(() => URL.revokeObjectURL(url), 1000);
        showNotice('Export Downloaded', `Saved ${filename}`);
      } else {
        await Share.share({
          title: filename,
          message: content.slice(0, 20000),
        });
      }
    } catch (err: unknown) {
      showNotice(
        'Export Failed',
        getFriendlyErrorMessage(err, 'Could not export DepEd Division report right now.')
      );
    } finally {
      if (isMounted.current) setExportingFormat(null);
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

  const metricsRoot = impactData?.sdg_metrics || {};
  const eduMetrics = metricsRoot.sdg_4_quality_education || {};
  const inclusionMetrics = metricsRoot.sdg_5_and_10_equality_and_inclusion || {};
  const workloadMetrics = metricsRoot.sdg_8_decent_work || {};
  const paperlessMetrics = metricsRoot.sdg_12_and_13_climate_and_sustainability || {};
  const governanceMetrics = metricsRoot.sdg_16_accountable_institutions || {};
  const atRiskStudents: any[] = Array.isArray(sardoData?.at_risk_students)
    ? sardoData.at_risk_students
    : [];

  return (
    <View style={styles.container}>
      <ScrollView
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={() => {
              setRefreshing(true);
              void loadData(true);
            }}
            colors={[palette.primary]}
            tintColor={palette.primary}
          />
        }
      >
        {/* Top Action Banner */}
        <View style={styles.card}>
          <Text style={styles.eyebrow}>DEPED CAMPUS SAFETY &amp; SARDO MONITORING</Text>
          <Text style={styles.title}>
            School Operations, SARDO Early-Warning &amp; Emergency Roll-Call
          </Text>
          <Text style={styles.subtext}>
            Live school metrics under DepEd PH &amp; Philippine Data Privacy Act (RA 10173).
          </Text>

          <TouchableOpacity
            style={styles.emergencyBtn}
            onPress={() => void handleOpenRollCall()}
            activeOpacity={0.85}
          >
            <Ionicons name="alert-circle-outline" size={18} color={palette.onPrimary} />
            <Text style={styles.emergencyBtnText}>Open Emergency Campus Roll-Call</Text>
          </TouchableOpacity>

          {leader && (
            <View style={styles.exportBox}>
              <View style={styles.rowBetween}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.exportTitle}>DepEd Division Data Export (30 Days)</Text>
                  <Text style={styles.exportSub}>
                    Mask personal IDs under Data Privacy Act (RA 10173)
                  </Text>
                </View>
                <Switch
                  value={maskPersonalIds}
                  onValueChange={setMaskPersonalIds}
                  trackColor={{ false: palette.borderStrong, true: palette.success }}
                  thumbColor={palette.onPrimary}
                />
              </View>

              <View style={styles.exportBtnRow}>
                <TouchableOpacity
                  style={styles.exportBtn}
                  disabled={exportingFormat !== null}
                  onPress={() => void handleDivisionExport('json')}
                >
                  <Ionicons name="download-outline" size={15} color={palette.primary} />
                  <Text style={styles.exportBtnText}>
                    {exportingFormat === 'json' ? 'Exporting...' : 'Export .JSON'}
                  </Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.exportBtn, { backgroundColor: palette.successLight, borderColor: palette.success }]}
                  disabled={exportingFormat !== null}
                  onPress={() => void handleDivisionExport('csv')}
                >
                  <Ionicons name="document-text-outline" size={15} color={palette.success} />
                  <Text style={[styles.exportBtnText, { color: palette.success }]}>
                    {exportingFormat === 'csv' ? 'Exporting...' : 'Export .CSV'}
                  </Text>
                </TouchableOpacity>
              </View>
            </View>
          )}
        </View>

        {/* Live KPI Cards Grid */}
        {loading ? (
          <View style={styles.centerBox}>
            <ActivityIndicator size="small" color={palette.primary} />
            <Text style={styles.subtext}>Loading live campus operations metrics...</Text>
          </View>
        ) : (
          <View style={styles.kpiGrid}>
            <View style={styles.kpiCard}>
              <Text style={styles.kpiTag}>CLASSROOM ATTENDANCE &amp; SARDO</Text>
              <Text style={styles.kpiBig}>
                {Number(eduMetrics.verified_classroom_qr_scans ?? 0).toLocaleString()}
              </Text>
              <Text style={styles.kpiSub}>
                Signed QR Scans ({eduMetrics.attendance_rate_today ?? 0}% Present Today)
              </Text>
              <Text style={styles.kpiMeta}>
                Critical SARDO: {sardoData?.critical_sardo_count ?? 0} • Early-Warning:{' '}
                {sardoData?.early_warning_count ?? 0}
              </Text>
            </View>

            <View style={styles.kpiCard}>
              <Text style={styles.kpiTag}>LEARNER INCLUSION &amp; 4Ps TRACKING</Text>
              <Text style={styles.kpiBig}>
                {inclusionMetrics.male_attendance_rate_today ?? 0}% M /{' '}
                {inclusionMetrics.female_attendance_rate_today ?? 0}% F
              </Text>
              <Text style={styles.kpiSub}>
                Gender Parity Index: {inclusionMetrics.gender_parity_index ?? '1.00'}
              </Text>
              <Text style={styles.kpiMeta}>
                4Ps Beneficiaries Monitored: {inclusionMetrics.cct_4ps_beneficiaries_monitored ?? 0}
              </Text>
            </View>

            <View style={styles.kpiCard}>
              <Text style={styles.kpiTag}>TEACHER WORKLOAD &amp; SAVINGS</Text>
              <Text style={styles.kpiBig}>
                {workloadMetrics.teacher_hours_saved_monthly ?? 0} hrs/mo
              </Text>
              <Text style={styles.kpiSub}>Clerical time saved on SF1 / SF2 / Form 48</Text>
              <Text style={styles.kpiMeta}>
                Active Class Periods: {workloadMetrics.active_schedules ?? 0}
              </Text>
            </View>

            <View style={styles.kpiCard}>
              <Text style={styles.kpiTag}>PAPERLESS SCHOOL OPERATIONS</Text>
              <Text style={[styles.kpiBig, { color: palette.success }]}>
                {Number(paperlessMetrics.paper_sheets_saved ?? 0).toLocaleString()} Sheets
              </Text>
              <Text style={styles.kpiSub}>
                Paper Class Lists Saved ({paperlessMetrics.estimated_co2_reduced_kg ?? 0} kg CO2e)
              </Text>
              <Text style={styles.kpiMeta}>
                Est. Annual Savings: PHP{' '}
                {Number(paperlessMetrics.estimated_annual_savings_php ?? 0).toLocaleString()}
              </Text>
            </View>

            <View style={styles.kpiCard}>
              <Text style={styles.kpiTag}>CAMPUS GEOFENCE &amp; AUDIT TRAIL</Text>
              <Text style={styles.kpiBig}>
                {governanceMetrics.teachers_face_gps_verified_today ?? 0} /{' '}
                {governanceMetrics.total_active_teachers ?? 0}
              </Text>
              <Text style={styles.kpiSub}>Teachers Verified via Phone Biometric &amp; GPS Today</Text>
              <Text style={styles.kpiMeta}>
                Open Alerts: {governanceMetrics.open_loafing_incidents ?? 0} • Audit Logs (Month):{' '}
                {governanceMetrics.tamper_evident_audit_logs_this_month ?? 0}
              </Text>
            </View>
          </View>
        )}

        {/* SARDO Dropout Early-Warning Class List */}
        <View style={styles.card}>
          <Text style={styles.title}>
            SARDO Dropout Early-Warning Class List ({atRiskStudents.length})
          </Text>
          {atRiskStudents.length === 0 ? (
            <View style={styles.healthyBox}>
              <Ionicons name="checkmark-circle-outline" size={20} color={palette.success} />
              <Text style={styles.healthyText}>
                Zero learners are flagged for SARDO dropout risk over the last 30 days.
              </Text>
            </View>
          ) : (
            atRiskStudents.map((st) => {
              const isCritical = st.risk_level === 'CRITICAL_SARDO';
              return (
                <View key={String(st.student_id)} style={styles.riskRow}>
                  <View style={styles.rowBetween}>
                    <Text style={styles.riskName}>{st.full_name}</Text>
                    <View
                      style={[
                        styles.riskBadge,
                        { backgroundColor: isCritical ? palette.dangerLight : palette.warningLight },
                      ]}
                    >
                      <Text
                        style={[
                          styles.riskBadgeText,
                          { color: isCritical ? palette.danger : palette.warning },
                        ]}
                      >
                        {isCritical ? 'CRITICAL' : 'WATCH'} ({st.risk_score}%)
                      </Text>
                    </View>
                  </View>
                  <Text style={styles.riskMeta}>
                    LRN: {st.lrn} &bull; {st.section}
                    {st.is_4ps_beneficiary ? ' • 4Ps' : ''}
                  </Text>
                  <Text style={styles.riskStats}>
                    {st.absent_days_30d} Absent &bull; {st.cutting_days_30d} Cutting &bull;{' '}
                    {st.late_days_30d} Late
                  </Text>
                  {st.recommended_intervention ? (
                    <Text style={styles.riskAction}>Action: {st.recommended_intervention}</Text>
                  ) : null}
                </View>
              );
            })
          )}
        </View>
      </ScrollView>

      {/* Emergency Evacuation Campus Roll-Call Modal */}
      <Modal
        visible={rollCallOpen}
        transparent
        animationType="slide"
        onRequestClose={() => setRollCallOpen(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalSheet}>
            <View style={styles.rowBetween}>
              <Text style={[styles.title, { color: palette.danger }]}>
                Emergency Campus Roll-Call
              </Text>
              <TouchableOpacity onPress={() => setRollCallOpen(false)}>
                <Ionicons name="close" size={22} color={palette.textMuted} />
              </TouchableOpacity>
            </View>

            {rollCallLoading ? (
              <View style={styles.centerBox}>
                <ActivityIndicator size="small" color={palette.danger} />
                <Text style={styles.subtext}>Fetching live campus headcount...</Text>
              </View>
            ) : rollCallData ? (
              <>
                <Text style={styles.subtext}>
                  Snapshot: {rollCallData.timestamp} &bull; {rollCallData.total_people_on_campus}{' '}
                  people verified on campus
                </Text>

                <View style={styles.rollStatsRow}>
                  <View style={styles.rollStatBox}>
                    <Text style={styles.rollStatVal}>{rollCallData.students_count}</Text>
                    <Text style={styles.rollStatLbl}>Students</Text>
                  </View>
                  <View style={styles.rollStatBox}>
                    <Text style={[styles.rollStatVal, { color: palette.success }]}>{safeCount}</Text>
                    <Text style={styles.rollStatLbl}>Safe</Text>
                  </View>
                  <View style={styles.rollStatBox}>
                    <Text style={[styles.rollStatVal, { color: palette.danger }]}>
                      {Math.max(0, rollCallData.students_count - safeCount)}
                    </Text>
                    <Text style={styles.rollStatLbl}>Unaccounted</Text>
                  </View>
                  <View style={styles.rollStatBox}>
                    <Text style={[styles.rollStatVal, { color: palette.primary }]}>
                      {rollCallData.teachers_count ?? 0}
                    </Text>
                    <Text style={styles.rollStatLbl}>Teachers</Text>
                  </View>
                </View>

                <TextInput
                  style={styles.searchInput}
                  value={rollCallSearch}
                  onChangeText={setRollCallSearch}
                  placeholder="Filter learner by name, LRN, or section..."
                  placeholderTextColor={palette.textMuted}
                />

                <ScrollView style={{ maxHeight: 320 }} contentContainerStyle={{ gap: 6 }}>
                  {filteredRollCallStudents.length === 0 ? (
                    <Text style={styles.subtext}>No learners currently checked in today.</Text>
                  ) : (
                    filteredRollCallStudents.map((st) => {
                      const isSafe = Boolean(safeStudentIds[st.student_id]);
                      return (
                        <TouchableOpacity
                          key={String(st.student_id)}
                          style={[
                            styles.rollRow,
                            isSafe && {
                              backgroundColor: palette.successLight,
                              borderColor: palette.success,
                            },
                          ]}
                          onPress={() => toggleStudentSafe(st.student_id)}
                        >
                          <Ionicons
                            name={isSafe ? 'checkbox' : 'square-outline'}
                            size={20}
                            color={isSafe ? palette.success : palette.textMuted}
                          />
                          <View style={{ flex: 1 }}>
                            <Text style={styles.riskName}>{st.full_name}</Text>
                            <Text style={styles.riskMeta}>
                              LRN: {st.lrn} &bull; {st.section}
                            </Text>
                          </View>
                          <Text
                            style={[
                              styles.riskBadgeText,
                              { color: isSafe ? palette.success : palette.danger },
                            ]}
                          >
                            {isSafe ? 'SAFE' : 'UNACCOUNTED'}
                          </Text>
                        </TouchableOpacity>
                      );
                    })
                  )}
                </ScrollView>
              </>
            ) : null}
          </View>
        </View>
      </Modal>
    </View>
  );
};

const createStyles = (palette: ThemePalette, fonts: ReturnType<typeof useThemeMode>['fonts']) =>
  StyleSheet.create({
    container: { flex: 1, backgroundColor: palette.background },
    scrollContent: { padding: 14, paddingBottom: 120, gap: 12 },
    card: {
      backgroundColor: palette.surface,
      borderRadius: 16,
      padding: 16,
      borderWidth: 1,
      borderColor: palette.border,
      gap: 10,
    },
    eyebrow: { fontSize: fonts.xxs, fontWeight: fonts.weight.extrabold, color: palette.primary },
    title: { fontSize: fonts.md, fontWeight: fonts.weight.extrabold, color: palette.textPrimary },
    subtext: { fontSize: fonts.xs, color: palette.textSecondary, lineHeight: 17 },
    emergencyBtn: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 8,
      height: 44,
      borderRadius: 12,
      backgroundColor: palette.dangerBg,
    },
    emergencyBtnText: {
      color: palette.onPrimary,
      fontSize: fonts.sm,
      fontWeight: fonts.weight.extrabold,
    },
    exportBox: {
      padding: 12,
      borderRadius: 12,
      backgroundColor: palette.surfaceSubtle,
      borderWidth: 1,
      borderColor: palette.border,
      gap: 10,
    },
    exportTitle: { fontSize: fonts.xs, fontWeight: fonts.weight.extrabold, color: palette.textPrimary },
    exportSub: { fontSize: fonts.xxs, color: palette.textSecondary },
    exportBtnRow: { flexDirection: 'row', gap: 8 },
    exportBtn: {
      flex: 1,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 6,
      height: 38,
      borderRadius: 9,
      backgroundColor: palette.primarySoft,
      borderWidth: 1,
      borderColor: palette.primary,
    },
    exportBtnText: { fontSize: fonts.xs, fontWeight: fonts.weight.extrabold, color: palette.primary },
    centerBox: { paddingVertical: 30, alignItems: 'center', gap: 8 },
    kpiGrid: { gap: 10 },
    kpiCard: {
      backgroundColor: palette.surface,
      borderRadius: 14,
      padding: 14,
      borderWidth: 1,
      borderColor: palette.border,
      gap: 4,
    },
    kpiTag: { fontSize: fonts.xxs, fontWeight: fonts.weight.extrabold, color: palette.primary },
    kpiBig: { fontSize: fonts.xl, fontWeight: fonts.weight.black, color: palette.textPrimary },
    kpiSub: { fontSize: fonts.xs, color: palette.textSecondary },
    kpiMeta: { fontSize: fonts.xs, fontWeight: fonts.weight.bold, color: palette.textMuted, marginTop: 2 },
    healthyBox: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
      padding: 12,
      borderRadius: 10,
      backgroundColor: palette.successLight,
    },
    healthyText: { flex: 1, fontSize: fonts.xs, fontWeight: fonts.weight.bold, color: palette.success },
    riskRow: {
      padding: 12,
      borderRadius: 12,
      backgroundColor: palette.surfaceSubtle,
      borderWidth: 1,
      borderColor: palette.border,
      gap: 3,
    },
    rowBetween: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 },
    riskName: { fontSize: fonts.sm, fontWeight: fonts.weight.extrabold, color: palette.textPrimary },
    riskBadge: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 8 },
    riskBadgeText: { fontSize: fonts.xxs, fontWeight: fonts.weight.extrabold },
    riskMeta: { fontSize: fonts.xs, color: palette.textSecondary },
    riskStats: { fontSize: fonts.xs, fontWeight: fonts.weight.bold, color: palette.danger },
    riskAction: { fontSize: fonts.xs, color: palette.textPrimary, marginTop: 2 },
    modalOverlay: {
      flex: 1,
      backgroundColor: 'rgba(15, 23, 42, 0.7)',
      justifyContent: 'center',
      padding: 14,
    },
    modalSheet: {
      maxHeight: '88%',
      backgroundColor: palette.surface,
      borderRadius: 16,
      padding: 16,
      borderWidth: 1,
      borderColor: palette.borderStrong,
      gap: 10,
    },
    rollStatsRow: { flexDirection: 'row', gap: 6 },
    rollStatBox: {
      flex: 1,
      paddingVertical: 8,
      borderRadius: 10,
      backgroundColor: palette.surfaceSubtle,
      borderWidth: 1,
      borderColor: palette.border,
      alignItems: 'center',
    },
    rollStatVal: { fontSize: fonts.md, fontWeight: fonts.weight.black, color: palette.textPrimary },
    rollStatLbl: { fontSize: fonts.xxs, color: palette.textMuted, fontWeight: fonts.weight.bold },
    searchInput: {
      backgroundColor: palette.surfaceSubtle,
      borderWidth: 1,
      borderColor: palette.borderStrong,
      borderRadius: 10,
      paddingHorizontal: 12,
      height: 40,
      fontSize: fonts.sm,
      color: palette.textPrimary,
    },
    rollRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 10,
      padding: 10,
      borderRadius: 10,
      backgroundColor: palette.surfaceSubtle,
      borderWidth: 1,
      borderColor: palette.border,
    },
  });

export default SardoSafetyScreen;
