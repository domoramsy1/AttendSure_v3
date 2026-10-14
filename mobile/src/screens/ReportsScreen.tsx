// D:\AttendSure_V3\mobile\src\screens\ReportsScreen.tsx

import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  RefreshControl,
  ActivityIndicator,
  Alert,
  Platform,
  TextInput,
  Share,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { apiClient } from '../api/client';
import { COLORS } from '../constants/theme';

type ReportType = 'DTR' | 'SF1' | 'SF2' | 'SF4';

interface AssignedSection {
  section_id: number;
  section_name: string;
  subject_name: string;
}

const showAlert = (title: string, message: string) => {
  if (Platform.OS === 'web' && typeof window !== 'undefined') {
    window.alert(`${title}: ${message}`);
  } else {
    Alert.alert(title, message);
  }
};

const triggerWebPdfDownload = (htmlContent: string) => {
  if (typeof document === 'undefined') return;

  const frameId = 'attendsure-pdf-print-frame';
  const oldFrame = document.getElementById(frameId);
  if (oldFrame && oldFrame.parentNode) {
    oldFrame.parentNode.removeChild(oldFrame);
  }

  const iframe = document.createElement('iframe');
  iframe.id = frameId;
  iframe.style.position = 'fixed';
  iframe.style.top = '-10000px';
  iframe.style.left = '-10000px';
  iframe.style.width = '1024px';
  iframe.style.height = '768px';
  iframe.style.border = '0';
  document.body.appendChild(iframe);

  const frameDoc = iframe.contentWindow?.document;
  if (frameDoc && iframe.contentWindow) {
    frameDoc.open();
    frameDoc.write(htmlContent);
    frameDoc.close();
    setTimeout(() => {
      iframe.contentWindow?.focus();
      iframe.contentWindow?.print();
    }, 350);
  }
};

export const ReportsScreen: React.FC = () => {
  const now = new Date();
  const [selectedTab, setSelectedTab] = useState<ReportType>('DTR');
  const [selectedMonth, setSelectedMonth] = useState<number>(now.getMonth() + 1);
  const [selectedYear, setSelectedYear] = useState<number>(now.getFullYear());

  const [sections, setSections] = useState<AssignedSection[]>([]);
  const [selectedSectionId, setSelectedSectionId] = useState<number | null>(null);

  const [dtrData, setDtrData] = useState<any>(null);
  const [regularHours, setRegularHours] = useState<string>('');
  const [saturdayHours, setSaturdayHours] = useState<string>('');
  const [sf1Data, setSf1Data] = useState<any>(null);
  const [sf2Data, setSf2Data] = useState<any>(null);
  const [sf4Data, setSf4Data] = useState<any>(null);

  const [loading, setLoading] = useState<boolean>(true);
  const [refreshing, setRefreshing] = useState<boolean>(false);
  const [submittingDtr, setSubmittingDtr] = useState<boolean>(false);
  const [exportingPdf, setExportingPdf] = useState<boolean>(false);

  const loadAssignedSections = useCallback(async () => {
    try {
      const res = await apiClient.get('/api/classroom/roster/');
      const raw = Array.isArray(res.data) ? res.data : [];
      const map = new Map<number, AssignedSection>();
      raw.forEach((item: any) => {
        if (item.section_id && !map.has(item.section_id)) {
          map.set(item.section_id, {
            section_id: item.section_id,
            section_name: item.section_name,
            subject_name: item.subject_name,
          });
        }
      });
      const deduped = Array.from(map.values());
      setSections(deduped);
      if (deduped.length > 0 && selectedSectionId === null) {
        setSelectedSectionId(deduped[0].section_id);
      }
    } catch {
      setSections([]);
    }
  }, [selectedSectionId]);

  const loadActiveReportData = useCallback(async () => {
    setLoading(true);
    try {
      if (selectedTab === 'DTR') {
        const res = await apiClient.get(`/api/dtr/?month=${selectedMonth}&year=${selectedYear}`);
        setDtrData(res.data || null);
        setRegularHours(res.data?.regular_days_hours || '');
        setSaturdayHours(res.data?.saturdays_hours || '');
      } else if (selectedTab === 'SF1' && selectedSectionId) {
        const res = await apiClient.get(`/api/reports/sf1/${selectedSectionId}/`);
        setSf1Data(res.data || null);
      } else if (selectedTab === 'SF2' && selectedSectionId) {
        const res = await apiClient.get(
          `/api/reports/sf2/${selectedSectionId}/?month=${selectedMonth}&year=${selectedYear}`
        );
        setSf2Data(res.data || null);
      } else if (selectedTab === 'SF4') {
        const res = await apiClient.get(
          `/api/reports/sf4/?month=${selectedMonth}&year=${selectedYear}`
        );
        setSf4Data(res.data || null);
      }
    } catch (err: any) {
      console.warn('Report fetch warning:', err?.message || err);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [selectedTab, selectedMonth, selectedYear, selectedSectionId]);

  useEffect(() => {
    loadAssignedSections();
  }, [loadAssignedSections]);

  useEffect(() => {
    loadActiveReportData();
  }, [loadActiveReportData]);

  const onRefresh = useCallback(() => {
    setRefreshing(true);
    loadActiveReportData();
  }, [loadActiveReportData]);

  const handleActionExport = async (action: 'PRINT' | 'PDF') => {
    if ((selectedTab === 'SF1' || selectedTab === 'SF2') && !selectedSectionId) {
      showAlert('Section Required', 'Please select a class section first.');
      return;
    }

    setExportingPdf(true);
    try {
      const res = await apiClient.get('/api/reports/export/', {
        params: {
          report_type: selectedTab,
          section_id: selectedSectionId || undefined,
          faculty_id: dtrData?.faculty_id || undefined,
          month: selectedMonth,
          year: selectedYear,
          regular_days_hours: regularHours.trim() || undefined,
          saturdays_hours: saturdayHours.trim() || undefined,
        },
      });

      const html = res.data?.html || '';
      const title = res.data?.title || `Official_${selectedTab}_Report`;

      if (Platform.OS === 'web') {
        triggerWebPdfDownload(html);
      } else {
        await Share.share({
          title,
          message: `${title}\n\nOfficial document generated via AttendSure Centralized Engine.`,
        });
      }
    } catch (err: any) {
      showAlert('Export Failed', err?.response?.data?.error || 'Could not export document.');
    } finally {
      setExportingPdf(false);
    }
  };

  const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

  return (
    <SafeAreaView style={styles.container} edges={['top', 'left', 'right']}>
      {/* Header with Print & PDF Action Buttons */}
      <View style={styles.topHeader}>
        <View style={{ flex: 1, marginRight: 8 }}>
          <Text style={styles.screenTitle}>Official DepEd & CSC Reports</Text>
          <Text style={styles.screenSub}>Mobile PDF Exporter & Wi-Fi Direct Printing</Text>
        </View>

        <View style={{ flexDirection: 'row', gap: 6 }}>
          <TouchableOpacity
            style={[styles.actionBtnSecondary, (loading || exportingPdf) && { opacity: 0.6 }]}
            onPress={() => handleActionExport('PRINT')}
            disabled={loading || exportingPdf}
          >
            <Ionicons name="print-outline" size={15} color="#004b87" />
            <Text style={styles.actionBtnTextSecondary}>Print</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.actionBtnPrimary, (loading || exportingPdf) && { opacity: 0.6 }]}
            onPress={() => handleActionExport('PDF')}
            disabled={loading || exportingPdf}
          >
            {exportingPdf ? (
              <ActivityIndicator size="small" color="#ffffff" />
            ) : (
              <>
                <Ionicons name="download-outline" size={15} color="#ffffff" />
                <Text style={styles.actionBtnTextPrimary}>PDF</Text>
              </>
            )}
          </TouchableOpacity>
        </View>
      </View>

      {/* 4-Way Tab Bar */}
      <View style={styles.tabSwitchRow}>
        {(
          [
            { key: 'DTR', label: 'Form 48' },
            { key: 'SF1', label: 'SF1' },
            { key: 'SF2', label: 'SF2' },
            { key: 'SF4', label: 'SF4' },
          ] as const
        ).map((tab) => (
          <TouchableOpacity
            key={tab.key}
            style={[styles.tabBtn, selectedTab === tab.key && styles.tabBtnActive]}
            onPress={() => setSelectedTab(tab.key)}
          >
            <Text style={[styles.tabBtnText, selectedTab === tab.key && styles.tabBtnTextActive]}>
              {tab.label}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      <ScrollView
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} colors={[COLORS.primary]} />}
      >
        {/* Month Selector for DTR, SF2, and SF4 */}
        {selectedTab !== 'SF1' && (
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.monthStrip}>
            {monthNames.map((mName, idx) => {
              const mNum = idx + 1;
              const active = selectedMonth === mNum;
              return (
                <TouchableOpacity
                  key={mName}
                  style={[styles.monthChip, active && styles.monthChipActive]}
                  onPress={() => setSelectedMonth(mNum)}
                >
                  <Text style={[styles.monthChipText, active && { color: '#ffffff' }]}>
                    {mName} {selectedYear}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </ScrollView>
        )}

        {/* Section Selector for SF1 and SF2 */}
        {(selectedTab === 'SF1' || selectedTab === 'SF2') && (
          <View style={styles.card}>
            <Text style={styles.sectionTitle}>SELECT CLASS SECTION</Text>
            {sections.length === 0 ? (
              <Text style={styles.emptyText}>No assigned sections found in database.</Text>
            ) : (
              <ScrollView horizontal showsHorizontalScrollIndicator={false}>
                {sections.map((sec) => {
                  const active = sec.section_id === selectedSectionId;
                  return (
                    <TouchableOpacity
                      key={String(sec.section_id)}
                      style={[styles.sectionPill, active && styles.sectionPillActive]}
                      onPress={() => setSelectedSectionId(sec.section_id)}
                    >
                      <Text style={[styles.sectionPillText, active && { color: '#ffffff' }]}>
                        {sec.section_name}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </ScrollView>
            )}
          </View>
        )}

        {loading ? (
          <View style={styles.card}>
            <ActivityIndicator size="small" color={COLORS.primary} style={{ marginVertical: 24 }} />
          </View>
        ) : selectedTab === 'DTR' && dtrData ? (
          <>
            <View style={styles.card}>
              <View style={styles.metaRow}>
                <View>
                  <Text style={styles.cardTitle}>{dtrData.faculty_name}</Text>
                  <Text style={styles.cardSub}>
                    ID: {dtrData.employee_id} &bull; {dtrData.month} {dtrData.year}
                  </Text>
                </View>
                <View
                  style={[
                    styles.statusPill,
                    dtrData.dept_head_approved ? styles.pillGreen : dtrData.dtr_submitted ? styles.pillBlue : styles.pillGray,
                  ]}
                >
                  <Text style={styles.statusPillText}>
                    {dtrData.dept_head_approved ? 'APPROVED' : dtrData.dtr_submitted ? 'SUBMITTED' : 'OPEN'}
                  </Text>
                </View>
              </View>

              <View style={styles.statsGrid}>
                <View style={styles.statBox}>
                  <Text style={styles.statVal}>{dtrData.days_present}</Text>
                  <Text style={styles.statLabel}>Days Present</Text>
                </View>
                <View style={styles.statBox}>
                  <Text style={styles.statVal}>
                    {dtrData.total_undertime_hours}h {dtrData.total_undertime_minutes}m
                  </Text>
                  <Text style={styles.statLabel}>Undertime</Text>
                </View>
                <View style={styles.statBox}>
                  <Text style={styles.statVal} numberOfLines={1}>{dtrData.school_head || 'Unassigned'}</Text>
                  <Text style={styles.statLabel}>School Head</Text>
                </View>
              </View>
            </View>

            <View style={styles.card}>
              <Text style={styles.sectionTitle}>31-DAY LOG RECORDS</Text>
              {dtrData.rows?.filter((r: any) => r.date_str !== '').map((row: any) => (
                <View key={String(row.day)} style={styles.tableRow}>
                  <Text style={{ width: 45, fontWeight: '700', fontSize: 11 }}>
                    {row.day} {row.day_of_week}
                  </Text>
                  <Text style={styles.tableCell}>{row.am_arrival || '-'}</Text>
                  <Text style={styles.tableCell}>{row.am_departure || '-'}</Text>
                  <Text style={styles.tableCell}>{row.pm_arrival || '-'}</Text>
                  <Text style={styles.tableCell}>{row.pm_departure || '-'}</Text>
                  <Text style={[styles.tableCell, { color: '#dc2626' }]}>
                    {row.undertime_hours || row.undertime_minutes ? `${row.undertime_hours || 0}h${row.undertime_minutes || 0}m` : '-'}
                  </Text>
                </View>
              ))}
            </View>
          </>
        ) : selectedTab === 'SF1' && sf1Data ? (
          <View style={styles.card}>
            <Text style={styles.sectionTitle}>
              SF1 REGISTER &bull; {sf1Data.grade_level} - {sf1Data.section_name}
            </Text>
            <Text style={styles.summaryText}>
              Male: {sf1Data.total_male} &bull; Female: {sf1Data.total_female} &bull; Total: {sf1Data.total_combined}
            </Text>
            {sf1Data.learners?.map((st: any) => (
              <View key={String(st.id)} style={styles.learnerRow}>
                <Text style={styles.learnerName}>{st.name}</Text>
                <Text style={styles.learnerMeta}>
                  LRN: {st.lrn} &bull; Sex: {st.sex} &bull; Age: {st.age || '-'} &bull; Contact: {st.parent_contact || 'None'}
                </Text>
              </View>
            ))}
          </View>
        ) : selectedTab === 'SF2' && sf2Data ? (
          <View style={styles.card}>
            <Text style={styles.sectionTitle}>
              SF2 ATTENDANCE &bull; {sf2Data.section_name} ({sf2Data.month} {sf2Data.year})
            </Text>
            <Text style={styles.summaryText}>Adviser: {sf2Data.adviser_name || '-'}</Text>
            {(sf2Data.learners || sf2Data.students || []).map((st: any, i: number) => (
              <View key={String(st.id || i)} style={styles.learnerRow}>
                <Text style={styles.learnerName}>{st.name || st.full_name}</Text>
                <Text style={styles.learnerMeta}>
                  Absences: {st.total_absent ?? 0} &bull; Tardiness: {st.total_tardy ?? 0}
                </Text>
              </View>
            ))}
          </View>
        ) : selectedTab === 'SF4' && sf4Data ? (
          <View style={styles.card}>
            <Text style={styles.sectionTitle}>
              SF4 MOVEMENT SUMMARY &bull; {sf4Data.month} {sf4Data.year}
            </Text>
            <Text style={styles.summaryText}>Principal: {sf4Data.school_head || '-'}</Text>
            {(sf4Data.grade_groups || []).map((g: any) => (
              <View key={g.grade_level} style={styles.learnerRow}>
                <Text style={styles.learnerName}>{g.grade_level}</Text>
                <Text style={styles.learnerMeta}>
                  Sections: {g.sections?.length || 0} &bull; Enrolment: {g.subtotal?.registered_end?.total || 0}
                </Text>
              </View>
            ))}
          </View>
        ) : (
          <View style={styles.card}>
            <Text style={styles.emptyText}>No report data available for the active selection.</Text>
          </View>
        )}
      </ScrollView>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f8fafc' },
  topHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
    backgroundColor: '#ffffff',
    borderBottomWidth: 1,
    borderBottomColor: '#e2e8f0',
  },
  screenTitle: { fontSize: 16, fontWeight: '800', color: '#003460' },
  screenSub: { fontSize: 10, color: '#64748b', marginTop: 1 },
  actionBtnPrimary: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#004b87',
    paddingVertical: 7,
    paddingHorizontal: 11,
    borderRadius: 8,
    gap: 4,
  },
  actionBtnTextPrimary: { color: '#ffffff', fontSize: 11.5, fontWeight: '800' },
  actionBtnSecondary: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#e6f0fa',
    paddingVertical: 7,
    paddingHorizontal: 11,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#b8d6f0',
    gap: 4,
  },
  actionBtnTextSecondary: { color: '#004b87', fontSize: 11.5, fontWeight: '800' },
  tabSwitchRow: {
    flexDirection: 'row',
    backgroundColor: '#ffffff',
    paddingHorizontal: 16,
    paddingVertical: 8,
    gap: 6,
    borderBottomWidth: 1,
    borderBottomColor: '#e2e8f0',
  },
  tabBtn: {
    flex: 1,
    paddingVertical: 8,
    borderRadius: 8,
    backgroundColor: '#f1f5f9',
    alignItems: 'center',
  },
  tabBtnActive: { backgroundColor: '#004b87' },
  tabBtnText: { fontSize: 11.5, fontWeight: '800', color: '#475569' },
  tabBtnTextActive: { color: '#ffffff' },
  scrollContent: { padding: 14, gap: 12 },
  monthStrip: { flexDirection: 'row', marginBottom: 2 },
  monthChip: {
    paddingVertical: 5,
    paddingHorizontal: 11,
    borderRadius: 8,
    backgroundColor: '#e2e8f0',
    marginRight: 6,
  },
  monthChipActive: { backgroundColor: '#004b87' },
  monthChipText: { fontSize: 11, fontWeight: '700', color: '#334155' },
  card: {
    backgroundColor: '#ffffff',
    borderRadius: 14,
    padding: 14,
    borderWidth: 1,
    borderColor: '#e2e8f0',
  },
  sectionTitle: { fontSize: 10.5, fontWeight: '800', color: '#004b87', letterSpacing: 0.4, marginBottom: 8 },
  sectionPill: {
    paddingVertical: 6,
    paddingHorizontal: 12,
    borderRadius: 8,
    backgroundColor: '#f1f5f9',
    marginRight: 8,
  },
  sectionPillActive: { backgroundColor: '#004b87' },
  sectionPillText: { fontSize: 11.5, fontWeight: '700', color: '#334155' },
  metaRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  cardTitle: { fontSize: 15, fontWeight: '800', color: '#0f172a' },
  cardSub: { fontSize: 11, color: '#64748b', marginTop: 1 },
  statusPill: { paddingVertical: 4, paddingHorizontal: 8, borderRadius: 6 },
  pillGreen: { backgroundColor: '#dcfce7' },
  pillBlue: { backgroundColor: '#e0f2fe' },
  pillGray: { backgroundColor: '#f1f5f9' },
  statusPillText: { fontSize: 9, fontWeight: '800', color: '#0f172a' },
  statsGrid: {
    flexDirection: 'row',
    backgroundColor: '#f8fafc',
    borderRadius: 10,
    padding: 10,
    marginTop: 10,
    justifyContent: 'space-between',
  },
  statBox: { alignItems: 'center', flex: 1 },
  statVal: { fontSize: 13, fontWeight: '800', color: '#003460' },
  statLabel: { fontSize: 8.5, fontWeight: '700', color: '#64748b', marginTop: 2 },
  tableRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 6,
    borderBottomWidth: 1,
    borderBottomColor: '#f1f5f9',
  },
  tableCell: { flex: 1, textAlign: 'center', fontSize: 10.5, color: '#0f172a' },
  learnerRow: { paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: '#f1f5f9' },
  learnerName: { fontSize: 12, fontWeight: '700', color: '#0f172a' },
  learnerMeta: { fontSize: 10, color: '#64748b', marginTop: 1 },
  summaryText: { fontSize: 11, fontWeight: '700', color: '#334155', marginBottom: 8 },
  emptyText: { fontSize: 11.5, color: '#94a3b8', textAlign: 'center', paddingVertical: 14 },
});

export default ReportsScreen;