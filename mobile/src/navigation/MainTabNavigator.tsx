// D:\AttendSure_V3\mobile\src\navigation\MainTabNavigator.tsx

import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  View,
  StyleSheet,
  TouchableOpacity,
  Text,
  Platform,
  ScrollView,
  RefreshControl,
  ActivityIndicator,
  Alert,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { apiClient } from '../api/client';
import { useAuth } from '../context/AuthContext';
import { COLORS } from '../constants/theme';

// Standalone Screens
import HomeScreen from '../screens/HomeScreen';
import CalendarScreen from '../screens/CalendarScreen';
import ScannerScreen from '../screens/ScannerScreen';
import ReportsScreen from '../screens/ReportsScreen';
import MenuScreen from '../screens/MenuScreen';
import SettingsScreen from '../screens/SettingsScreen';
import SmsLogsScreen from '../screens/SmsLogsScreen';

// Reports
import DTRReportView, { DTRReportData } from '../components/reports/DTRReportView';

export type TabType =
  | 'home'
  | 'calendar'
  | 'scanner'
  | 'reports'
  | 'menu'
  | 'settings'
  | 'sms'
  | 'class_list'
  | 'dtr'
  | 'dept_monitor'
  | 'gate_feed'
  | 'device_approval'
  | 'kiosk_health';

export const MainTabNavigator: React.FC = () => {
  const insets = useSafeAreaInsets();
  const { user } = useAuth();
  const [activeTab, setActiveTab] = useState<TabType>('home');

  // Role-Based Authorization
  const currentUser = user as Record<string, any> | null;
  const userRole = String(
    currentUser?.role || currentUser?.system_role || 'EMPLOYEE'
  ).trim().toUpperCase();

  const isAdmin = ['ADMIN', 'SUPERADMIN', 'PRINCIPAL', 'REGISTRAR'].includes(userRole);
  const isEmployee = ['EMPLOYEE', 'FACULTY', 'TEACHER', 'STAFF'].includes(userRole);

  // Direct DTR State
  const [dtrMonth, setDtrMonth] = useState<number>(new Date().getMonth() + 1);
  const [dtrYear, setDtrYear] = useState<number>(new Date().getFullYear());
  const [dtrData, setDtrData] = useState<DTRReportData | null>(null);
  const [dtrLoading, setDtrLoading] = useState<boolean>(false);
  const [dtrSubmitting, setDtrSubmitting] = useState<boolean>(false);
  const isMounted = useRef<boolean>(true);

  const fetchDTR = useCallback(async (silent = false) => {
    if (!silent) setDtrLoading(true);
    const cacheKey = `attendsure_dtr_menu_${dtrMonth}_${dtrYear}`;

    try {
      const cached = await AsyncStorage.getItem(cacheKey);
      if (cached && isMounted.current) {
        setDtrData(JSON.parse(cached));
      }
    } catch {}

    try {
      const res = await apiClient.get<DTRReportData>('reports/dtr/', {
        params: { month: dtrMonth, year: dtrYear },
      });
      if (isMounted.current) {
        setDtrData(res.data);
        await AsyncStorage.setItem(cacheKey, JSON.stringify(res.data));
      }
    } catch {
      // Retain cached state
    } finally {
      if (isMounted.current && !silent) {
        setDtrLoading(false);
      }
    }
  }, [dtrMonth, dtrYear]);

  useEffect(() => {
    isMounted.current = true;
    if (activeTab === 'dtr') {
      fetchDTR(false);
    }
    return () => {
      isMounted.current = false;
    };
  }, [activeTab, fetchDTR]);

  const handleSubmitDtr = async () => {
    if (!dtrData) return;
    setDtrSubmitting(true);
    try {
      await apiClient.post(`reports/dtr/${dtrData.faculty_id}/`, {
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
      if (isMounted.current) setDtrSubmitting(false);
    }
  };

  const renderSubHeader = (title: string) => (
    <View style={[styles.subScreenHeader, { paddingTop: Math.max(insets.top, 12) }]}>
      <TouchableOpacity
        style={styles.backBtn}
        onPress={() => setActiveTab('menu')}
        activeOpacity={0.7}
      >
        <Ionicons name="arrow-back" size={20} color="#004b87" />
        <Text style={styles.backBtnText}>Menu</Text>
      </TouchableOpacity>
      <Text style={styles.subScreenTitle}>{title}</Text>
      <View style={{ width: 60 }} />
    </View>
  );

  return (
    <View style={styles.container}>
      <View style={styles.screenContainer}>
        {activeTab === 'home' && <HomeScreen />}
        {activeTab === 'calendar' && <CalendarScreen />}
        {activeTab === 'scanner' && <ScannerScreen />}
        {activeTab === 'reports' && <ReportsScreen />}
        {activeTab === 'menu' && <MenuScreen onSelectScreen={setActiveTab} />}

        {activeTab === 'settings' && (
          <View style={{ flex: 1 }}>
            {renderSubHeader('Settings')}
            <SettingsScreen />
          </View>
        )}

        {activeTab === 'dtr' && (
          <View style={{ flex: 1 }}>
            {renderSubHeader('Civil Service Form No. 48')}
            <ScrollView
              contentContainerStyle={styles.subScreenScroll}
              showsVerticalScrollIndicator={false}
              refreshControl={
                <RefreshControl
                  refreshing={dtrLoading}
                  onRefresh={() => fetchDTR(false)}
                  colors={[COLORS.primary]}
                />
              }
            >
              {dtrLoading && !dtrData ? (
                <View style={styles.loadingBox}>
                  <ActivityIndicator size="small" color={COLORS.primary} />
                  <Text style={styles.loadingText}>Loading DTR records...</Text>
                </View>
              ) : (
                <DTRReportView
                  data={dtrData}
                  selectedMonth={dtrMonth}
                  selectedYear={dtrYear}
                  onMonthChange={(m, y) => {
                    setDtrMonth(m);
                    setDtrYear(y);
                  }}
                  submitting={dtrSubmitting}
                  onSubmit={handleSubmitDtr}
                  onRefreshNeeded={() => fetchDTR(true)}
                />
              )}
            </ScrollView>
          </View>
        )}

        {activeTab === 'sms' && (
          <View style={{ flex: 1 }}>
            {renderSubHeader('SMS Logs')}
            <SmsLogsScreen />
          </View>
        )}

        {activeTab === 'class_list' && (
          <View style={styles.placeholderContainer}>
            {renderSubHeader('Class List')}
            <View style={styles.placeholderBody}>
              <Ionicons name="people-circle-outline" size={64} color="#004b87" />
              <Text style={styles.placeholderTitle}>Class List</Text>
              <Text style={styles.placeholderText}>
                Active learners, guardian contacts, and classroom attendance.
              </Text>
            </View>
          </View>
        )}

        {activeTab === 'dept_monitor' && (
          <View style={styles.placeholderContainer}>
            {renderSubHeader('Employee Attendance')}
            <View style={styles.placeholderBody}>
              <Ionicons name="analytics-outline" size={64} color="#004b87" />
              <Text style={styles.placeholderTitle}>Employee Attendance</Text>
              <Text style={styles.placeholderText}>
                Department employee attendance inside campus geofence.
              </Text>
            </View>
          </View>
        )}

        {activeTab === 'gate_feed' && (
          <View style={styles.placeholderContainer}>
            {renderSubHeader('Gate Scanner Feed')}
            <View style={styles.placeholderBody}>
              <Ionicons name="videocam-outline" size={64} color="#004b87" />
              <Text style={styles.placeholderTitle}>Gate Scanner Feed</Text>
              <Text style={styles.placeholderText}>
                Live RFID and QR taps at Campus Gate Kiosks.
              </Text>
            </View>
          </View>
        )}

        {activeTab === 'device_approval' && (
          <View style={styles.placeholderContainer}>
            {renderSubHeader('Device Approvals')}
            <View style={styles.placeholderBody}>
              <Ionicons name="shield-checkmark-outline" size={64} color="#004b87" />
              <Text style={styles.placeholderTitle}>Device Approvals</Text>
              <Text style={styles.placeholderText}>
                Manage verified employee mobile devices.
              </Text>
            </View>
          </View>
        )}

        {activeTab === 'kiosk_health' && (
          <View style={styles.placeholderContainer}>
            {renderSubHeader('Gate Kiosk Health')}
            <View style={styles.placeholderBody}>
              <Ionicons name="hardware-chip-outline" size={64} color="#004b87" />
              <Text style={styles.placeholderTitle}>Gate Kiosk Health</Text>
              <Text style={styles.placeholderText}>
                Scanner online status, ping latency, and offline queue logs.
              </Text>
            </View>
          </View>
        )}
      </View>

      {/* Role-Filtered Bottom Navigation Bar */}
      <View
        style={[
          styles.bottomBar,
          {
            paddingBottom: Math.max(insets.bottom, 8),
            height: 60 + Math.max(insets.bottom, 8),
          },
        ]}
      >
        <TouchableOpacity
          style={styles.tabItem}
          onPress={() => setActiveTab('home')}
          activeOpacity={0.7}
        >
          <Ionicons
            name={activeTab === 'home' ? 'grid' : 'grid-outline'}
            size={20}
            color={activeTab === 'home' ? COLORS.primary : COLORS.textMuted}
          />
          <Text
            style={[styles.tabLabel, activeTab === 'home' && styles.tabLabelActive]}
            numberOfLines={1}
          >
            Dashboard
          </Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.tabItem}
          onPress={() => setActiveTab('calendar')}
          activeOpacity={0.7}
        >
          <Ionicons
            name={activeTab === 'calendar' ? 'calendar' : 'calendar-outline'}
            size={20}
            color={activeTab === 'calendar' ? COLORS.primary : COLORS.textMuted}
          />
          <Text
            style={[styles.tabLabel, activeTab === 'calendar' && styles.tabLabelActive]}
            numberOfLines={1}
          >
            Calendar
          </Text>
        </TouchableOpacity>

        {(isAdmin || isEmployee) && (
          <TouchableOpacity
            style={styles.centerFab}
            onPress={() => setActiveTab('scanner')}
            activeOpacity={0.85}
          >
            <View style={[styles.fabBox, activeTab === 'scanner' && styles.fabBoxActive]}>
              <Ionicons name="qr-code" size={24} color="#ffffff" />
            </View>
          </TouchableOpacity>
        )}

        <TouchableOpacity
          style={styles.tabItem}
          onPress={() => setActiveTab('reports')}
          activeOpacity={0.7}
        >
          <Ionicons
            name={activeTab === 'reports' ? 'document-text' : 'document-text-outline'}
            size={20}
            color={activeTab === 'reports' ? COLORS.primary : COLORS.textMuted}
          />
          <Text
            style={[styles.tabLabel, activeTab === 'reports' && styles.tabLabelActive]}
            numberOfLines={1}
          >
            Reports
          </Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.tabItem}
          onPress={() => setActiveTab('menu')}
          activeOpacity={0.7}
        >
          <Ionicons
            name={
              [
                'menu',
                'settings',
                'sms',
                'class_list',
                'dtr',
                'dept_monitor',
                'gate_feed',
                'device_approval',
                'kiosk_health',
              ].includes(activeTab)
                ? 'menu'
                : 'menu-outline'
            }
            size={22}
            color={
              [
                'menu',
                'settings',
                'sms',
                'class_list',
                'dtr',
                'dept_monitor',
                'gate_feed',
                'device_approval',
                'kiosk_health',
              ].includes(activeTab)
                ? COLORS.primary
                : COLORS.textMuted
            }
          />
          <Text
            style={[
              styles.tabLabel,
              [
                'menu',
                'settings',
                'sms',
                'class_list',
                'dtr',
                'dept_monitor',
                'gate_feed',
                'device_approval',
                'kiosk_health',
              ].includes(activeTab) && styles.tabLabelActive,
            ]}
            numberOfLines={1}
          >
            Menu
          </Text>
        </TouchableOpacity>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.background },
  screenContainer: { flex: 1 },
  bottomBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: COLORS.surface,
    borderTopWidth: 1,
    borderTopColor: COLORS.border,
    paddingTop: 6,
    paddingHorizontal: 4,
    ...Platform.select({
      ios: {
        shadowColor: COLORS.primaryDark,
        shadowOffset: { width: 0, height: -3 },
        shadowOpacity: 0.08,
        shadowRadius: 8,
      },
      android: { elevation: 10 },
    }),
  },
  tabItem: {
    alignItems: 'center',
    justifyContent: 'space-between',
    flex: 1,
    paddingHorizontal: 2,
  },
  tabLabel: {
    fontSize: 9.5,
    fontWeight: '600',
    color: COLORS.textMuted,
    marginTop: 3,
  },
  tabLabelActive: {
    color: COLORS.primary,
    fontWeight: '800',
  },
  centerFab: {
    top: -14,
    alignItems: 'center',
    justifyContent: 'center',
    width: 56,
  },
  fabBox: {
    width: 48,
    height: 48,
    borderRadius: 16,
    backgroundColor: COLORS.primary,
    alignItems: 'center',
    justifyContent: 'center',
    ...Platform.select({
      ios: {
        shadowColor: COLORS.primary,
        shadowOffset: { width: 0, height: 6 },
        shadowOpacity: 0.35,
        shadowRadius: 10,
      },
      android: { elevation: 8 },
    }),
  },
  fabBoxActive: {
    backgroundColor: COLORS.primaryDark,
    transform: [{ scale: 1.05 }],
  },
  subScreenHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 14,
    paddingBottom: 10,
    backgroundColor: '#ffffff',
    borderBottomWidth: 1,
    borderBottomColor: '#e2e8f0',
  },
  backBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingVertical: 4,
    paddingHorizontal: 6,
  },
  backBtnText: {
    fontSize: 14,
    fontWeight: '700',
    color: '#004b87',
  },
  subScreenTitle: {
    fontSize: 15,
    fontWeight: '800',
    color: '#0f172a',
  },
  subScreenScroll: {
    padding: 12,
    paddingBottom: 110,
  },
  loadingBox: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 40,
  },
  loadingText: {
    fontSize: 11,
    color: '#64748b',
    marginTop: 6,
  },
  placeholderContainer: {
    flex: 1,
    backgroundColor: '#f8fafc',
  },
  placeholderBody: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 30,
  },
  placeholderTitle: {
    fontSize: 17,
    fontWeight: '800',
    color: '#0f172a',
    marginTop: 14,
  },
  placeholderText: {
    fontSize: 13,
    color: '#64748b',
    textAlign: 'center',
    marginTop: 6,
    lineHeight: 18,
  },
});

export default MainTabNavigator;