import Link from 'next/link';
import { ArrowRight, CheckCircle2 } from 'lucide-react';

export interface NextStep {
  label: string;
  href: string;
  /** Why this is the next thing, in a coach's words. */
  why: string;
}

/**
 * What to do now that the report exists.
 *
 * Every result page in this product used to be terminal: a coach read a score
 * and some prose, and nothing said what to do with it. The analysis is not the
 * deliverable — the practice you run on Tuesday and the call you make on
 * Friday are, and the gap between them was left entirely to the coach.
 */
export default function NextSteps({ steps }: { steps: NextStep[] }) {
  if (!steps.length) return null;

  return (
    <div className="glass-card p-5 mb-5 print:hidden">
      <h2 className="font-bold text-[var(--brand-navy)] mb-1 text-sm uppercase tracking-wide">
        Do this next
      </h2>
      <p className="text-[11px] text-[var(--brand-muted)] mb-3">
        A report is only worth the practice you run off it.
      </p>
      <ul className="space-y-2">
        {steps.map((step) => (
          <li key={step.href + step.label}>
            <Link
              href={step.href}
              className="flex items-start gap-2.5 group rounded-lg -mx-2 px-2 py-1.5 hover:bg-[var(--brand-bg)] transition-colors"
            >
              <CheckCircle2 size={16} className="text-[var(--brand-gold,#d2c600)] shrink-0 mt-0.5" />
              <span className="min-w-0 flex-1">
                <span className="block text-sm font-semibold text-[var(--brand-ink)]">
                  {step.label}
                </span>
                <span className="block text-xs text-[var(--brand-muted)]">{step.why}</span>
              </span>
              <ArrowRight
                size={14}
                className="shrink-0 mt-1 text-[var(--brand-muted)] group-hover:text-[var(--brand-navy)] transition-colors"
              />
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}
