// AttendSure Mobile - Splash Screen Component
// File: D:\AttendSure_V3\mobile\src\components\SplashScreen.tsx

/**
 * AttendSure Mobile - Seamless Branded Splash Screen
 * File: mobile/src/components/SplashScreen.tsx
 */

import React, { useEffect, useState, useRef, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Animated,
  Easing,
  Platform,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import * as ExpoSplashScreen from 'expo-splash-screen';
import { getServerBaseUrl } from '../services/configService';
import { AttendSureLogo } from '../branding/BrandLogos';
import { useThemeMode } from '../context/ThemeContext';
import { QR_COLORS } from '../constants/theme';

export interface SplashScreenProps {
  loading?: boolean;
  minDurationMs?: number;
  maxDurationMs?: number;
  onFinish?: () => void;
}

interface SpiralDotSpec {
  index: number;
  angleDeg: string;
  inputRange: number[];
  outputScale: number[];
  outputOpacity: number[];
}

// Precomputed once at module load for smooth 60 FPS startup rendering
const SPIRAL_DOT_SPECS: readonly SpiralDotSpec[] = Array.from({ length: 8 }, (_, i) => {
  const phase = i / 8;
  const sortedInputs = [0, phase, (phase + 0.5) % 1, 1].sort((a, b) => a - b);
  const inputRange = Array.from(new Set(sortedInputs));
  const outputScale = inputRange.map((val) => {
    const dist = Math.abs(((val - phase + 1.5) % 1) - 0.5) * 2;
    return 1 - dist * 0.68;
  });
  const outputOpacity = inputRange.map((val) => {
    const dist = Math.abs(((val - phase + 1.5) % 1) - 0.5) * 2;
    return 1 - dist * 0.8;
  });
  return {
    index: i,
    angleDeg: `${i * 45}deg`,
    inputRange,
    outputScale,
    outputOpacity,
  };
});

export const SplashScreen: React.FC<SplashScreenProps> = ({
  loading = false,
  minDurationMs = 950,
  maxDurationMs = 3500,
  onFinish,
}) => {
  const { palette, isDark } = useThemeMode();
  const [canExit, setCanExit] = useState(false);
  const [forceExit, setForceExit] = useState(false);
  const [hidden, setHidden] = useState(false);

  const isMountedRef = useRef<boolean>(true);
  const nativeSplashHiddenRef = useRef<boolean>(false);
  const exitStartedRef = useRef<boolean>(false);

  const opacityAnim = useRef(new Animated.Value(1)).current;
  const radarWave1 = useRef(new Animated.Value(0)).current;
  const radarWave2 = useRef(new Animated.Value(0)).current;
  const radarSweep = useRef(new Animated.Value(0)).current;
  const spiralClock = useRef(new Animated.Value(0)).current;

  const hideNativeSplashOnce = useCallback(() => {
    if (Platform.OS === 'web' || nativeSplashHiddenRef.current) return;
    nativeSplashHiddenRef.current = true;
    try {
      Promise.resolve(ExpoSplashScreen.hideAsync()).catch(() => {});
    } catch {
      // Safe no-op if native splash is already hidden
    }
  }, []);

  useEffect(() => {
    isMountedRef.current = true;
    // Pre-warm fastest school server discovery in parallel during splash
    getServerBaseUrl().catch(() => {});

    // Fallback in case onLayout does not fire promptly
    const nativeFallback = setTimeout(hideNativeSplashOnce, 120);

    return () => {
      isMountedRef.current = false;
      clearTimeout(nativeFallback);
    };
  }, [hideNativeSplashOnce]);

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

  // Min and max splash duration timers
  useEffect(() => {
    const minTimer = setTimeout(() => {
      if (isMountedRef.current) {
        setCanExit(true);
      }
    }, minDurationMs);

    const maxTimer = setTimeout(() => {
      if (isMountedRef.current) {
        setForceExit(true);
      }
    }, Math.max(minDurationMs, maxDurationMs));

    return () => {
      clearTimeout(minTimer);
      clearTimeout(maxTimer);
    };
  }, [minDurationMs, maxDurationMs]);

  // Smooth fade-out once minimum duration completes and session hydration settles
  useEffect(() => {
    if (exitStartedRef.current) return;
    if ((!loading && canExit) || forceExit) {
      exitStartedRef.current = true;
      const fadeAnim = Animated.timing(opacityAnim, {
        toValue: 0,
        duration: 260,
        useNativeDriver: true,
      });
      fadeAnim.start(({ finished }) => {
        if (finished && isMountedRef.current) {
          setHidden(true);
          onFinish?.();
        }
      });
      return () => {
        fadeAnim.stop();
      };
    }
    return undefined;
  }, [loading, canExit, forceExit, onFinish, opacityAnim]);

  if (hidden) return null;

  const wave1Scale = radarWave1.interpolate({ inputRange: [0, 1], outputRange: [0.95, 1.85] });
  const wave1Opacity = radarWave1.interpolate({ inputRange: [0, 1], outputRange: [0.75, 0] });

  const wave2Scale = radarWave2.interpolate({ inputRange: [0, 1], outputRange: [0.95, 1.85] });
  const wave2Opacity = radarWave2.interpolate({ inputRange: [0, 1], outputRange: [0.75, 0] });

  const sweepRotate = radarSweep.interpolate({ inputRange: [0, 1], outputRange: ['0deg', '360deg'] });

  return (
    <Animated.View
      onLayout={hideNativeSplashOnce}
      style={[
        styles.container,
        { backgroundColor: palette.background, opacity: opacityAnim },
      ]}
    >
      <SafeAreaView style={styles.safeContainer} edges={['top', 'bottom']}>
        <StatusBar style={isDark ? 'light' : 'dark'} />

        <View style={styles.spacer} />

        {/* Center Circular Radar Logo + Spiral Loader */}
        <View style={styles.centerSection}>
          <View style={styles.radarContainer}>
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

            <View
              style={[
                styles.emblemCircle,
                {
                  backgroundColor: QR_COLORS.background,
                  borderColor: palette.primary,
                  shadowColor: palette.primary,
                },
              ]}
            >
              <AttendSureLogo size={64} style={{ borderWidth: 0 }} />
            </View>
          </View>

          <Text style={[styles.brandTitle, { color: palette.textPrimary }]}>AttendSure</Text>
          <Text style={[styles.brandSubtitle, { color: palette.textSecondary }]}>
            School Attendance System
          </Text>

          {/* 8-Dot Spiral Loading Spinner */}
          <View style={styles.spiralContainer} accessibilityLabel="Loading">
            {SPIRAL_DOT_SPECS.map((spec) => {
              const dotScale = spiralClock.interpolate({
                inputRange: spec.inputRange,
                outputRange: spec.outputScale,
              });
              const dotOpacity = spiralClock.interpolate({
                inputRange: spec.inputRange,
                outputRange: spec.outputOpacity,
              });

              return (
                <View
                  key={spec.index}
                  style={[styles.spiralArm, { transform: [{ rotate: spec.angleDeg }] }]}
                >
                  <Animated.View
                    style={[
                      styles.spiralDot,
                      {
                        backgroundColor: palette.primary,
                        transform: [{ scale: dotScale }],
                        opacity: dotOpacity,
                      },
                    ]}
                  />
                </View>
              );
            })}
          </View>
        </View>

        <View style={styles.spacer} />
      </SafeAreaView>
    </Animated.View>
  );
};

const styles = StyleSheet.create({
  container: {
    position: 'absolute',
    top: 0,
    right: 0,
    bottom: 0,
    left: 0,
    zIndex: 99999,
  },
  safeContainer: {
    flex: 1,
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingVertical: 16,
  },
  spacer: {
    height: 24,
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
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
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
    width: 42,
    height: 42,
    marginTop: 26,
    position: 'relative',
  },
  spiralArm: {
    position: 'absolute',
    top: 0,
    right: 0,
    bottom: 0,
    left: 0,
    alignItems: 'center',
  },
  spiralDot: {
    width: 7.5,
    height: 7.5,
    borderRadius: 3.75,
  },
});

export default SplashScreen;
