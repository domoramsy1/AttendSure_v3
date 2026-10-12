// mobile/src/screens/CalendarScreen.tsx

import React, { useState, useEffect, useCallback } from 'react';
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
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { apiClient } from '../api/client';
import { COLORS } from '../constants/theme';

interface CalendarException {
  id: string | number;
  type: 'SUSPENSION' | 'HOLIDAY' | 'EVENT';
  date: string;
  reason: string;
}

export const CalendarScreen: React.FC = () => {
  const [weekendRestEnabled, setWeekendRestEnabled] = useState<boolean>(true);
  const [selectedType, setSelectedType] = useState<'SUSPENSION' | 'HOLIDAY' | 'EVENT'>('SUSPENSION');
  const [exceptionDate, setExceptionDate] = useState<string>(() => new Date().toISOString().split('T')[0]);
  const [exceptionReason, setExceptionReason] = useState<string>('');
  const [exceptions, setExceptions] = useState<CalendarException[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [submitting, setSubmitting] = useState<boolean>(false);

  const fetchExceptions = useCallback(async () => {
    try {
      const res = await apiClient.get('/api/calendar/exceptions/');
      const data = res.data?.results || res.data || [];
      setExceptions(Array.isArray(data) ? data : []);
    } catch {
      setExceptions([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchExceptions();
  }, [fetchExceptions]);

  const handleAddException = async () => {
    if (!exceptionReason.trim()) {
      Alert.alert('Missing Detail', 'Please enter a description or reason for this calendar override.');
      return;
    }

    setSubmitting(true);
    try {
      const payload = {
        type: selectedType,
        date: exceptionDate.trim(),
        reason: exceptionReason.trim(),
      };
      const res = await apiClient.post('/api/calendar/exceptions/', payload);
      const createdItem = res.data || { id: Date.now(), ...payload };
      setExceptions((prev) => [createdItem, ...prev]);
      setExceptionReason('');
      Alert.alert('Exception Saved', 'The date override has been saved to the school calendar.');
    } catch (err: any) {
      const msg = err?.response?.data?.error || 'Could not save date exception.';
      Alert.alert('Save Failed', msg);
    } finally {
      setSubmitting(false);
    }
  };

  const handleDeleteException = async (id: string | number) => {
    try {
      await apiClient.delete(`/api/calendar/exceptions/${id}/`);
      setExceptions((prev) => prev.filter((item) => item.id !== id));
    } catch {
      // Local removal fallback
      setExceptions((prev) => prev.filter((item) => item.id !== id));
    }
  };

  return (
    <SafeAreaView style={styles.container} edges={['top', 'left', 'right']}>
      <View style={styles.topHeader}>
        <View>
          <Text style={styles.screenTitle}>Class Calendar</Text>
          <Text style={styles.screenSub}>Attendance Schedules & Official Date Overrides</Text>
        </View>
        <View style={styles.headerBadge}>
          <View style={styles.activeDot} />
          <Text style={styles.headerBadgeText}>DEPED CALENDAR</Text>
        </View>
      </View>

      <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
        {/* 1. Weekend Auto-Rest Switch */}
        <View style={styles.card}>
          <View style={styles.weekendCardRow}>
            <View style={styles.cardIconBox}>
              <Ionicons name="calendar" size={22} color={COLORS.primary} />
            </View>
            <View style={{ flex: 1, marginRight: 10 }}>
              <Text style={styles.cardHeading}>Automatic Weekend Rest Days</Text>
              <Text style={styles.cardDetailText}>
                Excludes Saturdays and Sundays from mandatory classroom attendance logging
              </Text>
            </View>
            <Switch
              value={weekendRestEnabled}
              onValueChange={setWeekendRestEnabled}
              trackColor={{ false: '#cbd5e1', true: '#b8d6f0' }}
              thumbColor={weekendRestEnabled ? COLORS.primary : '#f8fafc'}
            />
          </View>
        </View>

        {/* 2. Add Override Form Card */}
        <View style={styles.card}>
          <Text style={styles.sectionHeaderTitle}>ADD DATE OVERRIDE / SUSPENSION</Text>

          <View style={styles.fieldRow}>
            <Text style={styles.fieldLabel}>Effective Date (YYYY-MM-DD)</Text>
            <View style={styles.inputBox}>
              <Ionicons name="calendar-outline" size={17} color="#64748b" style={{ marginRight: 8 }} />
              <TextInput
                style={styles.inputText}
                value={exceptionDate}
                onChangeText={setExceptionDate}
                placeholder="YYYY-MM-DD"
                placeholderTextColor="#94a3b8"
              />
            </View>
          </View>

          <View style={styles.fieldRow}>
            <Text style={styles.fieldLabel}>Exception Category</Text>
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
            <Text style={styles.fieldLabel}>Reason / Official Memorandum</Text>
            <View style={[styles.inputBox, { height: 48 }]}>
              <Ionicons name="document-text-outline" size={17} color="#64748b" style={{ marginRight: 8 }} />
              <TextInput
                style={styles.inputText}
                placeholder="e.g. Typhoon Alert, Heat Index > 42°C, Intramurals"
                placeholderTextColor="#94a3b8"
                value={exceptionReason}
                onChangeText={setExceptionReason}
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
                <Ionicons name="add-circle-outline" size={18} color="#ffffff" style={{ marginRight: 6 }} />
                <Text style={styles.addOverrideBtnText}>Save Calendar Override</Text>
              </>
            )}
          </TouchableOpacity>
        </View>

        {/* 3. Active Exceptions List */}
        <View style={styles.card}>
          <View style={styles.listHeaderRow}>
            <Text style={styles.sectionHeaderTitle}>
              ACTIVE DATE OVERRIDES ({exceptions.length})
            </Text>
            <Text style={styles.listSubText}>Takes precedence over regular classes</Text>
          </View>

          {loading ? (
            <ActivityIndicator size="small" color={COLORS.primary} style={{ marginVertical: 14 }} />
          ) : exceptions.length === 0 ? (
            <Text style={styles.noExceptionsText}>No special date overrides currently set in database.</Text>
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

                <TouchableOpacity
                  onPress={() => handleDeleteException(item.id)}
                  style={styles.deleteBtn}
                  activeOpacity={0.7}
                >
                  <Ionicons name="trash-outline" size={17} color="#ef4444" />
                </TouchableOpacity>
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
  topHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 18, paddingVertical: 12, backgroundColor: '#ffffff', borderBottomWidth: 1, borderBottomColor: '#e2e8f0' },
  screenTitle: { fontSize: 18, fontWeight: '800', color: '#003460', letterSpacing: -0.3 },
  screenSub: { fontSize: 10.5, color: '#64748b', marginTop: 1 },
  headerBadge: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#e6f0fa', paddingVertical: 4, paddingHorizontal: 8, borderRadius: 12, gap: 4 },
  activeDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: '#004b87' },
  headerBadgeText: { fontSize: 9, fontWeight: '800', color: '#004b87', letterSpacing: 0.3 },
  scrollContent: { paddingHorizontal: 16, paddingTop: 12, paddingBottom: 28, gap: 12 },
  card: { backgroundColor: '#ffffff', borderRadius: 16, padding: 16, borderWidth: 1, borderColor: '#e2e8f0' },
  weekendCardRow: { flexDirection: 'row', alignItems: 'center' },
  cardIconBox: { width: 42, height: 42, borderRadius: 10, backgroundColor: '#e6f0fa', alignItems: 'center', justifyContent: 'center', marginRight: 12 },
  cardHeading: { fontSize: 13.5, fontWeight: '700', color: '#0f172a' },
  cardDetailText: { fontSize: 11, color: '#64748b', marginTop: 2, lineHeight: 15 },
  sectionHeaderTitle: { fontSize: 10.5, fontWeight: '800', color: '#004b87', letterSpacing: 0.5, marginBottom: 12 },
  listHeaderRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 },
  listSubText: { fontSize: 9.5, color: '#94a3b8', marginBottom: 12 },
  fieldRow: { marginBottom: 10 },
  fieldLabel: { fontSize: 11, fontWeight: '700', color: '#475569', marginBottom: 5 },
  inputBox: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#f8fafc', borderRadius: 10, borderWidth: 1.2, borderColor: '#cbd5e1', paddingHorizontal: 12, height: 42 },
  inputText: { flex: 1, fontSize: 12.5, color: '#0f172a' },
  typeSelectorRow: { flexDirection: 'row', gap: 8 },
  typePill: { flex: 1, alignItems: 'center', paddingVertical: 8, borderRadius: 8, backgroundColor: '#f1f5f9', borderWidth: 1, borderColor: '#e2e8f0' },
  typePillActive: { backgroundColor: '#004b87', borderColor: '#004b87' },
  typePillText: { fontSize: 10.5, fontWeight: '700', color: '#64748b' },
  typePillTextActive: { color: '#ffffff' },
  addOverrideBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', backgroundColor: '#004b87', paddingVertical: 10, borderRadius: 10, marginTop: 4 },
  addOverrideBtnText: { fontSize: 12.5, fontWeight: '700', color: '#ffffff' },
  btnDisabled: { opacity: 0.6 },
  noExceptionsText: { fontSize: 11.5, color: '#94a3b8', textAlign: 'center', paddingVertical: 12 },
  exceptionItemRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: '#f1f5f9' },
  typeBadge: { paddingVertical: 4, paddingHorizontal: 8, borderRadius: 6 },
  badgeSuspension: { backgroundColor: '#fee2e2' },
  textSuspension: { color: '#dc2626', fontWeight: '800', fontSize: 8.5 },
  badgeHoliday: { backgroundColor: '#fef3c7' },
  textHoliday: { color: '#d97706', fontWeight: '800', fontSize: 8.5 },
  badgeEvent: { backgroundColor: '#e0f2fe' },
  textEvent: { color: '#0284c7', fontWeight: '800', fontSize: 8.5 },
  typeBadgeText: { letterSpacing: 0.4 },
  exceptionDateText: { fontSize: 12, fontWeight: '700', color: '#0f172a' },
  exceptionReasonText: { fontSize: 11, color: '#64748b', marginTop: 1 },
  deleteBtn: { padding: 6 },
});

export default CalendarScreen;