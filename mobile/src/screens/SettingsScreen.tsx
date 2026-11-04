/**
 * AttendSure - User Profile & Application Settings Screen
 * File: mobile/src/screens/SettingsScreen.tsx
 */

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
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import QRCode from 'react-native-qrcode-svg';
import * as ImagePicker from 'expo-image-picker';
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
}

export const SettingsScreen: React.FC = () => {
  const { user, logout, updateUser } = useAuth();

  const [profile, setProfile] = useState<ExtendedUserProfile | null>(user as ExtendedUserProfile | null);
  const [saving, setSaving] = useState<boolean>(false);
  const [serverBase, setServerBase] = useState<string>('');

  // Editable user fields
  const [firstName, setFirstName] = useState<string>(user?.first_name || '');
  const [lastName, setLastName] = useState<string>(user?.last_name || '');
  const [contactNumber, setContactNumber] = useState<string>(user?.contact_number || '');
  const [email, setEmail] = useState<string>(user?.email || '');
  const [newPassword, setNewPassword] = useState<string>('');

  // Profile photo state
  const [newPhotoBase64, setNewPhotoBase64] = useState<string | null>(null);
  const [photoPreview, setPhotoPreview] = useState<string | null>(null);

  const resolvePhotoUri = useCallback(
    (url?: string | null): string | undefined => {
      if (!url) return undefined;
      if (url.startsWith('http://') || url.startsWith('https://') || url.startsWith('data:image/')) {
        return url;
      }
      return `${serverBase.replace(/\/+$/, '')}/${url.replace(/^\/+/, '')}`;
    },
    [serverBase]
  );

  // Automatically fetch profile information in the background
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
      // Keep session state intact
    }
  }, []);

  useEffect(() => {
    getServerBaseUrl().then((url) => setServerBase(url));
    fetchProfile();
  }, [fetchProfile]);

  // Pick new profile picture with size validation
  const handlePickPhoto = async () => {
    try {
      const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (status !== 'granted') {
        Alert.alert('Permission Needed', 'Please allow photo library access in phone settings.');
        return;
      }

      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ['images'],
        allowsEditing: true,
        aspect: [1, 1],
        quality: 0.6,
        base64: true,
      });

      if (!result.canceled && result.assets && result.assets[0]) {
        const asset = result.assets[0];

        // Cybersecurity check: file size limit 5 MB
        if (asset.fileSize && asset.fileSize > 5 * 1024 * 1024) {
          Alert.alert('File Too Large', 'Please select a photo smaller than 5 MB.');
          return;
        }

        if (asset.base64) {
          setNewPhotoBase64(`data:image/jpeg;base64,${asset.base64}`);
          setPhotoPreview(asset.uri);
        } else {
          setPhotoPreview(asset.uri);
        }
      }
    } catch {
      Alert.alert('Photo Error', 'Unable to open photo picker.');
    }
  };

  // Save personal updates to the database
  const handleSaveProfile = async () => {
    if (!firstName.trim() || !lastName.trim()) {
      Alert.alert('Missing Name', 'First name and last name are required.');
      return;
    }

    if (newPassword.trim() && newPassword.trim().length < 8) {
      Alert.alert('Weak Password', 'Password must be at least 8 characters long.');
      return;
    }

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

      if (newPhotoBase64) {
        payload.photo = newPhotoBase64;
      }

      const res = await apiClient.put('me/', payload);
      if (res.data) {
        setProfile(res.data);
        updateUser(res.data);
      }

      setNewPassword('');
      setNewPhotoBase64(null);
      Alert.alert('Success', 'Your personal information has been saved.');
    } catch (err: any) {
      const msg = err?.response?.data?.error || err?.response?.data?.detail || 'Failed to update personal details.';
      Alert.alert('Update Failed', msg);
    } finally {
      setSaving(false);
    }
  };

  const qrPayload = JSON.stringify({
    app: 'ATTENDSURE_PASS',
    id: profile?.employee_id || profile?.username || 'USER',
    name: profile?.full_name || `${firstName} ${lastName}`.trim(),
    role: profile?.role || 'FACULTY',
  });

  const displayPhoto = photoPreview || resolvePhotoUri(profile?.photo_url || profile?.photo);

  return (
    <SafeAreaView style={styles.container} edges={['left', 'right']}>
      <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
        {/* Profile Header & Photo Manager */}
        <View style={styles.profileHeaderCard}>
          <View style={styles.avatarWrapper}>
            <View style={styles.avatarCircle}>
              {displayPhoto ? (
                <Image source={{ uri: displayPhoto }} style={styles.avatarImg} contentFit="cover" />
              ) : (
                <Ionicons name="person" size={40} color="#004b87" />
              )}
            </View>

            <TouchableOpacity
              style={styles.cameraBadgeBtn}
              onPress={handlePickPhoto}
              accessibilityLabel="Change Photo"
            >
              <Ionicons name="camera" size={15} color="#ffffff" />
            </TouchableOpacity>
          </View>

          <Text style={styles.profileName}>
            {profile?.full_name || `${firstName} ${lastName}`.trim() || 'User Account'}
          </Text>
          <Text style={styles.profileRole}>{profile?.position || profile?.role || 'Staff Member'}</Text>
          <Text style={styles.profileDept}>{profile?.department || 'Academic Department'}</Text>

          <View style={styles.badgeRow}>
            <View style={styles.idChip}>
              <Ionicons name="id-card-outline" size={12} color="#004b87" />
              <Text style={styles.idChipText}>ID: {profile?.employee_id || profile?.username || '—'}</Text>
            </View>
            <View style={styles.idChip}>
              <Ionicons name="shield-checkmark-outline" size={12} color="#059669" />
              <Text style={[styles.idChipText, { color: '#059669' }]}>Verified Account</Text>
            </View>
          </View>
        </View>

        {/* Digital School Clearance Pass */}
        <View style={styles.card}>
          <Text style={styles.cardTitle}>Digital Gate Pass</Text>
          <Text style={styles.cardSubtitle}>Scan this QR code at campus gate kiosks for check-in and check-out.</Text>
          <View style={styles.qrContainer}>
            <QRCode value={qrPayload} size={140} color="#004b87" backgroundColor="#ffffff" />
          </View>
        </View>

        {/* User Information Form */}
        <View style={styles.card}>
          <Text style={styles.cardTitle}>Personal Information</Text>
          <Text style={styles.cardSubtitle}>Manage your name, contact phone, email, and password.</Text>

          <Text style={styles.inputLabel}>First Name</Text>
          <TextInput
            style={styles.input}
            value={firstName}
            onChangeText={setFirstName}
            placeholder="Enter first name"
            placeholderTextColor="#94a3b8"
          />

          <Text style={styles.inputLabel}>Last Name</Text>
          <TextInput
            style={styles.input}
            value={lastName}
            onChangeText={setLastName}
            placeholder="Enter last name"
            placeholderTextColor="#94a3b8"
          />

          <Text style={styles.inputLabel}>Email Address</Text>
          <TextInput
            style={styles.input}
            value={email}
            onChangeText={setEmail}
            keyboardType="email-address"
            autoCapitalize="none"
            placeholder="name@school.edu"
            placeholderTextColor="#94a3b8"
          />

          <Text style={styles.inputLabel}>Mobile Phone Number</Text>
          <TextInput
            style={styles.input}
            value={contactNumber}
            onChangeText={setContactNumber}
            keyboardType="phone-pad"
            placeholder="09XXXXXXXXX"
            placeholderTextColor="#94a3b8"
          />

          <Text style={styles.inputLabel}>New Password (leave blank to keep current)</Text>
          <TextInput
            style={styles.input}
            value={newPassword}
            onChangeText={setNewPassword}
            secureTextEntry
            placeholder="Minimum 8 characters"
            placeholderTextColor="#94a3b8"
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
              <Text style={styles.saveBtnText}>Save Changes</Text>
            )}
          </TouchableOpacity>
        </View>

        {/* Sign Out Button */}
        <TouchableOpacity style={styles.logoutBtn} onPress={logout} activeOpacity={0.8}>
          <Ionicons name="log-out-outline" size={18} color="#dc2626" />
          <Text style={styles.logoutBtnText}>Sign Out</Text>
        </TouchableOpacity>
      </ScrollView>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f8fafc' },
  scrollContent: { padding: 16, paddingBottom: 100, gap: 14 },
  profileHeaderCard: {
    backgroundColor: '#ffffff',
    borderRadius: 16,
    padding: 18,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#e2e8f0',
  },
  avatarWrapper: {
    position: 'relative',
    marginBottom: 10,
  },
  avatarCircle: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: '#e6f0fa',
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
    borderWidth: 2,
    borderColor: '#b8d6f0',
  },
  avatarImg: { width: '100%', height: '100%' },
  cameraBadgeBtn: {
    position: 'absolute',
    bottom: 0,
    right: 0,
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: '#004b87',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: '#ffffff',
  },
  profileName: { fontSize: 17, fontWeight: '800', color: '#0f172a', textAlign: 'center' },
  profileRole: { fontSize: 12.5, fontWeight: '700', color: '#004b87', marginTop: 2 },
  profileDept: { fontSize: 11.5, color: '#64748b', marginTop: 1 },
  badgeRow: { flexDirection: 'row', gap: 6, marginTop: 10 },
  idChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: '#f1f5f9',
    paddingVertical: 4,
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
});

export default SettingsScreen;