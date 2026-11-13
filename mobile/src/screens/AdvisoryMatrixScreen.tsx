/**
 * AttendSure V3 - Mobile Advisory Subject Attendance Monitor
 * File: mobile/src/screens/AdvisoryMatrixScreen.tsx
 */

import React, { useState, useEffect, useCallback, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  TextInput,
  ActivityIndicator,
  RefreshControl,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Image } from 'expo-image';
import { Ionicons } from '@expo/vector-icons';
import { apiClient } from '../api/client';
import { COLORS } from '../constants/theme';

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
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [search, setSearch] = useState('');
  const [filterMode, setFilterMode] = useState<'ALL' | 'CUTTING'>('ALL');

  const [hasAdvisoryClass, setHasAdvisoryClass] = useState(false);
  const [sectionName, setSectionName] = useState('');
  const [gradeLevel, setGradeLevel] = useState('');
  const [matrix, setMatrix] = useState<AdviseeRow[]>([]);
  const [expandedId, setExpandedId] = useState<number | null>(null);

  const fetchMatrixData = useCallback(async () => {
    try {
      const res = await apiClient.get('classroom/adviser-matrix/');
      if (res.data?.has_advisory_class) {
        setHasAdvisoryClass(true);
        setSectionName(res.data.section_name || '');
        setGradeLevel(res.data.grade_level || '');
        setMatrix(res.data.matrix || []);
      } else {
        setHasAdvisoryClass(false);
      }
    } catch (err) {
      console.error('Failed to load mobile advisory matrix:', err);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    fetchMatrixData();
  }, [fetchMatrixData]);

  const onRefresh = () => {
    setRefreshing(true);
    fetchMatrixData();
  };

  const filteredMatrix = useMemo(() => {
    return matrix.filter((row) => {
      const matchSearch =
        row.student_name.toLowerCase().includes(search.toLowerCase()) ||
        row.lrn.includes(search);

      if (!matchSearch) return false;
      if (filterMode === 'CUTTING') return row.cutting_count > 0;
      return true;
    });
  }, [matrix, search, filterMode]);

  const summary = useMemo(() => {
    const total = matrix.length;
    const cutting = matrix.filter((m) => m.cutting_count > 0).length;
    return { total, cutting };
  }, [matrix]);

  const getInitials = (name: string) => {
    const parts = name.replace(/,/g, '').trim().split(/\s+/).filter(Boolean);
    if (parts.length >= 2) return `${parts[0][0]}${parts[1][0]}`.toUpperCase();
    return name.slice(0, 2).toUpperCase();
  };

  const renderSubjectBadge = (item: SubjectStatus) => {
    let bg = '#f1f5f9';
    let textCol = '#64748b';

    if (item.status === 'PRESENT') {
      bg = '#ecfdf5';
      textCol = '#059669';
    } else if (item.status === 'LATE') {
      bg = '#fffbeb';
      textCol = '#d97706';
    } else if (item.status === 'CUTTING') {
      bg = '#fef2f2';
      textCol = '#dc2626';
    }

    return (
      <View key={item.schedule_id} style={[styles.subPill, { backgroundColor: bg }]}>
        <Text style={[styles.subCode, { color: textCol }]}>{item.subject_code}</Text>
        <Text style={[styles.subStatus, { color: textCol }]}>
          {item.status === 'UNSCANNED' ? '—' : item.status}
        </Text>
      </View>
    );
  };

  if (loading) {
    return (
      <View style={styles.centerBox}>
        <ActivityIndicator size="small" color={COLORS.primary} />
        <Text style={styles.loadingText}>Loading advisory records...</Text>
      </View>
    );
  }

  if (!hasAdvisoryClass) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.emptyStateBox}>
          <Ionicons name="information-circle-outline" size={48} color="#94a3b8" />
          <Text style={styles.emptyTitle}>No Advisory Section</Text>
          <Text style={styles.emptySub}>
            Your faculty account is not registered as an official Class Adviser.
          </Text>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      {/* Header Strip */}
      <View style={styles.header}>
        <View>
          <Text style={styles.headerTitle}>Advisory Subject Monitor</Text>
          <Text style={styles.headerSubtitle}>
            {gradeLevel} - {sectionName} &bull; {summary.total} Advisees
          </Text>
        </View>

        <View style={styles.filterRow}>
          <TouchableOpacity
            style={[styles.filterChip, filterMode === 'ALL' && styles.filterChipActive]}
            onPress={() => setFilterMode('ALL')}
          >
            <Text style={[styles.filterText, filterMode === 'ALL' && styles.filterTextActive]}>
              All ({summary.total})
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.filterChip, filterMode === 'CUTTING' && styles.filterChipDangerActive]}
            onPress={() => setFilterMode('CUTTING')}
          >
            <Text style={[styles.filterText, filterMode === 'CUTTING' && styles.filterTextDangerActive]}>
              Cutting ({summary.cutting})
            </Text>
          </TouchableOpacity>
        </View>
      </View>

      {/* Search Field */}
      <View style={styles.searchContainer}>
        <Ionicons name="search" size={16} color="#94a3b8" style={{ marginRight: 6 }} />
        <TextInput
          style={styles.searchInput}
          placeholder="Search advisee name or LRN..."
          value={search}
          onChangeText={setSearch}
        />
        {search.length > 0 && (
          <TouchableOpacity onPress={() => setSearch('')}>
            <Ionicons name="close-circle" size={18} color="#94a3b8" />
          </TouchableOpacity>
        )}
      </View>

      {/* Advisee List */}
      <FlatList
        data={filteredMatrix}
        keyExtractor={(item) => String(item.student_id)}
        contentContainerStyle={{ padding: 12, paddingBottom: 28 }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
        renderItem={({ item }) => {
          const isExpanded = expandedId === item.student_id;
          const isCutting = item.cutting_count > 0;

          return (
            <TouchableOpacity
              style={[styles.card, isCutting && styles.cardCutting]}
              activeOpacity={0.8}
              onPress={() => setExpandedId(isExpanded ? null : item.student_id)}
            >
              <View style={styles.cardHeader}>
                {/* Number Badge */}
                <View style={styles.numberBadge}>
                  <Text style={styles.numberText}>{item.number}</Text>
                </View>

                {/* Profile Photo */}
                <View style={styles.avatarWrap}>
                  {item.photo_url ? (
                    <Image source={{ uri: item.photo_url }} style={styles.avatarImg} />
                  ) : (
                    <Text style={styles.initialsText}>{getInitials(item.student_name)}</Text>
                  )}
                </View>

                {/* Name & LRN */}
                <View style={{ flex: 1, marginLeft: 8 }}>
                  <Text style={styles.nameText} numberOfLines={1}>
                    {item.student_name}
                  </Text>
                  <Text style={styles.lrnText}>LRN: {item.lrn}</Text>
                  <Text style={styles.gateText}>
                    Gate: <Text style={{ fontWeight: '700', color: item.gate_direction === 'IN' ? '#059669' : '#dc2626' }}>{item.gate_status}</Text>
                  </Text>
                </View>

                {/* Compliance Badge */}
                <View style={styles.complianceBadge}>
                  <Text style={[styles.complianceText, { color: item.compliance_rate >= 80 ? '#059669' : '#dc2626' }]}>
                    {item.attended_count}/{item.total_subjects}
                  </Text>
                  <Text style={styles.complianceSub}>{item.compliance_rate}%</Text>
                </View>
              </View>

              {/* Subject Badges Summary */}
              <View style={styles.subjectsStrip}>
                {item.subjects.map((sub) => renderSubjectBadge(sub))}
              </View>

              {/* Expand Hint */}
              {isCutting && (
                <View style={styles.warningStrip}>
                  <Ionicons name="warning" size={13} color="#dc2626" />
                  <Text style={styles.warningText}>
                    Missing {item.cutting_count} subject period(s) today
                  </Text>
                </View>
              )}
            </TouchableOpacity>
          );
        }}
        ListEmptyComponent={
          <View style={styles.emptyListBox}>
            <Text style={styles.emptyListText}>No advisee records match the current filter.</Text>
          </View>
        }
      />
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f8fafc' },
  centerBox: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  loadingText: { marginTop: 8, fontSize: 13, color: '#64748b' },
  header: {
    paddingHorizontal: 16,
    paddingVertical: 12,
    backgroundColor: '#ffffff',
    borderBottomWidth: 1,
    borderBottomColor: '#e2e8f0',
  },
  headerTitle: { fontSize: 17, fontWeight: '800', color: '#0f172a' },
  headerSubtitle: { fontSize: 11.5, color: '#64748b', marginTop: 1 },
  filterRow: { flexDirection: 'row', gap: 8, marginTop: 10 },
  filterChip: {
    paddingVertical: 5,
    paddingHorizontal: 12,
    borderRadius: 6,
    backgroundColor: '#f1f5f9',
  },
  filterChipActive: { backgroundColor: COLORS.primary },
  filterChipDangerActive: { backgroundColor: '#dc2626' },
  filterText: { fontSize: 11.5, fontWeight: '700', color: '#64748b' },
  filterTextActive: { color: '#ffffff' },
  filterTextDangerActive: { color: '#ffffff' },
  searchContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    marginHorizontal: 12,
    marginTop: 10,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 8,
    backgroundColor: '#ffffff',
    borderWidth: 1,
    borderColor: '#e2e8f0',
  },
  searchInput: { flex: 1, fontSize: 12, color: '#0f172a' },
  card: {
    backgroundColor: '#ffffff',
    borderRadius: 12,
    padding: 12,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: '#e2e8f0',
  },
  cardCutting: {
    borderColor: '#fca5a5',
    backgroundColor: '#fffcfc',
  },
  cardHeader: { flexDirection: 'row', alignItems: 'center' },
  numberBadge: {
    width: 22,
    height: 22,
    borderRadius: 4,
    backgroundColor: '#f1f5f9',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 6,
  },
  numberText: { fontSize: 10.5, fontWeight: '800', color: '#64748b' },
  avatarWrap: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: 'rgba(0, 75, 135, 0.12)',
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  avatarImg: { width: 38, height: 38 },
  initialsText: { fontSize: 13, fontWeight: '800', color: COLORS.primary },
  nameText: { fontSize: 13, fontWeight: '800', color: '#0f172a' },
  lrnText: { fontSize: 10.5, color: '#64748b', fontFamily: 'monospace' },
  gateText: { fontSize: 10.5, color: '#64748b', marginTop: 1 },
  complianceBadge: { alignItems: 'flex-end', minWidth: 44 },
  complianceText: { fontSize: 13, fontWeight: '800' },
  complianceSub: { fontSize: 9.5, color: '#94a3b8' },
  subjectsStrip: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
    marginTop: 10,
    paddingTop: 8,
    borderTopWidth: 1,
    borderTopColor: '#f1f5f9',
  },
  subPill: {
    paddingHorizontal: 7,
    paddingVertical: 3,
    borderRadius: 5,
    alignItems: 'center',
  },
  subCode: { fontSize: 9.5, fontWeight: '800' },
  subStatus: { fontSize: 8.5, fontWeight: '600' },
  warningStrip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginTop: 8,
  },
  warningText: { fontSize: 10.5, fontWeight: '700', color: '#dc2626' },
  emptyStateBox: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24 },
  emptyTitle: { fontSize: 16, fontWeight: '800', color: '#0f172a', marginTop: 8 },
  emptySub: { fontSize: 12, color: '#64748b', textAlign: 'center', marginTop: 4, maxWidth: 260 },
  emptyListBox: { padding: 32, alignItems: 'center' },
  emptyListText: { fontSize: 12, color: '#94a3b8' },
});

export default AdvisoryMatrixScreen;