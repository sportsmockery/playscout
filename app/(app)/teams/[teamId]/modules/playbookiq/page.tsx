import { getTeamById, getPlaybooksByTeam } from '@/lib/db/queries'
import { notFound } from 'next/navigation'
import Link from 'next/link'
import { ArrowLeft, BookOpen } from 'lucide-react'
import PlaybookIQClient from './PlaybookIQClient'

export async function generateMetadata({ params }: { params: Promise<{ teamId: string }> }) {
  const { teamId } = await params
  const team = await getTeamById(teamId)
  return { title: `PlaybookIQ — ${team?.name ?? 'Team'}` }
}

export default async function PlaybookIQPage({ params }: { params: Promise<{ teamId: string }> }) {
  const { teamId } = await params
  const [team, playbooks] = await Promise.all([
    getTeamById(teamId),
    getPlaybooksByTeam(teamId),
  ])
  if (!team) notFound()

  return (
    <div className="p-6 max-w-6xl mx-auto">
      <Link href={`/teams/${teamId}/intelligence`}
        className="flex items-center gap-1.5 text-sm text-[var(--brand-muted)] hover:text-[var(--brand-navy)] mb-2">
        <ArrowLeft size={15} /> Intelligence
      </Link>
      <div className="flex items-center gap-3 mb-8">
        <div className="w-10 h-10 rounded-xl bg-indigo-100 flex items-center justify-center">
          <BookOpen size={20} className="text-indigo-600" />
        </div>
        <div>
          <h1 className="text-2xl font-bold text-[var(--brand-navy)]">PlaybookIQ</h1>
          <p className="text-[var(--brand-muted)] text-sm">Playbook Analysis Module</p>
        </div>
      </div>
      <PlaybookIQClient
        teamId={teamId}
        teamName={team.name}
        ageGroup={team.age_group ?? undefined}
        offensiveStyle={team.offensive_style ?? undefined}
        defensiveStyle={team.defensive_style ?? undefined}
        existingPlaybooks={playbooks}
      />
    </div>
  )
}
