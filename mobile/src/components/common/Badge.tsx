import React from 'react';
import { Text, View } from 'react-native';
import { useThemeMode } from '../../context/ThemeContext';

interface BadgeProps {
  label: string;
  variant?: 'success' | 'warning' | 'danger' | 'info' | 'neutral';
}

export function Badge({ label, variant = 'neutral' }: BadgeProps) {
  const { palette, ui, fonts } = useThemeMode();

  const map = {
    success: { bg: palette.successLight, text: palette.success },
    warning: { bg: palette.warningLight, text: palette.warning },
    danger: { bg: palette.dangerLight, text: palette.danger },
    info: { bg: palette.infoLight, text: palette.info },
    neutral: { bg: palette.surfaceSubtle, text: palette.textSecondary },
  };
  const cur = map[variant];

  return (
    <View style={[ui.badge, { backgroundColor: cur.bg }]}>
      <Text style={{ fontSize: fonts.size.xs, fontWeight: fonts.weight.bold, color: cur.text }}>{label}</Text>
    </View>
  );
}