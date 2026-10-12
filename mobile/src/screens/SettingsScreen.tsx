// mobile/src/screens/SettingsScreen.tsx

import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Switch,
  TouchableOpacity,
  ScrollView,
  Alert,
  ActivityIndicator,
  Platform,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { RootStackParamList } from '../navigation/AppNavigator';
import { useAuth } from '../context/AuthContext';
import { ServerConfigModal } from '../components/ServerConfigModal';
import { sendLiveHeartbeat } from '../services/telemetryService';
import { getUnsyncedCount, flushOfflineTelemetryQueue } from '../services/offlineQueue';

export const SettingsScreen: React.FC = () => {
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const { user, logout, deviceIdentity, refreshUser } = useAuth();

  // Scanner Feedback Preferences (Dynamically loaded from storage)
  const [autoSms, setAutoSms] = useState<boolean>(true);
  const [soundEnabled, setSoundEnabled] = useState<boolean>(true);
  const [hapticEnabled, setHapticEnabled] = useState<boolean>(true);

  // Telemetry & Queue State
  const [offlineCount, setOfflineCount] = useState<number>(0);
  const [syncingOffline, setSyncingOffline] = useState<boolean>(false);
  const [testingPing, setTestingPing] = useState<boolean>(false);

  // Modal
  const [configVisible, setConfigVisible] = useState<boolean>(false);

  // Dynamic Profile & Account Data
  const displayName =
    user?.full_name ||
    `${user?.first_name || ''} ${user?.last_name || ''}`.trim() ||
    user?.faculty_name ||
    user?.username ||
    '';

  const employeeId = user?.faculty_id || user?.username || '';
  const roleName = user?.role || (user?.is_superuser ? 'ADMIN' : 'FACULTY');
  const departmentName = user?.department || user?.school_name || '';
  const hardwareUuid = deviceIdentity?.deviceId || user?.bound_device_id || '';

  // 1. Load Persisted Switch Preferences
  useEffect(() => {
    const loadPreferences = async () => {
      try {
        const [savedAutoSms, savedSound, savedHaptic] = await Promise.all([
          AsyncStorage.getItem('pref_auto_sms'),
          AsyncStorage.getItem('pref_sound_enabled'),
          AsyncStorage.getItem('pref_haptic_enabled'),
        ]);

        if (savedAutoSms !== null) setAutoSms(savedAutoSms === 'true');
        if (savedSound !== null) setSoundEnabled(savedSound === 'true');
        if (savedHaptic !== null) setHapticEnabled(savedHaptic === 'true');
      } catch {
        // Retain current states on storage error
      }
    };

    loadPreferences();
    refreshUser?.();
  }, [refreshUser]);

  // Switch Toggles with Storage Persistence
  const toggleAutoSms = async (val: boolean) => {
    setAutoSms(val);
    try {
      await AsyncStorage.setItem('pref_auto_sms', String(val));
    } catch {
      // Ignored
    }
  };

  const toggleSound = async (val: boolean) => {
    setSoundEnabled(val);
    try {
      await AsyncStorage.setItem('pref_sound_enabled', String(val));
    } catch {
      // Ignored
    }
  };

  const toggleHaptic = async (val: boolean) => {
    setHapticEnabled(val);
    try {
      await AsyncStorage.setItem('pref_haptic_enabled', String(val));
    } catch {
      // Ignored
    }
  };

  // 2. Check Pending Local Offline Queue
  const loadOfflineCount = useCallback(async () => {
    try {
      const count = await getUnsyncedCount();
      setOfflineCount(count);
    } catch {
      // Ignore background storage check error
    }
  }, []);

  useEffect(() => {
    loadOfflineCount();
  }, [loadOfflineCount]);

  const handleManualSync = async () => {
    if (offlineCount === 0) {
      Alert.alert('Queue Empty', 'All attendance logs and telemetry heartbeats are already uploaded.');
      return;
    }

    setSyncingOffline(true);
    try {
      const res = await flushOfflineTelemetryQueue();
      Alert.alert('Sync Successful', `Uploaded ${res.sent} pending log(s) to the server.`);
      await loadOfflineCount();
    } catch {
      Alert.alert('Sync Incomplete', 'Could not establish connection to the backend server.');
    } finally {
      setSyncingOffline(false);
    }
  };

  const handleTestGeofence = async () => {
    setTestingPing(true);
    try {
      const deviceId = employeeId || hardwareUuid || 'MOBILE-CLIENT';
      const result: any = await sendLiveHeartbeat(deviceId);

      if (result.isQueuedOffline) {
        Alert.alert('Offline Mode', 'Server unreachable. Telemetry heartbeat stored in local phone queue.');
      } else {
        const boundaryNotice = result?.is_inside_perimeter
          ? 'Device confirmed INSIDE campus geofence perimeter.'
          : 'Warning: Device is OUTSIDE designated campus perimeter.';
        Alert.alert('Geofence Audit', boundaryNotice);
      }
      await loadOfflineCount();
    } catch (err: any) {
      Alert.alert('Telemetry Check Failed', err?.message || 'Unable to obtain GPS coordinates.');
    } finally {
      setTestingPing(false);
    }
  };

  const confirmSignOut = () => {
    Alert.alert(
      'Sign Out Account',
      'Are you sure you want to sign out? Your device credentials will be detached until next sign-in.',
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Sign Out', style: 'destructive', onPress: logout },
      ]
    );
  };

  return (
    <SafeAreaView style={styles.container} edges={['top', 'left', 'right']}>
      {/* Top Header */}
      <View style={styles.topHeader}>
        <View style={{ flex: 1 }}>
          <Text style={styles.screenTitle}>Application Settings</Text>
          <Text style={styles.screenSub}>System Controls, Hardware Telemetry & Preferences</Text>
        </View>

        <View style={styles.headerBadge}>
          <View style={styles.activeDot} />
          <Text style={styles.headerBadgeText}>SYSTEM CONFIG</Text>
        </View>
      </View>

      <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
        {/* 1. Faculty Profile Identity Card */}
        <TouchableOpacity
          style={styles.card}
          activeOpacity={0.85}
          onPress={() => navigation.navigate('ProfileSettings')}
        >
          <View style={styles.cardHeaderRow}>
            <Ionicons name="person-circle-outline" size={18} color="#004b87" />
            <Text style={styles.cardHeaderTitle}>FACULTY PROFILE IDENTITY</Text>
            <View style={styles.editBadge}>
              <Text style={styles.editBadgeText}>Edit Profile</Text>
              <Ionicons name="chevron-forward" size={14} color="#004b87" />
            </View>
          </View>

          <View style={styles.profileRow}>
            <View style={styles.avatarCircle}>
              <Text style={styles.avatarInitial}>
                {displayName ? displayName.charAt(0).toUpperCase() : '?'}
              </Text>
            </View>

            <View style={{ flex: 1, marginLeft: 12 }}>
              <Text style={styles.profileName} numberOfLines={1}>
                {displayName || 'Authenticated Faculty'}
              </Text>
              <Text style={styles.profileRole}>
                Role: {roleName}{departmentName ? ` • ${departmentName}` : ''}
              </Text>
              {employeeId ? (
                <Text style={styles.profileId}>Employee ID: {employeeId}</Text>
              ) : null}
            </View>
          </View>

          <View style={styles.tapToEditFooter}>
            <Text style={styles.tapToEditText}>Tap to edit credentials or view turnstile pass</Text>
          </View>
        </TouchableOpacity>

        {/* 2. Scanner & Audio/Haptic Feedback */}
        <View style={styles.card}>
          <View style={styles.cardHeaderRow}>
            <Ionicons name="options-outline" size={18} color="#004b87" />
            <Text style={styles.cardHeaderTitle}>SCANNER FEEDBACK & DISPATCH</Text>
          </View>

          <View style={styles.switchRow}>
            <View style={{ flex: 1, marginRight: 10 }}>
              <Text style={styles.switchTitle}>Auto-SMS Parent Dispatch</Text>
              <Text style={styles.switchDetail}>Queue automatic SMS delivery to parents upon student scans</Text>
            </View>
            <Switch
              value={autoSms}
              onValueChange={toggleAutoSms}
              trackColor={{ false: '#cbd5e1', true: '#b8d6f0' }}
              thumbColor={autoSms ? '#004b87' : '#f8fafc'}
            />
          </View>

          <View style={styles.switchRow}>
            <View style={{ flex: 1, marginRight: 10 }}>
              <Text style={styles.switchTitle}>Audible Scan Beep</Text>
              <Text style={styles.switchDetail}>Play standard audio chime on successful attendance ingestion</Text>
            </View>
            <Switch
              value={soundEnabled}
              onValueChange={toggleSound}
              trackColor={{ false: '#cbd5e1', true: '#b8d6f0' }}
              thumbColor={soundEnabled ? '#004b87' : '#f8fafc'}
            />
          </View>

          <View style={[styles.switchRow, { borderBottomWidth: 0 }]}>
            <View style={{ flex: 1, marginRight: 10 }}>
              <Text style={styles.switchTitle}>Haptic Vibration Feedback</Text>
              <Text style={styles.switchDetail}>Trigger tactile vibration alert on scan success or gate anomaly</Text>
            </View>
            <Switch
              value={hapticEnabled}
              onValueChange={toggleHaptic}
              trackColor={{ false: '#cbd5e1', true: '#b8d6f0' }}
              thumbColor={hapticEnabled ? '#004b87' : '#f8fafc'}
            />
          </View>
        </View>

        {/* 3. Hardware Identity & Campus Geofence */}
        <View style={styles.card}>
          <View style={styles.cardHeaderRow}>
            <Ionicons name="hardware-chip-outline" size={18} color="#004b87" />
            <Text style={styles.cardHeaderTitle}>HARDWARE BINDING & GEOFENCE</Text>
          </View>

          <View style={styles.deviceInfoBox}>
            <Text style={styles.deviceInfoLabel}>TERMINAL HARDWARE UUID</Text>
            <Text style={styles.deviceInfoValue} numberOfLines={1} ellipsizeMode="middle">
              {hardwareUuid || 'Hardware not registered'}
            </Text>
            <Text style={styles.deviceInfoSub}>
              Tied to Civil Service Form 48 daily time record to prevent proxy scanning.
            </Text>
          </View>

          <TouchableOpacity
            style={styles.actionOutlineBtn}
            onPress={handleTestGeofence}
            disabled={testingPing}
            activeOpacity={0.8}
          >
            {testingPing ? (
              <ActivityIndicator size="small" color="#004b87" />
            ) : (
              <>
                <Ionicons name="navigate-outline" size={16} color="#004b87" />
                <Text style={styles.actionOutlineBtnText}>Test Campus Boundary Verification</Text>
              </>
            )}
          </TouchableOpacity>
        </View>

        {/* 4. Local Storage & Offline Queue Management */}
        <View style={styles.card}>
          <View style={styles.cardHeaderRow}>
            <Ionicons name="cloud-offline-outline" size={18} color="#004b87" />
            <Text style={styles.cardHeaderTitle}>LOCAL STORAGE & QUEUE</Text>
          </View>

          <View style={styles.offlineStatusBox}>
            <View style={{ flex: 1 }}>
              <Text style={styles.offlineCountTitle}>{offlineCount} Records Pending</Text>
              <Text style={styles.offlineCountSub}>
                Attendance scans cached offline when campus Wi-Fi drops
              </Text>
            </View>

            <TouchableOpacity
              style={[styles.syncBtn, offlineCount === 0 && styles.btnDisabled]}
              onPress={handleManualSync}
              disabled={offlineCount === 0 || syncingOffline}
              activeOpacity={0.8}
            >
              {syncingOffline ? (
                <ActivityIndicator size="small" color="#ffffff" />
              ) : (
                <>
                  <Ionicons name="cloud-upload" size={14} color="#ffffff" />
                  <Text style={styles.syncBtnText}>Upload</Text>
                </>
              )}
            </TouchableOpacity>
          </View>
        </View>

        {/* 5. Network Gateway & Server IP */}
        <View style={styles.card}>
          <View style={styles.cardHeaderRow}>
            <Ionicons name="globe-outline" size={18} color="#004b87" />
            <Text style={styles.cardHeaderTitle}>NETWORK SERVER HOST</Text>
          </View>

          <Text style={styles.networkSubText}>
            Points the mobile application to the school's local or cloud Django server endpoint[cite: 14].
          </Text>

          <TouchableOpacity
            style={styles.configServerBtn}
            onPress={() => setConfigVisible(true)}
            activeOpacity={0.8}
          >
            <Ionicons name="server-outline" size={16} color="#004b87" />
            <Text style={styles.configServerBtnText}>Configure Backend Host IP</Text>
          </TouchableOpacity>
        </View>

        {/* 6. Account Exit */}
        <View style={[styles.card, { borderColor: '#fecaca', backgroundColor: '#fffafa' }]}>
          <TouchableOpacity style={styles.logoutBtn} onPress={confirmSignOut} activeOpacity={0.8}>
            <Ionicons name="log-out-outline" size={18} color="#dc2626" />
            <Text style={styles.logoutBtnText}>Sign Out from this Device</Text>
          </TouchableOpacity>
        </View>
      </ScrollView>

      {/* Server Config Modal */}
      <ServerConfigModal visible={configVisible} onClose={() => setConfigVisible(false)} />
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f8fafc',
  },
  topHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 18,
    paddingVertical: 12,
    backgroundColor: '#ffffff',
    borderBottomWidth: 1,
    borderBottomColor: '#e2e8f0',
  },
  screenTitle: {
    fontSize: 18,
    fontWeight: '800',
    color: '#003460',
    letterSpacing: -0.3,
  },
  screenSub: {
    fontSize: 10.5,
    color: '#64748b',
    marginTop: 1,
  },
  headerBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#e6f0fa',
    paddingVertical: 4,
    paddingHorizontal: 8,
    borderRadius: 12,
    gap: 4,
  },
  activeDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: '#004b87',
  },
  headerBadgeText: {
    fontSize: 9,
    fontWeight: '800',
    color: '#004b87',
    letterSpacing: 0.3,
  },
  scrollContent: {
    paddingHorizontal: 16,
    paddingTop: 12,
    paddingBottom: 32,
    gap: 12,
  },
  card: {
    backgroundColor: '#ffffff',
    borderRadius: 16,
    padding: 16,
    borderWidth: 1,
    borderColor: '#e2e8f0',
    ...Platform.select({
      ios: { shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.04, shadowRadius: 4 },
      android: { elevation: 1 },
    }),
  },
  cardHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: 12,
  },
  cardHeaderTitle: {
    fontSize: 10.5,
    fontWeight: '800',
    color: '#004b87',
    letterSpacing: 0.5,
  },
  editBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#e6f0fa',
    paddingVertical: 2,
    paddingHorizontal: 6,
    borderRadius: 6,
    marginLeft: 'auto',
    gap: 2,
  },
  editBadgeText: {
    fontSize: 10,
    fontWeight: '700',
    color: '#004b87',
  },
  profileRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  avatarCircle: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: '#004b87',
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarInitial: {
    color: '#ffffff',
    fontSize: 18,
    fontWeight: '800',
  },
  profileName: {
    fontSize: 14,
    fontWeight: '800',
    color: '#0f172a',
  },
  profileRole: {
    fontSize: 11,
    color: '#64748b',
    marginTop: 1,
  },
  profileId: {
    fontSize: 11,
    fontWeight: '700',
    color: '#004b87',
    marginTop: 1,
  },
  tapToEditFooter: {
    marginTop: 10,
    paddingTop: 8,
    borderTopWidth: 1,
    borderTopColor: '#f1f5f9',
  },
  tapToEditText: {
    fontSize: 10.5,
    color: '#94a3b8',
    textAlign: 'center',
  },
  switchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: '#f1f5f9',
  },
  switchTitle: {
    fontSize: 12.5,
    fontWeight: '700',
    color: '#0f172a',
  },
  switchDetail: {
    fontSize: 10.5,
    color: '#64748b',
    marginTop: 2,
    lineHeight: 14,
  },
  deviceInfoBox: {
    backgroundColor: '#f8fafc',
    borderRadius: 10,
    padding: 12,
    borderWidth: 1,
    borderColor: '#e2e8f0',
    marginBottom: 10,
  },
  deviceInfoLabel: {
    fontSize: 9,
    fontWeight: '800',
    color: '#64748b',
    letterSpacing: 0.5,
  },
  deviceInfoValue: {
    fontSize: 11.5,
    fontWeight: '700',
    color: '#004b87',
    fontFamily: Platform.OS === 'ios' ? 'Courier' : 'monospace',
    marginTop: 3,
  },
  deviceInfoSub: {
    fontSize: 10,
    color: '#94a3b8',
    marginTop: 4,
    lineHeight: 13,
  },
  actionOutlineBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#e6f0fa',
    borderWidth: 1,
    borderColor: '#b8d6f0',
    borderRadius: 10,
    paddingVertical: 10,
    gap: 6,
  },
  actionOutlineBtnText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#004b87',
  },
  offlineStatusBox: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#f8fafc',
    borderRadius: 10,
    padding: 12,
    borderWidth: 1,
    borderColor: '#e2e8f0',
  },
  offlineCountTitle: {
    fontSize: 13,
    fontWeight: '700',
    color: '#0f172a',
  },
  offlineCountSub: {
    fontSize: 10.5,
    color: '#64748b',
    marginTop: 1,
  },
  syncBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#004b87',
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 8,
    gap: 5,
  },
  syncBtnText: {
    color: '#ffffff',
    fontSize: 11.5,
    fontWeight: '700',
  },
  btnDisabled: {
    opacity: 0.5,
  },
  networkSubText: {
    fontSize: 11,
    color: '#64748b',
    marginBottom: 10,
    lineHeight: 15,
  },
  configServerBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#ffffff',
    borderWidth: 1.2,
    borderColor: '#b8d6f0',
    borderRadius: 10,
    paddingVertical: 10,
    gap: 6,
  },
  configServerBtnText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#004b87',
  },
  logoutBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 4,
    gap: 6,
  },
  logoutBtnText: {
    fontSize: 13,
    fontWeight: '700',
    color: '#dc2626',
  },
});

export default SettingsScreen;