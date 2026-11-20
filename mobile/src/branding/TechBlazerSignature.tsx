/**
 * AttendSure Mobile - TechBlazer Signature Wrapper
 * File: mobile/src/branding/TechBlazerSignature.tsx
 */

import React from 'react';
import type { StyleProp, ViewStyle } from 'react-native';
import { TechBlazerSignature as BrandTechBlazerSignature } from './BrandLogos';
import { useThemeMode } from '../context/ThemeContext';

export interface TechBlazerSignatureProps {
  size?: number;
  style?: StyleProp<ViewStyle>;
}

export const TechBlazerSignature: React.FC<TechBlazerSignatureProps> = ({
  size = 22,
  style,
}) => {
  // Ensure re-render on theme mode changes while delegating rendering to BrandLogos
  useThemeMode();

  return <BrandTechBlazerSignature size={size} style={style} />;
};

export default TechBlazerSignature;
