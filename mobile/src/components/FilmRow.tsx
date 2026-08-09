import React from 'react';
import { View, Pressable, StyleSheet } from 'react-native';
import { Image } from 'expo-image';
import { useTheme } from '@/theme/ThemeProvider';
import { Text } from './Text';
import { Row } from './layout';
import { StatusBadge } from './indicators';
import { ProgressBar } from './progress';
import { videoStatusView } from '@/utils/status';
import { formatTimecode, relativeTime } from '@/utils/time';
import type { Video } from '@/types/domain';

/** A single film row — thumbnail, title/opponent, date/duration, status,
 * progress when active, play counts, latest analysis, overflow. */
export function FilmRow({
  video,
  onPress,
  onOverflow,
  progress,
}: {
  video: Video;
  onPress: () => void;
  onOverflow?: () => void;
  progress?: number;
}) {
  const theme = useTheme();
  const status = videoStatusView(video.status, video.processing_status);

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${video.title}, ${status.label}`}
      onPress={onPress}
      style={({ pressed }) => [
        styles.root,
        {
          backgroundColor: theme.colors.surface,
          borderColor: theme.colors.border,
          borderRadius: theme.radius.lg,
          opacity: pressed ? 0.9 : 1,
        },
      ]}
    >
      <View style={[styles.thumb, { backgroundColor: theme.colors.fill }]}>
        {video.thumbnail_url ? (
          <Image source={{ uri: video.thumbnail_url }} style={styles.thumbImg} contentFit="cover" transition={150} />
        ) : (
          <Text role="metadata" color="textSecondary">
            {video.film_type === 'opponent' ? 'OPP' : 'FILM'}
          </Text>
        )}
        {video.duration_seconds ? (
          <View style={styles.durationTag}>
            <Text role="metadata" style={{ color: '#fff' }} tabular>
              {formatTimecode(video.duration_seconds)}
            </Text>
          </View>
        ) : null}
      </View>

      <View style={styles.body}>
        <Text role="label" numberOfLines={1}>
          {video.title}
        </Text>
        <Text role="metadata" color="textSecondary" style={{ marginTop: 2 }}>
          {relativeTime(video.created_at)}
          {video.confirmed_play_count != null
            ? ` · ${video.confirmed_play_count} plays confirmed`
            : video.play_count != null
              ? ` · ${video.play_count} plays detected`
              : ''}
        </Text>

        <Row style={{ marginTop: 8 }} gap={8}>
          <StatusBadge status={status} />
          {video.latest_analysis_at ? (
            <Text role="metadata" color="textSecondary">
              Analyzed {relativeTime(video.latest_analysis_at)}
            </Text>
          ) : null}
        </Row>

        {status.isActive && progress != null ? (
          <View style={{ marginTop: 8 }}>
            <ProgressBar value={progress} />
          </View>
        ) : null}
      </View>

      {onOverflow ? (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="More actions"
          hitSlop={10}
          onPress={onOverflow}
          style={styles.overflow}
        >
          <Text style={{ color: theme.colors.textSecondary, fontSize: 20 }}>⋯</Text>
        </Pressable>
      ) : null}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  root: {
    flexDirection: 'row',
    padding: 10,
    borderWidth: StyleSheet.hairlineWidth,
    marginBottom: 10,
    alignItems: 'flex-start',
  },
  thumb: {
    width: 96,
    height: 60,
    borderRadius: 8,
    overflow: 'hidden',
    alignItems: 'center',
    justifyContent: 'center',
  },
  thumbImg: { width: '100%', height: '100%' },
  durationTag: {
    position: 'absolute',
    right: 4,
    bottom: 4,
    backgroundColor: 'rgba(0,0,0,0.7)',
    paddingHorizontal: 5,
    paddingVertical: 1,
    borderRadius: 4,
  },
  body: { flex: 1, marginLeft: 12 },
  overflow: { paddingHorizontal: 6, paddingTop: 2 },
});
