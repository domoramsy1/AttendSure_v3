// AttendSure Mobile - Screen Wrapper Component
// File: D:\AttendSure_V3\mobile\src\components\ScreenWrapper.tsx

import React from 'react';
import { View, ViewStyle } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import { useThemeMode } from '../context/ThemeContext';

interface ScreenWrapperProps {
  children: React.ReactNode;
  style?: ViewStyle;
}

export function ScreenWrapper({ children, style }: ScreenWrapperProps) {
  const { palette, spacing, isDark } = useThemeMode();

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: palette.background }} edges={['top', 'left', 'right']}>
      <StatusBar style={isDark ? 'light' : 'dark'} />
      <View style={[{ flex: 1, paddingHorizontal: spacing.md }, style]}>{children}</View>
    </SafeAreaView>
  );
}
