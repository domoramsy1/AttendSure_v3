/**
 * AttendSure Mobile - Role-Aware Main Tab Navigator (Faculty & Parent Modes)
 * File: mobile/src/navigation/MainTabNavigator.tsx
 */

import React, { useState, useEffect, useCallback, useRef, useMemo } from 'react';
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
import { useThemeMode } from '../context/ThemeContext';
import { getFriendlyErrorMessage, type ThemePalette } from '../constants/theme';

import DashboardScreen from '../screens/DashboardScreen';
import ParentPortalScreen from '../screens/ParentPortalScreen';
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
  | 'dtr';

const isCanceledError = (err: unknown): boolean => {
  const e = err as { code?: string; name?: string };
  return e?.code === 'ERR_CANCELED' || e?.name === 'CanceledError' || e?.name === 'AbortError';
};

const showNotice = (title: string, message: string): void => {
  if (Platform.OS === 'web' && typeof window !== 'undefined') {
    window.alert(`${title}: ${message}`);
  } else {
    Alert.alert(title, message);
  }
};

export const MainTabNavigator: React.FC = () => {
  const insets = useSafeAreaInsets();
  const { user } = useAuth();
  const { palette, fonts } = useThemeMode();
  const styles = useMemo(() => createStyles(palette, fonts), [palette, fonts]);
  const [activeTab, setActiveTab] = useState<TabType>('home');

  const isParentUser = useMemo(() => {
    const role = String(user?.role || user?.system_role || '').trim().toUpperCase();
    return role === 'PARENT';
  }, [user?.role, user?.system_role]);

  const [dtrMonth, setDtrMonth] = useState<number>(new Date().getMonth() + 1);
  const [dtrYear, setDtrYear] = useState<number>(new Date().getFullYear());
  const [dtrData, setDtrData] = useState<DTRReportData | null>(null);
  const [dtrLoading, setDtrLoading] = useState<boolean>(false);
  const [dtrSubmitting, setDtrSubmitting] = useState<boolean>(false);

  const isMounted = useRef<boolean>(true);
  const dtrAbortRef = useRef<AbortController | null>(null);

  const fetchDTR = useCallback(
    async (silent = false) => {
      if (isParentUser) return;
      dtrAbortRef.current?.abort();
      const controller = new AbortController();
      dtrAbortRef.current = controller;

      if (!silent && isMounted.current) setDtrLoading(true);
      const cacheKey = `attendsure_dtr_menu_${dtrMonth}_${dtrYear}`;

      try {
        const cached = await AsyncStorage.getItem(cacheKey);
        if (cached && isMounted.current && !controller.signal.aborted) {
          setDtrData(JSON.parse(cached));
        }
      } catch {}

      try {
        const res = await apiClient.get<DTRReportData>('reports/dtr/', {
          params: { month: dtrMonth, year: dtrYear },
          signal: controller.signal,
        });
        if (isMounted.current && !controller.signal.aborted) {
          setDtrData(res.data);
          await AsyncStorage.setItem(cacheKey, JSON.stringify(res.data)).catch(() => {});
        }
      } catch (err: unknown) {
        if (isCanceledError(err)) return;
      } finally {
        if (isMounted.current && !silent) {
          setDtrLoading(false);
        }
      }
    },
    [dtrMonth, dtrYear, isParentUser]
  );

  useEffect(() => {
    isMounted.current = true;
    return () => {
      isMounted.current = false;
      dtrAbortRef.current?.abort();
    };
  }, []);

  useEffect(() => {
    if (activeTab === 'dtr' && !isParentUser) {
      void fetchDTR(false);
    }
    return () => {
      dtrAbortRef.current?.abort();
    };
  }, [activeTab, fetchDTR, isParentUser]);

  const handleSubmitDtr = async () => {
    if (!dtrData || dtrSubmitting) return;
    setDtrSubmitting(true);
    try {
      const encodedFacultyId = encodeURIComponent(String(dtrData.faculty_id));
      await apiClient.post(`reports/dtr/${encodedFacultyId}/`, {
        action: 'SUBMIT_DTR',
        faculty_id: dtrData.faculty_id,
        month: dtrData.month_number,
        year: dtrData.year,
        regular_days_hours: dtrData.regular_days_hours,
        saturdays_hours: dtrData.saturdays_hours,
      });
      showNotice('Submitted', 'Your Daily Time Record has been sent to your Department Head.');
      void fetchDTR(true);
    } catch (err: unknown) {
      showNotice(
        'Unable to Submit',
        getFriendlyErrorMessage(err, 'Could not submit your Daily Time Record right now.')
      );
    } finally {
      if (isMounted.current) setDtrSubmitting(false);
    }
  };

  const renderSubHeader = (title: string, subtitle: string, backTarget: TabType = 'menu') => (
    <View style={[styles.subHeader, { paddingTop: Math.max(insets.top, 14) }]}>
      <View style={styles.subHeaderTop}>
        <TouchableOpacity
          style={styles.backCircle}
          onPress={() => setActiveTab(backTarget)}
          activeOpacity={0.75}
          accessibilityLabel="Go back"
        >
          <Ionicons name="arrow-back" size={20} color={palette.onPrimary} />
        </TouchableOpacity>
        <View style={styles.subHeaderTextWrap}>
          <Text style={styles.subHeaderEyebrow}>PROFILE &amp; TOOLS</Text>
          <Text style={styles.subHeaderTitle} numberOfLines={1}>
            {title}
          </Text>
          <Text style={styles.subHeaderSubtitle} numberOfLines={1}>
            {subtitle}
          </Text>
        </View>
      </View>
    </View>
  );

  const navItems: Array<{
    key: TabType;
    label: string;
    icon: keyof typeof Ionicons.glyphMap;
    activeIcon: keyof typeof Ionicons.glyphMap;
  }> = useMemo(
    () =>
      isParentUser
        ? [
            { key: 'home', label: 'Children', icon: 'people-outline', activeIcon: 'people' },
            { key: 'gate_pass', label: 'Passes', icon: 'clipboard-outline', activeIcon: 'clipboard' },
            { key: 'chat', label: 'Messages', icon: 'chatbubble-outline', activeIcon: 'chatbubble' },
            { key: 'settings', label: 'Account', icon: 'person-outline', activeIcon: 'person' },
          ]
        : [
            { key: 'home', label: 'Home', icon: 'home-outline', activeIcon: 'home' },
            { key: 'class_list', label: 'Classes', icon: 'book-outline', activeIcon: 'book' },
            { key: 'gate_pass', label: 'Passes', icon: 'clipboard-outline', activeIcon: 'clipboard' },
            { key: 'chat', label: 'Messages', icon: 'chatbubble-outline', activeIcon: 'chatbubble' },
            { key: 'menu', label: 'Profile', icon: 'person-outline', activeIcon: 'person' },
          ],
    [isParentUser]
  );

  const menuSubTabs: TabType[] = ['menu', 'settings', 'calendar', 'dtr', 'reports', 'scanner'];
  const resolvedNavKey: TabType = isParentUser
    ? activeTab
    : menuSubTabs.includes(activeTab)
      ? 'menu'
      : activeTab;

  return (
    <View style={styles.container}>
      <View style={styles.screenContainer}>
        {activeTab === 'home' &&
          (isParentUser ? (
            <ParentPortalScreen onNavigate={setActiveTab} />
          ) : (
            <DashboardScreen onNavigate={setActiveTab} />
          ))}
        {activeTab === 'class_list' && !isParentUser && <AdvisoryMatrixScreen />}
        {activeTab === 'gate_pass' && <GatePassScreen onBack={() => setActiveTab('home')} />}
        {activeTab === 'chat' && <ChatScreen />}
        {activeTab === 'menu' && !isParentUser && <MenuScreen onSelectScreen={setActiveTab} />}
        {activeTab === 'scanner' && !isParentUser && (
          <ScannerScreen onBack={() => setActiveTab('menu')} />
        )}
        {activeTab === 'reports' && !isParentUser && (
          <View style={styles.subScreenFill}>
            {renderSubHeader('School Reports', 'SF1, SF2, SF4 and Form 48 records', 'menu')}
            <ReportsScreen embedded />
          </View>
        )}
        {activeTab === 'calendar' && (
          <View style={styles.subScreenFill}>
            {renderSubHeader(
              'School Calendar',
              'Suspensions, holidays and schedules',
              isParentUser ? 'home' : 'menu'
            )}
            <CalendarScreen />
          </View>
        )}
        {activeTab === 'settings' && (
          <View style={styles.subScreenFill}>
            {renderSubHeader(
              'Settings',
              'Profile, color mode and server address',
              isParentUser ? 'home' : 'menu'
            )}
            <SettingsScreen />
          </View>
        )}
        {activeTab === 'dtr' && !isParentUser && (
          <View style={styles.subScreenFill}>
            {renderSubHeader('Daily Time Record', 'Civil Service Form No. 48', 'menu')}
            <ScrollView
              contentContainerStyle={styles.subScreenScroll}
              showsVerticalScrollIndicator={false}
              refreshControl={
                <RefreshControl
                  refreshing={dtrLoading}
                  onRefresh={() => void fetchDTR(false)}
                  colors={[palette.primary]}
                  tintColor={palette.primary}
                />
              }
            >
              {dtrLoading && !dtrData ? (
                <View style={styles.loadingBox}>
                  <ActivityIndicator size="small" color={palette.primary} />
                  <Text style={styles.loadingText}>Loading attendance records...</Text>
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
                  onRefreshNeeded={() => void fetchDTR(true)}
                />
              )}
            </ScrollView>
          </View>
        )}
      </View>

      {/* Floating Bottom Navigation Dock */}
      <View
        style={[
          styles.floatingDockWrapper,
          { paddingBottom: Math.max(insets.bottom, 10) },
        ]}
        pointerEvents="box-none"
      >
        <View style={styles.floatingDock}>
          {navItems.map((item) => {
            const isFocused = resolvedNavKey === item.key;
            return (
              <TouchableOpacity
                key={item.key}
                onPress={() => setActiveTab(item.key)}
                activeOpacity={0.8}
                style={[styles.navPillBtn, isFocused && styles.navPillBtnActive]}
                accessibilityRole="tab"
                accessibilityState={{ selected: isFocused }}
                accessibilityLabel={item.label}
              >
                <Ionicons
                  name={isFocused ? item.activeIcon : item.icon}
                  size={20}
                  color={isFocused ? palette.primary : palette.textMuted}
                />
                {isFocused && (
                  <Text style={styles.navPillText} numberOfLines={1}>
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

const createStyles = (palette: ThemePalette, fonts: ReturnType<typeof useThemeMode>['fonts']) =>
  StyleSheet.create({
    container: { flex: 1, backgroundColor: palette.background },
    screenContainer: { flex: 1 },
    subScreenFill: { flex: 1, backgroundColor: palette.background },
    subHeader: {
      backgroundColor: palette.headerBg,
      paddingHorizontal: 18,
      paddingBottom: 20,
      borderBottomLeftRadius: 28,
      borderBottomRightRadius: 28,
    },
    subHeaderTop: {
      flexDirection: 'row',
      alignItems: 'center',
    },
    subHeaderTextWrap: {
      flex: 1,
      marginLeft: 12,
    },
    backCircle: {
      width: 40,
      height: 40,
      borderRadius: 20,
      backgroundColor: palette.headerSurface,
      alignItems: 'center',
      justifyContent: 'center',
    },
    subHeaderEyebrow: {
      fontSize: fonts.xxs,
      fontWeight: fonts.weight.bold,
      color: palette.onPrimary,
      opacity: 0.8,
      letterSpacing: 0.8,
    },
    subHeaderTitle: {
      fontSize: fonts.xl,
      fontWeight: fonts.weight.extrabold,
      color: palette.onPrimary,
      marginTop: 2,
    },
    subHeaderSubtitle: {
      fontSize: fonts.sm,
      color: palette.onPrimary,
      opacity: 0.88,
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
      fontSize: fonts.sm,
      color: palette.textMuted,
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
      backgroundColor: palette.surface,
      borderRadius: 32,
      paddingVertical: 8,
      paddingHorizontal: 10,
      borderWidth: 1,
      borderColor: palette.border,
      ...Platform.select({
        ios: {
          shadowColor: palette.isDark ? '#000000' : '#0f172a',
          shadowOffset: { width: 0, height: 8 },
          shadowOpacity: palette.isDark ? 0.35 : 0.12,
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
      backgroundColor: palette.primarySoft,
    },
    navPillText: {
      fontSize: fonts.sm,
      fontWeight: fonts.weight.extrabold,
      color: palette.primary,
    },
  });

export default MainTabNavigator;