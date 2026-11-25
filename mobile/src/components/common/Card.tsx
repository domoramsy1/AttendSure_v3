// AttendSure Mobile - Card
// File: D:\AttendSure_V3\mobile\src\components\common\Card.tsx

import React from 'react';
import { Text, View, ViewStyle } from 'react-native';
import { useThemeMode } from '../../context/ThemeContext';

interface CardProps {
  title?: string;
  subtitle?: string;
  rightAction?: React.ReactNode;
  children: React.ReactNode;
  style?: ViewStyle;
}

export function Card({ title, subtitle, rightAction, children, style }: CardProps) {
  const { palette, ui, fonts, spacing } = useThemeMode();

  return (
    <View style={[ui.card, style]}>
      {(title || rightAction) && (
        <View style={[ui.rowBetween, { marginBottom: spacing.sm, paddingBottom: spacing.xs, borderBottomWidth: 1, borderBottomColor: palette.border }]}>
          <View style={{ flex: 1 }}>
            {title && <Text style={{ fontSize: fonts.size.xs, fontWeight: fonts.weight.bold, color: palette.textSecondary, textTransform: 'uppercase' }}>{title}</Text>}
            {subtitle && <Text style={{ fontSize: fonts.size.xs, color: palette.textMuted, marginTop: 2 }}>{subtitle}</Text>}
          </View>
          {rightAction && <View>{rightAction}</View>}
        </View>
      )}
      <View>{children}</View>
    </View>
  );
}
