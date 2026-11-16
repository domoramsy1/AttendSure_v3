/**
 * AttendSure - Mobile Splash Screen
 * Uses verified PNG logo for crisp rendering upon Expo build.
 * File: mobile/src/components/SplashScreen.tsx
 */

import React, { useEffect, useState, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Animated,
  Platform,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import * as NativeSplashScreen from 'expo-splash-screen';
import { Image } from 'expo-image';

const LOGO_SOURCE = require('../../assets/AttendSureLogo.png');

interface SplashScreenProps {
  loading?: boolean;
  minDurationMs?: number;
  onFinish?: () => void;
}

export const SplashScreen: React.FC<SplashScreenProps> = ({
  loading = false,
  minDurationMs = 800,
  onFinish,
}) => {
  const [canExit, setCanExit] = useState(false);
  const [hidden, setHidden] = useState(false);

  const opacityAnim = useRef(new Animated.Value(1)).current;

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
    if (!loading && canExit) {
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

  if (hidden) return null;

  return (
    <Animated.View style={[styles.container, { opacity: opacityAnim }]}>
      <SafeAreaView style={styles.safeContainer} edges={['top', 'bottom']}>
        <StatusBar style="dark" />

        {/* Empty top spacing */}
        <View style={styles.topSpacer} />

        {/* Center Product Emblem: Guaranteed AttendSure Logo PNG */}
        <View style={styles.centerSection}>
          <View style={styles.emblemContainer}>
            <Image
              source={LOGO_SOURCE}
              style={{ width: 64, height: 64 }}
              contentFit="contain"
              priority="high"
              cachePolicy="memory-disk"
            />
          </View>
          <Text style={styles.brandTitle}>AttendSure</Text>
        </View>

        {/* Developer Corporate Signature at Bottom */}
        <View style={styles.footerSection}>
          <Text style={styles.signatureText}>System by TechBlazer</Text>
        </View>
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
    paddingVertical: 20,
  },
  topSpacer: {
    height: 38,
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
    paddingBottom: 10,
  },
  signatureText: {
    fontSize: 11.5,
    fontWeight: '700',
    color: '#94a3b8',
    letterSpacing: 0.4,
  },
});

export default SplashScreen;