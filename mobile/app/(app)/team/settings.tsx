import React, { useState } from 'react';
import { useRouter } from 'expo-router';
import { Screen, TopBar, Card, Text, ErrorState, Skeleton, useToast } from '@/components';
import { useTheme } from '@/theme/ThemeProvider';
import { useBootstrap, qk } from '@/hooks/queries';
import { useTeamStore } from '@/stores/teamStore';
import { canWrite, writeDeniedReason } from '@/utils/roles';
import { updateTeamSettings } from '@/lib/api/endpoints';
import { useQueryClient } from '@tanstack/react-query';
import {
  TeamForm,
  teamFormFrom,
  toTeamInput,
  type TeamFormValues,
} from '@/features/teams/TeamForm';

/** Team settings. The same fields the web offers, from the same form. */
export default function TeamSettingsScreen() {
  const theme = useTheme();
  const router = useRouter();
  const toast = useToast();
  const queryClient = useQueryClient();
  const { activeTeam, setActiveTeam } = useTeamStore();
  const bootstrap = useBootstrap();

  const team = bootstrap.data?.teams.find((t) => t.id === activeTeam?.id) ?? null;
  const [values, setValues] = useState<TeamFormValues | null>(null);
  const [busy, setBusy] = useState(false);

  // Seed once the team row arrives, without clobbering edits in progress.
  if (team && values === null) setValues(teamFormFrom(team));

  const writable = canWrite(activeTeam?.role);

  async function save() {
    if (!values || !activeTeam) return;
    setBusy(true);
    try {
      const res = await updateTeamSettings(activeTeam.id, toTeamInput(values));
      // The switcher and every level-calibrated screen read from the store, so
      // it has to follow a rename or an age-group change immediately.
      setActiveTeam({
        id: res.team.id,
        name: res.team.name,
        ageGroup: res.team.age_group,
        level: res.team.level,
        role: activeTeam.role,
      });
      queryClient.invalidateQueries({ queryKey: qk.bootstrap });
      toast('Team settings saved.', 'success');
      router.back();
    } catch (e) {
      toast(e instanceof Error ? e.message : 'Could not save these settings', 'error');
    } finally {
      setBusy(false);
    }
  }

  if (bootstrap.isLoading || (!team && !bootstrap.isError)) {
    return (
      <>
        <TopBar title="Team settings" />
        <Screen>
          <Skeleton height={140} />
          <Skeleton height={200} style={{ marginTop: 12 }} />
        </Screen>
      </>
    );
  }

  if (bootstrap.isError || !values) {
    return (
      <>
        <TopBar title="Team settings" />
        <Screen>
          <ErrorState message="Couldn’t load this team." onRetry={() => bootstrap.refetch()} />
        </Screen>
      </>
    );
  }

  return (
    <>
      <TopBar title="Team settings" />
      <Screen>
        {!writable ? (
          <Card style={{ marginTop: 12, borderColor: theme.colors.warning }}>
            <Text role="body">{writeDeniedReason(activeTeam?.role)}</Text>
          </Card>
        ) : (
          <TeamForm
            mode="edit"
            values={values}
            onChange={setValues}
            onSubmit={save}
            submitLabel={busy ? 'Saving…' : 'Save changes'}
            busy={busy}
          />
        )}
      </Screen>
    </>
  );
}
