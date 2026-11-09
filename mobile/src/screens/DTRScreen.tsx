// D:\AttendSure_V3\mobile\src\screens\DTRScreen.tsx

import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  RefreshControl,
  ActivityIndicator,
  TouchableOpacity,
  Alert,
  Share,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { apiClient } from '../api/client';
import { useAuth } from '../context/AuthContext';
import { COLORS } from '../constants/theme';
import DTRReportView, { DTRReportData } from '../components/reports/DTRReportView';

const MONTH_NAMES = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];

export const DTRScreen: React.FC = () => {
  const { user } = useAuth();
  const isMounted = useRef<boolean>(true);
  const abortControllerRef = useRef<AbortController | null>(null);

  const currentUser = user as Record<string, any> | null;
  const userRole = String(currentUser?.role || currentUser?.system_role || 'FACULTY').trim().toUpperCase();
  const isFaculty = userRole === 'FACULTY';

  const now = new Date();
  const [selectedMonth, setSelectedMonth] = useState<number>(now.getMonth() + 1);
  const [selectedYear, setSelectedYear] = useState<number>(now.getFullYear());
  const [selectedFacultyId, setSelectedFacultyId] = useState<string>('');

  const [dtrData, setDtrData] = useState<DTRReportData | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [refreshing, setRefreshing] = useState<boolean>(false);
  const [submittingDtr, setSubmittingDtr] = useState<boolean>(false);
  const [exportingPdf, setExportingPdf] = useState<boolean>(false);

  // Fetch DTR
  const fetchDTR = useCallback(
    async (silent = false) => {
      if (!silent && abortControllerRef.current) {
        abortControllerRef.current.abort();
      }
      const controller = new AbortController();
      if (!silent) abortControllerRef.current = controller;

      const endpoint =
        isFaculty && !selectedFacultyId
          ? '/reports/dtr/'
          : selectedFacultyId
          ? `/reports/dtr/${selectedFacultyId}/`
          : '/reports/dtr/';

      const cacheKey = `attendsure_dtr_${selectedFacultyId || 'self'}_${selectedMonth}_${selectedYear}`;

      if (!silent) {
        setLoading(true);
        try {
          const cached = await AsyncStorage.getItem(cacheKey);
          if (cached && isMounted.current) {
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

        if (!isMounted.current) return;

        setDtrData(res.data);
        await AsyncStorage.setItem(cacheKey, JSON.stringify(res.data));
      } catch {
        // Keep cached state
      } finally {
        if (!silent && isMounted.current) {
          setLoading(false);
          setRefreshing(false);
        }
      }
    },
    [isFaculty, selectedFacultyId, selectedMonth, selectedYear]
  );

  useEffect(() => {
    isMounted.current = true;
    fetchDTR(false);

    return () => {
      isMounted.current = false;
      if (abortControllerRef.current) abortControllerRef.current.abort();
    };
  }, [fetchDTR]);

  const onRefresh = useCallback(() => {
    setRefreshing(true);
    fetchDTR(false);
  }, [fetchDTR]);

  // Certify and Submit DTR
  const handleSubmitDtr = async () => {
    if (!dtrData) return;

    setSubmittingDtr(true);
    try {
      await apiClient.post(`/reports/dtr/${dtrData.faculty_id}/`, {
        action: 'SUBMIT_DTR',
        faculty_id: dtrData.faculty_id,
        month: dtrData.month_number,
        year: dtrData.year,
        regular_days_hours: dtrData.regular_days_hours,
        saturdays_hours: dtrData.saturdays_hours,
      });
      Alert.alert('Success', 'DTR submitted to your Department Head.');
      fetchDTR(true);
    } catch (err: any) {
      Alert.alert('Error', err?.response?.data?.error || 'Failed to submit DTR.');
    } finally {
      if (isMounted.current) setSubmittingDtr(false);
    }
  };

  // Export / Share
  const handleExport = async () => {
    if (!dtrData) return;

    if (!dtrData.dept_head_approved) {
      Alert.alert('Notice', 'Department Head endorsement required before exporting.');
      return;
    }

    setExportingPdf(true);
    try {
      const res = await apiClient.get('/reports/export/', {
        params: {
          report_type: 'DTR',
          faculty_id: dtrData.faculty_id,
          month: dtrData.month_number,
          year: dtrData.year,
        },
      });

      const title = res.data?.title || `CSC_Form_48_${dtrData.faculty_name}_${dtrData.month}_${dtrData.year}`;
      await Share.share({
        title,
        message: `${title}\nCivil Service Form No. 48 certified via AttendSure.`,
      });
    } catch {
      Alert.alert('Notice', 'Could not export DTR.');
    } finally {
      if (isMounted.current) setExportingPdf(false);
    }
  };

  return (
    <SafeAreaView style={styles.safeContainer} edges={['top', 'left', 'right']}>
      {/* Top Header */}
      <View style={styles.topBar}>
        <View style={{ flex: 1 }}>
          <Text style={styles.screenTitle}>DTR</Text>
          <Text style={styles.screenSub}>Civil Service Form No. 48</Text>
        </View>

        <View style={{ flexDirection: 'row', gap: 6 }}>
          <TouchableOpacity
            style={[styles.btnSec, (loading || exportingPdf) && { opacity: 0.6 }]}
            onPress={handleExport}
            disabled={loading || exportingPdf || !dtrData?.dept_head_approved}
          >
            <Ionicons
              name={dtrData?.dept_head_approved ? 'share-outline' : 'lock-closed-outline'}
              size={15}
              color={dtrData?.dept_head_approved ? '#004b87' : '#94a3b8'}
            />
            <Text style={[styles.btnSecText, !dtrData?.dept_head_approved && { color: '#94a3b8' }]}>
              Export
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.btnPri, loading && { opacity: 0.6 }]}
            onPress={() => fetchDTR(false)}
            disabled={loading}
          >
            {loading ? (
              <ActivityIndicator size="small" color="#ffffff" />
            ) : (
              <Ionicons name="refresh" size={15} color="#ffffff" />
            )}
          </TouchableOpacity>
        </View>
      </View>

      <ScrollView
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} colors={[COLORS.primary]} />
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
          >
            <Ionicons name="chevron-back" size={16} color="#004b87" />
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
          >
            <Ionicons name="chevron-forward" size={16} color="#004b87" />
          </TouchableOpacity>
        </View>

        {/* DTR Component */}
        {loading && !dtrData ? (
          <View style={styles.loadingBox}>
            <ActivityIndicator size="small" color={COLORS.primary} />
            <Text style={styles.loadingText}>Loading records...</Text>
          </View>
        ) : (
          <DTRReportView
            data={dtrData}
            submitting={submittingDtr}
            onSubmit={handleSubmitDtr}
            onRefreshNeeded={() => fetchDTR(true)}
          />
        )}
      </ScrollView>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  safeContainer: { flex: 1, backgroundColor: '#f1f5f9' },
  topBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 10,
    backgroundColor: '#ffffff',
    borderBottomWidth: 1,
    borderBottomColor: '#cbd5e1',
  },
  screenTitle: { fontSize: 17, fontWeight: '800', color: '#003460' },
  screenSub: { fontSize: 10, color: '#64748b' },
  btnPri: {
    backgroundColor: '#004b87',
    paddingVertical: 6,
    paddingHorizontal: 10,
    borderRadius: 8,
    justifyContent: 'center',
    alignItems: 'center',
  },
  btnSec: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: '#e6f0fa',
    paddingVertical: 6,
    paddingHorizontal: 10,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#b8d6f0',
  },
  btnSecText: { color: '#004b87', fontSize: 11, fontWeight: '800' },
  scrollContent: { padding: 12, paddingBottom: 110, gap: 10 },
  monthPillRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#ffffff',
    borderRadius: 8,
    paddingHorizontal: 8,
    paddingVertical: 6,
    borderWidth: 1,
    borderColor: '#cbd5e1',
  },
  navArrow: { padding: 4 },
  monthDisplay: { fontSize: 13, fontWeight: '800', color: '#0f172a' },
  loadingBox: { alignItems: 'center', justifyContent: 'center', paddingVertical: 40 },
  loadingText: { fontSize: 11, color: '#64748b', marginTop: 6 },
});

export default DTRScreen;