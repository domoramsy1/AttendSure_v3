/**
 * AttendSure Mobile - Centralized Brand Logo Components
 * File: mobile/src/branding/BrandLogos.tsx
 */

import React from 'react';
import { View, ViewStyle } from 'react-native';
import { Image } from 'expo-image';

const ATTENDSURE_SVG = require('../../assets/AttendSureLogo.svg');
const TECHBLAZER_SVG = require('../../assets/techblazer.svg');

interface LogoProps {
  size?: number;
  style?: ViewStyle;
}

export const AttendSureLogo: React.FC<LogoProps> = ({ size = 48, style }) => (
  <View
    style={[
      {
        width: size,
        height: size,
        borderRadius: size / 2,
        backgroundColor: '#ffffff',
        alignItems: 'center',
        justifyContent: 'center',
        overflow: 'hidden',
      },
      style,
    ]}
  >
    <Image source={ATTENDSURE_SVG} style={{ width: size, height: size }} contentFit="contain" />
  </View>
);

export const TechBlazerLogo: React.FC<{ width?: number; height?: number }> = ({
  width = 76,
  height = 16,
}) => <Image source={TECHBLAZER_SVG} style={{ width, height }} contentFit="contain" />;