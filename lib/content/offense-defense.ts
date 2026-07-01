export interface ConceptFamily {
  name: string
  bestFit: string
  strengths: string
  risks: string
  recommendation: string
}

export const OFFENSIVE_FAMILIES: ConceptFamily[] = [
  {
    name: 'Tight / gap-based run',
    bestFit: '8U–12U',
    strengths: 'Better angles, easier blocking landmarks',
    risks: 'Predictable if it stays the only family',
    recommendation: 'Core family for teams new to tackle',
  },
  {
    name: 'Wing / motion misdirection',
    bestFit: '8U–14U',
    strengths: 'Teaches leverage, counters, eye discipline',
    risks: 'Multiplies fast if tags stack unchecked',
    recommendation: 'Hard cap on motions and tags',
  },
  {
    name: 'Gun spread-lite',
    bestFit: '10U–14U with a reliable snapper',
    strengths: 'Simplifies QB eyes, helps spacing',
    risks: 'Bad snaps kill it',
    recommendation: 'Only after snap and protection metrics are stable',
  },
  {
    name: 'Under-center concept offense',
    bestFit: '8U–14U',
    strengths: 'Teaches exchange, fakes, backfield timing',
    risks: 'Requires more rep time early',
    recommendation: 'Good all-around development identity',
  },
]

export const OFFENSIVE_PLAY_FAMILY = {
  title: 'Every identity: core play → constraint play → counter → safe pass complement',
  plays: [
    {
      name: 'Toss / Speed Sweep',
      rationale: 'Creates a clear edge landmark, teaches leverage and pursuit on both sides.',
      commonError: 'Back bubbles too deep — fix with cone dots for catch point and alley.',
    },
    {
      name: 'QB Follow / Power',
      rationale: 'Best when the exchange is stronger than the passing game.',
      commonError: 'QB outruns the blocker — walk the pathing, cue "heels of blocker."',
    },
    {
      name: 'Counter / Reverse Action',
      rationale: 'Punishes the overpursuit that shows up constantly in youth film.',
      commonError: 'Install only after sweep mesh is clean — identical initial picture is non-negotiable.',
    },
    {
      name: 'Boot / Sprint-Out Pass',
      rationale: 'Simple half-field reads that protect young quarterbacks.',
      commonError: 'QB drifting backward — paint the launch point, cone the pocket.',
    },
  ],
}

export const DEFENSIVE_STRUCTURES: ConceptFamily[] = [
  {
    name: '6-2 or 5-3',
    bestFit: '6U–10U, run-heavy',
    strengths: 'Simple edges, easy inside fits',
    risks: 'Vulnerable to weak DB support',
    recommendation: 'Strong beginner tackle structure',
  },
  {
    name: '4-4',
    bestFit: '10U–14U',
    strengths: 'Balanced vs. youth run, flexible force',
    risks: 'Requires linebacker discipline',
    recommendation: 'Good all-around default',
  },
  {
    name: '4-2-5 / nickel-lite',
    bestFit: '12U–14U or advanced flag',
    strengths: 'Better space defense',
    risks: 'Demands strong DB tackling',
    recommendation: 'Only after fit discipline is stable',
  },
  {
    name: 'Goal-line',
    bestFit: 'All tackle ages',
    strengths: 'Clarifies heavy-run situations',
    risks: 'Tempts overuse outside the situation',
    recommendation: 'Install as a situation, not an identity',
  },
]

export const DEFENSIVE_CONCEPTS = [
  {
    name: 'Base 4-4, Spill / Force vs. Run',
    steps: 'Define who sets the edge, who spills, who overlaps, who fills the cutback.',
    commonError: 'Everyone chasing the same gap — fix with a fit walk-through before team period.',
  },
  {
    name: 'Cover 3 / 3-Deep Zone',
    steps: 'Teach thirds, curl/flat landmarks, hook landmarks, force support.',
    commonError: 'Flats widening or hooks going shallow — landmarks must be coned in indy.',
  },
  {
    name: 'Simple Pressure Tag',
    steps: 'Install only one blitz from the same shell and same coverage.',
    commonError: 'Blitz depth too flat — needs an exact landmark assignment.',
  },
]
