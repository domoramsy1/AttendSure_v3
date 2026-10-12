import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { theme } from '../../constants/theme';

interface BadgeProps {
  label: string;
  variant?: 'success' | 'warning' | 'danger' | 'info' | 'neutral';
}

export function Badge({ label, variant = 'neutral' }: BadgeProps) {
  const stylesMap = {
    success: { bg: theme.colors.successLight, text: theme.colors.successDark },
    warning: { bg: theme.colors.warningLight, text: theme.colors.warningDark },
    danger: { bg: theme.colors.dangerLight, text: theme.colors.dangerDark },
    info: { bg: theme.colors.primaryLight, text: theme.colors.primaryHover },
    neutral: { bg: theme.colors.surfaceSubtle, text: theme.colors.textSecondary },
  };

  const current = stylesMap[variant];

  return (
    <View style={[styles.badge, { backgroundColor: current.bg }]}>
      <Text style={[styles.text, { color: current.text }]}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  badge: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: theme.borderRadius.sm,
    alignSelf: 'flex-start',
  },
  text: {
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 0.3,
  },
});