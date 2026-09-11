import React from 'react';
import { View, Pressable, StyleSheet } from 'react-native';
import { useRouter } from 'expo-router';
import { Screen, TopBar, Text, Section, Card, Row, EmptyState, ProgressBar, StatusBadge } from '@/components';
import { useTheme } from '@/theme/ThemeProvider';
import { useTeamStore } from '@/stores/teamStore';
import { MODULE_CATALOG, type ModuleDef } from '@/features/intelligence/modules';
import { AnalysisQueueBanner } from '@/features/analysis/AnalysisQueueBanner';
import { useBatches } from '@/hooks/queries';
import { relativeTime } from '@/utils/time';
import type { AnalysisBatch } from '@/types/domain';

/**
 * Analyze hub — grouped, progressive. Never a wall of seven equal tiles.
 * Modules route to a preflight screen that summarizes scope before any run.
 */
export default function AnalyzeScreen() {
  const router = useRouter();
  const { activeTeam } = useTeamStore();
  const batches = useBatches(activeTeam?.id ?? null);

  if (!activeTeam) {
    return (
      <>
        <TopBar showTeamSwitcher />
        <Screen>
          <EmptyState title="No team selected" message="Pick a team to run analysis." />
        </Screen>
      </>
    );
  }

  const groups: { title: string; group: ModuleDef['group'] }[] = [
    { title: 'Position development', group: 'position' },
    { title: 'Team patterns', group: 'team' },
    { title: 'Opponent scouting', group: 'opponent' },
    { title: 'Playbook', group: 'playbook' },
  ];

  return (
    <>
      <TopBar showTeamSwitcher />
      <Screen>
        <View style={{ marginTop: 12 }}>
          <AnalysisQueueBanner />
        </View>

        <Section title="Recommended" style={{ marginTop: 12 }}>
          <Card>
            <Text role="body" color="textSecondary">
              Open a film, confirm its plays, then run the module that fits what you want to
              coach. Team-wide modules can run across a whole game.
            </Text>
          </Card>
        </Section>

        {groups.map((g) => {
          const mods = MODULE_CATALOG.filter((m) => m.group === g.group);
          if (mods.length === 0) return null;
          return (
            <Section key={g.group} title={g.title}>
              {mods.map((m) => (
                <ModuleRow key={m.key} module={m} onPress={() => router.push(`/(app)/module/${m.key}`)} />
              ))}
            </Section>
          );
        })}

        {(batches.data?.batches.length ?? 0) > 0 ? (
          <Section title="Film sessions">
            {(batches.data?.batches ?? []).slice(0, 5).map((b) => (
              <BatchRow
                key={b.id}
                batch={b}
                onPress={() => router.push(`/(app)/analysis/batch/${b.id}`)}
              />
            ))}
          </Section>
        ) : null}

        <Section title="History">
          <Card>
            <Pressable
              accessibilityRole="button"
              onPress={() => router.push('/(app)/analysis/history')}
              style={{ paddingVertical: 4 }}
            >
              <Text role="label" color="gold">
                View all saved analyses
              </Text>
            </Pressable>
          </Card>
        </Section>
      </Screen>
    </>
  );
}

function BatchRow({ batch, onPress }: { batch: AnalysisBatch; onPress: () => void }) {
  const theme = useTheme();
  const done = batch.completed_jobs + batch.failed_jobs;
  const live = batch.status === 'queued' || batch.status === 'running';
  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      style={[
        styles.row,
        { backgroundColor: theme.colors.surface, borderColor: theme.colors.border, borderRadius: theme.radius.lg },
      ]}
    >
      <View style={{ flex: 1 }}>
        <Row justify="space-between">
          <Text role="label" numberOfLines={1} style={{ flex: 1, paddingRight: 8 }}>
            {batch.title ?? batch.module_key}
          </Text>
          <StatusBadge
            status={{
              label: live ? 'Analyzing' : batch.status === 'completed' ? 'Complete' : 'Finished',
              tone: live ? 'active' : batch.status === 'completed' ? 'success' : 'neutral',
              isActive: live,
            }}
          />
        </Row>
        <Text role="metadata" color="textSecondary" style={{ marginTop: 2 }}>
          {done} of {batch.total_jobs} clip{batch.total_jobs === 1 ? '' : 's'} · {relativeTime(batch.created_at)}
        </Text>
        {live ? (
          <View style={{ marginTop: 8 }}>
            <ProgressBar value={batch.total_jobs ? done / batch.total_jobs : 0} />
          </View>
        ) : null}
      </View>
    </Pressable>
  );
}

function ModuleRow({ module, onPress }: { module: ModuleDef; onPress: () => void }) {
  const theme = useTheme();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${module.name}. ${module.blurb}`}
      onPress={onPress}
      style={({ pressed }) => [
        styles.row,
        {
          backgroundColor: theme.colors.surface,
          borderColor: theme.colors.border,
          borderRadius: theme.radius.lg,
          opacity: pressed ? 0.9 : 1,
        },
      ]}
    >
      <View style={{ flex: 1 }}>
        <Text role="label">{module.name}</Text>
        <Text role="metadata" color="textSecondary" style={{ marginTop: 2 }}>
          {module.blurb}
        </Text>
      </View>
      <Text style={{ color: theme.colors.textSecondary, fontSize: 20 }}>›</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 14,
    borderWidth: StyleSheet.hairlineWidth,
    marginBottom: 8,
  },
});
