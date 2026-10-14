// mobile/src/screens/SettingsScreen.tsx

import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TextInput,
  TouchableOpacity,
  ScrollView,
  ActivityIndicator,
  Alert,
  Platform,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useAuth } from '../context/AuthContext';
import { apiClient } from '../api/client';
import { getServerBaseUrl, setServerBaseUrl } from '../services/configService';
import { getUnsyncedCount, syncOfflineQueue } from '../services/offlineQueue';
import { COLORS } from '../constants/theme';

const showAlert = (title: string, message: string) => {
  if (Platform.OS === 'web' && typeof window !== 'undefined') {
    window.alert(`${title}: ${message}`);
  } else {
    Alert.alert(title, message);
  }
};

export const SettingsScreen: React.FC = () => {
  const { user, refreshUser, logout } = useAuth();

  const currentUser = user as Record<string, any> | null;

  const [firstName, setFirstName] = useState<string>(currentUser?.first_name || '');
  const [lastName, setLastName] = useState<string>(currentUser?.last_name || '');
  const [email, setEmail] = useState<string>(currentUser?.email || '');
  const [contactNumber, setContactNumber] = useState<string>(currentUser?.contact_number || '');
  const [newPassword, setNewPassword] = useState<string>('');

  const [serverUrl, setServerUrl] = useState<string>('');
  const [offlineCount, setOfflineCount] = useState<number>(0);
  const [savingProfile, setSavingProfile] = useState<boolean>(false);
  const [savingServer, setSavingServer] = useState<boolean>(false);
  const [syncingOffline, setSyncingOffline] = useState<boolean>(false);

  const loadSettingsState = useCallback(async () => {
    try {
      const [storedUrl, queuedCount] = await Promise.all([
        getServerBaseUrl(),
        getUnsyncedCount(),
      ]);

      setServerUrl(storedUrl);
      setOfflineCount(queuedCount);

      const meRes = await apiClient.get('/api/me/');
      if (meRes.data) {
        setFirstName(meRes.data.first_name || '');
        setLastName(meRes.data.last_name || '');
        setEmail(meRes.data.email || '');
        setContactNumber(meRes.data.contact_number || '');
      }
    } catch {
      // Keep local values if offline
    }
  }, []);

  useEffect(() => {
    loadSettingsState();
  }, [loadSettingsState]);

  const handleSaveProfile = async () => {
    setSavingProfile(true);
    try {
      const payload: Record<string, string> = {
        first_name: firstName.trim(),
        last_name: lastName.trim(),
        email: email.trim(),
        contact_number: contactNumber.trim(),
      };

      if (newPassword.trim()) {
        if (newPassword.trim().length < 6) {
          showAlert('Weak Password', 'New password must be at least 6 characters.');
          setSavingProfile(false);
          return;
        }
        payload.password = newPassword.trim();
      }

      await apiClient.put('/api/me/', payload);
      setNewPassword('');
      await refreshUser();
      showAlert('Profile Updated', 'Your database account details have been saved.');
    } catch (err: any) {
      const msg =
        err?.response?.data?.error ||
        err?.response?.data?.detail ||
        'Could not update profile in database.';
      showAlert('Update Failed', msg);
    } finally {
      setSavingProfile(false);
    }
  };

  const handleSaveServerUrl = async () => {
    const clean = serverUrl.trim();
    if (!clean.startsWith('http://') && !clean.startsWith('https://')) {
      showAlert('Invalid URL', 'Server URL must start with http:// or https://');
      return;
    }

    setSavingServer(true);
    try {
      await setServerBaseUrl(clean);
      showAlert('Server Updated', `Active backend endpoint set to:\n${clean}`);
    } catch {
      showAlert('Save Error', 'Could not save server URL.');
    } finally {
      setSavingServer(false);
    }
  };

  const handleSyncOfflineRecords = async () => {
    setSyncingOffline(true);
    try {
      const result = await syncOfflineQueue();
      const remaining = await getUnsyncedCount();
      setOfflineCount(remaining);

      if (result.syncedCount > 0 && remaining === 0) {
        showAlert(
          'Upload Complete',
          `Successfully uploaded ${result.syncedCount} offline record(s) to the database.`
        );
      } else if (result.syncedCount > 0 && remaining > 0) {
        showAlert(
          'Partial Upload',
          `Uploaded ${result.syncedCount} record(s), but ${remaining} remained in queue.\nLast error: ${result.lastError}`
        );
      } else {
        showAlert(
          'Upload Failed',
          result.lastError || 'Could not reach the backend server to upload offline records.'
        );
      }
    } catch (err: any) {
      showAlert('Sync Error', err?.message || 'Failed to process offline queue.');
    } finally {
      setSyncingOffline(false);
    }
  };

  const handleLogout = () => {
    if (Platform.OS === 'web' && typeof window !== 'undefined') {
      if (window.confirm('Are you sure you want to sign out of AttendSure?')) {
        logout();
      }
      return;
    }

    Alert.alert('Log Out', 'Are you sure you want to sign out of AttendSure?', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Log Out', style: 'destructive', onPress: () => logout() },
    ]);
  };

  return (
    <SafeAreaView style={styles.container} edges={['top', 'left', 'right']}>
      <View style={styles.topHeader}>
        <View>
          <Text style={styles.screenTitle}>Account & System Settings</Text>
          <Text style={styles.screenSub}>Database Profile, Network Endpoint & Offline Sync</Text>
        </View>
      </View>

      <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
        {/* 1. Account Identity Summary */}
        <View style={styles.card}>
          <View style={styles.identityRow}>
            <View style={styles.avatarCircle}>
              <Text style={styles.avatarInitials}>
                {(firstName?.[0] || currentUser?.username?.[0] || 'U').toUpperCase()}
              </Text>
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.identityName}>
                {`${firstName} ${lastName}`.trim() || currentUser?.username}
              </Text>
              <Text style={styles.identityMeta}>
                ID: {currentUser?.faculty_id || currentUser?.username} • Role:{' '}
                {currentUser?.role || 'FACULTY'}
              </Text>
            </View>
          </View>
        </View>

        {/* 2. Offline Queue Sync Card */}
        <View style={styles.card}>
          <Text style={styles.sectionTitle}>OFFLINE ATTENDANCE & GPS QUEUE</Text>
          <View style={styles.queueRow}>
            <View style={{ flex: 1 }}>
              <Text style={styles.queueTitle}>
                {offlineCount > 0
                  ? `${offlineCount} Pending Record(s) on Device`
                  : 'All Records Synced to Database'}
              </Text>
              <Text style={styles.queueSub}>
                {offlineCount > 0
                  ? 'Tap below to upload queued scans and GPS pings to PostgreSQL.'
                  : 'No offline scans waiting for upload.'}
              </Text>
            </View>
            <Ionicons
              name={offlineCount > 0 ? 'cloud-upload-outline' : 'checkmark-done-circle-outline'}
              size={24}
              color={offlineCount > 0 ? '#d97706' : '#16a34a'}
            />
          </View>

          {offlineCount > 0 && (
            <TouchableOpacity
              style={[styles.syncNowBtn, syncingOffline && { opacity: 0.6 }]}
              onPress={handleSyncOfflineRecords}
              disabled={syncingOffline}
            >
              {syncingOffline ? (
                <ActivityIndicator size="small" color="#ffffff" />
              ) : (
                <>
                  <Ionicons name="cloud-upload" size={16} color="#ffffff" />
                  <Text style={styles.syncNowBtnText}>
                    Upload {offlineCount} Offline Record(s) Now
                  </Text>
                </>
              )}
            </TouchableOpacity>
          )}
        </View>

        {/* 3. Database Profile Editor */}
        <View style={styles.card}>
          <Text style={styles.sectionTitle}>EDIT FACULTY PROFILE</Text>

          <Text style={styles.fieldLabel}>First Name</Text>
          <TextInput
            style={styles.input}
            value={firstName}
            onChangeText={setFirstName}
            placeholder="First Name"
          />

          <Text style={styles.fieldLabel}>Last Name</Text>
          <TextInput
            style={styles.input}
            value={lastName}
            onChangeText={setLastName}
            placeholder="Last Name"
          />

          <Text style={styles.fieldLabel}>Official Email</Text>
          <TextInput
            style={styles.input}
            value={email}
            onChangeText={setEmail}
            placeholder="Email Address"
            keyboardType="email-address"
            autoCapitalize="none"
          />

          <Text style={styles.fieldLabel}>Mobile Contact Number</Text>
          <TextInput
            style={styles.input}
            value={contactNumber}
            onChangeText={setContactNumber}
            placeholder="09XXXXXXXXX"
            keyboardType="phone-pad"
          />

          <Text style={styles.fieldLabel}>New Password (Optional)</Text>
          <TextInput
            style={styles.input}
            value={newPassword}
            onChangeText={setNewPassword}
            placeholder="Leave blank to keep current password"
            secureTextEntry
          />

          <TouchableOpacity
            style={[styles.primaryBtn, savingProfile && { opacity: 0.6 }]}
            onPress={handleSaveProfile}
            disabled={savingProfile}
          >
            {savingProfile ? (
              <ActivityIndicator size="small" color="#ffffff" />
            ) : (
              <Text style={styles.primaryBtnText}>Save Profile to Database</Text>
            )}
          </TouchableOpacity>
        </View>

        {/* 4. Dynamic Backend Endpoint Configuration */}
        <View style={styles.card}>
          <Text style={styles.sectionTitle}>DYNAMIC BACKEND SERVER ENDPOINT</Text>
          <Text style={styles.fieldLabel}>Server Base URL / Domain</Text>
          <TextInput
            style={styles.input}
            value={serverUrl}
            onChangeText={setServerUrl}
            placeholder="http://172.20.141.220:8000/api"
            autoCapitalize="none"
          />
          <TouchableOpacity
            style={[styles.secondaryBtn, savingServer && { opacity: 0.6 }]}
            onPress={handleSaveServerUrl}
            disabled={savingServer}
          >
            <Text style={styles.secondaryBtnText}>Update Server Endpoint</Text>
          </TouchableOpacity>

          <TouchableOpacity style={styles.logoutBtn} onPress={handleLogout}>
            <Ionicons name="log-out-outline" size={18} color="#dc2626" />
            <Text style={styles.logoutBtnText}>Log Out of Account</Text>
          </TouchableOpacity>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f8fafc' },
  topHeader: {
    paddingHorizontal: 18,
    paddingVertical: 12,
    backgroundColor: '#ffffff',
    borderBottomWidth: 1,
    borderBottomColor: '#e2e8f0',
  },
  screenTitle: { fontSize: 18, fontWeight: '800', color: '#003460' },
  screenSub: { fontSize: 10.5, color: '#64748b', marginTop: 1 },
  scrollContent: { padding: 16, gap: 12 },
  card: {
    backgroundColor: '#ffffff',
    borderRadius: 16,
    padding: 16,
    borderWidth: 1,
    borderColor: '#e2e8f0',
  },
  identityRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  avatarCircle: {
    width: 46,
    height: 46,
    borderRadius: 23,
    backgroundColor: '#004b87',
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarInitials: { color: '#ffffff', fontSize: 18, fontWeight: '800' },
  identityName: { fontSize: 15, fontWeight: '800', color: '#0f172a' },
  identityMeta: { fontSize: 11, color: '#64748b', marginTop: 2 },
  sectionTitle: {
    fontSize: 10.5,
    fontWeight: '800',
    color: '#004b87',
    letterSpacing: 0.4,
    marginBottom: 10,
  },
  fieldLabel: { fontSize: 11, fontWeight: '700', color: '#475569', marginBottom: 4, marginTop: 8 },
  input: {
    height: 42,
    backgroundColor: '#f8fafc',
    borderWidth: 1,
    borderColor: '#cbd5e1',
    borderRadius: 10,
    paddingHorizontal: 12,
    fontSize: 12.5,
    color: '#0f172a',
  },
  primaryBtn: {
    backgroundColor: '#004b87',
    paddingVertical: 11,
    borderRadius: 10,
    alignItems: 'center',
    marginTop: 14,
  },
  primaryBtnText: { color: '#ffffff', fontSize: 12.5, fontWeight: '700' },
  secondaryBtn: {
    backgroundColor: '#e6f0fa',
    paddingVertical: 10,
    borderRadius: 10,
    alignItems: 'center',
    marginTop: 12,
    borderWidth: 1,
    borderColor: '#b8d6f0',
  },
  secondaryBtnText: { color: '#004b87', fontSize: 12, fontWeight: '800' },
  queueRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 10,
  },
  queueTitle: { fontSize: 13, fontWeight: '700', color: '#0f172a' },
  queueSub: { fontSize: 11, color: '#64748b', marginTop: 2 },
  syncNowBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#d97706',
    paddingVertical: 10,
    borderRadius: 10,
    marginTop: 12,
    gap: 6,
  },
  syncNowBtnText: { color: '#ffffff', fontSize: 12, fontWeight: '800' },
  logoutBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#fef2f2',
    paddingVertical: 11,
    borderRadius: 10,
    marginTop: 14,
    borderWidth: 1,
    borderColor: '#fecaca',
    gap: 6,
  },
  logoutBtnText: { color: '#dc2626', fontSize: 12.5, fontWeight: '800' },
});

export default SettingsScreen;