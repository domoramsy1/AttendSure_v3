/**
 * AttendSure - Circular Radar & Spiral Loader Mobile Splash Screen
 * File: mobile/src/components/SplashScreen.tsx
 */

import React, { useEffect, useState, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Animated,
  Easing,
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
import { useThemeMode } from '../context/ThemeContext';

interface SplashScreenProps {
  loading?: boolean;
  minDurationMs?: number;
  onFinish?: () => void;
}

const SPIRAL_DOTS = Array.from({ length: 8 }, (_, index) => index);

// Cybersecurity: Block unsafe URL protocols in server address input
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
  minDurationMs = 7000,
  onFinish,
}) => {
  const { palette, isDark } = useThemeMode();
  const [canExit, setCanExit] = useState(false);
  const [hidden, setHidden] = useState(false);

  // Fade out animation
  const opacityAnim = useRef(new Animated.Value(1)).current;

  // Radar wave & sweep animations
  const radarWave1 = useRef(new Animated.Value(0)).current;
  const radarWave2 = useRef(new Animated.Value(0)).current;
  const radarSweep = useRef(new Animated.Value(0)).current;

  // Spiral loader master clock (0 -> 1 loop)
  const spiralClock = useRef(new Animated.Value(0)).current;

  // Server Settings Modal State
  const [showToolsModal, setShowToolsModal] = useState<boolean>(false);
  const [customServerUrl, setCustomServerUrl] = useState<string>('');
  const isHoldingSplashRef = useRef<boolean>(false);

  // Start continuous radar & spiral animations
  useEffect(() => {
    const wave1Loop = Animated.loop(
      Animated.timing(radarWave1, {
        toValue: 1,
        duration: 2400,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: true,
      })
    );

    const wave2Loop = Animated.loop(
      Animated.sequence([
        Animated.delay(1200),
        Animated.timing(radarWave2, {
          toValue: 1,
          duration: 2400,
          easing: Easing.out(Easing.cubic),
          useNativeDriver: true,
        }),
      ])
    );

    const sweepLoop = Animated.loop(
      Animated.timing(radarSweep, {
        toValue: 1,
        duration: 2200,
        easing: Easing.linear,
        useNativeDriver: true,
      })
    );

    const spiralLoop = Animated.loop(
      Animated.timing(spiralClock, {
        toValue: 1,
        duration: 1100,
        easing: Easing.linear,
        useNativeDriver: true,
      })
    );

    wave1Loop.start();
    wave2Loop.start();
    sweepLoop.start();
    spiralLoop.start();

    return () => {
      wave1Loop.stop();
      wave2Loop.stop();
      sweepLoop.stop();
      spiralLoop.stop();
    };
  }, [radarWave1, radarWave2, radarSweep, spiralClock]);

  // 7-second timer
  useEffect(() => {
    if (Platform.OS !== 'web') {
      NativeSplashScreen.hideAsync().catch(() => {});
    }

    const timer = setTimeout(() => {
      setCanExit(true);
    }, minDurationMs);

    return () => clearTimeout(timer);
  }, [minDurationMs]);

  // Exit transition once timer finishes
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
        'Please enter a valid web address starting with http:// or https://'
      );
      return;
    }

    try {
      await setServerBaseUrl(cleanUrl);
      Alert.alert('Saved', 'School server address updated.');
      setShowToolsModal(false);
      isHoldingSplashRef.current = false;
      if (onFinish) onFinish();
    } catch (e: any) {
      Alert.alert('Invalid Address', e.message || 'Please check the server address.');
    }
  };

  if (hidden) return null;

  const wave1Scale = radarWave1.interpolate({ inputRange: [0, 1], outputRange: [0.95, 1.85] });
  const wave1Opacity = radarWave1.interpolate({ inputRange: [0, 1], outputRange: [0.75, 0] });

  const wave2Scale = radarWave2.interpolate({ inputRange: [0, 1], outputRange: [0.95, 1.85] });
  const wave2Opacity = radarWave2.interpolate({ inputRange: [0, 1], outputRange: [0.75, 0] });

  const sweepRotate = radarSweep.interpolate({ inputRange: [0, 1], outputRange: ['0deg', '360deg'] });

  return (
    <Animated.View style={[styles.container, { backgroundColor: palette.background, opacity: opacityAnim }]}>
      <SafeAreaView style={styles.safeContainer} edges={['top', 'bottom']}>
        <StatusBar style={isDark ? 'light' : 'dark'} />

        {/* Top-Left Server Settings Button */}
        <View style={styles.topBar}>
          <TouchableOpacity
            style={styles.toolsButton}
            onPress={openTools}
            activeOpacity={0.8}
            accessibilityLabel="Server settings"
          >
            <View style={[styles.toolsIconHalo, { backgroundColor: palette.primarySoft }]}>
              <View style={[styles.toolsIconCircle, { backgroundColor: palette.primary }]}>
                <Ionicons name="settings-sharp" size={16} color="#ffffff" />
              </View>
            </View>
          </TouchableOpacity>
        </View>

        {/* Center Circular Radar Logo + Spiral Loader */}
        <View style={styles.centerSection}>
          <View style={styles.radarContainer}>
            {/* Expanding Radar Wave 1 */}
            <Animated.View
              pointerEvents="none"
              style={[
                styles.radarRing,
                {
                  borderColor: palette.primary,
                  transform: [{ scale: wave1Scale }],
                  opacity: wave1Opacity,
                },
              ]}
            />

            {/* Expanding Radar Wave 2 */}
            <Animated.View
              pointerEvents="none"
              style={[
                styles.radarRing,
                {
                  borderColor: palette.secondary,
                  transform: [{ scale: wave2Scale }],
                  opacity: wave2Opacity,
                },
              ]}
            />

            {/* Rotating Radar Sweep Ring */}
            <Animated.View
              pointerEvents="none"
              style={[
                styles.radarSweepRing,
                {
                  borderTopColor: palette.primary,
                  borderRightColor: `${palette.primary}55`,
                  transform: [{ rotate: sweepRotate }],
                },
              ]}
            />

            {/* Solid Circular Logo Emblem */}
            <View style={[styles.emblemCircle, { borderColor: palette.primary }]}>
              <AttendSureLogo size={56} />
            </View>
          </View>

          <Text style={[styles.brandTitle, { color: palette.textPrimary }]}>AttendSure</Text>
          <Text style={[styles.brandSubtitle, { color: palette.textSecondary }]}>
            School Attendance System
          </Text>

          {/* 8-Dot Spiral Loading Spinner */}
          <View style={styles.spiralContainer} accessibilityLabel="Loading">
            {SPIRAL_DOTS.map((i) => {
              const angleDeg = `${i * 45}deg`;
              const phase = i / 8;

              // Staggered phase shift around the 8 dots to create the spiral wave
              const inputRange = [0, phase, (phase + 0.5) % 1, 1].sort((a, b) => a - b);
              const uniqueInput = Array.from(new Set(inputRange));
              const outputScale = uniqueInput.map((val) => {
                const dist = Math.abs(((val - phase + 1.5) % 1) - 0.5) * 2; // 0 at peak, 1 at trough
                return 1 - dist * 0.68;
              });
              const outputOpacity = uniqueInput.map((val) => {
                const dist = Math.abs(((val - phase + 1.5) % 1) - 0.5) * 2;
                return 1 - dist * 0.8;
              });

              const dotScale = spiralClock.interpolate({
                inputRange: uniqueInput,
                outputRange: outputScale,
              });
              const dotOpacity = spiralClock.interpolate({
                inputRange: uniqueInput,
                outputRange: outputOpacity,
              });

              return (
                <View key={i} style={[styles.spiralArm, { transform: [{ rotate: angleDeg }] }]}>
                  <Animated.View
                    style={[
                      styles.spiralDot,
                      {
                        backgroundColor: palette.textPrimary,
                        transform: [{ scale: dotScale }],
                        opacity: dotOpacity,
                      },
                    ]}
                  />
                </View>
              );
            })}
          </View>

          <Text style={[styles.waitText, { color: palette.textMuted }]}>Please wait...</Text>
        </View>

        {/* Bottom Footer */}
        <View style={styles.footerSection}>
          <Text style={[styles.signatureText, { color: palette.textMuted }]}>
            &copy; 2026 AttendSure &bull; <Text style={{ fontWeight: '800', color: palette.textPrimary }}>TechBlazer</Text>
          </Text>
        </View>

        {/* Server Settings Modal */}
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
            <View style={[styles.modalCard, { backgroundColor: palette.surface, borderColor: palette.border }]}>
              <View style={styles.modalHeaderRow}>
                <Ionicons name="server-outline" size={20} color={palette.primary} />
                <Text style={[styles.modalTitle, { color: palette.textPrimary }]}>Server Settings</Text>
              </View>
              <Text style={[styles.modalSubtitle, { color: palette.textSecondary }]}>
                Enter your school server web address
              </Text>

              <TextInput
                style={[
                  styles.modalInput,
                  {
                    backgroundColor: palette.surfaceSubtle,
                    borderColor: palette.borderStrong,
                    color: palette.textPrimary,
                  },
                ]}
                value={customServerUrl}
                onChangeText={setCustomServerUrl}
                placeholder="http://192.168.1.100:8000"
                placeholderTextColor={palette.textMuted}
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
                  <Text style={[styles.modalCancelText, { color: palette.textMuted }]}>Cancel</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.modalSaveBtn, { backgroundColor: palette.primary }]}
                  onPress={saveServerAddress}
                >
                  <Text style={styles.modalSaveText}>Save</Text>
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
  },
  safeContainer: {
    flex: 1,
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
    alignItems: 'center',
    justifyContent: 'center',
  },
  toolsIconCircle: {
    width: 30,
    height: 30,
    borderRadius: 15,
    alignItems: 'center',
    justifyContent: 'center',
  },
  centerSection: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  radarContainer: {
    width: 116,
    height: 116,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 18,
  },
  radarRing: {
    position: 'absolute',
    width: 96,
    height: 96,
    borderRadius: 48,
    borderWidth: 2,
  },
  radarSweepRing: {
    position: 'absolute',
    width: 106,
    height: 106,
    borderRadius: 53,
    borderWidth: 2.5,
    borderLeftColor: 'transparent',
    borderBottomColor: 'transparent',
  },
  emblemCircle: {
    width: 92,
    height: 92,
    borderRadius: 46,
    backgroundColor: '#ffffff',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    shadowColor: '#004b87',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.14,
    shadowRadius: 10,
    elevation: 5,
    overflow: 'hidden',
  },
  brandTitle: {
    fontSize: 28,
    fontWeight: '900',
    letterSpacing: -0.4,
  },
  brandSubtitle: {
    fontSize: 13.5,
    fontWeight: '600',
    marginTop: 4,
  },
  spiralContainer: {
    width: 44,
    height: 44,
    marginTop: 24,
    position: 'relative',
  },
  spiralArm: {
    position: 'absolute',
    inset: 0,
    alignItems: 'center',
  },
  spiralDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  waitText: {
    fontSize: 12.5,
    fontWeight: '600',
    marginTop: 10,
  },
  footerSection: {
    alignItems: 'center',
    paddingBottom: 12,
  },
  signatureText: {
    fontSize: 12,
    fontWeight: '600',
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
    borderRadius: 16,
    padding: 20,
    borderWidth: 1,
  },
  modalHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  modalTitle: {
    fontSize: 15,
    fontWeight: '800',
  },
  modalSubtitle: {
    fontSize: 12,
    marginTop: 4,
    marginBottom: 14,
  },
  modalInput: {
    height: 44,
    borderWidth: 1,
    borderRadius: 8,
    paddingHorizontal: 12,
    fontSize: 13,
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
  },
  modalSaveBtn: {
    paddingVertical: 8,
    paddingHorizontal: 16,
    borderRadius: 8,
  },
  modalSaveText: {
    fontSize: 13,
    fontWeight: '700',
    color: '#ffffff',
  },
});

export default SplashScreen;