export interface Feature {
  icon:
    | 'Film'
    | 'ShieldCheck'
    | 'Users'
    | 'Target'
    | 'ClipboardList'
    | 'TrendingUp'
    | 'Gauge'
    | 'BrainCircuit'
  title: string
  description: string
}

export const FEATURES: Feature[] = [
  {
    icon: 'Film',
    title: 'AI Film Breakdown & Diagnosis',
    description:
      'Upload a clip and PlayScout extracts evenly spaced frames, tags what actually happened, and separates observation from interpretation — never guessing beyond the visual evidence.',
  },
  {
    icon: 'Gauge',
    title: 'Confidence-Scored Evidence',
    description:
      'Every conclusion ships with a confidence score and the exact frames that support it. If the film is inconclusive, PlayScout says so instead of inventing certainty.',
  },
  {
    icon: 'ClipboardList',
    title: 'Age-Appropriate Practice Design',
    description:
      'Practice plans and drill menus are filtered through your age band and game type first — 6U never gets 14U complexity, and tackle never gets flag assumptions.',
  },
  {
    icon: 'Target',
    title: 'Opponent & Self-Scouting Tendencies',
    description:
      'PlayScout surfaces repeated behavior across plays — perimeter run tendency, soft edges, coverage busts on motion — always with a sample size and confidence level attached.',
  },
  {
    icon: 'Users',
    title: 'Position-Specific Player Development',
    description:
      'QB, RB, receiver, offensive line, linebacker, and secondary rubrics grounded in real prerequisite chains — stance before assignment, assignment before scheme.',
  },
  {
    icon: 'TrendingUp',
    title: 'Mistake Detection & Coachable Corrections',
    description:
      'Missed assignments, blown gap fits, and arm-tackling get explained in language a volunteer coach can install at Tuesday practice — with the drill that fixes it.',
  },
  {
    icon: 'ShieldCheck',
    title: 'Safety & Long-Term Athlete Protection',
    description:
      'Contact-level limits, prohibited drills, concussion protocol prompts, and heat-acclimatization rules are hard constraints built into every recommendation — never suggestions.',
  },
  {
    icon: 'BrainCircuit',
    title: 'Team Memory That Compounds',
    description:
      "Every analysis becomes part of your team's memory. Next week's advice builds on last week's evidence instead of starting from zero every Monday.",
  },
]
