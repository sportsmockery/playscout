import { redirect } from 'next/navigation';
import { createClient as createServerClient } from '@/lib/supabase/server';
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

  return <AppShell>{children}</AppShell>;
}
