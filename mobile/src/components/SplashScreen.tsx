/**
 * AttendSure - Mobile Splash Screen
 * Uses vector SVG logo for crisp, zero-latency rendering.
 * File: mobile/src/components/SplashScreen.tsx
 */

import React, { useEffect, useState, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Animated,
  Platform,
  TouchableOpacity,
  Modal,
  TextInput,
  Alert,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import { Ionicons } from '@expo/vector-icons';
import * as NativeSplashScreen from 'expo-splash-screen';
import { getServerBaseUrl, setServerBaseUrl } from '../services/configService';
import { AttendSureLogo } from '../branding/AttendSureLogo';

interface SplashScreenProps {
  loading?: boolean;
  minDurationMs?: number;
  onFinish?: () => void;
}

// Cybersecurity: Prevent script or unsafe protocol injection into server address
const isValidServerUrl = (url: string): boolean => {
  if (!url || typeof url !== 'string') return false;
  const clean = url.trim().toLowerCase();
  if (
    clean.startsWith('javascript:') ||
    clean.startsWith('data:') ||
    clean.startsWith('file:') ||
    clean.startsWith('vbscript:')
  ) {
    return false;
  }
  return clean.startsWith('http://') || clean.startsWith('https://');
};

export const SplashScreen: React.FC<SplashScreenProps> = ({
  loading = false,
  minDurationMs = 800,
  onFinish,
}) => {
  const [canExit, setCanExit] = useState(false);
  const [hidden, setHidden] = useState(false);

  const opacityAnim = useRef(new Animated.Value(1)).current;

  // Network Tools Modal State
  const [showToolsModal, setShowToolsModal] = useState<boolean>(false);
  const [customServerUrl, setCustomServerUrl] = useState<string>('');
  const isHoldingSplashRef = useRef<boolean>(false);

  useEffect(() => {
    if (Platform.OS !== 'web') {
      NativeSplashScreen.hideAsync().catch(() => {});
    }

    const timer = setTimeout(() => {
      setCanExit(true);
    }, minDurationMs);

    return () => clearTimeout(timer);
  }, [minDurationMs]);

  useEffect(() => {
    if (!loading && canExit && !isHoldingSplashRef.current) {
      Animated.timing(opacityAnim, {
        toValue: 0,
        duration: 350,
        useNativeDriver: true,
      }).start(() => {
        setHidden(true);
        if (onFinish) onFinish();
      });
    }
  }, [loading, canExit, onFinish, opacityAnim]);

  const openTools = async () => {
    isHoldingSplashRef.current = true;
    const activeUrl = await getServerBaseUrl();
    setCustomServerUrl(activeUrl);
    setShowToolsModal(true);
  };

  const saveServerAddress = async () => {
    const cleanUrl = customServerUrl.trim();
    if (!isValidServerUrl(cleanUrl)) {
      Alert.alert(
        'Invalid Address',
        'Please enter a valid URL starting with http:// or https://'
      );
      return;
    }

    try {
      await setServerBaseUrl(cleanUrl);
      Alert.alert('Saved', 'School server address updated successfully.');
      setShowToolsModal(false);
      isHoldingSplashRef.current = false;
      if (onFinish) onFinish();
    } catch (e: any) {
      Alert.alert('Invalid URL', e.message || 'Please check the server address format.');
    }
  };

  if (hidden) return null;

  return (
    <Animated.View style={[styles.container, { opacity: opacityAnim }]}>
      <SafeAreaView style={styles.safeContainer} edges={['top', 'bottom']}>
        <StatusBar style="dark" />

        {/* Top-Left Network Tools Button */}
        <View style={styles.topBar}>
          <TouchableOpacity
            style={styles.toolsButton}
            onPress={openTools}
            activeOpacity={0.8}
            accessibilityLabel="Configure server endpoint"
          >
            <View style={styles.toolsIconHalo}>
              <View style={styles.toolsIconCircle}>
                <Ionicons name="settings-sharp" size={16} color="#ffffff" />
              </View>
            </View>
          </TouchableOpacity>
        </View>

        {/* Center Product Emblem: Uses AttendSure SVG Logo */}
        <View style={styles.centerSection}>
          <View style={styles.emblemContainer}>
            <AttendSureLogo size={56} />
          </View>
          <Text style={styles.brandTitle}>AttendSure</Text>
        </View>

        {/* Developer Corporate Signature at Bottom */}
        <View style={styles.footerSection}>
          <Text style={styles.signatureText}>System by TechBlazer</Text>
        </View>

        {/* Network & Server Tools Modal */}
        <Modal
          visible={showToolsModal}
          transparent
          animationType="fade"
          onRequestClose={() => {
            setShowToolsModal(false);
            isHoldingSplashRef.current = false;
            if (onFinish) onFinish();
          }}
        >
          <View style={styles.modalBackdrop}>
            <View style={styles.modalCard}>
              <View style={styles.modalHeaderRow}>
                <Ionicons name="server-outline" size={20} color="#004b87" />
                <Text style={styles.modalTitle}>Network &amp; Server Tools</Text>
              </View>
              <Text style={styles.modalSubtitle}>
                Configure local or cloud school server address
              </Text>

              <TextInput
                style={styles.modalInput}
                value={customServerUrl}
                onChangeText={setCustomServerUrl}
                placeholder="http://192.168.1.100:8000"
                placeholderTextColor="#94a3b8"
                autoCapitalize="none"
                autoCorrect={false}
              />

              <View style={styles.modalActions}>
                <TouchableOpacity
                  style={styles.modalCancelBtn}
                  onPress={() => {
                    setShowToolsModal(false);
                    isHoldingSplashRef.current = false;
                    if (onFinish) onFinish();
                  }}
                >
                  <Text style={styles.modalCancelText}>Cancel</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={styles.modalSaveBtn}
                  onPress={saveServerAddress}
                >
                  <Text style={styles.modalSaveText}>Save &amp; Connect</Text>
                </TouchableOpacity>
              </View>
            </View>
          </View>
        </Modal>
      </SafeAreaView>
    </Animated.View>
  );
};

const styles = StyleSheet.create({
  container: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    zIndex: 99999,
    backgroundColor: '#ffffff',
  },
  safeContainer: {
    flex: 1,
    backgroundColor: '#ffffff',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingVertical: 16,
  },
  topBar: {
    width: '100%',
    alignItems: 'flex-start',
  },
  toolsButton: {
    padding: 4,
  },
  toolsIconHalo: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: 'rgba(2, 132, 199, 0.12)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  toolsIconCircle: {
    width: 30,
    height: 30,
    borderRadius: 15,
    backgroundColor: '#0284c7',
    alignItems: 'center',
    justifyContent: 'center',
  },
  centerSection: {
    alignItems: 'center',
    justifyContent: 'center',
    transform: [{ translateY: -16 }],
  },
  emblemContainer: {
    width: 96,
    height: 96,
    borderRadius: 48,
    backgroundColor: '#ffffff',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1.5,
    borderColor: '#e2e8f0',
    shadowColor: '#004b87',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.12,
    shadowRadius: 10,
    elevation: 4,
    marginBottom: 14,
    overflow: 'hidden',
  },
  brandTitle: {
    fontSize: 22,
    fontWeight: '900',
    color: '#003460',
    letterSpacing: -0.3,
  },
  footerSection: {
    alignItems: 'center',
    paddingBottom: 20,
  },
  signatureText: {
    fontSize: 11.5,
    fontWeight: '700',
    color: '#94a3b8',
    letterSpacing: 0.4,
  },
  modalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(15, 23, 42, 0.65)',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 20,
  },
  modalCard: {
    width: '100%',
    maxWidth: 340,
    backgroundColor: '#ffffff',
    borderRadius: 16,
    padding: 20,
    borderWidth: 1,
    borderColor: '#e2e8f0',
  },
  modalHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  modalTitle: {
    fontSize: 15,
    fontWeight: '800',
    color: '#0f172a',
  },
  modalSubtitle: {
    fontSize: 11.5,
    color: '#64748b',
    marginTop: 4,
    marginBottom: 14,
    lineHeight: 16,
  },
  modalInput: {
    height: 44,
    borderWidth: 1,
    borderColor: '#cbd5e1',
    borderRadius: 8,
    paddingHorizontal: 12,
    fontSize: 13,
    color: '#0f172a',
    backgroundColor: '#f8fafc',
    marginBottom: 16,
  },
  modalActions: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: 10,
  },
  modalCancelBtn: {
    paddingVertical: 8,
    paddingHorizontal: 14,
  },
  modalCancelText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#64748b',
  },
  modalSaveBtn: {
    backgroundColor: '#004b87',
    paddingVertical: 8,
    paddingHorizontal: 14,
    borderRadius: 8,
  },
  modalSaveText: {
    fontSize: 13,
    fontWeight: '700',
    color: '#ffffff',
  },
});

export default SplashScreen;