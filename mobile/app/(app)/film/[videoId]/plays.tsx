import React, { useMemo, useState } from 'react';
import { View, FlatList, TextInput, StyleSheet } from 'react-native';
import { useLocalSearchParams } from 'expo-router';
import { useQueryClient } from '@tanstack/react-query';
import {
  TopBar,
  Text,
  Card,
  Row,
  Button,
  IconButton,
  BottomSheet,
  ConfidenceLabel,
  EmptyState,
  ErrorState,
  Skeleton,
  useToast,
} from '@/components';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '@/theme/ThemeProvider';
import { useFilmDetail, qk } from '@/hooks/queries';
import { createPlaySequence, updatePlaySequence, deletePlaySequence } from '@/lib/api/endpoints';
import { canWrite } from '@/utils/roles';
import { formatTimecode, parseTimecode } from '@/utils/time';
import type { PlaySequence } from '@/types/domain';

export default function PlaysScreen() {
  const theme = useTheme();
  const toast = useToast();
  const queryClient = useQueryClient();
  const { videoId } = useLocalSearchParams<{ videoId: string }>();
  const detail = useFilmDetail(videoId);
  const writable = canWrite(detail.data?.role);

  const [editing, setEditing] = useState<PlaySequence | null>(null);
  const [adding, setAdding] = useState(false);
  const [lastDeleted, setLastDeleted] = useState<PlaySequence | null>(null);

  const plays = useMemo(() => detail.data?.plays ?? [], [detail.data]);
  const teamId = detail.data?.video.team_id;

  function refresh() {
    queryClient.invalidateQueries({ queryKey: qk.filmDetail(videoId) });
  }

  async function onDelete(play: PlaySequence) {
    try {
      await deletePlaySequence(play.id);
      setLastDeleted(play);
      refresh();
      toast('Play deleted');
    } catch {
      toast('Could not delete play', 'error');
    }
  }

  async function onUndoDelete() {
    if (!lastDeleted || !teamId) return;
    try {
      await createPlaySequence({
        videoId,
        teamId,
        startTimeSeconds: lastDeleted.start_time_seconds ?? 0,
        endTimeSeconds: lastDeleted.end_time_seconds ?? (lastDeleted.start_time_seconds ?? 0) + 5,
      });
      setLastDeleted(null);
      refresh();
      toast('Play restored', 'success');
    } catch {
      toast('Could not restore', 'error');
    }
  }

  return (
    <>
      <TopBar
        title="Confirm plays"
        trailing={
          writable ? (
            <IconButton accessibilityLabel="Add play" onPress={() => setAdding(true)}>
              <Ionicons name="add-circle" size={26} color={theme.colors.gold} />
            </IconButton>
          ) : undefined
        }
      />
      {detail.isLoading ? (
        <View style={{ padding: 16, gap: 10 }}>
          {[0, 1, 2].map((i) => (
            <Skeleton key={i} height={72} radius={12} />
          ))}
        </View>
      ) : detail.isError ? (
        <View style={{ padding: 16 }}>
          <ErrorState onRetry={() => detail.refetch()} />
        </View>
      ) : (
        <FlatList
          data={plays}
          keyExtractor={(p) => p.id}
          contentContainerStyle={{ padding: 16 }}
          ListHeaderComponent={
            lastDeleted ? (
              <Card style={{ marginBottom: 12 }}>
                <Row justify="space-between">
                  <Text role="body">Play deleted</Text>
                  <Text role="label" color="gold" onPress={onUndoDelete}>
                    Undo
                  </Text>
                </Row>
              </Card>
            ) : null
          }
          renderItem={({ item }) => (
            <Card style={{ marginBottom: 10 }}>
              <Row justify="space-between">
                <View style={{ flex: 1 }}>
                  <Text role="label">
                    Play {item.sequence_number}
                    {item.coach_label ? ` · ${item.coach_label}` : ''}
                  </Text>
                  <Text role="metadata" color="textSecondary" tabular style={{ marginTop: 2 }}>
                    {formatTimecode(item.start_time_seconds)}–{formatTimecode(item.end_time_seconds)}
                    {item.down ? ` · ${item.down} & ${item.distance ?? '?'}` : ''}
                    {item.yard_line ? ` · ${item.yard_line}` : ''}
                  </Text>
                  <Row gap={8} style={{ marginTop: 8 }}>
                    <Text role="metadata" color="textSecondary">
                      {item.coach_label ? 'Coach-confirmed' : 'Detected'}
                    </Text>
                    {item.confidence != null ? <ConfidenceLabel confidence={item.confidence} /> : null}
                  </Row>
                </View>
                {writable ? (
                  <Row gap={4}>
                    <IconButton accessibilityLabel={`Edit play ${item.sequence_number}`} onPress={() => setEditing(item)}>
                      <Ionicons name="create-outline" size={22} color={theme.colors.textSecondary} />
                    </IconButton>
                    <IconButton accessibilityLabel={`Delete play ${item.sequence_number}`} onPress={() => onDelete(item)}>
                      <Ionicons name="trash-outline" size={22} color={theme.colors.error} />
                    </IconButton>
                  </Row>
                ) : null}
              </Row>
            </Card>
          )}
          ListEmptyComponent={
            <EmptyState
              title="No plays yet"
              message={writable ? 'Add plays at their timestamps so you can run per-play analysis.' : 'No plays have been confirmed.'}
              actionLabel={writable ? 'Add a play' : undefined}
              onAction={writable ? () => setAdding(true) : undefined}
            />
          }
        />
      )}

      {editing ? (
        <EditPlaySheet
          play={editing}
          onClose={() => setEditing(null)}
          onSaved={() => {
            setEditing(null);
            refresh();
            toast('Play saved', 'success');
          }}
        />
      ) : null}

      {adding && teamId ? (
        <AddPlaySheet
          videoId={videoId}
          teamId={teamId}
          onClose={() => setAdding(false)}
          onAdded={() => {
            setAdding(false);
            refresh();
            toast('Play added', 'success');
          }}
        />
      ) : null}
    </>
  );
}

/** Accessible time field — numeric M:SS entry, not a drag-only handle. */
function TimeField({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) {
  const theme = useTheme();
  return (
    <View style={{ flex: 1 }}>
      <Text role="metadata" color="textSecondary" style={{ marginBottom: 4 }}>
        {label}
      </Text>
      <TextInput
        value={value}
        onChangeText={onChange}
        placeholder="0:00"
        placeholderTextColor={theme.colors.textSecondary}
        keyboardType="numbers-and-punctuation"
        accessibilityLabel={`${label}, minutes and seconds`}
        style={[
          styles.field,
          { color: theme.colors.text, backgroundColor: theme.colors.fill, borderRadius: theme.radius.md },
        ]}
      />
    </View>
  );
}

function EditPlaySheet({ play, onClose, onSaved }: { play: PlaySequence; onClose: () => void; onSaved: () => void }) {
  const toast = useToast();
  const [start, setStart] = useState(formatTimecode(play.start_time_seconds));
  const [end, setEnd] = useState(formatTimecode(play.end_time_seconds));
  const [label, setLabel] = useState(play.coach_label ?? '');
  const [saving, setSaving] = useState(false);

  async function save() {
    const s = parseTimecode(start);
    const e = parseTimecode(end);
    if (s == null || e == null) return toast('Enter times as M:SS', 'error');
    if (e <= s) return toast('End must be after start', 'error');
    setSaving(true);
    try {
      await updatePlaySequence(play.id, {
        start_time_seconds: s,
        end_time_seconds: e,
        coach_label: label.trim() || undefined,
      });
      onSaved();
    } catch {
      toast('Could not save', 'error');
    } finally {
      setSaving(false);
    }
  }

  return (
    <BottomSheet visible onClose={onClose} title={`Edit play ${play.sequence_number}`}>
      <Row gap={12}>
        <TimeField label="Start" value={start} onChange={setStart} />
        <TimeField label="End" value={end} onChange={setEnd} />
      </Row>
      <LabelField value={label} onChange={setLabel} />
      <View style={{ height: 12 }} />
      <Button label="Save play" onPress={save} loading={saving} haptic={null} />
    </BottomSheet>
  );
}

function AddPlaySheet({
  videoId,
  teamId,
  onClose,
  onAdded,
}: {
  videoId: string;
  teamId: string;
  onClose: () => void;
  onAdded: () => void;
}) {
  const toast = useToast();
  const [start, setStart] = useState('');
  const [end, setEnd] = useState('');
  const [saving, setSaving] = useState(false);

  async function add() {
    const s = parseTimecode(start);
    const e = parseTimecode(end);
    if (s == null || e == null) return toast('Enter times as M:SS', 'error');
    if (e <= s) return toast('End must be after start', 'error');
    setSaving(true);
    try {
      await createPlaySequence({ videoId, teamId, startTimeSeconds: s, endTimeSeconds: e });
      onAdded();
    } catch {
      toast('Could not add play', 'error');
    } finally {
      setSaving(false);
    }
  }

  return (
    <BottomSheet visible onClose={onClose} title="Add a play">
      <Row gap={12}>
        <TimeField label="Start" value={start} onChange={setStart} />
        <TimeField label="End" value={end} onChange={setEnd} />
      </Row>
      <View style={{ height: 12 }} />
      <Button label="Add play" onPress={add} loading={saving} haptic={null} />
    </BottomSheet>
  );
}

function LabelField({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const theme = useTheme();
  return (
    <View style={{ marginTop: 12 }}>
      <Text role="metadata" color="textSecondary" style={{ marginBottom: 4 }}>
        Coach label (optional)
      </Text>
      <TextInput
        value={value}
        onChangeText={onChange}
        placeholder="e.g. Power Right"
        placeholderTextColor={theme.colors.textSecondary}
        style={[styles.field, { color: theme.colors.text, backgroundColor: theme.colors.fill, borderRadius: theme.radius.md }]}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  field: { minHeight: 48, paddingHorizontal: 14, fontSize: 16, fontVariant: ['tabular-nums'] },
});
