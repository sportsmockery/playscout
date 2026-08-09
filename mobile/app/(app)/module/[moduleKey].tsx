import React, { useMemo, useState } from 'react';
import { View, Pressable, StyleSheet } from 'react-native';
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
  useToast,
} from '@/components';
import { useTheme } from '@/theme/ThemeProvider';
import { useFilm, useRoster } from '@/hooks/queries';
import { useTeamStore } from '@/stores/teamStore';
import { moduleByKey } from '@/features/intelligence/modules';
import { canWrite, writeDeniedReason } from '@/utils/roles';
import { runAnalysis } from '@/lib/api/endpoints';

/**
 * Preflight before running a module. Summarizes team, film, player (when
 * required), module, and whether the coach has write permission — nothing runs
 * until the scope is explicit. ScoutIQ and PlaybookIQ have their own flows and
 * are routed accordingly.
 */
export default function ModulePreflight() {
  const theme = useTheme();
  const router = useRouter();
  const toast = useToast();
  const { moduleKey } = useLocalSearchParams<{ moduleKey: string }>();
  const { activeTeam } = useTeamStore();
  const mod = moduleByKey(moduleKey ?? '');

  const [videoId, setVideoId] = useState<string | null>(null);
  const [playerId, setPlayerId] = useState<string | null>(null);
  const [running, setRunning] = useState(false);

  const film = useFilm(activeTeam?.id ?? null, 'self');
  const roster = useRoster(mod?.perPlayer ? activeTeam?.id ?? null : null);
  const readyFilms = useMemo(
    () =>
      (film.data?.pages.flatMap((p) => p.videos) ?? []).filter(
        (v) => v.status === 'ready_for_review' || v.status === 'analysis_complete' || v.status === 'partially_ready',
      ),
    [film.data],
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
  const canRun = writable && !!videoId && (!mod.perPlayer || !!playerId);

  async function onRun() {
    if (!canRun || !videoId) return;
    setRunning(true);
    try {
      const res = await runAnalysis({
        moduleKey: mod!.key,
        teamId: activeTeam!.id,
        videoId,
        playerId: playerId ?? undefined,
      });
      router.replace(`/(app)/analysis/${res.analysisId}`);
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

        <Section title="Film">
          {readyFilms.length === 0 ? (
            <Card>
              <Text role="body" color="textSecondary">
                No film is ready to analyze yet. Upload and process film first.
              </Text>
            </Card>
          ) : (
            readyFilms.slice(0, 8).map((v) => (
              <SelectableRow key={v.id} label={v.title} selected={v.id === videoId} onPress={() => setVideoId(v.id)} />
            ))
          )}
        </Section>

        {mod.perPlayer ? (
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
            <SummaryRow k="Film" v={readyFilms.find((v) => v.id === videoId)?.title ?? 'Not selected'} />
            {mod.perPlayer ? (
              <SummaryRow
                k="Player"
                v={
                  roster.data?.players.find((p) => p.id === playerId)
                    ? `${roster.data.players.find((p) => p.id === playerId)?.first_name ?? ''}`.trim() || 'Selected'
                    : 'Not selected'
                }
              />
            ) : null}
            <SummaryRow k="Evidence" v="Frames are pulled from the film automatically" />
            <SummaryRow k="Permission" v={writable ? 'You can run this' : 'Read-only'} />
          </Card>
        </Section>

        <View style={{ marginTop: 8 }}>
          <Button label={running ? 'Analyzing…' : 'Run analysis'} onPress={onRun} loading={running} disabled={!canRun} />
        </View>
      </Screen>
    </>
  );
}

function SelectableRow({ label, selected, onPress }: { label: string; selected: boolean; onPress: () => void }) {
  const theme = useTheme();
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="radio"
      accessibilityState={{ selected }}
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
      <Text role="body" style={{ flex: 1 }} numberOfLines={1}>
        {label}
      </Text>
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
