import React, { useMemo, useState } from 'react';
import { View, FlatList } from 'react-native';
import { useRouter } from 'expo-router';
import {
  TopBar,
  Text,
  IconButton,
  FilmRow,
  SegmentedControl,
  EmptyState,
  ErrorState,
  Skeleton,
} from '@/components';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '@/theme/ThemeProvider';
import { useFilm } from '@/hooks/queries';
import { useTeamStore } from '@/stores/teamStore';
import { useUploadStore, selectActiveUploads } from '@/stores/uploadStore';
import { canWrite } from '@/utils/roles';
import { UploadQueueBanner } from '@/features/uploads/UploadQueueBanner';

type Scope = 'self' | 'opponent';

export default function FilmScreen() {
  const theme = useTheme();
  const router = useRouter();
  const { activeTeam } = useTeamStore();
  const [scope, setScope] = useState<Scope>('self');
  const film = useFilm(activeTeam?.id ?? null, scope);
  const uploads = useUploadStore((s) => s.items);
  const activeUploads = useMemo(() => selectActiveUploads(uploads).filter((u) => u.teamId === activeTeam?.id), [uploads, activeTeam?.id]);

  const videos = useMemo(() => film.data?.pages.flatMap((p) => p.videos) ?? [], [film.data]);
  const writable = canWrite(activeTeam?.role);

  return (
    <>
      <TopBar
        showTeamSwitcher
        trailing={
          writable ? (
            <IconButton accessibilityLabel="Upload film" onPress={() => router.push('/(app)/upload')}>
              <Ionicons name="add-circle" size={28} color={theme.colors.gold} />
            </IconButton>
          ) : undefined
        }
      />
      <View style={{ flex: 1, backgroundColor: theme.colors.background }}>
        <View style={{ paddingHorizontal: 16, paddingTop: 8 }}>
          <SegmentedControl<Scope>
            value={scope}
            onChange={setScope}
            segments={[
              { value: 'self', label: 'Our film' },
              { value: 'opponent', label: 'Opponent film' },
            ]}
          />
        </View>

        {activeUploads.length > 0 ? (
          <View style={{ paddingHorizontal: 16, paddingTop: 12 }}>
            <UploadQueueBanner uploads={activeUploads} />
          </View>
        ) : null}

        {film.isLoading ? (
          <View style={{ padding: 16, gap: 10 }}>
            {[0, 1, 2, 3].map((i) => (
              <Skeleton key={i} height={84} radius={16} />
            ))}
          </View>
        ) : film.isError ? (
          <ErrorState onRetry={() => film.refetch()} />
        ) : (
          <FlatList
            data={videos}
            keyExtractor={(v) => v.id}
            contentContainerStyle={{ padding: 16 }}
            onEndReachedThreshold={0.4}
            onEndReached={() => {
              if (film.hasNextPage && !film.isFetchingNextPage) film.fetchNextPage();
            }}
            refreshing={film.isRefetching}
            onRefresh={() => film.refetch()}
            renderItem={({ item }) => (
              <FilmRow video={item} onPress={() => router.push(`/(app)/film/${item.id}`)} />
            )}
            ListEmptyComponent={
              <EmptyState
                title={scope === 'self' ? 'No film yet' : 'No opponent film yet'}
                message={
                  writable
                    ? scope === 'self'
                      ? 'Upload game or practice film to start building intelligence.'
                      : 'Upload opponent film to scout your next game.'
                    : 'Nothing here yet.'
                }
                actionLabel={writable ? 'Upload film' : undefined}
                onAction={writable ? () => router.push('/(app)/upload') : undefined}
              />
            }
            ListFooterComponent={
              film.isFetchingNextPage ? (
                <View style={{ paddingVertical: 16 }}>
                  <Text role="metadata" color="textSecondary" align="center">
                    Loading more…
                  </Text>
                </View>
              ) : null
            }
          />
        )}
      </View>
    </>
  );
}
