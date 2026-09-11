import React, { useState } from 'react';
import { View } from 'react-native';
import { useRouter } from 'expo-router';
import {
  Screen,
  TopBar,
  Text,
  Card,
  Section,
  Row,
  SegmentedControl,
  EmptyState,
  ErrorState,
  Skeleton,
  ConfidenceLabel,
  ScoreBlock,
} from '@/components';
import { useTheme } from '@/theme/ThemeProvider';
import { useTeamIntelligence } from '@/hooks/queries';
import { useTeamStore } from '@/stores/teamStore';
import { sampleSizeLabel } from '@/utils/score';
import { relativeTime } from '@/utils/time';
import type { TeamTendencyRow, MistakeCategoryRollup } from '@/types/domain';

type Tab = 'tendencies' | 'mistakes' | 'reports';

/** Turns snake_case categories and tendency types into something readable. */
function humanise(value: string | null | undefined): string {
  if (!value) return 'Uncategorised';
  return value.replace(/_/g, ' ').replace(/^./, (c) => c.toUpperCase());
}

/**
 * What this team has learned so far, across every clip it has run.
 *
 * The single rule this screen enforces: a tendency never appears without the
 * sample size behind it. "Runs right 71% of the time" off four plays is noise,
 * and a coach who game-plans against noise loses — so the count travels with
 * every claim rather than sitting behind a tap.
 */
export default function IntelligenceScreen() {
  const router = useRouter();
  const { activeTeam } = useTeamStore();
  const [tab, setTab] = useState<Tab>('tendencies');
  const intel = useTeamIntelligence(activeTeam?.id ?? null);

  if (!activeTeam) {
    return (
      <>
        <TopBar title="Team intelligence" />
        <Screen>
          <EmptyState title="No team selected" message="Pick a team to see what it has learned." />
        </Screen>
      </>
    );
  }

  return (
    <>
      <TopBar title="Team intelligence" />
      <Screen>
        <View style={{ marginTop: 12 }}>
          <SegmentedControl<Tab>
            value={tab}
            onChange={setTab}
            segments={[
              { value: 'tendencies', label: 'Tendencies' },
              { value: 'mistakes', label: 'Mistakes' },
              { value: 'reports', label: 'Reports' },
            ]}
          />
        </View>

        {intel.isLoading ? (
          <View style={{ marginTop: 16, gap: 10 }}>
            {[0, 1, 2].map((i) => (
              <Skeleton key={i} height={90} radius={14} />
            ))}
          </View>
        ) : intel.isError ? (
          <ErrorState onRetry={() => intel.refetch()} />
        ) : tab === 'tendencies' ? (
          <Section title="What this team does" style={{ marginTop: 16 }}>
            {(intel.data?.tendencies.length ?? 0) === 0 ? (
              <EmptyState
                title="No tendencies yet"
                message="Run TeamIQ across a few clips and patterns start to appear here."
              />
            ) : (
              (intel.data?.tendencies ?? []).map((t) => <TendencyCard key={t.id} tendency={t} />)
            )}
          </Section>
        ) : tab === 'mistakes' ? (
          <>
            <Section title="What keeps happening" style={{ marginTop: 16 }}>
              {(intel.data?.mistakeRollup.length ?? 0) === 0 ? (
                <EmptyState
                  title="No mistakes recorded"
                  message="Run MistakeIQ on a game and recurring issues collect here."
                />
              ) : (
                (intel.data?.mistakeRollup ?? []).map((m) => (
                  <MistakeRollupCard key={m.category} rollup={m} />
                ))
              )}
            </Section>

            {(intel.data?.mistakes.length ?? 0) > 0 ? (
              <Section title="Most recent">
                {(intel.data?.mistakes ?? []).slice(0, 10).map((m) => (
                  <Card key={m.id} style={{ marginBottom: 8 }}>
                    <Row justify="space-between" align="flex-start">
                      <Text role="label" style={{ flex: 1, paddingRight: 8 }}>
                        {m.title ?? humanise(m.category)}
                      </Text>
                      <Text role="metadata" color="textSecondary">
                        {relativeTime(m.created_at)}
                      </Text>
                    </Row>
                    {m.correction ? (
                      <Text role="body" color="textSecondary" style={{ marginTop: 6 }}>
                        {m.correction}
                      </Text>
                    ) : null}
                    <View style={{ marginTop: 8 }}>
                      <ConfidenceLabel confidence={m.confidence} />
                    </View>
                  </Card>
                ))}
              </Section>
            ) : null}
          </>
        ) : (
          <Section title="Recent reports" style={{ marginTop: 16 }}>
            {(intel.data?.analyses.length ?? 0) === 0 ? (
              <EmptyState
                title="No reports yet"
                message="Analyze some film and its reports collect here."
                actionLabel="Analyze film"
                onAction={() => router.push('/(app)/(tabs)/analyze')}
              />
            ) : (
              (intel.data?.analyses ?? []).map((a) => (
                <Card key={a.id} style={{ marginBottom: 8 }}>
                  <Row justify="space-between" align="flex-start">
                    <View style={{ flex: 1, paddingRight: 12 }}>
                      <Text role="label">{a.module_key ?? 'Report'}</Text>
                      <Text role="metadata" color="textSecondary" style={{ marginTop: 2 }}>
                        {relativeTime(a.created_at)}
                      </Text>
                      {a.summary ? (
                        <Text role="body" color="textSecondary" style={{ marginTop: 6 }} numberOfLines={3}>
                          {a.summary}
                        </Text>
                      ) : null}
                      <Text
                        role="label"
                        color="gold"
                        style={{ marginTop: 8 }}
                        onPress={() => router.push(`/(app)/analysis/${a.id}`)}
                      >
                        Open report
                      </Text>
                    </View>
                    <ScoreBlock score={a.overall_score} size="sm" />
                  </Row>
                </Card>
              ))
            )}
          </Section>
        )}

        <View style={{ height: 24 }} />
      </Screen>
    </>
  );
}

function TendencyCard({ tendency }: { tendency: TeamTendencyRow }) {
  const theme = useTheme();
  const n = tendency.sample_size ?? 0;
  // Under five plays a percentage reads as fact and isn't one. Say so on the
  // row rather than letting a coach discover it by losing a game.
  const thin = n > 0 && n < 5;
  return (
    <Card style={{ marginBottom: 8 }}>
      <Text role="metadata" color="textSecondary">
        {humanise(tendency.tendency_type)}
      </Text>
      <Text role="label" style={{ marginTop: 2 }}>
        {tendency.label ?? 'Unnamed tendency'}
      </Text>
      <Row justify="space-between" style={{ marginTop: 10 }}>
        <Text role="metadata" style={{ color: thin ? theme.colors.warning : theme.colors.textSecondary }}>
          {sampleSizeLabel(tendency.sample_size)}
        </Text>
        <ConfidenceLabel confidence={tendency.confidence} />
      </Row>
      {thin ? (
        <Text role="metadata" color="textSecondary" style={{ marginTop: 8 }}>
          Too few plays to game-plan against yet.
        </Text>
      ) : null}
    </Card>
  );
}

function MistakeRollupCard({ rollup }: { rollup: MistakeCategoryRollup }) {
  const theme = useTheme();
  const severe = rollup.worstSeverity === 'major' || rollup.worstSeverity === 'game_changing';
  return (
    <Card style={{ marginBottom: 8, borderColor: severe ? theme.colors.warning : undefined }}>
      <Row justify="space-between" align="flex-start">
        <View style={{ flex: 1, paddingRight: 12 }}>
          <Text role="label">{humanise(rollup.category)}</Text>
          {rollup.latestTitle ? (
            <Text role="metadata" color="textSecondary" style={{ marginTop: 2 }} numberOfLines={2}>
              {rollup.latestTitle}
            </Text>
          ) : null}
        </View>
        <View style={{ alignItems: 'flex-end' }}>
          <Text role="sectionTitle" tabular>
            {rollup.count}
          </Text>
          <Text role="metadata" color="textSecondary">
            {humanise(rollup.worstSeverity)}
          </Text>
        </View>
      </Row>
    </Card>
  );
}
