// D:\AttendSure_V3\mobile\src\screens\SettingsScreen.tsx

import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TextInput,
  TouchableOpacity,
  ScrollView,
  Image,
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
import { getServerBaseUrl } from '../services/configService';

export interface ExtendedUserProfile {
  id?: number | string;
  username?: string;
  first_name?: string;
  last_name?: string;
  middle_name?: string;
  suffix?: string;
  email?: string;
  contact_number?: string;
  phone?: string;
  position?: string;
  department?: string;
  role?: string;
  employee_id?: string;
  faculty_id?: string;
  full_name?: string;
  qr_token?: string;
  photo?: string | null;
  avatar?: string | null;
}

const showAlert = (title: string, message: string) => {
  if (Platform.OS === 'web' && typeof window !== 'undefined') {
    window.alert(`${title}: ${message}`);
  } else {
    Alert.alert(title, message);
  }
};

export const SettingsScreen: React.FC = () => {
  const { user, logout, refreshUser } = useAuth();
  const currentUser = user as (typeof user & ExtendedUserProfile) | null;

  // Profile Form State
  const [firstName, setFirstName] = useState<string>(currentUser?.first_name || '');
  const [lastName, setLastName] = useState<string>(currentUser?.last_name || '');
  const [middleName, setMiddleName] = useState<string>(currentUser?.middle_name || '');
  const [suffix, setSuffix] = useState<string>(currentUser?.suffix || '');
  const [email, setEmail] = useState<string>(currentUser?.email || '');
  const [contactNumber, setContactNumber] = useState<string>(
    currentUser?.contact_number || currentUser?.phone || ''
  );
  const [position, setPosition] = useState<string>(currentUser?.position || '');
  const [department, setDepartment] = useState<string>(currentUser?.department || '');
  const [photoUrl, setPhotoUrl] = useState<string | null>(
    currentUser?.photo || currentUser?.avatar || null
  );

  // Security & State
  const [password, setPassword] = useState<string>('');
  const [showPassword, setShowPassword] = useState<boolean>(false);
  const [saving, setSaving] = useState<boolean>(false);
  const [serverBase, setServerBase] = useState<string>('');
  const [onlineStatus, setOnlineStatus] = useState<'CONNECTING' | 'ONLINE' | 'OFFLINE'>('CONNECTING');
  const [gatePassVisible, setGatePassVisible] = useState<boolean>(false);

  // Resolve media paths safely
  const resolvePhotoUrl = useCallback((path: string | null, base: string) => {
    if (!path) return null;
    if (path.startsWith('http://') || path.startsWith('https://') || path.startsWith('data:')) {
      return path;
    }
    const cleanBase = base.replace(/\/+$/, '');
    const cleanPath = path.startsWith('/') ? path : `/${path}`;
    return `${cleanBase}${cleanPath}`;
  }, []);

  // Fetch verified profile from database
  const loadProfile = useCallback(async () => {
    try {
      const activeBase = await getServerBaseUrl();
      setServerBase(activeBase);

      const res = await apiClient.get('/api/me/');
      if (res.data) {
        setFirstName(res.data.first_name || '');
        setLastName(res.data.last_name || '');
        setMiddleName(res.data.middle_name || '');
        setSuffix(res.data.suffix || '');
        setEmail(res.data.email || '');
        setContactNumber(res.data.contact_number || res.data.phone || '');
        setPosition(res.data.position || '');
        setDepartment(res.data.department || '');
        setPhotoUrl(res.data.photo || res.data.avatar || null);
        setOnlineStatus('ONLINE');
      }
    } catch {
      setOnlineStatus('OFFLINE');
    }
  }, []);

  useEffect(() => {
    loadProfile();
  }, [loadProfile]);

  // Save profile changes
  const handleSave = async () => {
    if (!firstName.trim() || !lastName.trim()) {
      showAlert('Required', 'First Name and Last Name are required.');
      return;
    }

    setSaving(true);
    try {
      const payload: Record<string, any> = {
        first_name: firstName.trim(),
        last_name: lastName.trim(),
        middle_name: middleName.trim(),
        suffix: suffix.trim(),
        email: email.trim(),
        contact_number: contactNumber.trim(),
        position: position.trim(),
        department: department.trim(),
      };

      if (password.trim().length > 0) {
        if (password.trim().length < 6) {
          showAlert('Security', 'Password must be at least 6 characters.');
          setSaving(false);
          return;
        }
        payload.password = password.trim();
      }

      await apiClient.put('/api/me/', payload);
      setPassword('');
      await refreshUser();
      showAlert('Success', 'Profile saved.');
    } catch (err: any) {
      showAlert('Error', err?.response?.data?.error || 'Could not save profile.');
    } finally {
      setSaving(false);
    }
  };

  const displayName =
    `${firstName} ${lastName}`.trim() ||
    currentUser?.full_name ||
    currentUser?.username ||
    'Faculty';
  const employeeId = currentUser?.faculty_id || currentUser?.username || '';
  const roleLabel = currentUser?.role || 'FACULTY';
  const qrValue = currentUser?.qr_token || employeeId || 'ATTENDSURE';
  const fullAvatarUri = resolvePhotoUrl(photoUrl, serverBase);

  return (
    <SafeAreaView style={styles.container} edges={['top', 'left', 'right']}>
      {/* Header */}
      <View style={styles.topHeader}>
        <View style={{ flex: 1 }}>
          <Text style={styles.screenTitle}>Settings</Text>
          <Text style={styles.screenSub}>Profile & Gate Pass</Text>
        </View>
        <View
          style={[
            styles.statusBadge,
            onlineStatus === 'ONLINE'
              ? { backgroundColor: '#dcfce7' }
              : onlineStatus === 'CONNECTING'
              ? { backgroundColor: '#fef3c7' }
              : { backgroundColor: '#fee2e2' },
          ]}
        >
          <View
            style={[
              styles.statusDot,
              {
                backgroundColor:
                  onlineStatus === 'ONLINE'
                    ? '#10b981'
                    : onlineStatus === 'CONNECTING'
                    ? '#f59e0b'
                    : '#ef4444',
              },
            ]}
          />
          <Text
            style={[
              styles.statusBadgeText,
              {
                color:
                  onlineStatus === 'ONLINE'
                    ? '#065f46'
                    : onlineStatus === 'CONNECTING'
                    ? '#92400e'
                    : '#991b1b',
              },
            ]}
          >
            {onlineStatus === 'ONLINE'
              ? 'ONLINE'
              : onlineStatus === 'CONNECTING'
              ? 'CONNECTING'
              : 'OFFLINE'}
          </Text>
        </View>
      </View>

      <ScrollView
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        {/* User Card */}
        <View style={styles.identityCard}>
          <View style={styles.identityRow}>
            {fullAvatarUri ? (
              <Image source={{ uri: fullAvatarUri }} style={styles.avatarImage} />
            ) : (
              <View style={styles.avatarCircle}>
                <Ionicons name="person" size={24} color="#ffffff" />
              </View>
            )}
            <View style={{ flex: 1, marginLeft: 12 }}>
              <Text style={styles.identityName}>{displayName}</Text>
              <Text style={styles.identityMeta}>
                {roleLabel} &bull; ID: {employeeId}
              </Text>
            </View>
            <TouchableOpacity
              style={styles.qrPassBtn}
              onPress={() => setGatePassVisible(true)}
            >
              <Ionicons name="qr-code-outline" size={16} color="#004b87" />
              <Text style={styles.qrPassBtnText}>Gate Pass</Text>
            </TouchableOpacity>
          </View>
        </View>

        {/* Profile Card */}
        <View style={styles.card}>
          <View style={styles.cardHeaderRow}>
            <Ionicons name="person-circle-outline" size={16} color="#004b87" />
            <Text style={styles.cardHeaderTitle}>PROFILE</Text>
          </View>

          {/* First Name & Last Name */}
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

          {/* Middle Name & Suffix */}
          <View style={styles.rowFields}>
            <View style={{ flex: 1 }}>
              <Text style={styles.fieldLabel}>Middle Name</Text>
              <TextInput
                style={styles.textInput}
                value={middleName}
                onChangeText={setMiddleName}
                placeholder="Middle Name"
                placeholderTextColor="#94a3b8"
              />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.fieldLabel}>Suffix</Text>
              <TextInput
                style={styles.textInput}
                value={suffix}
                onChangeText={setSuffix}
                placeholder="Suffix"
                placeholderTextColor="#94a3b8"
              />
            </View>
          </View>

          {/* Email */}
          <View style={styles.fieldGroup}>
            <Text style={styles.fieldLabel}>Email</Text>
            <TextInput
              style={styles.textInput}
              value={email}
              onChangeText={setEmail}
              keyboardType="email-address"
              autoCapitalize="none"
              placeholder="email@school.edu.ph"
              placeholderTextColor="#94a3b8"
            />
          </View>

          {/* Contact Number */}
          <View style={styles.fieldGroup}>
            <Text style={styles.fieldLabel}>Contact Number</Text>
            <TextInput
              style={styles.textInput}
              value={contactNumber}
              onChangeText={setContactNumber}
              keyboardType="phone-pad"
              placeholder="09123456789"
              placeholderTextColor="#94a3b8"
            />
          </View>

          {/* Position */}
          <View style={styles.fieldGroup}>
            <Text style={styles.fieldLabel}>Position</Text>
            <TextInput
              style={styles.textInput}
              value={position}
              onChangeText={setPosition}
              placeholder="Position"
              placeholderTextColor="#94a3b8"
            />
          </View>

          {/* Department */}
          <View style={styles.fieldGroup}>
            <Text style={styles.fieldLabel}>Department</Text>
            <TextInput
              style={styles.textInput}
              value={department}
              onChangeText={setDepartment}
              placeholder="Department"
              placeholderTextColor="#94a3b8"
            />
          </View>

          {/* New Password */}
          <View style={styles.fieldGroup}>
            <Text style={styles.fieldLabel}>New Password</Text>
            <View style={styles.passwordWrap}>
              <TextInput
                style={styles.passwordInput}
                value={password}
                onChangeText={setPassword}
                secureTextEntry={!showPassword}
                autoCapitalize="none"
                placeholder="Leave blank to keep current"
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

          {/* Save Button */}
          <TouchableOpacity
            style={[styles.primaryBtn, saving && { opacity: 0.65 }]}
            onPress={handleSave}
            disabled={saving}
          >
            {saving ? (
              <ActivityIndicator size="small" color="#ffffff" />
            ) : (
              <>
                <Ionicons name="save-outline" size={16} color="#ffffff" />
                <Text style={styles.primaryBtnText}>Save</Text>
              </>
            )}
          </TouchableOpacity>
        </View>

        {/* Log Out */}
        <TouchableOpacity style={styles.logoutBtn} onPress={logout}>
          <Ionicons name="log-out-outline" size={17} color="#dc2626" />
          <Text style={styles.logoutBtnText}>Log Out</Text>
        </TouchableOpacity>
      </ScrollView>

      {/* Gate Pass Modal */}
      <Modal visible={gatePassVisible} transparent animationType="fade">
        <View style={styles.modalBackdrop}>
          <View style={styles.qrModalCard}>
            <View style={styles.qrModalHeader}>
              <View>
                <Text style={styles.qrModalTitle}>Gate Pass</Text>
                <Text style={styles.qrModalSub}>Scan at Kiosk</Text>
              </View>
              <TouchableOpacity onPress={() => setGatePassVisible(false)}>
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
              onPress={() => setGatePassVisible(false)}
            >
              <Text style={styles.primaryBtnText}>Close</Text>
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
  avatarImage: {
    width: 48,
    height: 48,
    borderRadius: 24,
    borderWidth: 1,
    borderColor: '#cbd5e1',
  },
  avatarCircle: {
    width: 48,
    height: 48,
    borderRadius: 24,
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
  cardHeaderTitle: { fontSize: 11, fontWeight: '800', color: '#004b87', letterSpacing: 0.5 },
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
  primaryBtnText: { color: '#ffffff', fontSize: 13, fontWeight: '800' },
  logoutBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#fef2f2',
    paddingVertical: 11,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#fecaca',
    marginTop: 4,
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