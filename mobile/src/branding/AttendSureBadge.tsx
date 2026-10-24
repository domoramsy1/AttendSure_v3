// D:\AttendSure_V3\mobile\src\branding\AttendSureBadge.tsx

import React, { useEffect, useRef } from 'react';
import { View, StyleSheet, Animated } from 'react-native';
import { Image } from 'expo-image';

const getBadgeLogo = () => {
  try {
    return require('../../assets/attendsure-logo.png');
  } catch {
    try {
      return require('../../assets/icon.png');
    } catch {
      return null;
    }
  }
};

const LOGO_SOURCE = getBadgeLogo();

interface AttendSureBadgeProps {
  size?: number;
  animate?: boolean;
}

export const AttendSureBadge: React.FC<AttendSureBadgeProps> = ({
  size = 96,
  animate = false,
}) => {
  const scaleAnim = useRef(new Animated.Value(1)).current;
  const iconSize = Math.round(size * 0.58);

  useEffect(() => {
    if (!animate) return;

    const breatheAnimation = Animated.loop(
      Animated.sequence([
        Animated.timing(scaleAnim, {
          toValue: 1.05,
          duration: 1200,
          useNativeDriver: true,
        }),
        Animated.timing(scaleAnim, {
          toValue: 1,
          duration: 1200,
          useNativeDriver: true,
        }),
      ])
    );

    breatheAnimation.start();
    return () => breatheAnimation.stop();
  }, [animate, scaleAnim]);

  return (
    <Animated.View
      style={[
        styles.badgeContainer,
        {
          width: size,
          height: size,
          borderRadius: size / 2,
          transform: [{ scale: scaleAnim }],
        },
      ]}
    >
      {LOGO_SOURCE ? (
        <Image
          source={LOGO_SOURCE}
          style={{ width: iconSize, height: iconSize }}
          contentFit="contain"
        />
      ) : (
        <View style={{ width: iconSize, height: iconSize, backgroundColor: '#ffffff', borderRadius: iconSize / 2 }} />
      )}
    </Animated.View>
  );
};

const styles = StyleSheet.create({
  badgeContainer: {
    backgroundColor: '#004b87',
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#004b87',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.35,
    shadowRadius: 12,
    elevation: 8,
  },
});

export default AttendSureBadge;