import { getTeamById } from '@/lib/db/queries';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ArrowLeft, Settings } from 'lucide-react';
import TeamSettingsClient from './TeamSettingsClient';

export async function generateMetadata({ params }: { params: Promise<{ teamId: string }> }) {
  const { teamId } = await params;
  const team = await getTeamById(teamId);
  return { title: `Settings — ${team?.name ?? 'Team'}` };
}

export default async function TeamSettingsPage({
  params,
}: {
  params: Promise<{ teamId: string }>;
}) {
  const { teamId } = await params;
  const team = await getTeamById(teamId);

  if (!team) notFound();

  return (
    <div className="p-6 max-w-2xl mx-auto">
      <Link
        href={`/teams/${teamId}`}
        className="flex items-center gap-2 text-sm text-[var(--brand-muted)] hover:text-[var(--brand-navy)] transition-colors mb-6"
      >
        <ArrowLeft size={16} />
        {team.name}
      </Link>

      <div className="flex items-center gap-3 mb-8">
        <div className="w-10 h-10 rounded-xl bg-[var(--brand-navy)]/10 flex items-center justify-center">
          <Settings size={20} className="text-[var(--brand-navy)]" />
        </div>
        <div>
          <h1 className="text-2xl font-bold text-[var(--brand-navy)]">Team Settings</h1>
          <p className="text-[var(--brand-muted)] text-sm">Edit {team.name}&apos;s profile</p>
        </div>
      </div>

      <TeamSettingsClient team={team} />
    </div>
  );
}
