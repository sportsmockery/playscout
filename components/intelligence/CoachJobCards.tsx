import Link from 'next/link';
import { ArrowRight, Crosshair, ListOrdered } from 'lucide-react';
import { COACH_JOBS, type CoachJobId } from '@/lib/coach-jobs';

const ICONS: Record<CoachJobId, React.ElementType> = {
  scout: Crosshair,
  evaluate: ListOrdered,
};

const ACCENT: Record<CoachJobId, string> = {
  scout: 'bg-red-50 text-red-600',
  evaluate: 'bg-amber-50 text-amber-600',
};

/**
 * The two doors into the product, in a coach's words.
 *
 * Deliberately shows the three steps and what they end up with, not just a
 * title: the reason a grid of acronyms failed is that nothing told a coach
 * what they were committing to or what they would get back.
 */
export default function CoachJobCards({ teamId }: { teamId: string }) {
  return (
    <div className="grid md:grid-cols-2 gap-4">
      {COACH_JOBS.map((job) => {
        const Icon = ICONS[job.id];
        return (
          <Link
            key={job.id}
            href={job.href(teamId)}
            className="glass-card p-6 group flex flex-col hover:shadow-lg transition-shadow"
          >
            <div className="flex items-start gap-3 mb-3">
              <div className={`w-11 h-11 rounded-xl ${ACCENT[job.id]} flex items-center justify-center shrink-0`}>
                <Icon size={21} />
              </div>
              <div className="min-w-0">
                <p className="font-bold text-[var(--brand-ink)] text-lg leading-tight">{job.title}</p>
                <p className="text-sm text-[var(--brand-muted)] mt-0.5">{job.question}</p>
              </div>
            </div>

            <ol className="space-y-1.5 mb-4">
              {job.steps.map((step, i) => (
                <li key={i} className="flex items-start gap-2 text-sm text-[var(--brand-ink)]">
                  <span className="shrink-0 w-5 h-5 rounded-full bg-[var(--brand-bg)] border border-[var(--brand-border)] text-[10px] font-bold text-[var(--brand-muted)] flex items-center justify-center mt-0.5">
                    {i + 1}
                  </span>
                  {step}
                </li>
              ))}
            </ol>

            <p className="text-xs text-[var(--brand-muted)] border-t border-[var(--brand-border)] pt-3 mb-4">
              <span className="font-semibold text-[var(--brand-ink)]">You get: </span>
              {job.outcome}
            </p>

            <span className="mt-auto inline-flex items-center gap-1.5 text-sm font-semibold text-[var(--brand-navy)]">
              {job.cta}
              <ArrowRight size={15} className="group-hover:translate-x-0.5 transition-transform" />
            </span>
          </Link>
        );
      })}
    </div>
  );
}
