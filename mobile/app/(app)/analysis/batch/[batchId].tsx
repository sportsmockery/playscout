import React, { useState } from 'react';
import { View, Pressable, StyleSheet } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import {
  Screen,
  TopBar,
  Text,
  Card,
  Section,
  Row,
  Button,
  Divider,
  EmptyState,
  ErrorState,
  Skeleton,
  ProgressBar,
  StatusBadge,
  ScoreBlock,
  ConfirmationSheet,
  useToast,
} from '@/components';
import { useTheme } from '@/theme/ThemeProvider';
import { useBatch, qk } from '@/hooks/queries';
import { cancelBatch } from '@/lib/api/endpoints';
import { useQueryClient } from '@tanstack/react-query';
import { useTeamStore } from '@/stores/teamStore';
import { canWrite } from '@/utils/roles';
import type { PlayerRollup, BatchJob } from '@/types/domain';
import type { StatusView } from '@/utils/status';

/**
 * The cumulative report for a film session — the destination for a batch, not
 * the per-clip pages.
 *
 * A coach who queued 40 clips wants one film session, not 40 verdicts. The
 * numbers here (averages, how many clips a point repeats in, per-player grade
 * rollups) are computed server-side by aggregate-batch.ts and stored alongside
 * the narrative; nothing on this screen recomputes them, because a second
 * arithmetic path is a second answer.
 */
export default function BatchReport() {
  const { batchId } = useLocalSearchParams<{ batchId: string }>();
  const theme = useTheme();
  const router = useRouter();
  const toast = useToast();
  const queryClient = useQueryClient();
  const { activeTeam } = useTeamStore();
  const [confirmCancel, setConfirmCancel] = useState(false);
  const [cancelling, setCancelling] = useState(false);

  const { data, isLoading, error, refetch } = useBatch(batchId ?? '');
  const batch = data?.batch;
  const summary = batch?.summary ?? null;
  const aggregate = summary?.aggregate ?? null;

  if (isLoading) {
    return (
      <>
        <TopBar title="Film session" />
        <Screen>
          <Skeleton height={120} />
          <Skeleton height={220} style={{ marginTop: 12 }} />
        </Screen>
      </>
    );
  }

  if (error || !batch) {
    return (
      <>
        <TopBar title="Film session" />
        <Screen>
          <ErrorState
            message={error instanceof Error ? error.message : 'This film session could not be loaded.'}
            onRetry={refetch}
          />
        </Screen>
      </>
    );
  }

  const done = batch.completed_jobs + batch.failed_jobs;
  const stillRunning = batch.status === 'queued' || batch.status === 'running';
  const writable = canWrite(activeTeam?.role);

  async function onCancel() {
    setCancelling(true);
    try {
      await cancelBatch(batchId as string);
      queryClient.invalidateQueries({ queryKey: qk.batch(batchId as string) });
      queryClient.invalidateQueries({ queryKey: qk.activeBatches });
      toast('Film session stopped.', 'success');
    } catch (e) {
      toast(e instanceof Error ? e.message : 'Could not stop this session', 'error');
    } finally {
      setCancelling(false);
      setConfirmCancel(false);
    }
  }

  return (
    <>
      <TopBar title={batch.title ?? 'Film session'} />
      <Screen>
        {/* Progress first while work is in flight — that is the answer to the
            only question a coach has on a running batch. */}
        <Card style={{ marginTop: 12 }}>
          <Row justify="space-between">
            <Text role="label">{batch.module_key}</Text>
            <StatusBadge status={batchStatusView(batch.status)} />
          </Row>
          <View style={{ marginTop: 12 }}>
            <ProgressBar value={batch.total_jobs ? done / batch.total_jobs : 0} />
            <Text role="metadata" color="textSecondary" style={{ marginTop: 6 }}>
              {done} of {batch.total_jobs} clip{batch.total_jobs === 1 ? '' : 's'}
              {batch.failed_jobs > 0 ? ` · ${batch.failed_jobs} couldn’t be analyzed` : ''}
            </Text>
          </View>
          {stillRunning ? (
            <Text role="metadata" color="textSecondary" style={{ marginTop: 8 }}>
              This keeps running if you close the app. Come back any time.
            </Text>
          ) : null}
          {stillRunning && writable ? (
            <View style={{ marginTop: 12 }}>
              <Button label="Stop this session" variant="secondary" onPress={() => setConfirmCancel(true)} />
            </View>
          ) : null}
        </Card>

        {/* The narrative, once System A has written it. */}
        {batch.summary_status === 'completed' && summary ? (
          <>
            <Section title="What this film session showed">
              <Card>
                <Text role="sectionTitle">{summary.headline}</Text>
                <Text role="body" style={{ marginTop: 8 }}>
                  {summary.cumulative_summary}
                </Text>
                {aggregate ? (
                  <>
                    <View style={{ marginVertical: 12 }}>
                      <Divider />
                    </View>
                    <Row justify="space-between">
                      <Stat label="Clips" value={String(aggregate.clipsAnalyzed)} />
                      {aggregate.averageScore != null ? (
                        <View>
                          <Text role="metadata" color="textSecondary">
                            Average
                          </Text>
                          <ScoreBlock score={aggregate.averageScore} size="sm" />
                        </View>
                      ) : null}
                      {aggregate.playsObserved ? (
                        <Stat label="Plays seen" value={String(aggregate.playsObserved)} />
                      ) : null}
                    </Row>
                  </>
                ) : null}
                <Text role="metadata" color="textSecondary" style={{ marginTop: 12 }}>
                  {summary.evidence_note}
                </Text>
              </Card>
            </Section>

            {summary.what_repeats.length > 0 ? (
              <Section title="What repeats">
                {summary.what_repeats.map((r, i) => (
                  <Card key={i} style={{ marginBottom: 8 }}>
                    <Row justify="space-between" align="flex-start">
                      <Text role="label" style={{ flex: 1, paddingRight: 8 }}>
                        {r.pattern}
                      </Text>
                      <Text role="metadata" color="textSecondary">
                        {r.clips_seen} clip{r.clips_seen === 1 ? '' : 's'}
                      </Text>
                    </Row>
                    <Text role="body" color="textSecondary" style={{ marginTop: 6 }}>
                      {r.why_it_matters}
                    </Text>
                  </Card>
                ))}
              </Section>
            ) : null}

            {summary.priorities.length > 0 ? (
              <Section title="Fix these first">
                {summary.priorities.map((p, i) => (
                  <Card key={i} style={{ marginBottom: 8 }}>
                    <Row>
                      <Text role="label" style={{ color: theme.colors.gold, marginRight: 8 }}>
                        {i + 1}
                      </Text>
                      <Text role="label" style={{ flex: 1 }}>
                        {p.title}
                      </Text>
                    </Row>
                    <Text role="body" color="textSecondary" style={{ marginTop: 6 }}>
                      {p.why}
                    </Text>
                    <Text role="body" style={{ marginTop: 8 }}>
                      {p.fix}
                    </Text>
                  </Card>
                ))}
              </Section>
            ) : null}

            {aggregate?.playerRollup && aggregate.playerRollup.length > 0 ? (
              <Section title="Players">
                {aggregate.playerRollup.map((p) => (
                  <PlayerRow key={p.key} player={p} />
                ))}
              </Section>
            ) : null}

            {summary.practice_focus.length > 0 ? (
              <Section title="Practice this week">
                <Card>
                  {summary.practice_focus.map((f, i) => (
                    <Row key={i} align="flex-start" style={{ marginBottom: 6 }}>
                      <Text style={{ color: theme.colors.gold, marginRight: 8 }}>•</Text>
                      <Text role="body" style={{ flex: 1 }}>
                        {f}
                      </Text>
                    </Row>
                  ))}
                </Card>
              </Section>
            ) : null}
          </>
        ) : batch.summary_status === 'running' || batch.summary_status === 'pending' ? (
          <Card style={{ marginTop: 12 }}>
            <Text role="body" color="textSecondary">
              {stillRunning
                ? 'The combined report is written once every clip has been read.'
                : 'Writing the combined report…'}
            </Text>
          </Card>
        ) : batch.summary_status === 'failed' ? (
          <Card style={{ marginTop: 12, borderColor: theme.colors.warning }}>
            <Text role="label">The combined report couldn’t be written</Text>
            <Text role="body" color="textSecondary" style={{ marginTop: 6 }}>
              Each clip below was still analyzed and can be opened on its own.
            </Text>
          </Card>
        ) : null}

        {/* Every clip, always — including the ones that failed. A session that
            silently dropped a clip is a session a coach can't trust. */}
        <Section title={`Clips (${batch.jobs?.length ?? 0})`}>
          {(batch.jobs ?? []).length === 0 ? (
            <EmptyState title="No clips" message="This session has no film in it." />
          ) : (
            (batch.jobs ?? []).map((j) => {
              const comment = summary?.per_video.find((v) => v.video_id === j.video_id)?.comment;
              return (
                <ClipRow
                  key={j.id}
                  job={j}
                  comment={comment}
                  onPress={
                    j.analysis_result_id
                      ? () => router.push(`/(app)/analysis/${j.analysis_result_id}`)
                      : undefined
                  }
                />
              );
            })
          )}
        </Section>

        <View style={{ height: 24 }} />
      </Screen>

      <ConfirmationSheet
        visible={confirmCancel}
        title="Stop this film session?"
        message="Clips that haven't started will be cancelled. A clip already being analyzed will finish and keep its report."
        confirmLabel={cancelling ? 'Stopping…' : 'Stop session'}
        destructive
        onConfirm={onCancel}
        onClose={() => setConfirmCancel(false)}
      />
    </>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <View>
      <Text role="metadata" color="textSecondary">
        {label}
      </Text>
      <Text role="sectionTitle" style={{ marginTop: 2 }}>
        {value}
      </Text>
    </View>
  );
}

/**
 * A rollup row built from a role rather than a confirmed number can legitimately
 * cover more than one child, and the coach has to be told that — it is the
 * difference between "your left guard" and "this specific kid".
 */
function PlayerRow({ player }: { player: PlayerRollup }) {
  const byRole = player.identifiedBy === 'role';
  return (
    <Card style={{ marginBottom: 8 }}>
      <Row justify="space-between" align="flex-start">
        <View style={{ flex: 1, paddingRight: 12 }}>
          <Text role="label">{player.identifier}</Text>
          <Text role="metadata" color="textSecondary" style={{ marginTop: 2 }}>
            {player.positions.join(' · ')} · {player.reps} rep{player.reps === 1 ? '' : 's'}
          </Text>
        </View>
        <View style={{ alignItems: 'flex-end' }}>
          <ScoreBlock score={player.averageGrade} size="sm" />
          <Text role="metadata" color="textSecondary">
            {player.letter}
            {player.trend != null && player.trend !== 0
              ? ` · ${player.trend > 0 ? '↑' : '↓'} ${Math.abs(player.trend)}`
              : ''}
          </Text>
        </View>
      </Row>
      {byRole ? (
        <Text role="metadata" color="textSecondary" style={{ marginTop: 8 }}>
          Graded by position, not by number — this row may cover more than one player.
        </Text>
      ) : null}
    </Card>
  );
}

function ClipRow({
  job,
  comment,
  onPress,
}: {
  job: BatchJob;
  comment?: string;
  onPress?: () => void;
}) {
  const theme = useTheme();
  const failed = job.status === 'failed';
  return (
    <Pressable
      onPress={onPress}
      disabled={!onPress}
      accessibilityRole={onPress ? 'button' : undefined}
      style={[
        styles.clip,
        {
          backgroundColor: theme.colors.surface,
          borderColor: failed ? theme.colors.warning : theme.colors.border,
          borderRadius: theme.radius.md,
        },
      ]}
    >
      <Row justify="space-between" align="flex-start">
        <Text role="label" style={{ flex: 1, paddingRight: 8 }} numberOfLines={1}>
          {job.video_title}
        </Text>
        <StatusBadge status={jobStatusView(job.status)} />
      </Row>
      {comment ? (
        <Text role="body" color="textSecondary" style={{ marginTop: 6 }}>
          {comment}
        </Text>
      ) : null}
      {failed && job.error_message ? (
        <Text role="metadata" color="textSecondary" style={{ marginTop: 6 }}>
          {job.error_message}
        </Text>
      ) : null}
    </Pressable>
  );
}

function batchStatusLabel(s: string): string {
  switch (s) {
    case 'queued': return 'Queued';
    case 'running': return 'Analyzing';
    case 'completed': return 'Complete';
    case 'completed_with_errors': return 'Complete with errors';
    case 'failed': return 'Failed';
    case 'cancelled': return 'Stopped';
    default: return s;
  }
}

function batchStatusView(s: string): StatusView {
  const tone: StatusView['tone'] =
    s === 'running' ? 'active'
    : s === 'completed' ? 'success'
    : s === 'completed_with_errors' ? 'warning'
    : s === 'failed' ? 'error'
    : 'neutral';
  return { label: batchStatusLabel(s), tone, isActive: s === 'running' || s === 'queued' };
}

function jobStatusLabel(s: string): string {
  switch (s) {
    case 'queued': return 'Queued';
    case 'waiting_for_film': return 'Waiting for film';
    case 'running': return 'Analyzing';
    case 'completed': return 'Done';
    case 'failed': return 'Failed';
    case 'cancelled': return 'Stopped';
    default: return s;
  }
}

function jobStatusView(s: string): StatusView {
  const tone: StatusView['tone'] =
    s === 'running' ? 'active'
    : s === 'completed' ? 'success'
    : s === 'failed' ? 'error'
    : s === 'waiting_for_film' ? 'warning'
    : 'neutral';
  return { label: jobStatusLabel(s), tone, isActive: s === 'running' };
}

const styles = StyleSheet.create({
  clip: { padding: 12, marginBottom: 8, borderWidth: StyleSheet.hairlineWidth },
});
