import React from 'react';
import { Text, TextInput, View, TextInputProps } from 'react-native';
import { useThemeMode } from '../../context/ThemeContext';

interface InputProps extends TextInputProps {
  label: string;
  error?: string;
}

export function Input({ label, error, style, ...rest }: InputProps) {
  const { palette, ui, fonts, spacing } = useThemeMode();

  return (
    <View style={{ marginBottom: spacing.md }}>
      <Text style={ui.label}>{label}</Text>
      <TextInput
        style={[
          ui.input,
          error ? { borderColor: palette.danger, backgroundColor: palette.dangerLight } : null,
          style,
        ]}
        placeholderTextColor={palette.textMuted}
        {...rest}
      />
      {error && <Text style={{ fontSize: fonts.size.xs, color: palette.danger, marginTop: 4 }}>{error}</Text>}
    </View>
  );
}