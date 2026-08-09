import React from 'react';
import { View, ScrollView, RefreshControl, StyleSheet, type ViewStyle } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme } from '@/theme/ThemeProvider';

interface ScreenProps {
  children: React.ReactNode;
  /** Scrollable is the default; pass false for full-height custom layouts (chat, video). */
  scroll?: boolean;
  refreshing?: boolean;
  onRefresh?: () => void;
  contentStyle?: ViewStyle;
  /** Respect the bottom safe area (tab bar handles it otherwise). */
  edgeBottom?: boolean;
}

/**
 * One primary vertical scroll region per screen. Applies theme background, safe
 * areas, and consistent 16pt gutters.
 */
export function Screen({
  children,
  scroll = true,
  refreshing = false,
  onRefresh,
  contentStyle,
  edgeBottom = false,
}: ScreenProps) {
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const bg = { backgroundColor: theme.colors.background };
  const padding: ViewStyle = {
    paddingHorizontal: theme.spacing.gutter,
    paddingBottom: edgeBottom ? insets.bottom + theme.spacing.base : theme.spacing.base,
  };

  if (!scroll) {
    return <View style={[styles.flex, bg, padding, contentStyle]}>{children}</View>;
  }

  return (
    <ScrollView
      style={[styles.flex, bg]}
      contentContainerStyle={[padding, contentStyle]}
      keyboardShouldPersistTaps="handled"
      refreshControl={
        onRefresh ? (
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            tintColor={theme.colors.textSecondary}
          />
        ) : undefined
      }
    >
      {children}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
});
