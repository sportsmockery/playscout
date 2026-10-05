import type { ScoutReport } from '@/lib/db/types';
import type { ScoutIQGamePlan, KeyedPoint } from '@/lib/intelligence/modules/scoutiq-gameplan';
import type { OffenseScout } from '@/lib/intelligence/scoutiq-aggregate';
import type { DefensiveProfile } from '@/lib/intelligence/aggregate-defense';
import { OFFENSIVE_PLAY_TYPE_LABELS, type OffensivePlayType } from '@/lib/intelligence/offense-structure';
import { positionLabel } from '@/lib/intelligence/positions';
import RoleBriefs, { PointList, Section } from './RoleBriefs';

/**
 * A scouting report as TWO reports: the opponent with the ball, and the
 * opponent defending. They answer different questions for different coaches —
 * the defensive staff plans against the first, the offensive staff attacks the
 * second — and mixing them made every count's denominator ambiguous.
 *
 * Every count shown carries the clips or snaps it was counted over, the same
 * rule the game-plan prompt enforces.
 */

type Ranked = { point: string; category?: string; clips: number; clip_labels?: string[] };

/** "Clips 37, 52, 60" — the plays to pull up in Hudl. */
function ClipRefs({ labels, max = 6 }: { labels?: string[]; max?: number }) {
  if (!labels?.length) return null;
  const nums = labels.map((l) => l.replace(/^clip\s*/i, ''));
  const shown = nums.slice(0, max).join(', ');
  return (
    <span className="block text-[11px] text-[var(--brand-muted)] mt-0.5">
      {labels.length === 1 ? 'Clip' : 'Clips'} {shown}
      {nums.length > max ? ` +${nums.length - max} more` : ''}
    </span>
  );
}

function pct(n: number, d: number): string {
  return d ? `${Math.round((n / d) * 100)}%` : '—';
}

function Bullets({ items }: { items?: string[] }) {
  if (!items?.length) return null;
  return (
    <ul className="space-y-1.5">
      {items.map((item, i) => (
        <li key={i} className="flex items-start gap-2 text-sm text-[var(--brand-ink)]">
          <span className="w-1.5 h-1.5 rounded-full bg-[var(--brand-gold)] flex-shrink-0 mt-1.5" />
          <span className="min-w-0">{item}</span>
        </li>
      ))}
    </ul>
  );
}

function RankedList({ points, of, unit }: { points: Ranked[]; of: number; unit: string }) {
  if (!points.length) return <p className="text-sm text-[var(--brand-muted)]">Nothing recorded yet.</p>;
  return (
    <ol className="space-y-1.5">
      {points.map((a, i) => (
        <li key={i} className="flex items-start gap-2 text-sm text-[var(--brand-ink)]">
          <span
            className="shrink-0 font-mono text-[11px] tabular-nums text-[var(--brand-muted)] mt-0.5"
            title={`Seen in ${a.clips} of ${of} clips ${unit}`}
          >
            {a.clips}/{of}
          </span>
          {a.category && (
            <span className="shrink-0 text-[10px] font-semibold uppercase tracking-wide px-1.5 py-0.5 rounded border border-[var(--brand-border)] text-[var(--brand-navy)] mt-0.5">
              {a.category.replace(/_/g, ' ')}
            </span>
          )}
          <span className="min-w-0">
            {a.point}
            <ClipRefs labels={a.clip_labels} />
          </span>
        </li>
      ))}
    </ol>
  );
}

/** Label/value rows, each value carrying its own denominator. */
function Facts({ rows }: { rows: [string, string][] }) {
  if (!rows.length) return null;
  return (
    <dl className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-1.5 text-sm">
      {rows.map(([k, v]) => (
        <div key={k} className="flex justify-between gap-3 border-b border-[var(--brand-border)] py-1 min-w-0">
          <dt className="text-[var(--brand-muted)]">{k}</dt>
          <dd className="text-[var(--brand-ink)] text-right tabular-nums">{v}</dd>
        </div>
      ))}
    </dl>
  );
}

function SideHeader({ title, subtitle }: { title: string; subtitle: string }) {
  return (
    <div className="rounded-lg bg-[var(--brand-navy)] text-white px-4 py-3">
      <h3 className="text-sm font-bold uppercase tracking-wide">{title}</h3>
      <p className="text-xs text-white/80 mt-0.5">{subtitle}</p>
    </div>
  );
}

function Identity({ block }: { block?: { summary: string; identity: KeyedPoint[] } }) {
  if (!block) return null;
  return (
    <div className="space-y-3">
      {block.summary && <p className="text-sm text-[var(--brand-ink)]">{block.summary}</p>}
      {block.identity?.length > 0 && (
        <Section title="Who they are">
          <PointList points={block.identity} />
        </Section>
      )}
    </div>
  );
}

function offenseFacts(o: OffenseScout): [string, string][] {
  const p = o.profile;
  const rows: [string, string][] = [];
  if (!p?.snaps) return rows;
  const top = <T extends string>(
    block: { readable: number; distribution: { value: T; count: number }[] },
    show: (v: T) => string
  ) =>
    block.readable
      ? block.distribution
          .slice(0, 3)
          .map((d) => `${show(d.value)} ${d.count}/${block.readable}`)
          .join(' · ')
      : 'not readable';
  rows.push(['Snaps charted', String(p.snaps)]);
  if (p.runPass.readable) {
    rows.push(['Run / pass', `${p.runPass.runs} run · ${p.runPass.passes} pass (${pct(p.runPass.runs, p.runPass.readable)} run)`]);
  }
  rows.push(['Formation', top(p.formations, (v) => v.replace(/_/g, ' '))]);
  rows.push(['Play type', top(p.playTypes, (v) => OFFENSIVE_PLAY_TYPE_LABELS[v as OffensivePlayType] ?? v)]);
  rows.push(['Run direction', top(p.runDirection, (v) => v)]);
  rows.push(['Motion', top(p.motion, (v) => v.replace(/_/g, ' '))]);
  rows.push(['Who gets the ball', top(p.ballCarriers, (v) => positionLabel(v))]);
  if (p.gain) rows.push(['Average gain', `${p.gain.mean} yds (${p.gain.measured} measured)`]);
  rows.push(['Explosive plays', String(p.explosive.count)]);
  rows.push(['Turnovers', String(p.turnovers)]);
  return rows;
}

function defenseFacts(profile: DefensiveProfile | undefined, fronts: { name: string; clips: number }[]): [string, string][] {
  const rows: [string, string][] = [];
  if (fronts?.length) rows.push(['Front', fronts.slice(0, 3).map((f) => `${f.name.replace(/_/g, ' ')} (${f.clips})`).join(' · ')]);
  if (!profile?.snaps) return rows;
  const top = (block: { readable: number; distribution: { value: string; count: number }[] }) =>
    block.readable
      ? block.distribution.slice(0, 2).map((d) => `${d.value.replace(/_/g, ' ')} ${d.count}/${block.readable}`).join(' · ')
      : 'not readable';
  rows.push(['Snaps charted', String(profile.snaps)]);
  rows.push(['Pre-snap shell', top(profile.shells)]);
  rows.push(['Coverage played', top(profile.coverages)]);
  if (profile.pressure.readable) {
    rows.push(['Brought 5+', `${profile.pressure.blitzed}/${profile.pressure.readable} (${pct(profile.pressure.blitzed, profile.pressure.readable)})`]);
  }
  if (profile.boxCount) rows.push(['Box count', `${profile.boxCount.mean} avg (${profile.boxCount.measured} snaps)`]);
  return rows;
}

export default function ScoutSides({ report, opponentName }: { report: ScoutReport; opponentName: string }) {
  const plan = report.game_plan as ScoutIQGamePlan | null;
  const offense = report.offense_scout as OffenseScout | null;
  const defense = report.defense_scout as { clips: number; fronts: { name: string; clips: number }[]; profile?: DefensiveProfile } | null;
  const sufficiency = report.evidence_sufficiency as
    | { defensive_clips?: number; offensive_clips?: number; unconfirmed_subject_clips?: number }
    | null;
  const defensiveClips = defense?.clips ?? sufficiency?.defensive_clips ?? report.based_on_video_ids.length;
  const offensiveClips = offense?.clips ?? sufficiency?.offensive_clips ?? 0;
  const attackPoints = (report.attack_points ?? []) as Ranked[];
  const dc = plan?.defensive_coordinator_brief;

  return (
    <div className="space-y-8">
      {/* ── THEIR OFFENSE ─────────────────────────────────────────── */}
      <section className="space-y-4">
        <SideHeader
          title={`${opponentName} on offense`}
          subtitle={`How we stop them · from ${offensiveClips} clip${offensiveClips === 1 ? '' : 's'} where they had the ball`}
        />
        <Identity block={plan?.offense_scouting} />
        {offense && <Facts rows={offenseFacts(offense)} />}
        {offense && (
          <Section title="What the film showed" hint={`Ways to stop them, ranked by how many of the ${offensiveClips} offensive clips showed each.`}>
            <RankedList points={offense.stop_points ?? []} of={offensiveClips} unit="where they had the ball" />
          </Section>
        )}
        {offense?.ball_carriers?.length ? (
          <Section title="Who carries the ball" hint="From the pre-snap check. A number appears only where it was legible.">
            <ul className="space-y-1 text-sm text-[var(--brand-ink)]">
              {offense.ball_carriers.slice(0, 8).map((b, i) => (
                <li key={i}>
                  <span className="font-semibold">{b.identifier}</span> — {b.carries} carr{b.carries === 1 ? 'y' : 'ies'}
                  <ClipRefs labels={b.clip_labels} />
                </li>
              ))}
            </ul>
          </Section>
        ) : null}
        {offense?.key_players?.length ? (
          <Section title="Players to account for">
            <ul className="space-y-1.5">
              {offense.key_players.map((p, i) => (
                <li key={i} className="text-sm text-[var(--brand-ink)]">
                  <span className="font-semibold">{p.identifier}</span>
                  {p.role ? <span className="text-[var(--brand-muted)]"> · {p.role}</span> : null} — {p.reason}{' '}
                  <span className="text-[11px] text-[var(--brand-muted)]">({p.clips} clip{p.clips === 1 ? '' : 's'})</span>
                  <ClipRefs labels={p.clip_labels} />
                </li>
              ))}
            </ul>
          </Section>
        ) : null}
        {offense?.explosive_plays?.length ? (
          <Section title="Their big plays" hint="10+ yards or a touchdown — the clips to show your defense.">
            <ul className="space-y-1 text-sm text-[var(--brand-ink)]">
              {offense.explosive_plays.map((e, i) => (
                <li key={i} className="flex gap-2">
                  <span className="shrink-0 font-mono text-[11px] tabular-nums text-[var(--brand-muted)] mt-0.5 w-14">
                    {e.clip.replace(/^clip\s*/i, '#')}
                  </span>
                  <span className="min-w-0">
                    {(OFFENSIVE_PLAY_TYPE_LABELS[e.play_type as OffensivePlayType] ?? e.play_type).toString()}
                    {e.gain != null ? `, ${e.gain} yds` : ''}
                    {e.result === 'touchdown' ? ', touchdown' : ''}
                  </span>
                </li>
              ))}
            </ul>
          </Section>
        ) : null}
        {dc && (
          <div className="glass-card p-5 print:border print:shadow-none space-y-4">
            <h3 className="text-sm font-bold uppercase tracking-wide text-[var(--brand-navy)]">Defensive Coordinator Brief</h3>
            {dc.stop_first?.length > 0 && <Section title="Stop this first"><PointList points={dc.stop_first} /></Section>}
            {dc.formation_and_motion_tells?.length > 0 && (
              <Section title="Formation and motion tells"><PointList points={dc.formation_and_motion_tells} /></Section>
            )}
            {dc.situational?.length > 0 && <Section title="By situation"><PointList points={dc.situational} /></Section>}
            {dc.players_to_account_for?.length > 0 && (
              <Section title="Their players"><PointList points={dc.players_to_account_for} /></Section>
            )}
          </div>
        )}
        {plan?.defensive_game_plan?.length ? (
          <Section title="How to stop them"><Bullets items={plan.defensive_game_plan} /></Section>
        ) : null}
      </section>

      {/* ── THEIR DEFENSE ─────────────────────────────────────────── */}
      <section className="space-y-4">
        <SideHeader
          title={`${opponentName} on defense`}
          subtitle={`How we attack them · from ${defensiveClips} clip${defensiveClips === 1 ? '' : 's'} where they were defending`}
        />
        <Identity block={plan?.defense_scouting} />
        <Facts rows={defenseFacts(defense?.profile, defense?.fronts ?? [])} />
        <Section
          title="What the film showed"
          hint={`Ways to attack them, ranked by how many of the ${defensiveClips} defensive clips showed each.${
            sufficiency?.unconfirmed_subject_clips
              ? ` On ${sufficiency.unconfirmed_subject_clips} clip${sufficiency.unconfirmed_subject_clips === 1 ? '' : 's'} PlayScout could not confirm it was watching the right team — treat those findings more loosely.`
              : ''
          }`}
        >
          <RankedList points={attackPoints} of={defensiveClips} unit="where they were defending" />
        </Section>
        <RoleBriefs plan={plan} parts={['qb', 'oc']} />
        {plan?.target_players_plan?.length ? (
          <Section title="Defenders to target"><Bullets items={plan.target_players_plan} /></Section>
        ) : null}
        {plan?.offensive_game_plan?.length ? (
          <Section title="How to attack them"><Bullets items={plan.offensive_game_plan} /></Section>
        ) : null}
      </section>

      {plan?.practice_week_focus?.length ? (
        <section className="space-y-2">
          <h3 className="text-xs font-bold text-[var(--brand-navy)] uppercase tracking-wide">This Week At Practice</h3>
          <Bullets items={plan.practice_week_focus} />
        </section>
      ) : null}

      <RoleBriefs plan={plan} parts={['not_observed']} />
    </div>
  );
}
