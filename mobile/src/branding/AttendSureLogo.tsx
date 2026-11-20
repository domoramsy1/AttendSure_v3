/**
 * AttendSure Mobile - Brand Logo Wrapper
 * File: mobile/src/branding/AttendSureLogo.tsx
 */

import React from 'react';
import type { StyleProp, ViewStyle } from 'react-native';
import { AttendSureLogo as BrandAttendSureLogo } from './BrandLogos';
import { useThemeMode } from '../context/ThemeContext';

export interface AttendSureLogoProps {
  size?: number;
  style?: StyleProp<ViewStyle>;
}

export const AttendSureLogo: React.FC<AttendSureLogoProps> = ({ size = 48, style }) => {
  const { palette } = useThemeMode();

  return (
    <BrandAttendSureLogo
      size={size}
      style={[
        {
          borderColor: palette.border,
          borderWidth: palette.isDark ? 1 : 0,
        },
        style,
      ]}
    />
  );
};

export default AttendSureLogo;
