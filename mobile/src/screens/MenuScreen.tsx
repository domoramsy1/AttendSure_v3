// D:\AttendSure_V3\mobile\src\screens\MenuScreen.tsx

import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  Image,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useAuth } from '../context/AuthContext';
import { TabType } from '../navigation/MainTabNavigator';

interface MenuScreenProps {
  onSelectScreen: (screen: TabType) => void;
}

// Cybersecurity: Validate avatar URL against injection and unsafe URI protocols
const isSafeImageUrl = (url?: string | null): url is string => {
  if (!url || typeof url !== 'string') return false;
  const clean = url.trim().toLowerCase();
  if (!clean || clean === 'null' || clean === 'undefined' || clean === 'none') {
    return false;
  }
  if (clean.startsWith('javascript:') || clean.startsWith('vbscript:')) {
    return false;
  }
  if (clean.startsWith('data:') && !clean.startsWith('data:image/')) {
    return false;
  }
  return (
    clean.startsWith('http://') ||
    clean.startsWith('https://') ||
    clean.startsWith('/') ||
    clean.startsWith('data:image/') ||
    clean.startsWith('blob:')
  );
};

export const MenuScreen: React.FC<MenuScreenProps> = ({ onSelectScreen }) => {
  const insets = useSafeAreaInsets();
  const { user, logout } = useAuth();
  const [photoError, setPhotoError] = useState(false);

  const userRole = String(user?.role || user?.system_role || 'EMPLOYEE').toUpperCase();
  const isAdmin = userRole === 'ADMIN' || userRole === 'SUPERADMIN' || Boolean(user?.is_superuser);
  const isDeptHead = userRole === 'DEPT_HEAD' || isAdmin;
  const isGuard = userRole === 'GUARD' || userRole === 'SECURITY';

  const displayName =
    user?.full_name ||
    `${user?.first_name || ''} ${user?.last_name || ''}`.trim() ||
    user?.username ||
    'Employee';

  const employeeId = user?.employee_id || user?.faculty_id || user?.username || 'ID Pending';

  // Strict string type narrowing: prevents null assignment to Image source.uri
  const photoUri: string | null =
    typeof user?.photo === 'string' && isSafeImageUrl(user.photo) && !photoError
      ? user.photo
      : null;

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={[
        styles.scrollContent,
        { paddingTop: Math.max(insets.top, 16), paddingBottom: 110 },
      ]}
      showsVerticalScrollIndicator={false}
    >
      {/* Employee Profile Header Card */}
      <View style={styles.userCard}>
        <View style={styles.userRow}>
          {photoUri ? (
            <Image
              source={{ uri: photoUri }}
              style={styles.avatarImage}
              onError={() => setPhotoError(true)}
            />
          ) : (
            <View style={styles.avatarFallback}>
              <Ionicons name="person" size={26} color="#ffffff" />
            </View>
          )}
          <View style={{ flex: 1, marginLeft: 12 }}>
            <Text style={styles.userName} numberOfLines={1}>
              {displayName}
            </Text>
            <Text style={styles.userMeta}>
              {userRole} &bull; Employee ID: {employeeId}
            </Text>
          </View>
        </View>
      </View>

      {/* Section 1: Academics, Clearances & Attendance */}
      <Text style={styles.sectionHeader}>ACADEMICS &amp; CLEARANCES</Text>
      <View style={styles.menuGroup}>
        {/* Gate Passes & Exit Clearance */}
        <TouchableOpacity
          style={styles.menuItem}
          onPress={() => onSelectScreen('gate_pass')}
          activeOpacity={0.7}
        >
          <View style={[styles.iconWrap, { backgroundColor: '#e0f2fe' }]}>
            <Ionicons name="ticket-outline" size={19} color="#004b87" />
          </View>
          <View style={styles.itemBody}>
            <Text style={styles.itemTitle}>Gate Passes &amp; Exit Slips</Text>
            <Text style={styles.itemSub}>Issue, view, and verify student exit clearances</Text>
          </View>
          <Ionicons name="chevron-forward" size={18} color="#94a3b8" />
        </TouchableOpacity>

        {/* Civil Service Form No. 48 (DTR) */}
        {!isGuard && (
          <TouchableOpacity
            style={styles.menuItem}
            onPress={() => onSelectScreen('dtr')}
            activeOpacity={0.7}
          >
            <View style={[styles.iconWrap, { backgroundColor: '#dcfce7' }]}>
              <Ionicons name="time-outline" size={19} color="#16a34a" />
            </View>
            <View style={styles.itemBody}>
              <Text style={styles.itemTitle}>Daily Time Record (Form 48)</Text>
              <Text style={styles.itemSub}>Monthly hours summary and submission</Text>
            </View>
            <Ionicons name="chevron-forward" size={18} color="#94a3b8" />
          </TouchableOpacity>
        )}

        {/* Academic Calendar */}
        <TouchableOpacity
          style={styles.menuItem}
          onPress={() => onSelectScreen('calendar')}
          activeOpacity={0.7}
        >
          <View style={[styles.iconWrap, { backgroundColor: '#fef3c7' }]}>
            <Ionicons name="calendar-outline" size={19} color="#d97706" />
          </View>
          <View style={styles.itemBody}>
            <Text style={styles.itemTitle}>Academic Calendar</Text>
            <Text style={styles.itemSub}>Quarter schedules, exam dates, and holidays</Text>
          </View>
          <Ionicons name="chevron-forward" size={18} color="#94a3b8" />
        </TouchableOpacity>

        {/* Profile Settings */}
        <TouchableOpacity
          style={styles.menuItem}
          onPress={() => onSelectScreen('settings')}
          activeOpacity={0.7}
        >
          <View style={[styles.iconWrap, { backgroundColor: '#ede9fe' }]}>
            <Ionicons name="person-outline" size={19} color="#7c3aed" />
          </View>
          <View style={styles.itemBody}>
            <Text style={styles.itemTitle}>Profile Settings</Text>
            <Text style={styles.itemSub}>Profile details and account security</Text>
          </View>
          <Ionicons name="chevron-forward" size={18} color="#94a3b8" />
        </TouchableOpacity>

        {/* Parent SMS Logs */}
        <TouchableOpacity
          style={styles.menuItem}
          onPress={() => onSelectScreen('sms')}
          activeOpacity={0.7}
        >
          <View style={[styles.iconWrap, { backgroundColor: '#f1f5f9' }]}>
            <Ionicons name="chatbubble-ellipses-outline" size={19} color="#475569" />
          </View>
          <View style={styles.itemBody}>
            <Text style={styles.itemTitle}>SMS Delivery Logs</Text>
            <Text style={styles.itemSub}>Outbox queue and parent tap alerts</Text>
          </View>
          <Ionicons name="chevron-forward" size={18} color="#94a3b8" />
        </TouchableOpacity>
      </View>

      {/* Section 2: Department Head Oversight */}
      {isDeptHead && (
        <>
          <Text style={styles.sectionHeader}>DEPARTMENT SUPERVISION</Text>
          <View style={styles.menuGroup}>
            <TouchableOpacity
              style={styles.menuItem}
              onPress={() => onSelectScreen('dept_monitor')}
              activeOpacity={0.7}
            >
              <View style={[styles.iconWrap, { backgroundColor: '#ffedd5' }]}>
                <Ionicons name="stats-chart-outline" size={18} color="#ea580c" />
              </View>
              <View style={styles.itemBody}>
                <Text style={styles.itemTitle}>Employee Attendance</Text>
                <Text style={styles.itemSub}>Campus perimeter duty presence</Text>
              </View>
              <Ionicons name="chevron-forward" size={18} color="#94a3b8" />
            </TouchableOpacity>
          </View>
        </>
      )}

      {/* Section 3: Campus Hardware & Security */}
      {(isAdmin || isGuard) && (
        <>
          <Text style={styles.sectionHeader}>CAMPUS HARDWARE &amp; SECURITY</Text>
          <View style={styles.menuGroup}>
            <TouchableOpacity
              style={styles.menuItem}
              onPress={() => onSelectScreen('gate_feed')}
              activeOpacity={0.7}
            >
              <View style={[styles.iconWrap, { backgroundColor: '#fee2e2' }]}>
                <Ionicons name="shield-outline" size={18} color="#dc2626" />
              </View>
              <View style={styles.itemBody}>
                <Text style={styles.itemTitle}>Gate Scanner Feed</Text>
                <Text style={styles.itemSub}>Live RFID &amp; QR taps at Gate Kiosks</Text>
              </View>
              <Ionicons name="chevron-forward" size={18} color="#94a3b8" />
            </TouchableOpacity>

            {isAdmin && (
              <TouchableOpacity
                style={styles.menuItem}
                onPress={() => onSelectScreen('device_approval')}
                activeOpacity={0.7}
              >
                <View style={[styles.iconWrap, { backgroundColor: '#e0e7ff' }]}>
                  <Ionicons name="phone-portrait-outline" size={18} color="#4338ca" />
                </View>
                <View style={styles.itemBody}>
                  <Text style={styles.itemTitle}>Device Approvals</Text>
                  <Text style={styles.itemSub}>Manage authorized mobile phones</Text>
                </View>
                <Ionicons name="chevron-forward" size={18} color="#94a3b8" />
              </TouchableOpacity>
            )}

            <TouchableOpacity
              style={styles.menuItem}
              onPress={() => onSelectScreen('kiosk_health')}
              activeOpacity={0.7}
            >
              <View style={[styles.iconWrap, { backgroundColor: '#f1f5f9' }]}>
                <Ionicons name="hardware-chip-outline" size={18} color="#475569" />
              </View>
              <View style={styles.itemBody}>
                <Text style={styles.itemTitle}>Gate Kiosk Health</Text>
                <Text style={styles.itemSub}>Scanner ping latency and queue health</Text>
              </View>
              <Ionicons name="chevron-forward" size={18} color="#94a3b8" />
            </TouchableOpacity>
          </View>
        </>
      )}

      {/* Log Out Button */}
      <TouchableOpacity style={styles.logoutBtn} onPress={logout} activeOpacity={0.8}>
        <Ionicons name="log-out-outline" size={18} color="#dc2626" />
        <Text style={styles.logoutText}>Sign Out</Text>
      </TouchableOpacity>
    </ScrollView>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f8fafc' },
  scrollContent: { paddingHorizontal: 16 },
  userCard: {
    backgroundColor: '#ffffff',
    borderRadius: 16,
    padding: 14,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: '#e2e8f0',
  },
  userRow: { flexDirection: 'row', alignItems: 'center' },
  avatarImage: { width: 48, height: 48, borderRadius: 24, borderWidth: 1, borderColor: '#cbd5e1' },
  avatarFallback: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: '#004b87',
    alignItems: 'center',
    justifyContent: 'center',
  },
  userName: { fontSize: 16, fontWeight: '800', color: '#0f172a' },
  userMeta: { fontSize: 11.5, color: '#64748b', marginTop: 2, fontWeight: '600' },
  sectionHeader: {
    fontSize: 11,
    fontWeight: '800',
    color: '#64748b',
    letterSpacing: 0.6,
    marginBottom: 8,
    marginLeft: 4,
  },
  menuGroup: {
    backgroundColor: '#ffffff',
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#e2e8f0',
    marginBottom: 16,
    overflow: 'hidden',
  },
  menuItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    paddingHorizontal: 14,
    borderBottomWidth: 1,
    borderBottomColor: '#f1f5f9',
  },
  iconWrap: {
    width: 36,
    height: 36,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  itemBody: { flex: 1 },
  itemTitle: { fontSize: 13.5, fontWeight: '700', color: '#0f172a' },
  itemSub: { fontSize: 11, color: '#64748b', marginTop: 1 },
  logoutBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    backgroundColor: '#fee2e2',
    borderWidth: 1,
    borderColor: '#fca5a5',
    paddingVertical: 12,
    borderRadius: 12,
    marginTop: 4,
  },
  logoutText: { color: '#dc2626', fontSize: 13, fontWeight: '800' },
});

export default MenuScreen; 