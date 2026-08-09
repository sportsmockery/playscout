import React from 'react';
import { View, StyleSheet } from 'react-native';
import { useTheme } from '@/theme/ThemeProvider';
import { Text } from './Text';
import type { StatusView } from '@/utils/status';
import { scoreBand, confidenceView, sampleSizeLabel } from '@/utils/score';

function toneColor(tone: StatusView['tone'], theme: ReturnType<typeof useTheme>): string {
  switch (tone) {
    case 'active':
      return theme.colors.info;
    case 'success':
      return theme.colors.success;
    case 'warning':
      return theme.colors.warning;
    case 'error':
      return theme.colors.error;
    default:
      return theme.colors.textSecondary;
  }
}

export function StatusBadge({ status }: { status: StatusView }) {
  const theme = useTheme();
  const color = toneColor(status.tone, theme);
  return (
    <View style={[styles.badge, { borderColor: color, backgroundColor: color + '18' }]}>
      {status.isActive ? <View style={[styles.dot, { backgroundColor: color }]} /> : null}
      <Text role="metadata" style={{ color }}>
        {status.label}
      </Text>
    </View>
  );
}

/** Confidence is shown apart from performance, always with the word + %. */
export function ConfidenceLabel({ confidence }: { confidence: number | null | undefined }) {
  const theme = useTheme();
  const view = confidenceView(confidence);
  if (!view) return null;
  const color =
    view.tone === 'high' ? theme.colors.success : view.tone === 'medium' ? theme.colors.warning : theme.colors.error;
  return (
    <View style={[styles.chip, { backgroundColor: theme.colors.fill }]}>
      <Text role="metadata" style={{ color }} tabular>
        {view.label} · {view.pct}%
      </Text>
    </View>
  );
}

/** "Based on N plays" grounding chip. */
export function EvidenceCount({ plays, frames }: { plays?: number | null; frames?: number | null }) {
  const theme = useTheme();
  const parts: string[] = [];
  if (plays != null) parts.push(sampleSizeLabel(plays));
  if (frames != null && frames > 0) parts.push(`${frames} frames`);
  if (parts.length === 0) return null;
  return (
    <View style={[styles.chip, { backgroundColor: theme.colors.fill }]}>
      <Text role="metadata" color="textSecondary" tabular>
        {parts.join(' · ')}
      </Text>
    </View>
  );
}

/** Number + verbal band, no color-only meaning. */
export function ScoreBlock({
  score,
  size = 'lg',
}: {
  score: number | null | undefined;
  size?: 'lg' | 'sm';
}) {
  const theme = useTheme();
  const band = scoreBand(score);
  const tone: Record<string, string> = {
    elite: theme.colors.success,
    advanced: theme.colors.success,
    solid: theme.colors.info,
    developing: theme.colors.warning,
    beginner: theme.colors.error,
  };
  const color = band ? tone[band.tone] : theme.colors.textSecondary;
  return (
    <View style={styles.scoreBlock}>
      <Text
        tabular
        style={{
          fontSize: size === 'lg' ? 40 : 24,
          lineHeight: size === 'lg' ? 44 : 28,
          fontWeight: '700',
          color: theme.colors.text,
        }}
      >
        {score != null ? Math.round(score) : '—'}
      </Text>
      {band ? (
        <Text role="label" style={{ color }}>
          {band.label}
        </Text>
      ) : (
        <Text role="metadata" color="textSecondary">
          Not scored
        </Text>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  badge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 999,
    borderWidth: StyleSheet.hairlineWidth,
    alignSelf: 'flex-start',
  },
  dot: { width: 6, height: 6, borderRadius: 3 },
  chip: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 999,
    alignSelf: 'flex-start',
  },
  scoreBlock: { alignItems: 'flex-start' },
});
