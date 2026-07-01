export interface AgeLevel {
  level: string
  ages: string
  gameType: string
  practice: string
  contact: string
  install: string[]
  avoid: string[]
  successLooksLike: string
}

export const AGE_LEVELS: AgeLevel[] = [
  {
    level: '6U',
    ages: 'Ages 5–6',
    gameType: 'Flag first',
    practice: '30–60 min, 1–2x/week',
    contact: 'No live collisions; two-point stance only',
    install: [
      'Formation recognition only',
      'Start, stop, chase, dodge, balance',
      'Carry, exchange, basic catch',
      'Visual review of effort and spacing',
    ],
    avoid: [
      'Any live contact or collision drills',
      'Multi-play install — one or two concepts max',
      'Grading against tackle-level fundamentals',
    ],
    successLooksLike: 'Fun, attendance, basic ball security, lines up on cadence',
  },
  {
    level: '8U',
    ages: 'Ages 7–8',
    gameType: 'Flag or Rookie Limited Contact',
    practice: '60–90 min, 1–3x/week',
    contact: 'Two-point stance preferred; progressive contact intro',
    install: [
      '4–6 core plays, 1–2 coverages max',
      'Angles, hip turns, shuffle, break down',
      'Handoff, snap intro, stationary throw',
      'Simple play grades from film',
    ],
    avoid: [
      'Full-speed player-to-player contact without progression',
      'Motion-heavy install before mesh is clean',
      'Complex terminology across multiple formations',
    ],
    successLooksLike: 'Small core menu, maintain leverage, finish controlled reps',
  },
  {
    level: '10U',
    ages: 'Ages 9–10',
    gameType: 'Rookie Tackle or early Senior Tackle',
    practice: '75–105 min, 2–3x/week',
    contact: 'Progressive contact; block-defeat and simple special teams',
    install: [
      '6–10 core plays, 1 front family + adjustment',
      'Change of direction, pursuit leverage, deceleration',
      'Mesh, moving catch, hand placement',
      'Tag basic tendencies from film',
    ],
    avoid: [
      'Installing a blitz package before gap discipline is stable',
      'Skipping block-defeat fundamentals to add scheme depth',
      'Live-collision drills of any kind (Oklahoma, Bull in the Ring)',
    ],
    successLooksLike: 'Clean alignment, fewer busts, protected ball, basic reads',
  },
  {
    level: '12U',
    ages: 'Ages 11–12',
    gameType: 'Senior Tackle',
    practice: '90–120 min, 2–3x/week',
    contact: 'Full contact under limits; technique before scheme',
    install: [
      'Complementary run/pass menu, simple checks',
      'Multi-directional reaction, angle tackling',
      'Timing throws, under-center + gun',
      'Install scouting reports from opponent film',
    ],
    avoid: [
      'Scheme depth that outpaces technique mastery',
      'Skipping self-scout before adding new wrinkles',
      'Ignoring cumulative weekly contact tracking',
    ],
    successLooksLike: 'Consistent assignment + technique, self-correct with film',
  },
  {
    level: '14U',
    ages: 'Ages 13–14',
    gameType: 'Senior Tackle / higher flag',
    practice: '90–120 min, 2–3x/week',
    contact: 'Full contact under youth limits; align with NFHS where applicable',
    install: [
      'Situational packages — still lean, not NFL-deep',
      'Game-speed movement economy',
      'Situational handling under pressure',
      'Situational self-scout + opponent scouting',
    ],
    avoid: [
      'Treating 14U like a college-caliber install',
      'Volume over execution in the install menu',
      'Skipping return-to-play protocol after any head contact',
    ],
    successLooksLike: 'Executes full weekly plan, understands game situations',
  },
]
