import React from 'react';
import { View, TextInput, StyleSheet, type TextInputProps, type ViewStyle } from 'react-native';
import { useTheme } from '@/theme/ThemeProvider';
import { Text } from './Text';

/**
 * A labelled text input.
 *
 * The styling here was duplicated inline on the sign-in screen; every form
 * added since would have copied it again. The label is a real <Text>, not a
 * placeholder, so it survives the field being filled in — a placeholder-only
 * label disappears exactly when a coach wants to check what they typed.
 */
export function Field({
  label,
  hint,
  error,
  containerStyle,
  ...inputProps
}: TextInputProps & {
  label: string;
  hint?: string;
  error?: string | null;
  containerStyle?: ViewStyle;
}) {
  const theme = useTheme();
  return (
    <View style={[{ marginBottom: 16 }, containerStyle]}>
      <Text role="label" style={{ marginBottom: 6 }}>
        {label}
      </Text>
      <TextInput
        placeholderTextColor={theme.colors.textSecondary}
        accessibilityLabel={label}
        {...inputProps}
        style={[
          {
            minHeight: 48,
            borderWidth: StyleSheet.hairlineWidth,
            paddingHorizontal: 14,
            fontSize: 16,
            color: theme.colors.text,
            backgroundColor: theme.colors.surface,
            borderColor: error ? theme.colors.error : theme.colors.border,
            borderRadius: theme.radius.md,
          },
          inputProps.style,
        ]}
      />
      {error ? (
        <Text role="metadata" style={{ color: theme.colors.error, marginTop: 4 }}>
          {error}
        </Text>
      ) : hint ? (
        <Text role="metadata" color="textSecondary" style={{ marginTop: 4 }}>
          {hint}
        </Text>
      ) : null}
    </View>
  );
}
