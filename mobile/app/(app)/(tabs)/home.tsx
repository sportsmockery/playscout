import React, { useMemo } from 'react';
import { View } from 'react-native';
import { useRouter } from 'expo-router';
import {
  Screen,
  TopBar,
  Text,
  Card,
  Section,
  Button,
  SafetyAlert,
  ScoreBlock,
  StatusBadge,
  EmptyState,
  Skeleton,
  Row,
} from '@/components';
import { useHome } from '@/hooks/queries';
import { useTeamStore } from '@/stores/teamStore';
import { canWrite } from '@/utils/roles';
import { videoStatusView } from '@/utils/status';
import { relativeTime } from '@/utils/time';
import type { HomeResponse } from '@/lib/api/endpoints';

export default function HomeScreen() {
  const router = useRouter();
  const { activeTeam } = useTeamStore();
  const home = useHome(activeTeam?.id ?? null);

  const primary = useMemo(() => (home.data ? derivePrimaryAction(home.data) : null), [home.data]);

  return (
    <>
      <TopBar showTeamSwitcher />
      <Screen refreshing={home.isRefetching} onRefresh={() => home.refetch()}>
        {!activeTeam ? (
          <EmptyState
            title="No team selected"
            message="Pick a team to see what needs attention."
            actionLabel="Choose team"
            onAction={() => router.push('/(app)/team-picker')}
          />
        ) : home.isLoading ? (
          <HomeSkeleton />
        ) : home.isError ? (
          <EmptyState title="Couldn’t load your home" message="Pull to refresh to try again." />
        ) : home.data ? (
          <View>
            {/* Safety always sits above ordinary analytics. */}
            {home.data.safety?.flagged ? (
              <View style={{ marginTop: 16 }}>
                <SafetyAlert flag={{ flagged: true, note: home.data.safety.note }} />
              </View>
            ) : null}

            {/* Next opponent / event */}
            <Section title="Up next" style={{ marginTop: 16 }}>
              <Card>
                {home.data.nextOpponent ? (
                  <>
                    <Text role="label">{home.data.nextOpponent.name}</Text>
                    <Text role="metadata" color="textSecondary" style={{ marginTop: 2 }}>
                      {home.data.nextOpponent.next_game_date
                        ? `Game ${relativeTime(home.data.nextOpponent.next_game_date)}`
                        : 'No date set'}
                    </Text>
                  </>
                ) : (
                  <Text role="body" color="textSecondary">
                    No upcoming opponent added yet.
                  </Text>
                )}
              </Card>
            </Section>

            {/* Primary Continue action */}
            {primary ? (
              <View style={{ marginTop: 16 }}>
                <Button label={primary.label} onPress={() => router.push(primary.href as never)} />
              </View>
            ) : null}

            {/* Needs attention — max 3 then View all */}
            {home.data.needsAttention.length > 0 ? (
              <Section
                title="Needs attention"
                action={
                  home.data.needsAttention.length > 3 ? (
                    <Text role="label" color="gold" onPress={() => router.push('/(app)/(tabs)/film')}>
                      View all
                    </Text>
                  ) : undefined
                }
              >
                {home.data.needsAttention.slice(0, 3).map((n) => (
                  <Card key={n.videoId} style={{ marginBottom: 8 }}>
                    <Row justify="space-between">
                      <View style={{ flex: 1 }}>
                        <Text role="label" numberOfLines={1}>
                          {n.title}
                        </Text>
                        <Text role="metadata" color="textSecondary">
                          {n.kind === 'processing_failed' ? 'Processing needs attention' : 'Ready — confirm plays'}
                        </Text>
                      </View>
                      <Text
                        role="label"
                        color="gold"
                        onPress={() => router.push(`/(app)/film/${n.videoId}`)}
                      >
                        Open
                      </Text>
                    </Row>
                  </Card>
                ))}
              </Section>
            ) : null}

            {/* Latest intelligence */}
            <Section title="Latest intelligence">
              {home.data.latestIntelligence.length === 0 ? (
                <Card>
                  <Text role="body" color="textSecondary">
                    No analysis yet. Run a module on your film to build intelligence.
                  </Text>
                </Card>
              ) : (
                home.data.latestIntelligence.map((a) => (
                  <Card key={a.id} style={{ marginBottom: 8 }}>
                    <Row justify="space-between" align="flex-start">
                      <View style={{ flex: 1, paddingRight: 12 }}>
                        <Text role="label">{a.module_key ?? 'Analysis'}</Text>
                        <Text role="metadata" color="textSecondary" numberOfLines={2} style={{ marginTop: 2 }}>
                          {a.summary ?? '—'}
                        </Text>
                        <Text
                          role="label"
                          color="gold"
                          style={{ marginTop: 8 }}
                          onPress={() => router.push(`/(app)/analysis/${a.id}`)}
                        >
                          Review
                        </Text>
                      </View>
                      <ScoreBlock score={a.overall_score} size="sm" />
                    </Row>
                  </Card>
                ))
              )}
            </Section>

            {/* Practice focus */}
            {home.data.practiceFocus.length > 0 ? (
              <Section title="Practice focus">
                {home.data.practiceFocus.slice(0, 3).map((m) => (
                  <Card key={m.id} style={{ marginBottom: 8 }}>
                    <Text role="label">{m.title ?? 'Correction'}</Text>
                    {m.correction ? (
                      <Text role="metadata" color="textSecondary" style={{ marginTop: 2 }}>
                        {m.correction}
                      </Text>
                    ) : null}
                  </Card>
                ))}
              </Section>
            ) : null}

            {/* Recent film */}
            <Section
              title="Recent film"
              action={
                <Text role="label" color="gold" onPress={() => router.push('/(app)/(tabs)/film')}>
                  All film
                </Text>
              }
            >
              {home.data.recentFilm.length === 0 ? (
                <Card>
                  <Text role="body" color="textSecondary">
                    {canWrite(activeTeam.role) ? 'Upload your first film to get started.' : 'No film yet.'}
                  </Text>
                </Card>
              ) : (
                home.data.recentFilm.map((v) => (
                  <Card key={v.id} style={{ marginBottom: 8 }}>
                    <Row justify="space-between">
                      <View style={{ flex: 1, paddingRight: 12 }}>
                        <Text role="label" numberOfLines={1}>
                          {v.title}
                        </Text>
                        <Text role="metadata" color="textSecondary">
                          {relativeTime(v.created_at)}
                        </Text>
                      </View>
                      <StatusBadge status={videoStatusView(v.status, v.processing_status)} />
                    </Row>
                    <Text
                      role="label"
                      color="gold"
                      style={{ marginTop: 8 }}
                      onPress={() => router.push(`/(app)/film/${v.id}`)}
                    >
                      Open
                    </Text>
                  </Card>
                ))
              )}
            </Section>

            {/* Ask PlayScoutIQ */}
            <Section title="Ask PlayScoutIQ">
              <Button
                label="Ask about this team"
                variant="secondary"
                onPress={() => router.push('/(app)/(tabs)/coach')}
              />
            </Section>
          </View>
        ) : null}
      </Screen>
    </>
  );
}

function derivePrimaryAction(data: HomeResponse): { label: string; href: string } {
  const failed = data.needsAttention.find((n) => n.kind === 'processing_failed');
  if (failed) return { label: 'Review film that needs attention', href: `/(app)/film/${failed.videoId}` };
  const confirm = data.needsAttention.find((n) => n.kind === 'confirm_plays');
  if (confirm) return { label: 'Confirm detected plays', href: `/(app)/film/${confirm.videoId}/plays` };
  if (data.latestIntelligence[0]) {
    return { label: 'Review latest analysis', href: `/(app)/analysis/${data.latestIntelligence[0].id}` };
  }
  if (data.recentFilm.length === 0) return { label: 'Upload your first film', href: '/(app)/upload' };
  return { label: 'Open film library', href: '/(app)/(tabs)/film' };
}

function HomeSkeleton() {
  return (
    <View style={{ marginTop: 16, gap: 12 }}>
      <Skeleton height={72} radius={16} />
      <Skeleton height={52} radius={12} />
      <Skeleton height={96} radius={16} />
      <Skeleton height={96} radius={16} />
    </View>
  );
}
