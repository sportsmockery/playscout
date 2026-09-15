import { AlertTriangle, Info } from 'lucide-react';
import type { StatLine, TeamStatTotals } from '@/lib/intelligence/stat-lines';

/**
 * StatsIQ's box score.
 *
 * Laid out the way a box score is laid out — rushing, passing, receiving,
 * defense — because that is the format every coach already knows how to read,
 * and a stat sheet that needs explaining is a stat sheet that gets ignored.
 *
 * The one thing this adds to the familiar shape is honesty about its own
 * limits. Rows are labelled by POSITION unless a jersey number survived
 * verification, and the header says so; plays whose yardage the film could not
 * measure are reported rather than averaged in. A coach who knows which
 * numbers are soft can use the hard ones.
 *
 * Presentational only (no hooks, no server APIs), so the module screen, the
 * saved report and the combined batch report all render the same component
 * instead of three drifting copies.
 */

export interface BoxScoreProps {
  lines: StatLine[];
  team: TeamStatTotals;
  warnings?: string[];
  /** Shown above the tables — e.g. "Across 24 clips". */
  subtitle?: string;
  compact?: boolean;
}

function avg(yards: number, attempts: number): string {
  if (attempts <= 0) return '—';
  return (Math.round((yards / attempts) * 10) / 10).toFixed(1);
}

function Table({
  title,
  columns,
  rows,
  totals,
}: {
  title: string;
  columns: string[];
  rows: { key: string; label: React.ReactNode; cells: (string | number)[] }[];
  totals?: (string | number)[];
}) {
  if (!rows.length) return null;
  return (
    <div className="mb-5 last:mb-0">
      <h4 className="text-xs font-bold uppercase tracking-wide text-[var(--brand-navy)] mb-2">{title}</h4>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-[var(--brand-border)]">
              <th className="text-left text-[11px] font-semibold uppercase tracking-wide text-[var(--brand-muted)] py-1.5 pr-3">
                Player
              </th>
              {columns.map((c) => (
                <th
                  key={c}
                  className="text-right text-[11px] font-semibold uppercase tracking-wide text-[var(--brand-muted)] py-1.5 px-2 whitespace-nowrap"
                >
                  {c}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.key} className="border-b border-[var(--brand-border)] last:border-0">
                <td className="py-1.5 pr-3 text-[var(--brand-ink)]">{r.label}</td>
                {r.cells.map((cell, i) => (
                  <td key={i} className="py-1.5 px-2 text-right tabular-nums text-[var(--brand-ink)]">
                    {cell}
                  </td>
                ))}
              </tr>
            ))}
            {totals && (
              <tr className="border-t-2 border-[var(--brand-border-strong)]">
                <td className="py-1.5 pr-3 font-bold text-[var(--brand-navy)]">Team</td>
                {totals.map((cell, i) => (
                  <td key={i} className="py-1.5 px-2 text-right tabular-nums font-bold text-[var(--brand-navy)]">
                    {cell}
                  </td>
                ))}
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

/** A row's name, with the honest caveat attached when it is a position row. */
function PlayerLabel({ line }: { line: StatLine }) {
  return (
    <span className="inline-flex items-baseline gap-1.5 flex-wrap">
      <span className="font-medium">{line.identifier}</span>
      {line.identifiedBy === 'position' ? (
        <span
          className="text-[10px] text-[var(--brand-muted)]"
          title="No jersey number was legible and verified on this film, so this row is the position. If two players rotated through it, their stats are combined here."
        >
          by position
        </span>
      ) : line.positions.length > 1 ? (
        <span className="text-[10px] text-[var(--brand-muted)]">
          {line.positions.length} positions
        </span>
      ) : null}
    </span>
  );
}

export default function BoxScore({ lines, team, warnings = [], subtitle, compact }: BoxScoreProps) {
  const offense = lines.filter((l) => l.side === 'offense');
  const defense = lines.filter((l) => l.side === 'defense');

  const rushing = offense.filter((l) => l.offense.carries > 0);
  const passing = offense.filter((l) => l.offense.pass_attempts > 0);
  const receiving = offense.filter((l) => l.offense.targets > 0 || l.offense.receptions > 0);
  const defenders = defense.filter(
    (l) =>
      l.defense.total_tackles > 0 ||
      l.defense.interceptions > 0 ||
      l.defense.forced_fumbles > 0 ||
      l.defense.mistakes > 0
  );

  const o = team.offense;
  const d = team.defense;
  const unmeasured = team.unmeasured.rush + team.unmeasured.pass + team.unmeasured.receiving;

  if (!lines.length) {
    return (
      <div className="glass-card p-5 print:border print:shadow-none">
        <h3 className="font-bold text-[var(--brand-navy)] text-sm uppercase tracking-wide mb-2">Box Score</h3>
        <p className="text-sm text-[var(--brand-muted)]">
          Nothing could be charted from this film. That usually means the two teams could not be
          told apart, or the clip starts after the ball is already out — try setting your jersey
          colour and which side you were on.
        </p>
      </div>
    );
  }

  return (
    <div className="glass-card p-5 print:border print:shadow-none">
      <div className="flex items-baseline justify-between gap-3 flex-wrap mb-1">
        <h3 className="font-bold text-[var(--brand-navy)] text-sm uppercase tracking-wide">Box Score</h3>
        <span className="text-[11px] text-[var(--brand-muted)]">
          {subtitle ?? `${team.plays} play${team.plays === 1 ? '' : 's'} charted`}
        </span>
      </div>
      <p className="text-[11px] text-[var(--brand-muted)] mb-4">
        Every figure here is counted from the individual plays — nothing is estimated as a total.
        Rows are the position unless a jersey number was readable on the film and matched your
        roster.
      </p>

      {!compact && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-5">
          {[
            ['Total yards', team.totalYards],
            ['Rushing', `${o.rush_yards} (${o.carries} car)`],
            ['Passing', `${o.pass_yards} (${o.pass_completions}/${o.pass_attempts})`],
            ['Touchdowns', o.rush_td + o.pass_td],
          ].map(([label, value]) => (
            <div key={String(label)} className="rounded-lg bg-[var(--brand-bg)] border border-[var(--brand-border)] p-3">
              <p className="text-[10px] uppercase tracking-wide text-[var(--brand-muted)]">{label}</p>
              <p className="text-lg font-bold text-[var(--brand-navy)] tabular-nums">{value}</p>
            </div>
          ))}
        </div>
      )}

      <Table
        title="Rushing"
        columns={['Car', 'Yds', 'Avg', 'TD']}
        rows={rushing.map((l) => ({
          key: l.key,
          label: <PlayerLabel line={l} />,
          cells: [
            l.offense.carries,
            l.offense.rush_yards,
            avg(l.offense.rush_yards, l.offense.carries - l.unmeasured.rush),
            l.offense.rush_td,
          ],
        }))}
        totals={[o.carries, o.rush_yards, team.yardsPerCarry ?? '—', o.rush_td]}
      />

      <Table
        title="Passing"
        columns={['C/Att', 'Yds', 'TD', 'INT']}
        rows={passing.map((l) => ({
          key: l.key,
          label: <PlayerLabel line={l} />,
          cells: [
            `${l.offense.pass_completions}/${l.offense.pass_attempts}`,
            l.offense.pass_yards,
            l.offense.pass_td,
            l.offense.interceptions_thrown,
          ],
        }))}
        totals={[`${o.pass_completions}/${o.pass_attempts}`, o.pass_yards, o.pass_td, o.interceptions_thrown]}
      />

      <Table
        title="Receiving"
        columns={['Tgt', 'Rec', 'Yds', 'TD']}
        rows={receiving.map((l) => ({
          key: l.key,
          label: <PlayerLabel line={l} />,
          cells: [l.offense.targets, l.offense.receptions, l.offense.receiving_yards, l.offense.receiving_td],
        }))}
        totals={[o.targets, o.receptions, o.receiving_yards, o.receiving_td]}
      />

      <Table
        title="Defense"
        columns={['Solo', 'Ast', 'Tot', 'INT', 'FF', 'Mist']}
        rows={defenders.map((l) => ({
          key: l.key,
          label: <PlayerLabel line={l} />,
          cells: [
            l.defense.tackles,
            l.defense.assisted_tackles,
            l.defense.total_tackles,
            l.defense.interceptions,
            l.defense.forced_fumbles,
            l.defense.mistakes,
          ],
        }))}
        totals={[
          d.tackles,
          d.assisted_tackles,
          d.total_tackles,
          d.interceptions,
          d.forced_fumbles,
          d.mistakes,
        ]}
      />

      {(o.fumbles_lost > 0 || unmeasured > 0) && (
        <p className="text-[11px] text-[var(--brand-muted)] mt-3 pt-3 border-t border-[var(--brand-border)]">
          {o.fumbles_lost > 0 && (
            <>
              {o.fumbles_lost} fumble{o.fumbles_lost === 1 ? '' : 's'} lost.{' '}
            </>
          )}
          {unmeasured > 0 && (
            <>
              <Info size={11} className="inline -mt-0.5 mr-0.5" />
              {unmeasured} play{unmeasured === 1 ? '' : 's'} had no measurable yardage on this film —
              those plays are counted, their yards are not.
            </>
          )}
        </p>
      )}

      {warnings.length > 0 && (
        <div className="mt-4 rounded-lg border border-amber-200 bg-amber-50 p-3">
          <p className="flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wide text-amber-800 mb-1">
            <AlertTriangle size={12} />
            How much to trust this sheet
          </p>
          <ul className="space-y-1">
            {warnings.map((w, i) => (
              <li key={i} className="text-xs text-amber-900">
                {w}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
