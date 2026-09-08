/**
 * The product organised the way a coach thinks about it.
 *
 * Every entry point used to be a grid of acronyms — QBIQ, RBIQ, OLIQ, TeamIQ,
 * MistakeIQ, RankerIQ, ScoutIQ, PlaybookIQ — which requires knowing the
 * taxonomy before you can do anything. A volunteer coach does not arrive
 * wanting to "run TeamIQ"; they arrive with one of two jobs:
 *
 *   1. We play these guys Friday. How do we beat them?
 *   2. We played Saturday. Who needs work, and what do we fix at practice?
 *
 * So those are the doors. The modules still exist and are still reachable —
 * this is a layer over them, not a replacement — but nobody has to start by
 * picking one.
 */

export type CoachJobId = 'scout' | 'evaluate'

export interface CoachJob {
  id: CoachJobId
  /** The job, in a coach's words. */
  title: string
  /** The question it answers. This is the line that does the work. */
  question: string
  /** What actually happens, so the commitment is legible before they start. */
  steps: string[]
  /** What they walk away with. */
  outcome: string
  cta: string
  href: (teamId: string) => string
}

export const COACH_JOBS: CoachJob[] = [
  {
    id: 'scout',
    title: 'Scout an opponent',
    question: 'Who are we playing, and how do we attack them?',
    steps: [
      'Add the opponent and what colour they wear',
      'Add their film — upload, paste a link, or pull it from Hudl',
      'Scout the clips and build the game plan',
    ],
    outcome: 'A ranked list of ways to attack them, each one tied to the clips it was seen in.',
    cta: 'Scout an opponent',
    href: (teamId) => `/teams/${teamId}/modules/scoutiq`,
  },
  {
    id: 'evaluate',
    title: 'Evaluate your own team',
    question: 'Who played well, and what do we fix at practice?',
    steps: [
      'Pick your game film',
      'Say whether you want the offense or the defense graded',
      'Grade every player on that unit',
    ],
    outcome:
      'Every player graded strongest to weakest with the reason, and the problems that keep repeating.',
    cta: 'Grade your game',
    href: (teamId) => `/teams/${teamId}/modules/rankeriq`,
  },
]

/**
 * What each module answers, in a coach's words rather than an analyst's.
 *
 * The old descriptions were written from the system's side ("Formation
 * frequencies, scheme tendencies") — accurate, and no help at all in choosing.
 * `answers` is phrased as the question a coach already has.
 */
export interface ModuleCopy {
  key: string
  /** The acronym, kept — coaches do learn them, they just can't start with them. */
  name: string
  /** Plain-language name, used where there is room for it. */
  label: string
  /** The coach's question this module answers. */
  answers: string
  /** Which job this belongs to, or null for the ones that stand alone. */
  job: CoachJobId | null
  slug: string
}

export const MODULE_COPY: ModuleCopy[] = [
  {
    key: 'SCOUTIQ',
    name: 'ScoutIQ',
    label: 'Opponent scouting',
    answers: 'Who are we playing, and how do we attack them?',
    job: 'scout',
    slug: 'scoutiq',
  },
  {
    key: 'RANKERIQ',
    name: 'RankerIQ',
    label: 'Player grades',
    answers: 'Who played well and who needs work — every player, with the reason.',
    job: 'evaluate',
    slug: 'rankeriq',
  },
  {
    key: 'MISTAKEIQ',
    name: 'MistakeIQ',
    label: 'What went wrong',
    answers: 'What keeps costing us — missed assignments, bad angles, penalties?',
    job: 'evaluate',
    slug: 'mistakeiq',
  },
  {
    key: 'TEAMIQ',
    name: 'TeamIQ',
    label: 'Our tendencies',
    answers: 'What are we actually doing on film, and what have we become predictable at?',
    job: 'evaluate',
    slug: 'teamiq',
  },
  {
    key: 'QBIQ',
    name: 'QBIQ',
    label: 'Quarterback',
    answers: 'Is my quarterback’s throwing motion, footwork and decision-making sound?',
    job: null,
    slug: 'qbiq',
  },
  {
    key: 'RBIQ',
    name: 'RBIQ',
    label: 'Running back',
    answers: 'Does my back see the hole, protect the ball, and finish runs?',
    job: null,
    slug: 'rbiq',
  },
  {
    key: 'OLIQ',
    name: 'OLIQ',
    label: 'Offensive line',
    answers: 'Is my line blocking the right man, with the right feet and pad level?',
    job: null,
    slug: 'oliq',
  },
  {
    key: 'PLAYBOOKIQ',
    name: 'PlaybookIQ',
    label: 'Playbook',
    answers: 'Is my playbook right for this team, and what should I install next?',
    job: null,
    slug: 'playbookiq',
  },
]

export function moduleCopyFor(key: string): ModuleCopy | undefined {
  return MODULE_COPY.find((m) => m.key === key.toUpperCase())
}

/** The single-player modules, which are a deliberate second tier. */
export const POSITION_MODULE_KEYS = ['QBIQ', 'RBIQ', 'OLIQ'] as const
