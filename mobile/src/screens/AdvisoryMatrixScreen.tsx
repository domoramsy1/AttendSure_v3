// AttendSure Mobile - Advisory Matrix Screen
// File: D:\AttendSure_V3\mobile\src\screens\AdvisoryMatrixScreen.tsx

/**
 * AttendSure Mobile - Class List & Attendance Monitor
 * File: mobile/src/screens/AdvisoryMatrixScreen.tsx
 */

import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import {
  View,
  Text,
  FlatList,
  TouchableOpacity,
  TextInput,
  ActivityIndicator,
  RefreshControl,
  DeviceEventEmitter,
  Platform,
  Share,
  Alert,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Image } from 'expo-image';
import { Ionicons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { apiClient } from '../api/client';
import { ENDPOINTS } from '../api/endpoints';
import { useThemeMode } from '../context/ThemeContext';
import { getServerBaseUrl } from '../services/configService';
import {
  cleanText,
  getFriendlyErrorMessage,
} from '../constants/theme';
import { confirmAction, getInitials, isCanceledError, resolveMediaUrl, showNotice } from '../utils/helpers';
import ChipRow from '../components/common/ChipRow';

const CLASS_LIST_CACHE_KEY = 'attendsure_cached_advisory_class_list_v2';

interface AvailableSectionOption {
  id: number;
  name: string;
  grade_level?: string;
  is_adviser?: boolean;
}

interface SchedulePeriodOption {
  schedule_id: number;
  subject_code: string;
  subject_name?: string;
  teacher_name?: string;
  time_window?: string;
}

interface SubjectStatus {
  schedule_id: number;
  subject_code: string;
  status: 'PRESENT' | 'LATE' | 'EXCUSED' | 'ABSENT' | 'CUTTING' | 'UNVERIFIED' | 'UNSCANNED';
  time: string;
}

interface AdviseeRow {
  number: number;
  student_id: number;
  student_name: string;
  lrn: string;
  photo_url?: string | null;
  campus_status?: string;
  presence_state?: 'IN' | 'OUT' | 'NONE';
  attended_count: number;
  cutting_count: number;
  total_subjects: number;
  compliance_rate: number;
  subjects: SubjectStatus[];
}

interface CachedClassListPayload {
  date?: string;
  has_advisory_class: boolean;
  section_id?: number | null;
  section_name: string;
  grade_level: string;
  available_sections?: AvailableSectionOption[];
  schedules?: SchedulePeriodOption[];
  matrix: AdviseeRow[];
}

const formatIsoDateOffset = (daysDelta: number): string => {
  const dt = new Date();
  dt.setDate(dt.getDate() + daysDelta);
  const y = dt.getFullYear();
  const m = String(dt.getMonth() + 1).padStart(2, '0');
  const d = String(dt.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
};

const triggerSafeWebPrint = (rawHtml: string): void => {
  if (typeof document === 'undefined' || typeof Blob === 'undefined' || typeof URL === 'undefined') {
    return;
  }
  const safeHtml = String(rawHtml || '')
    .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '')
    .replace(/\son[a-z]+\s*=\s*("[^"]*"|'[^']*'|[^\s>]+)/gi, '')
    .replace(/javascript:/gi, '');
  const blob = new Blob([safeHtml], { type: 'text/html;charset=utf-8' });
  const blobUrl = URL.createObjectURL(blob);
  const iframe = document.createElement('iframe');
  iframe.setAttribute('sandbox', 'allow-modals allow-same-origin');
  iframe.style.position = 'fixed';
  iframe.style.top = '-10000px';
  iframe.style.left = '-10000px';
  iframe.style.width = '1200px';
  iframe.style.height = '900px';
  iframe.style.border = '0';
  iframe.onload = () => {
    try {
      iframe.contentWindow?.focus();
      iframe.contentWindow?.print();
    } finally {
      setTimeout(() => {
        URL.revokeObjectURL(blobUrl);
        if (iframe.parentNode) iframe.parentNode.removeChild(iframe);
      }, 1500);
    }
  };
  iframe.src = blobUrl;
  document.body.appendChild(iframe);
};

export const AdvisoryMatrixScreen: React.FC = () => {
  const { palette, ui, fonts } = useThemeMode();
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [filterMode, setFilterMode] = useState<'ALL' | 'CUTTING'>('ALL');
  const [dateMode, setDateMode] = useState<'TODAY' | 'PREVIOUS'>('TODAY');
  const [selectedSectionId, setSelectedSectionId] = useState<number | null>(null);
  const [availableSections, setAvailableSections] = useState<AvailableSectionOption[]>([]);
  const [schedules, setSchedules] = useState<SchedulePeriodOption[]>([]);
  const [selectedPeriodId, setSelectedPeriodId] = useState<number | null>(null);
  const [markingAbsent, setMarkingAbsent] = useState(false);
  const [hasAdvisoryClass, setHasAdvisoryClass] = useState(false);
  const [sectionName, setSectionName] = useState('');
  const [gradeLevel, setGradeLevel] = useState('');
  const [activeDateStr, setActiveDateStr] = useState<string>(() => formatIsoDateOffset(0));
  const [matrix, setMatrix] = useState<AdviseeRow[]>([]);
  const [serverBase, setServerBase] = useState('');
  const [selectedStudentIds, setSelectedStudentIds] = useState<number[]>([]);
  const [exportingPack, setExportingPack] = useState<'CLASS_LIST' | 'CLASS_SCHEDULE' | null>(null);

  const isMountedRef = useRef(true);
  const abortRef = useRef<AbortController | null>(null);

  const targetDateStr = useMemo(
    () => formatIsoDateOffset(dateMode === 'PREVIOUS' ? -1 : 0),
    [dateMode]
  );

  const fetchClassListData = useCallback(
    async (
      fromCacheFirst = false,
      sectionOverride?: number | null,
      dateOverride?: string
    ) => {
      abortRef.current?.abort();
      const controller = new AbortController();
      abortRef.current = controller;

      const reqSectionId = sectionOverride !== undefined ? sectionOverride : selectedSectionId;
      const reqDate = dateOverride || targetDateStr;

      if (fromCacheFirst && !reqSectionId && dateMode === 'TODAY') {
        try {
          const [cachedStr, base] = await Promise.all([
            AsyncStorage.getItem(CLASS_LIST_CACHE_KEY),
            getServerBaseUrl(),
          ]);
          if (isMountedRef.current && !controller.signal.aborted) {
            if (base) setServerBase(base);
            if (cachedStr) {
              const parsed: CachedClassListPayload = JSON.parse(cachedStr);
              setHasAdvisoryClass(Boolean(parsed.has_advisory_class));
              setSectionName(parsed.section_name || '');
              setGradeLevel(parsed.grade_level || '');
              if (parsed.section_id) setSelectedSectionId(parsed.section_id);
              if (Array.isArray(parsed.available_sections)) {
                setAvailableSections(parsed.available_sections);
              }
              if (Array.isArray(parsed.schedules)) {
                setSchedules(parsed.schedules);
              }
              setMatrix(Array.isArray(parsed.matrix) ? parsed.matrix : []);
            }
          }
        } catch {}
      }

      try {
        const params: Record<string, string | number> = { date: reqDate };
        if (reqSectionId) params.section_id = reqSectionId;
        const res = await apiClient.get<CachedClassListPayload>(ENDPOINTS.ADVISER_MATRIX, {
          params,
          signal: controller.signal,
        });
        if (!isMountedRef.current || controller.signal.aborted) return;

        setErrorMsg(null);
        const avail = Array.isArray(res.data?.available_sections) ? res.data.available_sections : [];
        const scheds = Array.isArray(res.data?.schedules) ? res.data.schedules : [];
        setAvailableSections(avail);
        setSchedules(scheds);
        if (res.data?.date) setActiveDateStr(res.data.date);
        if (scheds.length > 0) {
          setSelectedPeriodId((prev) =>
            prev && scheds.some((s) => s.schedule_id === prev) ? prev : scheds[0].schedule_id
          );
        } else {
          setSelectedPeriodId(null);
        }

        if (res.data?.has_advisory_class) {
          const resolvedSectionId = res.data.section_id ?? reqSectionId ?? avail[0]?.id ?? null;
          const payload: CachedClassListPayload = {
            date: res.data.date || reqDate,
            has_advisory_class: true,
            section_id: resolvedSectionId,
            section_name: res.data.section_name || '',
            grade_level: res.data.grade_level || '',
            available_sections: avail,
            schedules: scheds,
            matrix: Array.isArray(res.data.matrix) ? res.data.matrix : [],
          };
          setHasAdvisoryClass(true);
          if (resolvedSectionId) setSelectedSectionId(resolvedSectionId);
          setSectionName(payload.section_name);
          setGradeLevel(payload.grade_level);
          setMatrix(payload.matrix);
          if (dateMode === 'TODAY') {
            AsyncStorage.setItem(CLASS_LIST_CACHE_KEY, JSON.stringify(payload)).catch(() => {});
          }
        } else {
          setHasAdvisoryClass(false);
          setMatrix([]);
        }
      } catch (err: unknown) {
        if (!isMountedRef.current || isCanceledError(err)) return;
        setErrorMsg(getFriendlyErrorMessage(err, 'Could not load your class list right now.'));
      } finally {
        if (isMountedRef.current) {
          setLoading(false);
          setRefreshing(false);
        }
      }
    },
    [selectedSectionId, targetDateStr, dateMode]
  );

  const handleMarkUnscannedAbsent = () => {
    const activeSection = selectedSectionId || availableSections[0]?.id || null;
    if (!activeSection) {
      showNotice('No Section Selected', 'Select a class section before marking unscanned students absent.');
      return;
    }
    const chosenPeriod = schedules.find((s) => s.schedule_id === selectedPeriodId) || schedules[0];
    const targetLabel = chosenPeriod
      ? `${chosenPeriod.subject_code} (${activeDateStr})`
      : `${[gradeLevel, sectionName].filter(Boolean).join(' - ')} (${activeDateStr})`;

    confirmAction(
      'Mark Unscanned Absent',
      `Mark all unscanned students in ${targetLabel} as Absent? Students with an approved Exit Pass will be marked Excused automatically.`,
      'Mark Absent',
      async () => {
        setMarkingAbsent(true);
        try {
          const body: Record<string, string | number> = {
            section_id: activeSection,
            attendance_date: activeDateStr || targetDateStr,
          };
          if (chosenPeriod?.schedule_id) {
            body.schedule_id = chosenPeriod.schedule_id;
          }
          const res = await apiClient.post(ENDPOINTS.ATTENDANCE_MARK_UNSCANNED_ABSENT, body);
          const data = res.data || {};
          const summary =
            data.message ||
            `Marked ${Number(data.marked_absent_count ?? 0)} absent and ${Number(data.marked_excused_count ?? 0)} excused.`;
          showNotice('Attendance Updated', summary);
          DeviceEventEmitter.emit('attendsure:attendance-updated');
          await fetchClassListData(false, activeSection, activeDateStr || targetDateStr);
        } catch (err: unknown) {
          showNotice(
            'Could Not Update',
            getFriendlyErrorMessage(err, 'Could not mark unscanned students absent right now.')
          );
        } finally {
          if (isMountedRef.current) setMarkingAbsent(false);
        }
      },
      false
    );
  };

  useEffect(() => {
    isMountedRef.current = true;
    void fetchClassListData(true);
    const sub = DeviceEventEmitter.addListener('attendsure:attendance-updated', () => {
      if (isMountedRef.current) {
        void fetchClassListData(false);
      }
    });
    return () => {
      isMountedRef.current = false;
      abortRef.current?.abort();
      sub.remove();
    };
  }, [fetchClassListData]);

  const cleanSearch = cleanText(search, 80).toLowerCase();

  const filteredMatrix = useMemo(() => {
    return matrix.filter((row) => {
      const matchSearch =
        !cleanSearch ||
        String(row.student_name || '').toLowerCase().includes(cleanSearch) ||
        String(row.lrn || '').toLowerCase().includes(cleanSearch);
      if (!matchSearch) return false;
      return filterMode === 'CUTTING' ? row.cutting_count > 0 : true;
    });
  }, [matrix, cleanSearch, filterMode]);

  const cuttingTotal = useMemo(
    () => matrix.filter((m) => m.cutting_count > 0).length,
    [matrix]
  );

  const toggleStudentPick = (studentId: number) => {
    setSelectedStudentIds((prev) =>
      prev.includes(studentId) ? prev.filter((id) => id !== studentId) : [...prev, studentId]
    );
  };

  const handleExportAdvisoryPack = async (packType: 'CLASS_LIST' | 'CLASS_SCHEDULE') => {
    setExportingPack(packType);
    try {
      const useSelected = packType === 'CLASS_LIST' && selectedStudentIds.length > 0;
      const body: Record<string, unknown> = {
        pack_type: packType,
        scope: useSelected ? 'SELECTED' : 'ALL',
        export_format: Platform.OS === 'web' ? 'html' : 'json',
        wrap_json: Platform.OS === 'web',
        action_mode: Platform.OS === 'web' ? 'PRINT' : 'EXPORT',
      };
      if (useSelected) {
        body.student_ids = selectedStudentIds;
      }

      const res = await apiClient.post(ENDPOINTS.REPORT_PRINT_PACK, body);
      if (Platform.OS === 'web') {
        const html = typeof res.data === 'string' ? res.data : res.data?.html || '';
        if (html) triggerSafeWebPrint(html);
      } else if (packType === 'CLASS_LIST') {
        const lists = Array.isArray(res.data?.class_lists) ? res.data.class_lists : [];
        const lines: string[] = [
          `AttendSure Class List — ${[gradeLevel, sectionName].filter(Boolean).join(' - ')}`,
          '',
        ];
        lists.forEach((cl: any) => {
          (cl.students || []).forEach((st: any, idx: number) => {
            lines.push(`${idx + 1}. ${st.full_name} (LRN: ${st.lrn}) [${st.today_status}]`);
          });
        });
        await Share.share({
          title: `Class_List_${sectionName || 'Advisory'}`,
          message: lines.join('\n'),
        });
      } else {
        const periods = Array.isArray(res.data?.periods) ? res.data.periods : [];
        const lines: string[] = [
          `AttendSure Teaching Schedule — ${res.data?.generated_by || ''}`,
          '',
          ...periods.map(
            (p: any) => `• ${p.time_range} (${p.day_label}) | ${p.subject_code} | ${p.section_label} | ${p.room_name}`
          ),
        ];
        await Share.share({
          title: 'My_Class_Schedule',
          message: lines.join('\n'),
        });
      }
    } catch (err: unknown) {
      const msg = getFriendlyErrorMessage(err, 'Could not prepare this document right now.');
      if (Platform.OS === 'web' && typeof window !== 'undefined') {
        setErrorMsg(msg);
      } else {
        Alert.alert('Export Error', msg);
      }
    } finally {
      if (isMountedRef.current) setExportingPack(null);
    }
  };

  if (loading && matrix.length === 0) {
    return (
      <View style={[ui.screen, ui.centerBox]}>
        <ActivityIndicator size="small" color={palette.primary} />
        <Text style={[ui.subtitle, { marginTop: 8 }]}>Loading class list...</Text>
      </View>
    );
  }

  if (!hasAdvisoryClass) {
    return (
      <SafeAreaView style={[ui.screen, ui.centerBox]} edges={['top']}>
        <Ionicons name="information-circle-outline" size={44} color={palette.textMuted} />
        <Text style={[ui.title, { marginTop: 8 }]}>No Assigned Advisory Class</Text>
        <Text style={[ui.subtitle, { textAlign: 'center', marginTop: 4 }]}>
          {errorMsg || 'Your teacher account is not assigned as a Class Adviser yet.'}
        </Text>
        <TouchableOpacity
          style={[ui.buttonPrimary, { marginTop: 16, paddingHorizontal: 20 }]}
          onPress={() => {
            setLoading(true);
            void fetchClassListData(false);
          }}
        >
          <Ionicons name="refresh-outline" size={16} color={palette.onPrimary} />
          <Text style={ui.buttonPrimaryText}>Refresh</Text>
        </TouchableOpacity>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={ui.screen} edges={['top']}>
      {/* Header */}
      <View
        style={{
          padding: 14,
          backgroundColor: palette.surface,
          borderBottomWidth: 1,
          borderBottomColor: palette.border,
        }}
      >
        <View style={[ui.rowBetween, { gap: 8 }]}>
          <View style={{ flex: 1 }}>
            <Text style={ui.title}>Class List</Text>
            <Text style={ui.subtitle}>
              {[gradeLevel, sectionName].filter(Boolean).join(' - ')} • {matrix.length} Students
            </Text>
          </View>
          <View style={{ flexDirection: 'row', gap: 6 }}>
            <TouchableOpacity
              onPress={() => void handleExportAdvisoryPack('CLASS_SCHEDULE')}
              disabled={exportingPack !== null}
              style={[
                ui.badge,
                {
                  backgroundColor: palette.primarySoft,
                  borderWidth: 1,
                  borderColor: palette.border,
                  paddingVertical: 7,
                  paddingHorizontal: 10,
                  flexDirection: 'row',
                  alignItems: 'center',
                  gap: 4,
                },
              ]}
            >
              {exportingPack === 'CLASS_SCHEDULE' ? (
                <ActivityIndicator size="small" color={palette.primary} />
              ) : (
                <>
                  <Ionicons name="calendar-outline" size={13} color={palette.primary} />
                  <Text style={{ fontSize: fonts.size.xs, fontWeight: fonts.weight.bold, color: palette.primary }}>
                    Schedule
                  </Text>
                </>
              )}
            </TouchableOpacity>

            <TouchableOpacity
              onPress={() => void handleExportAdvisoryPack('CLASS_LIST')}
              disabled={exportingPack !== null}
              style={[
                ui.badge,
                {
                  backgroundColor: palette.buttonBg,
                  paddingVertical: 7,
                  paddingHorizontal: 10,
                  flexDirection: 'row',
                  alignItems: 'center',
                  gap: 4,
                },
              ]}
            >
              {exportingPack === 'CLASS_LIST' ? (
                <ActivityIndicator size="small" color={palette.onPrimary} />
              ) : (
                <>
                  <Ionicons name="print-outline" size={13} color={palette.onPrimary} />
                  <Text style={{ fontSize: fonts.size.xs, fontWeight: fonts.weight.bold, color: palette.onPrimary }}>
                    {selectedStudentIds.length > 0 ? `Export (${selectedStudentIds.length})` : 'Print / Share'}
                  </Text>
                </>
              )}
            </TouchableOpacity>
          </View>
        </View>

        {/* Section Switcher (visible when leader or teacher handles multiple sections) */}
        {availableSections.length > 1 && (
          <View style={{ marginTop: 8 }}>
            <ChipRow<string>
              options={availableSections.map((sec) => ({
                key: String(sec.id),
                label: sec.grade_level ? `${sec.grade_level} - ${sec.name}` : sec.name,
              }))}
              selected={String(selectedSectionId ?? availableSections[0]?.id ?? '')}
              onSelect={(val) => {
                const nextId = Number(val);
                if (Number.isFinite(nextId) && nextId > 0) {
                  setSelectedSectionId(nextId);
                  setSelectedStudentIds([]);
                  void fetchClassListData(false, nextId, targetDateStr);
                }
              }}
            />
          </View>
        )}

        {/* Date Toggle & Mark Unscanned Absent Row */}
        <View style={[ui.rowBetween, { marginTop: 8, gap: 8, flexWrap: 'wrap' }]}>
          <View style={{ flexDirection: 'row', gap: 6 }}>
            <TouchableOpacity
              onPress={() => setDateMode('TODAY')}
              style={[
                ui.badge,
                {
                  backgroundColor:
                    dateMode === 'TODAY' ? palette.primarySoft : palette.surfaceSubtle,
                  borderWidth: 1,
                  borderColor: dateMode === 'TODAY' ? palette.primary : palette.border,
                  paddingVertical: 5,
                  paddingHorizontal: 10,
                },
              ]}
            >
              <Text
                style={{
                  fontSize: fonts.size.xs,
                  fontWeight: fonts.weight.bold,
                  color: dateMode === 'TODAY' ? palette.primary : palette.textSecondary,
                }}
              >
                Today
              </Text>
            </TouchableOpacity>
            <TouchableOpacity
              onPress={() => setDateMode('PREVIOUS')}
              style={[
                ui.badge,
                {
                  backgroundColor:
                    dateMode === 'PREVIOUS' ? palette.primarySoft : palette.surfaceSubtle,
                  borderWidth: 1,
                  borderColor: dateMode === 'PREVIOUS' ? palette.primary : palette.border,
                  paddingVertical: 5,
                  paddingHorizontal: 10,
                },
              ]}
            >
              <Text
                style={{
                  fontSize: fonts.size.xs,
                  fontWeight: fonts.weight.bold,
                  color: dateMode === 'PREVIOUS' ? palette.primary : palette.textSecondary,
                }}
              >
                Previous Day ({formatIsoDateOffset(-1)})
              </Text>
            </TouchableOpacity>
          </View>

          <TouchableOpacity
            onPress={handleMarkUnscannedAbsent}
            disabled={markingAbsent || matrix.length === 0}
            style={[
              ui.badge,
              {
                backgroundColor: palette.warningLight,
                borderWidth: 1,
                borderColor: palette.warning,
                paddingVertical: 5,
                paddingHorizontal: 10,
                flexDirection: 'row',
                alignItems: 'center',
                gap: 4,
                opacity: markingAbsent || matrix.length === 0 ? 0.6 : 1,
              },
            ]}
          >
            {markingAbsent ? (
              <ActivityIndicator size="small" color={palette.warning} />
            ) : (
              <>
                <Ionicons name="checkmark-done-outline" size={13} color={palette.warning} />
                <Text
                  style={{
                    fontSize: fonts.size.xs,
                    fontWeight: fonts.weight.extrabold,
                    color: palette.warning,
                  }}
                >
                  Mark Unscanned Absent
                </Text>
              </>
            )}
          </TouchableOpacity>
        </View>

        {schedules.length > 1 && (
          <View style={{ marginTop: 6 }}>
            <ChipRow<string>
              options={schedules.map((sc) => ({
                key: String(sc.schedule_id),
                label: sc.time_window ? `${sc.subject_code} (${sc.time_window})` : sc.subject_code,
              }))}
              selected={String(selectedPeriodId ?? schedules[0]?.schedule_id ?? '')}
              onSelect={(val) => {
                const pid = Number(val);
                if (Number.isFinite(pid)) setSelectedPeriodId(pid);
              }}
            />
          </View>
        )}

        <View style={[ui.rowCenter, { marginTop: 10, flexWrap: 'wrap' }]}>
          <TouchableOpacity
            onPress={() => setFilterMode('ALL')}
            style={[
              ui.badge,
              {
                backgroundColor:
                  filterMode === 'ALL' ? palette.buttonBg : palette.surfaceSubtle,
                borderWidth: 1,
                borderColor: filterMode === 'ALL' ? palette.buttonBg : palette.border,
                paddingVertical: 6,
                paddingHorizontal: 12,
              },
            ]}
          >
            <Text
              style={{
                fontSize: fonts.size.xs,
                fontWeight: fonts.weight.bold,
                color: filterMode === 'ALL' ? palette.onPrimary : palette.textSecondary,
              }}
            >
              All ({matrix.length})
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            onPress={() => setFilterMode('CUTTING')}
            style={[
              ui.badge,
              {
                backgroundColor:
                  filterMode === 'CUTTING' ? palette.dangerBg : palette.surfaceSubtle,
                borderWidth: 1,
                borderColor: filterMode === 'CUTTING' ? palette.dangerBg : palette.border,
                paddingVertical: 6,
                paddingHorizontal: 12,
              },
            ]}
          >
            <Text
              style={{
                fontSize: fonts.size.xs,
                fontWeight: fonts.weight.bold,
                color: filterMode === 'CUTTING' ? palette.onPrimary : palette.textSecondary,
              }}
            >
              Cutting Class ({cuttingTotal})
            </Text>
          </TouchableOpacity>

          {selectedStudentIds.length > 0 && (
            <TouchableOpacity
              onPress={() => setSelectedStudentIds([])}
              style={[
                ui.badge,
                {
                  backgroundColor: palette.primarySoft,
                  borderWidth: 1,
                  borderColor: palette.primary,
                  paddingVertical: 6,
                  paddingHorizontal: 10,
                },
              ]}
            >
              <Text
                style={{
                  fontSize: fonts.size.xs,
                  fontWeight: fonts.weight.bold,
                  color: palette.primary,
                }}
              >
                {selectedStudentIds.length} Selected × Clear
              </Text>
            </TouchableOpacity>
          )}
        </View>
      </View>

      {errorMsg ? (
        <View
          style={{
            marginHorizontal: 12,
            marginTop: 10,
            padding: 10,
            borderRadius: 10,
            backgroundColor: palette.warningLight,
            borderWidth: 1,
            borderColor: palette.warning,
          }}
        >
          <Text style={{ fontSize: fonts.xs, color: palette.textPrimary, fontWeight: fonts.weight.semibold }}>
            {errorMsg}
          </Text>
        </View>
      ) : null}

      {/* Search Bar */}
      <View style={{ paddingHorizontal: 12, paddingTop: 10 }}>
        <View style={[ui.input, ui.rowCenter, { height: 42 }]}>
          <Ionicons name="search" size={16} color={palette.textMuted} />
          <TextInput
            style={{ flex: 1, fontSize: fonts.size.sm, color: palette.textPrimary }}
            placeholder="Search student name or LRN..."
            placeholderTextColor={palette.textMuted}
            value={search}
            onChangeText={setSearch}
            maxLength={80}
          />
          {search.length > 0 && (
            <TouchableOpacity onPress={() => setSearch('')}>
              <Ionicons name="close-circle" size={18} color={palette.textMuted} />
            </TouchableOpacity>
          )}
        </View>
      </View>

      {/* Class List */}
      <FlatList
        data={filteredMatrix}
        keyExtractor={(item) => String(item.student_id)}
        contentContainerStyle={{ padding: 12, paddingBottom: 115 }}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={() => {
              setRefreshing(true);
              void fetchClassListData(false);
            }}
            colors={[palette.primary]}
            tintColor={palette.primary}
          />
        }
        ListEmptyComponent={
          <View style={{ alignItems: 'center', paddingVertical: 40, paddingHorizontal: 20 }}>
            <Ionicons name="people-outline" size={38} color={palette.textMuted} />
            <Text style={[ui.heading, { marginTop: 8, textAlign: 'center' }]}>
              No matching students
            </Text>
            <Text style={[ui.subtitle, { textAlign: 'center' }]}>
              {filterMode === 'CUTTING'
                ? 'No students are cutting class right now.'
                : 'Try clearing your search or pulling down to refresh.'}
            </Text>
          </View>
        }
        renderItem={({ item }) => {
          const isCutting = item.cutting_count > 0;
          const isPicked = selectedStudentIds.includes(item.student_id);
          const safePhoto = resolveMediaUrl(item.photo_url, serverBase);

          return (
            <View
              style={[
                ui.card,
                isPicked && { borderColor: palette.primary },
                isCutting && { borderColor: palette.danger },
              ]}
            >
              <View style={ui.rowBetween}>
                <View style={[ui.rowCenter, { flex: 1 }]}>
                  <TouchableOpacity
                    onPress={() => toggleStudentPick(item.student_id)}
                    accessibilityLabel={`Select ${item.student_name}`}
                    style={{ padding: 2 }}
                  >
                    <Ionicons
                      name={isPicked ? 'checkbox' : 'square-outline'}
                      size={20}
                      color={isPicked ? palette.primary : palette.textMuted}
                    />
                  </TouchableOpacity>

                  <View style={[ui.subtleBox, { paddingVertical: 3, paddingHorizontal: 7 }]}>
                    <Text
                      style={{
                        fontSize: fonts.size.xs,
                        fontWeight: fonts.weight.extrabold,
                        color: palette.textSecondary,
                      }}
                    >
                      {item.number}
                    </Text>
                  </View>

                  <View
                    style={{
                      width: 38,
                      height: 38,
                      borderRadius: 19,
                      backgroundColor: palette.primarySoft,
                      alignItems: 'center',
                      justifyContent: 'center',
                      overflow: 'hidden',
                    }}
                  >
                    {safePhoto ? (
                      <Image source={{ uri: safePhoto }} style={{ width: 38, height: 38 }} contentFit="cover" />
                    ) : (
                      <Text
                        style={{
                          fontSize: fonts.size.sm,
                          fontWeight: fonts.weight.extrabold,
                          color: palette.primary,
                        }}
                      >
                        {getInitials(item.student_name)}
                      </Text>
                    )}
                  </View>

                  <View style={{ flex: 1 }}>
                    <Text
                      style={{
                        fontSize: fonts.size.md,
                        fontWeight: fonts.weight.extrabold,
                        color: palette.textPrimary,
                      }}
                      numberOfLines={1}
                    >
                      {item.student_name}
                    </Text>
                    <Text style={ui.subtitle}>LRN: {item.lrn}</Text>
                  </View>
                </View>

                <View style={{ alignItems: 'flex-end' }}>
                  <Text
                    style={{
                      fontSize: fonts.size.md,
                      fontWeight: fonts.weight.extrabold,
                      color: item.compliance_rate >= 80 ? palette.success : palette.danger,
                    }}
                  >
                    {item.attended_count}/{item.total_subjects}
                  </Text>
                  <Text style={ui.subtitle}>{item.compliance_rate}%</Text>
                </View>
              </View>

              {/* Subject Status Pills */}
              <View
                style={{
                  flexDirection: 'row',
                  flexWrap: 'wrap',
                  gap: 6,
                  marginTop: 10,
                  paddingTop: 8,
                  borderTopWidth: 1,
                  borderTopColor: palette.border,
                }}
              >
                {(Array.isArray(item.subjects) ? item.subjects : []).map((sub) => {
                  const sColor =
                    sub.status === 'PRESENT'
                      ? palette.success
                      : sub.status === 'LATE'
                      ? palette.warning
                      : sub.status === 'EXCUSED'
                      ? palette.primary
                      : sub.status === 'CUTTING' || sub.status === 'ABSENT'
                      ? palette.danger
                      : palette.textMuted;
                  const sBg =
                    sub.status === 'PRESENT'
                      ? palette.successLight
                      : sub.status === 'LATE'
                      ? palette.warningLight
                      : sub.status === 'EXCUSED'
                      ? palette.primarySoft
                      : sub.status === 'CUTTING' || sub.status === 'ABSENT'
                      ? palette.dangerLight
                      : palette.surfaceSubtle;
                  return (
                    <View key={sub.schedule_id} style={[ui.badge, { backgroundColor: sBg }]}>
                      <Text
                        style={{
                          fontSize: fonts.size.xxs,
                          fontWeight: fonts.weight.extrabold,
                          color: sColor,
                        }}
                      >
                        {sub.subject_code}: {sub.status === 'UNSCANNED' ? '—' : sub.status}
                      </Text>
                    </View>
                  );
                })}
              </View>
            </View>
          );
        }}
      />
    </SafeAreaView>
  );
};

export default AdvisoryMatrixScreen;
