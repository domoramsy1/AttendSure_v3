/**
 * AttendSure Mobile - Account, Theme & Server Settings
 * File: mobile/src/screens/SettingsScreen.tsx
 */

import React, { useState, useEffect, useCallback, useRef, useMemo } from 'react';
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
import { Ionicons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import AsyncStorage from '@react-native-async-storage/async-storage';
import QRCode from 'react-native-qrcode-svg';
import { useAuth } from '../context/AuthContext';
import { useThemeMode } from '../context/ThemeContext';
import { apiClient } from '../api/client';
import { getServerBaseUrl } from '../services/configService';
import { ServerConfigModal } from '../components/ServerConfigModal';
import {
  isSafeUrl,
  cleanText,
  getFriendlyErrorMessage,
  type ThemeMode,
  type ThemePalette,
} from '../constants/theme';

const SETTINGS_PROFILE_CACHE_KEY = 'attendsure_cached_settings_profile';

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

const isCanceledError = (err: unknown): boolean => {
  const e = err as { code?: string; name?: string };
  return e?.code === 'ERR_CANCELED' || e?.name === 'CanceledError' || e?.name === 'AbortError';
};

const showNotice = (title: string, message: string): void => {
  if (Platform.OS === 'web' && typeof window !== 'undefined') {
    window.alert(`${title}: ${message}`);
  } else {
    Alert.alert(title, message);
  }
};

export const SettingsScreen: React.FC = () => {
  const { user, logout, updateUser } = useAuth();
  const { palette, fonts, mode, setThemeMode } = useThemeMode();
  const styles = useMemo(() => createStyles(palette, fonts), [palette, fonts]);

  const [profile, setProfile] = useState<ExtendedUserProfile | null>(
    user as ExtendedUserProfile | null
  );
  const [saving, setSaving] = useState<boolean>(false);
  const [serverBase, setServerBase] = useState<string>('');
  const [showServerModal, setShowServerModal] = useState<boolean>(false);
  const [photoError, setPhotoError] = useState<boolean>(false);

  // Editable fields
  const [firstName, setFirstName] = useState<string>(user?.first_name || '');
  const [lastName, setLastName] = useState<string>(user?.last_name || '');
  const [contactNumber, setContactNumber] = useState<string>(
    user?.contact_number || user?.phone || ''
  );
  const [email, setEmail] = useState<string>(user?.email || '');
  const [newPassword, setNewPassword] = useState<string>('');

  // Optional profile photo upload state (web browser file picker)
  const [newPhotoBase64, setNewPhotoBase64] = useState<string | null>(null);
  const [photoPreview, setPhotoPreview] = useState<string | null>(null);

  const isMountedRef = useRef<boolean>(true);
  const abortRef = useRef<AbortController | null>(null);

  const resolveSafePhotoUri = useCallback(
    (url?: string | null): string | undefined => {
      if (!url || typeof url !== 'string') return undefined;
      const trimmed = url.trim();
      if (!trimmed) return undefined;
      const candidate =
        trimmed.startsWith('http://') ||
        trimmed.startsWith('https://') ||
        trimmed.startsWith('data:')
          ? trimmed
          : serverBase
          ? `${serverBase.replace(/\/+$/, '')}/${trimmed.replace(/^\/+/, '')}`
          : '';
      return isSafeUrl(candidate) ? candidate : undefined;
    },
    [serverBase]
  );

  const fetchProfile = useCallback(async () => {
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    try {
      const [cached, base] = await Promise.all([
        AsyncStorage.getItem(SETTINGS_PROFILE_CACHE_KEY),
        getServerBaseUrl(),
      ]);
      if (isMountedRef.current && !controller.signal.aborted) {
        if (base) setServerBase(base);
        if (cached) {
          const parsed: ExtendedUserProfile = JSON.parse(cached);
          setProfile(parsed);
          setFirstName(parsed.first_name || '');
          setLastName(parsed.last_name || '');
          setContactNumber(parsed.contact_number || parsed.phone || '');
          setEmail(parsed.email || '');
        }
      }
    } catch {}

    try {
      const res = await apiClient.get<ExtendedUserProfile>('me/', {
        signal: controller.signal,
      });
      if (!isMountedRef.current || controller.signal.aborted) return;
      if (res.data) {
        setProfile(res.data);
        setFirstName(res.data.first_name || '');
        setLastName(res.data.last_name || '');
        setContactNumber(res.data.contact_number || res.data.phone || '');
        setEmail(res.data.email || '');
        AsyncStorage.setItem(SETTINGS_PROFILE_CACHE_KEY, JSON.stringify(res.data)).catch(() => {});
      }
    } catch (err: unknown) {
      if (isCanceledError(err)) return;
    }
  }, []);

  useEffect(() => {
    isMountedRef.current = true;
    void fetchProfile();
    return () => {
      isMountedRef.current = false;
      abortRef.current?.abort();
    };
  }, [fetchProfile]);

  // Safe cross-platform photo picker (uses native browser file input on web; avoids uninstalled native picker package)
  const handlePickPhoto = () => {
    if (Platform.OS === 'web' && typeof document !== 'undefined') {
      const input = document.createElement('input');
      input.type = 'file';
      input.accept = 'image/png,image/jpeg,image/webp';
      input.onchange = () => {
        const file = input.files?.[0];
        if (!file) return;
        if (file.size > 5 * 1024 * 1024) {
          showNotice('File Too Large', 'Please choose a photo smaller than 5 MB.');
          return;
        }
        const reader = new FileReader();
        reader.onload = () => {
          const result = typeof reader.result === 'string' ? reader.result : '';
          if (isMountedRef.current && isSafeUrl(result)) {
            setNewPhotoBase64(result);
            setPhotoPreview(result);
            setPhotoError(false);
          } else {
            showNotice('Unsupported File', 'Please select a PNG, JPG, or WebP image.');
          }
        };
        reader.readAsDataURL(file);
      };
      input.click();
      return;
    }

    showNotice(
      'Update Profile Photo',
      'To upload a new profile photo, sign in to the AttendSure web portal on a computer or contact your school administrator.'
    );
  };

  const handleSaveProfile = async () => {
    const cleanFirst = cleanText(firstName, 80);
    const cleanLast = cleanText(lastName, 80);
    const cleanEmail = cleanText(email, 120);
    const cleanPhone = cleanText(contactNumber, 20);
    const cleanPassword = newPassword.replace(/[\r\n\t]/g, '').trim();

    if (!cleanFirst || !cleanLast) {
      showNotice('Missing Name', 'First name and last name are required.');
      return;
    }

    if (cleanEmail && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(cleanEmail)) {
      showNotice('Invalid Email', 'Please enter a valid email address.');
      return;
    }

    if (cleanPassword && cleanPassword.length < 8) {
      showNotice('Password Too Short', 'Your new password must be at least 8 characters long.');
      return;
    }

    setSaving(true);
    try {
      const payload: Record<string, string> = {
        first_name: cleanFirst,
        last_name: cleanLast,
        contact_number: cleanPhone,
        email: cleanEmail,
      };

      if (cleanPassword) {
        payload.password = cleanPassword;
      }

      if (newPhotoBase64 && isSafeUrl(newPhotoBase64)) {
        payload.photo = newPhotoBase64;
      }

      const res = await apiClient.put<ExtendedUserProfile>('me/', payload);
      if (!isMountedRef.current) return;

      if (res.data) {
        setProfile(res.data);
        AsyncStorage.setItem(SETTINGS_PROFILE_CACHE_KEY, JSON.stringify(res.data)).catch(() => {});
        await updateUser(res.data as Partial<NonNullable<typeof user>>);
      }

      setNewPassword('');
      setNewPhotoBase64(null);
      showNotice('Saved', 'Your account details have been updated.');
    } catch (err: unknown) {
      if (!isMountedRef.current) return;
      showNotice(
        'Update Failed',
        getFriendlyErrorMessage(err, 'Could not save your account changes. Please try again.')
      );
    } finally {
      if (isMountedRef.current) setSaving(false);
    }
  };

  const handleSignOut = () => {
    if (Platform.OS === 'web' && typeof window !== 'undefined') {
      if (window.confirm('Sign out of AttendSure on this device?')) {
        void logout();
      }
      return;
    }
    Alert.alert('Sign Out', 'Sign out of AttendSure on this device?', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Sign Out', style: 'destructive', onPress: () => void logout() },
    ]);
  };

  const qrPayload = JSON.stringify({
    app: 'ATTENDSURE_FACULTY_PASS',
    id: cleanText(String(profile?.employee_id || profile?.username || 'FACULTY'), 40),
    name: cleanText(profile?.full_name || `${firstName} ${lastName}`.trim(), 120),
    role: cleanText(profile?.role || 'FACULTY', 30),
  });

  const displayPhoto =
    (photoPreview && isSafeUrl(photoPreview) ? photoPreview : undefined) ||
    resolveSafePhotoUri(profile?.photo_url || profile?.photo);

  useEffect(() => {
    setPhotoError(false);
  }, [displayPhoto]);

  const themeOptions: Array<{
    key: ThemeMode;
    label: string;
    icon: keyof typeof Ionicons.glyphMap;
  }> = [
    { key: 'light', label: 'Light', icon: 'sunny-outline' },
    { key: 'dark', label: 'Dark', icon: 'moon-outline' },
    { key: 'high-contrast', label: 'Daylight', icon: 'contrast-outline' },
  ];

  return (
    <View style={styles.container}>
      <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
        {/* Profile Header & Photo */}
        <View style={styles.profileHeaderCard}>
          <View style={styles.avatarWrapper}>
            <View style={styles.avatarCircle}>
              {displayPhoto && !photoError ? (
                <Image
                  source={{ uri: displayPhoto }}
                  style={styles.avatarImg}
                  contentFit="cover"
                  onError={() => setPhotoError(true)}
                />
              ) : (
                <Ionicons name="person" size={40} color={palette.primary} />
              )}
            </View>

            <TouchableOpacity
              style={styles.cameraBadgeBtn}
              onPress={handlePickPhoto}
              accessibilityLabel="Change profile photo"
            >
              <Ionicons name="camera" size={14} color={palette.onPrimary} />
            </TouchableOpacity>
          </View>

          <Text style={styles.profileName}>
            {profile?.full_name || `${firstName} ${lastName}`.trim() || 'Faculty Account'}
          </Text>
          <Text style={styles.profileRole}>{profile?.position || profile?.role || 'Faculty'}</Text>
          {profile?.department ? (
            <Text style={styles.profileDept}>{profile.department}</Text>
          ) : null}

          <View style={styles.badgeRow}>
            <View style={styles.idChip}>
              <Ionicons name="id-card-outline" size={12} color={palette.primary} />
              <Text style={styles.idChipText}>
                ID: {profile?.employee_id || profile?.username || '—'}
              </Text>
            </View>
            <View style={[styles.idChip, { backgroundColor: palette.successLight }]}>
              <Ionicons name="shield-checkmark-outline" size={12} color={palette.success} />
              <Text style={[styles.idChipText, { color: palette.success }]}>Verified Account</Text>
            </View>
          </View>
        </View>

        {/* Color Mode Switcher */}
        <View style={styles.card}>
          <Text style={styles.cardTitle}>Display &amp; Color Mode</Text>
          <Text style={styles.cardSubtitle}>
            Choose a theme that is comfortable indoors or in bright daylight.
          </Text>
          <View style={styles.themeRow}>
            {themeOptions.map((opt) => {
              const active = mode === opt.key;
              return (
                <TouchableOpacity
                  key={opt.key}
                  style={[styles.themeBtn, active && styles.themeBtnActive]}
                  onPress={() => setThemeMode(opt.key)}
                  activeOpacity={0.8}
                >
                  <Ionicons
                    name={opt.icon}
                    size={15}
                    color={active ? palette.onPrimary : palette.textSecondary}
                  />
                  <Text style={[styles.themeBtnText, active && styles.themeBtnTextActive]}>
                    {opt.label}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </View>
        </View>

        {/* School Server Connection */}
        <View style={styles.card}>
          <Text style={styles.cardTitle}>School Server Address</Text>
          <Text style={styles.cardSubtitle}>
            {serverBase || 'Connected automatically to your school server'}
          </Text>
          <TouchableOpacity
            style={styles.secondaryBtn}
            onPress={() => setShowServerModal(true)}
            activeOpacity={0.8}
          >
            <Ionicons name="server-outline" size={16} color={palette.textPrimary} />
            <Text style={styles.secondaryBtnText}>Change Server Address</Text>
          </TouchableOpacity>
        </View>

        {/* Digital Faculty ID Pass */}
        <View style={styles.card}>
          <Text style={styles.cardTitle}>Digital Faculty ID Pass</Text>
          <Text style={styles.cardSubtitle}>
            Faculty check-ins use on-device facial recognition and campus GPS inside this app.
          </Text>
          <View style={styles.qrContainer}>
            <View style={styles.qrQuietZone}>
              <QRCode value={qrPayload} size={140} color="#003460" backgroundColor="#ffffff" />
            </View>
          </View>
        </View>

        {/* Personal Information Form */}
        <View style={styles.card}>
          <Text style={styles.cardTitle}>Personal Information</Text>
          <Text style={styles.cardSubtitle}>
            Update your name, mobile number, email address, and password.
          </Text>

          <Text style={styles.inputLabel}>First Name</Text>
          <TextInput
            style={styles.input}
            value={firstName}
            onChangeText={setFirstName}
            placeholder="Enter first name"
            placeholderTextColor={palette.textMuted}
            maxLength={80}
          />

          <Text style={styles.inputLabel}>Last Name</Text>
          <TextInput
            style={styles.input}
            value={lastName}
            onChangeText={setLastName}
            placeholder="Enter last name"
            placeholderTextColor={palette.textMuted}
            maxLength={80}
          />

          <Text style={styles.inputLabel}>Email Address</Text>
          <TextInput
            style={styles.input}
            value={email}
            onChangeText={setEmail}
            keyboardType="email-address"
            autoCapitalize="none"
            autoCorrect={false}
            placeholder="Enter email address"
            placeholderTextColor={palette.textMuted}
            maxLength={120}
          />

          <Text style={styles.inputLabel}>Mobile Phone Number</Text>
          <TextInput
            style={styles.input}
            value={contactNumber}
            onChangeText={setContactNumber}
            keyboardType="phone-pad"
            placeholder="09XXXXXXXXX"
            placeholderTextColor={palette.textMuted}
            maxLength={20}
          />

          <Text style={styles.inputLabel}>New Password (leave blank to keep current)</Text>
          <TextInput
            style={styles.input}
            value={newPassword}
            onChangeText={setNewPassword}
            secureTextEntry
            placeholder="Minimum 8 characters"
            placeholderTextColor={palette.textMuted}
            maxLength={128}
          />

          <TouchableOpacity
            style={[styles.saveBtn, saving && { opacity: 0.65 }]}
            onPress={() => void handleSaveProfile()}
            disabled={saving}
            activeOpacity={0.85}
          >
            {saving ? (
              <ActivityIndicator size="small" color={palette.onPrimary} />
            ) : (
              <Text style={styles.saveBtnText}>Save Changes</Text>
            )}
          </TouchableOpacity>
        </View>

        {/* Sign Out Button */}
        <TouchableOpacity style={styles.logoutBtn} onPress={handleSignOut} activeOpacity={0.85}>
          <Ionicons name="log-out-outline" size={18} color={palette.onPrimary} />
          <Text style={styles.logoutBtnText}>Sign Out</Text>
        </TouchableOpacity>
      </ScrollView>

      <ServerConfigModal
        visible={showServerModal}
        onClose={() => {
          setShowServerModal(false);
          getServerBaseUrl()
            .then((url) => {
              if (isMountedRef.current) setServerBase(url);
            })
            .catch(() => {});
        }}
      />
    </View>
  );
};

const createStyles = (palette: ThemePalette, fonts: ReturnType<typeof useThemeMode>['fonts']) =>
  StyleSheet.create({
    container: { flex: 1, backgroundColor: palette.background },
    scrollContent: { padding: 16, paddingBottom: 120, gap: 14 },
    profileHeaderCard: {
      backgroundColor: palette.surface,
      borderRadius: 16,
      padding: 18,
      alignItems: 'center',
      borderWidth: 1,
      borderColor: palette.border,
    },
    avatarWrapper: {
      position: 'relative',
      marginBottom: 10,
    },
    avatarCircle: {
      width: 80,
      height: 80,
      borderRadius: 40,
      backgroundColor: palette.primarySoft,
      alignItems: 'center',
      justifyContent: 'center',
      overflow: 'hidden',
      borderWidth: 2,
      borderColor: palette.primary,
    },
    avatarImg: { width: '100%', height: '100%' },
    cameraBadgeBtn: {
      position: 'absolute',
      bottom: 0,
      right: 0,
      width: 28,
      height: 28,
      borderRadius: 14,
      backgroundColor: palette.buttonBg,
      alignItems: 'center',
      justifyContent: 'center',
      borderWidth: 2,
      borderColor: palette.surface,
    },
    profileName: {
      fontSize: fonts.lg,
      fontWeight: fonts.weight.extrabold,
      color: palette.textPrimary,
      textAlign: 'center',
    },
    profileRole: {
      fontSize: fonts.sm,
      fontWeight: fonts.weight.bold,
      color: palette.primary,
      marginTop: 2,
    },
    profileDept: { fontSize: fonts.xs, color: palette.textSecondary, marginTop: 1 },
    badgeRow: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'center', gap: 6, marginTop: 10 },
    idChip: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 4,
      backgroundColor: palette.surfaceSubtle,
      paddingVertical: 4,
      paddingHorizontal: 8,
      borderRadius: 6,
      borderWidth: 1,
      borderColor: palette.border,
    },
    idChipText: { fontSize: fonts.xs, fontWeight: fonts.weight.bold, color: palette.textPrimary },
    card: {
      backgroundColor: palette.surface,
      borderRadius: 14,
      padding: 16,
      borderWidth: 1,
      borderColor: palette.border,
    },
    cardTitle: {
      fontSize: fonts.md,
      fontWeight: fonts.weight.extrabold,
      color: palette.textPrimary,
      marginBottom: 2,
    },
    cardSubtitle: { fontSize: fonts.xs, color: palette.textSecondary, marginBottom: 12 },
    themeRow: { flexDirection: 'row', gap: 8 },
    themeBtn: {
      flex: 1,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 5,
      height: 40,
      borderRadius: 10,
      backgroundColor: palette.surfaceSubtle,
      borderWidth: 1,
      borderColor: palette.border,
    },
    themeBtnActive: {
      backgroundColor: palette.buttonBg,
      borderColor: palette.buttonBg,
    },
    themeBtnText: { fontSize: fonts.xs, fontWeight: fonts.weight.extrabold, color: palette.textSecondary },
    themeBtnTextActive: { color: palette.onPrimary },
    secondaryBtn: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 6,
      height: 42,
      borderRadius: 10,
      backgroundColor: palette.surfaceSubtle,
      borderWidth: 1,
      borderColor: palette.borderStrong,
    },
    secondaryBtnText: { fontSize: fonts.sm, fontWeight: fonts.weight.bold, color: palette.textPrimary },
    qrContainer: { alignItems: 'center', paddingVertical: 8 },
    qrQuietZone: {
      backgroundColor: '#ffffff',
      padding: 12,
      borderRadius: 12,
      borderWidth: 1,
      borderColor: palette.border,
    },
    inputLabel: {
      fontSize: fonts.xs,
      fontWeight: fonts.weight.bold,
      color: palette.textSecondary,
      marginBottom: 4,
      marginTop: 8,
    },
    input: {
      backgroundColor: palette.surfaceSubtle,
      borderWidth: 1,
      borderColor: palette.borderStrong,
      borderRadius: 10,
      paddingHorizontal: 12,
      height: 44,
      fontSize: fonts.sm,
      color: palette.textPrimary,
    },
    saveBtn: {
      backgroundColor: palette.buttonBg,
      borderRadius: 10,
      height: 46,
      alignItems: 'center',
      justifyContent: 'center',
      marginTop: 14,
    },
    saveBtnText: { color: palette.onPrimary, fontSize: fonts.sm, fontWeight: fonts.weight.extrabold },
    logoutBtn: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 6,
      backgroundColor: palette.dangerBg,
      borderRadius: 12,
      paddingVertical: 13,
      marginTop: 4,
    },
    logoutBtnText: { color: palette.onPrimary, fontSize: fonts.sm, fontWeight: fonts.weight.extrabold },
  });

export default SettingsScreen;
