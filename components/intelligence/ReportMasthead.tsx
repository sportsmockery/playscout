import Image from 'next/image';
import type { ReactNode } from 'react';

export interface ReportFact {
  label: string;
  value: ReactNode;
  /** Tailwind text colour for the figure. Defaults to navy. */
  tone?: string;
}

interface ReportMastheadProps {
  /** Module key, exactly as the coach clicked it — QBIQ, SCOUTIQ, STATSIQ. */
  moduleKey: string;
  /** What the sheet is: "Opponent Scouting Report", "Box Score", … */
  kind: string;
  /** Who it is about — team, or team vs opponent. Sits above the headline. */
  subject?: string | null;
  /** The one-line verdict. On a batch this is the synthesis headline. */
  title: string;
  /** Labelled figures. Anything not worth a label belongs in the body. */
  facts: ReportFact[];
  /** Extra line shown only on the printed sheet. */
  printNote?: ReactNode;
}

/**
 * The top of a PlayScout report, on screen and on paper.
 *
 * Both report pages grew their own header, and both ended up as a generic icon,
 * the raw module key, a headline, and one run-on metadata sentence
 * ("67 of 67 clips analyzed · average 60 · 63 plays observed · 9/19/2026"). Four
 * different kinds of fact separated by middots is a sentence a coach has to
 * parse; the same four with labels over them is a sheet they can scan. And
 * printed — which is the point of these pages — nothing on the page said what
 * produced it.
 *
 * So: the logo and wordmark, the module and what kind of report it is, who it
 * is about, the verdict, then the figures as a labelled strip. The gold rule
 * above is a border rather than a background, because browsers drop background
 * colours when printing and keep borders.
 */
export default function ReportMasthead({
  moduleKey,
  kind,
  subject,
  title,
  facts,
  printNote,
}: ReportMastheadProps) {
  const shown = facts.filter((f) => f.value !== null && f.value !== undefined && f.value !== '');

  return (
    <header className="report-masthead glass-card p-6 mb-5 print:shadow-none print:break-after-avoid">
      {/* Brand row.

          STACKED until `sm`, and that is the whole fix for a real collision.
          Side by side, the report-kind block carried `shrink-0` — so on a phone
          it refused to give up width, overflowed its own box and printed
          "OPPONENT SCOUTING REPORT · COMBINED" straight through the wordmark
          and the logo. `leading-none` on the wordmark then let the wrapped
          tagline overlap itself on top of that.

          Two rows cannot collide, so the phone gets two rows. `shrink-0` is
          gone (the text wraps instead of overflowing) and every line carries an
          explicit leading. */}
      <div className="flex flex-col gap-3 pb-4 border-b border-[var(--brand-border)] sm:flex-row sm:items-start sm:justify-between sm:gap-4">
        <div className="flex items-center gap-2.5 min-w-0">
          <Image src="/logo.svg" alt="" width={30} height={33} className="shrink-0" />
          <div className="min-w-0">
            <p className="text-base font-bold leading-tight tracking-tight text-[var(--brand-navy)]">
              PlayScout
            </p>
            <p className="text-[9px] font-semibold uppercase leading-tight tracking-[0.18em] text-[var(--brand-muted)] mt-1">
              Football Intelligence
            </p>
          </div>
        </div>
        <div className="min-w-0 sm:text-right">
          <p className="text-[11px] font-bold uppercase leading-tight tracking-[0.18em] text-[var(--brand-gold-dark)]">
            {moduleKey}
          </p>
          <p className="text-[11px] font-medium uppercase leading-tight tracking-[0.1em] text-[var(--brand-muted)] mt-0.5">
            {kind}
          </p>
        </div>
      </div>

      {/* Subject + verdict */}
      <div className="pt-4">
        {subject && (
          <p className="text-[11px] font-bold uppercase tracking-[0.14em] text-[var(--brand-muted)]">
            {subject}
          </p>
        )}
        {/* A synthesis headline is often a full sentence rather than a title,
            and at 2xl a four-line sentence stops being a headline and starts
            being a wall. */}
        <h1 className="text-lg sm:text-xl font-bold text-[var(--brand-navy)] leading-snug mt-1.5 text-pretty">
          {title}
        </h1>
      </div>

      {/* Figures */}
      {shown.length > 0 && (
        <dl className="mt-5 pt-4 border-t border-[var(--brand-border)] grid grid-cols-2 gap-x-8 gap-y-3 sm:flex sm:flex-wrap sm:gap-x-10">
          {shown.map((fact) => (
            <div key={fact.label}>
              <dt className="text-[9px] font-semibold uppercase tracking-[0.14em] text-[var(--brand-muted)]">
                {fact.label}
              </dt>
              <dd
                className={`text-[0.95rem] font-bold tabular-nums mt-0.5 ${fact.tone ?? 'text-[var(--brand-navy)]'}`}
              >
                {fact.value}
              </dd>
            </div>
          ))}
        </dl>
      )}

      {printNote && (
        <p className="print-only text-[11px] text-[var(--brand-muted)] mt-3">{printNote}</p>
      )}
    </header>
  );
}
