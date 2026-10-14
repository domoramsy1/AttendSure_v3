// mobile/src/screens/LoginScreen.tsx

import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TextInput,
  TouchableOpacity,
  ActivityIndicator,
  Alert,
  Modal,
  ScrollView,
  KeyboardAvoidingView,
  Platform,
  StatusBar,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useAuth } from '../context/AuthContext';
import { apiClient } from '../api/client';
import { getServerBaseUrl, setServerBaseUrl } from '../services/configService';
import { COLORS } from '../constants/theme';

const fallbackLogo = require('../../assets/logo.svg');
const DEVICE_UUID_STORAGE_KEY = 'attendsure_hardware_device_uuid';

interface PublicSchoolProfile {
  school_id?: string;
  school_name?: string;
  division?: string;
  region?: string;
  school_logo?: string | null;
  left_logo?: string | null;
}

const showAlert = (title: string, message: string) => {
  if (Platform.OS === 'web' && typeof window !== 'undefined') {
    window.alert(`${title}: ${message}`);
  } else {
    Alert.alert(title, message);
  }
};

/**
 * Generates or retrieves a persistent hardware UUID for zero-trust device binding.
 */
export const getOrCreateDeviceUuid = async (): Promise<string> => {
  const existing = await AsyncStorage.getItem(DEVICE_UUID_STORAGE_KEY);
  if (existing) return existing;

  const randomHex = () => Math.floor((1 + Math.random()) * 0x10000).toString(16).substring(1).toUpperCase();
  const generated = `DEV-${Platform.OS.toUpperCase()}-${randomHex()}${randomHex()}-${randomHex()}`;
  await AsyncStorage.setItem(DEVICE_UUID_STORAGE_KEY, generated);
  return generated;
};

export const LoginScreen: React.FC = () => {
  const { login } = useAuth();

  const [username, setUsername] = useState<string>('');
  const [password, setPassword] = useState<string>('');
  const [showPassword, setShowPassword] = useState<boolean>(false);
  const [submitting, setSubmitting] = useState<boolean>(false);

  const [schoolInfo, setSchoolInfo] = useState<PublicSchoolProfile | null>(null);
  const [serverReachable, setServerReachable] = useState<boolean | null>(null);
  const [deviceUuid, setDeviceUuid] = useState<string>('');
  const [devicePlatform] = useState<string>(
    `${Platform.OS.toUpperCase()} (${Platform.Version || 'OS'})`
  );

  // Server Configuration Modal State
  const [configModalVisible, setConfigModalVisible] = useState<boolean>(false);
  const [serverUrlInput, setServerUrlInput] = useState<string>('');
  const [testingConnection, setTestingConnection] = useState<boolean>(false);

  const checkServerAndLoadSchool = useCallback(async () => {
    try {
      const storedUrl = await getServerBaseUrl();
      setServerUrlInput(storedUrl);

      const res = await apiClient.get('/api/settings/school/');
      if (res.data) {
        setSchoolInfo(res.data);
        setServerReachable(true);
      }
    } catch {
      setServerReachable(false);
    }
  }, []);

  useEffect(() => {
    getOrCreateDeviceUuid().then(setDeviceUuid);
    checkServerAndLoadSchool();
  }, [checkServerAndLoadSchool]);

  const handleLogin = async () => {
    if (!username.trim() || !password.trim()) {
      showAlert('Missing Credentials', 'Please enter your username and password.');
      return;
    }

    setSubmitting(true);
    try {
      await login(username, password);
    } catch (err: any) {
      const serverError =
        err?.response?.data?.error ||
        err?.response?.data?.detail ||
        (err?.code === 'ERR_NETWORK' || err?.message?.includes('Network Error')
          ? 'Cannot connect to backend server. Tap the gear icon to verify your Server URL.'
          : err?.message || 'Authentication failed.');
      showAlert('Login Failed', serverError);
    } finally {
      setSubmitting(false);
    }
  };

  const handleSaveServerConfig = async () => {
    const clean = serverUrlInput.trim();
    if (!clean.startsWith('http://') && !clean.startsWith('https://')) {
      showAlert('Invalid URL', 'Server URL must start with http:// or https://');
      return;
    }

    setTestingConnection(true);
    try {
      await setServerBaseUrl(clean);
      const res = await apiClient.get('/api/settings/school/');
      setSchoolInfo(res.data || null);
      setServerReachable(true);
      setConfigModalVisible(false);
      showAlert('Connected', 'Successfully connected to the AttendSure backend server.');
    } catch {
      setServerReachable(false);
      setConfigModalVisible(false);
      showAlert(
        'Saved (Offline)',
        `Server URL saved as:\n${clean}\n\nHowever, the server did not respond. Make sure Django is running on 0.0.0.0:8000.`
      );
    } finally {
      setTestingConnection(false);
    }
  };

  const logoSource =
    schoolInfo?.school_logo || schoolInfo?.left_logo
      ? { uri: (schoolInfo.school_logo || schoolInfo.left_logo) as string }
      : fallbackLogo;

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar barStyle="dark-content" backgroundColor="#f8fafc" />

      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <ScrollView
          contentContainerStyle={styles.scrollContent}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          {/* Top Bar with Server Status & Gear Button */}
          <View style={styles.topUtilityBar}>
            <View
              style={[
                styles.connectionPill,
                serverReachable === true
                  ? styles.pillOnline
                  : serverReachable === false
                  ? styles.pillOffline
                  : styles.pillChecking,
              ]}
            >
              <View
                style={[
                  styles.statusDot,
                  {
                    backgroundColor:
                      serverReachable === true
                        ? '#16a34a'
                        : serverReachable === false
                        ? '#dc2626'
                        : '#d97706',
                  },
                ]}
              />
              <Text
                style={[
                  styles.connectionPillText,
                  {
                    color:
                      serverReachable === true
                        ? '#15803d'
                        : serverReachable === false
                        ? '#b91c1c'
                        : '#b45309',
                  },
                ]}
              >
                {serverReachable === true
                  ? 'DATABASE ONLINE'
                  : serverReachable === false
                  ? 'SERVER UNREACHABLE'
                  : 'CHECKING SERVER...'}
              </Text>
            </View>

            <TouchableOpacity
              style={styles.configIconBtn}
              onPress={() => setConfigModalVisible(true)}
              activeOpacity={0.7}
            >
              <Ionicons name="settings-outline" size={20} color="#004b87" />
            </TouchableOpacity>
          </View>

          {/* Institutional Branding Header */}
          <View style={styles.brandSection}>
            <Image source={logoSource} style={styles.logoImage} contentFit="contain" />
            <Text style={styles.schoolNameText}>
              {schoolInfo?.school_name || 'AttendSure Campus Portal'}
            </Text>
            {schoolInfo?.division || schoolInfo?.school_id ? (
              <Text style={styles.schoolSubText}>
                {[
                  schoolInfo?.school_id ? `School ID: ${schoolInfo.school_id}` : '',
                  schoolInfo?.division || '',
                ]
                  .filter(Boolean)
                  .join(' • ')}
              </Text>
            ) : (
              <Text style={styles.schoolSubText}>
                IoT Gate & Classroom Attendance Management System
              </Text>
            )}
          </View>

          {/* Login Form Card */}
          <View style={styles.loginCard}>
            <Text style={styles.cardHeaderTitle}>FACULTY & ADMIN SIGN IN</Text>

            <View style={styles.fieldGroup}>
              <Text style={styles.fieldLabel}>Username / Employee ID</Text>
              <View style={styles.inputBox}>
                <Ionicons name="person-outline" size={18} color="#64748b" style={{ marginRight: 10 }} />
                <TextInput
                  style={styles.textInput}
                  placeholder="Enter your registered username"
                  placeholderTextColor="#94a3b8"
                  value={username}
                  onChangeText={setUsername}
                  autoCapitalize="none"
                  autoCorrect={false}
                />
              </View>
            </View>

            <View style={styles.fieldGroup}>
              <Text style={styles.fieldLabel}>Password</Text>
              <View style={styles.inputBox}>
                <Ionicons
                  name="lock-closed-outline"
                  size={18}
                  color="#64748b"
                  style={{ marginRight: 10 }}
                />
                <TextInput
                  style={styles.textInput}
                  placeholder="Enter your password"
                  placeholderTextColor="#94a3b8"
                  value={password}
                  onChangeText={setPassword}
                  secureTextEntry={!showPassword}
                  autoCapitalize="none"
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
              style={[styles.loginBtn, submitting && { opacity: 0.65 }]}
              onPress={handleLogin}
              disabled={submitting}
              activeOpacity={0.85}
            >
              {submitting ? (
                <ActivityIndicator size="small" color="#ffffff" />
              ) : (
                <>
                  <Ionicons name="shield-checkmark-outline" size={18} color="#ffffff" />
                  <Text style={styles.loginBtnText}>Verify & Authorize Account</Text>
                </>
              )}
            </TouchableOpacity>
          </View>

          {/* Hardware Identity Card for Telemetry Binding */}
          <View style={styles.hardwareCard}>
            <View style={styles.hardwareHeader}>
              <Ionicons name="hardware-chip-outline" size={15} color="#004b87" />
              <Text style={styles.hardwareTitle}>REGISTERED HARDWARE IDENTITY</Text>
            </View>
            <View style={styles.hardwareRow}>
              <Text style={styles.hardwareKey}>Runtime Platform:</Text>
              <Text style={styles.hardwareVal}>{devicePlatform}</Text>
            </View>
            <View style={styles.hardwareRow}>
              <Text style={styles.hardwareKey}>Hardware UUID:</Text>
              <Text style={styles.hardwareVal}>{deviceUuid || 'Initializing...'}</Text>
            </View>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>

      {/* Server Endpoint Configuration Modal */}
      <Modal
        visible={configModalVisible}
        transparent
        animationType="fade"
        onRequestClose={() => setConfigModalVisible(false)}
      >
        <View style={styles.modalBackdrop}>
          <View style={styles.modalContainer}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Backend Server Endpoint</Text>
              <TouchableOpacity onPress={() => setConfigModalVisible(false)}>
                <Ionicons name="close" size={22} color="#64748b" />
              </TouchableOpacity>
            </View>

            <Text style={styles.modalSubText}>
              Enter the active IP address or domain name of your AttendSure Django server:
            </Text>

            <TextInput
              style={styles.modalInput}
              value={serverUrlInput}
              onChangeText={setServerUrlInput}
              placeholder="http://172.20.141.220:8000/api"
              placeholderTextColor="#94a3b8"
              autoCapitalize="none"
              autoCorrect={false}
            />

            {/* Quick Preset Pills */}
            <View style={styles.presetRow}>
              <TouchableOpacity
                style={styles.presetChip}
                onPress={() => setServerUrlInput('http://172.20.141.220:8000/api')}
              >
                <Text style={styles.presetChipText}>Laptop Wi-Fi IP</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.presetChip}
                onPress={() => setServerUrlInput('http://lapasan.attendsure.com.ph:8000/api')}
              >
                <Text style={styles.presetChipText}>School Domain</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.presetChip}
                onPress={() => setServerUrlInput('http://localhost:8000/api')}
              >
                <Text style={styles.presetChipText}>Localhost / USB</Text>
              </TouchableOpacity>
            </View>

            <TouchableOpacity
              style={[styles.saveServerBtn, testingConnection && { opacity: 0.65 }]}
              onPress={handleSaveServerConfig}
              disabled={testingConnection}
            >
              {testingConnection ? (
                <ActivityIndicator size="small" color="#ffffff" />
              ) : (
                <Text style={styles.saveServerBtnText}>Save & Test Connection</Text>
              )}
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f8fafc' },
  scrollContent: { flexGrow: 1, paddingHorizontal: 20, paddingVertical: 16, justifyContent: 'center' },
  topUtilityBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 20,
  },
  connectionPill: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 5,
    paddingHorizontal: 10,
    borderRadius: 12,
    borderWidth: 1,
    gap: 6,
  },
  pillOnline: { backgroundColor: '#dcfce7', borderColor: '#bbf7d0' },
  pillOffline: { backgroundColor: '#fef2f2', borderColor: '#fecaca' },
  pillChecking: { backgroundColor: '#fffbeb', borderColor: '#fde68a' },
  statusDot: { width: 7, height: 7, borderRadius: 3.5 },
  connectionPillText: { fontSize: 9.5, fontWeight: '800', letterSpacing: 0.4 },
  configIconBtn: {
    width: 38,
    height: 38,
    borderRadius: 10,
    backgroundColor: '#e6f0fa',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: '#b8d6f0',
  },
  brandSection: { alignItems: 'center', marginBottom: 24 },
  logoImage: { width: 68, height: 68, borderRadius: 14, marginBottom: 12 },
  schoolNameText: {
    fontSize: 19,
    fontWeight: '900',
    color: '#003460',
    textAlign: 'center',
    letterSpacing: -0.3,
  },
  schoolSubText: { fontSize: 11.5, color: '#64748b', textAlign: 'center', marginTop: 4 },
  loginCard: {
    backgroundColor: '#ffffff',
    borderRadius: 18,
    padding: 20,
    borderWidth: 1,
    borderColor: '#e2e8f0',
    marginBottom: 16,
  },
  cardHeaderTitle: {
    fontSize: 11,
    fontWeight: '800',
    color: '#004b87',
    letterSpacing: 0.5,
    marginBottom: 14,
  },
  fieldGroup: { marginBottom: 14 },
  fieldLabel: { fontSize: 11.5, fontWeight: '700', color: '#334155', marginBottom: 6 },
  inputBox: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#f8fafc',
    borderWidth: 1.2,
    borderColor: '#cbd5e1',
    borderRadius: 12,
    paddingHorizontal: 12,
    height: 46,
  },
  textInput: { flex: 1, fontSize: 13.5, color: '#0f172a' },
  loginBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#004b87',
    height: 48,
    borderRadius: 12,
    marginTop: 6,
    gap: 8,
  },
  loginBtnText: { color: '#ffffff', fontSize: 13.5, fontWeight: '800' },
  hardwareCard: {
    backgroundColor: '#f1f5f9',
    borderRadius: 14,
    padding: 14,
    borderWidth: 1,
    borderColor: '#e2e8f0',
  },
  hardwareHeader: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 8 },
  hardwareTitle: { fontSize: 9.5, fontWeight: '800', color: '#004b87', letterSpacing: 0.4 },
  hardwareRow: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 3 },
  hardwareKey: { fontSize: 10.5, fontWeight: '600', color: '#64748b' },
  hardwareVal: { fontSize: 10.5, fontWeight: '800', color: '#334155' },
  modalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(15, 23, 42, 0.55)',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 20,
  },
  modalContainer: {
    width: '100%',
    maxWidth: 400,
    backgroundColor: '#ffffff',
    borderRadius: 18,
    padding: 20,
  },
  modalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 8,
  },
  modalTitle: { fontSize: 16, fontWeight: '800', color: '#0f172a' },
  modalSubText: { fontSize: 11.5, color: '#64748b', lineHeight: 16, marginBottom: 12 },
  modalInput: {
    height: 44,
    backgroundColor: '#f8fafc',
    borderWidth: 1.2,
    borderColor: '#cbd5e1',
    borderRadius: 10,
    paddingHorizontal: 12,
    fontSize: 13,
    color: '#0f172a',
  },
  presetRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 10, marginBottom: 16 },
  presetChip: {
    backgroundColor: '#e6f0fa',
    paddingVertical: 5,
    paddingHorizontal: 9,
    borderRadius: 8,
  },
  presetChipText: { fontSize: 10, fontWeight: '700', color: '#004b87' },
  saveServerBtn: {
    backgroundColor: '#004b87',
    height: 44,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  saveServerBtnText: { color: '#ffffff', fontSize: 13, fontWeight: '800' },
});

export default LoginScreen;