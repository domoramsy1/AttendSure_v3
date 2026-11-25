/**
 * AttendSure Mobile - Reusable Horizontal / Wrapped Filter & Picker Chip Row
 * File: mobile/src/components/common/ChipRow.tsx
 */

import React, { useMemo } from 'react';
import {
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
  type StyleProp,
  type ViewStyle,
} from 'react-native';
import { useThemeMode } from '../../context/ThemeContext';
import type { ThemePalette } from '../../constants/theme';

export interface ChipOption<T extends string | number = string> {
  key: T;
  label: string;
}

export interface ChipRowProps<T extends string | number = string> {
  options: ReadonlyArray<ChipOption<T>>;
  selected: T;
  onSelect: (key: T) => void;
  wrap?: boolean;
  variant?: 'chip' | 'tab';
  style?: StyleProp<ViewStyle>;
  contentContainerStyle?: StyleProp<ViewStyle>;
}

export function ChipRow<T extends string | number = string>({
  options,
  selected,
  onSelect,
  wrap = false,
  variant = 'chip',
  style,
  contentContainerStyle,
}: ChipRowProps<T>) {
  const { palette, fonts } = useThemeMode();
  const styles = useMemo(() => createStyles(palette, fonts), [palette, fonts]);

  const items = options.map((opt) => {
    const active = selected === opt.key;
    return (
      <TouchableOpacity
        key={String(opt.key)}
        style={[
          variant === 'tab' ? styles.tabBtn : styles.chip,
          active && (variant === 'tab' ? styles.tabBtnActive : styles.chipActive),
        ]}
        onPress={() => onSelect(opt.key)}
        activeOpacity={0.8}
      >
        <Text
          style={[
            variant === 'tab' ? styles.tabText : styles.chipText,
            active && (variant === 'tab' ? styles.tabTextActive : styles.chipTextActive),
          ]}
        >
          {opt.label}
        </Text>
      </TouchableOpacity>
    );
  });

  if (wrap) {
    return <View style={[styles.wrapRow, style]}>{items}</View>;
  }

  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      style={[styles.scrollStrip, style]}
      contentContainerStyle={[styles.scrollContent, contentContainerStyle]}
    >
      {items}
    </ScrollView>
  );
}

const createStyles = (palette: ThemePalette, fonts: ReturnType<typeof useThemeMode>['fonts']) =>
  StyleSheet.create({
    scrollStrip: { flexGrow: 0 },
    scrollContent: { gap: 6, alignItems: 'center' },
    wrapRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
    chip: {
      paddingVertical: 6,
      paddingHorizontal: 11,
      borderRadius: 8,
      backgroundColor: palette.surfaceSubtle,
      borderWidth: 1,
      borderColor: palette.border,
    },
    chipActive: {
      backgroundColor: palette.buttonBg,
      borderColor: palette.buttonBg,
    },
    chipText: {
      fontSize: fonts.xs,
      fontWeight: fonts.weight.bold,
      color: palette.textSecondary,
    },
    chipTextActive: {
      color: palette.onPrimary,
    },
    tabBtn: {
      paddingVertical: 8,
      paddingHorizontal: 12,
      borderRadius: 10,
      backgroundColor: palette.surface,
      borderWidth: 1,
      borderColor: palette.border,
    },
    tabBtnActive: {
      backgroundColor: palette.buttonBg,
      borderColor: palette.buttonBg,
    },
    tabText: {
      fontSize: fonts.xs,
      fontWeight: fonts.weight.extrabold,
      color: palette.textSecondary,
    },
    tabTextActive: {
      color: palette.onPrimary,
    },
  });

export default ChipRow;
