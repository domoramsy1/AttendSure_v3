// mobile/src/screens/SmsLogsScreen.tsx

import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TextInput,
  TouchableOpacity,
  FlatList,
  RefreshControl,
  ActivityIndicator,
  Alert,
  Platform,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { apiClient } from '../api/client';
import { COLORS } from '../constants/theme';

interface SmsItem {
  id: number;
  recipient_name: string;
  recipient_number: string;
  message_body: string;
  status: 'PENDING' | 'SENT' | 'FAILED' | string;
  created_at: string;
  trigger_event?: string;
  error_message?: string | null;
  retry_count?: number;
}

export const SmsLogsScreen: React.FC = () => {
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [logs, setLogs] = useState<SmsItem[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [refreshing, setRefreshing] = useState<boolean>(false);
  const [retryingId, setRetryingId] = useState<number | null>(null);
  const [statusFilter, setStatusFilter] = useState<'ALL' | 'PENDING' | 'SENT' | 'FAILED'>('ALL');

  const fetchDatabaseSms = useCallback(async () => {
    try {
      const url =
        statusFilter === 'ALL'
          ? '/api/sms-outbox/'
          : `/api/sms-outbox/?status=${statusFilter}`;
      const response = await apiClient.get(url);
      const data = response.data?.results || response.data || [];
      setLogs(Array.isArray(data) ? data : []);
    } catch (err: any) {
      const msg =
        err?.response?.data?.error ||
        err?.response?.data?.detail ||
        'Unable to connect to the SMS outbox database.';
      Alert.alert('Database Notice', msg);
      setLogs([]);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [statusFilter]);

  useEffect(() => {
    setLoading(true);
    fetchDatabaseSms();
  }, [fetchDatabaseSms]);

  const handleDeleteDelivered = () => {
    Alert.alert(
      'Clean Delivered Messages',
      'Do you want to purge sent SMS records from the database outbox?',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Clear Sent',
          style: 'destructive',
          onPress: async () => {
            try {
              const res = await apiClient.post('/api/sms-outbox/delete-delivered/');
              Alert.alert('Outbox Cleaned', res.data?.message || 'Delivered records removed.');
              fetchDatabaseSms();
            } catch {
              Alert.alert('Error', 'Could not delete delivered SMS records.');
            }
          },
        },
      ]
    );
  };

  const handleRetrySingle = async (id: number) => {
    setRetryingId(id);
    try {
      await apiClient.post(`/api/sms-outbox/${id}/retry/`);
      Alert.alert('Message Re-queued', 'SMS has been marked PENDING for GSM modem transmission.');
      fetchDatabaseSms();
    } catch {
      Alert.alert('Retry Failed', 'Unable to queue SMS for re-transmission.');
    } finally {
      setRetryingId(null);
    }
  };

  const handleRetryAllFailed = async () => {
    try {
      const res = await apiClient.post('/api/sms-outbox/retry-all-failed/');
      Alert.alert('Batch Retry Queued', `Re-queued ${res.data?.count || 0} failed messages.`);
      fetchDatabaseSms();
    } catch {
      Alert.alert('Error', 'Could not re-queue failed messages.');
    }
  };

  const filteredLogs = logs.filter((item) => {
    const q = searchQuery.toLowerCase().trim();
    if (!q) return true;
    return (
      (item.recipient_name || '').toLowerCase().includes(q) ||
      (item.recipient_number || '').includes(q) ||
      (item.message_body || '').toLowerCase().includes(q) ||
      (item.trigger_event || '').toLowerCase().includes(q)
    );
  });

  const failedCount = logs.filter((item) => item.status === 'FAILED').length;

  return (
    <SafeAreaView style={styles.container} edges={['top', 'left', 'right']}>
      {/* Top Header */}
      <View style={styles.topHeader}>
        <View style={{ flex: 1 }}>
          <Text style={styles.screenTitle}>SMS Dispatch Outbox</Text>
          <Text style={styles.screenSub}>Turnstile Notifications & Automated Parent Alerts</Text>
        </View>

        <View style={styles.headerBadge}>
          <View style={styles.activeDot} />
          <Text style={styles.headerBadgeText}>GSM MODEM</Text>
        </View>
      </View>

      <View style={styles.contentWrap}>
        {/* Controls Row: Search & Action Buttons */}
        <View style={styles.searchRow}>
          <View style={styles.searchBox}>
            <Ionicons name="search-outline" size={17} color="#94a3b8" />
            <TextInput
              style={styles.searchInput}
              placeholder="Search parent number, student, or text..."
              placeholderTextColor="#94a3b8"
              value={searchQuery}
              onChangeText={setSearchQuery}
              autoCapitalize="none"
              autoCorrect={false}
            />
            {searchQuery.length > 0 && (
              <TouchableOpacity onPress={() => setSearchQuery('')}>
                <Ionicons name="close-circle" size={16} color="#94a3b8" />
              </TouchableOpacity>
            )}
          </View>

          <TouchableOpacity
            style={styles.cleanBtn}
            onPress={handleDeleteDelivered}
            activeOpacity={0.75}
            accessibilityLabel="Purge Delivered SMS"
          >
            <Ionicons name="trash-outline" size={18} color="#dc2626" />
          </TouchableOpacity>
        </View>

        {/* Filter Pills */}
        <View style={styles.filterPillsRow}>
          {(['ALL', 'PENDING', 'SENT', 'FAILED'] as const).map((filter) => (
            <TouchableOpacity
              key={filter}
              style={[styles.filterPill, statusFilter === filter && styles.filterPillActive]}
              onPress={() => setStatusFilter(filter)}
              activeOpacity={0.7}
            >
              <Text
                style={[
                  styles.filterPillText,
                  statusFilter === filter && styles.filterPillTextActive,
                ]}
              >
                {filter}
              </Text>
            </TouchableOpacity>
          ))}

          {failedCount > 0 && statusFilter === 'FAILED' && (
            <TouchableOpacity
              style={styles.retryAllBtn}
              onPress={handleRetryAllFailed}
              activeOpacity={0.8}
            >
              <Ionicons name="refresh" size={12} color="#ffffff" />
              <Text style={styles.retryAllBtnText}>Retry All</Text>
            </TouchableOpacity>
          )}
        </View>

        {/* Message Records List */}
        {loading ? (
          <View style={styles.centerBox}>
            <ActivityIndicator color={COLORS.primary} size="large" />
            <Text style={styles.loadingText}>Fetching SMS queue from database...</Text>
          </View>
        ) : filteredLogs.length === 0 ? (
          <View style={styles.emptyBox}>
            <Ionicons name="mail-open-outline" size={44} color="#cbd5e1" />
            <Text style={styles.emptyTitle}>No Matching SMS Logs</Text>
            <Text style={styles.emptySub}>
              Automated notifications sent upon student campus turnstile taps or announcements will appear here.
            </Text>
            <TouchableOpacity
              style={styles.refreshBtn}
              onPress={fetchDatabaseSms}
              activeOpacity={0.8}
            >
              <Ionicons name="refresh" size={14} color="#ffffff" style={{ marginRight: 4 }} />
              <Text style={styles.refreshBtnText}>Reload Outbox</Text>
            </TouchableOpacity>
          </View>
        ) : (
          <FlatList
            data={filteredLogs}
            keyExtractor={(item) => String(item.id)}
            contentContainerStyle={styles.listContent}
            showsVerticalScrollIndicator={false}
            refreshControl={
              <RefreshControl
                refreshing={refreshing}
                onRefresh={() => {
                  setRefreshing(true);
                  fetchDatabaseSms();
                }}
                colors={[COLORS.primary]}
              />
            }
            renderItem={({ item }) => {
              const isSent = item.status === 'SENT';
              const isFailed = item.status === 'FAILED';
              const isPending = item.status === 'PENDING';

              const formattedDate = item.created_at
                ? new Date(item.created_at).toLocaleString('en-US', {
                    month: 'short',
                    day: 'numeric',
                    hour: '2-digit',
                    minute: '2-digit',
                  })
                : 'Just now';

              return (
                <View style={styles.logCard}>
                  <View style={styles.logCardHeader}>
                    <View style={{ flex: 1, marginRight: 8 }}>
                      <Text style={styles.logStudentName} numberOfLines={1}>
                        {item.recipient_name || 'Parent / Guardian'}
                      </Text>
                      <Text style={styles.logParentPhone}>{item.recipient_number}</Text>
                    </View>

                    <View
                      style={[
                        styles.statusBadge,
                        isSent && styles.statusSuccess,
                        isFailed && styles.statusFailed,
                        isPending && styles.statusPending,
                      ]}
                    >
                      <Text
                        style={[
                          styles.statusBadgeText,
                          isSent && styles.statusSuccessText,
                          isFailed && styles.statusFailedText,
                          isPending && styles.statusPendingText,
                        ]}
                      >
                        {item.status}
                      </Text>
                    </View>
                  </View>

                  <View style={styles.bubbleBox}>
                    <Text style={styles.bubbleText}>{item.message_body}</Text>
                  </View>

                  {item.error_message ? (
                    <View style={styles.errorBanner}>
                      <Ionicons name="alert-circle" size={13} color="#b91c1c" />
                      <Text style={styles.errorText} numberOfLines={2}>
                        {item.error_message}
                      </Text>
                    </View>
                  ) : null}

                  <View style={styles.logFooterRow}>
                    <View style={styles.timestampWrap}>
                      <Ionicons name="time-outline" size={12} color="#94a3b8" />
                      <Text style={styles.timestampText}>{formattedDate}</Text>
                    </View>

                    {isFailed && (
                      <TouchableOpacity
                        style={styles.retrySingleBtn}
                        onPress={() => handleRetrySingle(item.id)}
                        disabled={retryingId === item.id}
                        activeOpacity={0.75}
                      >
                        {retryingId === item.id ? (
                          <ActivityIndicator size="small" color="#004b87" />
                        ) : (
                          <>
                            <Ionicons name="refresh" size={12} color="#004b87" />
                            <Text style={styles.retrySingleBtnText}>Resend</Text>
                          </>
                        )}
                      </TouchableOpacity>
                    )}
                  </View>
                </View>
              );
            }}
          />
        )}
      </View>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f8fafc',
  },
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
  screenTitle: {
    fontSize: 18,
    fontWeight: '800',
    color: '#003460',
    letterSpacing: -0.3,
  },
  screenSub: {
    fontSize: 10.5,
    color: '#64748b',
    marginTop: 1,
  },
  headerBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#e6f0fa',
    paddingVertical: 4,
    paddingHorizontal: 8,
    borderRadius: 12,
    gap: 4,
  },
  activeDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: '#004b87',
  },
  headerBadgeText: {
    fontSize: 9,
    fontWeight: '800',
    color: '#004b87',
    letterSpacing: 0.3,
  },
  contentWrap: {
    flex: 1,
    paddingHorizontal: 16,
    paddingTop: 10,
  },
  searchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 8,
  },
  searchBox: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#ffffff',
    borderRadius: 12,
    paddingHorizontal: 12,
    height: 42,
    borderWidth: 1.2,
    borderColor: '#cbd5e1',
    gap: 8,
  },
  searchInput: {
    flex: 1,
    fontSize: 12.5,
    color: '#0f172a',
  },
  cleanBtn: {
    width: 42,
    height: 42,
    borderRadius: 10,
    backgroundColor: '#fee2e2',
    borderWidth: 1,
    borderColor: '#fecaca',
    alignItems: 'center',
    justifyContent: 'center',
  },
  filterPillsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: 10,
  },
  filterPill: {
    paddingVertical: 5,
    paddingHorizontal: 12,
    borderRadius: 8,
    backgroundColor: '#ffffff',
    borderWidth: 1,
    borderColor: '#e2e8f0',
  },
  filterPillActive: {
    backgroundColor: '#004b87',
    borderColor: '#004b87',
  },
  filterPillText: {
    fontSize: 10.5,
    fontWeight: '700',
    color: '#64748b',
  },
  filterPillTextActive: {
    color: '#ffffff',
  },
  retryAllBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#d97706',
    paddingVertical: 5,
    paddingHorizontal: 10,
    borderRadius: 8,
    gap: 4,
    marginLeft: 'auto',
  },
  retryAllBtnText: {
    fontSize: 10.5,
    fontWeight: '700',
    color: '#ffffff',
  },
  listContent: {
    paddingBottom: 28,
  },
  centerBox: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  loadingText: {
    fontSize: 12,
    color: '#64748b',
    marginTop: 8,
  },
  emptyBox: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 24,
  },
  emptyTitle: {
    fontSize: 14.5,
    fontWeight: '700',
    color: '#334155',
    marginTop: 10,
  },
  emptySub: {
    fontSize: 11,
    color: '#94a3b8',
    textAlign: 'center',
    marginTop: 3,
    lineHeight: 16,
  },
  refreshBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 14,
    paddingVertical: 7,
    paddingHorizontal: 16,
    borderRadius: 8,
    backgroundColor: '#004b87',
  },
  refreshBtnText: {
    color: '#ffffff',
    fontSize: 11.5,
    fontWeight: '700',
  },
  logCard: {
    backgroundColor: '#ffffff',
    borderRadius: 14,
    padding: 13,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: '#e2e8f0',
    ...Platform.select({
      ios: { shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.04, shadowRadius: 4 },
      android: { elevation: 1 },
    }),
  },
  logCardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
  },
  logStudentName: {
    fontSize: 13,
    fontWeight: '700',
    color: '#0f172a',
  },
  logParentPhone: {
    fontSize: 11,
    color: '#004b87',
    fontWeight: '600',
    marginTop: 1,
  },
  statusBadge: {
    paddingVertical: 3,
    paddingHorizontal: 7,
    borderRadius: 5,
  },
  statusBadgeText: {
    fontSize: 9,
    fontWeight: '800',
    letterSpacing: 0.3,
  },
  statusSuccess: {
    backgroundColor: '#ecfdf5',
  },
  statusSuccessText: {
    color: '#059669',
  },
  statusFailed: {
    backgroundColor: '#fee2e2',
  },
  statusFailedText: {
    color: '#dc2626',
  },
  statusPending: {
    backgroundColor: '#fffbeb',
  },
  statusPendingText: {
    color: '#d97706',
  },
  bubbleBox: {
    backgroundColor: '#f8fafc',
    borderRadius: 10,
    padding: 10,
    marginTop: 8,
    borderWidth: 1,
    borderColor: '#f1f5f9',
  },
  bubbleText: {
    fontSize: 11.5,
    color: '#334155',
    lineHeight: 16,
  },
  errorBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: '#fef2f2',
    paddingVertical: 4,
    paddingHorizontal: 8,
    borderRadius: 6,
    marginTop: 6,
    borderWidth: 1,
    borderColor: '#fee2e2',
  },
  errorText: {
    flex: 1,
    fontSize: 10,
    color: '#b91c1c',
  },
  logFooterRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 8,
  },
  timestampWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  timestampText: {
    fontSize: 10,
    color: '#94a3b8',
  },
  retrySingleBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#e6f0fa',
    paddingVertical: 4,
    paddingHorizontal: 8,
    borderRadius: 6,
    gap: 4,
  },
  retrySingleBtnText: {
    fontSize: 10.5,
    fontWeight: '700',
    color: '#004b87',
  },
});

export default SmsLogsScreen;