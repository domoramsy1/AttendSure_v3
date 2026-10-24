import React, { useEffect, useState, useRef } from 'react';
import { View, StyleSheet, Animated } from 'react-native';
// Corrected relative path from src/components/ to src/branding/
import AttendSureBadge from '../branding/AttendSureBadge';
import TechBlazerSignature from '../branding/TechBlazerSignature';

interface SplashScreenProps {
  loading: boolean;
  minDurationMs?: number;
  onFinish?: () => void;
}

export const SplashScreen: React.FC<SplashScreenProps> = ({
  loading,
  minDurationMs = 2500,
  onFinish,
}) => {
  const [canExit, setCanExit] = useState(false);
  const [hidden, setHidden] = useState(false);
  
  // Animated value for smooth native opacity fade-out
  const fadeAnim = useRef(new Animated.Value(1)).current;

  // Enforces minimum display duration on mobile boot
  useEffect(() => {
    const timer = setTimeout(() => {
      setCanExit(true);
    }, minDurationMs);
    return () => clearTimeout(timer);
  }, [minDurationMs]);

  // Triggers exit transition when data loading completes and minimum time passes
  useEffect(() => {
    if (!loading && canExit) {
      Animated.timing(fadeAnim, {
        toValue: 0,
        duration: 500, // 500ms fade-out transition
        useNativeDriver: true, // Optimizes performance using native threads
      }).start(() => {
        setHidden(true);
        if (onFinish) {
          onFinish();
        }
      });
    }
  }, [loading, canExit, onFinish, fadeAnim]);

  if (hidden) return null;

  return (
    <Animated.View style={[styles.container, { opacity: fadeAnim }]}>
      {/* Product Center Emblem */}
      <AttendSureBadge size={96} animate={true} />

      {/* Developer Corporate Signature */}
      <View style={styles.footerContainer}>
        <TechBlazerSignature size={22} />
      </View>
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
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#ffffff',
  },
  footerContainer: {
    position: 'absolute',
    bottom: 38,
    alignItems: 'center',
  },
});

export default SplashScreen;