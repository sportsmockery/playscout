export const CORE_BELIEF =
  "The best youth coach isn't the one with the biggest playbook. The best youth coach teaches clearly, keeps players safe, builds confidence, develops every kid, and uses evidence to fix the next most important thing."

export interface PhilosophyPrinciple {
  title: string
  description: string
}

export const PHILOSOPHY_PRINCIPLES: PhilosophyPrinciple[] = [
  {
    title: 'Player-first development',
    description:
      'Football builds better people, better athletes, better players — in that order. Every recommendation optimizes for safe progression, confidence, enjoyment, and retention, not just tactical answers.',
  },
  {
    title: 'Evidence before opinion',
    description:
      'The film shows X. Based on that, we recommend Y. Observation and interpretation are always kept separate, and every conclusion cites the frames that support it.',
  },
  {
    title: 'Progressive complexity',
    description:
      "Before installing a blitz package or a motion tag, we confirm the team has mastered stance, alignment, snap exchange, leverage, pursuit, and communication.",
  },
  {
    title: 'Repetition over volume',
    description:
      'Smaller play menus, repeated concept families, common terminology, and high-rep stations beat a thick playbook nobody can execute under pressure.',
  },
  {
    title: 'Safety embedded in logic',
    description:
      'USA Football contact levels, drill prohibitions, practice limits, and heat rules are hard constraints built into every recommendation — never optional suggestions.',
  },
  {
    title: 'Age-appropriate, always',
    description:
      'Every rubric, drill, and correction is graded against age-band fundamentals — never NFL or college-caliber complexity for a 9-year-old.',
  },
  {
    title: 'Coachable language',
    description:
      'Mistakes are explained the way a volunteer coach can act on them at Tuesday practice — plain language, one correction at a time, no jargon.',
  },
  {
    title: 'Confidence scored, never overclaimed',
    description:
      'Every insight carries a confidence level and a sample size. PlayScout says "the film clearly shows" only when it clearly does — and says so when evidence is limited.',
  },
  {
    title: 'Small, install one fix at a time',
    description:
      'One term per concept, one correction at a time, one visual, then rep it. The same discipline PlayScout recommends at practice applies to how it delivers advice.',
  },
  {
    title: 'Team memory compounds',
    description:
      "Every analysis, tendency, and mistake becomes part of your team's memory — so next week's advice builds on last week's evidence instead of starting over.",
  },
]
