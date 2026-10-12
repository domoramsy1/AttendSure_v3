import React, { useState } from 'react';
import { View, StyleSheet, TouchableOpacity, Text, Platform } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { COLORS } from '../constants/theme';

import HomeScreen from '../screens/HomeScreen';
import CalendarScreen from '../screens/CalendarScreen';
import ScannerScreen from '../screens/ScannerScreen';
import SmsLogsScreen from '../screens/SmsLogsScreen';
import SettingsScreen from '../screens/SettingsScreen';

type TabType = 'home' | 'calendar' | 'scanner' | 'sms' | 'settings';

export const MainTabNavigator: React.FC = () => {
  const insets = useSafeAreaInsets();
  const [activeTab, setActiveTab] = useState<TabType>('home');

  return (
    <View style={styles.container}>
      <View style={styles.screenContainer}>
        {activeTab === 'home' && <HomeScreen />}
        {activeTab === 'calendar' && <CalendarScreen />}
        {activeTab === 'scanner' && <ScannerScreen />}
        {activeTab === 'sms' && <SmsLogsScreen />}
        {activeTab === 'settings' && <SettingsScreen />}
      </View>

      {/* Floating Bottom Tab Bar */}
      <View
        style={[
          styles.bottomBar,
          {
            paddingBottom: Math.max(insets.bottom, 8),
            height: 60 + Math.max(insets.bottom, 8),
          },
        ]}
      >
        {/* Tab 1: Faculty Dashboard & Analytics */}
        <TouchableOpacity
          style={styles.tabItem}
          onPress={() => setActiveTab('home')}
          activeOpacity={0.7}
        >
          <Ionicons
            name={activeTab === 'home' ? 'grid' : 'grid-outline'}
            size={22}
            color={activeTab === 'home' ? COLORS.primary : COLORS.textMuted}
          />
          <Text style={[styles.tabLabel, activeTab === 'home' && styles.tabLabelActive]}>
            Dashboard
          </Text>
        </TouchableOpacity>

        {/* Tab 2: Academic Calendar */}
        <TouchableOpacity
          style={styles.tabItem}
          onPress={() => setActiveTab('calendar')}
          activeOpacity={0.7}
        >
          <Ionicons
            name={activeTab === 'calendar' ? 'calendar' : 'calendar-outline'}
            size={22}
            color={activeTab === 'calendar' ? COLORS.primary : COLORS.textMuted}
          />
          <Text style={[styles.tabLabel, activeTab === 'calendar' && styles.tabLabelActive]}>
            Calendar
          </Text>
        </TouchableOpacity>

        {/* Tab 3: Center Elevated Scanner FAB */}
        <TouchableOpacity
          style={styles.centerFab}
          onPress={() => setActiveTab('scanner')}
          activeOpacity={0.85}
        >
          <View style={[styles.fabBox, activeTab === 'scanner' && styles.fabBoxActive]}>
            <Ionicons name="qr-code" size={26} color="#ffffff" />
          </View>
        </TouchableOpacity>

        {/* Tab 4: Live SMS Outbox */}
        <TouchableOpacity
          style={styles.tabItem}
          onPress={() => setActiveTab('sms')}
          activeOpacity={0.7}
        >
          <Ionicons
            name={activeTab === 'sms' ? 'chatbubble-ellipses' : 'chatbubble-ellipses-outline'}
            size={22}
            color={activeTab === 'sms' ? COLORS.primary : COLORS.textMuted}
          />
          <Text style={[styles.tabLabel, activeTab === 'sms' && styles.tabLabelActive]}>
            SMS Logs
          </Text>
        </TouchableOpacity>

        {/* Tab 5: Application Settings */}
        <TouchableOpacity
          style={styles.tabItem}
          onPress={() => setActiveTab('settings')}
          activeOpacity={0.7}
        >
          <Ionicons
            name={activeTab === 'settings' ? 'settings' : 'settings-outline'}
            size={22}
            color={activeTab === 'settings' ? COLORS.primary : COLORS.textMuted}
          />
          <Text style={[styles.tabLabel, activeTab === 'settings' && styles.tabLabelActive]}>
            Settings
          </Text>
        </TouchableOpacity>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.background,
  },
  screenContainer: {
    flex: 1,
  },
  bottomBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-around',
    backgroundColor: COLORS.surface,
    borderTopWidth: 1,
    borderTopColor: COLORS.border,
    paddingTop: 6,
    ...Platform.select({
      ios: {
        shadowColor: COLORS.primaryDark,
        shadowOffset: { width: 0, height: -3 },
        shadowOpacity: 0.08,
        shadowRadius: 8,
      },
      android: {
        elevation: 10,
      },
    }),
  },
  tabItem: {
    alignItems: 'center',
    justifyContent: 'center',
    flex: 1,
  },
  tabLabel: {
    fontSize: 10,
    fontWeight: '600',
    color: COLORS.textMuted,
    marginTop: 3,
  },
  tabLabelActive: {
    color: COLORS.primary,
    fontWeight: '800',
  },
  centerFab: {
    top: -16,
    alignItems: 'center',
    justifyContent: 'center',
    width: 60,
  },
  fabBox: {
    width: 54,
    height: 54,
    borderRadius: 18,
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
      android: {
        elevation: 8,
      },
    }),
  },
  fabBoxActive: {
    backgroundColor: COLORS.primaryDark,
    transform: [{ scale: 1.05 }],
  },
});

export default MainTabNavigator;