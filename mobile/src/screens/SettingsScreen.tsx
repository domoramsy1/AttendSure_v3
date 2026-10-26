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
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import QRCode from 'react-native-qrcode-svg';
import { useAuth } from '../context/AuthContext';
import { apiClient } from '../api/client';
import { getServerBaseUrl, setServerBaseUrl, resetServerBaseUrl } from '../services/configService';

export interface ExtendedUserProfile {
  id?: number | string;
  username?: string;
  first_name?: string;
  last_name?: string;
  middle_name?: string;
  suffix?: string;
  full_name?: string;
  email?: string;
  contact_number?: string;
  phone?: string;
  position?: string;
  department?: string;
  role?: string;
  employee_id?: string;
  faculty_id?: string | number;
  photo?: string | null;
  photo_url?: string | null;
  bound_device_id?: string | null;
}

export const SettingsScreen: React.FC = () => {
  const { user, logout, updateUser } = useAuth();

  const [profile, setProfile] = useState<ExtendedUserProfile | null>(user as ExtendedUserProfile | null);
  const [loading, setLoading] = useState<boolean>(true);
  const [saving, setSaving] = useState<boolean>(false);

  // Edit fields
  const [firstName, setFirstName] = useState<string>('');
  const [lastName, setLastName] = useState<string>('');
  const [contactNumber, setContactNumber] = useState<string>('');
  const [email, setEmail] = useState<string>('');
  const [newPassword, setNewPassword] = useState<string>('');

  // Server Endpoint Modal
  const [serverModalVisible, setServerModalVisible] = useState<boolean>(false);
  const [serverUrlInput, setServerUrlInput] = useState<string>('');
  const [currentServerUrl, setCurrentServerUrl] = useState<string>('');

  const fetchProfile = useCallback(async () => {
    try {
      const res = await apiClient.get<ExtendedUserProfile>('me/');
      if (res.data) {
        setProfile(res.data);
        setFirstName(res.data.first_name || '');
        setLastName(res.data.last_name || '');
        setContactNumber(res.data.contact_number || res.data.phone || '');
        setEmail(res.data.email || '');
      }
    } catch {
      if (user) {
        setFirstName(user.first_name || '');
        setLastName(user.last_name || '');
        setContactNumber(user.contact_number || '');
        setEmail(user.email || '');
      }
    } finally {
      setLoading(false);
    }
  }, [user]);

  useEffect(() => {
    fetchProfile();
    getServerBaseUrl().then((url) => {
      setCurrentServerUrl(url);
      setServerUrlInput(url);
    });
  }, [fetchProfile]);

  const handleSaveProfile = async () => {
    setSaving(true);
    try {
      const payload: Record<string, string> = {
        first_name: firstName.trim(),
        last_name: lastName.trim(),
        contact_number: contactNumber.trim(),
        email: email.trim(),
      };
      if (newPassword.trim()) {
        payload.password = newPassword.trim();
      }

      const res = await apiClient.put('me/', payload);
      if (res.data) {
        setProfile(res.data);
        updateUser(res.data);
      }
      setNewPassword('');
      Alert.alert('Saved', 'Your profile details have been updated.');
    } catch (err: any) {
      Alert.alert('Error', err?.response?.data?.error || 'Failed to update profile.');
    } finally {
      setSaving(false);
    }
  };

  const handleSaveServer = async () => {
    try {
      await setServerBaseUrl(serverUrlInput);
      const updated = await getServerBaseUrl();
      setCurrentServerUrl(updated);
      setServerModalVisible(false);
      Alert.alert('Server Connected', `Active address: ${updated}`);
    } catch (err: any) {
      Alert.alert('Invalid URL', err?.message || 'Please check server address format.');
    }
  };

  const handleResetServer = async () => {
    await resetServerBaseUrl();
    const def = await getServerBaseUrl();
    setCurrentServerUrl(def);
    setServerUrlInput(def);
    setServerModalVisible(false);
    Alert.alert('Reset', 'Restored default school server address.');
  };

  const qrPayload = JSON.stringify({
    app: 'ATTENDSURE_PASS',
    id: profile?.employee_id || profile?.username || 'EMPLOYEE',
    name: profile?.full_name || `${firstName} ${lastName}`.trim(),
    role: profile?.role || 'FACULTY',
  });

  if (loading) {
    return (
      <View style={styles.centerBox}>
        <ActivityIndicator size="small" color="#004b87" />
        <Text style={styles.loadingText}>Loading profile settings...</Text>
      </View>
    );
  }

  return (
    <SafeAreaView style={styles.container} edges={['left', 'right']}>
      <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
        {/* Profile Header Card */}
        <View style={styles.profileHeaderCard}>
          <View style={styles.avatarCircle}>
            {profile?.photo_url || profile?.photo ? (
              <Image source={{ uri: profile.photo_url || profile.photo || '' }} style={styles.avatarImg} contentFit="cover" />
            ) : (
              <Ionicons name="person" size={36} color="#004b87" />
            )}
          </View>
          <Text style={styles.profileName}>{profile?.full_name || `${firstName} ${lastName}`.trim() || 'Employee'}</Text>
          <Text style={styles.profileRole}>{profile?.position || profile?.role || 'Faculty'}</Text>
          <Text style={styles.profileDept}>{profile?.department || 'Academic Department'}</Text>

          <View style={styles.badgeRow}>
            <View style={styles.idChip}>
              <Ionicons name="id-card-outline" size={12} color="#004b87" />
              <Text style={styles.idChipText}>ID: {profile?.employee_id || profile?.username || '—'}</Text>
            </View>
            <View style={styles.idChip}>
              <Ionicons name="shield-checkmark-outline" size={12} color="#059669" />
              <Text style={[styles.idChipText, { color: '#059669' }]}>Hardware Paired</Text>
            </View>
          </View>
        </View>

        {/* Digital Clearance QR Pass */}
        <View style={styles.card}>
          <Text style={styles.cardTitle}>Digital Clearance Pass</Text>
          <Text style={styles.cardSubtitle}>Scan at campus gate kiosks for physical check-in and check-out.</Text>
          <View style={styles.qrContainer}>
            <QRCode value={qrPayload} size={150} color="#004b87" backgroundColor="#ffffff" />
          </View>
        </View>

        {/* Edit Information Form */}
        <View style={styles.card}>
          <Text style={styles.cardTitle}>Account Details</Text>

          <Text style={styles.inputLabel}>First Name</Text>
          <TextInput style={styles.input} value={firstName} onChangeText={setFirstName} placeholder="First Name" />

          <Text style={styles.inputLabel}>Last Name</Text>
          <TextInput style={styles.input} value={lastName} onChangeText={setLastName} placeholder="Last Name" />

          <Text style={styles.inputLabel}>Email Address</Text>
          <TextInput
            style={styles.input}
            value={email}
            onChangeText={setEmail}
            keyboardType="email-address"
            autoCapitalize="none"
          />

          <Text style={styles.inputLabel}>Mobile Phone</Text>
          <TextInput
            style={styles.input}
            value={contactNumber}
            onChangeText={setContactNumber}
            keyboardType="phone-pad"
            placeholder="09123456789"
          />

          <Text style={styles.inputLabel}>Change Password (leave blank to keep current)</Text>
          <TextInput
            style={styles.input}
            value={newPassword}
            onChangeText={setNewPassword}
            secureTextEntry
            placeholder="New password"
          />

          <TouchableOpacity
            style={[styles.saveBtn, saving && { opacity: 0.6 }]}
            onPress={handleSaveProfile}
            disabled={saving}
            activeOpacity={0.8}
          >
            {saving ? (
              <ActivityIndicator size="small" color="#ffffff" />
            ) : (
              <Text style={styles.saveBtnText}>Save Account Changes</Text>
            )}
          </TouchableOpacity>
        </View>

        {/* Server & Connectivity Settings */}
        <View style={styles.card}>
          <Text style={styles.cardTitle}>School Server Endpoint</Text>
          <Text style={styles.cardSubtitle}>Active Backend: {currentServerUrl || 'Detecting...'}</Text>

          <TouchableOpacity style={styles.serverBtn} onPress={() => setServerModalVisible(true)} activeOpacity={0.8}>
            <Ionicons name="server-outline" size={16} color="#004b87" />
            <Text style={styles.serverBtnText}>Change Server Address</Text>
          </TouchableOpacity>
        </View>

        {/* Sign Out */}
        <TouchableOpacity style={styles.logoutBtn} onPress={logout} activeOpacity={0.8}>
          <Ionicons name="log-out-outline" size={18} color="#dc2626" />
          <Text style={styles.logoutBtnText}>Sign Out</Text>
        </TouchableOpacity>
      </ScrollView>

      {/* Server Config Modal */}
      <Modal visible={serverModalVisible} transparent animationType="fade">
        <View style={styles.modalOverlay}>
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>Configure School Server</Text>
            <Text style={styles.modalSubtitle}>Enter your local Wi-Fi IP address or Cloudflare tunnel URL.</Text>

            <TextInput
              style={styles.modalInput}
              value={serverUrlInput}
              onChangeText={setServerUrlInput}
              placeholder="http://192.168.100.4:8000"
              autoCapitalize="none"
              autoCorrect={false}
            />

            <View style={styles.modalRow}>
              <TouchableOpacity style={styles.resetBtn} onPress={handleResetServer}>
                <Text style={styles.resetBtnText}>Reset Default</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.saveServerBtn} onPress={handleSaveServer}>
                <Text style={styles.saveServerBtnText}>Apply</Text>
              </TouchableOpacity>
            </View>

            <TouchableOpacity style={styles.closeBtn} onPress={() => setServerModalVisible(false)}>
              <Text style={styles.closeBtnText}>Cancel</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f8fafc' },
  centerBox: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24 },
  loadingText: { fontSize: 12, color: '#64748b', marginTop: 8, fontWeight: '600' },
  scrollContent: { padding: 16, paddingBottom: 110, gap: 14 },
  profileHeaderCard: {
    backgroundColor: '#ffffff',
    borderRadius: 16,
    padding: 18,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#e2e8f0',
  },
  avatarCircle: {
    width: 76,
    height: 76,
    borderRadius: 38,
    backgroundColor: '#e6f0fa',
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
    borderWidth: 2,
    borderColor: '#b8d6f0',
    marginBottom: 10,
  },
  avatarImg: { width: '100%', height: '100%' },
  profileName: { fontSize: 17, fontWeight: '800', color: '#0f172a', textAlign: 'center' },
  profileRole: { fontSize: 12.5, fontWeight: '700', color: '#004b87', marginTop: 2 },
  profileDept: { fontSize: 11.5, color: '#64748b', marginTop: 1 },
  badgeRow: { flexDirection: 'row', gap: 6, marginTop: 10 },
  idChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: '#f1f5f9',
    paddingVertical: 3,
    paddingHorizontal: 8,
    borderRadius: 6,
  },
  idChipText: { fontSize: 10.5, fontWeight: '700', color: '#334155' },
  card: {
    backgroundColor: '#ffffff',
    borderRadius: 14,
    padding: 16,
    borderWidth: 1,
    borderColor: '#e2e8f0',
  },
  cardTitle: { fontSize: 14, fontWeight: '800', color: '#0f172a', marginBottom: 2 },
  cardSubtitle: { fontSize: 11, color: '#64748b', marginBottom: 12 },
  qrContainer: { alignItems: 'center', paddingVertical: 10 },
  inputLabel: { fontSize: 11, fontWeight: '700', color: '#334155', marginBottom: 4, marginTop: 8 },
  input: {
    backgroundColor: '#f8fafc',
    borderWidth: 1,
    borderColor: '#cbd5e1',
    borderRadius: 8,
    paddingHorizontal: 12,
    height: 42,
    fontSize: 13,
    color: '#0f172a',
  },
  saveBtn: {
    backgroundColor: '#004b87',
    borderRadius: 8,
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 14,
  },
  saveBtnText: { color: '#ffffff', fontSize: 13, fontWeight: '700' },
  serverBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    backgroundColor: '#e6f0fa',
    borderRadius: 8,
    paddingVertical: 10,
    borderWidth: 1,
    borderColor: '#b8d6f0',
  },
  serverBtnText: { color: '#004b87', fontSize: 12, fontWeight: '700' },
  logoutBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    backgroundColor: '#fee2e2',
    borderRadius: 10,
    paddingVertical: 12,
    borderWidth: 1,
    borderColor: '#fca5a5',
    marginTop: 4,
  },
  logoutBtnText: { color: '#dc2626', fontSize: 13, fontWeight: '800' },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(15, 23, 42, 0.65)',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 20,
  },
  modalCard: {
    backgroundColor: '#ffffff',
    borderRadius: 16,
    padding: 20,
    width: '100%',
    maxWidth: 340,
  },
  modalTitle: { fontSize: 15, fontWeight: '800', color: '#0f172a' },
  modalSubtitle: { fontSize: 11, color: '#64748b', marginTop: 2, marginBottom: 12 },
  modalInput: {
    backgroundColor: '#f8fafc',
    borderWidth: 1,
    borderColor: '#cbd5e1',
    borderRadius: 8,
    paddingHorizontal: 12,
    height: 44,
    fontSize: 13,
    color: '#0f172a',
    marginBottom: 12,
  },
  modalRow: { flexDirection: 'row', gap: 8 },
  resetBtn: {
    flex: 1,
    backgroundColor: '#f1f5f9',
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
    height: 40,
  },
  resetBtnText: { fontSize: 12, fontWeight: '700', color: '#475569' },
  saveServerBtn: {
    flex: 1,
    backgroundColor: '#004b87',
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
    height: 40,
  },
  saveServerBtnText: { fontSize: 12, fontWeight: '700', color: '#ffffff' },
  closeBtn: { marginTop: 10, alignItems: 'center', paddingVertical: 6 },
  closeBtnText: { fontSize: 11.5, color: '#64748b', fontWeight: '600' },
});

export default SettingsScreen;