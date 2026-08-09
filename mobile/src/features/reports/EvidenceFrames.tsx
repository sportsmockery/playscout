import React from 'react';
import { View, ScrollView, StyleSheet } from 'react-native';
import { Image } from 'expo-image';
import { Text, Skeleton } from '@/components';
import { useTheme } from '@/theme/ThemeProvider';
import { useVideoFrames } from '@/hooks/queries';

/**
 * Shows the specific frames that support a conclusion. Frames come from the
 * server as short-lived signed URLs (never logged, never cached to disk). We
 * only render the indices the analysis cited — evidence is always reachable but
 * never more than what was actually used.
 */
export function EvidenceFrames({
  videoId,
  frameIndices,
  compact,
}: {
  videoId: string;
  frameIndices: number[];
  compact?: boolean;
}) {
  const theme = useTheme();
  const { data, isLoading, isError } = useVideoFrames(videoId, frameIndices.length > 0);
  const size = compact ? 88 : 132;

  if (isLoading) {
    return (
      <View style={{ flexDirection: 'row', gap: 8 }}>
        {[0, 1, 2].map((i) => (
          <Skeleton key={i} width={size * 1.6} height={size} radius={10} />
        ))}
      </View>
    );
  }
  if (isError || !data) {
    return (
      <Text role="metadata" color="textSecondary">
        Frames are unavailable right now.
      </Text>
    );
  }

  const wanted = new Set(frameIndices);
  const frames = data.frames.filter((f) => wanted.has(f.frame_index));
  if (frames.length === 0) {
    return (
      <Text role="metadata" color="textSecondary">
        No frames cited for this item.
      </Text>
    );
  }

  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }}>
      {frames.map((f) => (
        <View key={f.frame_index}>
          <Image
            source={{ uri: f.url }}
            style={[styles.frame, { width: size * 1.6, height: size, borderColor: theme.colors.border }]}
            contentFit="cover"
            transition={150}
          />
          <Text role="metadata" color="textSecondary" tabular style={{ marginTop: 4 }}>
            Frame {f.frame_index + 1}
          </Text>
        </View>
      ))}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  frame: { borderRadius: 10, borderWidth: StyleSheet.hairlineWidth },
});
