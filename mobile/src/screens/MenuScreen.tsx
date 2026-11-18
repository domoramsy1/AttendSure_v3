/**
 * AttendSure Mobile - Profile, Color Mode Switcher & School Tools
 * File: mobile/src/screens/MenuScreen.tsx
 */

import React, { useState, useEffect, useCallback } from 'react';
import { View, Text, TouchableOpacity, ScrollView, Image } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useAuth } from '../context/AuthContext';
import { useThemeMode } from '../context/ThemeContext';
import { isSafeUrl, type ThemeMode } from '../constants/theme';
import { apiClient } from '../api/client';
import { TabType } from '../navigation/MainTabNavigator';

interface MenuScreenProps {
  onSelectScreen: (screen: TabType) => void;
}

export const MenuScreen: React.FC<MenuScreenProps> = ({ onSelectScreen }) => {
  const insets = useSafeAreaInsets();
  const { user, logout } = useAuth();
  const { mode, setThemeMode, palette, ui, fonts } = useThemeMode();

  const [tab, setTab] = useState<'INFO' | 'TOOLS' | 'ACCOUNT'>('INFO');
  const [photoError, setPhotoError] = useState(false);
  const [stats, setStats] = useState({ rate: 100, scans: 0, students: 0, alerts: 0, classes: 1 });

  const loadStats = useCallback(async () => {
    try {
      const [ov, cls] = await Promise.allSettled([
        apiClient.get('dashboard/overview/'),
        apiClient.get('classroom/class_list/'),
      ]);
      const d = ov.status === 'fulfilled' ? ov.value.data : {};
      const c = cls.status === 'fulfilled' && Array.isArray(cls.value.data) ? cls.value.data.length : 1;
      setStats({
        rate: Number(d?.attendance_rate ?? 100),
        scans: Number(d?.classroom_scans_today ?? d?.gate_scans_today ?? 0),
        students: Number(d?.total_students ?? 0),
        alerts: Number(d?.push_alerts_today ?? 0),
        classes: c || 1,
      });
    } catch {}
  }, []);

  useEffect(() => {
    loadStats();
  }, [loadStats]);

  const role = String(user?.role || user?.system_role || 'FACULTY').toUpperCase();
  const name = user?.full_name || `${user?.first_name || ''} ${user?.last_name || ''}`.trim() || user?.username || 'Faculty';
  const empId = user?.employee_id || user?.faculty_id || user?.username || 'ID-001';
  const dept = user?.department || 'Junior High School';
  const email = user?.email || `${user?.username || 'faculty'}@attendsure.edu.ph`;
  const photo = typeof user?.photo === 'string' && isSafeUrl(user.photo) && !photoError ? user.photo : null;

  const themes: { key: ThemeMode; label: string; icon: keyof typeof Ionicons.glyphMap }[] = [
    { key: 'light', label: 'Light', icon: 'sunny-outline' },
    { key: 'dark', label: 'Dark', icon: 'moon-outline' },
    { key: 'high-contrast', label: 'Daylight', icon: 'contrast-outline' },
  ];

  const tools: { key: TabType; title: string; sub: string; icon: keyof typeof Ionicons.glyphMap }[] = [
    { key: 'scanner', title: 'Face & Location Check-In', sub: 'Verify your school attendance', icon: 'scan-outline' },
    { key: 'dtr', title: 'Daily Time Record (Form 48)', sub: 'View and submit monthly hours', icon: 'time-outline' },
    { key: 'reports', title: 'School Forms (SF1, SF2, SF4)', sub: 'View official attendance forms', icon: 'document-text-outline' },
    { key: 'calendar', title: 'School Calendar', sub: 'Holidays and class suspensions', icon: 'calendar-outline' },
    { key: 'settings', title: 'Settings', sub: 'Password, profile and server address', icon: 'settings-outline' },
  ];

  return (
    <ScrollView style={ui.screen} contentContainerStyle={{ paddingBottom: 120 }} showsVerticalScrollIndicator={false}>
      {/* Top Profile Banner */}
      <View style={{ backgroundColor: palette.headerBg, paddingTop: Math.max(insets.top, 14), paddingHorizontal: 18, paddingBottom: 20, borderBottomLeftRadius: 26, borderBottomRightRadius: 26 }}>
        <View style={ui.rowBetween}>
          <Text style={{ fontSize: fonts.xl, fontWeight: fonts.weight.extrabold, color: '#ffffff' }}>My Profile</Text>
          <TouchableOpacity onPress={() => onSelectScreen('settings')} style={{ padding: 8, borderRadius: 18, backgroundColor: 'rgba(255,255,255,0.2)' }}>
            <Ionicons name="settings-outline" size={18} color="#ffffff" />
          </TouchableOpacity>
        </View>

        <View style={{ alignItems: 'center', marginTop: 10 }}>
          <View style={{ width: 72, height: 72, borderRadius: 36, backgroundColor: '#ffffff', alignItems: 'center', justifyContent: 'center', overflow: 'hidden', marginBottom: 8 }}>
            {photo ? <Image source={{ uri: photo }} style={{ width: '100%', height: '100%' }} onError={() => setPhotoError(true)} /> : <Ionicons name="person" size={36} color={palette.primary} />}
          </View>
          <Text style={{ fontSize: 18, fontWeight: fonts.weight.extrabold, color: '#ffffff' }}>{name}</Text>
          <Text style={{ fontSize: fonts.xs, color: '#dbe4ff', marginTop: 2 }}>{dept} • ID {empId}</Text>
        </View>

        <View style={{ flexDirection: 'row', backgroundColor: palette.headerSurface, borderRadius: 14, paddingVertical: 10, marginTop: 14 }}>
          {[
            { val: stats.scans, lbl: 'Scans Today' },
            { val: `${stats.rate}%`, lbl: 'Attendance' },
            { val: stats.classes, lbl: 'Classes' },
          ].map((s, idx) => (
            <View key={idx} style={{ flex: 1, alignItems: 'center' }}>
              <Text style={{ fontSize: 16, fontWeight: fonts.weight.black, color: '#ffffff' }}>{s.val}</Text>
              <Text style={{ fontSize: fonts.xxs, color: '#dbe4ff' }}>{s.lbl}</Text>
            </View>
          ))}
        </View>
      </View>

      <View style={{ padding: 16, gap: 12 }}>
        {/* Color Mode Switcher */}
        <View style={ui.card}>
          <Text style={ui.label}>SCREEN COLOR MODE</Text>
          <View style={{ flexDirection: 'row', gap: 8, marginTop: 4 }}>
            {themes.map((t) => {
              const active = mode === t.key;
              return (
                <TouchableOpacity
                  key={t.key}
                  onPress={() => setThemeMode(t.key)}
                  style={[ui.buttonSecondary, { flex: 1, backgroundColor: active ? palette.primary : palette.surfaceSubtle, borderColor: active ? palette.primary : palette.border }]}
                >
                  <Ionicons name={t.icon} size={15} color={active ? '#ffffff' : palette.textSecondary} />
                  <Text style={{ fontSize: fonts.xs, fontWeight: fonts.weight.extrabold, color: active ? '#ffffff' : palette.textSecondary }}>{t.label}</Text>
                </TouchableOpacity>
              );
            })}
          </View>
        </View>

        {/* Simple Tabs */}
        <View style={[ui.box, { flexDirection: 'row', padding: 4 }]}>
          {(['INFO', 'TOOLS', 'ACCOUNT'] as const).map((k) => {
            const active = tab === k;
            return (
              <TouchableOpacity
                key={k}
                onPress={() => setTab(k)}
                style={{ flex: 1, paddingVertical: 8, alignItems: 'center', borderRadius: 8, backgroundColor: active ? palette.surface : 'transparent' }}
              >
                <Text style={{ fontSize: fonts.xs, fontWeight: fonts.weight.extrabold, color: active ? palette.primary : palette.textMuted }}>{k}</Text>
              </TouchableOpacity>
            );
          })}
        </View>

        {tab === 'INFO' && (
          <View style={ui.card}>
            <Text style={ui.heading}>Faculty Details</Text>
            {[
              { k: 'NAME', v: name },
              { k: 'ID NUMBER', v: empId },
              { k: 'DEPARTMENT', v: dept },
              { k: 'EMAIL', v: email },
              { k: 'ROLE', v: role },
              { k: 'TOTAL STUDENTS', v: String(stats.students) },
              { k: 'PARENT ALERTS TODAY', v: String(stats.alerts) },
            ].map((r, i) => (
              <View key={i} style={[ui.rowBetween, { paddingVertical: 8, borderBottomWidth: i === 6 ? 0 : 1, borderBottomColor: palette.border }]}>
                <Text style={ui.label}>{r.k}</Text>
                <Text style={{ fontSize: fonts.sm, fontWeight: fonts.weight.extrabold, color: palette.textPrimary }}>{r.v}</Text>
              </View>
            ))}
          </View>
        )}

        {tab === 'TOOLS' && (
          <View style={{ gap: 8 }}>
            {tools.map((t) => (
              <TouchableOpacity key={t.key} style={[ui.card, ui.rowBetween, { marginBottom: 0 }]} onPress={() => onSelectScreen(t.key)}>
                <View style={ui.rowCenter}>
                  <View style={{ width: 38, height: 38, borderRadius: 10, backgroundColor: palette.primarySoft, alignItems: 'center', justifyContent: 'center' }}>
                    <Ionicons name={t.icon} size={18} color={palette.primary} />
                  </View>
                  <View>
                    <Text style={{ fontSize: fonts.md, fontWeight: fonts.weight.extrabold, color: palette.textPrimary }}>{t.title}</Text>
                    <Text style={ui.subtext}>{t.sub}</Text>
                  </View>
                </View>
                <Ionicons name="chevron-forward" size={18} color={palette.textMuted} />
              </TouchableOpacity>
            ))}
          </View>
        )}

        {tab === 'ACCOUNT' && (
          <View style={ui.card}>
            <Text style={ui.heading}>Account Options</Text>
            <TouchableOpacity style={[ui.buttonSecondary, { marginBottom: 10 }]} onPress={() => onSelectScreen('settings')}>
              <Ionicons name="key-outline" size={16} color={palette.textPrimary} />
              <Text style={ui.buttonSecondaryText}>Change Password or Server</Text>
            </TouchableOpacity>
            <TouchableOpacity style={[ui.buttonPrimary, { backgroundColor: palette.danger }]} onPress={logout}>
              <Ionicons name="log-out-outline" size={16} color="#ffffff" />
              <Text style={ui.buttonPrimaryText}>Sign Out</Text>
            </TouchableOpacity>
          </View>
        )}
      </View>
    </ScrollView>
  );
};

export default MenuScreen;