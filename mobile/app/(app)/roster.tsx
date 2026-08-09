import React from 'react';
import { View, FlatList, StyleSheet } from 'react-native';
import { Screen, TopBar, Text, Card, Row, EmptyState, ErrorState, Skeleton } from '@/components';
import { useTheme } from '@/theme/ThemeProvider';
import { useRoster } from '@/hooks/queries';
import { useTeamStore } from '@/stores/teamStore';

export default function RosterScreen() {
  const theme = useTheme();
  const { activeTeam } = useTeamStore();
  const roster = useRoster(activeTeam?.id ?? null);

  return (
    <>
      <TopBar title="Roster" />
      {roster.isLoading ? (
        <Screen>
          <View style={{ gap: 10, marginTop: 12 }}>
            {[0, 1, 2, 3, 4].map((i) => (
              <Skeleton key={i} height={56} radius={12} />
            ))}
          </View>
        </Screen>
      ) : roster.isError ? (
        <Screen>
          <ErrorState onRetry={() => roster.refetch()} />
        </Screen>
      ) : (
        <FlatList
          data={roster.data?.players ?? []}
          keyExtractor={(p) => p.id}
          contentContainerStyle={{ padding: 16 }}
          renderItem={({ item }) => (
            <Card style={{ marginBottom: 8 }}>
              <Row gap={12}>
                <View style={[styles.jersey, { backgroundColor: theme.colors.fill }]}>
                  <Text role="label" tabular>
                    {item.jersey_number != null ? item.jersey_number : '—'}
                  </Text>
                </View>
                <View style={{ flex: 1 }}>
                  <Text role="label">{`${item.first_name ?? ''} ${item.last_name ?? ''}`.trim() || 'Unnamed player'}</Text>
                  <Text role="metadata" color="textSecondary">
                    {[item.primary_position, item.secondary_position].filter(Boolean).join(' / ') || 'No position'}
                    {item.side_of_ball ? ` · ${item.side_of_ball}` : ''}
                  </Text>
                </View>
                {item.grade_level ? (
                  <Text role="metadata" color="textSecondary">
                    {item.grade_level}
                  </Text>
                ) : null}
              </Row>
            </Card>
          )}
          ListEmptyComponent={
            <EmptyState title="No players yet" message="Players added on the web appear here." />
          }
        />
      )}
    </>
  );
}

const styles = StyleSheet.create({
  jersey: { width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center' },
});
