/**
 * AttendSure - Mobile Advisory Subject Attendance Monitor (Themed & Compact)
 * File: mobile/src/screens/AdvisoryMatrixScreen.tsx
 */

import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { View, Text, FlatList, TouchableOpacity, TextInput, ActivityIndicator, RefreshControl } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Image } from 'expo-image';
import { Ionicons } from '@expo/vector-icons';
import { apiClient } from '../api/client';
import { useThemeMode } from '../context/ThemeContext';
import { isSafeUrl } from '../constants/theme';

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

export const AdvisoryMatrixScreen: React.FC = () => {
  const { palette, ui, fonts } = useThemeMode();
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [search, setSearch] = useState('');
  const [filterMode, setFilterMode] = useState<'ALL' | 'CUTTING'>('ALL');
  const [hasAdvisoryClass, setHasAdvisoryClass] = useState(false);
  const [sectionName, setSectionName] = useState('');
  const [gradeLevel, setGradeLevel] = useState('');
  const [matrix, setMatrix] = useState<AdviseeRow[]>([]);

  const fetchMatrixData = useCallback(async () => {
    try {
      const res = await apiClient.get('classroom/adviser-matrix/');
      if (res.data?.has_advisory_class) {
        setHasAdvisoryClass(true);
        setSectionName(res.data.section_name || '');
        setGradeLevel(res.data.grade_level || '');
        setMatrix(Array.isArray(res.data.matrix) ? res.data.matrix : []);
      } else {
        setHasAdvisoryClass(false);
      }
    } catch {
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    fetchMatrixData();
  }, [fetchMatrixData]);

  const filteredMatrix = useMemo(() => {
    const q = search.trim().toLowerCase();
    return matrix.filter((row) => {
      const matchSearch = !q || row.student_name.toLowerCase().includes(q) || row.lrn.includes(q);
      if (!matchSearch) return false;
      return filterMode === 'CUTTING' ? row.cutting_count > 0 : true;
    });
  }, [matrix, search, filterMode]);

  const cuttingTotal = useMemo(() => matrix.filter((m) => m.cutting_count > 0).length, [matrix]);

  const getInitials = (name: string) => {
    const parts = String(name || '').replace(/,/g, '').trim().split(/\s+/).filter(Boolean);
    return parts.length >= 2 ? `${parts[0][0]}${parts[1][0]}`.toUpperCase() : String(name || 'ST').slice(0, 2).toUpperCase();
  };

  if (loading) {
    return (
      <View style={ui.centerBox}>
        <ActivityIndicator size="small" color={palette.primary} />
        <Text style={[ui.subtitle, { marginTop: 8 }]}>Loading class list...</Text>
      </View>
    );
  }

  if (!hasAdvisoryClass) {
    return (
      <SafeAreaView style={ui.centerBox}>
        <Ionicons name="information-circle-outline" size={44} color={palette.textMuted} />
        <Text style={[ui.title, { marginTop: 8 }]}>No Advisory Section</Text>
        <Text style={[ui.subtitle, { textAlign: 'center', marginTop: 4 }]}>
          Your faculty account is not assigned as a Class Adviser yet.
        </Text>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={ui.screen} edges={['top']}>
      {/* Header */}
      <View style={{ padding: 14, backgroundColor: palette.surface, borderBottomWidth: 1, borderBottomColor: palette.border }}>
        <Text style={ui.title}>Class List &amp; Cutting Monitor</Text>
        <Text style={ui.subtitle}>{gradeLevel} - {sectionName} • {matrix.length} Students</Text>

        <View style={[ui.rowCenter, { marginTop: 10 }]}>
          <TouchableOpacity
            onPress={() => setFilterMode('ALL')}
            style={[ui.badge, { backgroundColor: filterMode === 'ALL' ? palette.primary : palette.surfaceSubtle, paddingVertical: 6, paddingHorizontal: 12 }]}
          >
            <Text style={{ fontSize: fonts.size.xs, fontWeight: fonts.weight.bold, color: filterMode === 'ALL' ? '#fff' : palette.textSecondary }}>
              All ({matrix.length})
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            onPress={() => setFilterMode('CUTTING')}
            style={[ui.badge, { backgroundColor: filterMode === 'CUTTING' ? palette.danger : palette.surfaceSubtle, paddingVertical: 6, paddingHorizontal: 12 }]}
          >
            <Text style={{ fontSize: fonts.size.xs, fontWeight: fonts.weight.bold, color: filterMode === 'CUTTING' ? '#fff' : palette.textSecondary }}>
              Cutting ({cuttingTotal})
            </Text>
          </TouchableOpacity>
        </View>
      </View>

      {/* Search Bar */}
      <View style={{ paddingHorizontal: 12, paddingTop: 10 }}>
        <View style={[ui.input, ui.rowCenter, { height: 40 }]}>
          <Ionicons name="search" size={16} color={palette.textMuted} />
          <TextInput
            style={{ flex: 1, fontSize: fonts.size.sm, color: palette.textPrimary }}
            placeholder="Search student name or LRN..."
            placeholderTextColor={palette.textMuted}
            value={search}
            onChangeText={setSearch}
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
        contentContainerStyle={{ padding: 12, paddingBottom: 110 }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); fetchMatrixData(); }} colors={[palette.primary]} />}
        renderItem={({ item }) => {
          const isCutting = item.cutting_count > 0;
          const safePhoto = isSafeUrl(item.photo_url) ? item.photo_url : undefined;

          return (
            <View style={[ui.card, isCutting && { borderColor: palette.danger }]}>
              <View style={ui.rowBetween}>
                <View style={[ui.rowCenter, { flex: 1 }]}>
                  <View style={[ui.subtleBox, { paddingVertical: 3, paddingHorizontal: 7 }]}>
                    <Text style={{ fontSize: fonts.size.xs, fontWeight: fonts.weight.extrabold, color: palette.textSecondary }}>{item.number}</Text>
                  </View>

                  <View style={{ width: 38, height: 38, borderRadius: 19, backgroundColor: palette.primarySoft, alignItems: 'center', justifyContent: 'center', overflow: 'hidden' }}>
                    {safePhoto ? (
                      <Image source={{ uri: safePhoto }} style={{ width: 38, height: 38 }} />
                    ) : (
                      <Text style={{ fontSize: fonts.size.sm, fontWeight: fonts.weight.extrabold, color: palette.primary }}>{getInitials(item.student_name)}</Text>
                    )}
                  </View>

                  <View style={{ flex: 1 }}>
                    <Text style={{ fontSize: fonts.size.md, fontWeight: fonts.weight.extrabold, color: palette.textPrimary }} numberOfLines={1}>
                      {item.student_name}
                    </Text>
                    <Text style={ui.subtitle}>LRN: {item.lrn}</Text>
                  </View>
                </View>

                <View style={{ alignItems: 'flex-end' }}>
                  <Text style={{ fontSize: fonts.size.md, fontWeight: fonts.weight.extrabold, color: item.compliance_rate >= 80 ? palette.success : palette.danger }}>
                    {item.attended_count}/{item.total_subjects}
                  </Text>
                  <Text style={ui.subtitle}>{item.compliance_rate}%</Text>
                </View>
              </View>

              {/* Subject Status Pills */}
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 10, paddingTop: 8, borderTopWidth: 1, borderTopColor: palette.border }}>
                {item.subjects.map((sub) => {
                  const sColor = sub.status === 'PRESENT' ? palette.success : sub.status === 'LATE' ? palette.warning : sub.status === 'CUTTING' ? palette.danger : palette.textMuted;
                  const sBg = sub.status === 'PRESENT' ? palette.successLight : sub.status === 'LATE' ? palette.warningLight : sub.status === 'CUTTING' ? palette.dangerLight : palette.surfaceSubtle;
                  return (
                    <View key={sub.schedule_id} style={[ui.badge, { backgroundColor: sBg }]}>
                      <Text style={{ fontSize: fonts.size.xxs, fontWeight: fonts.weight.extrabold, color: sColor }}>
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