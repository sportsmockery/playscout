import React, { useState } from 'react';
import { useRouter } from 'expo-router';
import { Screen, TopBar, useToast } from '@/components';
import { qk } from '@/hooks/queries';
import { useTeamStore } from '@/stores/teamStore';
import { createTeam } from '@/lib/api/endpoints';
import { useQueryClient } from '@tanstack/react-query';
import { TeamForm, emptyTeamForm, toTeamInput, type TeamFormValues } from '@/features/teams/TeamForm';

/**
 * Create a team.
 *
 * The organization is resolved server-side in one round trip — the web does its
 * org bootstrap as three separate client calls, and a phone that loses signal
 * partway through that leaves an organization with no team in it.
 */
export default function NewTeamScreen() {
  const router = useRouter();
  const toast = useToast();
  const queryClient = useQueryClient();
  const { setActiveTeam } = useTeamStore();
  const [values, setValues] = useState<TeamFormValues>(emptyTeamForm);
  const [busy, setBusy] = useState(false);

  async function submit() {
    setBusy(true);
    try {
      const res = await createTeam(toTeamInput(values));
      queryClient.invalidateQueries({ queryKey: qk.bootstrap });
      // A team you just made is the team you want to be on.
      setActiveTeam({
        id: res.team.id,
        name: res.team.name,
        ageGroup: res.team.age_group,
        level: res.team.level,
        role: 'owner',
      });
      toast('Team created.', 'success');
      router.replace('/(app)/(tabs)/home');
    } catch (e) {
      toast(e instanceof Error ? e.message : 'Could not create this team', 'error');
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <TopBar title="New team" />
      <Screen>
        <TeamForm
          mode="create"
          values={values}
          onChange={setValues}
          onSubmit={submit}
          submitLabel={busy ? 'Creating…' : 'Create team'}
          busy={busy}
        />
      </Screen>
    </>
  );
}
