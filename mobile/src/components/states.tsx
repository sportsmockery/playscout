import React, { useEffect, useRef } from 'react';
import { View, StyleSheet, Animated, type ViewStyle, type DimensionValue } from 'react-native';
import { useTheme } from '@/theme/ThemeProvider';
import { Text } from './Text';
import { Button } from './Button';
import { relativeTime } from '@/utils/time';

export function EmptyState({
  title,
  message,
  actionLabel,
  onAction,
  icon,
}: {
  title: string;
  message?: string;
  actionLabel?: string;
  onAction?: () => void;
  icon?: React.ReactNode;
}) {
  const theme = useTheme();
  return (
    <View style={[styles.centered, { paddingVertical: theme.spacing.xxxl }]}>
      {icon ? <View style={{ marginBottom: theme.spacing.base }}>{icon}</View> : null}
      <Text role="sectionTitle" align="center">
        {title}
      </Text>
      {message ? (
        <Text role="body" color="textSecondary" align="center" style={{ marginTop: 8, maxWidth: 320 }}>
          {message}
        </Text>
      ) : null}
      {actionLabel && onAction ? (
        <View style={{ marginTop: theme.spacing.lg, alignSelf: 'stretch', maxWidth: 360 }}>
          <Button label={actionLabel} onPress={onAction} />
        </View>
      ) : null}
    </View>
  );
}

export function ErrorState({
  message,
  onRetry,
}: {
  message?: string;
  onRetry?: () => void;
}) {
  const theme = useTheme();
  return (
    <View style={[styles.centered, { paddingVertical: theme.spacing.xxxl }]}>
      <Text role="sectionTitle" align="center" style={{ color: theme.colors.error }}>
        Something went wrong
      </Text>
      <Text role="body" color="textSecondary" align="center" style={{ marginTop: 8, maxWidth: 320 }}>
        {message ?? 'We could not load this right now. Check your connection and try again.'}
      </Text>
      {onRetry ? (
        <View style={{ marginTop: theme.spacing.lg }}>
          <Button label="Try again" variant="secondary" fullWidth={false} onPress={onRetry} />
        </View>
      ) : null}
    </View>
  );
}

export function Skeleton({
  width = '100%',
  height = 16,
  radius,
  style,
}: {
  width?: DimensionValue;
  height?: number;
  radius?: number;
  style?: ViewStyle;
}) {
  const theme = useTheme();
  const opacity = useRef(new Animated.Value(0.4)).current;

  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(opacity, { toValue: 0.8, duration: 700, useNativeDriver: true }),
        Animated.timing(opacity, { toValue: 0.4, duration: 700, useNativeDriver: true }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [opacity]);

  return (
    <Animated.View
      style={[
        { width, height, borderRadius: radius ?? theme.radius.sm, backgroundColor: theme.colors.fill, opacity },
        style,
      ]}
    />
  );
}

export function OfflineBanner({ visible }: { visible: boolean }) {
  const theme = useTheme();
  if (!visible) return null;
  return (
    <View style={[styles.offline, { backgroundColor: theme.colors.warning }]}>
      <Text role="metadata" style={{ color: '#fff' }}>
        You&apos;re offline — showing the last saved data
      </Text>
    </View>
  );
}

/** "Updated 3 minutes ago" — freshness is always visible for cached reads. */
export function FreshnessLabel({ updatedAt }: { updatedAt: number | string | null | undefined }) {
  if (updatedAt == null) return null;
  const iso = typeof updatedAt === 'number' ? new Date(updatedAt).toISOString() : updatedAt;
  const rel = relativeTime(iso);
  if (!rel) return null;
  return (
    <Text role="metadata" color="textSecondary">
      Updated {rel}
    </Text>
  );
}

const styles = StyleSheet.create({
  centered: { alignItems: 'center', justifyContent: 'center', paddingHorizontal: 24 },
  offline: { paddingVertical: 6, alignItems: 'center' },
});
