'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { createClient as createBrowserClient } from '@/lib/supabase/client';
import { ArrowLeft, Users } from 'lucide-react';

const AGE_GROUPS = [
  '6U', '7U', '8U', '9U', '10U', '11U', '12U',
  '13U', '14U', 'JV', 'Varsity', 'Adult',
];

const LEVELS = ['Recreation', 'Travel', 'High School', 'College', 'Semi-Pro', 'Other'];

export default function NewTeamPage() {
  const router = useRouter();
  const supabase = createBrowserClient();

  const [name, setName] = useState('');
  const [ageGroup, setAgeGroup] = useState('');
  const [season, setSeason] = useState(new Date().getFullYear().toString());
  const [level, setLevel] = useState('');
  const [homeJerseyColor, setHomeJerseyColor] = useState('');
  const [awayJerseyColor, setAwayJerseyColor] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError('');

    const { data: { user } } = await supabase.auth.getUser();
    if (!user) { router.push('/login'); return; }

    const { data: membership } = await supabase
      .from('organization_members')
      .select('organization_id')
      .eq('user_id', user.id)
      .limit(1)
      .maybeSingle();

    let organizationId = membership?.organization_id;

    if (!organizationId) {
      const { data: org, error: orgError } = await supabase
        .from('organizations')
        .insert({ name: `${name || 'My'} Organization`, created_by: user.id })
        .select()
        .single();

      if (orgError) {
        setError(orgError.message);
        setLoading(false);
        return;
      }

      const { error: memberError } = await supabase
        .from('organization_members')
        .insert({ organization_id: org.id, user_id: user.id, role: 'owner' });

      if (memberError) {
        setError(memberError.message);
        setLoading(false);
        return;
      }

      organizationId = org.id;
    }

    const baseTeam = {
      organization_id: organizationId,
      name,
      age_group: ageGroup || null,
      season,
      level: level || null,
      home_jersey_color: homeJerseyColor || null,
      away_jersey_color: awayJerseyColor || null,
    };

    // Prefer setting created_by (used by team-access). If the column hasn't been
    // migrated yet (016_team_access), fall back so team creation still works.
    let { data, error: insertError } = await supabase
      .from('teams')
      .insert({ ...baseTeam, created_by: user.id })
      .select()
      .single();

    if (insertError && /created_by/i.test(insertError.message)) {
      ({ data, error: insertError } = await supabase
        .from('teams')
        .insert(baseTeam)
        .select()
        .single());
    }

    if (insertError || !data) {
      setError(insertError?.message ?? 'Could not create team.');
      setLoading(false);
      return;
    }

    router.push(`/teams/${data.id}`);
  }

  const inputClass =
    'w-full px-4 py-3 rounded-lg border border-[var(--brand-border)] bg-white text-[var(--brand-ink)] text-sm focus:outline-none focus:ring-2 focus:ring-[var(--brand-navy)] focus:border-transparent transition-all';

  return (
    <div className="p-6 max-w-2xl mx-auto">
      <Link
        href="/teams"
        className="flex items-center gap-2 text-sm text-[var(--brand-muted)] hover:text-[var(--brand-navy)] transition-colors mb-6"
      >
        <ArrowLeft size={16} />
        Back to Teams
      </Link>

      <div className="glass-card p-8">
        <div className="flex items-center gap-3 mb-6">
          <div className="w-10 h-10 rounded-xl bg-[var(--brand-navy)] flex items-center justify-center">
            <Users size={20} className="text-[var(--brand-gold)]" />
          </div>
          <div>
            <h1 className="text-xl font-bold text-[var(--brand-navy)]">Create New Team</h1>
            <p className="text-sm text-[var(--brand-muted)]">Set up your team profile</p>
          </div>
        </div>

        <form onSubmit={handleSubmit} className="space-y-5">
          <div>
            <label className="block text-sm font-medium text-[var(--brand-ink)] mb-1.5">
              Team Name <span className="text-red-500">*</span>
            </label>
            <input
              type="text"
              required
              placeholder="e.g. Eastside Eagles"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className={inputClass}
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-[var(--brand-ink)] mb-1.5">
                Age Group
              </label>
              <select
                value={ageGroup}
                onChange={(e) => setAgeGroup(e.target.value)}
                className={inputClass}
              >
                <option value="">Select age group</option>
                {AGE_GROUPS.map((ag) => (
                  <option key={ag} value={ag}>{ag}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-[var(--brand-ink)] mb-1.5">
                Season
              </label>
              <input
                type="text"
                placeholder={new Date().getFullYear().toString()}
                value={season}
                onChange={(e) => setSeason(e.target.value)}
                className={inputClass}
              />
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-[var(--brand-ink)] mb-1.5">
              Level
            </label>
            <select
              value={level}
              onChange={(e) => setLevel(e.target.value)}
              className={inputClass}
            >
              <option value="">Select level</option>
              {LEVELS.map((l) => (
                <option key={l} value={l}>{l}</option>
              ))}
            </select>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-[var(--brand-ink)] mb-1.5">
                Home Jersey Colors
              </label>
              <input
                type="text"
                placeholder="e.g. 'Blue jerseys, navy helmets'"
                value={homeJerseyColor}
                onChange={(e) => setHomeJerseyColor(e.target.value)}
                className={inputClass}
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-[var(--brand-ink)] mb-1.5">
                Away Jersey Colors
              </label>
              <input
                type="text"
                placeholder="e.g. 'White jerseys, navy helmets'"
                value={awayJerseyColor}
                onChange={(e) => setAwayJerseyColor(e.target.value)}
                className={inputClass}
              />
            </div>
          </div>
          <p className="text-xs text-[var(--brand-muted)] -mt-3">
            Helps AI analysis correctly tell your team apart from the opponent on film — you&apos;ll pick which one applies per video when running a module.
          </p>

          {error && (
            <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">
              {error}
            </p>
          )}

          <div className="flex gap-3 pt-2">
            <Link
              href="/teams"
              className="flex-1 text-center py-3 rounded-lg border border-[var(--brand-border)] text-sm font-semibold text-[var(--brand-muted)] hover:bg-[var(--brand-bg)] transition-colors"
            >
              Cancel
            </Link>
            <button
              type="submit"
              disabled={loading || !name}
              className="flex-1 flex items-center justify-center gap-2 bg-[var(--brand-navy)] text-white font-semibold py-3 rounded-lg hover:bg-[var(--brand-navy-dark)] transition-colors disabled:opacity-60 disabled:cursor-not-allowed"
            >
              {loading ? (
                <span className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
              ) : (
                'Create Team'
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
