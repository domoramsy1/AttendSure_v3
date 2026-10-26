// D:\AttendSure_V3\mobile\src\branding\AttendSureBadge.tsx

import React, { useEffect, useRef } from 'react';
import { StyleSheet, Animated } from 'react-native';
import { Image } from 'expo-image';

const LOGO_SOURCE = require('../../assets/attendsure-logo.svg');

interface AttendSureBadgeProps {
  size?: number;
  animate?: boolean;
}

export const AttendSureBadge: React.FC<AttendSureBadgeProps> = ({
  size = 96,
  animate = false,
}) => {
  const scaleAnim = useRef(new Animated.Value(1)).current;
  const iconSize = Math.round(size * 0.62);

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
      <Image
        source={LOGO_SOURCE}
        style={{ width: iconSize, height: iconSize }}
        contentFit="contain"
      />
    </Animated.View>
  );
};

const styles = StyleSheet.create({
  badgeContainer: {
    backgroundColor: '#ffffff',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: '#e2e8f0',
    shadowColor: '#004b87',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.18,
    shadowRadius: 10,
    elevation: 6,
    overflow: 'hidden',
  },
});

export default AttendSureBadge;