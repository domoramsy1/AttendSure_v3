// D:\AttendSure_V3\mobile\src\screens\CalendarScreen.tsx

import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Switch,
  TextInput,
  TouchableOpacity,
  ScrollView,
  Alert,
  ActivityIndicator,
  RefreshControl,
  Platform,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { apiClient } from '../api/client';
import { useAuth } from '../context/AuthContext';
import { COLORS } from '../constants/theme';

const CACHED_CALENDAR_KEY = 'attendsure_cached_calendar_data';

interface CalendarException {
  id: number;
  type: 'SUSPENSION' | 'HOLIDAY' | 'EVENT';
  date: string;
  reason: string;
  affects_all_grades?: boolean;
  created_at?: string;
}

const getLocalTodayDateString = (): string => {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

const showAlert = (title: string, message: string) => {
  if (Platform.OS === 'web' && typeof window !== 'undefined') {
    window.alert(`${title}: ${message}`);
  } else {
    Alert.alert(title, message);
  }
};

export const CalendarScreen: React.FC = () => {
  const { user } = useAuth();
  const isMounted = useRef<boolean>(true);
  const abortControllerRef = useRef<AbortController | null>(null);

  const currentUser = user as Record<string, any> | null;
  const rawRole = String(currentUser?.role || currentUser?.system_role || '').trim().toUpperCase();
  const isAdmin =
    rawRole === 'ADMIN' ||
    rawRole === 'PRINCIPAL' ||
    (Boolean(currentUser?.is_superuser) && rawRole !== 'FACULTY');

  const [weekendRestEnabled, setWeekendRestEnabled] = useState<boolean>(true);
  const [selectedType, setSelectedType] = useState<'SUSPENSION' | 'HOLIDAY' | 'EVENT'>('SUSPENSION');
  const [exceptionDate, setExceptionDate] = useState<string>(getLocalTodayDateString);
  const [exceptionReason, setExceptionReason] = useState<string>('');
  const [exceptions, setExceptions] = useState<CalendarException[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [refreshing, setRefreshing] = useState<boolean>(false);
  const [submitting, setSubmitting] = useState<boolean>(false);

  // 1. Cache-First Initialization
  const loadCachedCalendar = useCallback(async () => {
    try {
      const cached = await AsyncStorage.getItem(CACHED_CALENDAR_KEY);
      if (cached && isMounted.current) {
        const parsed = JSON.parse(cached);
        if (typeof parsed.weekend_rest_enabled === 'boolean') {
          setWeekendRestEnabled(parsed.weekend_rest_enabled);
        }
        if (Array.isArray(parsed.exceptions)) {
          setExceptions(parsed.exceptions);
        }
      }
    } catch {
      // Continue to live network fetch
    }
  }, []);

  // 2. Fast Data Fetching with AbortController
  const fetchCalendarData = useCallback(async () => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }
    const controller = new AbortController();
    abortControllerRef.current = controller;

    try {
      const res = await apiClient.get('/calendar/exceptions/', {
        signal: controller.signal,
      });
      const payload = res.data;

      if (!isMounted.current) return;

      let nextWeekendRest = weekendRestEnabled;
      let nextExceptions: CalendarException[] = [];

      if (payload && typeof payload === 'object' && !Array.isArray(payload)) {
        if (typeof payload.weekend_rest_enabled === 'boolean') {
          nextWeekendRest = payload.weekend_rest_enabled;
          setWeekendRestEnabled(payload.weekend_rest_enabled);
        }
        nextExceptions = Array.isArray(payload.results) ? payload.results : [];
      } else if (Array.isArray(payload)) {
        nextExceptions = payload;
      }

      setExceptions(nextExceptions);

      // Persist clean cache
      await AsyncStorage.setItem(
        CACHED_CALENDAR_KEY,
        JSON.stringify({
          weekend_rest_enabled: nextWeekendRest,
          exceptions: nextExceptions,
        })
      );
    } catch (err: any) {
      // Ignore normal request cancellations
    } finally {
      if (isMounted.current) {
        setLoading(false);
        setRefreshing(false);
      }
    }
  }, [weekendRestEnabled]);

  useEffect(() => {
    isMounted.current = true;
    loadCachedCalendar().then(() => {
      fetchCalendarData();
    });

    return () => {
      isMounted.current = false;
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
      }
    };
  }, [loadCachedCalendar, fetchCalendarData]);

  const onRefresh = useCallback(() => {
    setRefreshing(true);
    fetchCalendarData();
  }, [fetchCalendarData]);

  // 3. Weekend Rest Toggle with Rollback Protection
  const handleToggleWeekendRest = async (value: boolean) => {
    if (!isAdmin) return;
    const previousValue = weekendRestEnabled;
    setWeekendRestEnabled(value);

    try {
      const res = await apiClient.patch('/calendar/exceptions/', {
        weekend_rest_enabled: value,
      });
      if (typeof res.data?.weekend_rest_enabled === 'boolean') {
        setWeekendRestEnabled(res.data.weekend_rest_enabled);
      }
    } catch {
      setWeekendRestEnabled(previousValue);
      showAlert('Update Failed', 'Could not save weekend rest setting.');
    }
  };

  // 4. Input Sanitization & Override Submission
  const handleAddException = async () => {
    if (!isAdmin) {
      showAlert('Denied', 'Only school administrators can set calendar overrides.');
      return;
    }

    const cleanReason = exceptionReason.replace(/[\r\n\t]/g, ' ').trim();
    const cleanDate = exceptionDate.trim();

    if (!cleanReason) {
      showAlert('Required', 'Please enter a description or reason.');
      return;
    }

    if (cleanReason.length > 255) {
      showAlert('Invalid Input', 'Reason cannot exceed 255 characters.');
      return;
    }

    // Strict Date Validation (YYYY-MM-DD)
    const dateRegex = /^\d{4}-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/;
    if (!dateRegex.test(cleanDate)) {
      showAlert('Invalid Date', 'Date format must be YYYY-MM-DD.');
      return;
    }

    setSubmitting(true);
    try {
      const payload = {
        type: selectedType,
        date: cleanDate,
        reason: cleanReason,
        affects_all_grades: true,
      };

      const res = await apiClient.post('/calendar/exceptions/', payload);
      if (res.data && res.data.id) {
        setExceptions((prev) => [res.data, ...prev.filter((i) => i.id !== res.data.id)]);
      } else {
        await fetchCalendarData();
      }

      setExceptionReason('');
      showAlert('Saved', 'Calendar override saved.');
    } catch (err: any) {
      const rawError = String(err?.response?.data?.error || err?.response?.data?.detail || '');
      const safeError = rawError.includes('Traceback')
        ? 'Could not save override. Please check server.'
        : rawError || 'Failed to save calendar override.';
      showAlert('Save Failed', safeError);
    } finally {
      if (isMounted.current) {
        setSubmitting(false);
      }
    }
  };

  // 5. Deletion Handler with Numeric ID Validation
  const executeDeleteException = async (id: number) => {
    if (!Number.isInteger(id) || id <= 0) return;

    try {
      await apiClient.delete(`/calendar/exceptions/${id}/`);
      setExceptions((prev) => prev.filter((item) => item.id !== id));
    } catch {
      showAlert('Error', 'Could not remove override.');
    }
  };

  const handleDeleteException = (id: number) => {
    if (!isAdmin) {
      showAlert('Denied', 'Only school administrators can remove overrides.');
      return;
    }

    if (Platform.OS === 'web' && typeof window !== 'undefined') {
      if (window.confirm('Remove this calendar override?')) {
        executeDeleteException(id);
      }
      return;
    }

    Alert.alert('Confirm Delete', 'Remove this calendar override?', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: () => executeDeleteException(id),
      },
    ]);
  };

  return (
    <SafeAreaView style={styles.container} edges={['top', 'left', 'right']}>
      {/* Header */}
      <View style={styles.topHeader}>
        <View>
          <Text style={styles.screenTitle}>Calendar</Text>
          <Text style={styles.screenSub}>
            {isAdmin ? 'Date Overrides & Schedules' : 'Schedules & Memorandums'}
          </Text>
        </View>
        <View style={[styles.headerBadge, !isAdmin && styles.headerBadgeFaculty]}>
          <View style={[styles.activeDot, !isAdmin && { backgroundColor: '#16a34a' }]} />
          <Text style={[styles.headerBadgeText, !isAdmin && { color: '#16a34a' }]}>
            {isAdmin ? 'ADMIN' : 'DEPED'}
          </Text>
        </View>
      </View>

      <ScrollView
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} colors={[COLORS.primary]} />
        }
      >
        {/* Weekend Rest Card */}
        <View style={styles.card}>
          <View style={styles.weekendCardRow}>
            <View style={styles.cardIconBox}>
              <Ionicons name="calendar" size={20} color={COLORS.primary} />
            </View>
            <View style={{ flex: 1, marginRight: 10 }}>
              <Text style={styles.cardHeading}>Weekend Rest</Text>
              <Text style={styles.cardDetailText}>
                Saturdays and Sundays are excluded from attendance logging
              </Text>
            </View>
            {isAdmin ? (
              <Switch
                value={weekendRestEnabled}
                onValueChange={handleToggleWeekendRest}
                trackColor={{ false: '#cbd5e1', true: '#b8d6f0' }}
                thumbColor={weekendRestEnabled ? COLORS.primary : '#f8fafc'}
              />
            ) : (
              <View style={styles.readOnlyPill}>
                <Text style={styles.readOnlyPillText}>
                  {weekendRestEnabled ? 'ACTIVE' : 'OFF'}
                </Text>
              </View>
            )}
          </View>
        </View>

        {/* Admin Form: Add Override */}
        {isAdmin ? (
          <View style={styles.card}>
            <Text style={styles.sectionHeaderTitle}>ADD OVERRIDE</Text>

            <View style={styles.fieldRow}>
              <Text style={styles.fieldLabel}>Effective Date (YYYY-MM-DD)</Text>
              <View style={styles.inputBox}>
                <Ionicons name="calendar-outline" size={16} color="#64748b" style={{ marginRight: 8 }} />
                <TextInput
                  style={styles.inputText}
                  value={exceptionDate}
                  onChangeText={setExceptionDate}
                  placeholder="YYYY-MM-DD"
                  placeholderTextColor="#94a3b8"
                  autoCapitalize="none"
                  maxLength={10}
                />
              </View>
            </View>

            <View style={styles.fieldRow}>
              <Text style={styles.fieldLabel}>Category</Text>
              <View style={styles.typeSelectorRow}>
                {(['SUSPENSION', 'HOLIDAY', 'EVENT'] as const).map((type) => (
                  <TouchableOpacity
                    key={type}
                    style={[styles.typePill, selectedType === type && styles.typePillActive]}
                    onPress={() => setSelectedType(type)}
                    activeOpacity={0.8}
                  >
                    <Text style={[styles.typePillText, selectedType === type && styles.typePillTextActive]}>
                      {type}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>
            </View>

            <View style={styles.fieldRow}>
              <Text style={styles.fieldLabel}>Reason / Memorandum</Text>
              <View style={[styles.inputBox, { height: 44 }]}>
                <Ionicons name="document-text-outline" size={16} color="#64748b" style={{ marginRight: 8 }} />
                <TextInput
                  style={styles.inputText}
                  placeholder="Official memorandum or reason"
                  placeholderTextColor="#94a3b8"
                  value={exceptionReason}
                  onChangeText={setExceptionReason}
                  maxLength={255}
                />
              </View>
            </View>

            <TouchableOpacity
              style={[styles.addOverrideBtn, submitting && styles.btnDisabled]}
              onPress={handleAddException}
              disabled={submitting}
              activeOpacity={0.85}
            >
              {submitting ? (
                <ActivityIndicator size="small" color="#ffffff" />
              ) : (
                <>
                  <Ionicons name="add-circle-outline" size={16} color="#ffffff" style={{ marginRight: 6 }} />
                  <Text style={styles.addOverrideBtnText}>Save</Text>
                </>
              )}
            </TouchableOpacity>
          </View>
        ) : (
          <View style={styles.infoBanner}>
            <Ionicons name="information-circle-outline" size={18} color="#004b87" />
            <Text style={styles.infoBannerText}>
              Official class suspensions and calendar overrides are managed by administrators.
            </Text>
          </View>
        )}

        {/* Active Overrides List */}
        <View style={styles.card}>
          <View style={styles.listHeaderRow}>
            <Text style={styles.sectionHeaderTitle}>
              ACTIVE OVERRIDES ({exceptions.length})
            </Text>
            <Text style={styles.listSubText}>Overrides regular schedule</Text>
          </View>

          {loading ? (
            <ActivityIndicator size="small" color={COLORS.primary} style={{ marginVertical: 14 }} />
          ) : exceptions.length === 0 ? (
            <Text style={styles.noExceptionsText}>No active date overrides set.</Text>
          ) : (
            exceptions.map((item) => (
              <View key={String(item.id)} style={styles.exceptionItemRow}>
                <View
                  style={[
                    styles.typeBadge,
                    item.type === 'SUSPENSION'
                      ? styles.badgeSuspension
                      : item.type === 'HOLIDAY'
                      ? styles.badgeHoliday
                      : styles.badgeEvent,
                  ]}
                >
                  <Text
                    style={[
                      styles.typeBadgeText,
                      item.type === 'SUSPENSION'
                        ? styles.textSuspension
                        : item.type === 'HOLIDAY'
                        ? styles.textHoliday
                        : styles.textEvent,
                    ]}
                  >
                    {item.type}
                  </Text>
                </View>

                <View style={{ flex: 1, marginHorizontal: 12 }}>
                  <Text style={styles.exceptionDateText}>{item.date}</Text>
                  <Text style={styles.exceptionReasonText}>{item.reason}</Text>
                </View>

                {isAdmin && (
                  <TouchableOpacity
                    onPress={() => handleDeleteException(item.id)}
                    style={styles.deleteBtn}
                    activeOpacity={0.7}
                  >
                    <Ionicons name="trash-outline" size={16} color="#ef4444" />
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
    paddingHorizontal: 16,
    paddingVertical: 12,
    backgroundColor: '#ffffff',
    borderBottomWidth: 1,
    borderBottomColor: '#e2e8f0',
  },
  screenTitle: { fontSize: 17, fontWeight: '800', color: '#003460', letterSpacing: -0.3 },
  screenSub: { fontSize: 10.5, color: '#64748b', marginTop: 1 },
  headerBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#e6f0fa',
    paddingVertical: 4,
    paddingHorizontal: 8,
    borderRadius: 12,
    gap: 4,
  },
  headerBadgeFaculty: {
    backgroundColor: '#dcfce7',
  },
  activeDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: '#004b87' },
  headerBadgeText: { fontSize: 9, fontWeight: '800', color: '#004b87', letterSpacing: 0.3 },
  scrollContent: { paddingHorizontal: 16, paddingTop: 12, paddingBottom: 110, gap: 12 },
  card: { backgroundColor: '#ffffff', borderRadius: 14, padding: 14, borderWidth: 1, borderColor: '#e2e8f0' },
  weekendCardRow: { flexDirection: 'row', alignItems: 'center' },
  cardIconBox: {
    width: 38,
    height: 38,
    borderRadius: 9,
    backgroundColor: '#e6f0fa',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  cardHeading: { fontSize: 13, fontWeight: '700', color: '#0f172a' },
  cardDetailText: { fontSize: 10.5, color: '#64748b', marginTop: 2, lineHeight: 14 },
  readOnlyPill: { backgroundColor: '#dcfce7', paddingVertical: 4, paddingHorizontal: 8, borderRadius: 6 },
  readOnlyPillText: { fontSize: 9, fontWeight: '800', color: '#16a34a' },
  infoBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#eff6ff',
    borderRadius: 12,
    padding: 12,
    borderWidth: 1,
    borderColor: '#bfdbfe',
    gap: 8,
  },
  infoBannerText: { flex: 1, fontSize: 11, color: '#1e40af', lineHeight: 15 },
  sectionHeaderTitle: { fontSize: 10.5, fontWeight: '800', color: '#004b87', letterSpacing: 0.5, marginBottom: 10 },
  listHeaderRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 },
  listSubText: { fontSize: 9.5, color: '#94a3b8', marginBottom: 10 },
  fieldRow: { marginBottom: 10 },
  fieldLabel: { fontSize: 10.5, fontWeight: '700', color: '#475569', marginBottom: 5 },
  inputBox: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#f8fafc',
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#cbd5e1',
    paddingHorizontal: 12,
    height: 40,
  },
  inputText: { flex: 1, fontSize: 12.5, color: '#0f172a' },
  typeSelectorRow: { flexDirection: 'row', gap: 6 },
  typePill: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: 7,
    borderRadius: 8,
    backgroundColor: '#f1f5f9',
    borderWidth: 1,
    borderColor: '#e2e8f0',
  },
  typePillActive: { backgroundColor: '#004b87', borderColor: '#004b87' },
  typePillText: { fontSize: 10, fontWeight: '700', color: '#64748b' },
  typePillTextActive: { color: '#ffffff' },
  addOverrideBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#004b87',
    paddingVertical: 10,
    borderRadius: 10,
    marginTop: 4,
  },
  addOverrideBtnText: { fontSize: 12, fontWeight: '700', color: '#ffffff' },
  btnDisabled: { opacity: 0.6 },
  noExceptionsText: { fontSize: 11, color: '#94a3b8', textAlign: 'center', paddingVertical: 12 },
  exceptionItemRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 9,
    borderBottomWidth: 1,
    borderBottomColor: '#f1f5f9',
  },
  typeBadge: { paddingVertical: 3, paddingHorizontal: 7, borderRadius: 5 },
  badgeSuspension: { backgroundColor: '#fee2e2' },
  textSuspension: { color: '#dc2626', fontWeight: '800', fontSize: 8 },
  badgeHoliday: { backgroundColor: '#fef3c7' },
  textHoliday: { color: '#d97706', fontWeight: '800', fontSize: 8 },
  badgeEvent: { backgroundColor: '#e0f2fe' },
  textEvent: { color: '#0284c7', fontWeight: '800', fontSize: 8 },
  typeBadgeText: { letterSpacing: 0.3 },
  exceptionDateText: { fontSize: 11.5, fontWeight: '700', color: '#0f172a' },
  exceptionReasonText: { fontSize: 10.5, color: '#64748b', marginTop: 1 },
  deleteBtn: { padding: 6 },
});

export default CalendarScreen;