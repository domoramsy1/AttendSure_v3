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
import { useThemeMode } from '../context/ThemeContext';

import DashboardScreen from '../screens/DashboardScreen';
import CalendarScreen from '../screens/CalendarScreen';
import ScannerScreen from '../screens/ScannerScreen';
import ReportsScreen from '../screens/ReportsScreen';
import MenuScreen from '../screens/MenuScreen';
import SettingsScreen from '../screens/SettingsScreen';
import GatePassScreen from '../screens/GatePassScreen';
import ChatScreen from '../screens/ChatScreen';
import AdvisoryMatrixScreen from '../screens/AdvisoryMatrixScreen';
import DTRReportView, { DTRReportData } from '../components/reports/DTRReportView';

export type TabType =
  | 'home'
  | 'class_list'
  | 'gate_pass'
  | 'chat'
  | 'menu'
  | 'scanner'
  | 'reports'
  | 'calendar'
  | 'settings'
  | 'dtr'
  | 'dept_monitor'
  | 'qr_feed'
  | 'device_approval'
  | 'system_status';

export const MainTabNavigator: React.FC = () => {
  const insets = useSafeAreaInsets();
  const { palette } = useThemeMode();
  const [activeTab, setActiveTab] = useState<TabType>('home');

  const [dtrMonth, setDtrMonth] = useState<number>(new Date().getMonth() + 1);
  const [dtrYear, setDtrYear] = useState<number>(new Date().getFullYear());
  const [dtrData, setDtrData] = useState<DTRReportData | null>(null);
  const [dtrLoading, setDtrLoading] = useState<boolean>(false);
  const [dtrSubmitting, setDtrSubmitting] = useState<boolean>(false);

  const isMounted = useRef<boolean>(true);
  const dtrAbortRef = useRef<AbortController | null>(null);

  const fetchDTR = useCallback(
    async (silent = false) => {
      dtrAbortRef.current?.abort();
      const controller = new AbortController();
      dtrAbortRef.current = controller;

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
          signal: controller.signal,
        });
        if (isMounted.current) {
          setDtrData(res.data);
          await AsyncStorage.setItem(cacheKey, JSON.stringify(res.data));
        }
      } catch (err: any) {
        if (err?.name === 'CanceledError' || err?.name === 'AbortError') return;
      } finally {
        if (isMounted.current && !silent) {
          setDtrLoading(false);
        }
      }
    },
    [dtrMonth, dtrYear]
  );

  useEffect(() => {
    isMounted.current = true;
    if (activeTab === 'dtr') fetchDTR(false);
    return () => {
      isMounted.current = false;
      dtrAbortRef.current?.abort();
    };
  }, [activeTab, fetchDTR]);

  const handleSubmitDtr = async () => {
    if (!dtrData || dtrSubmitting) return;
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
      Alert.alert('Submitted', 'Your Daily Time Record has been sent to your Department Head.');
      fetchDTR(true);
    } catch (err: any) {
      Alert.alert('Unable to Submit', err?.response?.data?.error || 'Could not submit DTR right now.');
    } finally {
      if (isMounted.current) setDtrSubmitting(false);
    }
  };

  const renderRoyalSubHeader = (title: string, subtitle: string, backTarget: TabType = 'menu') => (
    <View style={[styles.royalHeader, { backgroundColor: palette.headerBg, paddingTop: Math.max(insets.top, 14) }]}>
      <View style={styles.royalHeaderTop}>
        <TouchableOpacity
          style={styles.royalBackCircle}
          onPress={() => setActiveTab(backTarget)}
          activeOpacity={0.75}
        >
          <Ionicons name="arrow-back" size={20} color="#FFFFFF" />
        </TouchableOpacity>
        <View style={{ flex: 1, marginLeft: 12 }}>
          <Text style={styles.royalEyebrow}>PROFILE &amp; OPERATIONS</Text>
          <Text style={styles.royalTitle} numberOfLines={1}>{title}</Text>
          <Text style={styles.royalSub} numberOfLines={1}>{subtitle}</Text>
        </View>
      </View>
    </View>
  );

  const navItems: Array<{
    key: TabType;
    label: string;
    icon: keyof typeof Ionicons.glyphMap;
    activeIcon: keyof typeof Ionicons.glyphMap;
  }> = [
    { key: 'home', label: 'Home', icon: 'home-outline', activeIcon: 'home' },
    { key: 'class_list', label: 'Classes', icon: 'book-outline', activeIcon: 'book' },
    { key: 'gate_pass', label: 'Clearances', icon: 'clipboard-outline', activeIcon: 'clipboard' },
    { key: 'chat', label: 'Messages', icon: 'chatbubble-outline', activeIcon: 'chatbubble' },
    { key: 'menu', label: 'Profile', icon: 'person-outline', activeIcon: 'person' },
  ];

  const resolvedNavKey: TabType = ['menu', 'settings', 'calendar', 'dtr', 'reports', 'scanner', 'dept_monitor', 'qr_feed', 'device_approval', 'system_status'].includes(activeTab)
    ? 'menu'
    : activeTab;

  return (
    <View style={[styles.container, { backgroundColor: palette.background }]}>
      <View style={styles.screenContainer}>
        {activeTab === 'home' && <DashboardScreen onNavigate={setActiveTab} />}
        {activeTab === 'class_list' && <AdvisoryMatrixScreen />}
        {activeTab === 'gate_pass' && <GatePassScreen onBack={() => setActiveTab('home')} />}
        {activeTab === 'chat' && <ChatScreen />}
        {activeTab === 'menu' && <MenuScreen onSelectScreen={setActiveTab} />}
        {activeTab === 'scanner' && <ScannerScreen onBack={() => setActiveTab('menu')} />}
        {activeTab === 'reports' && (
          <View style={{ flex: 1 }}>
            {renderRoyalSubHeader('School Reports', 'SF1, SF2, SF4 and Form 48 exports', 'menu')}
            <ReportsScreen />
          </View>
        )}
        {activeTab === 'calendar' && (
          <View style={{ flex: 1 }}>
            {renderRoyalSubHeader('School Calendar', 'Suspensions, holidays and schedules', 'menu')}
            <CalendarScreen />
          </View>
        )}
        {activeTab === 'settings' && (
          <View style={{ flex: 1 }}>
            {renderRoyalSubHeader('Settings', 'Account protection, dark mode and preferences', 'menu')}
            <SettingsScreen />
          </View>
        )}
        {activeTab === 'dtr' && (
          <View style={{ flex: 1 }}>
            {renderRoyalSubHeader('Daily Time Record', 'Civil Service Form No. 48', 'menu')}
            <ScrollView
              contentContainerStyle={styles.subScreenScroll}
              showsVerticalScrollIndicator={false}
              refreshControl={
                <RefreshControl
                  refreshing={dtrLoading}
                  onRefresh={() => fetchDTR(false)}
                  colors={[palette.primary]}
                />
              }
            >
              {dtrLoading && !dtrData ? (
                <View style={styles.loadingBox}>
                  <ActivityIndicator size="small" color={palette.primary} />
                  <Text style={[styles.loadingText, { color: palette.textMuted }]}>Loading attendance records...</Text>
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
      </View>

      {/* Floating Pill Bottom Navigation Dock */}
      <View
        style={[
          styles.floatingDockWrapper,
          { paddingBottom: Math.max(insets.bottom, 10) },
        ]}
        pointerEvents="box-none"
      >
        <View
          style={[
            styles.floatingDock,
            {
              backgroundColor: palette.surface,
              borderColor: palette.border,
            },
          ]}
        >
          {navItems.map((item) => {
            const isFocused = resolvedNavKey === item.key;
            return (
              <TouchableOpacity
                key={item.key}
                onPress={() => setActiveTab(item.key)}
                activeOpacity={0.8}
                style={[
                  styles.navPillBtn,
                  isFocused && [
                    styles.navPillBtnActive,
                    { backgroundColor: palette.primarySoft },
                  ],
                ]}
              >
                <Ionicons
                  name={isFocused ? item.activeIcon : item.icon}
                  size={20}
                  color={isFocused ? palette.primary : palette.textMuted}
                />
                {isFocused && (
                  <Text style={[styles.navPillText, { color: palette.primary }]} numberOfLines={1}>
                    {item.label}
                  </Text>
                )}
              </TouchableOpacity>
            );
          })}
        </View>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1 },
  screenContainer: { flex: 1 },
  royalHeader: {
    paddingHorizontal: 18,
    paddingBottom: 20,
    borderBottomLeftRadius: 28,
    borderBottomRightRadius: 28,
  },
  royalHeaderTop: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  royalBackCircle: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: 'rgba(255, 255, 255, 0.2)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  royalEyebrow: {
    fontSize: 10.5,
    fontWeight: '700',
    color: '#DBE4FF',
    letterSpacing: 0.8,
  },
  royalTitle: {
    fontSize: 24,
    fontWeight: '800',
    color: '#FFFFFF',
    marginTop: 2,
  },
  royalSub: {
    fontSize: 13,
    color: '#E0E7FF',
    marginTop: 2,
  },
  subScreenScroll: {
    padding: 14,
    paddingBottom: 120,
  },
  loadingBox: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 40,
  },
  loadingText: {
    fontSize: 12,
    marginTop: 8,
  },
  floatingDockWrapper: {
    position: 'absolute',
    left: 16,
    right: 16,
    bottom: 0,
    alignItems: 'center',
  },
  floatingDock: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    width: '100%',
    borderRadius: 32,
    paddingVertical: 8,
    paddingHorizontal: 10,
    borderWidth: 1,
    ...Platform.select({
      ios: {
        shadowColor: '#0F172A',
        shadowOffset: { width: 0, height: 8 },
        shadowOpacity: 0.12,
        shadowRadius: 16,
      },
      android: { elevation: 12 },
    }),
  },
  navPillBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderRadius: 22,
    gap: 6,
  },
  navPillBtnActive: {
    paddingHorizontal: 16,
  },
  navPillText: {
    fontSize: 13,
    fontWeight: '800',
  },
});

export default MainTabNavigator;