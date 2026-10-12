// mobile/src/screens/LoginScreen.tsx

import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StatusBar,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import { useAuth } from '../context/AuthContext';
import { ServerConfigModal } from '../components/ServerConfigModal';
import { getDeviceHardwareInfo } from '../services/deviceService';
import { apiClient } from '../api/client';
import { COLORS } from '../constants/theme';

const defaultSchoolLogo = require('../../assets/logo.svg');

interface SchoolMetadata {
  schoolName: string;
  divisionLabel: string;
  logoUrl: string | null;
}

export const LoginScreen: React.FC = () => {
  const { login } = useAuth();

  // Form State
  const [username, setUsername] = useState<string>('');
  const [password, setPassword] = useState<string>('');
  const [showPassword, setShowPassword] = useState<boolean>(false);
  const [loading, setLoading] = useState<boolean>(false);
  const [configVisible, setConfigVisible] = useState<boolean>(false);

  // Focus Highlight States
  const [userFocused, setUserFocused] = useState<boolean>(false);
  const [passFocused, setPassFocused] = useState<boolean>(false);

  // Dynamic Telemetry & School Branding
  const [deviceModel, setDeviceModel] = useState<string>('');
  const [hardwareId, setHardwareId] = useState<string>('');
  const [schoolData, setSchoolData] = useState<SchoolMetadata>({
    schoolName: '',
    divisionLabel: '',
    logoUrl: null,
  });

  useEffect(() => {
    let isMounted = true;

    const bootstrapTelemetryAndBranding = async () => {
      try {
        const hwInfo = await getDeviceHardwareInfo();
        if (isMounted) {
          const displayModel =
            hwInfo.brand && hwInfo.device_model
              ? `${hwInfo.brand} ${hwInfo.device_model}`
              : hwInfo.device_model || '';
          setDeviceModel(displayModel);
          setHardwareId(hwInfo.client_device_id || '');
        }
      } catch {
        if (isMounted) {
          setDeviceModel('');
          setHardwareId('');
        }
      }

      try {
        const res = await apiClient.get('/api/settings/school/');
        if (isMounted && res.data) {
          const name = res.data.school_name || '';
          const division = res.data.division ? `Division of ${res.data.division}` : '';
          const region = res.data.region ? `Region ${res.data.region}` : '';
          const divisionLabel = [division, region].filter(Boolean).join(' • ');

          setSchoolData({
            schoolName: name,
            divisionLabel: divisionLabel,
            logoUrl: res.data.school_logo || null,
          });
        }
      } catch {
        // Keeps state clean when server has not provided school data yet
      }
    };

    bootstrapTelemetryAndBranding();

    return () => {
      isMounted = false;
    };
  }, []);

  const handleLogin = async () => {
    const cleanUser = username.trim();
    const cleanPass = password.trim();

    if (!cleanUser || !cleanPass) {
      Alert.alert(
        'Missing Credentials',
        'Please enter your Employee ID / Username and Password.'
      );
      return;
    }

    setLoading(true);

    try {
      // Must succeed against the Django database to unlock navigation
      await login(cleanUser, cleanPass);
    } catch (err: any) {
      let serverMessage = 'Invalid credentials. Only registered users in the database can sign in.';

      if (err?.response?.data) {
        serverMessage =
          err.response.data.error ||
          err.response.data.detail ||
          err.response.data.non_field_errors?.[0] ||
          serverMessage;
      } else if (err?.message && !err?.response) {
        serverMessage = 'Cannot connect to backend server. Please verify your host IP address.';
      }

      setPassword('');
      Alert.alert('Authentication Denied', serverMessage);
    } finally {
      setLoading(false);
    }
  };

  return (
    <SafeAreaView style={styles.safeContainer} edges={['top', 'left', 'right', 'bottom']}>
      <StatusBar barStyle="dark-content" backgroundColor="#f8fafc" />

      {/* Top Header Navigation */}
      <View style={styles.topHeader}>
        <View style={styles.gatewayBadge}>
          <View style={styles.statusDot} />
          <Text style={styles.gatewayText}>DEPED TELEMETRY PROTOCOL</Text>
        </View>

        <TouchableOpacity
          style={styles.settingsBtn}
          onPress={() => setConfigVisible(true)}
          accessibilityLabel="Open Server Host Settings"
          activeOpacity={0.7}
        >
          <Ionicons name="server-outline" size={18} color="#475569" />
        </TouchableOpacity>
      </View>

      <KeyboardAvoidingView
        style={styles.keyboardContainer}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <ScrollView
          contentContainerStyle={styles.scrollContent}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
        >
          {/* Institutional Crest & App Identity */}
          <View style={styles.brandContainer}>
            <View style={styles.crestCircle}>
              <Image
                source={schoolData.logoUrl ? { uri: schoolData.logoUrl } : defaultSchoolLogo}
                style={styles.crestImage}
                contentFit="contain"
                transition={200}
              />
            </View>
            <Text style={styles.mainTitle}>AttendSure</Text>
            {schoolData.schoolName ? (
              <Text style={styles.schoolTitle}>{schoolData.schoolName}</Text>
            ) : null}
            {schoolData.divisionLabel ? (
              <Text style={styles.divisionSubtitle}>{schoolData.divisionLabel}</Text>
            ) : null}
          </View>

          {/* Hardware Device Authorization Card */}
          <View style={styles.hardwareCard}>
            <View style={styles.hardwareCardHeader}>
              <View style={styles.hwIconTitle}>
                <Ionicons name="shield-checkmark" size={16} color={COLORS.accent} />
                <Text style={styles.hwTitleText}>DEVICE AUTHORIZATION</Text>
              </View>
              <View style={styles.activeTag}>
                <Text style={styles.activeTagText}>ACTIVE</Text>
              </View>
            </View>

            {deviceModel ? (
              <View style={styles.hwDetailRow}>
                <Text style={styles.hwLabel}>Hardware Model:</Text>
                <Text style={styles.hwVal}>{deviceModel}</Text>
              </View>
            ) : null}

            {hardwareId ? (
              <View style={styles.hwDetailRow}>
                <Text style={styles.hwLabel}>Hardware UUID:</Text>
                <Text style={styles.hwValMono} numberOfLines={1} ellipsizeMode="middle">
                  {hardwareId}
                </Text>
              </View>
            ) : null}

            <Text style={styles.hwDisclaimer}>
              Only database-registered personnel can bind this smartphone to official Civil Service records.
            </Text>
          </View>

          {/* Login Card */}
          <View style={styles.loginCard}>
            <Text style={styles.cardHeaderLabel}>DATABASE CREDENTIALS</Text>

            {/* Username / Employee ID */}
            <View style={styles.fieldGroup}>
              <Text style={styles.fieldLabel}>Employee ID or Username</Text>
              <View style={[styles.inputBox, userFocused && styles.inputBoxFocused]}>
                <Ionicons
                  name="person-outline"
                  size={18}
                  color={userFocused ? COLORS.primary : '#94a3b8'}
                  style={styles.inputLeadingIcon}
                />
                <TextInput
                  style={styles.textInput}
                  placeholder="Enter registered ID or username"
                  placeholderTextColor="#94a3b8"
                  value={username}
                  onChangeText={setUsername}
                  onFocus={() => setUserFocused(true)}
                  onBlur={() => setUserFocused(false)}
                  autoCapitalize="none"
                  autoCorrect={false}
                  autoComplete="username"
                  textContentType="username"
                />
              </View>
            </View>

            {/* Password Field */}
            <View style={styles.fieldGroup}>
              <Text style={styles.fieldLabel}>Password</Text>
              <View style={[styles.inputBox, passFocused && styles.inputBoxFocused]}>
                <Ionicons
                  name="lock-closed-outline"
                  size={18}
                  color={passFocused ? COLORS.primary : '#94a3b8'}
                  style={styles.inputLeadingIcon}
                />
                <TextInput
                  style={styles.textInput}
                  placeholder="Enter database password"
                  placeholderTextColor="#94a3b8"
                  value={password}
                  onChangeText={setPassword}
                  onFocus={() => setPassFocused(true)}
                  onBlur={() => setPassFocused(false)}
                  secureTextEntry={!showPassword}
                  autoCapitalize="none"
                  autoComplete="current-password"
                  textContentType="password"
                />
                <TouchableOpacity
                  onPress={() => setShowPassword(!showPassword)}
                  style={styles.eyeBtn}
                  activeOpacity={0.7}
                  accessibilityLabel="Toggle password visibility"
                >
                  <Ionicons
                    name={showPassword ? 'eye-off-outline' : 'eye-outline'}
                    size={20}
                    color="#64748b"
                  />
                </TouchableOpacity>
              </View>
            </View>

            {/* Sign In CTA */}
            <TouchableOpacity
              style={[styles.loginBtn, loading && styles.btnDisabled]}
              onPress={handleLogin}
              disabled={loading}
              activeOpacity={0.88}
            >
              {loading ? (
                <ActivityIndicator color="#ffffff" size="small" />
              ) : (
                <>
                  <Text style={styles.loginBtnText}>Verify & Authorize Account</Text>
                  <Ionicons name="arrow-forward" size={17} color="#ffffff" style={{ marginLeft: 6 }} />
                </>
              )}
            </TouchableOpacity>
          </View>

          {/* Compliance Footnote */}
          <View style={styles.complianceFooter}>
            <Text style={styles.footerBrand}>ATTENDSURE INTEGRATED SYSTEM</Text>
            <Text style={styles.footerNote}>
              Civil Service Commission Form 48 Standards • Strict Server-Side Authentication
            </Text>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>

      {/* Network Host Settings Modal */}
      <ServerConfigModal visible={configVisible} onClose={() => setConfigVisible(false)} />
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  safeContainer: {
    flex: 1,
    backgroundColor: '#f8fafc',
  },
  topHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingTop: 8,
    paddingBottom: 10,
  },
  gatewayBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#ffffff',
    paddingVertical: 5,
    paddingHorizontal: 12,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: '#e2e8f0',
    gap: 7,
  },
  statusDot: {
    width: 7,
    height: 7,
    borderRadius: 3.5,
    backgroundColor: '#059669',
  },
  gatewayText: {
    fontSize: 9.5,
    fontWeight: '800',
    color: '#004b87',
    letterSpacing: 0.5,
  },
  settingsBtn: {
    width: 36,
    height: 36,
    borderRadius: 10,
    backgroundColor: '#ffffff',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: '#e2e8f0',
  },
  keyboardContainer: {
    flex: 1,
  },
  scrollContent: {
    paddingHorizontal: 20,
    paddingBottom: 28,
  },
  brandContainer: {
    alignItems: 'center',
    marginTop: 6,
    marginBottom: 16,
  },
  crestCircle: {
    width: 86,
    height: 86,
    borderRadius: 43,
    backgroundColor: '#ffffff',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 10,
    borderWidth: 1.5,
    borderColor: '#b8d6f0',
    padding: 6,
    ...Platform.select({
      ios: {
        shadowColor: '#004b87',
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.12,
        shadowRadius: 8,
      },
      android: { elevation: 3 },
    }),
  },
  crestImage: {
    width: '100%',
    height: '100%',
  },
  mainTitle: {
    fontSize: 26,
    fontWeight: '800',
    color: '#003460',
    letterSpacing: -0.5,
  },
  schoolTitle: {
    fontSize: 14.5,
    fontWeight: '700',
    color: '#004b87',
    marginTop: 2,
    textAlign: 'center',
  },
  divisionSubtitle: {
    fontSize: 11.5,
    color: '#64748b',
    marginTop: 2,
    textAlign: 'center',
  },
  hardwareCard: {
    backgroundColor: '#ffffff',
    borderRadius: 16,
    padding: 14,
    marginBottom: 14,
    borderWidth: 1,
    borderColor: '#e2e8f0',
  },
  hardwareCardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingBottom: 8,
    borderBottomWidth: 1,
    borderBottomColor: '#f1f5f9',
    marginBottom: 8,
  },
  hwIconTitle: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  hwTitleText: {
    fontSize: 10.5,
    fontWeight: '800',
    color: '#0f172a',
    letterSpacing: 0.5,
  },
  activeTag: {
    backgroundColor: '#ecfdf5',
    paddingVertical: 3,
    paddingHorizontal: 8,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: '#a7f3d0',
  },
  activeTagText: {
    fontSize: 9,
    fontWeight: '800',
    color: '#047857',
    letterSpacing: 0.4,
  },
  hwDetailRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 5,
  },
  hwLabel: {
    fontSize: 11.5,
    color: '#64748b',
  },
  hwVal: {
    fontSize: 11.5,
    fontWeight: '700',
    color: '#0f172a',
  },
  hwValMono: {
    fontSize: 11,
    fontWeight: '700',
    color: '#004b87',
    fontFamily: Platform.OS === 'ios' ? 'Courier' : 'monospace',
    maxWidth: '65%',
  },
  hwDisclaimer: {
    fontSize: 9.5,
    color: '#94a3b8',
    marginTop: 8,
    lineHeight: 13,
  },
  loginCard: {
    backgroundColor: '#ffffff',
    borderRadius: 20,
    padding: 18,
    borderWidth: 1,
    borderColor: '#e2e8f0',
    ...Platform.select({
      ios: {
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.05,
        shadowRadius: 10,
      },
      android: { elevation: 2 },
    }),
  },
  cardHeaderLabel: {
    fontSize: 10.5,
    fontWeight: '800',
    color: '#64748b',
    letterSpacing: 0.8,
    marginBottom: 14,
  },
  fieldGroup: {
    marginBottom: 12,
  },
  fieldLabel: {
    fontSize: 12,
    fontWeight: '700',
    color: '#334155',
    marginBottom: 5,
  },
  inputBox: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#f8fafc',
    borderWidth: 1.2,
    borderColor: '#cbd5e1',
    borderRadius: 12,
    paddingHorizontal: 12,
    height: 48,
  },
  inputBoxFocused: {
    borderColor: '#004b87',
    backgroundColor: '#ffffff',
  },
  inputLeadingIcon: {
    marginRight: 8,
  },
  textInput: {
    flex: 1,
    fontSize: 13.5,
    color: '#0f172a',
  },
  eyeBtn: {
    padding: 6,
  },
  loginBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#004b87',
    height: 48,
    borderRadius: 12,
    marginTop: 6,
  },
  btnDisabled: {
    opacity: 0.65,
  },
  loginBtnText: {
    fontSize: 13.5,
    fontWeight: '700',
    color: '#ffffff',
  },
  complianceFooter: {
    alignItems: 'center',
    marginTop: 18,
  },
  footerBrand: {
    fontSize: 9.5,
    fontWeight: '800',
    color: '#94a3b8',
    letterSpacing: 0.8,
  },
  footerNote: {
    fontSize: 9.5,
    color: '#cbd5e1',
    marginTop: 2,
    textAlign: 'center',
  },
});

export default LoginScreen;