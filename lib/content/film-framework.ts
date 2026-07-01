export interface FilmStep {
  step: number
  title: string
  description: string
}

export const FILM_ANALYSIS_STEPS: FilmStep[] = [
  {
    step: 1,
    title: 'Upload the film',
    description:
      'A quick clip or a full game — dropped in from your phone or a resumable upload for full-game files. No special equipment required.',
  },
  {
    step: 2,
    title: 'Extract the evidence',
    description:
      'PlayScout breaks the video into evenly spaced frames per play so every conclusion can point back to exactly what was visible on screen.',
  },
  {
    step: 3,
    title: 'Tag what is observed',
    description:
      'Alignment, assignment, leverage, effort, ball security, and tackling angles are logged as observations first — before any interpretation happens.',
  },
  {
    step: 4,
    title: 'Score confidence',
    description:
      'Every conclusion gets a 0.0–1.0 confidence score and a sample size. If the evidence is limited, PlayScout says so instead of overclaiming.',
  },
  {
    step: 5,
    title: 'Turn evidence into a fix',
    description:
      'Diagnosis becomes a coachable recommendation — the specific correction, the drill that installs it, and the game adjustment it unlocks.',
  },
  {
    step: 6,
    title: 'Remember it next week',
    description:
      "The result joins your team's memory, so the next question — about this player, this tendency, this opponent — builds on real history instead of starting over.",
  },
]
