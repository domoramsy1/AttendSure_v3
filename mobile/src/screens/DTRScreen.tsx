// mobile/src/screens/DTRScreen.tsx

import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  RefreshControl,
  ActivityIndicator,
  TouchableOpacity,
  Alert,
  Platform,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { apiClient } from '../api/client';
import { useAuth } from '../context/AuthContext';

interface DTRRow {
  date: string;
  day_name?: string;
  is_weekend?: boolean;
  am_in: string | null;
  am_out: string | null;
  pm_in: string | null;
  pm_out: string | null;
  undertime_minutes?: number | null;
  total_hours: number | null;
  remarks?: string;
}

export const DTRScreen: React.FC = () => {
  const { user } = useAuth();

  const now = new Date();
  const currentYear = now.getFullYear();
  const currentMonthName = now.toLocaleString('en-US', { month: 'long' });

  const [dtrLogs, setDtrLogs] = useState<DTRRow[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [refreshing, setRefreshing] = useState<boolean>(false);
  const [dtrSubmitted, setDtrSubmitted] = useState<boolean>(false);
  const [deptHeadApproved, setDeptHeadApproved] = useState<boolean>(false);
  const [submitting, setSubmitting] = useState<boolean>(false);

  const displayName =
    user?.full_name ||
    `${user?.first_name || ''} ${user?.last_name || ''}`.trim() ||
    user?.faculty_name ||
    user?.username ||
    '';

  const employeeId = user?.faculty_id || user?.username || '';

  const fetchDTR = useCallback(async () => {
    try {
      const monthNum = new Date().getMonth() + 1;
      const yearNum = new Date().getFullYear();
      const res = await apiClient.get(`/api/dtr/?month=${monthNum}&year=${yearNum}`);
      const raw = res.data;

      if (raw && typeof raw === 'object' && !Array.isArray(raw)) {
        setDtrSubmitted(Boolean(raw.dtr_submitted));
        setDeptHeadApproved(Boolean(raw.dept_head_approved));

        const rows = raw.daily_records || raw.results || raw.days || [];
        setDtrLogs(Array.isArray(rows) ? rows : []);
      } else if (Array.isArray(raw)) {
        setDtrLogs(raw);
      } else {
        setDtrLogs([]);
      }
    } catch {
      setDtrLogs([]);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    fetchDTR();
  }, [fetchDTR]);

  const handleSubmitDTR = async () => {
    setSubmitting(true);
    try {
      await apiClient.post('/api/dtr/', { action: 'SUBMIT_DTR' });
      setDtrSubmitted(true);
      Alert.alert('DTR Submitted', 'Your daily time record has been submitted for review.');
    } catch (err: any) {
      const msg = err?.response?.data?.error || 'Could not submit DTR record.';
      Alert.alert('Submission Error', msg);
    } finally {
      setSubmitting(false);
    }
  };

  const totalRenderedHours = dtrLogs
    .reduce((sum, item) => sum + (item.total_hours || 0), 0)
    .toFixed(1);

  const daysPresent = dtrLogs.filter((item) => (item.total_hours || 0) > 0).length;

  return (
    <SafeAreaView style={styles.container} edges={['top', 'left', 'right']}>
      <View style={styles.topHeader}>
        <View style={{ flex: 1 }}>
          <Text style={styles.screenTitle}>Civil Service Form 48</Text>
          <Text style={styles.screenSub}>Daily Time Record • {currentMonthName} {currentYear}</Text>
        </View>

        <View style={styles.headerBadge}>
          <View style={styles.activeDot} />
          <Text style={styles.headerBadgeText}>DEPED CSC</Text>
        </View>
      </View>

      <View style={styles.statusCard}>
        <View style={styles.statusMetaRow}>
          <View style={{ flex: 1 }}>
            <Text style={styles.facultyNameText}>{displayName}</Text>
            {employeeId ? <Text style={styles.facultySubText}>Employee ID: {employeeId}</Text> : null}
          </View>

          <View
            style={[
              styles.submissionPill,
              deptHeadApproved ? styles.pillApproved : dtrSubmitted ? styles.pillSubmitted : styles.pillDraft,
            ]}
          >
            <Text
              style={[
                styles.submissionPillText,
                deptHeadApproved ? styles.textApproved : dtrSubmitted ? styles.textSubmitted : styles.textDraft,
              ]}
            >
              {deptHeadApproved ? 'ENDORSED' : dtrSubmitted ? 'PENDING' : 'DRAFT'}
            </Text>
          </View>
        </View>

        <View style={styles.metricsRibbon}>
          <View style={styles.metricItem}>
            <Text style={styles.metricLabel}>RENDERED</Text>
            <Text style={styles.metricVal}>{totalRenderedHours} hrs</Text>
          </View>
          <View style={styles.metricDivider} />
          <View style={styles.metricItem}>
            <Text style={styles.metricLabel}>DAYS LOGGED</Text>
            <Text style={styles.metricVal}>{daysPresent} days</Text>
          </View>
          <View style={styles.metricDivider} />
          <View style={styles.metricItem}>
            <Text style={styles.metricLabel}>UNDERTIME</Text>
            <Text style={[styles.metricVal, { color: '#059669' }]}>0 mins</Text>
          </View>
        </View>

        {!dtrSubmitted && (
          <TouchableOpacity
            style={[styles.submitDtrBtn, submitting && styles.btnDisabled]}
            onPress={handleSubmitDTR}
            disabled={submitting}
            activeOpacity={0.85}
          >
            {submitting ? (
              <ActivityIndicator color="#ffffff" size="small" />
            ) : (
              <>
                <Ionicons name="document-attach-outline" size={16} color="#ffffff" style={{ marginRight: 6 }} />
                <Text style={styles.submitDtrBtnText}>Submit DTR for Approval</Text>
              </>
            )}
          </TouchableOpacity>
        )}
      </View>

      {loading ? (
        <View style={styles.loadingBox}>
          <ActivityIndicator color="#004b87" size="large" />
          <Text style={styles.loadingText}>Compiling daily logs...</Text>
        </View>
      ) : dtrLogs.length === 0 ? (
        <View style={styles.emptyContainer}>
          <Ionicons name="calendar-outline" size={38} color="#94a3b8" />
          <Text style={styles.emptyText}>No attendance records recorded for this month.</Text>
        </View>
      ) : (
        <FlatList
          data={dtrLogs}
          keyExtractor={(item) => item.date}
          contentContainerStyle={styles.listContent}
          showsVerticalScrollIndicator={false}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); fetchDTR(); }} colors={['#004b87']} />
          }
          renderItem={({ item }) => {
            const hasHours = Boolean(item.total_hours && item.total_hours > 0);

            return (
              <View style={[styles.rowCard, item.is_weekend && styles.weekendCard]}>
                <View style={styles.dateRowHeader}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                    <Ionicons
                      name={item.is_weekend ? 'sunny-outline' : hasHours ? 'checkbox' : 'time-outline'}
                      size={15}
                      color={item.is_weekend ? '#94a3b8' : hasHours ? '#004b87' : '#64748b'}
                    />
                    <Text style={[styles.dateText, item.is_weekend && { color: '#64748b' }]}>
                      {item.date} {item.day_name ? `(${item.day_name})` : ''}
                    </Text>
                  </View>

                  {item.is_weekend ? (
                    <View style={styles.weekendPill}>
                      <Text style={styles.weekendPillText}>REST DAY</Text>
                    </View>
                  ) : hasHours ? (
                    <View style={styles.hoursPill}>
                      <Text style={styles.hoursPillText}>{item.total_hours} hrs</Text>
                    </View>
                  ) : (
                    <Text style={styles.pendingText}>{item.remarks || '--'}</Text>
                  )}
                </View>

                {!item.is_weekend && (
                  <View style={styles.timesGrid}>
                    <View style={styles.timeCol}>
                      <Text style={styles.timeLabel}>AM IN</Text>
                      <Text style={[styles.timeVal, item.am_in && styles.timeValActive]}>
                        {item.am_in || '--:--'}
                      </Text>
                    </View>

                    <View style={styles.timeCol}>
                      <Text style={styles.timeLabel}>AM OUT</Text>
                      <Text style={[styles.timeVal, item.am_out && styles.timeValActive]}>
                        {item.am_out || '--:--'}
                      </Text>
                    </View>

                    <View style={styles.timeCol}>
                      <Text style={styles.timeLabel}>PM IN</Text>
                      <Text style={[styles.timeVal, item.pm_in && styles.timeValActive]}>
                        {item.pm_in || '--:--'}
                      </Text>
                    </View>

                    <View style={styles.timeCol}>
                      <Text style={styles.timeLabel}>PM OUT</Text>
                      <Text style={[styles.timeVal, item.pm_out && styles.timeValActive]}>
                        {item.pm_out || '--:--'}
                      </Text>
                    </View>
                  </View>
                )}
              </View>
            );
          }}
        />
      )}
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f8fafc' },
  topHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 18, paddingVertical: 12, backgroundColor: '#ffffff', borderBottomWidth: 1, borderBottomColor: '#e2e8f0' },
  screenTitle: { fontSize: 18, fontWeight: '800', color: '#003460', letterSpacing: -0.3 },
  screenSub: { fontSize: 10.5, color: '#64748b', marginTop: 1 },
  headerBadge: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#e6f0fa', paddingVertical: 4, paddingHorizontal: 8, borderRadius: 12, gap: 4 },
  activeDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: '#004b87' },
  headerBadgeText: { fontSize: 9, fontWeight: '800', color: '#004b87', letterSpacing: 0.3 },
  statusCard: { backgroundColor: '#ffffff', marginHorizontal: 16, marginTop: 12, borderRadius: 16, padding: 14, borderWidth: 1, borderColor: '#e2e8f0', ...Platform.select({ ios: { shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.05, shadowRadius: 4 }, android: { elevation: 2 } }) },
  statusMetaRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  facultyNameText: { fontSize: 14, fontWeight: '800', color: '#0f172a' },
  facultySubText: { fontSize: 11, color: '#004b87', fontWeight: '700', marginTop: 1 },
  submissionPill: { paddingVertical: 3, paddingHorizontal: 8, borderRadius: 6, borderWidth: 1 },
  pillApproved: { backgroundColor: '#ecfdf5', borderColor: '#a7f3d0' },
  pillSubmitted: { backgroundColor: '#eff6ff', borderColor: '#bfdbfe' },
  pillDraft: { backgroundColor: '#f1f5f9', borderColor: '#cbd5e1' },
  submissionPillText: { fontSize: 9, fontWeight: '800', letterSpacing: 0.4 },
  textApproved: { color: '#047857' },
  textSubmitted: { color: '#1d4ed8' },
  textDraft: { color: '#475569' },
  metricsRibbon: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-around', backgroundColor: '#f8fafc', borderRadius: 10, paddingVertical: 8, marginTop: 10, borderWidth: 1, borderColor: '#f1f5f9' },
  metricItem: { alignItems: 'center', flex: 1 },
  metricDivider: { width: 1, height: 18, backgroundColor: '#e2e8f0' },
  metricLabel: { fontSize: 8.5, fontWeight: '800', color: '#64748b', letterSpacing: 0.3 },
  metricVal: { fontSize: 12, fontWeight: '800', color: '#0f172a', marginTop: 2 },
  submitDtrBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', backgroundColor: '#004b87', paddingVertical: 9, borderRadius: 10, marginTop: 10 },
  submitDtrBtnText: { color: '#ffffff', fontSize: 12, fontWeight: '700' },
  btnDisabled: { opacity: 0.65 },
  listContent: { paddingHorizontal: 16, paddingTop: 10, paddingBottom: 32 },
  loadingBox: { alignItems: 'center', justifyContent: 'center', paddingVertical: 60 },
  loadingText: { fontSize: 12, color: '#64748b', marginTop: 8 },
  emptyContainer: { alignItems: 'center', justifyContent: 'center', paddingVertical: 60 },
  emptyText: { fontSize: 12, color: '#64748b', marginTop: 8 },
  rowCard: { backgroundColor: '#ffffff', borderRadius: 12, padding: 12, marginBottom: 8, borderWidth: 1, borderColor: '#e2e8f0' },
  weekendCard: { backgroundColor: '#f8fafc', borderColor: '#e2e8f0' },
  dateRowHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingBottom: 6 },
  dateText: { fontSize: 12, fontWeight: '700', color: '#0f172a' },
  weekendPill: { backgroundColor: '#f1f5f9', paddingVertical: 2, paddingHorizontal: 6, borderRadius: 4 },
  weekendPillText: { fontSize: 8.5, fontWeight: '700', color: '#64748b' },
  hoursPill: { backgroundColor: '#ecfdf5', paddingVertical: 2, paddingHorizontal: 6, borderRadius: 4 },
  hoursPillText: { fontSize: 9, fontWeight: '800', color: '#047857' },
  pendingText: { fontSize: 10, fontWeight: '600', color: '#94a3b8' },
  timesGrid: { flexDirection: 'row', justifyContent: 'space-between', borderTopWidth: 1, borderTopColor: '#f1f5f9', paddingTop: 8, marginTop: 2 },
  timeCol: { alignItems: 'center', flex: 1 },
  timeLabel: { fontSize: 8.5, fontWeight: '800', color: '#94a3b8', letterSpacing: 0.3 },
  timeVal: { fontSize: 11, fontWeight: '600', color: '#94a3b8', marginTop: 2 },
  timeValActive: { color: '#0f172a', fontWeight: '700' },
});

export default DTRScreen;