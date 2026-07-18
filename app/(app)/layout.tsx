import { redirect } from 'next/navigation';
import { createClient as createServerClient } from '@/lib/supabase/server';
import { getTeams } from '@/lib/db/queries';
import { isAdminRole } from '@/lib/auth/roles';
import AppShell from '@/components/dashboard/AppShell';

export default async function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const supabase = await createServerClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    redirect('/login');
  }

  const { data: membership } = await supabase
    .from('organization_members')
    .select('role')
    .eq('user_id', user.id)
    .maybeSingle();
  const isAdmin = isAdminRole(membership?.role);

  // Film Library and the module pages only exist scoped to a team. Pages
  // outside a team's URL (dashboard, the plain /teams list) have no teamId
  // to give Sidebar, so fall back to the user's most recently created team
  // — one-click nav instead of bouncing through a team picker every time.
  const teams = await getTeams(user.id);
  const defaultTeamId = teams[0]?.id;

  return <AppShell defaultTeamId={defaultTeamId} isAdmin={isAdmin}>{children}</AppShell>;
}
