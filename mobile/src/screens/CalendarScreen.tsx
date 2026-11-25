// AttendSure Mobile - Calendar Screen
// File: D:\AttendSure_V3\mobile\src\screens\CalendarScreen.tsx

/**
 * AttendSure Mobile - School Calendar & Schedule Overrides
 * File: mobile/src/screens/CalendarScreen.tsx
 */

import React, { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Switch,
  TextInput,
  TouchableOpacity,
  ScrollView,
  ActivityIndicator,
  RefreshControl,
} from 'react-native';
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
import { canManageSchoolSetup } from '../utils/permissions';
import { confirmAction, isCanceledError, showNotice } from '../utils/helpers';

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

const isValidIsoDate = (dateStr: string): boolean => {
  const match = /^(\d{4})-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/.exec(dateStr);
  if (!match) return false;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const dt = new Date(year, month - 1, day);
  return dt.getFullYear() === year && dt.getMonth() === month - 1 && dt.getDate() === day;
};

export const CalendarScreen: React.FC = () => {
  const { user } = useAuth();
  const { palette, fonts } = useThemeMode();
  const styles = useMemo(() => createStyles(palette, fonts), [palette, fonts]);

  const isMounted = useRef<boolean>(true);
  const abortControllerRef = useRef<AbortController | null>(null);

  const isAdmin = canManageSchoolSetup(user);

  const [weekendRestEnabled, setWeekendRestEnabled] = useState<boolean>(true);
  const weekendRestRef = useRef<boolean>(true);
  const [editingExceptionId, setEditingExceptionId] = useState<number | null>(null);
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
          weekendRestRef.current = parsed.weekend_rest_enabled;
          setWeekendRestEnabled(parsed.weekend_rest_enabled);
        }
        if (Array.isArray(parsed.exceptions)) {
          setExceptions(parsed.exceptions);
        }
      }
    } catch {
      // Live network fetch will populate state
    }
  }, []);

  // 2. Stable Data Fetching Callback
  const fetchCalendarData = useCallback(async () => {
    abortControllerRef.current?.abort();
    const controller = new AbortController();
    abortControllerRef.current = controller;

    try {
      const res = await apiClient.get(ENDPOINTS.HOLIDAYS, {
        signal: controller.signal,
      });
      const payload = res.data;

      if (!isMounted.current || controller.signal.aborted) return;

      let nextWeekendRest = weekendRestRef.current;
      let nextExceptions: CalendarException[] = [];

      if (payload && typeof payload === 'object' && !Array.isArray(payload)) {
        if (typeof payload.weekend_rest_enabled === 'boolean') {
          nextWeekendRest = payload.weekend_rest_enabled;
          weekendRestRef.current = payload.weekend_rest_enabled;
          setWeekendRestEnabled(payload.weekend_rest_enabled);
        }
        nextExceptions = Array.isArray(payload.results) ? payload.results : [];
      } else if (Array.isArray(payload)) {
        nextExceptions = payload;
      }

      setExceptions(nextExceptions);

      AsyncStorage.setItem(
        CACHED_CALENDAR_KEY,
        JSON.stringify({
          weekend_rest_enabled: nextWeekendRest,
          exceptions: nextExceptions,
        })
      ).catch(() => {});
    } catch (err: unknown) {
      if (isCanceledError(err)) return;
    } finally {
      if (isMounted.current) {
        setLoading(false);
        setRefreshing(false);
      }
    }
  }, []);

  useEffect(() => {
    isMounted.current = true;
    void loadCachedCalendar().then(() => {
      if (isMounted.current) {
        void fetchCalendarData();
      }
    });

    return () => {
      isMounted.current = false;
      abortControllerRef.current?.abort();
    };
  }, [loadCachedCalendar, fetchCalendarData]);

  const onRefresh = useCallback(() => {
    setRefreshing(true);
    void fetchCalendarData();
  }, [fetchCalendarData]);

  // 3. Weekend Rest Toggle
  const handleToggleWeekendRest = async (value: boolean) => {
    if (!isAdmin) return;
    const previousValue = weekendRestEnabled;
    weekendRestRef.current = value;
    setWeekendRestEnabled(value);

    try {
      const res = await apiClient.patch(ENDPOINTS.HOLIDAYS, {
        weekend_rest_enabled: value,
      });
      if (isMounted.current && typeof res.data?.weekend_rest_enabled === 'boolean') {
        weekendRestRef.current = res.data.weekend_rest_enabled;
        setWeekendRestEnabled(res.data.weekend_rest_enabled);
      }
    } catch (err: unknown) {
      weekendRestRef.current = previousValue;
      if (isMounted.current) setWeekendRestEnabled(previousValue);
      showNotice(
        'Update Failed',
        getFriendlyErrorMessage(err, 'Could not save weekend rest setting.')
      );
    }
  };

  // 4. Input Sanitization & Override Submission
  const handleAddException = async () => {
    if (!isAdmin) {
      showNotice('Permission Required', 'Only school administrators can add calendar overrides.');
      return;
    }

    const cleanedReason = cleanText(exceptionReason, 255);
    const cleanedDate = cleanText(exceptionDate, 10);

    if (!cleanedReason) {
      showNotice('Required', 'Please enter a reason or school notice.');
      return;
    }

    if (!isValidIsoDate(cleanedDate)) {
      showNotice('Invalid Date', 'Please enter a valid date in YYYY-MM-DD format.');
      return;
    }

    setSubmitting(true);
    try {
      const payload = {
        type: selectedType,
        date: cleanedDate,
        reason: cleanedReason,
        affects_all_grades: true,
      };

      if (editingExceptionId) {
        const res = await apiClient.patch<CalendarException>(
          `${ENDPOINTS.HOLIDAYS}${encodeURIComponent(String(editingExceptionId))}/`,
          payload
        );
        if (!isMounted.current) return;
        if (res.data && res.data.id) {
          setExceptions((prev) => prev.map((i) => (i.id === res.data.id ? res.data : i)));
        } else {
          await fetchCalendarData();
        }
        setEditingExceptionId(null);
        setExceptionReason('');
        showNotice('Updated', 'Calendar override updated.');
      } else {
        const res = await apiClient.post<CalendarException>(ENDPOINTS.HOLIDAYS, payload);
        if (!isMounted.current) return;

        if (res.data && res.data.id) {
          setExceptions((prev) => [res.data, ...prev.filter((i) => i.id !== res.data.id)]);
        } else {
          await fetchCalendarData();
        }

        setExceptionReason('');
        showNotice('Saved', 'Calendar override saved.');
      }
    } catch (err: unknown) {
      if (!isMounted.current) return;
      showNotice(
        'Save Failed',
        getFriendlyErrorMessage(err, 'Could not save calendar override right now.')
      );
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
      await apiClient.delete(`${ENDPOINTS.HOLIDAYS}${encodeURIComponent(String(id))}/`);
      if (isMounted.current) {
        setExceptions((prev) => prev.filter((item) => item.id !== id));
      }
    } catch (err: unknown) {
      showNotice('Error', getFriendlyErrorMessage(err, 'Could not remove this calendar override.'));
    }
  };

  const handleDeleteException = (id: number) => {
    if (!isAdmin) {
      showNotice('Permission Required', 'Only school administrators can remove overrides.');
      return;
    }

    confirmAction(
      'Confirm Delete',
      'Remove this calendar override?',
      'Delete',
      () => void executeDeleteException(id)
    );
  };

  const getBadgeColors = (type: CalendarException['type']) => {
    if (type === 'SUSPENSION') return { bg: palette.dangerLight, text: palette.danger };
    if (type === 'HOLIDAY') return { bg: palette.warningLight, text: palette.warning };
    return { bg: palette.infoLight, text: palette.info };
  };

  return (
    <View style={styles.container}>
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
        {/* Weekend Rest Card */}
        <View style={styles.card}>
          <View style={styles.weekendCardRow}>
            <View style={styles.cardIconBox}>
              <Ionicons name="calendar" size={20} color={palette.primary} />
            </View>
            <View style={{ flex: 1, marginRight: 10 }}>
              <Text style={styles.cardHeading}>Weekend Rest</Text>
              <Text style={styles.cardDetailText}>
                Saturdays and Sundays are excluded from required attendance logging
              </Text>
            </View>
            {isAdmin ? (
              <Switch
                value={weekendRestEnabled}
                onValueChange={(val) => void handleToggleWeekendRest(val)}
                trackColor={{ false: palette.borderStrong, true: palette.primarySoft }}
                thumbColor={weekendRestEnabled ? palette.buttonBg : palette.surface}
              />
            ) : (
              <View
                style={[
                  styles.readOnlyPill,
                  {
                    backgroundColor: weekendRestEnabled
                      ? palette.successLight
                      : palette.surfaceSubtle,
                  },
                ]}
              >
                <Text
                  style={[
                    styles.readOnlyPillText,
                    { color: weekendRestEnabled ? palette.success : palette.textMuted },
                  ]}
                >
                  {weekendRestEnabled ? 'ACTIVE' : 'OFF'}
                </Text>
              </View>
            )}
          </View>
        </View>

        {/* Admin Form: Add / Edit Override */}
        {isAdmin ? (
          <View style={styles.card}>
            <Text style={styles.sectionHeaderTitle}>
              {editingExceptionId ? 'EDIT SCHEDULE OVERRIDE' : 'ADD SCHEDULE OVERRIDE'}
            </Text>

            <View style={styles.fieldRow}>
              <Text style={styles.fieldLabel}>Effective Date (YYYY-MM-DD)</Text>
              <View style={styles.inputBox}>
                <Ionicons
                  name="calendar-outline"
                  size={16}
                  color={palette.textMuted}
                  style={{ marginRight: 8 }}
                />
                <TextInput
                  style={styles.inputText}
                  value={exceptionDate}
                  onChangeText={setExceptionDate}
                  placeholder="YYYY-MM-DD"
                  placeholderTextColor={palette.textMuted}
                  autoCapitalize="none"
                  maxLength={10}
                />
              </View>
            </View>

            <View style={styles.fieldRow}>
              <Text style={styles.fieldLabel}>Category</Text>
              <View style={styles.typeSelectorRow}>
                {(['SUSPENSION', 'HOLIDAY', 'EVENT'] as const).map((type) => {
                  const active = selectedType === type;
                  return (
                    <TouchableOpacity
                      key={type}
                      style={[styles.typePill, active && styles.typePillActive]}
                      onPress={() => setSelectedType(type)}
                      activeOpacity={0.8}
                    >
                      <Text style={[styles.typePillText, active && styles.typePillTextActive]}>
                        {type}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </View>
            </View>

            <View style={styles.fieldRow}>
              <Text style={styles.fieldLabel}>Reason / School Notice</Text>
              <View style={[styles.inputBox, { height: 44 }]}>
                <Ionicons
                  name="document-text-outline"
                  size={16}
                  color={palette.textMuted}
                  style={{ marginRight: 8 }}
                />
                <TextInput
                  style={styles.inputText}
                  placeholder="Enter official reason or notice"
                  placeholderTextColor={palette.textMuted}
                  value={exceptionReason}
                  onChangeText={setExceptionReason}
                  maxLength={255}
                />
              </View>
            </View>

            <TouchableOpacity
              style={[styles.addOverrideBtn, submitting && styles.btnDisabled]}
              onPress={() => void handleAddException()}
              disabled={submitting}
              activeOpacity={0.85}
            >
              {submitting ? (
                <ActivityIndicator size="small" color={palette.onPrimary} />
              ) : (
                <>
                  <Ionicons
                    name="add-circle-outline"
                    size={16}
                    color={palette.onPrimary}
                    style={{ marginRight: 6 }}
                  />
                  <Text style={styles.addOverrideBtnText}>
                    {editingExceptionId ? 'Save Changes' : 'Save Override'}
                  </Text>
                </>
              )}
            </TouchableOpacity>
            {editingExceptionId ? (
              <TouchableOpacity
                style={{ marginTop: 8, alignItems: 'center', paddingVertical: 6 }}
                onPress={() => {
                  setEditingExceptionId(null);
                  setExceptionReason('');
                  setExceptionDate(getLocalTodayDateString());
                }}
              >
                <Text style={{ fontSize: fonts.xs, fontWeight: fonts.weight.bold, color: palette.textSecondary }}>
                  Cancel Edit
                </Text>
              </TouchableOpacity>
            ) : null}
          </View>
        ) : (
          <View style={styles.infoBanner}>
            <Ionicons name="information-circle-outline" size={18} color={palette.primary} />
            <Text style={styles.infoBannerText}>
              Class suspensions, holidays, and schedule overrides are managed by the School Admin.
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

          {loading && exceptions.length === 0 ? (
            <ActivityIndicator size="small" color={palette.primary} style={{ marginVertical: 14 }} />
          ) : exceptions.length === 0 ? (
            <Text style={styles.noExceptionsText}>No active date overrides set.</Text>
          ) : (
            exceptions.map((item) => {
              const badge = getBadgeColors(item.type);
              return (
                <View key={String(item.id)} style={styles.exceptionItemRow}>
                  <View style={[styles.typeBadge, { backgroundColor: badge.bg }]}>
                    <Text style={[styles.typeBadgeText, { color: badge.text }]}>{item.type}</Text>
                  </View>

                  <View style={{ flex: 1, marginHorizontal: 12 }}>
                    <Text style={styles.exceptionDateText}>{item.date}</Text>
                    <Text style={styles.exceptionReasonText}>{item.reason}</Text>
                  </View>

                  {isAdmin && (
                    <View style={{ flexDirection: 'row', gap: 6 }}>
                      <TouchableOpacity
                        onPress={() => {
                          setEditingExceptionId(item.id);
                          setSelectedType(item.type || 'HOLIDAY');
                          setExceptionDate(item.date || getLocalTodayDateString());
                          setExceptionReason(item.reason || '');
                        }}
                        style={styles.deleteBtn}
                        activeOpacity={0.7}
                        accessibilityLabel="Edit override"
                      >
                        <Ionicons name="create-outline" size={16} color={palette.primary} />
                      </TouchableOpacity>
                      <TouchableOpacity
                        onPress={() => handleDeleteException(item.id)}
                        style={styles.deleteBtn}
                        activeOpacity={0.7}
                        accessibilityLabel="Delete override"
                      >
                        <Ionicons name="trash-outline" size={16} color={palette.danger} />
                      </TouchableOpacity>
                    </View>
                  )}
                </View>
              );
            })
          )}
        </View>
      </ScrollView>
    </View>
  );
};

const createStyles = (palette: ThemePalette, fonts: ReturnType<typeof useThemeMode>['fonts']) =>
  StyleSheet.create({
    container: { flex: 1, backgroundColor: palette.background },
    scrollContent: { paddingHorizontal: 16, paddingTop: 12, paddingBottom: 115, gap: 12 },
    card: {
      backgroundColor: palette.surface,
      borderRadius: 14,
      padding: 14,
      borderWidth: 1,
      borderColor: palette.border,
    },
    weekendCardRow: { flexDirection: 'row', alignItems: 'center' },
    cardIconBox: {
      width: 38,
      height: 38,
      borderRadius: 10,
      backgroundColor: palette.primarySoft,
      alignItems: 'center',
      justifyContent: 'center',
      marginRight: 12,
    },
    cardHeading: { fontSize: fonts.base, fontWeight: fonts.weight.bold, color: palette.textPrimary },
    cardDetailText: { fontSize: fonts.xs, color: palette.textSecondary, marginTop: 2, lineHeight: 15 },
    readOnlyPill: { paddingVertical: 4, paddingHorizontal: 8, borderRadius: 6 },
    readOnlyPillText: { fontSize: 9.5, fontWeight: fonts.weight.extrabold },
    infoBanner: {
      flexDirection: 'row',
      alignItems: 'center',
      backgroundColor: palette.primarySoft,
      borderRadius: 12,
      padding: 12,
      borderWidth: 1,
      borderColor: palette.border,
      gap: 8,
    },
    infoBannerText: { flex: 1, fontSize: fonts.xs, color: palette.textPrimary, lineHeight: 16 },
    sectionHeaderTitle: {
      fontSize: fonts.xs,
      fontWeight: fonts.weight.extrabold,
      color: palette.primary,
      letterSpacing: 0.5,
      marginBottom: 10,
    },
    listHeaderRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      marginBottom: 4,
    },
    listSubText: { fontSize: fonts.xxs, color: palette.textMuted, marginBottom: 10 },
    fieldRow: { marginBottom: 10 },
    fieldLabel: { fontSize: fonts.xs, fontWeight: fonts.weight.bold, color: palette.textSecondary, marginBottom: 5 },
    inputBox: {
      flexDirection: 'row',
      alignItems: 'center',
      backgroundColor: palette.surfaceSubtle,
      borderRadius: 10,
      borderWidth: 1,
      borderColor: palette.borderStrong,
      paddingHorizontal: 12,
      height: 42,
    },
    inputText: { flex: 1, fontSize: fonts.sm, color: palette.textPrimary },
    typeSelectorRow: { flexDirection: 'row', gap: 6 },
    typePill: {
      flex: 1,
      alignItems: 'center',
      paddingVertical: 8,
      borderRadius: 8,
      backgroundColor: palette.surfaceSubtle,
      borderWidth: 1,
      borderColor: palette.border,
    },
    typePillActive: { backgroundColor: palette.buttonBg, borderColor: palette.buttonBg },
    typePillText: { fontSize: fonts.xxs, fontWeight: fonts.weight.bold, color: palette.textSecondary },
    typePillTextActive: { color: palette.onPrimary },
    addOverrideBtn: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: palette.buttonBg,
      paddingVertical: 11,
      borderRadius: 10,
      marginTop: 4,
    },
    addOverrideBtnText: { fontSize: fonts.sm, fontWeight: fonts.weight.bold, color: palette.onPrimary },
    btnDisabled: { opacity: 0.6 },
    noExceptionsText: { fontSize: fonts.xs, color: palette.textMuted, textAlign: 'center', paddingVertical: 14 },
    exceptionItemRow: {
      flexDirection: 'row',
      alignItems: 'center',
      paddingVertical: 10,
      borderBottomWidth: 1,
      borderBottomColor: palette.border,
    },
    typeBadge: { paddingVertical: 3, paddingHorizontal: 7, borderRadius: 6 },
    typeBadgeText: { fontWeight: fonts.weight.extrabold, fontSize: 9, letterSpacing: 0.3 },
    exceptionDateText: { fontSize: fonts.sm, fontWeight: fonts.weight.bold, color: palette.textPrimary },
    exceptionReasonText: { fontSize: fonts.xs, color: palette.textSecondary, marginTop: 1 },
    deleteBtn: { padding: 6 },
  });

export default CalendarScreen;
