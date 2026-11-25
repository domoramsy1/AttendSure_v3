/**
 * AttendSure Mobile - Centralized Brand Logo Components
 * File: mobile/src/branding/BrandLogos.tsx
 */

import React from 'react';
import { View, Text, StyleSheet, type StyleProp, type ViewStyle } from 'react-native';
import { Image } from 'expo-image';
import { useThemeMode } from '../context/ThemeContext';

// Crisp local PNG asset (renders immediately across Android, iOS, and Web without SVG filter lag)
export const ATTENDSURE_LOGO_ASSET = require('../../assets/AttendSureLogo.png');

export interface AttendSureLogoProps {
  size?: number;
  style?: StyleProp<ViewStyle>;
}

export const AttendSureLogo: React.FC<AttendSureLogoProps> = ({ size = 48, style }) => {
  const { palette } = useThemeMode();

  return (
    <View
      style={[
        styles.logoCircle,
        {
          width: size,
          height: size,
          borderRadius: size / 2,
          borderColor: palette.border,
          borderWidth: palette.isDark ? 1 : 0,
        },
        style,
      ]}
    >
      <Image
        source={ATTENDSURE_LOGO_ASSET}
        style={{ width: Math.round(size * 0.84), height: Math.round(size * 0.84) }}
        contentFit="contain"
        priority="high"
        cachePolicy="memory-disk"
      />
    </View>
  );
};

export interface TechBlazerLogoProps {
  width?: number;
  height?: number;
  style?: StyleProp<ViewStyle>;
}

export const TechBlazerLogo: React.FC<TechBlazerLogoProps> = ({ style }) => {
  const { palette } = useThemeMode();

  return (
    <View style={[styles.wordmarkWrap, style]}>
      <Text style={[styles.wordmarkText, { color: palette.textPrimary }]}>TechBlazer</Text>
    </View>
  );
};

export interface TechBlazerSignatureProps {
  size?: number;
  style?: StyleProp<ViewStyle>;
}

export const TechBlazerSignature: React.FC<TechBlazerSignatureProps> = ({
  size = 22,
  style,
}) => {
  const { palette } = useThemeMode();

  return (
    <View style={[styles.signatureContainer, style]}>
      <Text style={[styles.fromText, { color: palette.textMuted }]}>from</Text>
      <View style={styles.brandRow}>
        <Text style={[styles.brandText, { fontSize: size, color: palette.textPrimary }]}>
          TECHBLAZER
        </Text>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  logoCircle: {
    backgroundColor: '#ffffff',
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  wordmarkWrap: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  wordmarkText: {
    fontSize: 12,
    fontWeight: '800',
    letterSpacing: 0.4,
  },
  signatureContainer: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  fromText: {
    fontSize: 11,
    marginBottom: 3,
    textTransform: 'lowercase',
    letterSpacing: 0.5,
  },
  brandRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  brandText: {
    fontWeight: '800',
    letterSpacing: 2.5,
  },
});

export default {
  AttendSureLogo,
  TechBlazerLogo,
  TechBlazerSignature,
};
