import React, { useState } from 'react';
import { View, FlatList, Pressable, ScrollView, StyleSheet } from 'react-native';
import {
  Screen,
  TopBar,
  Text,
  Card,
  Row,
  Button,
  Field,
  EmptyState,
  ErrorState,
  Skeleton,
  BottomSheet,
  ConfirmationSheet,
  SegmentedControl,
  useToast,
} from '@/components';
import { useTheme } from '@/theme/ThemeProvider';
import { useRoster, qk } from '@/hooks/queries';
import { useTeamStore } from '@/stores/teamStore';
import { canWrite, writeDeniedReason } from '@/utils/roles';
import { useQueryClient } from '@tanstack/react-query';
import {
  createPlayer,
  updatePlayer,
  deletePlayer,
  draftFromPlayer,
  EMPTY_DRAFT,
  type PlayerDraft,
} from '@/features/roster/mutations';
import type { Player, SideOfBall } from '@/types/domain';

/**
 * The roster, editable.
 *
 * Jersey numbers are not decoration: with no roster on file every player is
 * graded by role, because an unverifiable number is what puts one kid's grade
 * on another. Entering numbers here is what unlocks player-level grading, and
 * the screen says so rather than leaving a coach to infer it.
 */
export default function RosterScreen() {
  const theme = useTheme();
  const toast = useToast();
  const queryClient = useQueryClient();
  const { activeTeam } = useTeamStore();
  const roster = useRoster(activeTeam?.id ?? null);

  const [editing, setEditing] = useState<Player | null>(null);
  const [adding, setAdding] = useState(false);
  const [removing, setRemoving] = useState<Player | null>(null);
  const [busy, setBusy] = useState(false);

  const writable = canWrite(activeTeam?.role);
  const players = roster.data?.players ?? [];
  const withNumbers = players.filter((p) => !!p.jersey_number).length;

  function invalidate() {
    if (activeTeam) queryClient.invalidateQueries({ queryKey: qk.roster(activeTeam.id) });
  }

  async function onSave(draft: PlayerDraft) {
    if (!activeTeam) return;
    setBusy(true);
    try {
      if (editing) {
        await updatePlayer(editing.id, draft);
        toast('Player updated.', 'success');
      } else {
        await createPlayer(activeTeam.id, draft);
        toast('Player added.', 'success');
      }
      invalidate();
      setEditing(null);
      setAdding(false);
    } catch (e) {
      toast(e instanceof Error ? e.message : 'Could not save this player', 'error');
    } finally {
      setBusy(false);
    }
  }

  async function onRemove() {
    if (!removing) return;
    setBusy(true);
    try {
      await deletePlayer(removing.id);
      toast('Player removed.', 'success');
      invalidate();
      setRemoving(null);
    } catch (e) {
      toast(e instanceof Error ? e.message : 'Could not remove this player', 'error');
    } finally {
      setBusy(false);
    }
  }

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
          data={players}
          keyExtractor={(p) => p.id}
          contentContainerStyle={{ padding: 16, paddingBottom: 32 }}
          ListHeaderComponent={
            <View>
              {!writable ? (
                <Card style={{ marginBottom: 12, borderColor: theme.colors.warning }}>
                  <Text role="body">{writeDeniedReason(activeTeam?.role)}</Text>
                </Card>
              ) : null}
              {players.length > 0 && withNumbers === 0 ? (
                <Card style={{ marginBottom: 12 }}>
                  <Text role="label">No jersey numbers yet</Text>
                  <Text role="body" color="textSecondary" style={{ marginTop: 4 }}>
                    Without numbers, every player is graded by position instead of by
                    name. Add numbers to unlock player-level grades.
                  </Text>
                </Card>
              ) : null}
              {writable ? (
                <View style={{ marginBottom: 12 }}>
                  <Button label="Add player" onPress={() => setAdding(true)} />
                </View>
              ) : null}
            </View>
          }
          renderItem={({ item }) => (
            <Pressable
              onPress={writable ? () => setEditing(item) : undefined}
              disabled={!writable}
              accessibilityRole={writable ? 'button' : undefined}
              accessibilityLabel={
                writable
                  ? `Edit ${`${item.first_name ?? ''} ${item.last_name ?? ''}`.trim() || 'unnamed player'}`
                  : undefined
              }
            >
              <Card style={{ marginBottom: 8 }}>
                <Row gap={12}>
                  <View style={[styles.jersey, { backgroundColor: theme.colors.fill }]}>
                    <Text role="label" tabular>
                      {item.jersey_number ? item.jersey_number : '—'}
                    </Text>
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text role="label">
                      {`${item.first_name ?? ''} ${item.last_name ?? ''}`.trim() || 'Unnamed player'}
                    </Text>
                    <Text role="metadata" color="textSecondary">
                      {[item.primary_position, item.secondary_position].filter(Boolean).join(' / ') ||
                        'No position'}
                      {item.side_of_ball ? ` · ${item.side_of_ball}` : ''}
                    </Text>
                  </View>
                  {item.grade_level ? (
                    <Text role="metadata" color="textSecondary">
                      {item.grade_level}
                    </Text>
                  ) : null}
                  {writable ? (
                    <Text style={{ color: theme.colors.textSecondary, fontSize: 20 }}>›</Text>
                  ) : null}
                </Row>
              </Card>
            </Pressable>
          )}
          ListEmptyComponent={
            <EmptyState
              title="No players yet"
              message={
                writable
                  ? 'Add your roster so analysis can grade players by name instead of by position.'
                  : 'No players have been added to this team yet.'
              }
              actionLabel={writable ? 'Add player' : undefined}
              onAction={writable ? () => setAdding(true) : undefined}
            />
          }
        />
      )}

      <PlayerSheet
        visible={adding || !!editing}
        player={editing}
        busy={busy}
        onClose={() => {
          setAdding(false);
          setEditing(null);
        }}
        onSave={onSave}
        onRequestRemove={editing ? () => setRemoving(editing) : undefined}
      />

      <ConfirmationSheet
        visible={!!removing}
        title="Remove this player?"
        message={
          removing
            ? `${`${removing.first_name ?? ''} ${removing.last_name ?? ''}`.trim() || 'This player'} will be removed from the roster. Analyses already saved keep their grades.`
            : undefined
        }
        confirmLabel={busy ? 'Removing…' : 'Remove player'}
        destructive
        onConfirm={onRemove}
        onClose={() => setRemoving(null)}
      />
    </>
  );
}

const SIDES: { value: SideOfBall | ''; label: string }[] = [
  { value: 'offense', label: 'Offense' },
  { value: 'defense', label: 'Defense' },
  { value: 'both', label: 'Both' },
];

function PlayerSheet({
  visible,
  player,
  busy,
  onClose,
  onSave,
  onRequestRemove,
}: {
  visible: boolean;
  player: Player | null;
  busy: boolean;
  onClose: () => void;
  onSave: (draft: PlayerDraft) => void;
  onRequestRemove?: () => void;
}) {
  const theme = useTheme();
  const [draft, setDraft] = useState<PlayerDraft>(EMPTY_DRAFT);
  // Re-seed whenever the sheet opens on a different player, so an edit never
  // starts from the previous player's values.
  const [seededFor, setSeededFor] = useState<string | null>(null);
  const key = player?.id ?? 'new';
  if (visible && seededFor !== key) {
    setSeededFor(key);
    setDraft(player ? draftFromPlayer(player) : EMPTY_DRAFT);
  }
  if (!visible && seededFor !== null) setSeededFor(null);

  const set = (k: keyof PlayerDraft) => (v: string) => setDraft((d) => ({ ...d, [k]: v }));
  const named = draft.firstName.trim() !== '' || draft.lastName.trim() !== '';

  return (
    <BottomSheet visible={visible} onClose={onClose} title={player ? 'Edit player' : 'Add player'}>
      <ScrollView keyboardShouldPersistTaps="handled" style={{ maxHeight: 480 }}>
        <Row gap={12}>
          <Field
            label="First name"
            value={draft.firstName}
            onChangeText={set('firstName')}
            autoCapitalize="words"
            containerStyle={{ flex: 1 }}
          />
          <Field
            label="Last name"
            value={draft.lastName}
            onChangeText={set('lastName')}
            autoCapitalize="words"
            containerStyle={{ flex: 1 }}
          />
        </Row>

        <Field
          label="Jersey number"
          value={draft.jerseyNumber}
          onChangeText={set('jerseyNumber')}
          keyboardType="number-pad"
          hint="Unlocks player-level grading. Leave blank if they don't have one yet."
        />

        <Row gap={12}>
          <Field
            label="Position"
            value={draft.primaryPosition}
            onChangeText={set('primaryPosition')}
            autoCapitalize="characters"
            placeholder="QB"
            containerStyle={{ flex: 1 }}
          />
          <Field
            label="Second position"
            value={draft.secondaryPosition}
            onChangeText={set('secondaryPosition')}
            autoCapitalize="characters"
            placeholder="LB"
            containerStyle={{ flex: 1 }}
          />
        </Row>

        <Text role="label" style={{ marginBottom: 6 }}>
          Side of ball
        </Text>
        <View style={{ marginBottom: 16 }}>
          <SegmentedControl
            segments={SIDES.map((s) => ({ value: s.value as string, label: s.label }))}
            value={draft.sideOfBall}
            onChange={(v) => setDraft((d) => ({ ...d, sideOfBall: v as SideOfBall }))}
          />
        </View>

        <Field
          label="Grade / year"
          value={draft.gradeLevel}
          onChangeText={set('gradeLevel')}
          placeholder="5th"
        />
      </ScrollView>

      <View style={{ marginTop: 8 }}>
        <Button
          label={busy ? 'Saving…' : player ? 'Save changes' : 'Add player'}
          onPress={() => onSave(draft)}
          loading={busy}
          disabled={busy || !named}
        />
        {!named ? (
          <Text role="metadata" color="textSecondary" align="center" style={{ marginTop: 8 }}>
            Enter at least a first or last name.
          </Text>
        ) : null}
        {onRequestRemove ? (
          <Pressable
            onPress={onRequestRemove}
            accessibilityRole="button"
            style={{ marginTop: 14, alignItems: 'center' }}
          >
            <Text role="label" style={{ color: theme.colors.error }}>
              Remove from roster
            </Text>
          </Pressable>
        ) : null}
      </View>
    </BottomSheet>
  );
}

const styles = StyleSheet.create({
  jersey: { width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center' },
});
