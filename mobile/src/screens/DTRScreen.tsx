/**
 * AttendSure Mobile - Daily Time Record (Civil Service Form No. 48)
 * File: mobile/src/screens/DTRScreen.tsx
 */

import React, { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  RefreshControl,
  ActivityIndicator,
  TouchableOpacity,
  Share,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { apiClient } from '../api/client';
import { ENDPOINTS } from '../api/endpoints';
import { useAuth } from '../context/AuthContext';
import { useThemeMode } from '../context/ThemeContext';
import {
  getFriendlyErrorMessage,
  type ThemePalette,
} from '../constants/theme';
import { isCanceledError, showNotice } from '../utils/helpers';
import DTRReportView, { DTRReportData } from '../components/reports/DTRReportView';

const MONTH_NAMES = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];

interface DTRScreenProps {
  teacherId?: string;
}

export const DTRScreen: React.FC<DTRScreenProps> = ({ teacherId = '' }) => {
  const { user } = useAuth();
  const { palette, fonts } = useThemeMode();
  const styles = useMemo(() => createStyles(palette, fonts), [palette, fonts]);

  const isMounted = useRef<boolean>(true);
  const abortControllerRef = useRef<AbortController | null>(null);

  const currentUser = user as Record<string, any> | null;
  const userRole = String(currentUser?.role || currentUser?.system_role || 'TEACHER')
    .trim()
    .toUpperCase();
  const isTeacher = userRole === 'TEACHER';

  const now = new Date();
  const [selectedMonth, setSelectedMonth] = useState<number>(now.getMonth() + 1);
  const [selectedYear, setSelectedYear] = useState<number>(now.getFullYear());

  const [dtrData, setDtrData] = useState<DTRReportData | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [refreshing, setRefreshing] = useState<boolean>(false);
  const [submittingDtr, setSubmittingDtr] = useState<boolean>(false);
  const [exportingDoc, setExportingDoc] = useState<boolean>(false);

  const fetchDTR = useCallback(
    async (silent = false) => {
      abortControllerRef.current?.abort();
      const controller = new AbortController();
      abortControllerRef.current = controller;

      const cleanTargetId = teacherId.trim();
      const endpoint =
        isTeacher && !cleanTargetId
          ? ENDPOINTS.EMPLOYEE_DTR
          : cleanTargetId
          ? `${ENDPOINTS.EMPLOYEE_DTR}${encodeURIComponent(cleanTargetId)}/`
          : ENDPOINTS.EMPLOYEE_DTR;

      const cacheKey = `attendsure_dtr_${cleanTargetId || 'self'}_${selectedMonth}_${selectedYear}`;

      if (!silent) {
        if (isMounted.current) setLoading(true);
        try {
          const cached = await AsyncStorage.getItem(cacheKey);
          if (cached && isMounted.current && !controller.signal.aborted) {
            setDtrData(JSON.parse(cached));
          }
        } catch {
          // Continue to live fetch
        }
      }

      try {
        const res = await apiClient.get<DTRReportData>(endpoint, {
          params: { month: selectedMonth, year: selectedYear },
          signal: controller.signal,
        });

        if (!isMounted.current || controller.signal.aborted) return;

        setDtrData(res.data);
        AsyncStorage.setItem(cacheKey, JSON.stringify(res.data)).catch(() => {});
      } catch (err: unknown) {
        if (isCanceledError(err)) return;
      } finally {
        if (isMounted.current) {
          setLoading(false);
          setRefreshing(false);
        }
      }
    },
    [isTeacher, teacherId, selectedMonth, selectedYear]
  );

  useEffect(() => {
    isMounted.current = true;
    void fetchDTR(false);

    return () => {
      isMounted.current = false;
      abortControllerRef.current?.abort();
    };
  }, [fetchDTR]);

  const onRefresh = useCallback(() => {
    setRefreshing(true);
    void fetchDTR(false);
  }, [fetchDTR]);

  const handleSubmitDtr = async () => {
    if (!dtrData || submittingDtr) return;

    setSubmittingDtr(true);
    try {
      const encodedId = encodeURIComponent(String(dtrData.teacher_id));
      await apiClient.post(`${ENDPOINTS.EMPLOYEE_DTR}${encodedId}/`, {
        action: 'SUBMIT_DTR',
        teacher_id: dtrData.teacher_id,
        month: dtrData.month_number,
        year: dtrData.year,
        regular_days_hours: dtrData.regular_days_hours,
        saturdays_hours: dtrData.saturdays_hours,
      });
      if (!isMounted.current) return;
      showNotice('Submitted', 'Your Daily Time Record has been sent to your Department Head.');
      void fetchDTR(true);
    } catch (err: unknown) {
      if (!isMounted.current) return;
      showNotice(
        'Unable to Submit',
        getFriendlyErrorMessage(err, 'Could not submit your Daily Time Record right now.')
      );
    } finally {
      if (isMounted.current) setSubmittingDtr(false);
    }
  };

  const handleExport = async () => {
    if (!dtrData || exportingDoc) return;

    if (!dtrData.dept_head_approved) {
      showNotice('Approval Required', 'Department Head approval is needed before exporting.');
      return;
    }

    setExportingDoc(true);
    try {
      const res = await apiClient.get(ENDPOINTS.REPORT_EXPORT, {
        params: {
          report_type: 'DTR',
          teacher_id: dtrData.teacher_id,
          month: dtrData.month_number,
          year: dtrData.year,
        },
      });

      const title =
        res.data?.title ||
        `CSC_Form_48_${dtrData.teacher_name}_${dtrData.month}_${dtrData.year}`;
      await Share.share({
        title,
        message: `${title}\nCivil Service Form No. 48 verified in AttendSure.`,
      });
    } catch (err: unknown) {
      if (!isMounted.current) return;
      showNotice('Notice', getFriendlyErrorMessage(err, 'Could not export your Daily Time Record.'));
    } finally {
      if (isMounted.current) setExportingDoc(false);
    }
  };

  const isApproved = Boolean(dtrData?.dept_head_approved);

  return (
    <SafeAreaView style={styles.safeContainer} edges={['top', 'left', 'right']}>
      {/* Top Header */}
      <View style={styles.topBar}>
        <View style={{ flex: 1 }}>
          <Text style={styles.screenTitle}>Daily Time Record</Text>
          <Text style={styles.screenSub}>Civil Service Form No. 48</Text>
        </View>

        <View style={{ flexDirection: 'row', gap: 6 }}>
          <TouchableOpacity
            style={[
              styles.btnSec,
              (loading || exportingDoc || !isApproved) && { opacity: 0.6 },
            ]}
            onPress={() => void handleExport()}
            disabled={loading || exportingDoc || !isApproved}
          >
            <Ionicons
              name={isApproved ? 'share-outline' : 'lock-closed-outline'}
              size={15}
              color={isApproved ? palette.primary : palette.textMuted}
            />
            <Text style={[styles.btnSecText, !isApproved && { color: palette.textMuted }]}>
              Export
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.btnPri, loading && { opacity: 0.6 }]}
            onPress={() => void fetchDTR(false)}
            disabled={loading}
            accessibilityLabel="Refresh records"
          >
            {loading ? (
              <ActivityIndicator size="small" color={palette.onPrimary} />
            ) : (
              <Ionicons name="refresh" size={15} color={palette.onPrimary} />
            )}
          </TouchableOpacity>
        </View>
      </View>

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
        {/* Month Selector */}
        <View style={styles.monthPillRow}>
          <TouchableOpacity
            style={styles.navArrow}
            onPress={() => {
              if (selectedMonth === 1) {
                setSelectedMonth(12);
                setSelectedYear((y) => y - 1);
              } else {
                setSelectedMonth((m) => m - 1);
              }
            }}
            accessibilityLabel="Previous month"
          >
            <Ionicons name="chevron-back" size={18} color={palette.primary} />
          </TouchableOpacity>

          <Text style={styles.monthDisplay}>
            {MONTH_NAMES[selectedMonth - 1]} {selectedYear}
          </Text>

          <TouchableOpacity
            style={styles.navArrow}
            onPress={() => {
              if (selectedMonth === 12) {
                setSelectedMonth(1);
                setSelectedYear((y) => y + 1);
              } else {
                setSelectedMonth((m) => m + 1);
              }
            }}
            accessibilityLabel="Next month"
          >
            <Ionicons name="chevron-forward" size={18} color={palette.primary} />
          </TouchableOpacity>
        </View>

        {/* DTR Sheet Component */}
        {loading && !dtrData ? (
          <View style={styles.loadingBox}>
            <ActivityIndicator size="small" color={palette.primary} />
            <Text style={styles.loadingText}>Loading attendance records...</Text>
          </View>
        ) : (
          <DTRReportView
            data={dtrData}
            selectedMonth={selectedMonth}
            selectedYear={selectedYear}
            onMonthChange={(m, y) => {
              setSelectedMonth(m);
              setSelectedYear(y);
            }}
            submitting={submittingDtr}
            onSubmit={handleSubmitDtr}
            onRefreshNeeded={() => void fetchDTR(true)}
          />
        )}
      </ScrollView>
    </SafeAreaView>
  );
};

const createStyles = (palette: ThemePalette, fonts: ReturnType<typeof useThemeMode>['fonts']) =>
  StyleSheet.create({
    safeContainer: { flex: 1, backgroundColor: palette.background },
    topBar: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingHorizontal: 16,
      paddingVertical: 10,
      backgroundColor: palette.surface,
      borderBottomWidth: 1,
      borderBottomColor: palette.border,
    },
    screenTitle: { fontSize: fonts.lg, fontWeight: fonts.weight.extrabold, color: palette.textPrimary },
    screenSub: { fontSize: fonts.xs, color: palette.textSecondary },
    btnPri: {
      backgroundColor: palette.buttonBg,
      paddingVertical: 7,
      paddingHorizontal: 11,
      borderRadius: 8,
      justifyContent: 'center',
      alignItems: 'center',
    },
    btnSec: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 4,
      backgroundColor: palette.primarySoft,
      paddingVertical: 7,
      paddingHorizontal: 11,
      borderRadius: 8,
      borderWidth: 1,
      borderColor: palette.border,
    },
    btnSecText: { color: palette.primary, fontSize: fonts.xs, fontWeight: fonts.weight.extrabold },
    scrollContent: { padding: 12, paddingBottom: 115, gap: 10 },
    monthPillRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      backgroundColor: palette.surface,
      borderRadius: 10,
      paddingHorizontal: 10,
      paddingVertical: 8,
      borderWidth: 1,
      borderColor: palette.border,
    },
    navArrow: { padding: 4 },
    monthDisplay: { fontSize: fonts.md, fontWeight: fonts.weight.extrabold, color: palette.textPrimary },
    loadingBox: { alignItems: 'center', justifyContent: 'center', paddingVertical: 40 },
    loadingText: { fontSize: fonts.xs, color: palette.textSecondary, marginTop: 6 },
  });

export default DTRScreen;
