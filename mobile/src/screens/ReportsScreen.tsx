/**
 * AttendSure Mobile - School Forms & Official Attendance Reports
 * File: mobile/src/screens/ReportsScreen.tsx
 */

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
import { useNavigation } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { apiClient } from '../api/client';
import { useAuth } from '../context/AuthContext';
import { useThemeMode } from '../context/ThemeContext';
import {
  cleanText,
  getFriendlyErrorMessage,
  type ThemePalette,
} from '../constants/theme';

import DTRReportView from '../components/reports/DTRReportView';
import SF1ReportView from '../components/reports/SF1ReportView';
import SF2ReportView from '../components/reports/SF2ReportView';
import SF4ReportView from '../components/reports/SF4ReportView';

type ReportType = 'DTR' | 'SF1' | 'SF2' | 'SF4';

interface ReportsScreenProps {
  embedded?: boolean;
}

interface AssignedSection {
  section_id: number;
  section_name: string;
  grade_level?: string;
}

const SECTIONS_CACHE_KEY = 'attendsure_cached_report_sections';

const FULL_MONTHS = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];

const SHORT_MONTHS = [
  'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
  'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec',
];

const isCanceledError = (err: unknown): boolean => {
  const e = err as { code?: string; name?: string };
  return e?.code === 'ERR_CANCELED' || e?.name === 'CanceledError' || e?.name === 'AbortError';
};

const showAlert = (title: string, message: string): void => {
  if (Platform.OS === 'web' && typeof window !== 'undefined') {
    window.alert(`${title}: ${message}`);
  } else {
    Alert.alert(title, message);
  }
};

// Strips executable scripts and event handlers from HTML before printing or downloading
const sanitizeReportHtml = (rawHtml: string): string =>
  String(rawHtml || '')
    .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '')
    .replace(/<(iframe|object|embed|applet)\b[^>]*>[\s\S]*?<\/\1>/gi, '')
    .replace(/<(iframe|object|embed|applet)\b[^>]*\/?>/gi, '')
    .replace(/\son[a-z]+\s*=\s*("[^"]*"|'[^']*'|[^\s>]+)/gi, '')
    .replace(/javascript:/gi, '');

// Safe sandboxed Blob URL printing without document.write
const triggerSafeBrowserPrint = (rawHtml: string): void => {
  if (typeof document === 'undefined' || typeof Blob === 'undefined' || typeof URL === 'undefined') {
    return;
  }

  const safeHtml = sanitizeReportHtml(rawHtml);
  const blob = new Blob([safeHtml], { type: 'text/html;charset=utf-8' });
  const blobUrl = URL.createObjectURL(blob);

  const frameId = 'attendsure-print-frame';
  const existing = document.getElementById(frameId);
  if (existing?.parentNode) existing.parentNode.removeChild(existing);

  const iframe = document.createElement('iframe');
  iframe.id = frameId;
  // Scripts are strictly blocked because allow-scripts is omitted
  iframe.setAttribute('sandbox', 'allow-modals allow-same-origin');
  iframe.style.position = 'fixed';
  iframe.style.top = '-10000px';
  iframe.style.left = '-10000px';
  iframe.style.width = '1200px';
  iframe.style.height = '900px';
  iframe.style.border = '0';

  const cleanup = () => {
    URL.revokeObjectURL(blobUrl);
    if (iframe.parentNode) iframe.parentNode.removeChild(iframe);
  };

  iframe.onload = () => {
    try {
      iframe.contentWindow?.focus();
      iframe.contentWindow?.print();
    } catch {
      // Browser blocked automatic print dialog
    } finally {
      setTimeout(cleanup, 1500);
    }
  };

  iframe.src = blobUrl;
  document.body.appendChild(iframe);
};

// Safe Blob file download on web without document.write
const triggerSafeBrowserDownload = (rawHtml: string, rawFilename: string): void => {
  if (typeof document === 'undefined' || typeof Blob === 'undefined' || typeof URL === 'undefined') {
    return;
  }

  const safeHtml = sanitizeReportHtml(rawHtml);
  const safeName = cleanText(rawFilename, 80).replace(/[^a-zA-Z0-9_-]/g, '_') || 'AttendSure_Report';
  const blob = new Blob([safeHtml], { type: 'text/html;charset=utf-8' });
  const blobUrl = URL.createObjectURL(blob);

  const link = document.createElement('a');
  link.href = blobUrl;
  link.download = `${safeName}.html`;
  link.rel = 'noopener noreferrer';
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  setTimeout(() => URL.revokeObjectURL(blobUrl), 1000);
};

export const ReportsScreen: React.FC<ReportsScreenProps> = ({ embedded = false }) => {
  const navigation = useNavigation();
  const { user } = useAuth();
  const { palette, fonts } = useThemeMode();
  const styles = useMemo(() => createStyles(palette, fonts), [palette, fonts]);

  const now = new Date();
  const isMounted = useRef<boolean>(true);
  const sectionsAbortRef = useRef<AbortController | null>(null);
  const reportAbortRef = useRef<AbortController | null>(null);
  const monthScrollRef = useRef<React.ComponentRef<typeof ScrollView> | null>(null);

  // 1. Role-Based Permissions
  const currentUser = user as Record<string, any> | null;
  const userRole = String(currentUser?.role || currentUser?.system_role || 'FACULTY')
    .trim()
    .toUpperCase();

  const isAdmin =
    ['ADMIN', 'SUPERADMIN', 'PRINCIPAL', 'REGISTRAR', 'DEPT_HEAD'].includes(userRole) ||
    Boolean(currentUser?.is_superuser);
  const isFaculty = ['FACULTY', 'ADVISER', 'EMPLOYEE'].includes(userRole);
  const isStaffOnly = ['STAFF', 'PARENT'].includes(userRole);

  const availableTabs = useMemo(() => {
    const tabs: Array<{ key: ReportType; label: string; icon: keyof typeof Ionicons.glyphMap }> = [];
    tabs.push({ key: 'DTR', label: 'DTR', icon: 'time-outline' });
    if (isAdmin || isFaculty) {
      tabs.push({ key: 'SF1', label: 'SF1', icon: 'people-outline' });
      tabs.push({ key: 'SF2', label: 'SF2', icon: 'calendar-outline' });
    }
    if (isAdmin) {
      tabs.push({ key: 'SF4', label: 'SF4', icon: 'stats-chart-outline' });
    }
    return tabs;
  }, [isAdmin, isFaculty]);

  const [selectedTab, setSelectedTab] = useState<ReportType>(() =>
    isAdmin || isFaculty ? 'SF1' : 'DTR'
  );
  const [selectedMonth, setSelectedMonth] = useState<number>(now.getMonth() + 1);
  const [selectedYear, setSelectedYear] = useState<number>(now.getFullYear());
  const [searchQuery, setSearchQuery] = useState<string>('');

  const [sections, setSections] = useState<AssignedSection[]>([]);
  const [selectedSectionId, setSelectedSectionId] = useState<number | null>(null);

  const [dtrData, setDtrData] = useState<any>(null);
  const [sf1Data, setSf1Data] = useState<any>(null);
  const [sf2Data, setSf2Data] = useState<any>(null);
  const [sf4Data, setSf4Data] = useState<any>(null);

  const [loading, setLoading] = useState<boolean>(true);
  const [refreshing, setRefreshing] = useState<boolean>(false);
  const [submittingDtr, setSubmittingDtr] = useState<boolean>(false);
  const [exportingDoc, setExportingDoc] = useState<boolean>(false);
  const [printingDoc, setPrintingDoc] = useState<boolean>(false);

  useEffect(() => {
    const isCurrentTabAllowed = availableTabs.some((t) => t.key === selectedTab);
    if (!isCurrentTabAllowed && availableTabs.length > 0) {
      setSelectedTab(availableTabs[0].key);
    }
  }, [availableTabs, selectedTab]);

  useEffect(() => {
    const timer = setTimeout(() => {
      if (monthScrollRef.current && selectedMonth > 3) {
        monthScrollRef.current.scrollTo({
          x: Math.max(0, (selectedMonth - 2) * 82),
          animated: true,
        });
      }
    }, 200);
    return () => clearTimeout(timer);
  }, [selectedMonth, selectedTab]);

  const loadSections = useCallback(async () => {
    if (isStaffOnly) return;

    sectionsAbortRef.current?.abort();
    const controller = new AbortController();
    sectionsAbortRef.current = controller;

    try {
      const cached = await AsyncStorage.getItem(SECTIONS_CACHE_KEY);
      if (cached && isMounted.current && !controller.signal.aborted) {
        const parsed: AssignedSection[] = JSON.parse(cached);
        if (Array.isArray(parsed) && parsed.length > 0) {
          setSections(parsed);
          setSelectedSectionId((prev) => prev ?? parsed[0].section_id);
        }
      }
    } catch {}

    try {
      const [classListRes, secRes] = await Promise.allSettled([
        apiClient
          .get('classroom/assigned/', { signal: controller.signal })
          .catch((err: unknown) => {
            if (isCanceledError(err) || controller.signal.aborted) throw err;
            return apiClient.get('classroom/class_list/', { signal: controller.signal });
          }),
        apiClient.get('sections/', { signal: controller.signal }),
      ]);

      if (!isMounted.current || controller.signal.aborted) return;

      const map = new Map<number, AssignedSection>();

      if (classListRes.status === 'fulfilled' && Array.isArray(classListRes.value?.data)) {
        classListRes.value.data.forEach((item: any) => {
          if (item?.section_id && !map.has(item.section_id)) {
            map.set(item.section_id, {
              section_id: item.section_id,
              section_name: item.section_name,
            });
          }
        });
      }

      if (map.size === 0 && secRes.status === 'fulfilled') {
        const raw = Array.isArray(secRes.value?.data)
          ? secRes.value.data
          : secRes.value?.data?.results || [];
        raw.forEach((s: any) => {
          if (s?.id && !map.has(s.id)) {
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
      AsyncStorage.setItem(SECTIONS_CACHE_KEY, JSON.stringify(list)).catch(() => {});
      if (list.length > 0) {
        setSelectedSectionId((prev) => prev ?? list[0].section_id);
      }
    } catch (err: unknown) {
      if (isCanceledError(err)) return;
    }
  }, [isStaffOnly]);

  const loadReportData = useCallback(async () => {
    reportAbortRef.current?.abort();
    const controller = new AbortController();
    reportAbortRef.current = controller;

    if (isMounted.current) setLoading(true);
    const monthName = FULL_MONTHS[selectedMonth - 1] || 'October';
    const cacheKey = `attendsure_report_${selectedTab}_${selectedSectionId || 'all'}_${selectedMonth}_${selectedYear}`;

    try {
      const cached = await AsyncStorage.getItem(cacheKey);
      if (cached && isMounted.current && !controller.signal.aborted) {
        const parsed = JSON.parse(cached);
        if (selectedTab === 'DTR') setDtrData(parsed);
        else if (selectedTab === 'SF1') setSf1Data(parsed);
        else if (selectedTab === 'SF2') setSf2Data(parsed);
        else if (selectedTab === 'SF4') setSf4Data(parsed);
      }
    } catch {}

    try {
      if (selectedTab === 'DTR') {
        const res = await apiClient
          .get<any>('reports/dtr/', {
            params: { month: selectedMonth, year: selectedYear },
            signal: controller.signal,
          })
          .catch((err: unknown) => {
            if (isCanceledError(err) || controller.signal.aborted) throw err;
            return apiClient.get<any>('dtr/', {
              params: { month: selectedMonth, year: selectedYear },
              signal: controller.signal,
            });
          });
        if (isMounted.current && !controller.signal.aborted) {
          setDtrData(res.data || null);
          if (res.data) AsyncStorage.setItem(cacheKey, JSON.stringify(res.data)).catch(() => {});
        }
      } else if (selectedTab === 'SF1' && selectedSectionId && (isAdmin || isFaculty)) {
        const encodedId = encodeURIComponent(String(selectedSectionId));
        const res = await apiClient.get(`reports/sf1/${encodedId}/`, {
          signal: controller.signal,
        });
        if (isMounted.current && !controller.signal.aborted) {
          setSf1Data(res.data || null);
          if (res.data) AsyncStorage.setItem(cacheKey, JSON.stringify(res.data)).catch(() => {});
        }
      } else if (selectedTab === 'SF2' && selectedSectionId && (isAdmin || isFaculty)) {
        const encodedId = encodeURIComponent(String(selectedSectionId));
        const res = await apiClient.get(`reports/sf2/${encodedId}/`, {
          params: { month: monthName, year: selectedYear },
          signal: controller.signal,
        });
        if (isMounted.current && !controller.signal.aborted) {
          setSf2Data(res.data || null);
          if (res.data) AsyncStorage.setItem(cacheKey, JSON.stringify(res.data)).catch(() => {});
        }
      } else if (selectedTab === 'SF4' && isAdmin) {
        const res = await apiClient.get('reports/sf4/', {
          params: { month: monthName, year: selectedYear },
          signal: controller.signal,
        });
        if (isMounted.current && !controller.signal.aborted) {
          setSf4Data(res.data || null);
          if (res.data) AsyncStorage.setItem(cacheKey, JSON.stringify(res.data)).catch(() => {});
        }
      }
    } catch (err: unknown) {
      if (isCanceledError(err)) return;
    } finally {
      if (isMounted.current) {
        setLoading(false);
        setRefreshing(false);
      }
    }
  }, [selectedTab, selectedMonth, selectedYear, selectedSectionId, isAdmin, isFaculty]);

  useEffect(() => {
    isMounted.current = true;
    void loadSections();
    return () => {
      isMounted.current = false;
      sectionsAbortRef.current?.abort();
      reportAbortRef.current?.abort();
    };
  }, [loadSections]);

  useEffect(() => {
    void loadReportData();
  }, [loadReportData]);

  const onRefresh = useCallback(() => {
    setRefreshing(true);
    void loadReportData();
  }, [loadReportData]);

  const handleSubmitDtr = async () => {
    if (!dtrData) return;
    setSubmittingDtr(true);
    try {
      const facultyId = dtrData.faculty_id || currentUser?.id;
      const encodedFacultyId = encodeURIComponent(String(facultyId));
      const payload = {
        action: 'SUBMIT_DTR',
        faculty_id: facultyId,
        month: dtrData.month_number || selectedMonth,
        year: dtrData.year || selectedYear,
        regular_days_hours:
          dtrData.regular_days_hours || '8:00 AM - 12:00 PM / 1:00 PM - 5:00 PM',
        saturdays_hours: dtrData.saturdays_hours || 'As Required',
      };

      await apiClient
        .post(`reports/dtr/${encodedFacultyId}/`, payload)
        .catch((err: any) => {
          const status = err?.response?.status;
          if (status === 404 || status === 405) {
            return apiClient.post('dtr/', payload);
          }
          throw err;
        });

      if (!isMounted.current) return;
      showAlert('Submitted', 'Your Daily Time Record has been sent to your Department Head.');
      await loadReportData();
    } catch (err: unknown) {
      if (!isMounted.current) return;
      showAlert('Error', getFriendlyErrorMessage(err, 'Could not submit your Daily Time Record.'));
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
      showAlert('Required', 'Please select a class section first.');
      return;
    }

    setPrintingDoc(true);
    try {
      const data = await fetchReportExportPayload();
      const html = typeof data === 'string' ? data : data?.html || '';
      const monthName = FULL_MONTHS[selectedMonth - 1] || '';

      if (Platform.OS === 'web' && html) {
        triggerSafeBrowserPrint(html);
      } else {
        await Share.share({
          title: `AttendSure_${selectedTab}_${monthName}_${selectedYear}`,
          message: `AttendSure ${selectedTab} Attendance Report (${monthName} ${selectedYear}). For printable PDF layout, open Reports on the AttendSure web portal.`,
        });
      }
    } catch (err: unknown) {
      if (!isMounted.current) return;
      showAlert('Notice', getFriendlyErrorMessage(err, 'Could not prepare this document for printing.'));
    } finally {
      if (isMounted.current) setPrintingDoc(false);
    }
  };

  const handleExportReport = async () => {
    if ((selectedTab === 'SF1' || selectedTab === 'SF2') && !selectedSectionId) {
      showAlert('Required', 'Please select a class section first.');
      return;
    }

    setExportingDoc(true);
    try {
      const data = await fetchReportExportPayload();
      const html = typeof data === 'string' ? data : data?.html || '';
      const monthName = FULL_MONTHS[selectedMonth - 1] || '';
      const title =
        (typeof data === 'object' && data?.title) ||
        `AttendSure_${selectedTab}_${monthName}_${selectedYear}`;

      if (Platform.OS === 'web' && html) {
        triggerSafeBrowserDownload(html, title);
      } else {
        await Share.share({
          title,
          message: `${title}\n\nAttendSure Official Attendance Report (${monthName} ${selectedYear}).`,
        });
      }
    } catch (err: unknown) {
      if (!isMounted.current) return;
      showAlert('Notice', getFriendlyErrorMessage(err, 'Could not export this report right now.'));
    } finally {
      if (isMounted.current) setExportingDoc(false);
    }
  };

  const cleanSearch = cleanText(searchQuery, 80).toLowerCase();

  const filteredSf1 = useMemo(() => {
    const raw = sf1Data?.learners || sf1Data?.students || [];
    if (!cleanSearch) return raw;
    return raw.filter(
      (st: any) =>
        String(st.name || '').toLowerCase().includes(cleanSearch) ||
        String(st.lrn || '').toLowerCase().includes(cleanSearch)
    );
  }, [sf1Data, cleanSearch]);

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
    if (!cleanSearch) return unique;
    return unique.filter(
      (st: any) =>
        String(st.name || '').toLowerCase().includes(cleanSearch) ||
        String(st.lrn || '').toLowerCase().includes(cleanSearch)
    );
  }, [sf2Data, cleanSearch]);

  const filteredSf4 = useMemo(() => {
    const groups = sf4Data?.grade_groups || [];
    if (!cleanSearch) return groups;
    return groups.filter((g: any) =>
      String(g.grade_level || '').toLowerCase().includes(cleanSearch)
    );
  }, [sf4Data, cleanSearch]);

  const renderActionButtons = () => (
    <View style={{ flexDirection: 'row', gap: 6 }}>
      <TouchableOpacity
        style={[styles.btnSec, (loading || printingDoc) && { opacity: 0.6 }]}
        onPress={() => void handlePrint()}
        disabled={loading || printingDoc}
      >
        {printingDoc ? (
          <ActivityIndicator size="small" color={palette.primary} />
        ) : (
          <>
            <Ionicons name="print-outline" size={15} color={palette.primary} />
            <Text style={styles.btnSecText}>Print</Text>
          </>
        )}
      </TouchableOpacity>

      <TouchableOpacity
        style={[styles.btnPri, (loading || exportingDoc) && { opacity: 0.6 }]}
        onPress={() => void handleExportReport()}
        disabled={loading || exportingDoc}
      >
        {exportingDoc ? (
          <ActivityIndicator size="small" color={palette.onPrimary} />
        ) : (
          <>
            <Ionicons name="download-outline" size={15} color={palette.onPrimary} />
            <Text style={styles.btnPriText}>Export</Text>
          </>
        )}
      </TouchableOpacity>
    </View>
  );

  const content = (
    <>
      {/* Standalone Top Header (hidden when embedded inside MainTabNavigator) */}
      {!embedded ? (
        <View style={styles.topHeader}>
          <View style={styles.standaloneTitleRow}>
            {navigation.canGoBack() && (
              <TouchableOpacity
                style={styles.backBtn}
                onPress={() => navigation.goBack()}
                accessibilityLabel="Go back"
              >
                <Ionicons name="arrow-back" size={19} color={palette.textPrimary} />
              </TouchableOpacity>
            )}
            <View style={{ flex: 1 }}>
              <Text style={styles.screenTitle}>School Reports</Text>
              <Text style={styles.screenSub}>Print &amp; Export Records</Text>
            </View>
          </View>
          {renderActionButtons()}
        </View>
      ) : (
        <View style={styles.embeddedActionBar}>
          <Text style={styles.embeddedHint}>Select a form to view, print, or share</Text>
          {renderActionButtons()}
        </View>
      )}

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
              <Ionicons
                name={tab.icon}
                size={13}
                color={active ? palette.onPrimary : palette.textSecondary}
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
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            colors={[palette.primary]}
            tintColor={palette.primary}
          />
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
                  <Text style={[styles.monthChipText, active && styles.monthChipTextActive]}>
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
            <Text style={styles.sectionHeaderTitle}>CLASS SECTION</Text>
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
                        color={active ? palette.onPrimary : palette.primary}
                      />
                      <Text style={[styles.secPillText, active && styles.secPillTextActive]}>
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
            <Ionicons name="search-outline" size={16} color={palette.textMuted} />
            <TextInput
              style={styles.searchInput}
              value={searchQuery}
              onChangeText={setSearchQuery}
              placeholder={
                selectedTab === 'SF4' ? 'Filter grade level...' : 'Search student name or LRN...'
              }
              placeholderTextColor={palette.textMuted}
              maxLength={80}
            />
            {searchQuery.length > 0 && (
              <TouchableOpacity onPress={() => setSearchQuery('')}>
                <Ionicons name="close-circle" size={16} color={palette.textMuted} />
              </TouchableOpacity>
            )}
          </View>
        )}

        {/* Dynamic Report Content */}
        {loading ? (
          <View style={styles.card}>
            <ActivityIndicator size="small" color={palette.primary} style={{ marginVertical: 24 }} />
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
            onRefreshNeeded={() => void loadReportData()}
          />
        ) : selectedTab === 'SF1' ? (
          <SF1ReportView data={sf1Data} learners={filteredSf1} />
        ) : selectedTab === 'SF2' ? (
          <SF2ReportView data={sf2Data} learners={filteredSf2} />
        ) : selectedTab === 'SF4' ? (
          <SF4ReportView data={sf4Data} gradeGroups={filteredSf4} />
        ) : null}
      </ScrollView>
    </>
  );

  if (embedded) {
    return <View style={styles.container}>{content}</View>;
  }

  return (
    <SafeAreaView style={styles.container} edges={['top', 'left', 'right']}>
      {content}
    </SafeAreaView>
  );
};

const createStyles = (palette: ThemePalette, fonts: ReturnType<typeof useThemeMode>['fonts']) =>
  StyleSheet.create({
    container: { flex: 1, backgroundColor: palette.background },
    topHeader: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingHorizontal: 16,
      paddingVertical: 12,
      backgroundColor: palette.surface,
      borderBottomWidth: 1,
      borderBottomColor: palette.border,
      gap: 10,
    },
    standaloneTitleRow: { flexDirection: 'row', alignItems: 'center', flex: 1, gap: 10 },
    backBtn: {
      width: 34,
      height: 34,
      borderRadius: 10,
      backgroundColor: palette.surfaceSubtle,
      borderWidth: 1,
      borderColor: palette.border,
      alignItems: 'center',
      justifyContent: 'center',
    },
    embeddedActionBar: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingHorizontal: 16,
      paddingVertical: 10,
      backgroundColor: palette.surface,
      borderBottomWidth: 1,
      borderBottomColor: palette.border,
      gap: 8,
    },
    embeddedHint: { flex: 1, fontSize: fonts.xs, color: palette.textSecondary, fontWeight: fonts.weight.semibold },
    screenTitle: { fontSize: fonts.lg, fontWeight: fonts.weight.extrabold, color: palette.textPrimary },
    screenSub: { fontSize: fonts.xs, color: palette.textSecondary, marginTop: 1 },
    btnPri: {
      flexDirection: 'row',
      alignItems: 'center',
      backgroundColor: palette.buttonBg,
      paddingVertical: 7,
      paddingHorizontal: 11,
      borderRadius: 8,
      gap: 4,
      minWidth: 70,
      justifyContent: 'center',
    },
    btnPriText: { color: palette.onPrimary, fontSize: fonts.xs, fontWeight: fonts.weight.extrabold },
    btnSec: {
      flexDirection: 'row',
      alignItems: 'center',
      backgroundColor: palette.primarySoft,
      paddingVertical: 7,
      paddingHorizontal: 11,
      borderRadius: 8,
      borderWidth: 1,
      borderColor: palette.border,
      gap: 4,
      minWidth: 66,
      justifyContent: 'center',
    },
    btnSecText: { color: palette.primary, fontSize: fonts.xs, fontWeight: fonts.weight.extrabold },
    tabRow: {
      flexDirection: 'row',
      backgroundColor: palette.surface,
      paddingHorizontal: 16,
      paddingVertical: 8,
      gap: 6,
      borderBottomWidth: 1,
      borderBottomColor: palette.border,
    },
    tabBtn: {
      flex: 1,
      flexDirection: 'row',
      justifyContent: 'center',
      paddingVertical: 8,
      borderRadius: 8,
      backgroundColor: palette.surfaceSubtle,
      borderWidth: 1,
      borderColor: palette.border,
      alignItems: 'center',
      gap: 4,
    },
    tabBtnActive: { backgroundColor: palette.buttonBg, borderColor: palette.buttonBg },
    tabBtnText: { fontSize: fonts.xs, fontWeight: fonts.weight.extrabold, color: palette.textSecondary },
    tabBtnTextActive: { color: palette.onPrimary },
    scrollContent: { padding: 14, paddingBottom: 140, gap: 10 },
    monthStrip: { flexDirection: 'row', marginBottom: 2 },
    monthChip: {
      paddingVertical: 6,
      paddingHorizontal: 12,
      borderRadius: 8,
      backgroundColor: palette.surface,
      borderWidth: 1,
      borderColor: palette.border,
      marginRight: 6,
    },
    monthChipActive: { backgroundColor: palette.buttonBg, borderColor: palette.buttonBg },
    monthChipText: { fontSize: fonts.xs, fontWeight: fonts.weight.bold, color: palette.textSecondary },
    monthChipTextActive: { color: palette.onPrimary },
    card: {
      backgroundColor: palette.surface,
      borderRadius: 14,
      padding: 14,
      borderWidth: 1,
      borderColor: palette.border,
    },
    sectionHeaderTitle: {
      fontSize: fonts.xs,
      fontWeight: fonts.weight.extrabold,
      color: palette.primary,
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
      backgroundColor: palette.primarySoft,
      borderWidth: 1,
      borderColor: palette.border,
      marginRight: 8,
    },
    secPillActive: { backgroundColor: palette.buttonBg, borderColor: palette.buttonBg },
    secPillText: { fontSize: fonts.xs, fontWeight: fonts.weight.extrabold, color: palette.primary },
    secPillTextActive: { color: palette.onPrimary },
    searchBox: {
      flexDirection: 'row',
      alignItems: 'center',
      backgroundColor: palette.surface,
      borderRadius: 10,
      paddingHorizontal: 12,
      height: 42,
      borderWidth: 1,
      borderColor: palette.borderStrong,
      gap: 8,
    },
    searchInput: { flex: 1, fontSize: fonts.sm, color: palette.textPrimary },
    loadingText: { fontSize: fonts.xs, color: palette.textSecondary, textAlign: 'center' },
    emptyText: { fontSize: fonts.xs, color: palette.textMuted, textAlign: 'center', paddingVertical: 8 },
  });

export default ReportsScreen;
