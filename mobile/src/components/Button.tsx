import React from 'react';
import {
  Pressable,
  ActivityIndicator,
  View,
  StyleSheet,
  type ViewStyle,
  AccessibilityState,
} from 'react-native';
import * as Haptics from 'expo-haptics';
import { useTheme } from '@/theme/ThemeProvider';
import { Text } from './Text';

type Variant = 'primary' | 'secondary' | 'destructive' | 'ghost';

interface ButtonProps {
  label: string;
  onPress: () => void;
  variant?: Variant;
  loading?: boolean;
  disabled?: boolean;
  icon?: React.ReactNode;
  fullWidth?: boolean;
  /** Selection/impact haptic on press. Default light impact for primary. */
  haptic?: Haptics.ImpactFeedbackStyle | null;
  style?: ViewStyle;
  accessibilityHint?: string;
}

export function Button({
  label,
  onPress,
  variant = 'primary',
  loading = false,
  disabled = false,
  icon,
  fullWidth = true,
  haptic,
  style,
  accessibilityHint,
}: ButtonProps) {
  const theme = useTheme();
  const isDisabled = disabled || loading;

  const bg: Record<Variant, string> = {
    primary: theme.colors.primary,
    secondary: theme.colors.surface,
    destructive: theme.colors.error,
    ghost: 'transparent',
  };
  const fg: Record<Variant, 'onPrimary' | 'text' | 'error'> = {
    primary: 'onPrimary',
    secondary: 'text',
    destructive: 'onPrimary',
    ghost: 'text',
  };

  const handlePress = () => {
    if (isDisabled) return;
    const impact = haptic === undefined ? Haptics.ImpactFeedbackStyle.Light : haptic;
    if (impact) Haptics.impactAsync(impact).catch(() => {});
    onPress();
  };

  const a11yState: AccessibilityState = { disabled: isDisabled, busy: loading };

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={a11yState}
      accessibilityLabel={label}
      accessibilityHint={accessibilityHint}
      onPress={handlePress}
      disabled={isDisabled}
      style={({ pressed }) => [
        styles.base,
        {
          minHeight: theme.hitTarget,
          borderRadius: theme.radius.md,
          backgroundColor: bg[variant],
          borderWidth: variant === 'secondary' ? StyleSheet.hairlineWidth : 0,
          borderColor: theme.colors.border,
          opacity: isDisabled ? 0.5 : pressed ? 0.85 : 1,
          alignSelf: fullWidth ? 'stretch' : 'flex-start',
          paddingHorizontal: fullWidth ? theme.spacing.base : theme.spacing.lg,
        },
        style,
      ]}
    >
      {loading ? (
        <ActivityIndicator color={variant === 'primary' || variant === 'destructive' ? theme.colors.onPrimary : theme.colors.text} />
      ) : (
        <View style={styles.content}>
          {icon ? <View style={{ marginRight: theme.spacing.sm }}>{icon}</View> : null}
          <Text role="label" color={fg[variant]}>
            {label}
          </Text>
        </View>
      )}
    </Pressable>
  );
}

interface IconButtonProps {
  onPress: () => void;
  children: React.ReactNode;
  accessibilityLabel: string;
  disabled?: boolean;
}

export function IconButton({ onPress, children, accessibilityLabel, disabled }: IconButtonProps) {
  const theme = useTheme();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      onPress={onPress}
      disabled={disabled}
      hitSlop={8}
      style={({ pressed }) => [
        styles.iconButton,
        {
          minWidth: theme.hitTarget,
          minHeight: theme.hitTarget,
          borderRadius: theme.radius.md,
          opacity: disabled ? 0.4 : pressed ? 0.6 : 1,
        },
      ]}
    >
      {children}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  base: { alignItems: 'center', justifyContent: 'center', paddingVertical: 12 },
  content: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center' },
  iconButton: { alignItems: 'center', justifyContent: 'center' },
});
