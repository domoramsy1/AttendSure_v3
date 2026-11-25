// AttendSure Mobile - Chip Row Component
// File: D:\AttendSure_V3\mobile\src\components\common\ChipRow.tsx

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
          numberOfLines={1}
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
    <View style={[styles.stripContainer, style]}>
      <ScrollView
        horizontal
        nestedScrollEnabled
        showsHorizontalScrollIndicator={false}
        style={styles.scrollStrip}
        contentContainerStyle={[styles.scrollContent, contentContainerStyle]}
      >
        {items}
      </ScrollView>
    </View>
  );
}

const createStyles = (palette: ThemePalette, fonts: ReturnType<typeof useThemeMode>['fonts']) =>
  StyleSheet.create({
    stripContainer: {
      flexGrow: 0,
      flexShrink: 0,
      width: '100%',
    },
    scrollStrip: {
      flexGrow: 0,
      flexShrink: 0,
    },
    scrollContent: {
      flexDirection: 'row',
      gap: 8,
      alignItems: 'center',
      paddingVertical: 2,
    },
    wrapRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
    chip: {
      minHeight: 34,
      paddingVertical: 7,
      paddingHorizontal: 12,
      borderRadius: 9,
      backgroundColor: palette.surfaceSubtle,
      borderWidth: 1,
      borderColor: palette.border,
      alignItems: 'center',
      justifyContent: 'center',
    },
    chipActive: {
      backgroundColor: palette.buttonBg,
      borderColor: palette.buttonBg,
    },
    chipText: {
      fontSize: fonts.xs,
      lineHeight: 16,
      fontWeight: fonts.weight.bold,
      color: palette.textSecondary,
      includeFontPadding: false,
      textAlignVertical: 'center',
    },
    chipTextActive: {
      color: palette.onPrimary,
    },
    tabBtn: {
      minHeight: 40,
      paddingVertical: 9,
      paddingHorizontal: 14,
      borderRadius: 10,
      backgroundColor: palette.surface,
      borderWidth: 1,
      borderColor: palette.border,
      alignItems: 'center',
      justifyContent: 'center',
    },
    tabBtnActive: {
      backgroundColor: palette.buttonBg,
      borderColor: palette.buttonBg,
    },
    tabText: {
      fontSize: fonts.xs,
      lineHeight: 16,
      fontWeight: fonts.weight.extrabold,
      color: palette.textSecondary,
      includeFontPadding: false,
      textAlignVertical: 'center',
    },
    tabTextActive: {
      color: palette.onPrimary,
    },
  });

export default ChipRow;
