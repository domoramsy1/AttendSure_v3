// mobile/src/screens/SmsLogsScreen.tsx

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
        <View>
          <Text style={styles.screenTitle}>SMS Gateway Logs</Text>
          <Text style={styles.screenSub}>Parent Alerts & GSM Modem Outbox Queue</Text>
        </View>
        {metrics?.modem_port ? (
          <View style={styles.modemBadge}>
            <View style={styles.modemDot} />
            <Text style={styles.modemBadgeText}>
              {metrics.modem_port} ({metrics.modem_baudrate})
            </Text>
          </View>
        ) : null}
      </View>

      <ScrollView
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} colors={[COLORS.primary]} />
        }
      >
        {/* 1. Live Database Metrics */}
        {metrics && (
          <View style={styles.metricsRow}>
            <View style={styles.metricTile}>
              <Text style={styles.metricVal}>{metrics.total_today}</Text>
              <Text style={styles.metricLabel}>Today</Text>
            </View>
            <View style={styles.metricTile}>
              <Text style={[styles.metricVal, { color: '#16a34a' }]}>{metrics.sent_today}</Text>
              <Text style={styles.metricLabel}>Sent</Text>
            </View>
            <View style={styles.metricTile}>
              <Text style={[styles.metricVal, { color: '#d97706' }]}>{metrics.pending}</Text>
              <Text style={styles.metricLabel}>Pending</Text>
            </View>
            <View style={styles.metricTile}>
              <Text style={[styles.metricVal, { color: '#dc2626' }]}>{metrics.failed}</Text>
              <Text style={styles.metricLabel}>Failed</Text>
            </View>
          </View>
        )}

        {/* 2. Search & Status Filter Card */}
        <View style={styles.card}>
          <View style={styles.searchBox}>
            <Ionicons name="search-outline" size={16} color="#64748b" style={{ marginRight: 8 }} />
            <TextInput
              style={styles.searchInput}
              placeholder="Search recipient name, number, or message..."
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

          <View style={styles.filterRow}>
            {(['ALL', 'SENT', 'PENDING', 'FAILED'] as const).map((st) => (
              <TouchableOpacity
                key={st}
                style={[styles.filterPill, statusFilter === st && styles.filterPillActive]}
                onPress={() => setStatusFilter(st)}
              >
                <Text
                  style={[
                    styles.filterPillText,
                    statusFilter === st && styles.filterPillTextActive,
                  ]}
                >
                  {st}
                </Text>
              </TouchableOpacity>
            ))}
          </View>

          {canManageSms && (metrics?.failed ?? 0) > 0 && (
            <TouchableOpacity
              style={[styles.retryAllBtn, actionBusy && { opacity: 0.6 }]}
              onPress={handleRetryAllFailed}
              disabled={actionBusy}
            >
              <Ionicons name="refresh-circle-outline" size={16} color="#ffffff" />
              <Text style={styles.retryAllBtnText}>
                Retry All Failed Messages ({metrics?.failed})
              </Text>
            </TouchableOpacity>
          )}
        </View>

        {/* 3. Outbox Messages List */}
        <View style={styles.card}>
          <Text style={styles.sectionTitle}>SMS DISPATCH RECORDS ({logs.length})</Text>

          {loading ? (
            <ActivityIndicator size="small" color={COLORS.primary} style={{ marginVertical: 16 }} />
          ) : logs.length === 0 ? (
            <Text style={styles.emptyText}>No SMS records match your current filter.</Text>
          ) : (
            logs.map((item) => (
              <View key={String(item.id)} style={styles.smsItemRow}>
                <View style={styles.smsHeaderLine}>
                  <Text style={styles.recipientNameText}>
                    {item.recipient_name || item.recipient_number}
                  </Text>
                  <View
                    style={[
                      styles.statusBadge,
                      item.status === 'SENT'
                        ? styles.badgeSent
                        : item.status === 'PENDING'
                        ? styles.badgePending
                        : styles.badgeFailed,
                    ]}
                  >
                    <Text
                      style={[
                        styles.statusBadgeText,
                        item.status === 'SENT'
                          ? styles.textSent
                          : item.status === 'PENDING'
                          ? styles.textPending
                          : styles.textFailed,
                      ]}
                    >
                      {item.status}
                    </Text>
                  </View>
                </View>

                <Text style={styles.phoneText}>
                  {item.recipient_number} • {formatTimestamp(item.sent_at || item.created_at)}
                </Text>
                <Text style={styles.messageBodyText}>{item.message_body}</Text>

                {item.error_message ? (
                  <Text style={styles.errorText}>Error: {item.error_message}</Text>
                ) : null}

                {canManageSms && item.status === 'FAILED' && (
                  <TouchableOpacity
                    style={styles.singleRetryBtn}
                    onPress={() => handleRetrySingle(item.id)}
                  >
                    <Ionicons name="reload" size={12} color="#004b87" />
                    <Text style={styles.singleRetryText}>Retry Send</Text>
                  </TouchableOpacity>
                )}
              </View>
            ))
          )}
        </View>
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
    paddingHorizontal: 18,
    paddingVertical: 12,
    backgroundColor: '#ffffff',
    borderBottomWidth: 1,
    borderBottomColor: '#e2e8f0',
  },
  screenTitle: { fontSize: 18, fontWeight: '800', color: '#003460' },
  screenSub: { fontSize: 10.5, color: '#64748b', marginTop: 1 },
  modemBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#e6f0fa',
    paddingVertical: 4,
    paddingHorizontal: 8,
    borderRadius: 10,
    gap: 4,
  },
  modemDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: '#004b87' },
  modemBadgeText: { fontSize: 9, fontWeight: '800', color: '#004b87' },
  scrollContent: { padding: 16, gap: 12 },
  metricsRow: { flexDirection: 'row', gap: 8 },
  metricTile: {
    flex: 1,
    backgroundColor: '#ffffff',
    borderRadius: 12,
    padding: 10,
    borderWidth: 1,
    borderColor: '#e2e8f0',
    alignItems: 'center',
  },
  metricVal: { fontSize: 16, fontWeight: '800', color: '#0f172a' },
  metricLabel: { fontSize: 9, fontWeight: '700', color: '#64748b', marginTop: 2 },
  card: {
    backgroundColor: '#ffffff',
    borderRadius: 16,
    padding: 15,
    borderWidth: 1,
    borderColor: '#e2e8f0',
  },
  searchBox: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#f8fafc',
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#cbd5e1',
    paddingHorizontal: 12,
    height: 40,
    marginBottom: 10,
  },
  searchInput: { flex: 1, fontSize: 12, color: '#0f172a' },
  filterRow: { flexDirection: 'row', gap: 6 },
  filterPill: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: 7,
    borderRadius: 8,
    backgroundColor: '#f1f5f9',
  },
  filterPillActive: { backgroundColor: '#004b87' },
  filterPillText: { fontSize: 10, fontWeight: '800', color: '#64748b' },
  filterPillTextActive: { color: '#ffffff' },
  retryAllBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#dc2626',
    paddingVertical: 8,
    borderRadius: 8,
    marginTop: 10,
    gap: 6,
  },
  retryAllBtnText: { color: '#ffffff', fontSize: 11.5, fontWeight: '700' },
  sectionTitle: {
    fontSize: 10.5,
    fontWeight: '800',
    color: '#004b87',
    letterSpacing: 0.4,
    marginBottom: 8,
  },
  emptyText: { fontSize: 11.5, color: '#94a3b8', textAlign: 'center', paddingVertical: 14 },
  smsItemRow: {
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: '#f1f5f9',
  },
  smsHeaderLine: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  recipientNameText: { fontSize: 12.5, fontWeight: '700', color: '#0f172a' },
  phoneText: { fontSize: 10.5, color: '#64748b', marginTop: 1 },
  messageBodyText: { fontSize: 11.5, color: '#334155', marginTop: 4, lineHeight: 16 },
  errorText: { fontSize: 10.5, color: '#dc2626', fontWeight: '600', marginTop: 3 },
  statusBadge: { paddingVertical: 3, paddingHorizontal: 7, borderRadius: 6 },
  badgeSent: { backgroundColor: '#dcfce7' },
  textSent: { color: '#16a34a' },
  badgePending: { backgroundColor: '#fef3c7' },
  textPending: { color: '#d97706' },
  badgeFailed: { backgroundColor: '#fee2e2' },
  textFailed: { color: '#dc2626' },
  statusBadgeText: { fontSize: 8.5, fontWeight: '800' },
  singleRetryBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    backgroundColor: '#e6f0fa',
    paddingVertical: 4,
    paddingHorizontal: 8,
    borderRadius: 6,
    marginTop: 6,
    gap: 4,
  },
  singleRetryText: { fontSize: 10, fontWeight: '700', color: '#004b87' },
});

export default SmsLogsScreen;