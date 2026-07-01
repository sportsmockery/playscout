export interface IntelligenceModule {
  key: 'QBIQ' | 'OLIQ' | 'TeamIQ' | 'MistakeIQ'
  name: string
  tagline: string
  description: string
  icon: 'Target' | 'ShieldCheck' | 'TrendingUp' | 'AlertTriangle'
}

export const INTELLIGENCE_MODULES: IntelligenceModule[] = [
  {
    key: 'QBIQ',
    name: 'QBIQ',
    tagline: 'Quarterback Intelligence',
    description:
      'Grades mechanics, decision-making, and pocket presence from film, then turns it into a development plan built around your quarterback\'s actual reps.',
    icon: 'Target',
  },
  {
    key: 'OLIQ',
    name: 'OLIQ',
    tagline: 'Offensive Line Intelligence',
    description:
      'Grades pass protection, run blocking, and footwork unit-by-unit and player-by-player — leverage and hand placement, not just win/loss.',
    icon: 'ShieldCheck',
  },
  {
    key: 'TeamIQ',
    name: 'TeamIQ',
    tagline: 'Team Intelligence',
    description:
      'Surfaces formation tendencies, play-family frequency, and down-and-distance patterns for both self-scouting and opponent scouting — always with a sample size.',
    icon: 'TrendingUp',
  },
  {
    key: 'MistakeIQ',
    name: 'MistakeIQ',
    tagline: 'Mistake Intelligence',
    description:
      'Flags missed assignments, blown gap fits, and coverage busts by severity, with the specific correction and drill that fixes each one.',
    icon: 'AlertTriangle',
  },
]
