// AttendSure Mobile - Button
// File: D:\AttendSure_V3\mobile\src\components\common\Button.tsx

import React from 'react';
import { Text, TouchableOpacity, ActivityIndicator, ViewStyle } from 'react-native';
import { useThemeMode } from '../../context/ThemeContext';

interface ButtonProps {
  title: string;
  onPress: () => void;
  variant?: 'primary' | 'secondary' | 'danger' | 'outline';
  loading?: boolean;
  disabled?: boolean;
  style?: ViewStyle;
}

export function Button({ title, onPress, variant = 'primary', loading = false, disabled = false, style }: ButtonProps) {
  const { palette, radius, spacing, fonts } = useThemeMode();

  const stylesMap = {
    primary: { bg: palette.buttonBg, text: palette.onPrimary, border: 'transparent' },
    danger: { bg: palette.dangerBg, text: palette.onPrimary, border: 'transparent' },
    secondary: { bg: palette.surfaceSubtle, text: palette.textPrimary, border: palette.border },
    outline: { bg: 'transparent', text: palette.textSecondary, border: palette.borderStrong },
  };
  const cfg = stylesMap[variant];

  return (
    <TouchableOpacity
      style={[
        {
          height: 44,
          borderRadius: radius.md,
          alignItems: 'center',
          justifyContent: 'center',
          paddingHorizontal: spacing.md,
          backgroundColor: cfg.bg,
          borderColor: cfg.border,
          borderWidth: cfg.border !== 'transparent' ? 1 : 0,
          opacity: disabled ? 0.5 : 1,
        },
        style,
      ]}
      onPress={onPress}
      disabled={disabled || loading}
      activeOpacity={0.8}
    >
      {loading ? (
        <ActivityIndicator color={cfg.text} size="small" />
      ) : (
        <Text style={{ fontSize: fonts.size.md, fontWeight: fonts.weight.bold, color: cfg.text }}>{title}</Text>
      )}
    </TouchableOpacity>
  );
}
