import Link from 'next/link';
import Image from 'next/image';

export const metadata = { title: 'Privacy Policy' };

export default function PrivacyPage() {
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
            <h1 className="text-2xl font-bold text-[var(--brand-navy)] mb-2">Privacy Policy</h1>
            <p className="text-sm text-[var(--brand-muted)]">Last updated: July 2026</p>
          </div>

          <section className="space-y-2">
            <h2 className="font-bold text-[var(--brand-ink)]">1. What we collect</h2>
            <p className="text-sm text-[var(--brand-ink)] leading-relaxed">
              When you use PlayScout, we collect: account information (name, email); team and
              roster information you enter (player names, jersey numbers, positions); game film and
              playbooks you upload; and the AI-generated analysis, tendencies, and coaching reports
              produced from that film. We also collect basic usage data (like when analyses run) to
              keep the product working reliably.
            </p>
          </section>

          <section className="space-y-2">
            <h2 className="font-bold text-[var(--brand-ink)]">2. About player data, including minors</h2>
            <p className="text-sm text-[var(--brand-ink)] leading-relaxed">
              PlayScout is built for youth football, so roster and film data will often include
              players under 18. This information is entered and uploaded by coaches and team
              administrators — PlayScout does not collect data directly from children, and does not
              knowingly allow players to create their own accounts. Roster and film access is scoped
              to the team&apos;s own coaches; it is not made public or shared with other teams or
              organizations on the platform. If you are a parent or guardian with questions about
              your player&apos;s data, please reach out through your team&apos;s coach or organization.
            </p>
          </section>

          <section className="space-y-2">
            <h2 className="font-bold text-[var(--brand-ink)]">3. How film is analyzed</h2>
            <p className="text-sm text-[var(--brand-ink)] leading-relaxed">
              Uploaded film is broken into still frames and analyzed by third-party AI providers
              (including Google and Anthropic models) to generate coaching reports. These providers
              process the frames and text we send them to return an analysis, under their own data
              processing terms — we do not permit them to use your team&apos;s film to train their
              general-purpose models. Analysis results are stored in your team&apos;s PlayScout account
              so your coaching staff can reference them later.
            </p>
          </section>

          <section className="space-y-2">
            <h2 className="font-bold text-[var(--brand-ink)]">4. Who can see your data</h2>
            <p className="text-sm text-[var(--brand-ink)] leading-relaxed">
              Team and film data is scoped to the coaches and staff in your organization — it is not
              visible to other teams or organizations on PlayScout. Our infrastructure providers
              (Supabase for database and storage, Vercel for hosting, Railway for background
              processing) host this data on our behalf under their own security commitments; they do
              not use it for their own purposes.
            </p>
          </section>

          <section className="space-y-2">
            <h2 className="font-bold text-[var(--brand-ink)]">5. Data retention & deletion</h2>
            <p className="text-sm text-[var(--brand-ink)] leading-relaxed">
              We retain team, roster, film, and analysis data for as long as your account is active.
              You can delete individual players, videos, or analyses from within the product; to
              close your account and have your organization&apos;s data deleted, contact us through your
              organization&apos;s point of contact.
            </p>
          </section>

          <section className="space-y-2">
            <h2 className="font-bold text-[var(--brand-ink)]">6. Security</h2>
            <p className="text-sm text-[var(--brand-ink)] leading-relaxed">
              We use row-level access controls so that data is only reachable by members of the
              organization it belongs to, encrypted connections for all data in transit, and access
              logging on our infrastructure. No system is perfectly secure, and we work to address
              issues as they&apos;re identified.
            </p>
          </section>

          <section className="space-y-2">
            <h2 className="font-bold text-[var(--brand-ink)]">7. Changes</h2>
            <p className="text-sm text-[var(--brand-ink)] leading-relaxed">
              We may update this policy as the product evolves. Material changes will be reflected
              here with an updated date.
            </p>
          </section>

          <section className="space-y-2">
            <h2 className="font-bold text-[var(--brand-ink)]">8. Contact</h2>
            <p className="text-sm text-[var(--brand-ink)] leading-relaxed">
              Questions about this policy, or requests to access or delete data, can be sent to the
              team at PlayScout through your organization&apos;s point of contact.
            </p>
          </section>
        </div>

        <p className="text-center text-sm text-[var(--brand-muted)] mt-6">
          See also our <Link href="/terms" className="font-semibold text-[var(--brand-navy)] hover:underline">Terms of Service</Link>.
        </p>
      </div>
    </div>
  );
}
