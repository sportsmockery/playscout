export interface DailySegment {
  segment: string
  minutes: string
  content: string
}

export const DAILY_PRACTICE_TEMPLATE: DailySegment[] = [
  { segment: 'Arrival & readiness', minutes: '5–10', content: 'Roll, hydration, injury check, objective for the day' },
  { segment: 'Dynamic warm-up', minutes: '8–12', content: 'Progressive movement prep' },
  { segment: 'Individual (indy)', minutes: '12–20', content: 'Position fundamentals, drill stations' },
  { segment: 'Group', minutes: '8–15', content: '2–3 position groups working together' },
  { segment: 'Special teams', minutes: '5–10', content: 'One unit per day' },
  { segment: 'Team period', minutes: '10–20', content: 'Run, pass, or scripted situations' },
  { segment: 'Situational', minutes: '5–10', content: 'One specific situation, repeated' },
  { segment: 'Cool-down & review', minutes: '5', content: "Communicate today's outcome, preview next session" },
]

export const SEASON_PHASES = [
  { phase: 'Orientation', goal: 'Standards, equipment fit, baseline movement' },
  { phase: 'Fundamentals', goal: 'Install the contact system, base football movements' },
  { phase: 'Core install', goal: 'Small play/call menu' },
  { phase: 'Situational', goal: 'Down-and-distance, red zone, PAT, clock' },
  { phase: 'Refinement', goal: 'Improve execution, reduce volume' },
  { phase: 'Review', goal: 'Reflect, update player profiles for next season' },
]

export const GAME_DAY_FRAMEWORK = {
  pregame: [
    'Confirm roster availability and injury reporting norms',
    'Walk the call sheet — one primary, one counter, one safe pass per situation',
    'Rehearse cadence and communication one more time',
  ],
  halftimeRule:
    'Fix no more than three things at halftime. Pick the highest-leverage corrections from what the film and the first half actually showed, install them clearly, and let the players execute — piling on more than three erases what does get fixed.',
  postgame: [
    'Tag the plays that matter before memory fades — busts, explosive plays allowed, and what worked',
    "Note the specific failure type behind any explosive play allowed (force, gap, or pursuit) — don't just change the whole scheme",
    'Update player development notes while the game is still fresh',
  ],
}
