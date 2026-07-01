export interface RecommendationSections {
  diagnosis: string
  why: string
  immediateFix: string
  practiceDrill: string
  gameAdjustment: string
  whatToTrack: string
}

export interface DemoMessage {
  role: 'coach' | 'assistant'
  /** Plain text used for clarifying-question or refusal-style replies. */
  text?: string
  /** Structured PlayScout recommendation format, when applicable. */
  sections?: RecommendationSections
  /** Source label shown above the response, e.g. citation tier. */
  citation?: string
}

export interface DemoConversation {
  id: string
  label: string
  messages: DemoMessage[]
  followUps: string[]
}

export const EXAMPLE_QUERIES: string[] = [
  'What should we work on at practice this week?',
  "Our sweep keeps getting blown up by overpursuit — we're 10U tackle.",
  'Our kids are arm tackling instead of wrapping up. 12U tackle.',
  'Our center keeps snapping the ball over our QB\'s head. 8U rookie tackle.',
  "We're fumbling too much at 10U — what's the fix?",
  'How do we attack a Cover 3 defense?',
  'Generate a practice plan for Saturday — 10U, 90 minutes, 16 players.',
  'Can we run an Oklahoma drill to toughen up our offensive line?',
]

export const DEMO_CONVERSATIONS: DemoConversation[] = [
  {
    id: 'vague-question',
    label: 'What should we work on this week?',
    messages: [
      { role: 'coach', text: 'What should we work on at practice this week?' },
      {
        role: 'assistant',
        text: "Happy to help build this week's priorities — but the right answer depends on a few things I don't have yet. Can you tell me:\n\n• Age level and game type (flag or tackle)?\n• How many players on the roster, and practice time available?\n• What's the opponent's style, if you know it?\n• Where is the team strongest/weakest right now — offense, defense, or fundamentals?\n\nOnce I know that, I'll point you to the two or three highest-leverage things to install this week instead of a generic list.",
      },
    ],
    followUps: [
      "We're 10U tackle, 16 players, 90 minutes twice a week.",
      'Our defense keeps giving up big plays on the edge.',
    ],
  },
  {
    id: 'overpursuit-sweep',
    label: 'Overpursuit on sweep (10U)',
    messages: [
      {
        role: 'coach',
        text: "Our sweep keeps getting blown up by overpursuit — we're 10U tackle.",
      },
      {
        role: 'assistant',
        citation: 'Based on PlayScout\'s Common Youth Problems correction tree',
        sections: {
          diagnosis:
            'This is a force/spill clarity problem, not a talent problem. At 10U, defenders are typically taught to "run to the ball" without a clear rule for who sets the edge and who spills the ball back inside.',
          why: 'Without an assigned force player, everyone on defense pursues the ballcarrier from the same angle. Once the sweep gets outside that pursuit, there is no second layer of defenders to cut it off — hence the explosive gain.',
          immediateFix:
            'Assign one player per call as the force/contain defender whose only job is to keep outside leverage and turn the ball back inside. Everyone else pursues inside-out, not straight at the ball.',
          practiceDrill:
            'Walk-through the force call at half speed for 10 reps, then run a pursuit-lanes drill: cones mark "outside," "inside-out," and "backside" landmarks so each defender reps their actual assignment, not just chasing color.',
          gameAdjustment:
            'On tape, watch for whether the offense is attacking the same edge repeatedly. If so, shade the force player pre-snap toward the boundary side without changing the entire front.',
          whatToTrack:
            'Explosive runs allowed (10+ yards) and missed force calls per game. You should see both drop within two weeks if the fit discipline holds.',
        },
      },
    ],
    followUps: [
      'What if the force player still gets sealed by a lead blocker?',
      'How do we teach this without more live contact reps?',
    ],
  },
  {
    id: 'arm-tackling',
    label: 'Arm tackling (12U)',
    messages: [
      { role: 'coach', text: 'Our kids are arm tackling instead of wrapping up. 12U tackle.' },
      {
        role: 'assistant',
        citation: 'Based on PlayScout\'s Common Youth Problems correction tree',
        sections: {
          diagnosis:
            "Arm tackling at 12U is almost always a symptom of chasing the collision instead of building leverage first — the tackler is trying to hit, not finish.",
          why: 'When contact is introduced before the breakdown-and-approach mechanics are automatic, players default to lunging with the arms because it feels faster than getting the body in proper leverage position.',
          immediateFix:
            'Pull tackling back to a no-live-reps progression this week: breakdown position → near-foot step → fit-and-freeze on contact → control → thud. Do not return to full-speed tackling until fit-and-freeze is clean.',
          practiceDrill:
            'Fit-and-freeze on a bag or shield: approach under control, break down, step with the near foot, wrap and freeze the fit for a two-count before releasing. Repeat until the wrap is automatic before adding any movement.',
          gameAdjustment:
            "This week, prioritize angle and leverage over aggression in your in-game coaching points — praise a good breakdown even on a missed tackle, since that's the technique you're rebuilding.",
          whatToTrack:
            'Tackle finish rate (wrap-and-control vs. arm attempts) charted from film. Target a clear upward trend before reintroducing any live full-speed reps.',
        },
      },
    ],
    followUps: [
      'How many reps before we can go back to live tackling?',
      'What drill order should indy time follow this week?',
    ],
  },
  {
    id: 'bad-snaps',
    label: "Center's snaps are off (8U)",
    messages: [
      { role: 'coach', text: "Our center keeps snapping the ball over our QB's head. 8U rookie tackle." },
      {
        role: 'assistant',
        citation: 'Based on PlayScout\'s Common Youth Problems correction tree',
        sections: {
          diagnosis:
            'This reads as a grip and stance inconsistency issue rather than an effort issue — a snap sailing high is a classic sign of an inconsistent release point.',
          why: 'At 8U, the center is often learning the snap motion at the same time as everything else (stance, cadence, first-step assignment). Under any pressure — cadence, defenders lining up close — the mechanics break down first.',
          immediateFix:
            'Isolate the snap entirely from the rest of the play for a few days. Lower the elbow, shorten the snap motion, and have the center snap to a stationary target before ever snapping to a moving QB.',
          practiceDrill:
            'Snap progression ladder: snap-only reps to a bucket or stationary hand target, then snap-and-step (adding the first block step), then full snap-to-play-clock reps. Don\'t advance a stage until accuracy is consistent.',
          gameAdjustment:
            "Move center reps earlier in practice this week if the misses seem to get worse late in practice — that's a fatigue pattern, not a mechanics pattern, and the fix is different.",
          whatToTrack:
            'Snap accuracy percentage by drill stage. You want this consistently above 90% in isolated reps before expecting it to hold up in a live series.',
        },
      },
    ],
    followUps: [
      'What if it\'s worse under center than in shotgun?',
      'Should we bench the center or keep repping through it?',
    ],
  },
  {
    id: 'ball-security',
    label: 'Fumbling too much (10U)',
    messages: [
      { role: 'coach', text: "We're fumbling too much at 10U — what's the fix?" },
      {
        role: 'assistant',
        citation: 'Based on PlayScout\'s Common Youth Problems correction tree',
        sections: {
          diagnosis:
            'This pattern usually traces back to a loose carry technique combined with too much contact chaos introduced before ball security habits are locked in.',
          why: "At 10U, ball carriers are often taught to run before they're taught to secure — so under contact, the hand naturally comes off the ball to balance or brace instead of clamping it.",
          immediateFix:
            'Rebuild the carry from the ground up: high-and-tight positioning through crowded areas, with a coach or teammate calling "ball" as a strip-awareness cue on every rep.',
          practiceDrill:
            'Two-ball security circuit — carry two footballs (one in each arm) through a short gauntlet to over-exaggerate the tight carry, then progress to a traffic gauntlet with no live collisions, just bump-and-brace contact.',
          gameAdjustment:
            'In-game, call out "secure" as a cue any time a ball carrier is entering a crowd, and treat every fumble on film as a technique rep to fix — not a toughness issue.',
          whatToTrack:
            'Balls on the ground per practice and per game. Assign every assistant coach the same ball-security language so the cue is consistent across every rep, not just the ones you personally watch.',
        },
      },
    ],
    followUps: [
      'Is this different for a running back vs. a receiver after the catch?',
      'How much of this is just aggressive tackling from the other team?',
    ],
  },
  {
    id: 'cover-3',
    label: 'Attacking a Cover 3 defense',
    messages: [
      { role: 'coach', text: 'How do we attack a Cover 3 defense?' },
      {
        role: 'assistant',
        citation:
          "This answer draws on general football knowledge, not your team's film — treat it as a starting framework, not a scouting report.",
        sections: {
          diagnosis:
            'Cover 3 leaves three deep-third defenders and short zones underneath — the naturally soft areas are the flat (if a curl/flat defender widens late) and the deep middle seam between the two deep-thirds.',
          why: 'Youth Cover 3 most often breaks down on landmark discipline — flats widening too far or hooks sitting too shallow — rather than a scheme weakness itself.',
          immediateFix:
            'Attack with routes that stress the seam and the flat simultaneously — a boot or sprint-out concept gives your QB a simple high-low read between those two soft spots without requiring a full progression.',
          practiceDrill:
            'Rep the boot/sprint-out concept: sell the run action, protect the edge, and have the QB read flat-to-deep in that order — this stays simple even for a younger quarterback.',
          gameAdjustment:
            "If you see the flat defender widening late off the snap in the first few series, that's your tell — attack that same flat again before they adjust.",
          whatToTrack:
            "Completion rate and bust rate by route concept once you have your own film against a Cover 3 look — that will tell you whether this specific defense breaks the same way most youth Cover 3s do.",
        },
      },
    ],
    followUps: [
      'What if they run Cover 2 instead?',
      'Can you scout our actual opponent from our film?',
    ],
  },
  {
    id: 'practice-plan',
    label: 'Generate a Saturday practice plan',
    messages: [
      { role: 'coach', text: 'Generate a practice plan for Saturday — 10U, 90 minutes, 16 players.' },
      {
        role: 'assistant',
        citation: "Based on PlayScout's daily practice template, scaled to your roster and time",
        sections: {
          diagnosis:
            'A 90-minute window with 16 players fits the standard daily template well — the key is protecting rep quality in individual time since you have enough bodies to run real stations.',
          why: 'At 10U, the biggest return on a 90-minute practice comes from individual fundamentals and team-period bust reduction, not from adding new install.',
          immediateFix:
            'Structure: 10 min arrival/warm-up, 15 min dynamic movement prep, 20 min individual stations (3 groups rotating), 15 min group combination work, 10 min special teams, 15 min team period, 5 min cool-down/review.',
          practiceDrill:
            'Split into 3 stations for individual time (skill, line, secondary) with a coach on each — 6-7 minute rotations keep reps high without fatigue creeping into technique.',
          gameAdjustment:
            'Use the 15-minute team period to script the situations you actually expect Saturday — down-and-distance tendencies you\'ve seen from this opponent, not just base run/pass.',
          whatToTrack:
            'Bust rate and rep quality during team period — if busts are high, that\'s a sign the install menu is too big for this roster\'s current mastery level.',
        },
      },
    ],
    followUps: [
      'Can you add a special teams period focused on punt safe/shield?',
      'What should indy stations look like if I only have 2 coaches?',
    ],
  },
  {
    id: 'unsafe-drill-refusal',
    label: '"Can we run an Oklahoma drill?"',
    messages: [
      { role: 'coach', text: 'Can we run an Oklahoma drill to toughen up our offensive line?' },
      {
        role: 'assistant',
        citation: 'Safety non-negotiable — PlayScout will not recommend this drill',
        sections: {
          diagnosis:
            "I won't recommend the Oklahoma drill, Bull in the Ring, or any board/collision-only drill — these are on PlayScout's prohibited list regardless of age or level because the only outcome is a live, full-speed collision with no technique objective and no escape.",
          why: "\"Toughness\" at the youth level is better built through controlled technique reps that still involve real contact — the injury risk of unstructured collision drills isn't offset by a proportional development benefit.",
          immediateFix:
            'Replace it with a fit-and-freeze progression on bags or shields — real contact, real physicality, but with a technique objective (leverage, hand placement, hat position) instead of a pure collision outcome.',
          practiceDrill:
            'Step-and-shock on a shield: first-step explosion into the shield holder, strike with hands inside, extend and drive for a controlled 3-5 yard finish. Increase intensity only as technique holds up.',
          gameAdjustment:
            'On Saturday, physicality shows up as pad level and hand placement, not just willingness to collide — coach to that standard and it will show up as real toughness without the injury exposure.',
          whatToTrack:
            'Fit accuracy and hand-placement consistency from film, plus injury-free reps. If the line is still lacking aggression after a few weeks of this progression, that\'s a confidence and reps issue, not a "need more collision" issue.',
        },
      },
    ],
    followUps: [
      'What other drills are on the prohibited list?',
      'How do we build physicality without full-speed collisions?',
    ],
  },
]

export interface QuickReferenceItem {
  title: string
  content: string
}

export interface QuickReferenceSection {
  title: string
  items: QuickReferenceItem[]
}

export const QUICK_REFERENCE: QuickReferenceSection[] = [
  {
    title: 'Age Levels',
    items: [
      { title: '6U — Flag first', content: 'No live collisions, two-point stance only. 30–60 min, 1–2x/week. Success = fun, attendance, ball security.' },
      { title: '8U — Flag or Rookie Limited Contact', content: 'Progressive contact intro. 60–90 min, 1–3x/week. 4–6 core plays, 1–2 coverages max.' },
      { title: '10U — Rookie/Senior Tackle', content: 'Progressive contact, block-defeat basics. 75–105 min, 2–3x/week. 6–10 core plays, 1 front family.' },
      { title: '12U — Senior Tackle', content: 'Full contact under limits, technique before scheme. 90–120 min, 2–3x/week.' },
      { title: '14U — Senior Tackle / higher flag', content: 'Full contact under youth limits, aligned with NFHS where applicable. Situational packages, still lean.' },
    ],
  },
  {
    title: 'Offensive Families',
    items: [
      { title: 'Tight / gap-based run', content: 'Best for 8U–12U. Better angles, easier blocking landmarks. Core family for teams new to tackle.' },
      { title: 'Wing / motion misdirection', content: 'Teaches leverage and eye discipline. Hard cap on motions and tags to avoid multiplying complexity.' },
      { title: 'Gun spread-lite', content: '10U–14U with a reliable snapper only. Bad snaps kill it — verify snap metrics first.' },
      { title: 'Under-center concept offense', content: 'Good all-around identity — teaches exchange, fakes, backfield timing.' },
    ],
  },
  {
    title: 'Defensive Priorities',
    items: [
      { title: '6-2 / 5-3 front', content: 'Strong beginner tackle structure for 6U–10U run-heavy opponents. Simple edges, easy inside fits.' },
      { title: '4-4 front', content: 'Good all-around default for 10U–14U. Balanced vs. youth run, needs LB discipline.' },
      { title: 'Force & spill clarity', content: 'The #1 fix for perimeter overpursuit — assign one force player, everyone else pursues inside-out.' },
      { title: 'One blitz at a time', content: 'Install only one pressure tag from the same shell and coverage — pair it with one exact landmark.' },
    ],
  },
  {
    title: 'Safety Rules',
    items: [
      { title: 'Prohibited drills', content: 'Never: Oklahoma drill, Bull in the Ring, board/collision-only drills — any drill whose only outcome is a head-on collision with no technique objective.' },
      { title: 'Same-day concussion removal', content: 'Any suspected concussion = out for the rest of that day, no same-day return regardless of symptom resolution. Graduated return-to-play under medical supervision.' },
      { title: 'No two-a-days for youth', content: 'Progressive contact levels only — never jump to full-speed player-to-player contact without proper progression.' },
      { title: 'Heat & equipment', content: 'Multi-day heat acclimatization, mandatory hydration breaks, NOCSAE-certified helmets fitted by a qualified person.' },
    ],
  },
]
