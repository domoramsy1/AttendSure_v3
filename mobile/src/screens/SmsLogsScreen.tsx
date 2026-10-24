// D:\AttendSure_V3\mobile\src\screens\SmsLogsScreen.tsx

import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  TextInput,
  ScrollView,
  RefreshControl,
  ActivityIndicator,
  Alert,
  Platform,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { apiClient } from '../api/client';
import { useAuth } from '../context/AuthContext';
import { COLORS } from '../constants/theme';

interface SmsLogItem {
  id: number;
  recipient_name: string;
  recipient_number: string;
  message_body: string;
  status: 'SENT' | 'PENDING' | 'FAILED';
  trigger_event?: string;
  category?: string;
  error_message?: string | null;
  retry_count?: number;
  created_at?: string;
  sent_at?: string | null;
}

interface SmsMetricsData {
  total_today: number;
  pending: number;
  sent_today: number;
  failed: number;
  modem_port: string;
  modem_baudrate: number;
}

const showAlert = (title: string, message: string) => {
  if (Platform.OS === 'web' && typeof window !== 'undefined') {
    window.alert(`${title}: ${message}`);
  } else {
    Alert.alert(title, message);
  }
};

export const SmsLogsScreen: React.FC = () => {
  const { user } = useAuth();

  const currentUser = user as Record<string, any> | null;
  const rawRole = String(currentUser?.role || currentUser?.system_role || '').trim().toUpperCase();
  const canManageSms =
    Boolean(currentUser?.is_superuser) ||
    ['ADMIN', 'PRINCIPAL', 'DEPT_HEAD'].includes(rawRole);

  const [logs, setLogs] = useState<SmsLogItem[]>([]);
  const [metrics, setMetrics] = useState<SmsMetricsData | null>(null);
  const [statusFilter, setStatusFilter] = useState<'ALL' | 'SENT' | 'PENDING' | 'FAILED'>('ALL');
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [loading, setLoading] = useState<boolean>(true);
  const [refreshing, setRefreshing] = useState<boolean>(false);
  const [actionBusy, setActionBusy] = useState<boolean>(false);

  const fetchSmsData = useCallback(async () => {
    const params: Record<string, string> = {};
    if (statusFilter !== 'ALL') {
      params.status = statusFilter;
    }
    if (searchQuery.trim()) {
      params.search = searchQuery.trim();
    }

    const [logsRes, metricsRes] = await Promise.allSettled([
      apiClient.get('/api/sms-outbox/', { params }),
      apiClient.get('/api/sms-outbox/metrics/'),
    ]);

    if (logsRes.status === 'fulfilled') {
      const payload = logsRes.value.data;
      const list = Array.isArray(payload?.results)
        ? payload.results
        : Array.isArray(payload)
        ? payload
        : [];
      setLogs(list);
    } else {
      setLogs([]);
    }

    if (metricsRes.status === 'fulfilled' && metricsRes.value.data) {
      setMetrics(metricsRes.value.data);
    }

    setLoading(false);
    setRefreshing(false);
  }, [statusFilter, searchQuery]);

  useEffect(() => {
    fetchSmsData();
  }, [fetchSmsData]);

  const onRefresh = useCallback(() => {
    setRefreshing(true);
    fetchSmsData();
  }, [fetchSmsData]);

  const handleRetrySingle = async (id: number) => {
    if (!canManageSms) return;
    try {
      await apiClient.post(`/api/sms-outbox/${id}/retry/`);
      showAlert('Queued', 'Message has been re-queued for transmission.');
      fetchSmsData();
    } catch (err: any) {
      showAlert('Retry Failed', err?.response?.data?.error || 'Could not re-queue message.');
    }
  };

  const handleRetryAllFailed = async () => {
    if (!canManageSms) return;
    setActionBusy(true);
    try {
      const res = await apiClient.post('/api/sms-outbox/retry-all-failed/');
      showAlert('Retry Queued', `${res.data?.count ?? 0} failed message(s) re-queued.`);
      await fetchSmsData();
    } catch (err: any) {
      showAlert('Error', err?.response?.data?.error || 'Could not retry failed messages.');
    } finally {
      setActionBusy(false);
    }
  };

  const formatTimestamp = (iso?: string | null) => {
    if (!iso) return '';
    try {
      return new Date(iso).toLocaleString([], {
        month: 'short',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
      });
    } catch {
      return String(iso);
    }
  };

  return (
    <SafeAreaView style={styles.container} edges={['top', 'left', 'right']}>
      {/* Top Header */}
      <View style={styles.topHeader}>
        <View style={{ flex: 1 }}>
          <Text style={styles.screenTitle}>SMS Alerts</Text>
          <Text style={styles.screenSub}>Parent Attendance Notifications</Text>
        </View>

        {canManageSms && (metrics?.failed || 0) > 0 && (
          <TouchableOpacity
            style={[styles.retryAllBtn, actionBusy && { opacity: 0.6 }]}
            onPress={handleRetryAllFailed}
            disabled={actionBusy}
          >
            {actionBusy ? (
              <ActivityIndicator size="small" color="#ffffff" />
            ) : (
              <>
                <Ionicons name="refresh" size={14} color="#ffffff" />
                <Text style={styles.retryAllBtnText}>Retry Failed</Text>
              </>
            )}
          </TouchableOpacity>
        )}
      </View>

      {/* Metrics Row */}
      <View style={styles.metricsRow}>
        <View style={[styles.metricCard, { backgroundColor: '#f0fdf4', borderColor: '#bbf7d0' }]}>
          <Text style={[styles.metricNumber, { color: '#16a34a' }]}>
            {metrics?.sent_today ?? 0}
          </Text>
          <Text style={styles.metricLabel}>Sent Today</Text>
        </View>

        <View style={[styles.metricCard, { backgroundColor: '#fffbeb', borderColor: '#fef3c7' }]}>
          <Text style={[styles.metricNumber, { color: '#d97706' }]}>
            {metrics?.pending ?? 0}
          </Text>
          <Text style={styles.metricLabel}>Pending</Text>
        </View>

        <View style={[styles.metricCard, { backgroundColor: '#fef2f2', borderColor: '#fecaca' }]}>
          <Text style={[styles.metricNumber, { color: '#dc2626' }]}>
            {metrics?.failed ?? 0}
          </Text>
          <Text style={styles.metricLabel}>Failed</Text>
        </View>
      </View>

      {/* Search & Filter Bar */}
      <View style={styles.filterSection}>
        <View style={styles.searchBox}>
          <Ionicons name="search-outline" size={16} color="#64748b" />
          <TextInput
            style={styles.searchInput}
            placeholder="Search parent name, phone, or text..."
            placeholderTextColor="#94a3b8"
            value={searchQuery}
            onChangeText={setSearchQuery}
          />
          {searchQuery.length > 0 && (
            <TouchableOpacity onPress={() => setSearchQuery('')}>
              <Ionicons name="close-circle" size={16} color="#94a3b8" />
            </TouchableOpacity>
          )}
        </View>

        <View style={styles.statusChipsRow}>
          {(['ALL', 'SENT', 'PENDING', 'FAILED'] as const).map((st) => {
            const active = statusFilter === st;
            return (
              <TouchableOpacity
                key={st}
                style={[styles.statusChip, active && styles.statusChipActive]}
                onPress={() => setStatusFilter(st)}
              >
                <Text style={[styles.statusChipText, active && styles.statusChipTextActive]}>
                  {st}
                </Text>
              </TouchableOpacity>
            );
          })}
        </View>
      </View>

      {/* Message Ledger */}
      <ScrollView
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} colors={[COLORS.primary]} />
        }
      >
        {loading ? (
          <View style={styles.loadingBox}>
            <ActivityIndicator size="small" color={COLORS.primary} />
            <Text style={styles.loadingText}>Loading SMS logs...</Text>
          </View>
        ) : logs.length === 0 ? (
          <View style={styles.emptyCard}>
            <Ionicons name="chatbubble-ellipses-outline" size={36} color="#94a3b8" />
            <Text style={styles.emptyTitle}>No Messages Found</Text>
            <Text style={styles.emptySub}>
              No automated SMS parent alerts match the active filter criteria.
            </Text>
          </View>
        ) : (
          logs.map((item) => {
            const isSent = item.status === 'SENT';
            const isPending = item.status === 'PENDING';
            const isFailed = item.status === 'FAILED';

            return (
              <View key={String(item.id)} style={styles.logCard}>
                <View style={styles.logCardHeader}>
                  <View style={{ flex: 1, marginRight: 8 }}>
                    <Text style={styles.recipientName}>{item.recipient_name || 'Parent / Guardian'}</Text>
                    <Text style={styles.recipientPhone}>{item.recipient_number}</Text>
                  </View>

                  <View
                    style={[
                      styles.statusPill,
                      isSent && { backgroundColor: '#ecfdf5', borderColor: '#a7f3d0' },
                      isPending && { backgroundColor: '#fffbeb', borderColor: '#fde68a' },
                      isFailed && { backgroundColor: '#fef2f2', borderColor: '#fca5a5' },
                    ]}
                  >
                    <Text
                      style={[
                        styles.statusPillText,
                        isSent && { color: '#059669' },
                        isPending && { color: '#d97706' },
                        isFailed && { color: '#dc2626' },
                      ]}
                    >
                      {item.status}
                    </Text>
                  </View>
                </View>

                <Text style={styles.messageBody}>{item.message_body}</Text>

                <View style={styles.logCardFooter}>
                  <Text style={styles.timestampText}>
                    {formatTimestamp(item.sent_at || item.created_at)}
                  </Text>

                  {canManageSms && isFailed && (
                    <TouchableOpacity
                      style={styles.singleRetryBtn}
                      onPress={() => handleRetrySingle(item.id)}
                    >
                      <Ionicons name="reload-outline" size={12} color="#dc2626" />
                      <Text style={styles.singleRetryBtnText}>Resend</Text>
                    </TouchableOpacity>
                  )}
                </View>
              </View>
            );
          })
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
  screenTitle: { fontSize: 17, fontWeight: '800', color: '#003460' },
  screenSub: { fontSize: 10.5, color: '#64748b', marginTop: 1 },
  retryAllBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: '#dc2626',
    paddingVertical: 6,
    paddingHorizontal: 10,
    borderRadius: 8,
  },
  retryAllBtnText: { color: '#ffffff', fontSize: 11, fontWeight: '700' },
  metricsRow: {
    flexDirection: 'row',
    gap: 8,
    paddingHorizontal: 16,
    paddingTop: 12,
  },
  metricCard: {
    flex: 1,
    borderRadius: 12,
    paddingVertical: 10,
    alignItems: 'center',
    borderWidth: 1,
  },
  metricNumber: { fontSize: 18, fontWeight: '800' },
  metricLabel: { fontSize: 9.5, fontWeight: '700', color: '#64748b', marginTop: 1 },
  filterSection: { paddingHorizontal: 16, paddingTop: 10 },
  searchBox: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#ffffff',
    borderRadius: 10,
    paddingHorizontal: 12,
    height: 38,
    borderWidth: 1,
    borderColor: '#cbd5e1',
    gap: 8,
  },
  searchInput: { flex: 1, fontSize: 12, color: '#0f172a' },
  statusChipsRow: { flexDirection: 'row', gap: 6, marginTop: 8 },
  statusChip: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: 6,
    backgroundColor: '#ffffff',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#cbd5e1',
  },
  statusChipActive: { backgroundColor: '#004b87', borderColor: '#004b87' },
  statusChipText: { fontSize: 10, fontWeight: '700', color: '#64748b' },
  statusChipTextActive: { color: '#ffffff' },
  scrollContent: { padding: 16, paddingBottom: 110, gap: 10 },
  loadingBox: { padding: 32, alignItems: 'center' },
  loadingText: { fontSize: 11, color: '#64748b', marginTop: 8 },
  emptyCard: {
    backgroundColor: '#ffffff',
    borderRadius: 14,
    padding: 24,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#e2e8f0',
  },
  emptyTitle: { fontSize: 13, fontWeight: '800', color: '#0f172a', marginTop: 8 },
  emptySub: { fontSize: 11, color: '#64748b', textAlign: 'center', marginTop: 4, lineHeight: 15 },
  logCard: {
    backgroundColor: '#ffffff',
    borderRadius: 12,
    padding: 12,
    borderWidth: 1,
    borderColor: '#e2e8f0',
  },
  logCardHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' },
  recipientName: { fontSize: 12.5, fontWeight: '700', color: '#0f172a' },
  recipientPhone: { fontSize: 10.5, color: '#64748b', marginTop: 1, fontFamily: 'monospace' },
  statusPill: { paddingVertical: 2.5, paddingHorizontal: 7, borderRadius: 6, borderWidth: 1 },
  statusPillText: { fontSize: 8.5, fontWeight: '800', letterSpacing: 0.3 },
  messageBody: { fontSize: 11.5, color: '#334155', lineHeight: 16, marginVertical: 8 },
  logCardFooter: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    borderTopWidth: 1,
    borderTopColor: '#f1f5f9',
    paddingTop: 6,
  },
  timestampText: { fontSize: 9.5, color: '#94a3b8' },
  singleRetryBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    backgroundColor: '#fee2e2',
    paddingVertical: 3,
    paddingHorizontal: 7,
    borderRadius: 5,
  },
  singleRetryBtnText: { fontSize: 9.5, fontWeight: '700', color: '#dc2626' },
});

export default SmsLogsScreen;