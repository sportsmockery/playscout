import React, { useMemo, useState } from 'react';
import { View, FlatList, Pressable, ScrollView, StyleSheet } from 'react-native';
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
  Button,
  Field,
  BottomSheet,
  useToast,
} from '@/components';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '@/theme/ThemeProvider';
import { useFilm, useFolders, qk } from '@/hooks/queries';
import { createFolder, moveVideosToFolder } from '@/lib/api/endpoints';
import { useQueryClient } from '@tanstack/react-query';
import { useTeamStore } from '@/stores/teamStore';
import { useUploadStore, selectActiveUploads } from '@/stores/uploadStore';
import { canWrite } from '@/utils/roles';
import { UploadQueueBanner } from '@/features/uploads/UploadQueueBanner';
import { MODULE_CATALOG } from '@/features/intelligence/modules';

type Scope = 'self' | 'opponent';

/** Sentinel for the "not in any folder" filter — a real choice, so it needs a
 *  value distinct from "no filter applied". */
const UNFILED = 'none';

export default function FilmScreen() {
  const theme = useTheme();
  const router = useRouter();
  const { activeTeam } = useTeamStore();
  const toast = useToast();
  const queryClient = useQueryClient();
  const [scope, setScope] = useState<Scope>('self');
  const [folderId, setFolderId] = useState<string | undefined>(undefined);
  const [selection, setSelection] = useState<string[]>([]);
  const [movingOpen, setMovingOpen] = useState(false);
  const [choosingModule, setChoosingModule] = useState(false);
  const [creatingFolder, setCreatingFolder] = useState(false);
  const [busy, setBusy] = useState(false);
  const film = useFilm(activeTeam?.id ?? null, scope, folderId);
  const folders = useFolders(activeTeam?.id ?? null);
  const uploads = useUploadStore((s) => s.items);
  const activeUploads = useMemo(() => selectActiveUploads(uploads).filter((u) => u.teamId === activeTeam?.id), [uploads, activeTeam?.id]);

  const videos = useMemo(() => film.data?.pages.flatMap((p) => p.videos) ?? [], [film.data]);
  const writable = canWrite(activeTeam?.role);
  const selecting = selection.length > 0;

  function toggle(id: string) {
    setSelection((prev) => (prev.includes(id) ? prev.filter((v) => v !== id) : [...prev, id]));
  }

  function refreshFilm() {
    if (!activeTeam) return;
    queryClient.invalidateQueries({ queryKey: ['film', activeTeam.id] });
    queryClient.invalidateQueries({ queryKey: qk.folders(activeTeam.id) });
  }

  async function moveTo(target: string | null) {
    if (!activeTeam) return;
    setBusy(true);
    try {
      const res = await moveVideosToFolder({
        teamId: activeTeam.id,
        videoIds: selection,
        folderId: target,
      });
      toast(`Moved ${res.moved} clip${res.moved === 1 ? '' : 's'}.`, 'success');
      setSelection([]);
      setMovingOpen(false);
      refreshFilm();
    } catch (e) {
      toast(e instanceof Error ? e.message : 'Could not move that film', 'error');
    } finally {
      setBusy(false);
    }
  }

  async function onCreateFolder(name: string) {
    if (!activeTeam) return;
    try {
      const res = await createFolder({ teamId: activeTeam.id, name });
      queryClient.invalidateQueries({ queryKey: qk.folders(activeTeam.id) });
      setCreatingFolder(false);
      // Creating a folder from the move sheet is almost always "…and put these
      // in it", so finish that intent rather than making them pick it again.
      if (selecting) await moveTo(res.folder.id);
    } catch (e) {
      toast(e instanceof Error ? e.message : 'Could not create that folder', 'error');
    }
  }

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

        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={{ paddingHorizontal: 16, paddingTop: 10, gap: 8 }}
        >
          <FolderChip label="All film" active={folderId === undefined} onPress={() => setFolderId(undefined)} />
          <FolderChip
            label="Unfiled"
            active={folderId === UNFILED}
            onPress={() => setFolderId(UNFILED)}
          />
          {(folders.data?.folders ?? []).map((f) => (
            <FolderChip
              key={f.id}
              label={`${f.name} (${f.video_count})`}
              active={folderId === f.id}
              onPress={() => setFolderId(f.id)}
            />
          ))}
        </ScrollView>

        {selecting ? (
          <View style={{ paddingHorizontal: 16, paddingTop: 12 }}>
            <View
              style={{
                backgroundColor: theme.colors.surface,
                borderColor: theme.colors.gold,
                borderWidth: 1,
                borderRadius: theme.radius.md,
                padding: 12,
              }}
            >
              <Text role="label">
                {selection.length} clip{selection.length === 1 ? '' : 's'} selected
              </Text>
              <View style={{ flexDirection: 'row', gap: 10, marginTop: 10 }}>
                <View style={{ flex: 1 }}>
                  <Button label="Analyze" onPress={() => setChoosingModule(true)} />
                </View>
                <View style={{ flex: 1 }}>
                  <Button label="Move" variant="secondary" onPress={() => setMovingOpen(true)} />
                </View>
              </View>
              <Text
                role="label"
                color="gold"
                align="center"
                style={{ marginTop: 10 }}
                onPress={() => setSelection([])}
              >
                Clear selection
              </Text>
            </View>
          </View>
        ) : null}

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
              <Pressable
                onLongPress={writable ? () => toggle(item.id) : undefined}
                delayLongPress={250}
                style={
                  selection.includes(item.id)
                    ? { borderWidth: 1.5, borderColor: theme.colors.gold, borderRadius: theme.radius.lg }
                    : undefined
                }
              >
                <FilmRow
                  video={item}
                  onPress={() =>
                    selecting ? toggle(item.id) : router.push(`/(app)/film/${item.id}`)
                  }
                />
              </Pressable>
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

      <BottomSheet visible={movingOpen} onClose={() => setMovingOpen(false)} title="Move film">
        <ScrollView style={{ maxHeight: 320 }}>
          <MoveTarget label="Out of every folder" onPress={() => moveTo(null)} disabled={busy} />
          {(folders.data?.folders ?? []).map((f) => (
            <MoveTarget key={f.id} label={f.name} onPress={() => moveTo(f.id)} disabled={busy} />
          ))}
        </ScrollView>
        <Button
          label="New folder"
          variant="secondary"
          onPress={() => {
            setMovingOpen(false);
            setCreatingFolder(true);
          }}
        />
      </BottomSheet>

      <BottomSheet
        visible={choosingModule}
        onClose={() => setChoosingModule(false)}
        title={`Analyze ${selection.length} clip${selection.length === 1 ? '' : 's'}`}
      >
        <ScrollView style={{ maxHeight: 360 }}>
          {MODULE_CATALOG.filter((m) => m.subject === 'film').map((m) => (
            <MoveTarget
              key={m.key}
              label={m.name}
              onPress={() => {
                setChoosingModule(false);
                router.push(`/(app)/module/${m.key}?videoIds=${selection.join(',')}`);
              }}
            />
          ))}
        </ScrollView>
      </BottomSheet>

      <NewFolderSheet
        visible={creatingFolder}
        onClose={() => setCreatingFolder(false)}
        onCreate={onCreateFolder}
      />
    </>
  );
}

function FolderChip({ label, active, onPress }: { label: string; active: boolean; onPress: () => void }) {
  const theme = useTheme();
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="tab"
      accessibilityState={{ selected: active }}
      style={{
        paddingHorizontal: 14,
        paddingVertical: 8,
        borderRadius: 999,
        backgroundColor: active ? theme.colors.gold + '22' : theme.colors.surface,
        borderWidth: StyleSheet.hairlineWidth,
        borderColor: active ? theme.colors.gold : theme.colors.border,
      }}
    >
      <Text role="metadata" style={{ color: active ? theme.colors.gold : theme.colors.text }}>
        {label}
      </Text>
    </Pressable>
  );
}

function MoveTarget({ label, onPress, disabled }: { label: string; onPress: () => void; disabled?: boolean }) {
  const theme = useTheme();
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      accessibilityRole="button"
      style={{
        padding: 14,
        marginBottom: 8,
        borderRadius: theme.radius.md,
        borderWidth: StyleSheet.hairlineWidth,
        borderColor: theme.colors.border,
        backgroundColor: theme.colors.surface,
        opacity: disabled ? 0.6 : 1,
      }}
    >
      <Text role="body">{label}</Text>
    </Pressable>
  );
}

function NewFolderSheet({
  visible,
  onClose,
  onCreate,
}: {
  visible: boolean;
  onClose: () => void;
  onCreate: (name: string) => Promise<void>;
}) {
  const [name, setName] = useState('');
  const [busy, setBusy] = useState(false);
  return (
    <BottomSheet visible={visible} onClose={onClose} title="New folder">
      <Field
        label="Folder name"
        value={name}
        onChangeText={setName}
        autoCapitalize="words"
        placeholder="Week 3 — Wildcats"
      />
      <Button
        label={busy ? 'Creating…' : 'Create folder'}
        loading={busy}
        disabled={busy || !name.trim()}
        onPress={async () => {
          setBusy(true);
          try {
            await onCreate(name.trim());
            setName('');
          } finally {
            setBusy(false);
          }
        }}
      />
    </BottomSheet>
  );
}
