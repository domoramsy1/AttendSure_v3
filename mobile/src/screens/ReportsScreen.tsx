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
  Platform,
  TextInput,
  Share,
  Modal,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { apiClient } from '../api/client';
import { ENDPOINTS } from '../api/endpoints';
import { useAuth } from '../context/AuthContext';
import { useThemeMode } from '../context/ThemeContext';
import {
  cleanText,
  getFriendlyErrorMessage,
  type ThemePalette,
} from '../constants/theme';
import { canViewReports, canViewSf4 } from '../utils/permissions';
import { isCanceledError, showNotice } from '../utils/helpers';
import ChipRow from '../components/common/ChipRow';

import DTRReportView from '../components/reports/DTRReportView';
import SF1ReportView from '../components/reports/SF1ReportView';
import SF2ReportView from '../components/reports/SF2ReportView';
import SF4ReportView from '../components/reports/SF4ReportView';

type ReportType = 'SCHEDULE' | 'CLASS_LIST' | 'DTR' | 'SF1' | 'SF2' | 'SF4';
type PackScope = 'ALL' | 'SELECTED';
type MobilePaperKey = 'letter' | 'folio' | 'legal' | 'a4';
type MobileOrientation = 'portrait' | 'landscape';
type MobileMarginPreset = 'compact' | 'narrow' | 'normal';

interface MobilePageSetup {
  paperSize: MobilePaperKey;
  orientation: MobileOrientation;
  marginPreset: MobileMarginPreset;
}

const MOBILE_PAPER_DIMS: Record<MobilePaperKey, { label: string; width: number; height: number }> = {
  letter: { label: 'Letter (8.5×11 in)', width: 8.5, height: 11.0 },
  folio: { label: 'Folio (8.5×13 in)', width: 8.5, height: 13.0 },
  legal: { label: 'Legal (8.5×14 in)', width: 8.5, height: 14.0 },
  a4: { label: 'A4 (8.27×11.69 in)', width: 8.27, height: 11.69 },
};

const MOBILE_MARGIN_INCHES: Record<MobileMarginPreset, { label: string; inches: number }> = {
  compact: { label: 'Compact (0.25 in)', inches: 0.25 },
  narrow: { label: 'Narrow (0.50 in)', inches: 0.5 },
  normal: { label: 'Normal (1.00 in)', inches: 1.0 },
};

const applyMobilePageSetupToHtml = (rawHtml: string, setup: MobilePageSetup): string => {
  const paper = MOBILE_PAPER_DIMS[setup.paperSize] || MOBILE_PAPER_DIMS.legal;
  const wIn = setup.orientation === 'landscape' ? paper.height : paper.width;
  const hIn = setup.orientation === 'landscape' ? paper.width : paper.height;
  const mIn = (MOBILE_MARGIN_INCHES[setup.marginPreset] || MOBILE_MARGIN_INCHES.compact).inches;

  const pageCss = `<style>
    @page { size: ${wIn}in ${hIn}in; margin: ${mIn}in !important; }
    html, body { margin: 0 !important; padding: 0 !important; }
    table { width: 100%; border-collapse: collapse; page-break-inside: auto; }
    thead { display: table-header-group; }
    tr, .qr-card, .sig-grid { page-break-inside: avoid; break-inside: avoid; }
    section.sheet:not(:last-child) { page-break-after: always; break-after: page; }
    section.sheet:last-child, .page-break:last-child { page-break-after: avoid !important; break-after: avoid !important; }
  </style>`;

  if (/<\/head>/i.test(rawHtml)) {
    return rawHtml.replace(/<\/head>/i, `${pageCss}</head>`);
  }
  return `${pageCss}${rawHtml}`;
};

interface ReportsScreenProps {
  embedded?: boolean;
}

interface AssignedSection {
  section_id: number;
  section_name: string;
  grade_level?: string;
}

interface SelectableTeacher {
  id: number;
  full_name: string;
  employee_id?: string;
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
const triggerSafeBrowserDownload = (
  content: string,
  rawFilename: string,
  mimeType = 'text/html;charset=utf-8',
  extension = 'html'
): void => {
  if (typeof document === 'undefined' || typeof Blob === 'undefined' || typeof URL === 'undefined') {
    return;
  }

  const finalBody = extension === 'html' ? sanitizeReportHtml(content) : String(content || '');
  const safeName = cleanText(rawFilename, 80).replace(/[^a-zA-Z0-9_-]/g, '_') || 'AttendSure_Report';
  const blob = new Blob([finalBody], { type: mimeType });
  const blobUrl = URL.createObjectURL(blob);

  const link = document.createElement('a');
  link.href = blobUrl;
  link.download = `${safeName}.${extension}`;
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

  // 1. Role-Based Permissions (Centralized RBAC Matrix)
  const currentUser = user as Record<string, any> | null;
  const isAdmin = canViewSf4(user);
  const canSeeClassReports = canViewReports(user);

  const availableTabs = useMemo(() => {
    const tabs: Array<{ key: ReportType; label: string; icon: keyof typeof Ionicons.glyphMap }> = [];
    if (canSeeClassReports) {
      tabs.push({
        key: 'SCHEDULE',
        label: isAdmin ? 'Schedules' : 'My Schedule',
        icon: 'calendar-number-outline',
      });
      tabs.push({
        key: 'CLASS_LIST',
        label: 'Class Lists',
        icon: 'list-outline',
      });
    }
    tabs.push({ key: 'DTR', label: 'DTR', icon: 'time-outline' });
    if (canSeeClassReports) {
      tabs.push({ key: 'SF1', label: 'SF1', icon: 'people-outline' });
      tabs.push({ key: 'SF2', label: 'SF2', icon: 'calendar-outline' });
    }
    if (isAdmin) {
      tabs.push({ key: 'SF4', label: 'SF4', icon: 'stats-chart-outline' });
    }
    return tabs;
  }, [isAdmin, canSeeClassReports]);

  const [selectedTab, setSelectedTab] = useState<ReportType>(() =>
    canSeeClassReports ? 'SCHEDULE' : 'DTR'
  );
  const [selectedMonth, setSelectedMonth] = useState<number>(now.getMonth() + 1);
  const [selectedYear, setSelectedYear] = useState<number>(now.getFullYear());
  const [searchQuery, setSearchQuery] = useState<string>('');

  const [sections, setSections] = useState<AssignedSection[]>([]);
  const [selectedSectionId, setSelectedSectionId] = useState<number | null>(null);
  const [teachersList, setTeachersList] = useState<SelectableTeacher[]>([]);
  const [packScope, setPackScope] = useState<PackScope>('ALL');
  const [pickedSectionIds, setPickedSectionIds] = useState<number[]>([]);
  const [pickedTeacherIds, setPickedTeacherIds] = useState<number[]>([]);

  const [scheduleData, setScheduleData] = useState<any>(null);
  const [classListData, setClassListData] = useState<any>(null);
  const [dtrData, setDtrData] = useState<any>(null);
  const [sf1Data, setSf1Data] = useState<any>(null);
  const [sf2Data, setSf2Data] = useState<any>(null);
  const [sf4Data, setSf4Data] = useState<any>(null);

  const [loading, setLoading] = useState<boolean>(true);
  const [refreshing, setRefreshing] = useState<boolean>(false);
  const [submittingDtr, setSubmittingDtr] = useState<boolean>(false);
  const [exportingDoc, setExportingDoc] = useState<boolean>(false);
  const [printingDoc, setPrintingDoc] = useState<boolean>(false);
  const [showPageSetup, setShowPageSetup] = useState<boolean>(false);
  const [pageSetup, setPageSetup] = useState<MobilePageSetup>({
    paperSize: 'legal',
    orientation: 'landscape',
    marginPreset: 'compact',
  });

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
      const [classListRes, secRes, teacherRes] = await Promise.allSettled([
        apiClient.get(ENDPOINTS.ATTENDANCE_CLASSES, { signal: controller.signal }),
        apiClient.get(ENDPOINTS.SECTIONS, { signal: controller.signal }),
        isAdmin
          ? apiClient.get(ENDPOINTS.TEACHERS_DROPDOWN, { signal: controller.signal })
          : Promise.resolve(null),
      ]);

      if (!isMounted.current || controller.signal.aborted) return;

      const map = new Map<number, AssignedSection>();

      if (classListRes.status === 'fulfilled') {
        const rawClasses = Array.isArray(classListRes.value?.data)
          ? classListRes.value.data
          : classListRes.value?.data?.classes || classListRes.value?.data?.results || [];
        rawClasses.forEach((item: any) => {
          const secId = item?.section_id ?? item?.section?.id;
          const secName = item?.section_name ?? item?.section?.name;
          if (secId && !map.has(secId)) {
            map.set(secId, {
              section_id: secId,
              section_name: secName || `Section ${secId}`,
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
              grade_level: s.grade_level_name || s.grade_level,
            });
          }
        });
      }

      if (isAdmin && teacherRes.status === 'fulfilled' && teacherRes.value) {
        const rawTeachers = Array.isArray(teacherRes.value.data)
          ? teacherRes.value.data
          : teacherRes.value.data?.results || [];
        const normalizedTeachers: SelectableTeacher[] = rawTeachers
          .filter((t: any) => t?.id)
          .map((t: any) => ({
            id: Number(t.id),
            full_name: String(t.full_name || t.name || `Teacher #${t.id}`),
            employee_id: t.employee_id ? String(t.employee_id) : undefined,
          }));
        setTeachersList(normalizedTeachers);
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
  }, [isAdmin]);

  const buildPrintPackBody = useCallback(
    (
      tabKey: 'SCHEDULE' | 'CLASS_LIST',
      exportFormat: 'json' | 'html' | 'csv',
      actionMode: 'PRINT' | 'EXPORT' = 'EXPORT'
    ) => {
      const body: Record<string, unknown> = {
        pack_type: tabKey === 'SCHEDULE' ? 'CLASS_SCHEDULE' : 'CLASS_LIST',
        scope: packScope,
        export_format: exportFormat,
        action_mode: actionMode,
      };
      if (exportFormat === 'html') {
        body.wrap_json = true;
      }
      if (packScope === 'SELECTED') {
        if (pickedSectionIds.length > 0) body.section_ids = pickedSectionIds;
        if (isAdmin && pickedTeacherIds.length > 0) body.teacher_ids = pickedTeacherIds;
      }
      return body;
    },
    [packScope, pickedSectionIds, pickedTeacherIds, isAdmin]
  );

  const loadReportData = useCallback(async () => {
    reportAbortRef.current?.abort();
    const controller = new AbortController();
    reportAbortRef.current = controller;

    if (
      (selectedTab === 'SCHEDULE' || selectedTab === 'CLASS_LIST') &&
      packScope === 'SELECTED' &&
      pickedSectionIds.length === 0 &&
      (!isAdmin || pickedTeacherIds.length === 0)
    ) {
      if (selectedTab === 'SCHEDULE') setScheduleData(null);
      else setClassListData(null);
      if (isMounted.current) {
        setLoading(false);
        setRefreshing(false);
      }
      return;
    }

    if (isMounted.current) setLoading(true);
    const monthName = FULL_MONTHS[selectedMonth - 1] || 'October';
    const cacheKey = `attendsure_report_${selectedTab}_${selectedSectionId || 'all'}_${packScope}_${selectedMonth}_${selectedYear}`;

    try {
      const cached = await AsyncStorage.getItem(cacheKey);
      if (cached && isMounted.current && !controller.signal.aborted) {
        const parsed = JSON.parse(cached);
        if (selectedTab === 'SCHEDULE') setScheduleData(parsed);
        else if (selectedTab === 'CLASS_LIST') setClassListData(parsed);
        else if (selectedTab === 'DTR') setDtrData(parsed);
        else if (selectedTab === 'SF1') setSf1Data(parsed);
        else if (selectedTab === 'SF2') setSf2Data(parsed);
        else if (selectedTab === 'SF4') setSf4Data(parsed);
      }
    } catch {}

    try {
      if ((selectedTab === 'SCHEDULE' || selectedTab === 'CLASS_LIST') && canSeeClassReports) {
        const res = await apiClient.post(
          ENDPOINTS.REPORT_PRINT_PACK,
          buildPrintPackBody(selectedTab, 'json', 'EXPORT'),
          { signal: controller.signal }
        );
        if (isMounted.current && !controller.signal.aborted) {
          if (selectedTab === 'SCHEDULE') setScheduleData(res.data || null);
          else setClassListData(res.data || null);
          if (res.data && packScope === 'ALL') {
            AsyncStorage.setItem(cacheKey, JSON.stringify(res.data)).catch(() => {});
          }
        }
      } else if (selectedTab === 'DTR') {
        const res = await apiClient.get<any>(ENDPOINTS.EMPLOYEE_DTR, {
          params: { month: selectedMonth, year: selectedYear },
          signal: controller.signal,
        });
        if (isMounted.current && !controller.signal.aborted) {
          setDtrData(res.data || null);
          if (res.data) AsyncStorage.setItem(cacheKey, JSON.stringify(res.data)).catch(() => {});
        }
      } else if (selectedTab === 'SF1' && selectedSectionId && canSeeClassReports) {
        const encodedId = encodeURIComponent(String(selectedSectionId));
        const res = await apiClient.get(`${ENDPOINTS.REPORT_SF1}${encodedId}/`, {
          signal: controller.signal,
        });
        if (isMounted.current && !controller.signal.aborted) {
          setSf1Data(res.data || null);
          if (res.data) AsyncStorage.setItem(cacheKey, JSON.stringify(res.data)).catch(() => {});
        }
      } else if (selectedTab === 'SF2' && selectedSectionId && canSeeClassReports) {
        const encodedId = encodeURIComponent(String(selectedSectionId));
        const res = await apiClient.get(`${ENDPOINTS.REPORT_SF2}${encodedId}/`, {
          params: { month: monthName, year: selectedYear },
          signal: controller.signal,
        });
        if (isMounted.current && !controller.signal.aborted) {
          setSf2Data(res.data || null);
          if (res.data) AsyncStorage.setItem(cacheKey, JSON.stringify(res.data)).catch(() => {});
        }
      } else if (selectedTab === 'SF4' && isAdmin) {
        const res = await apiClient.get(ENDPOINTS.REPORT_SF4, {
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
  }, [
    selectedTab,
    selectedMonth,
    selectedYear,
    selectedSectionId,
    isAdmin,
    canSeeClassReports,
    packScope,
    pickedSectionIds,
    pickedTeacherIds,
    buildPrintPackBody,
  ]);

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
      const teacherId = dtrData.teacher_id || currentUser?.teacher_profile?.id || currentUser?.id;
      const encodedTeacherId = encodeURIComponent(String(teacherId));
      const payload = {
        action: 'SUBMIT_DTR',
        teacher_id: teacherId,
        month: dtrData.month_number || selectedMonth,
        year: dtrData.year || selectedYear,
        regular_days_hours:
          dtrData.regular_days_hours || '8:00 AM - 12:00 PM / 1:00 PM - 5:00 PM',
        saturdays_hours: dtrData.saturdays_hours || 'As Required',
      };

      await apiClient
        .post(`${ENDPOINTS.EMPLOYEE_DTR}${encodedTeacherId}/`, payload)
        .catch((err: any) => {
          const status = err?.response?.status;
          if (status === 404 || status === 405) {
            return apiClient.post(ENDPOINTS.EMPLOYEE_DTR, payload);
          }
          throw err;
        });

      if (!isMounted.current) return;
      showNotice('Submitted', 'Your Daily Time Record has been sent to your Department Head.');
      await loadReportData();
    } catch (err: unknown) {
      if (!isMounted.current) return;
      showNotice('Error', getFriendlyErrorMessage(err, 'Could not submit your Daily Time Record.'));
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
      const res = await apiClient.post(ENDPOINTS.REPORT_EXPORT, payload);
      return res.data;
    } catch (postErr: any) {
      if (postErr?.response?.status === 405) {
        const res = await apiClient.get(ENDPOINTS.REPORT_EXPORT, { params: payload });
        return res.data;
      }
      throw postErr;
    }
  };

  const buildNativeShareSummary = (tabKey: 'SCHEDULE' | 'CLASS_LIST'): string => {
    if (tabKey === 'SCHEDULE') {
      const blocks = Array.isArray(scheduleData?.teacher_schedules)
        ? scheduleData.teacher_schedules
        : [];
      const lines: string[] = [
        `AttendSure Official Class Schedule (${scheduleData?.school?.school_name || 'School'})`,
        `School Year: ${scheduleData?.school?.school_year || 'Current'}`,
        '',
      ];
      blocks.forEach((ts: any) => {
        lines.push(`${ts.teacher_name} (${ts.employee_id}) — ${ts.total_weekly_hours} hrs/wk`);
        (ts.periods || []).forEach((p: any) => {
          lines.push(`• ${p.time_range} (${p.day_label}) | ${p.subject_code} | ${p.section_label} | ${p.room_name}`);
        });
        lines.push('');
      });
      return lines.join('\n');
    }

    const lists = Array.isArray(classListData?.class_lists) ? classListData.class_lists : [];
    const lines: string[] = [
      `AttendSure Official Class Lists (${classListData?.school?.school_name || 'School'})`,
      '',
    ];
    lists.forEach((cl: any) => {
      lines.push(`${cl.section_label} — Adviser: ${cl.adviser_name} (${cl.total_count} students)`);
      (cl.students || []).forEach((st: any, idx: number) => {
        lines.push(`${idx + 1}. ${st.full_name} (LRN: ${st.lrn}) [${st.sex}]`);
      });
      lines.push('');
    });
    return lines.join('\n');
  };

  const handlePrint = async () => {
    if ((selectedTab === 'SF1' || selectedTab === 'SF2') && !selectedSectionId) {
      showNotice('Required', 'Please select a class section first.');
      return;
    }
    if (
      (selectedTab === 'SCHEDULE' || selectedTab === 'CLASS_LIST') &&
      packScope === 'SELECTED' &&
      pickedSectionIds.length === 0 &&
      (!isAdmin || pickedTeacherIds.length === 0)
    ) {
      showNotice('Selection Needed', 'Select at least one section or teacher, or switch to All.');
      return;
    }

    setPrintingDoc(true);
    try {
      if (selectedTab === 'SCHEDULE' || selectedTab === 'CLASS_LIST') {
        const res = await apiClient.post(
          ENDPOINTS.REPORT_PRINT_PACK,
          buildPrintPackBody(selectedTab, 'html', 'PRINT')
        );
        const html = typeof res.data === 'string' ? res.data : res.data?.html || '';
        const docTitle =
          (typeof res.data === 'object' && res.data?.title) || `AttendSure_${selectedTab}`;
        if (Platform.OS === 'web' && html) {
          triggerSafeBrowserPrint(applyMobilePageSetupToHtml(html, pageSetup));
        } else {
          await Share.share({
            title: docTitle,
            message: buildNativeShareSummary(selectedTab),
          });
        }
        return;
      }

      const data = await fetchReportExportPayload();
      const html = typeof data === 'string' ? data : data?.html || '';
      const monthName = FULL_MONTHS[selectedMonth - 1] || '';

      if (Platform.OS === 'web' && html) {
        triggerSafeBrowserPrint(applyMobilePageSetupToHtml(html, pageSetup));
      } else {
        await Share.share({
          title: `AttendSure_${selectedTab}_${monthName}_${selectedYear}`,
          message: `AttendSure ${selectedTab} Attendance Report (${monthName} ${selectedYear}). For printable PDF layout, open Reports on the AttendSure web portal.`,
        });
      }
    } catch (err: unknown) {
      if (!isMounted.current) return;
      showNotice('Notice', getFriendlyErrorMessage(err, 'Could not prepare this document for printing.'));
    } finally {
      if (isMounted.current) setPrintingDoc(false);
    }
  };

  const handleExportReport = async () => {
    if ((selectedTab === 'SF1' || selectedTab === 'SF2') && !selectedSectionId) {
      showNotice('Required', 'Please select a class section first.');
      return;
    }
    if (
      (selectedTab === 'SCHEDULE' || selectedTab === 'CLASS_LIST') &&
      packScope === 'SELECTED' &&
      pickedSectionIds.length === 0 &&
      (!isAdmin || pickedTeacherIds.length === 0)
    ) {
      showNotice('Selection Needed', 'Select at least one section or teacher, or switch to All.');
      return;
    }

    setExportingDoc(true);
    try {
      if (selectedTab === 'SCHEDULE' || selectedTab === 'CLASS_LIST') {
        const docTitle = `AttendSure_${selectedTab.toLowerCase()}_${packScope.toLowerCase()}`;
        if (Platform.OS === 'web') {
          const res = await apiClient.post(
            ENDPOINTS.REPORT_PRINT_PACK,
            buildPrintPackBody(selectedTab, 'csv', 'EXPORT'),
            { responseType: 'text' }
          );
          const csvText = typeof res.data === 'string' ? res.data : String(res.data || '');
          triggerSafeBrowserDownload(csvText, docTitle, 'text/csv;charset=utf-8', 'csv');
        } else {
          await Share.share({
            title: docTitle,
            message: buildNativeShareSummary(selectedTab),
          });
        }
        return;
      }

      const data = await fetchReportExportPayload();
      const html = typeof data === 'string' ? data : data?.html || '';
      const monthName = FULL_MONTHS[selectedMonth - 1] || '';
      const title =
        (typeof data === 'object' && data?.title) ||
        `AttendSure_${selectedTab}_${monthName}_${selectedYear}`;

      if (Platform.OS === 'web' && html) {
        triggerSafeBrowserDownload(applyMobilePageSetupToHtml(html, pageSetup), title);
      } else {
        await Share.share({
          title,
          message: `${title}\n\nAttendSure Official Attendance Report (${monthName} ${selectedYear}).`,
        });
      }
    } catch (err: unknown) {
      if (!isMounted.current) return;
      showNotice('Notice', getFriendlyErrorMessage(err, 'Could not export this report right now.'));
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
    <View style={{ flexDirection: 'row', gap: 6, flexWrap: 'wrap' }}>
      <TouchableOpacity
        style={styles.btnSec}
        onPress={() => setShowPageSetup(true)}
        activeOpacity={0.8}
      >
        <Ionicons name="options-outline" size={15} color={palette.primary} />
        <Text style={styles.btnSecText}>Page Setup</Text>
      </TouchableOpacity>

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

      <Modal
        visible={showPageSetup}
        transparent
        animationType="fade"
        onRequestClose={() => setShowPageSetup(false)}
      >
        <View style={styles.modalBackdrop}>
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>Page Setup</Text>
            <Text style={styles.modalSub}>
              Choose paper size, orientation, and margins so every downloaded or printed sheet fits cleanly with no cut or blank pages.
            </Text>

            <Text style={styles.modalLabel}>Paper Size</Text>
            <ChipRow<MobilePaperKey>
              wrap
              options={(Object.keys(MOBILE_PAPER_DIMS) as MobilePaperKey[]).map((key) => ({
                key,
                label: MOBILE_PAPER_DIMS[key].label,
              }))}
              selected={pageSetup.paperSize}
              onSelect={(paperSize) => setPageSetup((p) => ({ ...p, paperSize }))}
            />

            <Text style={styles.modalLabel}>Orientation</Text>
            <ChipRow<MobileOrientation>
              wrap
              options={[
                { key: 'portrait', label: 'Portrait' },
                { key: 'landscape', label: 'Landscape' },
              ]}
              selected={pageSetup.orientation}
              onSelect={(orientation) => setPageSetup((p) => ({ ...p, orientation }))}
            />

            <Text style={styles.modalLabel}>Page Margins</Text>
            <ChipRow<MobileMarginPreset>
              wrap
              options={(Object.keys(MOBILE_MARGIN_INCHES) as MobileMarginPreset[]).map((mKey) => ({
                key: mKey,
                label: MOBILE_MARGIN_INCHES[mKey].label,
              }))}
              selected={pageSetup.marginPreset}
              onSelect={(marginPreset) => setPageSetup((p) => ({ ...p, marginPreset }))}
            />

            <TouchableOpacity
              style={[styles.btnPri, { width: '100%', paddingVertical: 11, marginTop: 12 }]}
              onPress={() => setShowPageSetup(false)}
            >
              <Text style={styles.btnPriText}>Apply Page Setup</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
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
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        style={styles.tabScrollWrap}
        contentContainerStyle={styles.tabRow}
      >
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
      </ScrollView>

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
        {/* All vs Selected Only Controls for Schedules & Class Lists */}
        {(selectedTab === 'SCHEDULE' || selectedTab === 'CLASS_LIST') && (
          <View style={styles.card}>
            <Text style={styles.sectionHeaderTitle}>EXPORT &amp; PRINT SCOPE</Text>
            <View style={{ flexDirection: 'row', gap: 8, marginBottom: packScope === 'SELECTED' ? 10 : 0 }}>
              <TouchableOpacity
                style={[styles.secPill, { flex: 1, justifyContent: 'center', marginRight: 0 }, packScope === 'ALL' && styles.secPillActive]}
                onPress={() => setPackScope('ALL')}
              >
                <Text style={[styles.secPillText, packScope === 'ALL' && styles.secPillTextActive]}>
                  {isAdmin ? 'All School Records' : 'All My Classes'}
                </Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.secPill, { flex: 1, justifyContent: 'center', marginRight: 0 }, packScope === 'SELECTED' && styles.secPillActive]}
                onPress={() => setPackScope('SELECTED')}
              >
                <Text style={[styles.secPillText, packScope === 'SELECTED' && styles.secPillTextActive]}>
                  Selected Only ({pickedSectionIds.length + (isAdmin ? pickedTeacherIds.length : 0)})
                </Text>
              </TouchableOpacity>
            </View>

            {packScope === 'SELECTED' && (
              <View style={{ gap: 8 }}>
                {sections.length > 0 && (
                  <View>
                    <Text style={[styles.loadingText, { textAlign: 'left', marginBottom: 6 }]}>
                      Tap Class Sections to Include:
                    </Text>
                    <ScrollView horizontal showsHorizontalScrollIndicator={false}>
                      {sections.map((sec) => {
                        const checked = pickedSectionIds.includes(sec.section_id);
                        return (
                          <TouchableOpacity
                            key={`pick-sec-${sec.section_id}`}
                            style={[styles.secPill, checked && styles.secPillActive]}
                            onPress={() =>
                              setPickedSectionIds((prev) =>
                                prev.includes(sec.section_id)
                                  ? prev.filter((id) => id !== sec.section_id)
                                  : [...prev, sec.section_id]
                              )
                            }
                          >
                            <Ionicons
                              name={checked ? 'checkbox' : 'square-outline'}
                              size={13}
                              color={checked ? palette.onPrimary : palette.primary}
                            />
                            <Text style={[styles.secPillText, checked && styles.secPillTextActive]}>
                              {sec.section_name}
                            </Text>
                          </TouchableOpacity>
                        );
                      })}
                    </ScrollView>
                  </View>
                )}

                {isAdmin && teachersList.length > 0 && selectedTab === 'SCHEDULE' && (
                  <View>
                    <Text style={[styles.loadingText, { textAlign: 'left', marginBottom: 6 }]}>
                      Or Tap Teachers to Include:
                    </Text>
                    <ScrollView horizontal showsHorizontalScrollIndicator={false}>
                      {teachersList.map((t) => {
                        const checked = pickedTeacherIds.includes(t.id);
                        return (
                          <TouchableOpacity
                            key={`pick-t-${t.id}`}
                            style={[styles.secPill, checked && styles.secPillActive]}
                            onPress={() =>
                              setPickedTeacherIds((prev) =>
                                prev.includes(t.id)
                                  ? prev.filter((id) => id !== t.id)
                                  : [...prev, t.id]
                              )
                            }
                          >
                            <Ionicons
                              name={checked ? 'checkbox' : 'square-outline'}
                              size={13}
                              color={checked ? palette.onPrimary : palette.primary}
                            />
                            <Text style={[styles.secPillText, checked && styles.secPillTextActive]}>
                              {t.full_name}
                            </Text>
                          </TouchableOpacity>
                        );
                      })}
                    </ScrollView>
                  </View>
                )}
              </View>
            )}
          </View>
        )}

        {/* Month Selector for DTR, SF2, SF4 */}
        {(selectedTab === 'DTR' || selectedTab === 'SF2' || selectedTab === 'SF4') && (
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
              <ChipRow<number>
                options={sections.map((sec) => ({
                  key: sec.section_id,
                  label: sec.section_name,
                }))}
                selected={selectedSectionId ?? -1}
                onSelect={setSelectedSectionId}
              />
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
            <Text style={styles.loadingText}>Loading {selectedTab.replace('_', ' ')} records...</Text>
          </View>
        ) : selectedTab === 'SCHEDULE' ? (
          <View style={{ gap: 10 }}>
            {packScope === 'SELECTED' &&
            pickedSectionIds.length === 0 &&
            (!isAdmin || pickedTeacherIds.length === 0) ? (
              <View style={styles.card}>
                <Text style={styles.emptyText}>
                  Tap one or more class sections or teachers above, or switch to All.
                </Text>
              </View>
            ) : !scheduleData || !(scheduleData.teacher_schedules || []).length ? (
              <View style={styles.card}>
                <Text style={styles.emptyText}>No class schedules found for the selected filter.</Text>
              </View>
            ) : (
              (scheduleData.teacher_schedules as any[])
                .filter(
                  (ts) =>
                    !cleanSearch ||
                    String(ts.teacher_name || '').toLowerCase().includes(cleanSearch) ||
                    (ts.periods || []).some(
                      (p: any) =>
                        String(p.subject_title || '').toLowerCase().includes(cleanSearch) ||
                        String(p.section_label || '').toLowerCase().includes(cleanSearch)
                    )
                )
                .map((ts: any) => (
                  <View key={`sched-t-${ts.teacher_id}`} style={styles.card}>
                    <Text style={styles.sectionHeaderTitle}>
                      {ts.teacher_name} ({ts.employee_id}) • {ts.total_weekly_hours} hrs/wk
                    </Text>
                    {Array.isArray(ts.advisory_sections) && ts.advisory_sections.length > 0 && (
                      <Text style={[styles.loadingText, { textAlign: 'left', marginBottom: 8 }]}>
                        Class Adviser: {ts.advisory_sections.join(', ')}
                      </Text>
                    )}
                    {(ts.periods || []).length === 0 ? (
                      <Text style={styles.emptyText}>No active subject periods assigned.</Text>
                    ) : (
                      (ts.periods || []).map((p: any) => (
                        <View
                          key={`per-${p.id}`}
                          style={{
                            paddingVertical: 8,
                            borderTopWidth: 1,
                            borderTopColor: palette.border,
                            gap: 2,
                          }}
                        >
                          <Text style={{ fontSize: fonts.sm, fontWeight: fonts.weight.bold, color: palette.textPrimary }}>
                            {p.subject_code} — {p.subject_title}
                          </Text>
                          <Text style={{ fontSize: fonts.xs, color: palette.textSecondary }}>
                            {p.section_label} • {p.room_name}
                          </Text>
                          <Text style={{ fontSize: fonts.xs, color: palette.primary, fontWeight: fonts.weight.semibold }}>
                            {p.time_range} ({p.day_label})
                          </Text>
                        </View>
                      ))
                    )}
                  </View>
                ))
            )}
          </View>
        ) : selectedTab === 'CLASS_LIST' ? (
          <View style={{ gap: 10 }}>
            {packScope === 'SELECTED' && pickedSectionIds.length === 0 ? (
              <View style={styles.card}>
                <Text style={styles.emptyText}>
                  Tap one or more class sections above, or switch to All.
                </Text>
              </View>
            ) : !classListData || !(classListData.class_lists || []).length ? (
              <View style={styles.card}>
                <Text style={styles.emptyText}>No class lists found for the selected filter.</Text>
              </View>
            ) : (
              (classListData.class_lists as any[]).map((cl: any) => {
                const matchingStudents = (cl.students || []).filter(
                  (st: any) =>
                    !cleanSearch ||
                    String(st.full_name || '').toLowerCase().includes(cleanSearch) ||
                    String(st.lrn || '').toLowerCase().includes(cleanSearch)
                );
                return (
                  <View key={`cl-${cl.section_id}`} style={styles.card}>
                    <Text style={styles.sectionHeaderTitle}>
                      {cl.section_label} ({cl.total_count} Students)
                    </Text>
                    <Text style={[styles.loadingText, { textAlign: 'left', marginBottom: 8 }]}>
                      Adviser: {cl.adviser_name} • Room: {cl.room_name} • Male: {cl.male_count} / Female: {cl.female_count}
                    </Text>
                    {matchingStudents.length === 0 ? (
                      <Text style={styles.emptyText}>No students match your search.</Text>
                    ) : (
                      matchingStudents.map((st: any) => (
                        <View
                          key={`st-${cl.section_id}-${st.student_id}`}
                          style={{
                            flexDirection: 'row',
                            justifyContent: 'space-between',
                            alignItems: 'center',
                            paddingVertical: 7,
                            borderTopWidth: 1,
                            borderTopColor: palette.border,
                            gap: 8,
                          }}
                        >
                          <View style={{ flex: 1 }}>
                            <Text style={{ fontSize: fonts.sm, fontWeight: fonts.weight.bold, color: palette.textPrimary }}>
                              {st.full_name}
                            </Text>
                            <Text style={{ fontSize: fonts.xs, color: palette.textSecondary }}>
                              LRN: {st.lrn} • {st.sex}
                            </Text>
                          </View>
                          <Text style={{ fontSize: fonts.xs, fontWeight: fonts.weight.bold, color: palette.primary }}>
                            {st.today_status}
                          </Text>
                        </View>
                      ))
                    )}
                  </View>
                );
              })
            )}
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
    tabScrollWrap: {
      flexGrow: 0,
      backgroundColor: palette.surface,
      borderBottomWidth: 1,
      borderBottomColor: palette.border,
    },
    tabRow: {
      flexDirection: 'row',
      paddingHorizontal: 14,
      paddingVertical: 8,
      gap: 6,
    },
    tabBtn: {
      flexDirection: 'row',
      justifyContent: 'center',
      paddingVertical: 8,
      paddingHorizontal: 12,
      borderRadius: 8,
      backgroundColor: palette.surfaceSubtle,
      borderWidth: 1,
      borderColor: palette.border,
      alignItems: 'center',
      gap: 5,
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
    modalBackdrop: {
      flex: 1,
      backgroundColor: 'rgba(15, 23, 42, 0.65)',
      justifyContent: 'center',
      alignItems: 'center',
      padding: 18,
    },
    modalCard: {
      width: '100%',
      maxWidth: 420,
      backgroundColor: palette.surface,
      borderRadius: 16,
      padding: 18,
      borderWidth: 1,
      borderColor: palette.borderStrong,
    },
    modalTitle: { fontSize: fonts.lg, fontWeight: fonts.weight.extrabold, color: palette.textPrimary },
    modalSub: { fontSize: fonts.xs, color: palette.textSecondary, marginTop: 4, marginBottom: 10 },
    modalLabel: {
      fontSize: fonts.xs,
      fontWeight: fonts.weight.extrabold,
      color: palette.primary,
      marginTop: 10,
      marginBottom: 6,
      textTransform: 'uppercase',
    },
    chipGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
    setupChip: {
      paddingVertical: 7,
      paddingHorizontal: 10,
      borderRadius: 8,
      backgroundColor: palette.surfaceSubtle,
      borderWidth: 1,
      borderColor: palette.border,
    },
    setupChipActive: { backgroundColor: palette.buttonBg, borderColor: palette.buttonBg },
    setupChipText: { fontSize: fonts.xs, fontWeight: fonts.weight.bold, color: palette.textPrimary },
    setupChipTextActive: { color: palette.onPrimary },
  });

export default ReportsScreen;
