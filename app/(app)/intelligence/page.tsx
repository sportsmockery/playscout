import { createClient as createServerClient } from '@/lib/supabase/server';
import { getTeams } from '@/lib/db/queries';
import PlayScoutIQ from '@/components/intelligence/PlayScoutIQ';

export const metadata = { title: 'PlayScoutIQ' };

export default async function IntelligenceRootPage() {
  const supabase = await createServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  const teams = await getTeams(user!.id);
  const firstTeam = teams[0] ?? null;

  return (
    <div className="p-6 max-w-4xl mx-auto">
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-[var(--brand-navy)]">PlayScoutIQ</h1>
        <p className="text-[var(--brand-muted)] text-sm mt-0.5">
          Your AI football coaching companion
        </p>
      </div>
      <PlayScoutIQ
        teamId={firstTeam?.id}
        teamName={firstTeam?.name}
        ageGroup={firstTeam?.age_group ?? undefined}
        fullPage
      />
    </div>
  );
}
