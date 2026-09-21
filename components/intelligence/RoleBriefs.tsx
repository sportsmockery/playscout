import type { ScoutIQGamePlan, KeyedPoint } from '@/lib/intelligence/modules/scoutiq-gameplan';

/**
 * The quarterback and coordinator briefs off a scouting game plan.
 *
 * A game plan written once for the whole staff is actionable for nobody: the
 * quarterback needs what to look at before the snap and what the picture turns
 * into, the coordinator needs which side to attack and on which down. Same
 * evidence, different readers.
 *
 * Every point carries the figure AND the denominator it rests on, shown rather
 * than hidden. That is the difference between "they play two-high" and
 * "two-high on 41 of 64 snaps where the safeties were visible", and on this
 * film the second sentence is the only honest one — the camera follows the
 * ball, so plenty of snaps show no secondary at all.
 */

function PointList({ points }: { points: KeyedPoint[] }) {
  if (!points?.length) return null;
  return (
    <ul className="space-y-2.5">
      {points.map((p, i) => (
        <li key={i} className="min-w-0">
          <p className="text-sm text-[var(--brand-ink)]">{p.point}</p>
          {p.evidence && (
            <p className="text-[11px] text-[var(--brand-muted)] mt-0.5">{p.evidence}</p>
          )}
        </li>
      ))}
    </ul>
  );
}

function Section({
  title,
  hint,
  children,
}: {
  title: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <h4 className="text-[11px] font-bold uppercase tracking-wide text-[var(--brand-navy)]">
        {title}
      </h4>
      {hint && <p className="text-[11px] text-[var(--brand-muted)] mb-2">{hint}</p>}
      <div className={hint ? '' : 'mt-2'}>{children}</div>
    </div>
  );
}

export default function RoleBriefs({ plan }: { plan: ScoutIQGamePlan | null }) {
  const qb = plan?.quarterback_brief;
  const oc = plan?.coordinator_brief;
  const notObserved = plan?.not_observed ?? [];

  // Nothing to show on a plan generated before the defensive structure was
  // charted — those plans are still valid, they just have no briefs.
  if (!qb && !oc && !notObserved.length) return null;

  return (
    <div className="space-y-5">
      {qb && (
        <div className="glass-card p-5 print:border print:shadow-none">
          <h3 className="text-sm font-bold uppercase tracking-wide text-[var(--brand-navy)] mb-1">
            Quarterback Brief
          </h3>
          <p className="text-[11px] text-[var(--brand-muted)] mb-4">
            What he does at the line, in the order he does it.
          </p>
          <div className="space-y-4">
            {qb.presnap_checklist?.length > 0 && (
              <Section title="Before the snap" hint="Two seconds — look in this order.">
                <ol className="space-y-1.5">
                  {qb.presnap_checklist.map((item, i) => (
                    <li key={i} className="flex items-start gap-2.5 text-sm text-[var(--brand-ink)]">
                      <span className="w-5 h-5 shrink-0 rounded-full bg-[var(--brand-navy)] text-white text-[10px] font-bold flex items-center justify-center mt-0.5">
                        {i + 1}
                      </span>
                      <span className="min-w-0">{item}</span>
                    </li>
                  ))}
                </ol>
              </Section>
            )}
            {qb.shell_reads?.length > 0 && (
              <Section title="What the picture becomes">
                <PointList points={qb.shell_reads} />
              </Section>
            )}
            {qb.where_to_throw?.length > 0 && (
              <Section title="Where the ball goes">
                <PointList points={qb.where_to_throw} />
              </Section>
            )}
            {qb.avoid?.length > 0 && (
              <Section title="What gets it picked">
                <ul className="space-y-1.5">
                  {qb.avoid.map((item, i) => (
                    <li key={i} className="flex items-start gap-2 text-sm text-[var(--brand-ink)]">
                      <span className="w-1.5 h-1.5 shrink-0 rounded-full bg-red-500 mt-1.5" />
                      <span className="min-w-0">{item}</span>
                    </li>
                  ))}
                </ul>
              </Section>
            )}
          </div>
        </div>
      )}

      {oc && (
        <div className="glass-card p-5 print:border print:shadow-none">
          <h3 className="text-sm font-bold uppercase tracking-wide text-[var(--brand-navy)] mb-4">
            Coordinator Brief
          </h3>
          <div className="space-y-4">
            {oc.attack?.length > 0 && (
              <Section title="Attack">
                <PointList points={oc.attack} />
              </Section>
            )}
            {oc.formation_and_motion?.length > 0 && (
              <Section title="Formation and motion">
                <PointList points={oc.formation_and_motion} />
              </Section>
            )}
            {oc.situational?.length > 0 && (
              <Section title="By situation">
                <PointList points={oc.situational} />
              </Section>
            )}
          </div>
        </div>
      )}

      {/* Shown as prominently as the plan itself. A coach who knows what the
          film did NOT show can go get that film; one who is never told
          assumes the blanks were covered. */}
      {notObserved.length > 0 && (
        <div className="glass-card p-5 border border-amber-200 bg-amber-50 print:border print:shadow-none">
          <h3 className="text-[11px] font-bold uppercase tracking-wide text-amber-900 mb-2">
            What this film could not tell us
          </h3>
          <ul className="space-y-1.5">
            {notObserved.map((item, i) => (
              <li key={i} className="flex items-start gap-2 text-sm text-amber-900">
                <span className="w-1.5 h-1.5 shrink-0 rounded-full bg-amber-500 mt-1.5" />
                <span className="min-w-0">{item}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
