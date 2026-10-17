// mobile/src/screens/ProfileSettingsScreen.tsx

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
  StatusBar,
  Modal,
  Platform,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import QRCode from 'react-native-qrcode-svg';
import { useAuth } from '../context/AuthContext';
import { apiClient } from '../api/client';

export const ProfileSettingsScreen: React.FC = () => {
  const navigation = useNavigation<any>();
  const { user, logout, deviceIdentity, updateUser } = useAuth();

  const [firstName, setFirstName] = useState<string>('');
  const [lastName, setLastName] = useState<string>('');
  const [email, setEmail] = useState<string>('');
  const [contactNumber, setContactNumber] = useState<string>('');
  const [newPassword, setNewPassword] = useState<string>('');
  const [confirmPassword, setConfirmPassword] = useState<string>('');
  const [showPassword, setShowPassword] = useState<boolean>(false);

  const [loading, setLoading] = useState<boolean>(true);
  const [saving, setSaving] = useState<boolean>(false);
  const [qrPassVisible, setQrPassVisible] = useState<boolean>(false);

  const displayName =
    `${firstName} ${lastName}`.trim() ||
    user?.full_name ||
    user?.faculty_name ||
    user?.username ||
    '';

  const employeeId = user?.faculty_id || user?.username || '';
  const roleName = user?.role || (user?.is_superuser ? 'ADMIN' : 'FACULTY');
  const qrValue = user?.qr_token || user?.faculty_id || user?.username || '';
  const hardwareUuid = deviceIdentity?.deviceId || user?.bound_device_id || '';
  const schoolName = user?.school_name || 'Department of Education';
  const division = user?.division || 'Schools Division Office';
  const department = user?.department || 'Faculty Department';

  const loadProfile = useCallback(async () => {
    try {
      const res = await apiClient.get('/api/me/');
      const data = res.data;
      if (data) {
        setFirstName(data.first_name || '');
        setLastName(data.last_name || '');
        setEmail(data.email || '');
        setContactNumber(data.contact_number || '');
      }
    } catch {
      if (user) {
        setFirstName(user.first_name || '');
        setLastName(user.last_name || '');
        setEmail(user.email || '');
        setContactNumber(user.contact_number || '');
      }
    } finally {
      setLoading(false);
    }
  }, [user]);

  useEffect(() => {
    loadProfile();
  }, [loadProfile]);

  const handleSaveProfile = async () => {
    if (!firstName.trim() || !lastName.trim()) {
      Alert.alert('Incomplete Name', 'First name and last name are required.');
      return;
    }

    if (newPassword && newPassword.length < 6) {
      Alert.alert('Weak Password', 'New password must have at least 6 characters.');
      return;
    }

    if (newPassword && newPassword !== confirmPassword) {
      Alert.alert('Password Mismatch', 'Confirmation password does not match.');
      return;
    }

    setSaving(true);
    try {
      const payload: any = {
        first_name: firstName.trim(),
        last_name: lastName.trim(),
        email: email.trim(),
        contact_number: contactNumber.trim(),
      };

      if (newPassword) {
        payload.password = newPassword.trim();
      }

      const res = await apiClient.put('/api/me/', payload);
      const data = res.data;

      const fullName = `${data.first_name || firstName.trim()} ${data.last_name || lastName.trim()}`.trim();
      await updateUser({
        first_name: data.first_name || firstName.trim(),
        last_name: data.last_name || lastName.trim(),
        full_name: fullName,
        faculty_name: fullName,
        email: data.email || email.trim(),
        contact_number: data.contact_number || contactNumber.trim(),
      });

      setNewPassword('');
      setConfirmPassword('');
      Alert.alert('Profile Saved', 'Your personal credentials were saved successfully.');
    } catch (err: any) {
      const msg = err?.response?.data?.error || 'Unable to update profile. Check your connection.';
      Alert.alert('Save Failed', msg);
    } finally {
      setSaving(false);
    }
  };

  const confirmSignOut = () => {
    Alert.alert(
      'Log Out',
      'Are you sure you want to log out from this smartphone?',
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Log Out', style: 'destructive', onPress: logout },
      ]
    );
  };

  return (
    <SafeAreaView style={styles.container} edges={['top', 'left', 'right']}>
      <StatusBar barStyle="dark-content" backgroundColor="#ffffff" />

      <View style={styles.topHeader}>
        <TouchableOpacity
          style={styles.backButton}
          onPress={() => navigation.goBack()}
          activeOpacity={0.7}
        >
          <Ionicons name="arrow-back" size={20} color="#003460" />
        </TouchableOpacity>

        <View style={{ flex: 1, marginLeft: 10 }}>
          <Text style={styles.screenTitle}>Faculty Profile</Text>
          <Text style={styles.screenSub}>Civil Service Credentials & Settings</Text>
        </View>

        <View style={styles.headerBadge}>
          <View style={styles.activeDot} />
          <Text style={styles.headerBadgeText}>DEPED CSC</Text>
        </View>
      </View>

      <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
        {/* 1. Identity Card */}
        <View style={styles.identityCard}>
          <View style={styles.identityRow}>
            <View style={styles.avatarCircle}>
              <Text style={styles.avatarInitial}>{displayName.charAt(0).toUpperCase()}</Text>
            </View>

            <View style={{ flex: 1, marginLeft: 14 }}>
              <Text style={styles.facultyNameText} numberOfLines={1}>
                {displayName}
              </Text>
              <Text style={styles.facultyRoleText}>
                {roleName} • {department}
              </Text>
              {employeeId ? (
                <Text style={styles.employeeIdText}>Employee ID: {employeeId}</Text>
              ) : null}
            </View>
          </View>

          {qrValue ? (
            <>
              <View style={styles.cardDivider} />
              <TouchableOpacity
                style={styles.gatePassLauncherBtn}
                onPress={() => setQrPassVisible(true)}
                activeOpacity={0.8}
              >
                <Ionicons name="qr-code" size={17} color="#004b87" />
                <Text style={styles.gatePassLauncherBtnText}>Show Turnstile Optical Pass</Text>
                <Ionicons name="chevron-forward" size={15} color="#004b87" style={{ marginLeft: 'auto' }} />
              </TouchableOpacity>
            </>
          ) : null}
        </View>

        {/* 2. Personal Credentials */}
        <View style={styles.card}>
          <View style={styles.cardHeaderRow}>
            <Ionicons name="create-outline" size={17} color="#004b87" />
            <Text style={styles.cardHeaderTitle}>PERSONAL CREDENTIALS</Text>
          </View>

          {loading ? (
            <View style={styles.loadingInner}>
              <ActivityIndicator size="small" color="#004b87" />
              <Text style={styles.loadingInnerText}>Loading faculty record...</Text>
            </View>
          ) : (
            <>
              <View style={styles.fieldGroup}>
                <Text style={styles.fieldLabel}>First Name</Text>
                <TextInput
                  style={styles.textInput}
                  value={firstName}
                  onChangeText={setFirstName}
                  placeholder="Enter first name"
                  placeholderTextColor="#94a3b8"
                />
              </View>

              <View style={styles.fieldGroup}>
                <Text style={styles.fieldLabel}>Last Name</Text>
                <TextInput
                  style={styles.textInput}
                  value={lastName}
                  onChangeText={setLastName}
                  placeholder="Enter last name"
                  placeholderTextColor="#94a3b8"
                />
              </View>

              <View style={styles.fieldGroup}>
                <Text style={styles.fieldLabel}>Official Email Address</Text>
                <TextInput
                  style={styles.textInput}
                  value={email}
                  onChangeText={setEmail}
                  placeholder="faculty@deped.gov.ph"
                  placeholderTextColor="#94a3b8"
                  keyboardType="email-address"
                  autoCapitalize="none"
                />
              </View>

              <View style={styles.fieldGroup}>
                <Text style={styles.fieldLabel}>Mobile Phone Number</Text>
                <TextInput
                  style={styles.textInput}
                  value={contactNumber}
                  onChangeText={setContactNumber}
                  placeholder="09171234567"
                  placeholderTextColor="#94a3b8"
                  keyboardType="phone-pad"
                />
              </View>
            </>
          )}
        </View>

        {/* 3. Password Security */}
        <View style={styles.card}>
          <View style={styles.cardHeaderRow}>
            <Ionicons name="lock-closed-outline" size={17} color="#004b87" />
            <Text style={styles.cardHeaderTitle}>SECURITY & PASSWORD</Text>
          </View>

          <View style={styles.fieldGroup}>
            <Text style={styles.fieldLabel}>New Password (leave blank to keep current)</Text>
            <View style={styles.passwordInputWrap}>
              <TextInput
                style={styles.passwordInput}
                value={newPassword}
                onChangeText={setNewPassword}
                placeholder="Minimum 6 characters"
                placeholderTextColor="#94a3b8"
                secureTextEntry={!showPassword}
                autoCapitalize="none"
              />
              <TouchableOpacity
                onPress={() => setShowPassword(!showPassword)}
                style={styles.eyeBtn}
              >
                <Ionicons
                  name={showPassword ? 'eye-off-outline' : 'eye-outline'}
                  size={18}
                  color="#64748b"
                />
              </TouchableOpacity>
            </View>
          </View>

          {newPassword.length > 0 && (
            <View style={styles.fieldGroup}>
              <Text style={styles.fieldLabel}>Confirm New Password</Text>
              <TextInput
                style={styles.textInput}
                value={confirmPassword}
                onChangeText={setConfirmPassword}
                placeholder="Re-type new password"
                placeholderTextColor="#94a3b8"
                secureTextEntry={!showPassword}
                autoCapitalize="none"
              />
            </View>
          )}

          <TouchableOpacity
            style={[styles.saveBtn, saving && styles.btnDisabled]}
            onPress={handleSaveProfile}
            disabled={saving}
            activeOpacity={0.85}
          >
            {saving ? (
              <ActivityIndicator size="small" color="#ffffff" />
            ) : (
              <>
                <Ionicons name="save-outline" size={16} color="#ffffff" style={{ marginRight: 6 }} />
                <Text style={styles.saveBtnText}>Save Profile Changes</Text>
              </>
            )}
          </TouchableOpacity>
        </View>

        {/* 4. Institutional Information */}
        <View style={styles.card}>
          <View style={styles.cardHeaderRow}>
            <Ionicons name="hardware-chip-outline" size={17} color="#004b87" />
            <Text style={styles.cardHeaderTitle}>INSTITUTION & DEVICE</Text>
          </View>

          <View style={styles.infoRow}>
            <Text style={styles.infoLabel}>School:</Text>
            <Text style={styles.infoValue}>{schoolName}</Text>
          </View>

          <View style={styles.infoRow}>
            <Text style={styles.infoLabel}>Division:</Text>
            <Text style={styles.infoValue}>{division}</Text>
          </View>

          {hardwareUuid ? (
            <View style={styles.infoRow}>
              <Text style={styles.infoLabel}>Bound Hardware:</Text>
              <Text style={styles.infoValueMono} numberOfLines={1} ellipsizeMode="middle">
                {hardwareUuid}
              </Text>
            </View>
          ) : null}
        </View>

        {/* 5. Log Out */}
        <View style={[styles.card, { backgroundColor: '#fffafa', borderColor: '#fecaca' }]}>
          <TouchableOpacity style={styles.logoutBtn} onPress={confirmSignOut} activeOpacity={0.8}>
            <Ionicons name="log-out-outline" size={18} color="#dc2626" />
            <Text style={styles.logoutBtnText}>Log Out</Text>
          </TouchableOpacity>
        </View>
      </ScrollView>

      {/* Gate Pass Modal */}
      <Modal visible={qrPassVisible} animationType="fade" transparent>
        <View style={styles.modalOverlay}>
          <View style={styles.qrSheet}>
            <View style={styles.qrSheetHeader}>
              <View>
                <Text style={styles.qrSheetTitle}>Civil Service Form 48 Pass</Text>
                <Text style={styles.qrSheetSub}>Turnstile Scanner Barcode</Text>
              </View>
              <TouchableOpacity onPress={() => setQrPassVisible(false)}>
                <Ionicons name="close" size={22} color="#64748b" />
              </TouchableOpacity>
            </View>

            <View style={styles.qrContainer}>
              <QRCode value={qrValue || 'UNSET'} size={180} color="#0f172a" backgroundColor="#ffffff" />
            </View>

            <View style={styles.qrMetaBox}>
              <Text style={styles.qrMetaLabel}>EMPLOYEE IDENTIFIER</Text>
              <Text style={styles.qrMetaValue}>{employeeId}</Text>
            </View>

            <TouchableOpacity style={styles.qrCloseBtn} onPress={() => setQrPassVisible(false)}>
              <Text style={styles.qrCloseBtnText}>Close Pass</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f8fafc' },
  topHeader: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 12, backgroundColor: '#ffffff', borderBottomWidth: 1, borderBottomColor: '#e2e8f0' },
  backButton: { width: 34, height: 34, borderRadius: 8, backgroundColor: '#f1f5f9', alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: '#e2e8f0' },
  screenTitle: { fontSize: 17, fontWeight: '800', color: '#003460', letterSpacing: -0.3 },
  screenSub: { fontSize: 10, color: '#64748b', marginTop: 1 },
  headerBadge: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#e6f0fa', paddingVertical: 4, paddingHorizontal: 8, borderRadius: 12, gap: 4 },
  activeDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: '#004b87' },
  headerBadgeText: { fontSize: 9, fontWeight: '800', color: '#004b87', letterSpacing: 0.3 },
  scrollContent: { paddingHorizontal: 16, paddingTop: 12, paddingBottom: 32, gap: 12 },
  identityCard: { backgroundColor: '#ffffff', borderRadius: 16, padding: 16, borderWidth: 1, borderColor: '#e2e8f0', ...Platform.select({ ios: { shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.04, shadowRadius: 4 }, android: { elevation: 1 } }) },
  identityRow: { flexDirection: 'row', alignItems: 'center' },
  avatarCircle: { width: 52, height: 52, borderRadius: 26, backgroundColor: '#004b87', alignItems: 'center', justifyContent: 'center' },
  avatarInitial: { color: '#ffffff', fontSize: 22, fontWeight: '800' },
  facultyNameText: { fontSize: 15, fontWeight: '800', color: '#0f172a' },
  facultyRoleText: { fontSize: 11, color: '#64748b', marginTop: 1 },
  employeeIdText: { fontSize: 11, fontWeight: '700', color: '#004b87', marginTop: 2 },
  cardDivider: { height: 1, backgroundColor: '#f1f5f9', marginVertical: 12 },
  gatePassLauncherBtn: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#e6f0fa', paddingVertical: 9, paddingHorizontal: 12, borderRadius: 10, borderWidth: 1, borderColor: '#b8d6f0', gap: 8 },
  gatePassLauncherBtnText: { fontSize: 12, fontWeight: '700', color: '#004b87' },
  card: { backgroundColor: '#ffffff', borderRadius: 16, padding: 16, borderWidth: 1, borderColor: '#e2e8f0' },
  cardHeaderRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 12 },
  cardHeaderTitle: { fontSize: 10.5, fontWeight: '800', color: '#004b87', letterSpacing: 0.5 },
  loadingInner: { alignItems: 'center', paddingVertical: 16 },
  loadingInnerText: { fontSize: 11.5, color: '#64748b', marginTop: 6 },
  fieldGroup: { marginBottom: 10 },
  fieldLabel: { fontSize: 11, fontWeight: '700', color: '#475569', marginBottom: 5 },
  textInput: { backgroundColor: '#f8fafc', borderWidth: 1.2, borderColor: '#cbd5e1', borderRadius: 10, paddingHorizontal: 12, height: 42, fontSize: 13, color: '#0f172a' },
  passwordInputWrap: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#f8fafc', borderWidth: 1.2, borderColor: '#cbd5e1', borderRadius: 10, paddingHorizontal: 12, height: 42 },
  passwordInput: { flex: 1, fontSize: 13, color: '#0f172a' },
  eyeBtn: { padding: 4 },
  saveBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', backgroundColor: '#004b87', paddingVertical: 11, borderRadius: 10, marginTop: 6 },
  saveBtnText: { color: '#ffffff', fontSize: 12.5, fontWeight: '700' },
  btnDisabled: { opacity: 0.65 },
  infoRow: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 5, borderBottomWidth: 1, borderBottomColor: '#f8fafc' },
  infoLabel: { fontSize: 11, color: '#64748b' },
  infoValue: { fontSize: 11, fontWeight: '700', color: '#0f172a', textAlign: 'right', flex: 1, marginLeft: 10 },
  infoValueMono: { fontSize: 10.5, fontWeight: '700', color: '#004b87', fontFamily: Platform.OS === 'ios' ? 'Courier' : 'monospace', textAlign: 'right', flex: 1, marginLeft: 10 },
  logoutBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', paddingVertical: 4, gap: 6 },
  logoutBtnText: { fontSize: 13, fontWeight: '700', color: '#dc2626' },
  modalOverlay: { flex: 1, backgroundColor: 'rgba(15, 23, 42, 0.65)', justifyContent: 'center', alignItems: 'center', padding: 20 },
  qrSheet: { width: '100%', backgroundColor: '#ffffff', borderRadius: 20, padding: 20, alignItems: 'center' },
  qrSheetHeader: { width: '100%', flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 },
  qrSheetTitle: { fontSize: 15, fontWeight: '800', color: '#0f172a' },
  qrSheetSub: { fontSize: 11, color: '#64748b' },
  qrContainer: { padding: 16, backgroundColor: '#f8fafc', borderRadius: 14, borderWidth: 1, borderColor: '#e2e8f0' },
  qrMetaBox: { alignItems: 'center', marginTop: 14, backgroundColor: '#f1f5f9', paddingVertical: 6, paddingHorizontal: 16, borderRadius: 10 },
  qrMetaLabel: { fontSize: 8.5, fontWeight: '800', color: '#64748b' },
  qrMetaValue: { fontSize: 12, fontWeight: '800', color: '#004b87', marginTop: 1 },
  qrCloseBtn: { width: '100%', backgroundColor: '#004b87', paddingVertical: 10, borderRadius: 10, alignItems: 'center', marginTop: 16 },
  qrCloseBtnText: { color: '#ffffff', fontSize: 12.5, fontWeight: '700' },
});

export default ProfileSettingsScreen;