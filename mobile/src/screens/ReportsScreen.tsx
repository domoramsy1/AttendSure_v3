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
import { useAuth } from '../context/AuthContext';
import { COLORS } from '../constants/theme';

// Standalone Report Components
import DTRReportView from '../components/reports/DTRReportView';
import SF1ReportView from '../components/reports/SF1ReportView';
import SF2ReportView from '../components/reports/SF2ReportView';
import SF4ReportView from '../components/reports/SF4ReportView';

type ReportType = 'DTR' | 'SF1' | 'SF2' | 'SF4';

interface AssignedSection {
  section_id: number;
  section_name: string;
  grade_level?: string;
}

const FULL_MONTHS = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];

const SHORT_MONTHS = [
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

const triggerBrowserPrint = (htmlContent: string) => {
  if (typeof document === 'undefined') return;

  const frameId = 'attendsure-print-frame';
  const existing = document.getElementById(frameId);
  if (existing?.parentNode) existing.parentNode.removeChild(existing);

  const iframe = document.createElement('iframe');
  iframe.id = frameId;
  iframe.style.position = 'fixed';
  iframe.style.top = '-10000px';
  iframe.style.left = '-10000px';
  iframe.style.width = '1200px';
  iframe.style.height = '900px';
  iframe.style.border = '0';
  document.body.appendChild(iframe);

  const win = iframe.contentWindow;
  const doc = win?.document;
  if (doc && win) {
    doc.open();
    doc.write(htmlContent);
    doc.close();
    setTimeout(() => {
      win.focus();
      win.print();
    }, 350);
  }
};

export const ReportsScreen: React.FC = () => {
  const { user } = useAuth();
  const now = new Date();
  const isMounted = useRef<boolean>(true);
  const abortControllerRef = useRef<AbortController | null>(null);

  // 1. Role-Based Permissions
  const currentUser = user as Record<string, any> | null;
  const userRole = String(
    currentUser?.role || currentUser?.system_role || 'EMPLOYEE'
  ).trim().toUpperCase();

  const isAdmin = ['ADMIN', 'SUPERADMIN', 'PRINCIPAL', 'REGISTRAR'].includes(userRole) || Boolean(currentUser?.is_superuser);
  const isTeacher = ['TEACHER', 'FACULTY'].includes(userRole);
  const isStaffOnly = ['STAFF', 'GUARD', 'SECURITY'].includes(userRole);

  // Available tabs calculated strictly according to user permissions
  const availableTabs = useMemo(() => {
    const tabs: Array<{ key: ReportType; label: string; icon: keyof typeof Ionicons.glyphMap }> = [];

    // All employees can view their own DTR (Form 48)
    tabs.push({ key: 'DTR', label: 'DTR', icon: 'time-outline' });

    // Classroom Registers (SF1 & SF2) are restricted to Teachers and Administrators
    if (isAdmin || isTeacher) {
      tabs.push({ key: 'SF1', label: 'SF1', icon: 'people-outline' });
      tabs.push({ key: 'SF2', label: 'SF2', icon: 'calendar-outline' });
    }

    // Consolidated Movement (SF4) is strictly for School Heads and Administrators
    if (isAdmin) {
      tabs.push({ key: 'SF4', label: 'SF4', icon: 'stats-chart-outline' });
    }

    return tabs;
  }, [isAdmin, isTeacher]);

  // Set default tab to the first allowed tab (e.g. SF1 for teachers, DTR for general staff)
  const [selectedTab, setSelectedTab] = useState<ReportType>(() => {
    if (isAdmin || isTeacher) return 'SF1';
    return 'DTR';
  });

  const [selectedMonth, setSelectedMonth] = useState<number>(now.getMonth() + 1);
  const [selectedYear, setSelectedYear] = useState<number>(now.getFullYear());
  const [searchQuery, setSearchQuery] = useState<string>('');

  const [sections, setSections] = useState<AssignedSection[]>([]);
  const [selectedSectionId, setSelectedSectionId] = useState<number | null>(null);

  // Active Report Payloads
  const [dtrData, setDtrData] = useState<any>(null);
  const [sf1Data, setSf1Data] = useState<any>(null);
  const [sf2Data, setSf2Data] = useState<any>(null);
  const [sf4Data, setSf4Data] = useState<any>(null);

  const [loading, setLoading] = useState<boolean>(true);
  const [refreshing, setRefreshing] = useState<boolean>(false);
  const [submittingDtr, setSubmittingDtr] = useState<boolean>(false);
  const [exportingPdf, setExportingPdf] = useState<boolean>(false);
  const [printingDoc, setPrintingDoc] = useState<boolean>(false);

  const monthScrollRef = useRef<ScrollView>(null);

  // Security guard: If user role changes, enforce valid tab selection
  useEffect(() => {
    const isCurrentTabAllowed = availableTabs.some((t) => t.key === selectedTab);
    if (!isCurrentTabAllowed && availableTabs.length > 0) {
      setSelectedTab(availableTabs[0].key);
    }
  }, [availableTabs, selectedTab]);

  useEffect(() => {
    const timer = setTimeout(() => {
      if (monthScrollRef.current && selectedMonth > 3) {
        monthScrollRef.current.scrollTo({ x: Math.max(0, (selectedMonth - 2) * 82), animated: true });
      }
    }, 200);
    return () => clearTimeout(timer);
  }, [selectedMonth, selectedTab]);

  const loadSections = useCallback(async () => {
    if (isStaffOnly) return; // General staff don't have teaching sections

    try {
      const [classListRes, secRes] = await Promise.allSettled([
        apiClient.get('classroom/class_list/'),
        apiClient.get('sections/'),
      ]);

      const map = new Map<number, AssignedSection>();

      if (classListRes.status === 'fulfilled' && Array.isArray(classListRes.value.data)) {
        classListRes.value.data.forEach((item: any) => {
          if (item.section_id && !map.has(item.section_id)) {
            map.set(item.section_id, {
              section_id: item.section_id,
              section_name: item.section_name,
            });
          }
        });
      }

      if (map.size === 0 && secRes.status === 'fulfilled') {
        const raw = Array.isArray(secRes.value.data)
          ? secRes.value.data
          : secRes.value.data?.results || [];
        raw.forEach((s: any) => {
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
  }, [selectedSectionId, isStaffOnly]);

  const loadReportData = useCallback(async () => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }
    const controller = new AbortController();
    abortControllerRef.current = controller;

    setLoading(true);
    const monthName = FULL_MONTHS[selectedMonth - 1] || 'October';

    try {
      if (selectedTab === 'DTR') {
        const res = await apiClient.get('dtr/', {
          params: { month: selectedMonth, year: selectedYear },
          signal: controller.signal,
        });
        if (isMounted.current) setDtrData(res.data || null);
      } else if (selectedTab === 'SF1' && selectedSectionId && (isAdmin || isTeacher)) {
        const res = await apiClient.get(`reports/sf1/${selectedSectionId}/`, {
          signal: controller.signal,
        });
        if (isMounted.current) setSf1Data(res.data || null);
      } else if (selectedTab === 'SF2' && selectedSectionId && (isAdmin || isTeacher)) {
        const res = await apiClient.get(`reports/sf2/${selectedSectionId}/`, {
          params: { month: monthName, year: selectedYear },
          signal: controller.signal,
        });
        if (isMounted.current) setSf2Data(res.data || null);
      } else if (selectedTab === 'SF4' && isAdmin) {
        const res = await apiClient.get('reports/sf4/', {
          params: { month: monthName, year: selectedYear },
          signal: controller.signal,
        });
        if (isMounted.current) setSf4Data(res.data || null);
      }
    } catch {
      // Ignore request cancellations
    } finally {
      if (isMounted.current) {
        setLoading(false);
        setRefreshing(false);
      }
    }
  }, [selectedTab, selectedMonth, selectedYear, selectedSectionId, isAdmin, isTeacher]);

  useEffect(() => {
    isMounted.current = true;
    loadSections();
    return () => {
      isMounted.current = false;
      if (abortControllerRef.current) abortControllerRef.current.abort();
    };
  }, [loadSections]);

  useEffect(() => {
    loadReportData();
  }, [loadReportData]);

  const onRefresh = useCallback(() => {
    setRefreshing(true);
    loadReportData();
  }, [loadReportData]);

  const handleSubmitDtr = async () => {
    if (!dtrData) return;
    setSubmittingDtr(true);
    try {
      await apiClient.post('dtr/', {
        action: 'SUBMIT_DTR',
        month: selectedMonth,
        year: selectedYear,
      });
      showAlert('Success', 'DTR submitted.');
      await loadReportData();
    } catch (err: any) {
      showAlert('Error', err?.response?.data?.error || 'Failed to submit DTR.');
    } finally {
      if (isMounted.current) setSubmittingDtr(false);
    }
  };

  const fetchReportExportPayload = async () => {
    const monthName = FULL_MONTHS[selectedMonth - 1] || 'October';
    const payload = {
      report_type: selectedTab,
      section_id: selectedTab === 'SF4' ? undefined : selectedSectionId || undefined,
      month: selectedTab === 'DTR' ? selectedMonth : monthName,
      year: selectedYear,
    };

    try {
      const res = await apiClient.post('reports/export/', payload);
      return res.data;
    } catch (postErr: any) {
      if (postErr?.response?.status === 405) {
        const res = await apiClient.get('reports/export/', { params: payload });
        return res.data;
      }
      throw postErr;
    }
  };

  const handlePrint = async () => {
    if ((selectedTab === 'SF1' || selectedTab === 'SF2') && !selectedSectionId) {
      showAlert('Required', 'Please select a class section.');
      return;
    }

    setPrintingDoc(true);
    try {
      const data = await fetchReportExportPayload();
      const html = data?.html || '';

      if (Platform.OS === 'web' && html) {
        triggerBrowserPrint(html);
      } else {
        try {
          const Print = require('expo-print');
          await Print.printAsync({ html });
        } catch {
          await Share.share({
            title: `Print_${selectedTab}`,
            message: `Official ${selectedTab} Attendance Document ready for printing.`,
          });
        }
      }
    } catch (err: any) {
      showAlert('Notice', err?.response?.data?.error || 'Could not send document to printer.');
    } finally {
      if (isMounted.current) setPrintingDoc(false);
    }
  };

  const handleDownloadPDF = async () => {
    if ((selectedTab === 'SF1' || selectedTab === 'SF2') && !selectedSectionId) {
      showAlert('Required', 'Please select a class section.');
      return;
    }

    setExportingPdf(true);
    try {
      const data = await fetchReportExportPayload();
      const html = data?.html || '';
      const title = data?.title || `${selectedTab}_Report`;

      if (Platform.OS === 'web' && html) {
        triggerBrowserPrint(html);
      } else {
        try {
          const Print = require('expo-print');
          const Sharing = require('expo-sharing');
          const { uri } = await Print.printToFileAsync({ html });
          await Sharing.shareAsync(uri, { UTI: '.pdf', mimeType: 'application/pdf' });
        } catch {
          await Share.share({
            title,
            message: `${title}\n\nAttendSure Official PDF Document.`,
          });
        }
      }
    } catch (err: any) {
      showAlert('Notice', err?.response?.data?.error || 'Could not export PDF report.');
    } finally {
      if (isMounted.current) setExportingPdf(false);
    }
  };

  const filteredSf1 = useMemo(() => {
    const raw = sf1Data?.learners || sf1Data?.students || [];
    if (!searchQuery.trim()) return raw;
    const q = searchQuery.toLowerCase().trim();
    return raw.filter(
      (st: any) =>
        String(st.name || '').toLowerCase().includes(q) ||
        String(st.lrn || '').toLowerCase().includes(q)
    );
  }, [sf1Data, searchQuery]);

  const filteredSf2 = useMemo(() => {
    if (!sf2Data) return [];
    const raw = [
      ...(Array.isArray(sf2Data.males) ? sf2Data.males : []),
      ...(Array.isArray(sf2Data.females) ? sf2Data.females : []),
      ...(Array.isArray(sf2Data.learners) ? sf2Data.learners : []),
    ];
    const seen = new Set();
    const unique = raw.filter((i) => {
      const k = i.id || i.lrn || i.name;
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

  const filteredSf4 = useMemo(() => {
    const groups = sf4Data?.grade_groups || [];
    if (!searchQuery.trim()) return groups;
    const q = searchQuery.toLowerCase().trim();
    return groups.filter((g: any) => String(g.grade_level || '').toLowerCase().includes(q));
  }, [sf4Data, searchQuery]);

  return (
    <SafeAreaView style={styles.container} edges={['top', 'left', 'right']}>
      {/* Top Header */}
      <View style={styles.topHeader}>
        <View style={{ flex: 1 }}>
          <Text style={styles.screenTitle}>Reports</Text>
          <Text style={styles.screenSub}>Export &amp; Print</Text>
        </View>

        <View style={{ flexDirection: 'row', gap: 6 }}>
          <TouchableOpacity
            style={[styles.btnSec, (loading || printingDoc) && { opacity: 0.6 }]}
            onPress={handlePrint}
            disabled={loading || printingDoc}
          >
            {printingDoc ? (
              <ActivityIndicator size="small" color="#004b87" />
            ) : (
              <>
                <Ionicons name="print-outline" size={15} color="#004b87" />
                <Text style={styles.btnSecText}>Print</Text>
              </>
            )}
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.btnPri, (loading || exportingPdf) && { opacity: 0.6 }]}
            onPress={handleDownloadPDF}
            disabled={loading || exportingPdf}
          >
            {exportingPdf ? (
              <ActivityIndicator size="small" color="#ffffff" />
            ) : (
              <>
                <Ionicons name="download-outline" size={15} color="#ffffff" />
                <Text style={styles.btnPriText}>PDF</Text>
              </>
            )}
          </TouchableOpacity>
        </View>
      </View>

      {/* Role-Filtered Tab Switcher */}
      <View style={styles.tabRow}>
        {availableTabs.map((tab) => {
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
              <Ionicons name={tab.icon} size={13} color={active ? '#ffffff' : '#475569'} />
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
        {/* Month Selector for DTR, SF2, SF4 */}
        {selectedTab !== 'SF1' && (
          <ScrollView
            ref={monthScrollRef}
            horizontal
            showsHorizontalScrollIndicator={false}
            style={styles.monthStrip}
          >
            {SHORT_MONTHS.map((mName, idx) => {
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

        {/* Section Selector for SF1 & SF2 */}
        {(selectedTab === 'SF1' || selectedTab === 'SF2') && (
          <View style={styles.card}>
            <Text style={styles.sectionHeaderTitle}>SECTION</Text>
            {sections.length === 0 ? (
              <Text style={styles.emptyText}>No assigned sections found.</Text>
            ) : (
              <ScrollView horizontal showsHorizontalScrollIndicator={false}>
                {sections.map((sec) => {
                  const active = sec.section_id === selectedSectionId;
                  return (
                    <TouchableOpacity
                      key={String(sec.section_id)}
                      style={[styles.secPill, active && styles.secPillActive]}
                      onPress={() => setSelectedSectionId(sec.section_id)}
                    >
                      <Ionicons
                        name="school-outline"
                        size={13}
                        color={active ? '#ffffff' : '#004b87'}
                      />
                      <Text style={[styles.secPillText, active && { color: '#ffffff' }]}>
                        {sec.section_name}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </ScrollView>
            )}
          </View>
        )}

        {/* Quick Search */}
        {selectedTab !== 'DTR' && (
          <View style={styles.searchBox}>
            <Ionicons name="search-outline" size={16} color="#64748b" />
            <TextInput
              style={styles.searchInput}
              value={searchQuery}
              onChangeText={setSearchQuery}
              placeholder={
                selectedTab === 'SF4' ? 'Filter grade level...' : 'Search learner or LRN...'
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

        {/* Dynamic Report Content */}
        {loading ? (
          <View style={styles.card}>
            <ActivityIndicator size="small" color={COLORS.primary} style={{ marginVertical: 24 }} />
            <Text style={styles.loadingText}>Loading {selectedTab} records...</Text>
          </View>
        ) : selectedTab === 'DTR' ? (
          <DTRReportView
            data={dtrData}
            selectedMonth={selectedMonth}
            selectedYear={selectedYear}
            onMonthChange={(m, y) => {
              setSelectedMonth(m);
              setSelectedYear(y);
            }}
            submitting={submittingDtr}
            onSubmit={handleSubmitDtr}
            onRefreshNeeded={() => loadReportData()}
          />
        ) : selectedTab === 'SF1' ? (
          <SF1ReportView data={sf1Data} learners={filteredSf1} />
        ) : selectedTab === 'SF2' ? (
          <SF2ReportView data={sf2Data} learners={filteredSf2} />
        ) : selectedTab === 'SF4' ? (
          <SF4ReportView data={sf4Data} gradeGroups={filteredSf4} />
        ) : null}
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
  screenTitle: { fontSize: 17, fontWeight: '800', color: '#003460' },
  screenSub: { fontSize: 10.5, color: '#64748b', marginTop: 1 },
  btnPri: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#004b87',
    paddingVertical: 7,
    paddingHorizontal: 11,
    borderRadius: 8,
    gap: 4,
    minWidth: 64,
    justifyContent: 'center',
  },
  btnPriText: { color: '#ffffff', fontSize: 11.5, fontWeight: '800' },
  btnSec: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#e6f0fa',
    paddingVertical: 7,
    paddingHorizontal: 11,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#b8d6f0',
    gap: 4,
    minWidth: 64,
    justifyContent: 'center',
  },
  btnSecText: { color: '#004b87', fontSize: 11.5, fontWeight: '800' },
  tabRow: {
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
  scrollContent: { padding: 14, paddingBottom: 140, gap: 10 },
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
  card: {
    backgroundColor: '#ffffff',
    borderRadius: 14,
    padding: 14,
    borderWidth: 1,
    borderColor: '#e2e8f0',
  },
  sectionHeaderTitle: {
    fontSize: 10.5,
    fontWeight: '800',
    color: '#004b87',
    letterSpacing: 0.4,
    marginBottom: 8,
  },
  secPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingVertical: 7,
    paddingHorizontal: 12,
    borderRadius: 8,
    backgroundColor: '#e6f0fa',
    marginRight: 8,
  },
  secPillActive: { backgroundColor: '#004b87' },
  secPillText: { fontSize: 11, fontWeight: '800', color: '#004b87' },
  searchBox: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#ffffff',
    borderRadius: 10,
    paddingHorizontal: 12,
    height: 40,
    borderWidth: 1,
    borderColor: '#cbd5e1',
    gap: 8,
  },
  searchInput: { flex: 1, fontSize: 12, color: '#0f172a' },
  loadingText: { fontSize: 11, color: '#64748b', textAlign: 'center' },
  emptyText: { fontSize: 11, color: '#94a3b8', textAlign: 'center', paddingVertical: 8 },
});

export default ReportsScreen;