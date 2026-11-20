/**
 * AttendSure Mobile - Centralized Brand Logo Components
 * File: mobile/src/branding/BrandLogos.tsx
 */

import React from 'react';
import { View, Text, StyleSheet, type StyleProp, type ViewStyle } from 'react-native';
import { Image } from 'expo-image';
import { useThemeMode } from '../context/ThemeContext';

export const ATTENDSURE_LOGO_ASSET = require('../../assets/AttendSureLogo.svg');
export const TECHBLAZER_LOGO_ASSET = require('../../assets/techblazer.svg');

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
        style={{ width: size, height: size }}
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

export const TechBlazerLogo: React.FC<TechBlazerLogoProps> = ({
  width = 76,
  height = 16,
  style,
}) => {
  const { palette } = useThemeMode();

  if (palette.isDark) {
    return (
      <View
        style={[
          styles.darkLogoPill,
          { borderColor: palette.border },
          style,
        ]}
      >
        <Image
          source={TECHBLAZER_LOGO_ASSET}
          style={{ width, height }}
          contentFit="contain"
          cachePolicy="memory-disk"
        />
      </View>
    );
  }

  return (
    <View style={style}>
      <Image
        source={TECHBLAZER_LOGO_ASSET}
        style={{ width, height }}
        contentFit="contain"
        cachePolicy="memory-disk"
      />
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
  darkLogoPill: {
    backgroundColor: '#ffffff',
    borderRadius: 6,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
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
