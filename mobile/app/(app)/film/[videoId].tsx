import React from 'react';
import { View, StyleSheet } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useEvent } from 'expo';
import { useVideoPlayer, VideoView } from 'expo-video';
import {
  Screen,
  TopBar,
  Text,
  Card,
  Section,
  Button,
  Row,
  StatusBadge,
  ScoreBlock,
  ProcessingTimeline,
  ErrorState,
  Skeleton,
  useToast,
} from '@/components';
import type { TimelineStep } from '@/components';
import { useTheme } from '@/theme/ThemeProvider';
import { useFilmDetail, useVideoStatus } from '@/hooks/queries';
import { useSignedVideoUrl } from '@/features/film/useSignedVideoUrl';
import { videoStatusView } from '@/utils/status';
import { formatTimecode, relativeTime } from '@/utils/time';
import { canWrite } from '@/utils/roles';
import { retryVideo } from '@/lib/api/endpoints';

const PIPELINE = ['Preparing film', 'Extracting frames', 'Building timeline', 'Finding plays', 'Analyzing assignments', 'Creating report'];

export default function FilmDetailScreen() {
  const theme = useTheme();
  const router = useRouter();
  const toast = useToast();
  const { videoId } = useLocalSearchParams<{ videoId: string }>();
  const detail = useFilmDetail(videoId);

  const video = detail.data?.video;
  const statusView = videoStatusView(video?.status, video?.processing_status);
  // Poll status only while active.
  useVideoStatus(videoId, statusView.isActive);

  const signed = useSignedVideoUrl(video?.storage_path);
  const player = useVideoPlayer(signed.data ?? null, (p) => {
    p.muted = false; // no autoplay — player starts paused by default
  });
  const { status: playerStatus } = useEvent(player, 'statusChange', { status: player.status });

  const writable = canWrite(detail.data?.role);

  return (
    <>
      <TopBar title="Film" />
      <Screen refreshing={detail.isRefetching} onRefresh={() => detail.refetch()}>
        {detail.isLoading ? (
          <View style={{ marginTop: 12, gap: 12 }}>
            <Skeleton height={200} radius={16} />
            <Skeleton height={60} radius={12} />
          </View>
        ) : detail.isError || !video ? (
          <ErrorState message="We couldn’t load this film." onRetry={() => detail.refetch()} />
        ) : (
          <View style={{ marginTop: 12 }}>
            {/* 1. Player */}
            <View style={[styles.playerWrap, { backgroundColor: '#000', borderRadius: theme.radius.lg }]}>
              {signed.data && playerStatus !== 'error' ? (
                <VideoView
                  player={player}
                  style={styles.player}
                  contentFit="contain"
                  allowsFullscreen
                  nativeControls
                />
              ) : (
                <View style={styles.playerFallback}>
                  <Text role="metadata" style={{ color: '#fff' }}>
                    {signed.isLoading ? 'Loading video…' : 'Video preview unavailable'}
                  </Text>
                </View>
              )}
            </View>

            <Text role="sectionTitle" style={{ marginTop: 14 }}>
              {video.title}
            </Text>
            <Row gap={8} style={{ marginTop: 6, flexWrap: 'wrap' }}>
              <StatusBadge status={statusView} />
              <Text role="metadata" color="textSecondary" tabular>
                {video.duration_seconds ? formatTimecode(video.duration_seconds) : ''} · {relativeTime(video.created_at)}
              </Text>
            </Row>

            {/* 2. Processing / evidence status */}
            {statusView.isActive ? (
              <Section title="Processing">
                <Card>
                  <ProcessingTimeline steps={buildTimeline(video.processing_status)} />
                </Card>
              </Section>
            ) : null}

            {video.status === 'failed' ? (
              <Section title="Needs attention">
                <Card>
                  <Text role="body" style={{ color: theme.colors.error }}>
                    {video.error_message ?? 'Processing failed.'}
                  </Text>
                  {writable ? (
                    <View style={{ marginTop: 12 }}>
                      <Button
                        label="Retry processing"
                        variant="secondary"
                        onPress={async () => {
                          try {
                            await retryVideo(videoId);
                            toast('Retrying…', 'success');
                            detail.refetch();
                          } catch {
                            toast('Could not retry', 'error');
                          }
                        }}
                      />
                    </View>
                  ) : null}
                </Card>
              </Section>
            ) : null}

            {/* 3/4. Confirmed plays */}
            <Section
              title={`Plays (${detail.data?.plays.length ?? 0})`}
              action={
                writable ? (
                  <Text role="label" color="gold" onPress={() => router.push(`/(app)/film/${videoId}/plays`)}>
                    Confirm plays
                  </Text>
                ) : undefined
              }
            >
              {(detail.data?.plays.length ?? 0) === 0 ? (
                <Card>
                  <Text role="body" color="textSecondary">
                    No plays yet. {writable ? 'Confirm detected plays to enable per-play analysis.' : ''}
                  </Text>
                </Card>
              ) : (
                (detail.data?.plays ?? []).slice(0, 5).map((p) => (
                  <Card key={p.id} style={{ marginBottom: 8 }}>
                    <Row justify="space-between">
                      <Text role="label">
                        Play {p.sequence_number}
                        {p.coach_label ? ` · ${p.coach_label}` : ''}
                      </Text>
                      <Text role="metadata" color="textSecondary" tabular>
                        {formatTimecode(p.start_time_seconds)}–{formatTimecode(p.end_time_seconds)}
                      </Text>
                    </Row>
                  </Card>
                ))
              )}
            </Section>

            {/* 5. Run analysis */}
            {writable ? (
              <Section title="Run analysis">
                <Button
                  label="Choose a module"
                  onPress={() => router.push({ pathname: '/(app)/(tabs)/analyze' })}
                />
              </Section>
            ) : null}

            {/* 6. Existing reports */}
            {(detail.data?.analyses.length ?? 0) > 0 ? (
              <Section title="Reports">
                {(detail.data?.analyses ?? []).map((a) => (
                  <Card key={a.id} style={{ marginBottom: 8 }}>
                    <Row justify="space-between" align="flex-start">
                      <View style={{ flex: 1, paddingRight: 12 }}>
                        <Text role="label">{a.module_key ?? 'Analysis'}</Text>
                        <Text role="metadata" color="textSecondary" numberOfLines={2}>
                          {a.summary ?? '—'}
                        </Text>
                        <Text role="label" color="gold" style={{ marginTop: 6 }} onPress={() => router.push(`/(app)/analysis/${a.id}`)}>
                          Open report
                        </Text>
                      </View>
                      <ScoreBlock score={a.overall_score} size="sm" />
                    </Row>
                  </Card>
                ))}
              </Section>
            ) : null}
          </View>
        )}
      </Screen>
    </>
  );
}

function buildTimeline(step: string | null | undefined): TimelineStep[] {
  const idx = step ? PIPELINE.findIndex((s) => s.toLowerCase().includes((step ?? '').replace(/_/g, ' ').split(' ')[0] ?? '')) : 0;
  return PIPELINE.map((label, i) => ({
    label,
    state: i < idx ? 'done' : i === idx ? 'active' : 'pending',
  }));
}

const styles = StyleSheet.create({
  playerWrap: { aspectRatio: 16 / 9, overflow: 'hidden' },
  player: { width: '100%', height: '100%' },
  playerFallback: { flex: 1, alignItems: 'center', justifyContent: 'center' },
});
