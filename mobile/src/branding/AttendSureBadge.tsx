// AttendSure Mobile - Attend Sure Badge
// File: D:\AttendSure_V3\mobile\src\branding\AttendSureBadge.tsx

/**
 * AttendSure Mobile - Animated Brand Badge
 * File: mobile/src/branding/AttendSureBadge.tsx
 */

import React, { useEffect, useRef } from 'react';
import { StyleSheet, Animated, type StyleProp, type ViewStyle } from 'react-native';
import { AttendSureLogo } from './BrandLogos';
import { useThemeMode } from '../context/ThemeContext';

export interface AttendSureBadgeProps {
  size?: number;
  animate?: boolean;
  style?: StyleProp<ViewStyle>;
}

export const AttendSureBadge: React.FC<AttendSureBadgeProps> = ({
  size = 96,
  animate = false,
  style,
}) => {
  const { palette } = useThemeMode();
  const scaleAnim = useRef(new Animated.Value(1)).current;
  const iconSize = Math.round(size * 0.62);

  useEffect(() => {
    if (!animate) {
      scaleAnim.setValue(1);
      return;
    }

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
    return () => {
      breatheAnimation.stop();
    };
  }, [animate, scaleAnim]);

  return (
    <Animated.View
      style={[
        styles.badgeContainer,
        {
          width: size,
          height: size,
          borderRadius: size / 2,
          borderColor: palette.borderStrong,
          shadowColor: palette.primary,
          transform: [{ scale: scaleAnim }],
        },
        style,
      ]}
    >
      <AttendSureLogo size={iconSize} style={{ borderWidth: 0 }} />
    </Animated.View>
  );
};

const styles = StyleSheet.create({
  badgeContainer: {
    backgroundColor: '#ffffff',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.18,
    shadowRadius: 10,
    elevation: 6,
    overflow: 'hidden',
  },
});

export default AttendSureBadge;
