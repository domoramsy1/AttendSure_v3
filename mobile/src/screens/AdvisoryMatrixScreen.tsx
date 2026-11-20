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
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Image } from 'expo-image';
import { Ionicons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { apiClient } from '../api/client';
import { useThemeMode } from '../context/ThemeContext';
import { getServerBaseUrl } from '../services/configService';
import {
  isSafeUrl,
  cleanText,
  getFriendlyErrorMessage,
} from '../constants/theme';

const CLASS_LIST_CACHE_KEY = 'attendsure_cached_advisory_class_list';

interface SubjectStatus {
  schedule_id: number;
  subject_code: string;
  status: 'PRESENT' | 'LATE' | 'CUTTING' | 'UNVERIFIED' | 'UNSCANNED';
  time: string;
}

interface AdviseeRow {
  number: number;
  student_id: number;
  student_name: string;
  lrn: string;
  photo_url?: string | null;
  gate_status: string;
  gate_direction: 'IN' | 'OUT' | 'NONE';
  attended_count: number;
  cutting_count: number;
  total_subjects: number;
  compliance_rate: number;
  subjects: SubjectStatus[];
}

interface CachedClassListPayload {
  has_advisory_class: boolean;
  section_name: string;
  grade_level: string;
  matrix: AdviseeRow[];
}

const isCanceledError = (err: unknown): boolean => {
  const e = err as { code?: string; name?: string };
  return e?.code === 'ERR_CANCELED' || e?.name === 'CanceledError' || e?.name === 'AbortError';
};

export const AdvisoryMatrixScreen: React.FC = () => {
  const { palette, ui, fonts } = useThemeMode();
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [filterMode, setFilterMode] = useState<'ALL' | 'CUTTING'>('ALL');
  const [hasAdvisoryClass, setHasAdvisoryClass] = useState(false);
  const [sectionName, setSectionName] = useState('');
  const [gradeLevel, setGradeLevel] = useState('');
  const [matrix, setMatrix] = useState<AdviseeRow[]>([]);
  const [serverBase, setServerBase] = useState('');

  const isMountedRef = useRef(true);
  const abortRef = useRef<AbortController | null>(null);

  const fetchClassListData = useCallback(async (fromCacheFirst = false) => {
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    if (fromCacheFirst) {
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
            setMatrix(Array.isArray(parsed.matrix) ? parsed.matrix : []);
          }
        }
      } catch {}
    }

    try {
      const res = await apiClient.get<CachedClassListPayload>('classroom/adviser-matrix/', {
        signal: controller.signal,
      });
      if (!isMountedRef.current || controller.signal.aborted) return;

      setErrorMsg(null);
      if (res.data?.has_advisory_class) {
        const payload: CachedClassListPayload = {
          has_advisory_class: true,
          section_name: res.data.section_name || '',
          grade_level: res.data.grade_level || '',
          matrix: Array.isArray(res.data.matrix) ? res.data.matrix : [],
        };
        setHasAdvisoryClass(true);
        setSectionName(payload.section_name);
        setGradeLevel(payload.grade_level);
        setMatrix(payload.matrix);
        AsyncStorage.setItem(CLASS_LIST_CACHE_KEY, JSON.stringify(payload)).catch(() => {});
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
  }, []);

  useEffect(() => {
    isMountedRef.current = true;
    void fetchClassListData(true);
    return () => {
      isMountedRef.current = false;
      abortRef.current?.abort();
    };
  }, [fetchClassListData]);

  const resolveSafePhoto = useCallback(
    (url?: string | null): string | undefined => {
      if (!url || typeof url !== 'string') return undefined;
      const trimmed = url.trim();
      if (!trimmed) return undefined;
      const candidate =
        trimmed.startsWith('http://') ||
        trimmed.startsWith('https://') ||
        trimmed.startsWith('data:')
          ? trimmed
          : serverBase
          ? `${serverBase.replace(/\/+$/, '')}/${trimmed.replace(/^\/+/, '')}`
          : '';
      return isSafeUrl(candidate) ? candidate : undefined;
    },
    [serverBase]
  );

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

  const getInitials = (name: string) => {
    const parts = String(name || '')
      .replace(/,/g, '')
      .trim()
      .split(/\s+/)
      .filter(Boolean);
    return parts.length >= 2
      ? `${parts[0][0]}${parts[1][0]}`.toUpperCase()
      : String(name || 'ST').slice(0, 2).toUpperCase();
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
          {errorMsg || 'Your faculty account is not assigned as a Class Adviser yet.'}
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
        <Text style={ui.title}>Class List</Text>
        <Text style={ui.subtitle}>
          {[gradeLevel, sectionName].filter(Boolean).join(' - ')} • {matrix.length} Students
        </Text>

        <View style={[ui.rowCenter, { marginTop: 10 }]}>
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
              Missed Period ({cuttingTotal})
            </Text>
          </TouchableOpacity>
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
                ? 'No students have missed periods right now.'
                : 'Try clearing your search or pulling down to refresh.'}
            </Text>
          </View>
        }
        renderItem={({ item }) => {
          const isCutting = item.cutting_count > 0;
          const safePhoto = resolveSafePhoto(item.photo_url);

          return (
            <View style={[ui.card, isCutting && { borderColor: palette.danger }]}>
              <View style={ui.rowBetween}>
                <View style={[ui.rowCenter, { flex: 1 }]}>
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
                      : sub.status === 'CUTTING'
                      ? palette.danger
                      : palette.textMuted;
                  const sBg =
                    sub.status === 'PRESENT'
                      ? palette.successLight
                      : sub.status === 'LATE'
                      ? palette.warningLight
                      : sub.status === 'CUTTING'
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
