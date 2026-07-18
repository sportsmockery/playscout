import Link from 'next/link';
import Image from 'next/image';

export const metadata = { title: 'Terms of Service' };

export default function TermsPage() {
  return (
    <div className="min-h-screen bg-[var(--brand-bg)]">
      <div className="px-6 py-4">
        <Link href="/" className="flex items-center gap-2 w-fit">
          <Image src="/logo.svg" alt="PlayScout" width={26} height={28} />
          <span className="font-bold text-[var(--brand-navy)] text-lg">PlayScout</span>
        </Link>
      </div>

      <div className="max-w-3xl mx-auto px-4 py-12">
        <div className="glass-card p-8 md:p-10 space-y-8">
          <div>
            <h1 className="text-2xl font-bold text-[var(--brand-navy)] mb-2">Terms of Service</h1>
            <p className="text-sm text-[var(--brand-muted)]">Last updated: July 2026</p>
          </div>

          <section className="space-y-2">
            <h2 className="font-bold text-[var(--brand-ink)]">1. Who this applies to</h2>
            <p className="text-sm text-[var(--brand-ink)] leading-relaxed">
              These Terms govern your use of PlayScout, a film-analysis and coaching-intelligence
              platform for youth football teams. By creating an account, you confirm you are at least
              18 years old and are using PlayScout as a coach, team administrator, or organization
              representative — not as a player.
            </p>
          </section>

          <section className="space-y-2">
            <h2 className="font-bold text-[var(--brand-ink)]">2. Your content</h2>
            <p className="text-sm text-[var(--brand-ink)] leading-relaxed">
              You retain ownership of the game film, rosters, playbooks, and notes you upload
              (&quot;Your Content&quot;). By uploading Your Content, you grant PlayScout a license to store,
              process, and analyze it solely to provide the service to you and your organization —
              we do not sell Your Content or use it to train third-party models. You are responsible
              for having the rights to upload any film or playbook you submit, and for the accuracy
              of roster information you enter.
            </p>
          </section>

          <section className="space-y-2">
            <h2 className="font-bold text-[var(--brand-ink)]">3. AI-generated analysis</h2>
            <p className="text-sm text-[var(--brand-ink)] leading-relaxed">
              PlayScout uses third-party AI models to analyze film and generate coaching reports.
              This analysis is a coaching aid, not a guarantee of accuracy — AI output can be
              incomplete or mistaken, especially from limited film. Confidence levels and evidence
              references are provided to help you judge how much weight to give a given finding.
              Always apply your own coaching judgment, particularly for anything involving player
              safety.
            </p>
          </section>

          <section className="space-y-2">
            <h2 className="font-bold text-[var(--brand-ink)]">4. Acceptable use</h2>
            <p className="text-sm text-[var(--brand-ink)] leading-relaxed">
              You agree not to upload film you don&apos;t have the right to share, not to use PlayScout
              to harass or evaluate players outside a legitimate coaching context, and not to attempt
              to access another team&apos;s or organization&apos;s data without authorization.
            </p>
          </section>

          <section className="space-y-2">
            <h2 className="font-bold text-[var(--brand-ink)]">5. Account & termination</h2>
            <p className="text-sm text-[var(--brand-ink)] leading-relaxed">
              You&apos;re responsible for keeping your login credentials secure. You may close your
              account at any time; we may suspend accounts that violate these Terms or misuse the
              service.
            </p>
          </section>

          <section className="space-y-2">
            <h2 className="font-bold text-[var(--brand-ink)]">6. Changes</h2>
            <p className="text-sm text-[var(--brand-ink)] leading-relaxed">
              We may update these Terms as the product evolves. Material changes will be reflected
              here with an updated date.
            </p>
          </section>

          <section className="space-y-2">
            <h2 className="font-bold text-[var(--brand-ink)]">7. Contact</h2>
            <p className="text-sm text-[var(--brand-ink)] leading-relaxed">
              Questions about these Terms can be sent to the team at PlayScout through your
              organization&apos;s point of contact.
            </p>
          </section>
        </div>

        <p className="text-center text-sm text-[var(--brand-muted)] mt-6">
          See also our <Link href="/privacy" className="font-semibold text-[var(--brand-navy)] hover:underline">Privacy Policy</Link>.
        </p>
      </div>
    </div>
  );
}
