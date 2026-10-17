// D:\AttendSure_V3\mobile\src\screens\SettingsScreen.tsx

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
  Modal,
  Platform,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import QRCode from 'react-native-qrcode-svg';
import { useAuth } from '../context/AuthContext';
import { apiClient } from '../api/client';
import { getServerBaseUrl, setServerBaseUrl } from '../services/configService';
import { COLORS } from '../constants/theme';

const showAlert = (title: string, message: string) => {
  if (Platform.OS === 'web' && typeof window !== 'undefined') {
    window.alert(`${title}: ${message}`);
  } else {
    Alert.alert(title, message);
  }
};

export const SettingsScreen: React.FC = () => {
  const { user, logout, refreshUser } = useAuth();

  const [firstName, setFirstName] = useState<string>(user?.first_name || '');
  const [lastName, setLastName] = useState<string>(user?.last_name || '');
  const [email, setEmail] = useState<string>(user?.email || '');
  const [contactNumber, setContactNumber] = useState<string>(user?.contact_number || '');
  const [password, setPassword] = useState<string>('');
  const [showPassword, setShowPassword] = useState<boolean>(false);

  const [serverUrl, setServerUrl] = useState<string>('');
  const [savingProfile, setSavingProfile] = useState<boolean>(false);
  const [savingServer, setSavingServer] = useState<boolean>(false);
  const [pingStatus, setPingStatus] = useState<'IDLE' | 'ONLINE' | 'OFFLINE'>('IDLE');
  const [qrPassVisible, setQrPassVisible] = useState<boolean>(false);

  const loadSettings = useCallback(async () => {
    try {
      const savedUrl = await getServerBaseUrl();
      setServerUrl(savedUrl);

      const res = await apiClient.get('/api/me/');
      if (res.data) {
        setFirstName(res.data.first_name || '');
        setLastName(res.data.last_name || '');
        setEmail(res.data.email || '');
        setContactNumber(res.data.contact_number || '');
        setPingStatus('ONLINE');
      }
    } catch {
      setPingStatus('OFFLINE');
    }
  }, []);

  useEffect(() => {
    loadSettings();
  }, [loadSettings]);

  const handleSaveProfile = async () => {
    if (!firstName.trim() || !lastName.trim()) {
      showAlert('Required Fields', 'First Name and Last Name cannot be empty.');
      return;
    }

    setSavingProfile(true);
    try {
      const payload: Record<string, any> = {
        first_name: firstName.trim(),
        last_name: lastName.trim(),
        email: email.trim(),
        contact_number: contactNumber.trim(),
      };
      if (password.trim().length >= 6) {
        payload.password = password.trim();
      }

      await apiClient.put('/api/me/', payload);
      setPassword('');
      await refreshUser();
      showAlert('Profile Saved', 'Your account details have been saved to PostgreSQL.');
    } catch (err: any) {
      showAlert('Update Failed', err?.response?.data?.error || 'Could not update profile.');
    } finally {
      setSavingProfile(false);
    }
  };

  const handleUpdateEndpoint = async () => {
    if (!serverUrl.trim()) {
      showAlert('Invalid URL', 'Please enter a valid backend server URL.');
      return;
    }
    setSavingServer(true);
    try {
      const normalized = await setServerBaseUrl(serverUrl.trim());
      setServerUrl(normalized);
      await apiClient.get('/api/settings/school/');
      setPingStatus('ONLINE');
      showAlert('Server Connected', `Connected to ${normalized}`);
    } catch {
      setPingStatus('OFFLINE');
      showAlert('Saved (Unreachable)', 'Endpoint saved, but server did not respond to ping.');
    } finally {
      setSavingServer(false);
    }
  };

  const displayName = `${firstName} ${lastName}`.trim() || user?.full_name || user?.username || 'Faculty';
  const employeeId = user?.faculty_id || user?.username || '';
  const roleLabel = user?.role || 'FACULTY';
  const qrValue = user?.qr_token || employeeId || 'ATTENDSURE';

  return (
    <SafeAreaView style={styles.container} edges={['top', 'left', 'right']}>
      {/* Fixed Header */}
      <View style={styles.topHeader}>
        <View style={{ flex: 1 }}>
          <Text style={styles.screenTitle}>Account & System Settings</Text>
          <Text style={styles.screenSub}>Database Profile, Network Endpoint & Gate Pass</Text>
        </View>
        <View
          style={[
            styles.statusBadge,
            pingStatus === 'ONLINE'
              ? { backgroundColor: '#dcfce7' }
              : { backgroundColor: '#f1f5f9' },
          ]}
        >
          <View
            style={[
              styles.statusDot,
              { backgroundColor: pingStatus === 'ONLINE' ? '#10b981' : '#94a3b8' },
            ]}
          />
          <Text
            style={[
              styles.statusBadgeText,
              { color: pingStatus === 'ONLINE' ? '#065f46' : '#475569' },
            ]}
          >
            {pingStatus === 'ONLINE' ? 'DB ONLINE' : 'SYNC'}
          </Text>
        </View>
      </View>

      <ScrollView
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        {/* 1. Faculty Identity & Gate Pass Card */}
        <View style={styles.identityCard}>
          <View style={styles.identityRow}>
            <View style={styles.avatarCircle}>
              <Ionicons name="person" size={24} color="#ffffff" />
            </View>
            <View style={{ flex: 1, marginLeft: 12 }}>
              <Text style={styles.identityName}>{displayName}</Text>
              <Text style={styles.identityMeta}>
                {roleLabel} &bull; ID: {employeeId}
              </Text>
            </View>
            <TouchableOpacity
              style={styles.qrPassBtn}
              onPress={() => setQrPassVisible(true)}
            >
              <Ionicons name="qr-code-outline" size={16} color="#004b87" />
              <Text style={styles.qrPassBtnText}>Gate Pass</Text>
            </TouchableOpacity>
          </View>
        </View>

        {/* 2. Personal Profile Form */}
        <View style={styles.card}>
          <View style={styles.cardHeaderRow}>
            <Ionicons name="person-circle-outline" size={16} color="#004b87" />
            <Text style={styles.cardHeaderTitle}>FACULTY DATABASE PROFILE</Text>
          </View>

          <View style={styles.rowFields}>
            <View style={{ flex: 1 }}>
              <Text style={styles.fieldLabel}>First Name</Text>
              <TextInput
                style={styles.textInput}
                value={firstName}
                onChangeText={setFirstName}
                placeholder="First Name"
                placeholderTextColor="#94a3b8"
              />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.fieldLabel}>Last Name</Text>
              <TextInput
                style={styles.textInput}
                value={lastName}
                onChangeText={setLastName}
                placeholder="Last Name"
                placeholderTextColor="#94a3b8"
              />
            </View>
          </View>

          <View style={styles.fieldGroup}>
            <Text style={styles.fieldLabel}>Official Email</Text>
            <TextInput
              style={styles.textInput}
              value={email}
              onChangeText={setEmail}
              keyboardType="email-address"
              autoCapitalize="none"
              placeholder="name@deped.gov.ph"
              placeholderTextColor="#94a3b8"
            />
          </View>

          <View style={styles.fieldGroup}>
            <Text style={styles.fieldLabel}>Mobile Contact Number</Text>
            <TextInput
              style={styles.textInput}
              value={contactNumber}
              onChangeText={setContactNumber}
              keyboardType="phone-pad"
              placeholder="09171234567"
              placeholderTextColor="#94a3b8"
            />
          </View>

          <View style={styles.fieldGroup}>
            <Text style={styles.fieldLabel}>New Password (Optional)</Text>
            <View style={styles.passwordWrap}>
              <TextInput
                style={styles.passwordInput}
                value={password}
                onChangeText={setPassword}
                secureTextEntry={!showPassword}
                autoCapitalize="none"
                placeholder="Leave blank to keep current password"
                placeholderTextColor="#94a3b8"
              />
              <TouchableOpacity onPress={() => setShowPassword((prev) => !prev)}>
                <Ionicons
                  name={showPassword ? 'eye-off-outline' : 'eye-outline'}
                  size={18}
                  color="#64748b"
                />
              </TouchableOpacity>
            </View>
          </View>

          <TouchableOpacity
            style={[styles.primaryBtn, savingProfile && { opacity: 0.65 }]}
            onPress={handleSaveProfile}
            disabled={savingProfile}
          >
            {savingProfile ? (
              <ActivityIndicator size="small" color="#ffffff" />
            ) : (
              <>
                <Ionicons name="save-outline" size={16} color="#ffffff" />
                <Text style={styles.primaryBtnText}>Save Profile to Database</Text>
              </>
            )}
          </TouchableOpacity>
        </View>

        {/* 3. Dynamic Backend Server Endpoint */}
        <View style={styles.card}>
          <View style={styles.cardHeaderRow}>
            <Ionicons name="server-outline" size={16} color="#004b87" />
            <Text style={styles.cardHeaderTitle}>DYNAMIC BACKEND SERVER ENDPOINT</Text>
          </View>

          <View style={styles.fieldGroup}>
            <Text style={styles.fieldLabel}>Server Base URL / Domain</Text>
            <TextInput
              style={styles.textInput}
              value={serverUrl}
              onChangeText={setServerUrl}
              autoCapitalize="none"
              autoCorrect={false}
              placeholder="http://172.20.141.220:8000/api"
              placeholderTextColor="#94a3b8"
            />
          </View>

          <TouchableOpacity
            style={[styles.secondaryBtn, savingServer && { opacity: 0.65 }]}
            onPress={handleUpdateEndpoint}
            disabled={savingServer}
          >
            {savingServer ? (
              <ActivityIndicator size="small" color="#004b87" />
            ) : (
              <>
                <Ionicons name="sync-outline" size={16} color="#004b87" />
                <Text style={styles.secondaryBtnText}>Update & Test Server Endpoint</Text>
              </>
            )}
          </TouchableOpacity>

          <TouchableOpacity style={styles.logoutBtn} onPress={logout}>
            <Ionicons name="log-out-outline" size={17} color="#dc2626" />
            <Text style={styles.logoutBtnText}>Log Out</Text>
          </TouchableOpacity>
        </View>
      </ScrollView>

      {/* Optical Gate Pass Modal */}
      <Modal visible={qrPassVisible} transparent animationType="fade">
        <View style={styles.modalBackdrop}>
          <View style={styles.qrModalCard}>
            <View style={styles.qrModalHeader}>
              <View>
                <Text style={styles.qrModalTitle}>Faculty Optical Gate Pass</Text>
                <Text style={styles.qrModalSub}>Scan at Campus Turnstile Kiosk</Text>
              </View>
              <TouchableOpacity onPress={() => setQrPassVisible(false)}>
                <Ionicons name="close" size={22} color="#64748b" />
              </TouchableOpacity>
            </View>

            <View style={styles.qrBox}>
              <QRCode value={qrValue} size={180} color="#0f172a" backgroundColor="#ffffff" />
            </View>

            <Text style={styles.qrPassName}>{displayName}</Text>
            <Text style={styles.qrPassId}>ID: {employeeId}</Text>

            <TouchableOpacity
              style={[styles.primaryBtn, { width: '100%', marginTop: 16 }]}
              onPress={() => setQrPassVisible(false)}
            >
              <Text style={styles.primaryBtnText}>Close Gate Pass</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f8fafc' },
  topHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
    backgroundColor: '#ffffff',
    borderBottomWidth: 1,
    borderBottomColor: '#e2e8f0',
  },
  screenTitle: { fontSize: 17, fontWeight: '800', color: '#003460' },
  screenSub: { fontSize: 10.5, color: '#64748b', marginTop: 1 },
  statusBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 5,
    paddingHorizontal: 10,
    borderRadius: 12,
    gap: 5,
  },
  statusDot: { width: 6, height: 6, borderRadius: 3 },
  statusBadgeText: { fontSize: 9.5, fontWeight: '800' },
  scrollContent: { padding: 14, paddingBottom: 110, gap: 12 },
  identityCard: {
    backgroundColor: '#ffffff',
    borderRadius: 16,
    padding: 14,
    borderWidth: 1,
    borderColor: '#e2e8f0',
  },
  identityRow: { flexDirection: 'row', alignItems: 'center' },
  avatarCircle: {
    width: 46,
    height: 46,
    borderRadius: 23,
    backgroundColor: '#004b87',
    alignItems: 'center',
    justifyContent: 'center',
  },
  identityName: { fontSize: 15, fontWeight: '800', color: '#0f172a' },
  identityMeta: { fontSize: 11, color: '#64748b', marginTop: 2, fontWeight: '600' },
  qrPassBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    backgroundColor: '#e6f0fa',
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#b8d6f0',
  },
  qrPassBtnText: { fontSize: 11.5, fontWeight: '800', color: '#004b87' },
  card: {
    backgroundColor: '#ffffff',
    borderRadius: 16,
    padding: 15,
    borderWidth: 1,
    borderColor: '#e2e8f0',
  },
  cardHeaderRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 12 },
  cardHeaderTitle: { fontSize: 10.5, fontWeight: '800', color: '#004b87', letterSpacing: 0.4 },
  rowFields: { flexDirection: 'row', gap: 10, marginBottom: 10 },
  fieldGroup: { marginBottom: 10 },
  fieldLabel: { fontSize: 11, fontWeight: '700', color: '#334155', marginBottom: 5 },
  textInput: {
    backgroundColor: '#f8fafc',
    borderWidth: 1,
    borderColor: '#cbd5e1',
    borderRadius: 10,
    paddingHorizontal: 12,
    height: 42,
    fontSize: 13,
    color: '#0f172a',
  },
  passwordWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#f8fafc',
    borderWidth: 1,
    borderColor: '#cbd5e1',
    borderRadius: 10,
    paddingHorizontal: 12,
    height: 42,
  },
  passwordInput: { flex: 1, fontSize: 13, color: '#0f172a' },
  primaryBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#004b87',
    paddingVertical: 12,
    borderRadius: 10,
    marginTop: 4,
    gap: 6,
  },
  primaryBtnText: { color: '#ffffff', fontSize: 12.5, fontWeight: '800' },
  secondaryBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#e6f0fa',
    paddingVertical: 11,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#b8d6f0',
    marginTop: 4,
    gap: 6,
  },
  secondaryBtnText: { color: '#004b87', fontSize: 12.5, fontWeight: '800' },
  logoutBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#fef2f2',
    paddingVertical: 11,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#fecaca',
    marginTop: 10,
    gap: 6,
  },
  logoutBtnText: { color: '#dc2626', fontSize: 12.5, fontWeight: '800' },
  modalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(15, 23, 42, 0.65)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
  qrModalCard: {
    width: '100%',
    backgroundColor: '#ffffff',
    borderRadius: 20,
    padding: 20,
    alignItems: 'center',
  },
  qrModalHeader: {
    width: '100%',
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
  },
  qrModalTitle: { fontSize: 15, fontWeight: '800', color: '#0f172a' },
  qrModalSub: { fontSize: 11, color: '#64748b' },
  qrBox: {
    padding: 16,
    backgroundColor: '#f8fafc',
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#e2e8f0',
    marginBottom: 12,
  },
  qrPassName: { fontSize: 15, fontWeight: '800', color: '#0f172a' },
  qrPassId: { fontSize: 11.5, fontWeight: '700', color: '#004b87', marginTop: 2 },
});

export default SettingsScreen;