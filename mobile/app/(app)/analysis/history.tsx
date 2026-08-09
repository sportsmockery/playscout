import React, { useMemo } from 'react';
import { View, FlatList } from 'react-native';
import { useRouter } from 'expo-router';
import { Screen, TopBar, Text, Card, Row, ScoreBlock, EmptyState, ErrorState, Skeleton } from '@/components';
import { useAnalyses } from '@/hooks/queries';
import { useTeamStore } from '@/stores/teamStore';
import { relativeTime } from '@/utils/time';

export default function AnalysisHistory() {
  const router = useRouter();
  const { activeTeam } = useTeamStore();
  const query = useAnalyses(activeTeam?.id ?? null);
  const rows = useMemo(() => query.data?.pages.flatMap((p) => p.analyses) ?? [], [query.data]);

  return (
    <>
      <TopBar title="Analysis history" />
      {query.isLoading ? (
        <Screen>
          <View style={{ gap: 10, marginTop: 12 }}>
            {[0, 1, 2, 3].map((i) => (
              <Skeleton key={i} height={80} radius={16} />
            ))}
          </View>
        </Screen>
      ) : query.isError ? (
        <Screen>
          <ErrorState onRetry={() => query.refetch()} />
        </Screen>
      ) : (
        <FlatList
          data={rows}
          keyExtractor={(a) => a.id}
          contentContainerStyle={{ padding: 16 }}
          onEndReachedThreshold={0.4}
          onEndReached={() => query.hasNextPage && !query.isFetchingNextPage && query.fetchNextPage()}
          refreshing={query.isRefetching}
          onRefresh={() => query.refetch()}
          renderItem={({ item }) => {
            const player = item.player;
            const who = player ? `${player.first_name ?? ''} ${player.last_name ?? ''}`.trim() : null;
            return (
              <Card style={{ marginBottom: 10 }}>
                <Row justify="space-between" align="flex-start">
                  <View style={{ flex: 1, paddingRight: 12 }}>
                    <Text role="label">{item.module_key ?? 'Analysis'}</Text>
                    {who ? (
                      <Text role="metadata" color="textSecondary">
                        {who}
                        {player?.primary_position ? ` · ${player.primary_position}` : ''}
                      </Text>
                    ) : null}
                    <Text role="metadata" color="textSecondary" numberOfLines={2} style={{ marginTop: 4 }}>
                      {item.summary ?? '—'}
                    </Text>
                    <Text role="metadata" color="textSecondary" style={{ marginTop: 6 }}>
                      {relativeTime(item.created_at)}
                      {item.edited_at ? ' · edited' : ''}
                    </Text>
                    <Text role="label" color="gold" style={{ marginTop: 8 }} onPress={() => router.push(`/(app)/analysis/${item.id}`)}>
                      Open report
                    </Text>
                  </View>
                  <ScoreBlock score={item.overall_score} size="sm" />
                </Row>
              </Card>
            );
          }}
          ListEmptyComponent={<EmptyState title="No analyses yet" message="Run a module on your film to build history." />}
        />
      )}
    </>
  );
}
