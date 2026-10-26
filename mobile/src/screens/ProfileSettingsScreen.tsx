// D:\AttendSure_V3\mobile\src\screens\ProfileSettingsScreen.tsx

import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  Alert,
  RefreshControl,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import QRCode from 'react-native-qrcode-svg';
import { Image } from 'expo-image';
import { useAuth } from '../context/AuthContext';
import { apiClient } from '../api/client';

interface LiveFacultyProfile {
  id: number;
  employee_id: string;
  first_name: string;
  last_name: string;
  full_name: string;
  position: string;
  department: string;
  phone_number?: string;
  email?: string;
  photo_url?: string | null;
  photo?: string | null;
  bound_device_id?: string | null;
  device_bound_at?: string | null;
}

interface ExtendedSessionUser {
  id?: number | string;
  username?: string;
  name?: string;
  first_name?: string;
  last_name?: string;
  employee_id?: string;
  role?: string;
  device_id?: string;
  bound_device_id?: string;
}

export const ProfileSettingsScreen: React.FC = () => {
  const navigation = useNavigation();
  const { user, logout } = useAuth();

  const [profile, setProfile] = useState<LiveFacultyProfile | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [refreshing, setRefreshing] = useState<boolean>(false);
  const [qrTimestamp, setQrTimestamp] = useState<number>(Date.now());

  // Fixed endpoint: points to verified 'me/' route instead of non-existent 'faculty/me/'
  const fetchProfile = useCallback(async () => {
    try {
      const res = await apiClient.get<LiveFacultyProfile>('me/', { timeout: 8000 });
      if (res.data) {
        setProfile(res.data);
      }
    } catch {
      // Safe fallback to existing session
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    fetchProfile();
  }, [fetchProfile]);

  useEffect(() => {
    const timer = setInterval(() => {
      setQrTimestamp(Date.now());
    }, 60000);
    return () => clearInterval(timer);
  }, []);

  const onRefresh = () => {
    setRefreshing(true);
    setQrTimestamp(Date.now());
    fetchProfile();
  };

  const handleLogout = () => {
    Alert.alert('Sign Out', 'Sign out of AttendSure on this device?', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Sign Out', style: 'destructive', onPress: async () => await logout() },
    ]);
  };

  const sessionUser = user as ExtendedSessionUser | null;
  const displayName = profile?.full_name || sessionUser?.name || sessionUser?.username || 'Employee';
  const displayId = profile?.employee_id || sessionUser?.employee_id || 'ID Pending';
  const displayPosition = profile?.position || sessionUser?.role || 'Academic Staff';
  const displayDept = profile?.department || 'Department Unassigned';
  const boundDeviceId = profile?.bound_device_id || sessionUser?.device_id || sessionUser?.bound_device_id || null;

  const gatePassPayload = JSON.stringify({
    app: 'ATTENDSURE_GATE_V3',
    emp_id: displayId,
    name: displayName,
    ts: qrTimestamp,
    dev_id: boundDeviceId ? boundDeviceId.slice(0, 8) : 'UNBOUND',
  });

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <View style={styles.appBar}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backButton}>
          <Ionicons name="arrow-back" size={22} color="#0f172a" />
        </TouchableOpacity>
        <Text style={styles.appBarTitle}>Faculty Profile &amp; Pass</Text>
        <View style={{ width: 40 }} />
      </View>

      <ScrollView
        contentContainerStyle={styles.scrollContent}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} colors={['#004b87']} />}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.profileCard}>
          <View style={styles.avatarContainer}>
            {profile?.photo_url || profile?.photo ? (
              <Image source={{ uri: profile.photo_url || profile.photo || '' }} style={styles.avatarImage} contentFit="cover" />
            ) : (
              <Ionicons name="person" size={40} color="#004b87" />
            )}
          </View>

          <Text style={styles.profileName}>{displayName}</Text>
          <Text style={styles.profileRole}>{displayPosition}</Text>
          <Text style={styles.profileDept}>{displayDept}</Text>

          <View style={styles.badgeRow}>
            <View style={styles.idBadge}>
              <Ionicons name="card-outline" size={13} color="#004b87" />
              <Text style={styles.idBadgeText}>ID: {displayId}</Text>
            </View>

            <View style={[styles.statusBadge, boundDeviceId ? styles.statusActive : styles.statusPending]}>
              <Ionicons
                name={boundDeviceId ? 'shield-checkmark' : 'shield-outline'}
                size={13}
                color={boundDeviceId ? '#059669' : '#d97706'}
              />
              <Text style={[styles.statusBadgeText, { color: boundDeviceId ? '#059669' : '#d97706' }]}>
                {boundDeviceId ? 'Hardware Paired' : 'Unbound'}
              </Text>
            </View>
          </View>
        </View>

        <View style={styles.qrCard}>
          <View style={styles.qrHeader}>
            <Ionicons name="qr-code-outline" size={20} color="#004b87" />
            <Text style={styles.qrCardTitle}>Official Gate Clearance Pass</Text>
          </View>
          <Text style={styles.qrSubtitle}>
            Present this dynamic QR code to campus gate kiosks for physical check-in and check-out.
          </Text>

          <View style={styles.qrWrapper}>
            {loading ? (
              <ActivityIndicator size="large" color="#004b87" />
            ) : (
              <QRCode value={gatePassPayload} size={180} color="#004b87" backgroundColor="#ffffff" />
            )}
          </View>

          <View style={styles.qrFooter}>
            <Ionicons name="sync-outline" size={13} color="#64748b" />
            <Text style={styles.qrFooterText}>Auto-refreshes every 60s to prevent screenshot reuse</Text>
          </View>
        </View>

        <TouchableOpacity style={styles.logoutButton} onPress={handleLogout} activeOpacity={0.8}>
          <Ionicons name="log-out-outline" size={18} color="#dc2626" />
          <Text style={styles.logoutText}>Sign Out of Device</Text>
        </TouchableOpacity>
      </ScrollView>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f8fafc' },
  appBar: {
    height: 54,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    backgroundColor: '#ffffff',
    borderBottomWidth: 1,
    borderBottomColor: '#e2e8f0',
  },
  backButton: {
    width: 36,
    height: 36,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#f1f5f9',
  },
  appBarTitle: { fontSize: 15, fontWeight: '800', color: '#0f172a' },
  scrollContent: { padding: 16, gap: 14, paddingBottom: 60 },
  profileCard: {
    backgroundColor: '#ffffff',
    borderRadius: 14,
    padding: 18,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#e2e8f0',
  },
  avatarContainer: {
    width: 76,
    height: 76,
    borderRadius: 38,
    backgroundColor: '#e6f0fa',
    overflow: 'hidden',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 10,
    borderWidth: 2,
    borderColor: '#b8d6f0',
  },
  avatarImage: { width: '100%', height: '100%' },
  profileName: { fontSize: 17, fontWeight: '800', color: '#0f172a', textAlign: 'center' },
  profileRole: { fontSize: 12.5, fontWeight: '700', color: '#004b87', marginTop: 2 },
  profileDept: { fontSize: 11.5, color: '#64748b', marginTop: 1 },
  badgeRow: { flexDirection: 'row', gap: 6, marginTop: 12 },
  idBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingVertical: 4,
    paddingHorizontal: 8,
    backgroundColor: '#f0f9ff',
    borderRadius: 6,
    borderWidth: 1,
    borderColor: '#bae6fd',
  },
  idBadgeText: { fontSize: 10.5, fontWeight: '700', color: '#004b87' },
  statusBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingVertical: 4,
    paddingHorizontal: 8,
    borderRadius: 6,
    borderWidth: 1,
  },
  statusActive: { backgroundColor: '#ecfdf5', borderColor: '#a7f3d0' },
  statusPending: { backgroundColor: '#fffbeb', borderColor: '#fde68a' },
  statusBadgeText: { fontSize: 10.5, fontWeight: '700' },
  qrCard: {
    backgroundColor: '#ffffff',
    borderRadius: 14,
    padding: 18,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#e2e8f0',
  },
  qrHeader: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 4 },
  qrCardTitle: { fontSize: 14, fontWeight: '800', color: '#0f172a' },
  qrSubtitle: { fontSize: 11, color: '#64748b', textAlign: 'center', marginBottom: 14, lineHeight: 16 },
  qrWrapper: {
    padding: 14,
    backgroundColor: '#ffffff',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#cbd5e1',
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 200,
  },
  qrFooter: { flexDirection: 'row', alignItems: 'center', gap: 5, marginTop: 12 },
  qrFooterText: { fontSize: 10.5, color: '#64748b' },
  logoutButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 12,
    borderRadius: 10,
    backgroundColor: '#fee2e2',
    borderWidth: 1,
    borderColor: '#fca5a5',
    marginTop: 4,
  },
  logoutText: { fontSize: 13, fontWeight: '800', color: '#dc2626' },
});

export default ProfileSettingsScreen;