import React from 'react';
import { View } from 'react-native';
import { Screen, TopBar, Text, Card, Section, Row, EmptyState, ErrorState, Skeleton } from '@/components';
import { useTheme } from '@/theme/ThemeProvider';
import { useUsage } from '@/hooks/queries';
import { useTeamStore } from '@/stores/teamStore';
import { isAdmin } from '@/utils/roles';

/** Money, so never a locale-guessing toFixed — two decimals, explicit USD. */
function money(n: number): string {
  return `$${n.toFixed(2)}`;
}

function humanise(v: string): string {
  return v.replace(/_/g, ' ').replace(/^./, (c) => c.toUpperCase());
}

/**
 * AI spend and cache performance.
 *
 * Every total comes from /api/mobile/usage. Re-deriving them here would give
 * two answers to one question the moment either side changed, and a cost
 * figure that disagrees with the web is worse than no figure.
 */
export default function UsageScreen() {
  const theme = useTheme();
  const { activeTeam } = useTeamStore();
  const admin = isAdmin(activeTeam?.role);
  const usage = useUsage(admin);

  if (!admin) {
    return (
      <>
        <TopBar title="AI usage" />
        <Screen>
          <Card style={{ marginTop: 16 }}>
            <Text role="body">Usage needs owner or admin access on this organization.</Text>
          </Card>
        </Screen>
      </>
    );
  }

  if (usage.isLoading) {
    return (
      <>
        <TopBar title="AI usage" />
        <Screen>
          <Skeleton height={120} />
          <Skeleton height={180} style={{ marginTop: 12 }} />
        </Screen>
      </>
    );
  }

  if (usage.isError || !usage.data) {
    return (
      <>
        <TopBar title="AI usage" />
        <Screen>
          <ErrorState onRetry={() => usage.refetch()} />
        </Screen>
      </>
    );
  }

  const d = usage.data;

  return (
    <>
      <TopBar title="AI usage" />
      <Screen>
        <Card style={{ marginTop: 12 }}>
          <Text role="metadata" color="textSecondary">
            {d.organizationName ?? 'Your organization'} · last {d.windowDays} days
          </Text>
          <Row justify="space-between" style={{ marginTop: 12 }}>
            <Stat label="Spend" value={money(d.totalCost)} />
            <Stat label="Calls" value={String(d.totalCalls)} />
            <Stat
              label="Cache hits"
              value={d.totalCalls > 0 ? `${Math.round(d.cacheHitRate)}%` : '—'}
            />
          </Row>
        </Card>

        {d.totalCalls === 0 ? (
          <EmptyState
            title="No AI usage yet"
            message={`Nothing has been analyzed in the last ${d.windowDays} days.`}
          />
        ) : (
          <>
            <Section title="By job type">
              {d.byJobType.map((j) => (
                <Card key={j.jobType} style={{ marginBottom: 8 }}>
                  <Row justify="space-between">
                    <View style={{ flex: 1, paddingRight: 12 }}>
                      <Text role="label">{humanise(j.jobType)}</Text>
                      <Text role="metadata" color="textSecondary" style={{ marginTop: 2 }}>
                        {j.calls} call{j.calls === 1 ? '' : 's'}
                      </Text>
                    </View>
                    <Text role="label" tabular>
                      {money(j.cost)}
                    </Text>
                  </Row>
                  {/* Share of spend as a bar, with the figure alongside it —
                      a bar on its own is not a number a coach can act on. */}
                  <View
                    style={{
                      height: 4,
                      borderRadius: 2,
                      marginTop: 10,
                      backgroundColor: theme.colors.fill,
                      overflow: 'hidden',
                    }}
                  >
                    <View
                      style={{
                        height: 4,
                        width: `${d.totalCost > 0 ? Math.round((j.cost / d.totalCost) * 100) : 0}%`,
                        backgroundColor: theme.colors.gold,
                      }}
                    />
                  </View>
                </Card>
              ))}
            </Section>

            <Section title="By day">
              <Card>
                {d.byDay.slice(0, 14).map((day, i) => (
                  <Row
                    key={day.day}
                    justify="space-between"
                    style={{ paddingVertical: 8, borderTopWidth: i === 0 ? 0 : 0.5, borderTopColor: theme.colors.border }}
                  >
                    <Text role="body" color="textSecondary">
                      {day.day}
                    </Text>
                    <Text role="label" tabular>
                      {money(day.cost)}
                    </Text>
                  </Row>
                ))}
              </Card>
            </Section>
          </>
        )}

        <View style={{ height: 24 }} />
      </Screen>
    </>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <View>
      <Text role="metadata" color="textSecondary">
        {label}
      </Text>
      <Text role="sectionTitle" tabular style={{ marginTop: 2 }}>
        {value}
      </Text>
    </View>
  );
}
