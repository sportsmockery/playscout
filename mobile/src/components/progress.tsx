import React from 'react';
import { View, StyleSheet } from 'react-native';
import { useTheme } from '@/theme/ThemeProvider';
import { Text } from './Text';
import { Row } from './layout';
import { formatBytes } from '@/utils/time';

/** Linear, truthful progress. 0..1. Never fake motion when idle. */
export function ProgressBar({ value }: { value: number }) {
  const theme = useTheme();
  const pct = Math.max(0, Math.min(1, value));
  return (
    <View style={[styles.track, { backgroundColor: theme.colors.fill }]}>
      <View
        style={[styles.fill, { backgroundColor: theme.colors.blue, width: `${pct * 100}%` }]}
      />
    </View>
  );
}

export function UploadProgress({
  progress,
  bytesUploaded,
  bytesTotal,
}: {
  progress: number;
  bytesUploaded?: number;
  bytesTotal?: number;
}) {
  const pct = Math.round(Math.max(0, Math.min(1, progress)) * 100);
  return (
    <View>
      <Row justify="space-between">
        <Text role="metadata" color="textSecondary" tabular>
          {bytesTotal ? `${formatBytes(bytesUploaded ?? 0)} of ${formatBytes(bytesTotal)}` : 'Uploading…'}
        </Text>
        <Text role="metadata" tabular>
          {pct}%
        </Text>
      </Row>
      <View style={{ height: 6 }} />
      <ProgressBar value={progress} />
    </View>
  );
}

export interface TimelineStep {
  label: string;
  state: 'done' | 'active' | 'pending' | 'failed';
}

/** Coach-friendly processing timeline. Shows real state per stage. */
export function ProcessingTimeline({ steps }: { steps: TimelineStep[] }) {
  const theme = useTheme();
  const color = (state: TimelineStep['state']) => {
    switch (state) {
      case 'done':
        return theme.colors.success;
      case 'active':
        return theme.colors.info;
      case 'failed':
        return theme.colors.error;
      default:
        return theme.colors.border;
    }
  };
  return (
    <View>
      {steps.map((step, i) => (
        <Row key={step.label} align="center" style={{ marginBottom: i === steps.length - 1 ? 0 : 10 }}>
          <View style={[styles.node, { borderColor: color(step.state), backgroundColor: step.state === 'pending' ? 'transparent' : color(step.state) }]} />
          <Text
            role={step.state === 'active' ? 'label' : 'body'}
            color={step.state === 'pending' ? 'textSecondary' : 'text'}
          >
            {step.label}
          </Text>
          {step.state === 'active' ? (
            <Text role="metadata" color="textSecondary">
              · in progress
            </Text>
          ) : null}
        </Row>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  track: { height: 6, borderRadius: 3, overflow: 'hidden' },
  fill: { height: '100%', borderRadius: 3 },
  node: { width: 12, height: 12, borderRadius: 6, borderWidth: 2 },
});
