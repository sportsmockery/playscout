'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { createClient as createBrowserClient } from '@/lib/supabase/client';
import { CheckCircle2 } from 'lucide-react';
import type { Team } from '@/lib/db/types';

const AGE_GROUPS = [
  '6U', '7U', '8U', '9U', '10U', '11U', '12U',
  '13U', '14U', 'JV', 'Varsity', 'Adult',
];

const LEVELS = ['Recreation', 'Travel', 'High School', 'College', 'Semi-Pro', 'Other'];

interface Props {
  team: Team;
}

export default function TeamSettingsClient({ team }: Props) {
  const router = useRouter();
  const supabase = createBrowserClient();

  const [name, setName] = useState(team.name ?? '');
  const [ageGroup, setAgeGroup] = useState(team.age_group ?? '');
  const [season, setSeason] = useState(team.season ?? '');
  const [level, setLevel] = useState(team.level ?? '');
  const [league, setLeague] = useState(team.league ?? '');
  const [state, setState] = useState(team.state ?? '');
  const [offensiveStyle, setOffensiveStyle] = useState(team.offensive_style ?? '');
  const [defensiveStyle, setDefensiveStyle] = useState(team.defensive_style ?? '');
  const [homeJerseyColor, setHomeJerseyColor] = useState(team.home_jersey_color ?? '');
  const [awayJerseyColor, setAwayJerseyColor] = useState(team.away_jersey_color ?? '');
  const [notes, setNotes] = useState(team.notes ?? '');

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [saved, setSaved] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError('');
    setSaved(false);

    const { error: updateError } = await supabase
      .from('teams')
      .update({
        name,
        age_group: ageGroup || null,
        season: season || null,
        level: level || null,
        league: league || null,
        state: state || null,
        offensive_style: offensiveStyle || null,
        defensive_style: defensiveStyle || null,
        home_jersey_color: homeJerseyColor || null,
        away_jersey_color: awayJerseyColor || null,
        notes: notes || null,
      })
      .eq('id', team.id);

    setLoading(false);

    if (updateError) {
      setError(updateError.message);
      return;
    }

    setSaved(true);
    router.refresh();
  }

  const inputClass =
    'w-full px-4 py-3 rounded-lg border border-[var(--brand-border)] bg-white text-[var(--brand-ink)] text-sm focus:outline-none focus:ring-2 focus:ring-[var(--brand-navy)] focus:border-transparent transition-all placeholder:text-[var(--brand-muted)]';

  return (
    <form onSubmit={handleSubmit} className="glass-card p-8 space-y-5">
      <div>
        <label className="block text-sm font-medium text-[var(--brand-ink)] mb-1.5">
          Team Name <span className="text-red-500">*</span>
        </label>
        <input
          type="text"
          required
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
          <select value={ageGroup} onChange={(e) => setAgeGroup(e.target.value)} className={inputClass}>
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

      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="block text-sm font-medium text-[var(--brand-ink)] mb-1.5">
            Level
          </label>
          <select value={level} onChange={(e) => setLevel(e.target.value)} className={inputClass}>
            <option value="">Select level</option>
            {LEVELS.map((l) => (
              <option key={l} value={l}>{l}</option>
            ))}
          </select>
        </div>
        <div>
          <label className="block text-sm font-medium text-[var(--brand-ink)] mb-1.5">
            League
          </label>
          <input
            type="text"
            placeholder="e.g. Tinley Park Youth Football"
            value={league}
            onChange={(e) => setLeague(e.target.value)}
            className={inputClass}
          />
        </div>
      </div>

      <div>
        <label className="block text-sm font-medium text-[var(--brand-ink)] mb-1.5">
          State
        </label>
        <input
          type="text"
          placeholder="e.g. IL"
          value={state}
          onChange={(e) => setState(e.target.value)}
          className={inputClass}
        />
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="block text-sm font-medium text-[var(--brand-ink)] mb-1.5">
            Offensive Style
          </label>
          <input
            type="text"
            placeholder="e.g. Double Wing"
            value={offensiveStyle}
            onChange={(e) => setOffensiveStyle(e.target.value)}
            className={inputClass}
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-[var(--brand-ink)] mb-1.5">
            Defensive Style
          </label>
          <input
            type="text"
            placeholder="e.g. 6-2 Youth Defense"
            value={defensiveStyle}
            onChange={(e) => setDefensiveStyle(e.target.value)}
            className={inputClass}
          />
        </div>
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
        Helps AI analysis correctly tell your team apart from the opponent on film.
      </p>

      <div>
        <label className="block text-sm font-medium text-[var(--brand-ink)] mb-1.5">
          Notes
        </label>
        <textarea
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          rows={3}
          placeholder="Anything else worth knowing about this team"
          className={`${inputClass} resize-none`}
        />
      </div>

      {error && (
        <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">
          {error}
        </p>
      )}

      <div className="flex items-center gap-3 pt-2">
        <button
          type="submit"
          disabled={loading || !name}
          className="flex items-center justify-center gap-2 bg-[var(--brand-navy)] text-white font-semibold px-6 py-3 rounded-lg hover:bg-[var(--brand-navy-dark)] transition-colors disabled:opacity-60 disabled:cursor-not-allowed"
        >
          {loading ? (
            <span className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
          ) : (
            'Save Changes'
          )}
        </button>
        {saved && !loading && (
          <span className="flex items-center gap-1.5 text-sm font-medium text-emerald-600">
            <CheckCircle2 size={16} />
            Saved
          </span>
        )}
      </div>
    </form>
  );
}
