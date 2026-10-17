// D:\AttendSure_V3\mobile\src\screens\ReportsScreen.tsx

import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
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
  grade_level?: string;
  subject_name?: string;
}

const FULL_MONTH_NAMES = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];

const SHORT_MONTH_NAMES = [
  'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
  'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec',
];

const showAlert = (title: string, message: string) => {
  if (Platform.OS === 'web' && typeof window !== 'undefined') {
    window.alert(`${title}: ${message}`);
  } else {
    Alert.alert(title, message);
  }
};

const escapeHtml = (val: any): string => {
  if (val === null || val === undefined) return '';
  return String(val)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
};

/**
 * Formats grade level and section without repeating the section name
 * (Fixes "Grade 12 - ABM - ABM" -> "Grade 12 - ABM")
 */
const formatCleanSectionHeader = (gradeLevel?: string, sectionName?: string): string => {
  const g = String(gradeLevel || '').trim();
  const s = String(sectionName || '').trim();
  if (!g) return s;
  if (!s) return g;
  if (g.toLowerCase().endsWith(s.toLowerCase()) || g.toLowerCase().includes(`- ${s.toLowerCase()}`)) {
    return g;
  }
  return `${g} - ${s}`;
};

const triggerBrowserPrintOrPdf = (htmlContent: string) => {
  if (typeof document === 'undefined') return;

  const frameId = 'attendsure-official-print-frame';
  const existing = document.getElementById(frameId);
  if (existing && existing.parentNode) {
    existing.parentNode.removeChild(existing);
  }

  const iframe = document.createElement('iframe');
  iframe.id = frameId;
  iframe.style.position = 'fixed';
  iframe.style.top = '-10000px';
  iframe.style.left = '-10000px';
  iframe.style.width = '1200px';
  iframe.style.height = '900px';
  iframe.style.border = '0';
  document.body.appendChild(iframe);

  const frameWin = iframe.contentWindow;
  const frameDoc = frameWin?.document;
  if (frameDoc && frameWin) {
    frameDoc.open();
    frameDoc.write(htmlContent);
    frameDoc.close();
    setTimeout(() => {
      frameWin.focus();
      frameWin.print();
    }, 350);
  }
};

export const ReportsScreen: React.FC = () => {
  const now = new Date();
  const [selectedTab, setSelectedTab] = useState<ReportType>('DTR');
  const [selectedMonth, setSelectedMonth] = useState<number>(now.getMonth() + 1);
  const [selectedYear] = useState<number>(now.getFullYear());
  const [searchQuery, setSearchQuery] = useState<string>('');

  const [sections, setSections] = useState<AssignedSection[]>([]);
  const [selectedSectionId, setSelectedSectionId] = useState<number | null>(null);

  const [dtrData, setDtrData] = useState<any>(null);
  const [regularHours, setRegularHours] = useState<string>('8:00 AM - 12:00 PM / 1:00 PM - 5:00 PM');
  const [saturdayHours, setSaturdayHours] = useState<string>('As Required');
  const [sf1Data, setSf1Data] = useState<any>(null);
  const [sf2Data, setSf2Data] = useState<any>(null);
  const [sf4Data, setSf4Data] = useState<any>(null);

  const [loading, setLoading] = useState<boolean>(true);
  const [refreshing, setRefreshing] = useState<boolean>(false);
  const [submittingDtr, setSubmittingDtr] = useState<boolean>(false);
  const [exportingPdf, setExportingPdf] = useState<boolean>(false);

  const monthScrollRef = useRef<ScrollView>(null);

  // Auto-scroll month strip so October (or active month) is centered
  useEffect(() => {
    const timer = setTimeout(() => {
      if (monthScrollRef.current && selectedMonth > 3) {
        monthScrollRef.current.scrollTo({ x: Math.max(0, (selectedMonth - 2) * 82), animated: true });
      }
    }, 200);
    return () => clearTimeout(timer);
  }, [selectedMonth, selectedTab]);

  const loadAssignedSections = useCallback(async () => {
    try {
      const [rosterRes, secRes] = await Promise.allSettled([
        apiClient.get('/api/classroom/roster/'),
        apiClient.get('/api/sections/'),
      ]);

      const map = new Map<number, AssignedSection>();

      if (rosterRes.status === 'fulfilled' && Array.isArray(rosterRes.value.data)) {
        rosterRes.value.data.forEach((item: any) => {
          if (item.section_id && !map.has(item.section_id)) {
            map.set(item.section_id, {
              section_id: item.section_id,
              section_name: item.section_name,
              subject_name: item.subject_name,
            });
          }
        });
      }

      if (map.size === 0 && secRes.status === 'fulfilled') {
        const rawSecs = Array.isArray(secRes.value.data)
          ? secRes.value.data
          : secRes.value.data?.results || [];
        rawSecs.forEach((s: any) => {
          if (s.id && !map.has(s.id)) {
            map.set(s.id, {
              section_id: s.id,
              section_name: s.name,
              grade_level: s.grade_level,
            });
          }
        });
      }

      const list = Array.from(map.values());
      setSections(list);
      if (list.length > 0 && selectedSectionId === null) {
        setSelectedSectionId(list[0].section_id);
      }
    } catch {
      setSections([]);
    }
  }, [selectedSectionId]);

  const loadActiveReportData = useCallback(async () => {
    setLoading(true);
    const monthName = FULL_MONTH_NAMES[selectedMonth - 1] || 'October';

    try {
      if (selectedTab === 'DTR') {
        const res = await apiClient.get(`/api/dtr/?month=${selectedMonth}&year=${selectedYear}`);
        setDtrData(res.data || null);
        if (res.data?.regular_days_hours) setRegularHours(res.data.regular_days_hours);
        if (res.data?.saturdays_hours) setSaturdayHours(res.data.saturdays_hours);
      } else if (selectedTab === 'SF1' && selectedSectionId) {
        const res = await apiClient.get(`/api/reports/sf1/${selectedSectionId}/`);
        setSf1Data(res.data || null);
      } else if (selectedTab === 'SF2' && selectedSectionId) {
        const res = await apiClient.get(
          `/api/reports/sf2/${selectedSectionId}/?month=${monthName}&year=${selectedYear}`
        );
        setSf2Data(res.data || null);
      } else if (selectedTab === 'SF4') {
        const res = await apiClient.get(
          `/api/reports/sf4/?month=${monthName}&year=${selectedYear}`
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

  const handleSubmitMonthlyDtr = async () => {
    if (!dtrData) return;
    setSubmittingDtr(true);
    try {
      await apiClient.post('/api/dtr/', {
        action: 'SUBMIT_DTR',
        faculty_id: dtrData.faculty_id,
        month: selectedMonth,
        year: selectedYear,
        regular_days_hours: regularHours.trim(),
        saturdays_hours: saturdayHours.trim(),
      });
      showAlert('DTR Submitted', 'Your CSC Form 48 has been certified and saved to PostgreSQL.');
      await loadActiveReportData();
    } catch (err: any) {
      showAlert('Submission Failed', err?.response?.data?.error || 'Could not submit DTR.');
    } finally {
      setSubmittingDtr(false);
    }
  };

  // Filtered lists for SF1, SF2, SF4
  const filteredSf1Learners = useMemo(() => {
    const raw = sf1Data?.learners || sf1Data?.students || [];
    if (!searchQuery.trim()) return raw;
    const q = searchQuery.toLowerCase().trim();
    return raw.filter(
      (st: any) =>
        String(st.name || '').toLowerCase().includes(q) ||
        String(st.lrn || '').toLowerCase().includes(q)
    );
  }, [sf1Data, searchQuery]);

  const combinedSf2Learners = useMemo(() => {
    if (!sf2Data) return [];
    const raw = [
      ...(Array.isArray(sf2Data.males) ? sf2Data.males : []),
      ...(Array.isArray(sf2Data.females) ? sf2Data.females : []),
      ...(Array.isArray(sf2Data.learners) ? sf2Data.learners : []),
    ];
    // Deduplicate by id
    const seen = new Set();
    const unique = raw.filter((item) => {
      const k = item.id || item.lrn || item.name;
      if (seen.has(k)) return false;
      seen.add(k);
      return true;
    });
    if (!searchQuery.trim()) return unique;
    const q = searchQuery.toLowerCase().trim();
    return unique.filter(
      (st: any) =>
        String(st.name || '').toLowerCase().includes(q) ||
        String(st.lrn || '').toLowerCase().includes(q)
    );
  }, [sf2Data, searchQuery]);

  const filteredSf4Groups = useMemo(() => {
    const groups = sf4Data?.grade_groups || [];
    if (!searchQuery.trim()) return groups;
    const q = searchQuery.toLowerCase().trim();
    return groups.filter((g: any) => String(g.grade_level || '').toLowerCase().includes(q));
  }, [sf4Data, searchQuery]);

  const handleActionExport = async () => {
    if ((selectedTab === 'SF1' || selectedTab === 'SF2') && !selectedSectionId) {
      showAlert('Select Section', 'Please select a class section first.');
      return;
    }

    setExportingPdf(true);
    try {
      const monthName = FULL_MONTH_NAMES[selectedMonth - 1] || 'October';
      const res = await apiClient.get('/api/reports/export/', {
        params: {
          report_type: selectedTab,
          section_id: selectedTab === 'SF4' ? undefined : selectedSectionId || undefined,
          faculty_id: dtrData?.faculty_id || undefined,
          month: selectedTab === 'DTR' ? selectedMonth : monthName,
          year: selectedYear,
          regular_days_hours: regularHours.trim() || undefined,
          saturdays_hours: saturdayHours.trim() || undefined,
        },
      });

      const htmlContent = res.data?.html || '';
      const title = res.data?.title || `AttendSure_${selectedTab}_Report`;

      if (Platform.OS === 'web' && htmlContent) {
        triggerBrowserPrintOrPdf(htmlContent);
      } else {
        await Share.share({
          title,
          message: `${title}\n\nOfficial DepEd / CSC Report exported via AttendSure Mobile.`,
        });
      }
    } catch (err: any) {
      showAlert('Export Notice', err?.response?.data?.error || 'Could not export report.');
    } finally {
      setExportingPdf(false);
    }
  };

  return (
    <SafeAreaView style={styles.container} edges={['top', 'left', 'right']}>
      {/* Top Action Header */}
      <View style={styles.topHeader}>
        <View style={{ flex: 1, marginRight: 8 }}>
          <Text style={styles.screenTitle}>Official DepEd & CSC Reports</Text>
          <Text style={styles.screenSub}>Mobile PDF Exporter & Wi-Fi Direct Printing</Text>
        </View>

        <View style={{ flexDirection: 'row', gap: 6 }}>
          <TouchableOpacity
            style={[styles.actionBtnSecondary, (loading || exportingPdf) && { opacity: 0.6 }]}
            onPress={handleActionExport}
            disabled={loading || exportingPdf}
          >
            <Ionicons name="print-outline" size={15} color="#004b87" />
            <Text style={styles.actionBtnTextSecondary}>Print</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.actionBtnPrimary, (loading || exportingPdf) && { opacity: 0.6 }]}
            onPress={handleActionExport}
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

      {/* 4-Way Form Selector Tabs */}
      <View style={styles.tabSwitchRow}>
        {(
          [
            { key: 'DTR', label: 'Form 48', icon: 'time-outline' },
            { key: 'SF1', label: 'SF1', icon: 'people-outline' },
            { key: 'SF2', label: 'SF2', icon: 'calendar-outline' },
            { key: 'SF4', label: 'SF4', icon: 'stats-chart-outline' },
          ] as const
        ).map((tab) => {
          const active = selectedTab === tab.key;
          return (
            <TouchableOpacity
              key={tab.key}
              style={[styles.tabBtn, active && styles.tabBtnActive]}
              onPress={() => {
                setSelectedTab(tab.key);
                setSearchQuery('');
              }}
            >
              <Ionicons
                name={tab.icon}
                size={13}
                color={active ? '#ffffff' : '#475569'}
              />
              <Text style={[styles.tabBtnText, active && styles.tabBtnTextActive]}>
                {tab.label}
              </Text>
            </TouchableOpacity>
          );
        })}
      </View>

      <ScrollView
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} colors={[COLORS.primary]} />
        }
      >
        {/* Auto-Scrolling Month Strip */}
        {selectedTab !== 'SF1' && (
          <ScrollView
            ref={monthScrollRef}
            horizontal
            showsHorizontalScrollIndicator={false}
            style={styles.monthStrip}
          >
            {SHORT_MONTH_NAMES.map((mName, idx) => {
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

        {/* Section Selector + Quick Search for SF1 / SF2 / SF4 */}
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
                      <Ionicons
                        name="school-outline"
                        size={13}
                        color={active ? '#ffffff' : '#004b87'}
                      />
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

        {selectedTab !== 'DTR' && (
          <View style={styles.searchBarBox}>
            <Ionicons name="search-outline" size={16} color="#64748b" />
            <TextInput
              style={styles.searchInput}
              value={searchQuery}
              onChangeText={setSearchQuery}
              placeholder={
                selectedTab === 'SF4'
                  ? 'Filter by grade level (e.g. Grade 7, ABM)...'
                  : 'Search learner name or 12-digit LRN...'
              }
              placeholderTextColor="#94a3b8"
            />
            {searchQuery.length > 0 && (
              <TouchableOpacity onPress={() => setSearchQuery('')}>
                <Ionicons name="close-circle" size={16} color="#94a3b8" />
              </TouchableOpacity>
            )}
          </View>
        )}

        {loading ? (
          <View style={styles.card}>
            <ActivityIndicator size="small" color={COLORS.primary} style={{ marginVertical: 28 }} />
            <Text style={[styles.emptyText, { paddingVertical: 0 }]}>
              Compiling official {selectedTab} records from PostgreSQL...
            </Text>
          </View>
        ) : selectedTab === 'DTR' && dtrData ? (
          <>
            <View style={styles.card}>
              <View style={styles.metaRow}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.cardTitle}>{dtrData.faculty_name}</Text>
                  <Text style={styles.cardSub}>
                    ID: {dtrData.employee_id} &bull; {dtrData.month} {dtrData.year}
                  </Text>
                </View>
                <View
                  style={[
                    styles.statusPill,
                    dtrData.dept_head_approved
                      ? styles.pillGreen
                      : dtrData.dtr_submitted
                      ? styles.pillBlue
                      : styles.pillAmber,
                  ]}
                >
                  <Text
                    style={[
                      styles.statusPillText,
                      dtrData.dept_head_approved
                        ? { color: '#065f46' }
                        : dtrData.dtr_submitted
                        ? { color: '#075985' }
                        : { color: '#92400e' },
                    ]}
                  >
                    {dtrData.dept_head_approved
                      ? 'APPROVED'
                      : dtrData.dtr_submitted
                      ? 'SUBMITTED'
                      : 'DRAFT'}
                  </Text>
                </View>
              </View>

              <View style={styles.statsGrid}>
                <View style={styles.statBox}>
                  <Text style={styles.statVal}>{dtrData.days_present}</Text>
                  <Text style={styles.statLabel}>Days Present</Text>
                </View>
                <View style={styles.statDivider} />
                <View style={styles.statBox}>
                  <Text style={styles.statVal}>
                    {dtrData.total_undertime_hours}h {dtrData.total_undertime_minutes}m
                  </Text>
                  <Text style={styles.statLabel}>Undertime</Text>
                </View>
                <View style={styles.statDivider} />
                <View style={[styles.statBox, { flex: 1.3 }]}>
                  <Text style={styles.statVal} numberOfLines={1}>
                    {dtrData.school_head || 'Unassigned'}
                  </Text>
                  <Text style={styles.statLabel}>School Head</Text>
                </View>
              </View>

              {!dtrData.dtr_submitted && (
                <TouchableOpacity
                  style={[styles.submitBtn, submittingDtr && { opacity: 0.6 }]}
                  onPress={handleSubmitMonthlyDtr}
                  disabled={submittingDtr}
                >
                  <Ionicons name="checkmark-done-circle-outline" size={16} color="#ffffff" />
                  <Text style={styles.submitBtnText}>Certify & Submit Form 48</Text>
                </TouchableOpacity>
              )}
            </View>

            <View style={styles.card}>
              <Text style={styles.sectionTitle}>31-DAY GATE LOG RECORDS</Text>

              {/* Sticky Table Column Headers */}
              <View style={styles.dtrTableHeaderRow}>
                <Text style={[styles.dtrHeaderCell, { width: 54, textAlign: 'left' }]}>DAY</Text>
                <Text style={styles.dtrHeaderCell}>AM IN</Text>
                <Text style={styles.dtrHeaderCell}>AM OUT</Text>
                <Text style={styles.dtrHeaderCell}>PM IN</Text>
                <Text style={styles.dtrHeaderCell}>PM OUT</Text>
                <Text style={[styles.dtrHeaderCell, { width: 42 }]}>UT</Text>
              </View>

              {dtrData.rows
                ?.filter((r: any) => r.date_str !== '')
                .map((row: any) => {
                  const isWeekend = Boolean(row.is_weekend);
                  const hasLogs = Boolean(
                    row.am_arrival || row.am_departure || row.pm_arrival || row.pm_departure
                  );
                  return (
                    <View
                      key={String(row.day)}
                      style={[
                        styles.tableRow,
                        isWeekend && { backgroundColor: '#f8fafc', borderRadius: 6, paddingHorizontal: 4 },
                      ]}
                    >
                      <Text
                        style={{
                          width: 54,
                          fontWeight: '700',
                          fontSize: 11,
                          color: isWeekend ? '#64748b' : '#0f172a',
                        }}
                      >
                        {row.day} {row.day_of_week}
                      </Text>
                      <Text style={[styles.tableCell, hasLogs && { fontWeight: '700', color: '#059669' }]}>
                        {row.am_arrival || '—'}
                      </Text>
                      <Text style={styles.tableCell}>{row.am_departure || '—'}</Text>
                      <Text style={[styles.tableCell, hasLogs && { fontWeight: '700', color: '#059669' }]}>
                        {row.pm_arrival || '—'}
                      </Text>
                      <Text style={styles.tableCell}>{row.pm_departure || '—'}</Text>
                      <Text style={[styles.tableCell, { width: 42, flex: 0, color: '#dc2626', fontWeight: '700' }]}>
                        {row.undertime_hours || row.undertime_minutes
                          ? `${row.undertime_hours || 0}h${row.undertime_minutes || 0}m`
                          : '—'}
                      </Text>
                    </View>
                  );
                })}
            </View>
          </>
        ) : selectedTab === 'SF1' && sf1Data ? (
          <View style={styles.card}>
            <View style={styles.reportCardHeader}>
              <View style={{ flex: 1 }}>
                <Text style={styles.sectionTitle}>
                  SF1 REGISTER &bull;{' '}
                  {formatCleanSectionHeader(sf1Data.grade_level, sf1Data.section_name)}
                </Text>
                <Text style={styles.adviserSubText}>
                  Adviser: {sf1Data.adviser_name || 'Unassigned'} &bull; SY {sf1Data.academic_year}
                </Text>
              </View>
            </View>

            <View style={styles.sfSummaryChipsRow}>
              <View style={[styles.sfSummaryChip, { backgroundColor: '#eff6ff' }]}>
                <Text style={[styles.sfSummaryChipVal, { color: '#0284c7' }]}>
                  {sf1Data.total_male ?? 0}
                </Text>
                <Text style={styles.sfSummaryChipLab}>Male</Text>
              </View>
              <View style={[styles.sfSummaryChip, { backgroundColor: '#fdf2f8' }]}>
                <Text style={[styles.sfSummaryChipVal, { color: '#db2777' }]}>
                  {sf1Data.total_female ?? 0}
                </Text>
                <Text style={styles.sfSummaryChipLab}>Female</Text>
              </View>
              <View style={[styles.sfSummaryChip, { backgroundColor: '#f0fdf4' }]}>
                <Text style={[styles.sfSummaryChipVal, { color: '#059669' }]}>
                  {sf1Data.total_combined ?? 0}
                </Text>
                <Text style={styles.sfSummaryChipLab}>Total Learners</Text>
              </View>
            </View>

            {filteredSf1Learners.length === 0 ? (
              <Text style={styles.emptyText}>No learners match the current search filter.</Text>
            ) : (
              filteredSf1Learners.map((st: any, idx: number) => {
                const isMale = st.sex === 'M' || st.sex === 'Male';
                return (
                  <View key={String(st.id || idx)} style={styles.learnerRow}>
                    <View style={styles.learnerIndexBadge}>
                      <Text style={styles.learnerIndexText}>{idx + 1}</Text>
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.learnerName}>{st.name}</Text>
                      <Text style={styles.learnerMeta}>
                        LRN: {st.lrn} &bull; Age: {st.age || '-'} &bull; Contact:{' '}
                        {st.parent_contact || 'N/A'}
                      </Text>
                    </View>
                    <View
                      style={[
                        styles.sexBadge,
                        { backgroundColor: isMale ? '#eff6ff' : '#fdf2f8' },
                      ]}
                    >
                      <Text
                        style={[
                          styles.sexBadgeText,
                          { color: isMale ? '#0284c7' : '#db2777' },
                        ]}
                      >
                        {isMale ? 'M' : 'F'}
                      </Text>
                    </View>
                  </View>
                );
              })
            )}
          </View>
        ) : selectedTab === 'SF2' && sf2Data ? (
          <View style={styles.card}>
            <Text style={styles.sectionTitle}>
              SF2 DAILY ATTENDANCE &bull; {sf2Data.section_name} ({sf2Data.month} {sf2Data.year})
            </Text>
            <Text style={styles.adviserSubText}>
              Adviser: {sf2Data.adviser_name || 'Unassigned'} &bull; School Days:{' '}
              {sf2Data.school_days?.length || 0}
            </Text>

            {/* SF2 Monthly Metrics Summary Box */}
            <View style={[styles.sfSummaryChipsRow, { marginTop: 10 }]}>
              <View style={[styles.sfSummaryChip, { backgroundColor: '#f8fafc' }]}>
                <Text style={[styles.sfSummaryChipVal, { color: '#0f172a' }]}>
                  {sf2Data.metrics?.registered_end?.total ?? combinedSf2Learners.length}
                </Text>
                <Text style={styles.sfSummaryChipLab}>Registered</Text>
              </View>
              <View style={[styles.sfSummaryChip, { backgroundColor: '#ecfdf5' }]}>
                <Text style={[styles.sfSummaryChipVal, { color: '#059669' }]}>
                  {Number(sf2Data.metrics?.average_daily_attendance?.total ?? 0).toFixed(1)}
                </Text>
                <Text style={styles.sfSummaryChipLab}>Avg Daily Att.</Text>
              </View>
              <View style={[styles.sfSummaryChip, { backgroundColor: '#eff6ff' }]}>
                <Text style={[styles.sfSummaryChipVal, { color: '#0284c7' }]}>
                  {Number(sf2Data.metrics?.percentage_attendance?.total ?? 0).toFixed(1)}%
                </Text>
                <Text style={styles.sfSummaryChipLab}>Attendance %</Text>
              </View>
            </View>

            {combinedSf2Learners.length === 0 ? (
              <Text style={styles.emptyText}>No learner attendance records found for this section.</Text>
            ) : (
              combinedSf2Learners.map((st: any, idx: number) => {
                const absCount = st.total_absent ?? 0;
                const tardyCount = st.total_tardy ?? 0;
                return (
                  <View key={String(st.id || idx)} style={styles.learnerRow}>
                    <View style={styles.learnerIndexBadge}>
                      <Text style={styles.learnerIndexText}>{idx + 1}</Text>
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.learnerName}>{st.name || st.full_name}</Text>
                      <Text style={styles.learnerMeta}>
                        LRN: {st.lrn || '—'} &bull; Sex: {st.sex || '—'}
                      </Text>
                    </View>
                    <View style={{ flexDirection: 'row', gap: 6 }}>
                      <View
                        style={[
                          styles.metricPillSmall,
                          { backgroundColor: absCount > 0 ? '#fef2f2' : '#f1f5f9' },
                        ]}
                      >
                        <Text
                          style={{
                            fontSize: 10,
                            fontWeight: '800',
                            color: absCount > 0 ? '#dc2626' : '#64748b',
                          }}
                        >
                          Abs: {absCount}
                        </Text>
                      </View>
                      <View
                        style={[
                          styles.metricPillSmall,
                          { backgroundColor: tardyCount > 0 ? '#fffbeb' : '#f1f5f9' },
                        ]}
                      >
                        <Text
                          style={{
                            fontSize: 10,
                            fontWeight: '800',
                            color: tardyCount > 0 ? '#d97706' : '#64748b',
                          }}
                        >
                          Late: {tardyCount}
                        </Text>
                      </View>
                    </View>
                  </View>
                );
              })
            )}
          </View>
        ) : selectedTab === 'SF4' && sf4Data ? (
          <View style={styles.card}>
            <Text style={styles.sectionTitle}>
              SF4 MONTHLY MOVEMENT SUMMARY &bull; {sf4Data.month} {sf4Data.year}
            </Text>
            <Text style={styles.adviserSubText}>
              School Head: {sf4Data.school_head || sf4Data.principal_name || 'Unassigned'}
            </Text>

            {filteredSf4Groups.map((g: any) => {
              const secCount = g.sections?.length || 0;
              const enrolledCount = g.subtotal?.registered_end?.total ?? 0;
              const adaVal = Number(g.subtotal?.daily_average?.total ?? 0).toFixed(1);
              return (
                <View key={g.grade_level} style={styles.sf4GroupCard}>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.learnerName}>{g.grade_level}</Text>
                    <Text style={styles.learnerMeta}>
                      {secCount} Active Section(s) &bull; Daily Avg: {adaVal}
                    </Text>
                  </View>
                  <View style={styles.sf4CountBadge}>
                    <Text style={styles.sf4CountValue}>{enrolledCount}</Text>
                    <Text style={styles.sf4CountLabel}>Enrolled</Text>
                  </View>
                </View>
              );
            })}
          </View>
        ) : (
          <View style={styles.card}>
            <Text style={styles.emptyText}>No report data available for the active filter.</Text>
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
    flexDirection: 'row',
    justifyContent: 'center',
    paddingVertical: 8,
    borderRadius: 8,
    backgroundColor: '#f1f5f9',
    alignItems: 'center',
    gap: 4,
  },
  tabBtnActive: { backgroundColor: '#004b87' },
  tabBtnText: { fontSize: 11.5, fontWeight: '800', color: '#475569' },
  tabBtnTextActive: { color: '#ffffff' },
  scrollContent: { padding: 14, paddingBottom: 110, gap: 12 },
  monthStrip: { flexDirection: 'row', marginBottom: 2 },
  monthChip: {
    paddingVertical: 6,
    paddingHorizontal: 12,
    borderRadius: 8,
    backgroundColor: '#e2e8f0',
    marginRight: 6,
  },
  monthChipActive: { backgroundColor: '#004b87' },
  monthChipText: { fontSize: 11, fontWeight: '700', color: '#334155' },
  searchBarBox: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#ffffff',
    borderRadius: 12,
    paddingHorizontal: 12,
    height: 40,
    borderWidth: 1,
    borderColor: '#cbd5e1',
    gap: 8,
  },
  searchInput: { flex: 1, fontSize: 12, color: '#0f172a' },
  card: {
    backgroundColor: '#ffffff',
    borderRadius: 14,
    padding: 14,
    borderWidth: 1,
    borderColor: '#e2e8f0',
  },
  reportCardHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  sectionTitle: {
    fontSize: 11,
    fontWeight: '800',
    color: '#004b87',
    letterSpacing: 0.4,
    marginBottom: 4,
  },
  adviserSubText: { fontSize: 11, color: '#64748b', fontWeight: '600', marginBottom: 8 },
  sectionPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingVertical: 7,
    paddingHorizontal: 14,
    borderRadius: 8,
    backgroundColor: '#e6f0fa',
    marginRight: 8,
  },
  sectionPillActive: { backgroundColor: '#004b87' },
  sectionPillText: { fontSize: 11.5, fontWeight: '800', color: '#004b87' },
  metaRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  cardTitle: { fontSize: 15, fontWeight: '800', color: '#0f172a' },
  cardSub: { fontSize: 11, color: '#64748b', marginTop: 1 },
  statusPill: { paddingVertical: 4, paddingHorizontal: 8, borderRadius: 6 },
  pillGreen: { backgroundColor: '#dcfce7' },
  pillBlue: { backgroundColor: '#e0f2fe' },
  pillAmber: { backgroundColor: '#fef3c7' },
  statusPillText: { fontSize: 9, fontWeight: '800' },
  statsGrid: {
    flexDirection: 'row',
    backgroundColor: '#f8fafc',
    borderRadius: 10,
    padding: 10,
    marginTop: 12,
    alignItems: 'center',
    justifyContent: 'space-between',
    borderWidth: 1,
    borderColor: '#f1f5f9',
  },
  statBox: { alignItems: 'center', flex: 1 },
  statDivider: { width: 1, height: 24, backgroundColor: '#e2e8f0' },
  statVal: { fontSize: 13, fontWeight: '800', color: '#003460' },
  statLabel: { fontSize: 9, fontWeight: '700', color: '#64748b', marginTop: 2 },
  submitBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#004b87',
    paddingVertical: 10,
    borderRadius: 10,
    marginTop: 10,
    gap: 6,
  },
  submitBtnText: { color: '#ffffff', fontSize: 11.5, fontWeight: '800' },
  dtrTableHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 6,
    borderBottomWidth: 1.5,
    borderBottomColor: '#cbd5e1',
    marginTop: 4,
  },
  dtrHeaderCell: { flex: 1, textAlign: 'center', fontSize: 9.5, fontWeight: '800', color: '#475569' },
  tableRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 7,
    borderBottomWidth: 1,
    borderBottomColor: '#f1f5f9',
  },
  tableCell: { flex: 1, textAlign: 'center', fontSize: 10.5, color: '#334155' },
  sfSummaryChipsRow: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 10,
  },
  sfSummaryChip: {
    flex: 1,
    borderRadius: 10,
    paddingVertical: 8,
    paddingHorizontal: 6,
    alignItems: 'center',
  },
  sfSummaryChipVal: { fontSize: 15, fontWeight: '800' },
  sfSummaryChipLab: { fontSize: 9.5, fontWeight: '700', color: '#64748b', marginTop: 1 },
  learnerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 9,
    borderBottomWidth: 1,
    borderBottomColor: '#f1f5f9',
    gap: 10,
  },
  learnerIndexBadge: {
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: '#f1f5f9',
    alignItems: 'center',
    justifyContent: 'center',
  },
  learnerIndexText: { fontSize: 10, fontWeight: '800', color: '#475569' },
  learnerName: { fontSize: 12.5, fontWeight: '700', color: '#0f172a' },
  learnerMeta: { fontSize: 10.5, color: '#64748b', marginTop: 1 },
  sexBadge: { paddingVertical: 3, paddingHorizontal: 8, borderRadius: 6 },
  sexBadgeText: { fontSize: 10, fontWeight: '800' },
  metricPillSmall: { paddingVertical: 3, paddingHorizontal: 7, borderRadius: 6 },
  sf4GroupCard: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: '#f1f5f9',
  },
  sf4CountBadge: {
    backgroundColor: '#f0f9ff',
    paddingVertical: 4,
    paddingHorizontal: 10,
    borderRadius: 8,
    alignItems: 'center',
    minWidth: 60,
  },
  sf4CountValue: { fontSize: 13, fontWeight: '800', color: '#0284c7' },
  sf4CountLabel: { fontSize: 8.5, fontWeight: '700', color: '#64748b' },
  emptyText: { fontSize: 11.5, color: '#94a3b8', textAlign: 'center', paddingVertical: 16 },
});

export default ReportsScreen;