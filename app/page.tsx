import Link from 'next/link';
import { Brain, Film, Users, Zap, Shield, TrendingUp, ArrowRight, Check } from 'lucide-react';

export default function HomePage() {
  return (
    <div className="min-h-screen bg-[var(--brand-bg)]">
      {/* Nav */}
      <nav className="flex items-center justify-between px-6 py-4 max-w-7xl mx-auto">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-lg bg-[var(--brand-navy)] flex items-center justify-center">
            <span className="text-[var(--brand-gold)] font-bold text-sm">PS</span>
          </div>
          <span className="font-bold text-[var(--brand-navy)] text-xl tracking-tight">PlayScout</span>
        </div>
        <div className="hidden md:flex items-center gap-8">
          <Link href="#features" className="text-sm text-[var(--brand-muted)] hover:text-[var(--brand-navy)] transition-colors">
            Features
          </Link>
          <Link href="#modules" className="text-sm text-[var(--brand-muted)] hover:text-[var(--brand-navy)] transition-colors">
            Modules
          </Link>
          <Link href="#pricing" className="text-sm text-[var(--brand-muted)] hover:text-[var(--brand-navy)] transition-colors">
            Pricing
          </Link>
        </div>
        <div className="flex items-center gap-3">
          <Link
            href="/login"
            className="text-sm font-medium text-[var(--brand-navy)] hover:text-[var(--brand-navy-dark)] transition-colors"
          >
            Sign in
          </Link>
          <Link
            href="/register"
            className="text-sm font-semibold bg-[var(--brand-navy)] text-white px-4 py-2 rounded-lg hover:bg-[var(--brand-navy-dark)] transition-colors"
          >
            Get started
          </Link>
        </div>
      </nav>

      {/* Hero */}
      <section className="hero-gradient text-white py-24 px-6">
        <div className="max-w-5xl mx-auto text-center">
          <div className="inline-flex items-center gap-2 bg-white/10 backdrop-blur-sm rounded-full px-4 py-2 text-sm font-medium mb-8 border border-white/20">
            <Zap size={14} className="text-[var(--brand-gold)]" />
            AI-Powered Football Intelligence
          </div>
          <h1 className="text-5xl md:text-7xl font-bold leading-tight mb-6 tracking-tight">
            Scout Smarter.<br />
            <span className="text-[var(--brand-gold)] gold-glow-text">Coach Better.</span>
          </h1>
          <p className="text-xl text-white/75 max-w-2xl mx-auto mb-10 leading-relaxed">
            PlayScout combines AI film analysis, player intelligence modules, and a coaching companion to give every team an unfair advantage.
          </p>
          <div className="flex flex-col sm:flex-row gap-4 justify-center">
            <Link
              href="/register"
              className="inline-flex items-center justify-center gap-2 bg-[var(--brand-gold)] text-[var(--brand-navy)] font-bold px-8 py-4 rounded-xl hover:bg-[var(--brand-gold-light)] transition-all gold-glow text-lg"
            >
              Start for free
              <ArrowRight size={20} />
            </Link>
            <Link
              href="/login"
              className="inline-flex items-center justify-center gap-2 bg-white/10 backdrop-blur-sm text-white font-semibold px-8 py-4 rounded-xl hover:bg-white/20 transition-all border border-white/20 text-lg"
            >
              Sign in
            </Link>
          </div>
        </div>
      </section>

      {/* Feature strip */}
      <section className="py-8 bg-white border-y border-[var(--brand-border)]" id="features">
        <div className="max-w-6xl mx-auto px-6 grid grid-cols-2 md:grid-cols-4 gap-8 text-center">
          {[
            { label: 'AI Film Analysis', desc: 'Frame-by-frame video intelligence' },
            { label: 'PlayScoutIQ', desc: 'Your 24/7 coaching companion' },
            { label: 'Player Profiles', desc: 'Detailed development tracking' },
            { label: '4 IQ Modules', desc: 'QB, OL, Team, and Mistake analysis' },
          ].map((f) => (
            <div key={f.label} className="space-y-1">
              <p className="font-bold text-[var(--brand-navy)] text-sm">{f.label}</p>
              <p className="text-xs text-[var(--brand-muted)]">{f.desc}</p>
            </div>
          ))}
        </div>
      </section>

      {/* Intelligence modules */}
      <section className="py-24 px-6" id="modules">
        <div className="max-w-6xl mx-auto">
          <div className="text-center mb-16">
            <h2 className="text-4xl font-bold text-[var(--brand-navy)] mb-4">Intelligence Modules</h2>
            <p className="text-[var(--brand-muted)] text-lg max-w-2xl mx-auto">
              Four specialized AI systems that analyze every dimension of your team's performance.
            </p>
          </div>
          <div className="grid md:grid-cols-2 gap-6">
            {[
              {
                icon: Zap,
                name: 'QBIQ',
                tagline: 'Quarterback Intelligence',
                color: 'text-blue-600',
                bg: 'bg-blue-50',
                desc: 'Analyze mechanics, decision-making, footwork, release point, and film tendencies. Generate personalized development plans.',
              },
              {
                icon: Shield,
                name: 'OLIQ',
                tagline: 'Offensive Line Intelligence',
                color: 'text-emerald-600',
                bg: 'bg-emerald-50',
                desc: 'Grade unit cohesion, gap assignment, pass protection, and run-blocking efficiency from game film.',
              },
              {
                icon: TrendingUp,
                name: 'TeamIQ',
                tagline: 'Team Intelligence',
                color: 'text-purple-600',
                bg: 'bg-purple-50',
                desc: 'Identify scheme tendencies, formation frequencies, play-call patterns, and opponent scouting insights.',
              },
              {
                icon: Brain,
                name: 'MistakeIQ',
                tagline: 'Error Analysis Intelligence',
                color: 'text-orange-600',
                bg: 'bg-orange-50',
                desc: 'Automatically flag and categorize turnovers, penalties, missed assignments, and blown coverages.',
              },
            ].map((module) => (
              <div key={module.name} className="glass-card p-8">
                <div className={`w-12 h-12 rounded-xl ${module.bg} flex items-center justify-center mb-5`}>
                  <module.icon size={24} className={module.color} />
                </div>
                <div className="flex items-baseline gap-2 mb-2">
                  <h3 className="text-2xl font-bold text-[var(--brand-navy)]">{module.name}</h3>
                  <span className="text-sm text-[var(--brand-muted)] font-medium">{module.tagline}</span>
                </div>
                <p className="text-[var(--brand-muted)] leading-relaxed">{module.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* PlayScoutIQ */}
      <section className="py-24 px-6 bg-[var(--brand-navy)]">
        <div className="max-w-5xl mx-auto flex flex-col md:flex-row items-center gap-12">
          <div className="flex-1 text-white">
            <div className="inline-flex items-center gap-2 bg-white/10 rounded-full px-3 py-1.5 text-sm font-medium mb-6 text-white/80">
              <Brain size={14} className="text-[var(--brand-gold)]" />
              System A: PlayScoutIQ
            </div>
            <h2 className="text-4xl font-bold mb-5 leading-tight">
              Your AI Coaching<br />
              <span className="text-[var(--brand-gold)]">Companion</span>
            </h2>
            <p className="text-white/70 text-lg leading-relaxed mb-8">
              Ask PlayScoutIQ anything — scheme questions, practice planning, film breakdowns, rule clarifications. It learns your team's history and grows with your season.
            </p>
            <ul className="space-y-3">
              {[
                'Instant answers to coaching questions',
                'Interprets VideoIQ analysis in plain language',
                'Builds practice plans and game-week schedules',
                'USA Football & CDC safety knowledge built-in',
              ].map((item) => (
                <li key={item} className="flex items-start gap-3 text-white/80 text-sm">
                  <Check size={16} className="text-[var(--brand-gold)] flex-shrink-0 mt-0.5" />
                  {item}
                </li>
              ))}
            </ul>
          </div>
          <div className="flex-1 w-full">
            {/* Chat preview mockup */}
            <div className="bg-white rounded-2xl p-5 shadow-2xl max-w-sm mx-auto">
              <div className="flex items-center gap-2 mb-4 pb-3 border-b border-[var(--brand-border)]">
                <div className="w-7 h-7 rounded-full bg-[var(--brand-navy)] flex items-center justify-center">
                  <Brain size={14} className="text-[var(--brand-gold)]" />
                </div>
                <span className="font-semibold text-[var(--brand-navy)] text-sm">PlayScoutIQ</span>
                <span className="ml-auto w-2 h-2 rounded-full bg-emerald-400" />
              </div>
              <div className="space-y-3">
                <div className="chat-bubble-user text-sm">
                  What&apos;s the best way to teach a 12-year-old QB to read Cover 2?
                </div>
                <div className="chat-bubble-ai text-sm leading-relaxed">
                  <strong>Cover 2 read progression for youth QBs:</strong>
                  <br />
                  <br />
                  Start with the safety keys — if both safeties split pre-snap, it&apos;s likely Cover 2. Teach him to...
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="py-24 px-6 text-center" id="pricing">
        <div className="max-w-2xl mx-auto">
          <h2 className="text-4xl font-bold text-[var(--brand-navy)] mb-5">
            Ready to scout smarter?
          </h2>
          <p className="text-[var(--brand-muted)] text-lg mb-10">
            Join coaches building a competitive edge with AI-powered football intelligence.
          </p>
          <Link
            href="/register"
            className="inline-flex items-center gap-2 bg-[var(--brand-navy)] text-white font-bold px-10 py-4 rounded-xl hover:bg-[var(--brand-navy-dark)] transition-all text-lg"
          >
            Get started free
            <ArrowRight size={20} />
          </Link>
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t border-[var(--brand-border)] py-8 px-6">
        <div className="max-w-6xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-4">
          <div className="flex items-center gap-2">
            <div className="w-6 h-6 rounded bg-[var(--brand-navy)] flex items-center justify-center">
              <span className="text-[var(--brand-gold)] font-bold text-xs">PS</span>
            </div>
            <span className="font-bold text-[var(--brand-navy)] text-sm">PlayScout</span>
          </div>
          <p className="text-xs text-[var(--brand-muted)]">
            © {new Date().getFullYear()} PlayScout. All rights reserved.
          </p>
        </div>
      </footer>
    </div>
  );
}
