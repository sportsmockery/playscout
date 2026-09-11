import React, { useMemo, useState } from 'react';
import { View, Pressable, StyleSheet, Switch } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import {
  Screen,
  TopBar,
  Text,
  Card,
  Section,
  Button,
  Row,
  EmptyState,
  SegmentedControl,
  useToast,
} from '@/components';
import { useTheme } from '@/theme/ThemeProvider';
import { useFilm, useRoster, qk } from '@/hooks/queries';
import { useTeamStore } from '@/stores/teamStore';
import { moduleByKey } from '@/features/intelligence/modules';
import { canWrite, writeDeniedReason } from '@/utils/roles';
import { runAnalysis, queueBatch, runBatchQueue } from '@/lib/api/endpoints';
import { useQueryClient } from '@tanstack/react-query';
import { isAnalyzable } from '@/utils/status';

/**
 * Preflight before running a module.
 *
 * Film selection is multi-select because a coach's real unit of work is a film
 * session, not a clip. Exactly one already-processed clip runs inline and lands
 * on its report; anything else queues a batch and lands on the cumulative
 * report, which is where a 40-clip session is actually readable. That split
 * mirrors the web exactly — same routes, same rows, same worker.
 */
export default function ModulePreflight() {
  const theme = useTheme();
  const router = useRouter();
  const toast = useToast();
  const queryClient = useQueryClient();
  const { moduleKey } = useLocalSearchParams<{ moduleKey: string }>();
  const { activeTeam } = useTeamStore();
  const mod = moduleByKey(moduleKey ?? '');

  const [videoIds, setVideoIds] = useState<string[]>([]);
  const [playerId, setPlayerId] = useState<string | null>(null);
  const [running, setRunning] = useState(false);
  const [sideOfBall, setSideOfBall] = useState<'offense' | 'defense'>('offense');
  const [isScrimmage, setIsScrimmage] = useState(false);

  const film = useFilm(activeTeam?.id ?? null, 'self');
  const roster = useRoster(mod?.perPlayer || mod?.key === 'RANKERIQ' ? activeTeam?.id ?? null : null);

  const allFilms = useMemo(() => film.data?.pages.flatMap((p) => p.videos) ?? [], [film.data]);
  // Film still processing can be selected: the job parks at waiting_for_film
  // and runs when the worker finishes it. Only a failed upload is excluded.
  const selectableFilms = useMemo(() => allFilms.filter((v) => v.status !== 'failed'), [allFilms]);
  const readyNow = useMemo(
    () => new Set(allFilms.filter((v) => isAnalyzable(v.status)).map((v) => v.id)),
    [allFilms],
  );

  if (!mod || !activeTeam) {
    return (
      <>
        <TopBar title="Analyze" />
        <Screen>
          <EmptyState title="Module unavailable" message="This module isn’t available right now." />
        </Screen>
      </>
    );
  }

  const writable = canWrite(activeTeam.role);
  const needsPlayer = mod.perPlayer;
  const canRun = writable && videoIds.length > 0 && (!needsPlayer || !!playerId);
  // One already-processed clip is a report a coach can read now; everything
  // else is a session, and queueing keeps them out of a spinner.
  const runsInline = videoIds.length === 1 && !!videoIds[0] && readyNow.has(videoIds[0]);
  const isRanker = mod.key === 'RANKERIQ';
  const rosterHasNumbers = (roster.data?.players ?? []).some((p) => !!p.jersey_number);

  function toggleVideo(id: string) {
    setVideoIds((prev) => (prev.includes(id) ? prev.filter((v) => v !== id) : [...prev, id]));
  }

  function buildContext(): Record<string, unknown> {
    // Only what the device actually knows. The server loads the team row (and
    // the roster, which decides which jersey numbers may exist) itself — a
    // client must not be the source of truth for either.
    const team: Record<string, unknown> = { name: activeTeam!.name };
    if (activeTeam!.ageGroup) team.age_group = activeTeam!.ageGroup;
    if (activeTeam!.level) team.level = activeTeam!.level;
    const ctx: Record<string, unknown> = { team };
    if (isRanker) {
      // Pinnies and borrowed jerseys carry other players' numbers, so on
      // scrimmage film a roster "match" proves nothing about who is wearing it.
      ctx.filmConditions = isScrimmage ? 'scrimmage' : 'game';
      team.side_of_ball = sideOfBall;
    }
    return ctx;
  }

  async function onRun() {
    if (!canRun) return;
    setRunning(true);
    try {
      if (runsInline) {
        const res = await runAnalysis({
          moduleKey: mod!.key,
          teamId: activeTeam!.id,
          videoId: videoIds[0],
          playerId: playerId ?? undefined,
          ...buildContext(),
        });
        router.replace(`/(app)/analysis/${res.analysisId}`);
        return;
      }

      const res = await queueBatch({
        teamId: activeTeam!.id,
        moduleKey: mod!.key,
        videoIds,
        playerId: playerId ?? undefined,
        title: `${mod!.name} — ${videoIds.length} clips`,
        context: buildContext(),
      });
      queryClient.invalidateQueries({ queryKey: qk.batches(activeTeam!.id) });
      queryClient.invalidateQueries({ queryKey: qk.activeBatches });
      // Start it moving now rather than waiting on the worker's poll. This
      // runs for minutes, so it is deliberately not awaited — the batch screen
      // reads progress from the database either way.
      runBatchQueue(activeTeam!.id).catch(() => {});
      router.replace(`/(app)/analysis/batch/${res.batchId}`);
    } catch (e) {
      toast(e instanceof Error ? e.message : 'Analysis failed', 'error');
    } finally {
      setRunning(false);
    }
  }

  return (
    <>
      <TopBar title={mod.name} />
      <Screen>
        <Card style={{ marginTop: 12 }}>
          <Text role="body" color="textSecondary">
            {mod.blurb}
          </Text>
        </Card>

        {!writable ? (
          <Card style={{ marginTop: 12, borderColor: theme.colors.warning }}>
            <Text role="body">{writeDeniedReason(activeTeam.role)}</Text>
          </Card>
        ) : null}

        {isRanker ? (
          <Section title="How this film was shot">
            <Card>
              <Text role="label">Which unit are you grading?</Text>
              <View style={{ marginTop: 8 }}>
                <SegmentedControl
                  segments={[
                    { value: 'offense', label: 'Offense' },
                    { value: 'defense', label: 'Defense' },
                  ]}
                  value={sideOfBall}
                  onChange={(v) => setSideOfBall(v as 'offense' | 'defense')}
                />
              </View>
              <Row justify="space-between" style={{ marginTop: 16 }}>
                <View style={{ flex: 1, paddingRight: 12 }}>
                  <Text role="label">Scrimmage or practice film</Text>
                  <Text role="metadata" color="textSecondary" style={{ marginTop: 2 }}>
                    Pinnies and borrowed jerseys carry other players’ numbers, so no
                    number is claimed from this film at all.
                  </Text>
                </View>
                <Switch value={isScrimmage} onValueChange={setIsScrimmage} />
              </Row>
              {!isScrimmage && !rosterHasNumbers ? (
                <View style={{ marginTop: 12 }}>
                  <Text role="metadata" color="textSecondary">
                    No jersey numbers are on this roster, so every player will be graded
                    by role instead. Add numbers on the roster to unlock player-level
                    grades.
                  </Text>
                </View>
              ) : null}
            </Card>
          </Section>
        ) : null}

        <Section title={`Film${videoIds.length ? ` · ${videoIds.length} selected` : ''}`}>
          {selectableFilms.length === 0 ? (
            <Card>
              <Text role="body" color="textSecondary">
                No film yet. Upload film first, then come back to analyze it.
              </Text>
            </Card>
          ) : (
            <>
              {selectableFilms.map((v) => (
                <SelectableRow
                  key={v.id}
                  label={v.title}
                  note={readyNow.has(v.id) ? undefined : 'Still processing — will run when ready'}
                  selected={videoIds.includes(v.id)}
                  onPress={() => toggleVideo(v.id)}
                />
              ))}
              {film.hasNextPage ? (
                <Button
                  label={film.isFetchingNextPage ? 'Loading…' : 'Load more film'}
                  variant="secondary"
                  onPress={() => film.fetchNextPage()}
                  loading={film.isFetchingNextPage}
                />
              ) : null}
            </>
          )}
        </Section>

        {needsPlayer ? (
          <Section title="Player">
            {(roster.data?.players.length ?? 0) === 0 ? (
              <Card>
                <Text role="body" color="textSecondary">
                  Add players to the roster to grade an individual.
                </Text>
              </Card>
            ) : (
              (roster.data?.players ?? []).map((p) => (
                <SelectableRow
                  key={p.id}
                  label={`${p.jersey_number != null ? `#${p.jersey_number} ` : ''}${p.first_name ?? ''} ${p.last_name ?? ''}`.trim()}
                  selected={p.id === playerId}
                  onPress={() => setPlayerId(p.id)}
                />
              ))
            )}
          </Section>
        ) : null}

        <Section title="Summary">
          <Card>
            <SummaryRow k="Team" v={activeTeam.name} />
            <SummaryRow k="Module" v={mod.name} />
            <SummaryRow
              k="Film"
              v={videoIds.length === 0 ? 'Not selected' : `${videoIds.length} clip${videoIds.length === 1 ? '' : 's'}`}
            />
            {needsPlayer ? (
              <SummaryRow
                k="Player"
                v={
                  roster.data?.players.find((p) => p.id === playerId)
                    ? `${roster.data.players.find((p) => p.id === playerId)?.first_name ?? ''}`.trim() || 'Selected'
                    : 'Not selected'
                }
              />
            ) : null}
            <SummaryRow
              k="How it runs"
              v={
                videoIds.length === 0
                  ? '—'
                  : runsInline
                    ? 'Now — report opens when it lands'
                    : 'Queued — you can leave this screen'
              }
            />
            <SummaryRow k="Permission" v={writable ? 'You can run this' : 'Read-only'} />
          </Card>
        </Section>

        <View style={{ marginTop: 8 }}>
          <Button
            label={
              running
                ? runsInline
                  ? 'Analyzing…'
                  : 'Queueing…'
                : videoIds.length > 1
                  ? `Analyze ${videoIds.length} clips`
                  : 'Run analysis'
            }
            onPress={onRun}
            loading={running}
            disabled={!canRun}
          />
          {!runsInline && videoIds.length > 0 ? (
            <Text role="metadata" color="textSecondary" align="center" style={{ marginTop: 8 }}>
              Analysis keeps running if you close the app. You’ll get one combined report.
            </Text>
          ) : null}
        </View>
      </Screen>
    </>
  );
}

function SelectableRow({
  label,
  note,
  selected,
  onPress,
}: {
  label: string;
  note?: string;
  selected: boolean;
  onPress: () => void;
}) {
  const theme = useTheme();
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="checkbox"
      accessibilityState={{ checked: selected }}
      accessibilityLabel={note ? `${label}. ${note}` : label}
      style={[
        styles.row,
        {
          backgroundColor: theme.colors.surface,
          borderColor: selected ? theme.colors.gold : theme.colors.border,
          borderWidth: selected ? 1.5 : StyleSheet.hairlineWidth,
          borderRadius: theme.radius.md,
        },
      ]}
    >
      <View style={{ flex: 1 }}>
        <Text role="body" numberOfLines={1}>
          {label}
        </Text>
        {note ? (
          <Text role="metadata" color="textSecondary" style={{ marginTop: 2 }}>
            {note}
          </Text>
        ) : null}
      </View>
      {selected ? <Text style={{ color: theme.colors.gold, fontSize: 16 }}>✓</Text> : null}
    </Pressable>
  );
}

function SummaryRow({ k, v }: { k: string; v: string }) {
  return (
    <Row justify="space-between" style={{ paddingVertical: 6 }} align="flex-start">
      <Text role="metadata" color="textSecondary">
        {k}
      </Text>
      <Text role="label" style={{ flex: 1, textAlign: 'right', marginLeft: 12 }} numberOfLines={1}>
        {v}
      </Text>
    </Row>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', padding: 12, marginBottom: 8 },
});
