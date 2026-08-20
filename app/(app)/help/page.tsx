import Link from 'next/link';
import {
  AlertTriangle,
  BookOpen,
  Brain,
  CheckCircle2,
  Crosshair,
  Film,
  FolderOpen,
  Gauge,
  Info,
  Layers,
  Link2,
  ListOrdered,
  MessageSquare,
  Rocket,
  Shield,
  ShieldAlert,
  TrendingUp,
  Upload,
  UserCircle,
  Users,
  Zap,
} from 'lucide-react';

export const metadata = {
  title: 'Help & Guide',
  description:
    'How to set up teams and rosters in PlayScout, what each IQ module does, and how to use the Play Scout assistant.',
};

/* ------------------------------------------------------------------ */
/* Content data                                                        */
/* ------------------------------------------------------------------ */

const SECTIONS: { id: string; label: string }[] = [
  { id: 'quick-start', label: 'Quick start' },
  { id: 'teams', label: 'Setting up a team' },
  { id: 'roster', label: 'Building your roster' },
  { id: 'film', label: 'Getting film in' },
  { id: 'modules', label: 'The IQ modules' },
  { id: 'running', label: 'Running an analysis' },
  { id: 'reports', label: 'Reading a report' },
  { id: 'chat', label: 'Play Scout assistant' },
  { id: 'troubleshooting', label: 'Troubleshooting' },
];

// Mirrors the module cards on the team Intelligence hub. `needs` is what the
// module wants pointed at it; `gives` is what lands in the report.
const MODULES = [
  {
    name: 'QBIQ',
    label: 'Quarterback Intelligence',
    icon: Zap,
    color: 'text-blue-600',
    bg: 'bg-blue-50',
    needs: 'Clips where your quarterback is visible from the snap through the throw or the tuck.',
    gives:
      'Scores for mechanics (40%), decision-making (40%) and pocket presence (20%), plus strengths, weaknesses and drills you can install this week.',
  },
  {
    name: 'RBIQ',
    label: 'Running Back Intelligence',
    icon: Gauge,
    color: 'text-rose-600',
    bg: 'bg-rose-50',
    needs: 'Run plays where the back is in frame from the mesh point through contact.',
    gives:
      'Vision and gap reads, ball security, one-cut footwork, and whether he finished forward through contact.',
  },
  {
    name: 'OLIQ',
    label: 'Offensive Line Intelligence',
    icon: Shield,
    color: 'text-emerald-600',
    bg: 'bg-emerald-50',
    needs: 'Wide-enough film that all five linemen are in frame — sideline video is ideal.',
    gives:
      'Pass protection (40%), run blocking (40%), footwork and leverage (20%): set type, hand timing, pad level, combos, and climbs to the second level.',
  },
  {
    name: 'TeamIQ',
    label: 'Team Intelligence',
    icon: TrendingUp,
    color: 'text-purple-600',
    bg: 'bg-purple-50',
    needs: 'Lots of plays. This one gets better the more clips you give it — a whole game beats one series.',
    gives:
      'Formation frequencies, run/pass splits, play direction and motion tendencies, each with a confidence score and the sample size behind it.',
  },
  {
    name: 'MistakeIQ',
    label: 'Error Analysis',
    icon: AlertTriangle,
    color: 'text-orange-600',
    bg: 'bg-orange-50',
    needs: 'The plays that went wrong — or a full game, and let it find them.',
    gives:
      'Each mistake categorized (missed assignment, wrong gap fit, bad pursuit angle, coverage bust…) and rated minor through game-changing, with the correction and a drill for it.',
  },
  {
    name: 'RankerIQ',
    label: 'Player Ranking Intelligence',
    icon: ListOrdered,
    color: 'text-amber-600',
    bg: 'bg-amber-50',
    needs: 'Any clip of your own unit. Tell it whether you were on offense or defense.',
    gives:
      'Every player on your unit graded and ranked best-to-worst, with a one-line reason for each grade. Grades account for how hard the assignment was and how much the rep mattered to the play.',
  },
  {
    name: 'ScoutIQ',
    label: 'Opponent Scout Intelligence',
    icon: Crosshair,
    color: 'text-red-600',
    bg: 'bg-red-50',
    needs: 'Film of the team you are about to play.',
    gives:
      'Their tendencies, the players to account for, and a game plan built from what the film actually showed.',
  },
  {
    name: 'PlaybookIQ',
    label: 'Playbook Analysis',
    icon: BookOpen,
    color: 'text-indigo-600',
    bg: 'bg-indigo-50',
    needs: 'Your playbook as a PDF — no film required.',
    gives:
      'Strengths and gaps in the scheme, upgrade recommendations, and an install plan ordered for the practice time you actually have.',
  },
];

const FAQS: { q: string; a: React.ReactNode }[] = [
  {
    q: 'A player I added to the roster did not save.',
    a: (
      <>
        This was a permissions bug and is fixed. If it happens again the form now tells you exactly
        why instead of failing silently — most likely your account has view-only access to that
        team, and an owner or admin needs to grant you coach access under{' '}
        <span className="font-semibold">Users &amp; Roles</span>.
      </>
    ),
  },
  {
    q: 'My film says "Processing" and I cannot select it.',
    a: (
      <>
        Frames are still being pulled from the video. You can select it anyway — the clip parks at{' '}
        <span className="font-semibold">waiting for film</span> and starts on its own the moment
        processing finishes. Large games take longer than short clips.
      </>
    ),
  },
  {
    q: 'The report calls players "Left Guard" instead of using their names.',
    a: (
      <>
        That means jersey numbers could not be verified, so PlayScout graded by role rather than
        guess. Add jersey numbers to your roster and run game film with the scrimmage box
        unchecked. On scrimmage film this is by design and cannot be turned off — see{' '}
        <a href="#roster" className="font-semibold text-[var(--brand-navy)] underline">
          Building your roster
        </a>
        .
      </>
    ),
  },
  {
    q: 'A YouTube or Hudl link will not import.',
    a: (
      <>
        Those are watch pages, not video files, and pulling from them breaks those platforms&apos;
        terms. Paste a direct link that ends in a video file — from your school&apos;s server,
        Dropbox, Drive or S3 — or download the file and upload it.
      </>
    ),
  },
  {
    q: 'I closed the tab in the middle of a batch. Did I lose it?',
    a: (
      <>
        No. Batches run on a background worker, not in your browser. Come back whenever — the dock
        at the bottom-left picks up where things stand, and finished work is on the team&apos;s{' '}
        <span className="font-semibold">Intelligence</span> page.
      </>
    ),
  },
  {
    q: 'Can I correct the AI when it gets something wrong?',
    a: (
      <>
        Yes — reports have a correction control. Corrections are worth making: they are stored with
        the team and feed back into what PlayScout knows about you over the season.
      </>
    ),
  },
];

/* ------------------------------------------------------------------ */
/* Small presentational pieces                                         */
/* ------------------------------------------------------------------ */

function Section({
  id,
  icon: Icon,
  title,
  lede,
  children,
}: {
  id: string;
  icon: React.ElementType;
  title: string;
  lede?: string;
  children: React.ReactNode;
}) {
  return (
    <section id={id} className="scroll-mt-6">
      <div className="flex items-start gap-3 mb-4">
        <div className="w-9 h-9 rounded-xl bg-[var(--brand-navy)] flex items-center justify-center flex-shrink-0">
          <Icon size={18} className="text-[var(--brand-gold)]" />
        </div>
        <div>
          <h2 className="text-xl font-bold text-[var(--brand-navy)] leading-tight">{title}</h2>
          {lede && <p className="text-sm text-[var(--brand-muted)] mt-0.5">{lede}</p>}
        </div>
      </div>
      <div className="space-y-4">{children}</div>
    </section>
  );
}

function Card({ children }: { children: React.ReactNode }) {
  return <div className="glass-card p-5 sm:p-6 space-y-4">{children}</div>;
}

function P({ children }: { children: React.ReactNode }) {
  return <p className="text-sm text-[var(--brand-ink)] leading-relaxed">{children}</p>;
}

function Step({ n, title, children }: { n: number; title: string; children: React.ReactNode }) {
  return (
    <div className="flex gap-4">
      <div className="flex-shrink-0 w-7 h-7 rounded-full bg-[var(--brand-gold)] text-[var(--brand-navy)] font-bold text-sm flex items-center justify-center">
        {n}
      </div>
      <div className="min-w-0 pt-0.5">
        <p className="font-semibold text-[var(--brand-ink)] text-sm mb-1">{title}</p>
        <div className="text-sm text-[var(--brand-muted)] leading-relaxed space-y-2">{children}</div>
      </div>
    </div>
  );
}

/** Field reference row — label on the left, what it's actually for on the right. */
function Field({ name, children }: { name: string; children: React.ReactNode }) {
  return (
    <div className="grid sm:grid-cols-[10rem_1fr] gap-1 sm:gap-4 py-2.5 border-b border-[var(--brand-border)] last:border-0">
      <p className="text-sm font-semibold text-[var(--brand-ink)]">{name}</p>
      <p className="text-sm text-[var(--brand-muted)] leading-relaxed">{children}</p>
    </div>
  );
}

function Callout({
  tone = 'info',
  title,
  children,
}: {
  tone?: 'info' | 'warn' | 'good';
  title: string;
  children: React.ReactNode;
}) {
  const style = {
    info: { wrap: 'bg-[var(--brand-bg-alt)] border-[var(--brand-border)]', icon: 'text-[var(--brand-navy)]', Icon: Info },
    warn: { wrap: 'bg-amber-50 border-amber-200', icon: 'text-amber-700', Icon: ShieldAlert },
    good: { wrap: 'bg-emerald-50 border-emerald-200', icon: 'text-emerald-700', Icon: CheckCircle2 },
  }[tone];
  const Icon = style.Icon;

  return (
    <div className={`flex gap-3 rounded-lg border p-4 ${style.wrap}`}>
      <Icon size={17} className={`flex-shrink-0 mt-0.5 ${style.icon}`} />
      <div className="min-w-0">
        <p className="text-sm font-semibold text-[var(--brand-ink)] mb-1">{title}</p>
        <div className="text-sm text-[var(--brand-muted)] leading-relaxed space-y-2">{children}</div>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Page                                                                */
/* ------------------------------------------------------------------ */

export default function HelpPage() {
  return (
    <div className="p-6 max-w-6xl mx-auto">
      {/* Header */}
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-[var(--brand-navy)]">Help &amp; Guide</h1>
        <p className="text-[var(--brand-muted)] text-sm mt-1 max-w-2xl">
          Everything you need to get from a fresh account to a coaching report: setting up your
          team, building a roster, getting film in, what each IQ module does, and how to use the
          Play Scout assistant.
        </p>
      </div>

      <div className="grid lg:grid-cols-[13rem_1fr] gap-8 items-start">
        {/* In-page nav */}
        <nav className="hidden lg:block sticky top-6">
          <p className="text-xs font-semibold uppercase tracking-widest text-[var(--brand-muted)] mb-3 px-3">
            On this page
          </p>
          <ul className="space-y-0.5">
            {SECTIONS.map((s) => (
              <li key={s.id}>
                <a
                  href={`#${s.id}`}
                  className="block px-3 py-1.5 rounded-lg text-sm text-[var(--brand-muted)] hover:text-[var(--brand-navy)] hover:bg-white/70 transition-colors"
                >
                  {s.label}
                </a>
              </li>
            ))}
          </ul>
        </nav>

        <div className="min-w-0 space-y-12">
          {/* ---------------------------------------------------------- */}
          <Section
            id="quick-start"
            icon={Rocket}
            title="Quick start"
            lede="Four steps from an empty account to your first report."
          >
            <Card>
              <div className="space-y-5">
                <Step n={1} title="Create your team">
                  <p>
                    <Link href="/teams/new" className="font-semibold text-[var(--brand-navy)] underline">
                      Teams → Create New Team
                    </Link>
                    . Name it, set the age group and level, and enter your home and away jersey
                    colors. Takes a minute and everything downstream calibrates to it.
                  </p>
                </Step>
                <Step n={2} title="Add your roster">
                  <p>
                    Team → <span className="font-semibold">Roster</span> → Add Player. Jersey
                    numbers are the important part — they are what lets PlayScout grade players
                    individually instead of by position.
                  </p>
                </Step>
                <Step n={3} title="Get film in">
                  <p>
                    Team → <span className="font-semibold">Film Library</span>. Upload video files
                    or paste a direct link. Wait for a clip to show{' '}
                    <span className="font-semibold text-emerald-700">Ready</span>.
                  </p>
                </Step>
                <Step n={4} title="Run a module">
                  <p>
                    Open an IQ module from the sidebar, pick your film, and hit analyze. One clip
                    comes back in under a minute. Pick several — or a whole folder — and it queues
                    in the background while you do something else.
                  </p>
                </Step>
              </div>
            </Card>

            <Callout tone="info" title="You do not have to do all of this at once">
              <p>
                A module will run on a single clip with no roster at all. The roster and the jersey
                colors are what upgrade the answers from &quot;the left guard&quot; to a named
                player with a season-long profile.
              </p>
            </Callout>
          </Section>

          {/* ---------------------------------------------------------- */}
          <Section
            id="teams"
            icon={Users}
            title="Setting up a team"
            lede="Teams → Create New Team. Only the name is required, but the rest changes how film is read."
          >
            <Card>
              <Field name="Team name">Required. How the team appears everywhere in the app.</Field>
              <Field name="Age group">
                6U through 14U, JV, Varsity or Adult. This sets the standard players are graded
                against — a 9U guard and a varsity guard are not judged the same way, and
                recommendations are filtered so nothing age-inappropriate is suggested.
              </Field>
              <Field name="Season">
                Free text, defaults to this year. Keeps one season&apos;s film and grades separate
                from the next.
              </Field>
              <Field name="Level">
                Recreation, Travel, High School, College, Semi-Pro or Other. Works with age group
                to calibrate expectations.
              </Field>
              <Field name="Jersey colors">
                Home and away, described plainly — &quot;white jerseys, navy helmets&quot;. This is
                how the AI tells your players from the opponent&apos;s. When you run a module you
                pick which set you were wearing in that film.
              </Field>
            </Card>

            <Callout tone="warn" title="Jersey colors matter more than they look like they should">
              <p>
                Telling the two sides apart is what keeps grades off the other team&apos;s players.
                If you skip this, analysis still runs, but on film where both teams wear dark
                jerseys the results are far less reliable.
              </p>
            </Callout>
          </Section>

          {/* ---------------------------------------------------------- */}
          <Section
            id="roster"
            icon={UserCircle}
            title="Building your roster"
            lede="Team → Roster → Add Player. This is what unlocks player-level grading."
          >
            <Card>
              <Field name="First / last name">Required.</Field>
              <Field name="Jersey #">
                Optional, but see below — this is the field that unlocks the most.
              </Field>
              <Field name="Position">
                Primary position. Used to know what a good rep looks like for that player.
              </Field>
              <Field name="Level / age group">
                A dropdown covering Youth (6U–14U), Middle school (6th–8th grade) and High school
                (Freshman, Sophomore, Junior, Senior, JV, Varsity). Pick from the list rather than
                typing — grading reads these values, and free text like &quot;8th&quot; versus
                &quot;13U&quot; for the same player makes them unusable.
              </Field>
              <p className="text-sm text-[var(--brand-muted)] leading-relaxed pt-1">
                Use <span className="font-semibold">Save &amp; Add Another</span> to enter the
                squad in one sitting without reopening the form each time.
              </p>
            </Card>

            <Callout tone="good" title="Why jersey numbers are the important field">
              <p>
                Without a roster, PlayScout will not claim a jersey number at all — every player is
                graded by role (&quot;Left Guard&quot;, &quot;Free Safety&quot;). That is
                deliberate. A misread number puts one kid&apos;s grade on another kid&apos;s
                profile, which is worse than no name at all.
              </p>
              <p>
                Once numbers are on the roster, a number has to clear three checks before it
                reaches you: the model has to cite the frame it read the digits in, be confident
                enough that they were legible, and the number has to exist on your roster. Anything
                that fails gets dropped back to a role label.
              </p>
            </Callout>

            <Callout tone="warn" title="Scrimmage and practice film never uses numbers">
              <p>
                There is a <span className="font-semibold">Scrimmage or practice film</span>{' '}
                checkbox on the module screens. Tick it for anything that is not a game. Pinnies and
                borrowed jerseys carry numbers belonging to other players, so a roster
                &quot;match&quot; on practice film proves nothing about who is wearing it — those
                clips are graded by role no matter what your roster says.
              </p>
            </Callout>
          </Section>

          {/* ---------------------------------------------------------- */}
          <Section
            id="film"
            icon={Film}
            title="Getting film in"
            lede="Team → Film Library. Two ways in, and folders to keep it straight."
          >
            <Card>
              <div className="space-y-4">
                <div className="flex gap-3">
                  <Upload size={17} className="flex-shrink-0 mt-0.5 text-[var(--brand-navy)]" />
                  <div>
                    <p className="font-semibold text-[var(--brand-ink)] text-sm mb-1">Upload a file</p>
                    <P>
                      Full games are fine — uploads are resumable, so a dropped connection picks
                      back up rather than starting over. Progress lives in the dock at the bottom of
                      the screen and follows you around the app, so you can keep working while it
                      goes.
                    </P>
                  </div>
                </div>

                <div className="flex gap-3">
                  <Link2 size={17} className="flex-shrink-0 mt-0.5 text-[var(--brand-navy)]" />
                  <div>
                    <p className="font-semibold text-[var(--brand-ink)] text-sm mb-1">
                      Add film from a link
                    </p>
                    <P>
                      Paste a direct link to a video file and PlayScout pulls the frames it needs
                      without copying the film into our storage. It has to be a link to the actual
                      file — YouTube, Vimeo, Twitch, Hudl and MaxPreps pages are watch pages, not
                      files, and are refused. Your host stays the source of truth, so if the link
                      later expires, playback breaks but every analysis you already ran survives.
                    </P>
                  </div>
                </div>

                <div className="flex gap-3">
                  <FolderOpen size={17} className="flex-shrink-0 mt-0.5 text-[var(--brand-navy)]" />
                  <div>
                    <p className="font-semibold text-[var(--brand-ink)] text-sm mb-1">Folders</p>
                    <P>
                      Group film by week, opponent or unit. You can upload straight into a folder,
                      multi-select clips and bulk-move them, and — the useful part — point a module
                      at an entire folder in one click. Deleting a folder never deletes the film
                      inside it; those clips just become unfiled.
                    </P>
                  </div>
                </div>
              </div>
            </Card>

            <Card>
              <p className="font-semibold text-[var(--brand-ink)] text-sm">What the status badges mean</p>
              <div className="flex flex-wrap gap-2">
                {[
                  ['Queued', 'bg-amber-50 text-amber-700', 'Waiting for a worker to pick it up.'],
                  ['Processing', 'bg-amber-50 text-amber-700', 'Frames are being pulled from the video.'],
                  ['Partly ready', 'bg-amber-50 text-amber-700', 'Some frames are in; still working.'],
                  ['Ready', 'bg-emerald-50 text-emerald-700', 'Available to analyze.'],
                  ['Failed', 'bg-red-50 text-red-700', 'Something went wrong — the film detail page says what.'],
                ].map(([label, cls, desc]) => (
                  <div key={label} className="flex items-center gap-2">
                    <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${cls}`}>{label}</span>
                    <span className="text-xs text-[var(--brand-muted)]">{desc}</span>
                  </div>
                ))}
              </div>
              <P>
                You can select film that is still processing. It parks as{' '}
                <span className="font-semibold">waiting for film</span> and starts by itself when
                the frames land — selecting film that is not ready yet is normal, not an error.
              </P>
            </Card>
          </Section>

          {/* ---------------------------------------------------------- */}
          <Section
            id="modules"
            icon={Brain}
            title="The IQ modules"
            lede="Eight modules, each answering a different question. Open them from the sidebar once you are inside a team, or from the team's Intelligence page."
          >
            <div className="grid sm:grid-cols-2 gap-4">
              {MODULES.map((m) => (
                <div key={m.name} className="glass-card p-5">
                  <div className="flex items-center gap-2.5 mb-3">
                    <div className={`w-9 h-9 rounded-xl ${m.bg} flex items-center justify-center flex-shrink-0`}>
                      <m.icon size={17} className={m.color} />
                    </div>
                    <div className="min-w-0">
                      <p className="font-bold text-[var(--brand-navy)] text-sm">{m.name}</p>
                      <p className="text-xs text-[var(--brand-muted)] truncate">{m.label}</p>
                    </div>
                  </div>
                  <p className="text-xs text-[var(--brand-muted)] leading-relaxed mb-2">
                    <span className="font-semibold text-[var(--brand-ink)]">Feed it: </span>
                    {m.needs}
                  </p>
                  <p className="text-xs text-[var(--brand-muted)] leading-relaxed">
                    <span className="font-semibold text-[var(--brand-ink)]">You get: </span>
                    {m.gives}
                  </p>
                </div>
              ))}
            </div>

            <Callout tone="info" title="Not sure which one to start with">
              <p>
                Run <span className="font-semibold">RankerIQ</span> on a few clips. It grades your
                whole unit at once and tells you where to look, which usually points you at the
                position module worth running next. If you are preparing for a specific opponent,
                start with <span className="font-semibold">ScoutIQ</span> instead.
              </p>
            </Callout>
          </Section>

          {/* ---------------------------------------------------------- */}
          <Section
            id="running"
            icon={Layers}
            title="Running an analysis"
            lede="One clip is instant. Many clips queue in the background and come back as one report."
          >
            <Card>
              <div className="space-y-5">
                <Step n={1} title="Pick your film">
                  <p>
                    Select one clip, several, or a whole folder. You can also drop in a short clip
                    straight from your computer without adding it to the library first.
                  </p>
                </Step>
                <Step n={2} title="Set the context">
                  <p>
                    Which jersey you wore, whether you were on offense or defense, and whether this
                    is scrimmage film. There is an optional notes box too — telling it{' '}
                    <em>&quot;we&apos;re running inside zone, grade the front five on their
                    combos&quot;</em> gets a sharper answer than leaving it blank.
                  </p>
                </Step>
                <Step n={3} title="Run it, then go do something else">
                  <p>
                    A single already-processed clip runs on the spot. Anything more queues on a
                    background worker — you can navigate away, close the tab, or quit entirely.
                  </p>
                </Step>
              </div>
            </Card>

            <Callout tone="good" title="Where to watch progress">
              <p>
                The dock at the bottom-left of every page shows every batch running across all your
                teams, with a live clip count. The team&apos;s{' '}
                <span className="font-semibold">Intelligence</span> page lists queued and running
                work above the finished history, so nothing in flight is ever invisible.
              </p>
            </Callout>

            <Callout tone="info" title="A batch produces one report, not one per clip">
              <p>
                Queue 20 clips and you get one film session: averages across the batch, the points
                that repeat and how many clips each repeats in, per-player grades that trend, and a
                comment on every individual clip. Each clip expands inline if you want the detail.
                The numbers in that report are counted from the data, not written by the AI.
              </p>
            </Callout>
          </Section>

          {/* ---------------------------------------------------------- */}
          <Section
            id="reports"
            icon={CheckCircle2}
            title="Reading a report"
            lede="PlayScout never says 'the AI watched your game.' It shows you the evidence and how sure it is."
          >
            <Card>
              <p className="font-semibold text-[var(--brand-ink)] text-sm">The grading scale</p>
              <div className="grid sm:grid-cols-5 gap-2">
                {[
                  ['90–100', 'Elite', 'bg-emerald-50 text-emerald-700'],
                  ['80–89', 'Advanced', 'bg-teal-50 text-teal-700'],
                  ['70–79', 'Solid', 'bg-blue-50 text-blue-700'],
                  ['60–69', 'Developing', 'bg-amber-50 text-amber-700'],
                  ['Below 60', 'Beginner', 'bg-orange-50 text-orange-700'],
                ].map(([range, label, cls]) => (
                  <div key={label} className={`rounded-lg px-3 py-2 ${cls}`}>
                    <p className="text-xs font-bold">{range}</p>
                    <p className="text-xs">{label}</p>
                  </div>
                ))}
              </div>
              <P>
                Scores are relative to your team&apos;s level, not to college or the NFL. A 78 for a
                9U guard means he did his job at 9U.
              </P>
            </Card>

            <Card>
              <p className="font-semibold text-[var(--brand-ink)] text-sm">What to look for</p>
              <Field name="Confidence">
                Every AI claim carries one. Low confidence usually means the film did not show
                enough — a bad angle, the player out of frame — not that the player did badly.
              </Field>
              <Field name="Evidence frames">
                Conclusions point at the frames that support them. If a grade surprises you, look at
                the frames first.
              </Field>
              <Field name="Observation vs. interpretation">
                What was visible is kept separate from what it likely means. When the film is
                unclear the report says so rather than filling the gap.
              </Field>
              <Field name="Role labels">
                A row labelled by role rather than a name can legitimately cover more than one
                player across a batch — the report tells you when that is the case.
              </Field>
              <Field name="Corrections">
                If something is wrong, correct it in the report. Corrections stick with the team.
              </Field>
            </Card>

            <Callout tone="warn" title="What PlayScout will not do">
              <p>
                It will not invent jersey numbers, player names, scores or stats, and it will not
                claim certainty the film does not support. If a report ever names a player it could
                not have identified, that is a bug worth reporting — not a judgement call.
              </p>
            </Callout>
          </Section>

          {/* ---------------------------------------------------------- */}
          <Section
            id="chat"
            icon={MessageSquare}
            title="Play Scout assistant"
            lede="The logo bubble at the bottom-left of every page. Ask it anything, in plain language."
          >
            <Card>
              <P>
                Play Scout is the coaching side of the product. It does not watch your video —
                it reads the analyses your modules already produced, plus your tendencies,
                mistakes and notes from across the season, and talks about them. It picks up
                whichever team you are currently looking at automatically.
              </P>
              <p className="font-semibold text-[var(--brand-ink)] text-sm pt-1">
                Two kinds of question work well
              </p>
              <div className="grid sm:grid-cols-2 gap-4">
                <div className="rounded-lg border border-[var(--brand-border)] p-4">
                  <p className="text-xs font-bold uppercase tracking-wide text-[var(--brand-navy)] mb-2">
                    About your team
                  </p>
                  <ul className="text-sm text-[var(--brand-muted)] space-y-1.5 leading-relaxed">
                    <li>&quot;What are our biggest weaknesses based on our film?&quot;</li>
                    <li>&quot;What mistakes keep showing up?&quot;</li>
                    <li>&quot;What should we work on at practice this week?&quot;</li>
                  </ul>
                  <p className="text-xs text-[var(--brand-muted)] mt-3 pt-3 border-t border-[var(--brand-border)]">
                    These need analyzed film behind them. Answers cite their source — &quot;Based on
                    14 plays analyzed…&quot;
                  </p>
                </div>
                <div className="rounded-lg border border-[var(--brand-border)] p-4">
                  <p className="text-xs font-bold uppercase tracking-wide text-[var(--brand-navy)] mb-2">
                    General coaching
                  </p>
                  <ul className="text-sm text-[var(--brand-muted)] space-y-1.5 leading-relaxed">
                    <li>&quot;Build me a 90-minute practice plan for Tuesday.&quot;</li>
                    <li>&quot;How do I stop a team that runs jet sweep every play?&quot;</li>
                    <li>&quot;How many contact practices are allowed at 10U?&quot;</li>
                  </ul>
                  <p className="text-xs text-[var(--brand-muted)] mt-3 pt-3 border-t border-[var(--brand-border)]">
                    No film needed. Rules and safety questions are answered against current sources
                    rather than memory.
                  </p>
                </div>
              </div>
            </Card>

            <Callout tone="good" title="It will tell you when it does not know">
              <p>
                If there is not enough film evidence to answer, Play Scout says so instead of
                guessing. That is the point — an answer with a citation is worth acting on, and an
                honest &quot;not enough film yet&quot; tells you what to upload next.
              </p>
            </Callout>
          </Section>

          {/* ---------------------------------------------------------- */}
          <Section id="troubleshooting" icon={ShieldAlert} title="Troubleshooting">
            <Card>
              <div className="divide-y divide-[var(--brand-border)]">
                {FAQS.map((f) => (
                  <div key={f.q} className="py-3.5 first:pt-0 last:pb-0">
                    <p className="font-semibold text-[var(--brand-ink)] text-sm mb-1">{f.q}</p>
                    <p className="text-sm text-[var(--brand-muted)] leading-relaxed">{f.a}</p>
                  </div>
                ))}
              </div>
            </Card>

            <Callout tone="info" title="Still stuck?">
              <p>
                Ask Play Scout — the bubble at the bottom-left answers questions about how the
                product works, not just football.
              </p>
            </Callout>
          </Section>

          <div className="flex flex-wrap gap-3 pt-2">
            <Link
              href="/teams"
              className="flex items-center gap-2 bg-[var(--brand-navy)] text-white font-semibold text-sm px-4 py-2.5 rounded-lg hover:bg-[var(--brand-navy-dark)] transition-colors"
            >
              <Users size={16} />
              Go to my teams
            </Link>
            <Link
              href="/teams/new"
              className="flex items-center gap-2 border border-[var(--brand-border)] text-[var(--brand-navy)] font-semibold text-sm px-4 py-2.5 rounded-lg hover:bg-white transition-colors"
            >
              <Rocket size={16} />
              Create a team
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}
