/**
 * AttendSure - Mobile Splash Screen (Copied from Web App Layout)
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
import { Image } from 'expo-image';
import { StatusBar } from 'expo-status-bar';
import { Ionicons } from '@expo/vector-icons';
import * as NativeSplashScreen from 'expo-splash-screen';
import { getServerBaseUrl, setServerBaseUrl } from '../services/configService';

interface SplashScreenProps {
  loading?: boolean;
  minDurationMs?: number;
  onFinish?: () => void;
}

export const SplashScreen: React.FC<SplashScreenProps> = ({
  loading = false,
  minDurationMs = 2000,
  onFinish,
}) => {
  const [canExit, setCanExit] = useState(false);
  const [fading, setFading] = useState(false);
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
      setFading(true);
      Animated.timing(opacityAnim, {
        toValue: 0,
        duration: 500,
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
    try {
      await setServerBaseUrl(customServerUrl);
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
          >
            <View style={styles.toolsIconHalo}>
              <View style={styles.toolsIconCircle}>
                <Ionicons name="settings-sharp" size={16} color="#ffffff" />
              </View>
            </View>
          </TouchableOpacity>
        </View>

        {/* Center Product Emblem (Matches Web AttendSureBadge style) */}
        <View style={styles.centerSection}>
          <View style={styles.emblemContainer}>
            <Image
              source={require('../../assets/splash.png')}
              style={styles.emblemImage}
              contentFit="contain"
            />
          </View>
          <Text style={styles.brandTitle}>AttendSure</Text>
        </View>

        {/* Developer Corporate Signature at Bottom (Matches Web TechBlazerSignature style) */}
        <View style={styles.footerSection}>
          <Text style={styles.signatureText}>System by TechBlazer</Text>
        </View>

        {/* Network & Server Tools Modal */}
        <Modal visible={showToolsModal} transparent animationType="fade">
          <View style={styles.modalBackdrop}>
            <View style={styles.modalCard}>
              <Text style={styles.modalTitle}>Network &amp; Server Tools</Text>
              <Text style={styles.modalSubtitle}>Configure school server endpoint address</Text>

              <TextInput
                style={styles.modalInput}
                value={customServerUrl}
                onChangeText={setCustomServerUrl}
                placeholder="http://192.168.100.4:8000"
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
    inset: 0,
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
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: 'rgba(2, 132, 199, 0.1)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  toolsIconCircle: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: '#0284c7',
    alignItems: 'center',
    justifyContent: 'center',
  },
  centerSection: {
    alignItems: 'center',
    justifyContent: 'center',
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
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.1,
    shadowRadius: 8,
    elevation: 4,
    marginBottom: 12,
    overflow: 'hidden',
  },
  emblemImage: {
    width: 64,
    height: 64,
  },
  brandTitle: {
    fontSize: 20,
    fontWeight: '900',
    color: '#003460',
    letterSpacing: -0.2,
  },
  footerSection: {
    alignItems: 'center',
    paddingBottom: 22,
  },
  signatureText: {
    fontSize: 11,
    fontWeight: '600',
    color: '#94a3b8',
    letterSpacing: 0.5,
  },
  modalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(15, 23, 42, 0.6)',
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
  },
  modalTitle: {
    fontSize: 16,
    fontWeight: '800',
    color: '#0f172a',
  },
  modalSubtitle: {
    fontSize: 11,
    color: '#64748b',
    marginTop: 2,
    marginBottom: 14,
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