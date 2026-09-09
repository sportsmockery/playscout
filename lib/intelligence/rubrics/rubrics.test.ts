import { describe, it, expect } from 'vitest'
import {
  RUBRICS,
  DRILLS,
  QBIQ_RUBRIC,
  OLIQ_RUBRIC,
  RBIQ_RUBRIC,
  allCueIds,
  allowedContact,
  drillMenuFor,
  resolvePrescriptions,
  renderPrescriptions,
  buildRubricPrompt,
  buildDrillMenuPrompt,
} from './index'
import type { LevelTier } from '../levels'

const ALL_RUBRICS = [QBIQ_RUBRIC, OLIQ_RUBRIC, RBIQ_RUBRIC]
const EVERY_CUE = new Set(ALL_RUBRICS.flatMap((r) => [...allCueIds(r)]))

describe('rubric integrity', () => {
  it.each(ALL_RUBRICS)('$module dimension weights sum to 1', (rubric) => {
    const total = rubric.dimensions.reduce((n, d) => n + d.weight, 0)
    expect(total).toBeCloseTo(1)
  })

  it.each(ALL_RUBRICS)('$module gives every cue a marker and a standard', (rubric) => {
    // The two columns that never used to ship. A cue without them puts the
    // model back to deciding both where to look and what counts as good.
    for (const d of rubric.dimensions) {
      for (const c of d.cues) {
        expect(c.marker.length).toBeGreaterThan(10)
        expect(c.good.length).toBeGreaterThan(10)
      }
    }
  })

  it.each(ALL_RUBRICS)('$module has a benchmark row for every level, including JV and varsity', (rubric) => {
    // The knowledge base stops at 8U/10U/12U while resolveLevelTier spans
    // 6U → varsity, which left the levels the product refuses to clamp to
    // youth standards with no anchor at all.
    const tiers: LevelTier[] = ['youth_early', 'youth', 'youth_older', 'middle_school', 'jv', 'varsity']
    for (const b of rubric.benchmarks) {
      for (const tier of tiers) {
        expect(b.targets[tier], `${rubric.module} / ${b.cue} / ${tier}`).toBeTruthy()
      }
    }
  })
})

describe('drill catalog', () => {
  it('only claims to fix ids that actually exist', () => {
    // A drill pointing at nothing can never be prescribed and would silently
    // shrink the menu. There are two legitimate vocabularies now: the position
    // rubrics' cues, and — for the defensive drills, which have no rubric
    // behind them — MISTAKEIQ's categories and the defensive tendency types.
    const DEFENSIVE_IDS = new Set([
      'missed_assignment', 'missed_block', 'missed_contain', 'wrong_gap_fit',
      'bad_pursuit_angle', 'poor_tackling_leverage', 'turnover_risk', 'snap_mesh_issue',
      'alignment_error', 'coverage_bust', 'penalty_risk', 'poor_effort', 'clock_situation_error',
      'overpursuit', 'gap_loss_inside_out', 'soft_edge',
      'motion_coverage_bust', 'tackling_leverage', 'blitz_tendency',
    ])
    for (const drill of DRILLS) {
      for (const cue of drill.fixes) {
        expect(
          EVERY_CUE.has(cue) || DEFENSIVE_IDS.has(cue),
          `${drill.id} fixes unknown id ${cue}`
        ).toBe(true)
      }
    }
  })

  it('has unique ids and a coaching cue for each', () => {
    expect(new Set(DRILLS.map((d) => d.id)).size).toBe(DRILLS.length)
    for (const d of DRILLS) expect(d.cue.length).toBeGreaterThan(5)
  })

  it('covers every cue in every rubric with at least one drill', () => {
    // Otherwise a cue can be graded below standard with nothing to prescribe
    // for it, and the model is pushed back toward inventing something.
    const covered = new Set(DRILLS.flatMap((d) => d.fixes))
    const uncovered = [...EVERY_CUE].filter((c) => !covered.has(c))
    expect(uncovered).toEqual([])
  })
})

describe('contact gating', () => {
  it('offers a flag team nothing but non-contact work', () => {
    expect(allowedContact('flag', 'youth')).toEqual(['none'])
    const menu = drillMenuFor({ cueIds: allCueIds(RBIQ_RUBRIC), gameType: 'flag', tier: 'youth' })
    expect(menu.every((d) => d.contact === 'none')).toBe(true)
    expect(menu.length).toBeGreaterThan(0)
  })

  it('treats an unstated game type as the safest reading', () => {
    expect(allowedContact(undefined, 'varsity')).toEqual(['none', 'bag'])
    expect(allowedContact('rookie_tackle', 'youth')).toEqual(['none', 'bag'])
  })

  it('keeps live drills off the youth menu even for a tackle team', () => {
    expect(allowedContact('tackle', 'youth_older')).toEqual(['none', 'bag'])
    expect(allowedContact('tackle', 'varsity')).toEqual(['none', 'bag', 'live'])
  })

  it('only offers drills relevant to the module being run', () => {
    const menu = drillMenuFor({ cueIds: allCueIds(QBIQ_RUBRIC), gameType: 'tackle', tier: 'varsity' })
    expect(menu.some((d) => d.id === 'qb_center_exchange')).toBe(true)
    expect(menu.some((d) => d.id === 'sled_shield_drive')).toBe(false)
  })
})

describe('resolvePrescriptions', () => {
  const menu = drillMenuFor({ cueIds: allCueIds(QBIQ_RUBRIC), gameType: 'tackle', tier: 'varsity' })
  const cueIds = allCueIds(QBIQ_RUBRIC)

  it('fills the drill name and coaching cue from the catalog', () => {
    const out = resolvePrescriptions(
      [{ drill_id: 'line_to_target_step', fixes_cue: 'stride_length', why_this_rep: 'Front foot landed closed.' }],
      { menu, cueIds }
    )

    expect(out).toHaveLength(1)
    expect(out[0].name).toBe('Line-to-target step drill')
    expect(out[0].coaching_cue).toContain('Front foot points at the target')
  })

  it('drops a drill the model invented', () => {
    const out = resolvePrescriptions(
      [{ drill_id: 'oklahoma_drill', fixes_cue: 'stride_length', why_this_rep: 'x' }],
      { menu, cueIds }
    )
    expect(out).toEqual([])
  })

  it('drops a drill that is off this team\'s contact menu', () => {
    // The same prescription is fine for a tackle team and not for a flag one.
    const flagMenu = drillMenuFor({ cueIds: allCueIds(RBIQ_RUBRIC), gameType: 'flag', tier: 'youth' })
    const rbCues = allCueIds(RBIQ_RUBRIC)
    const bagDrill = { drill_id: 'finish_through_the_bag', fixes_cue: 'runs_behind_pads', why_this_rep: 'x' }

    expect(resolvePrescriptions([bagDrill], { menu: flagMenu, cueIds: rbCues })).toEqual([])
    expect(
      resolvePrescriptions([bagDrill], {
        menu: drillMenuFor({ cueIds: rbCues, gameType: 'tackle', tier: 'varsity' }),
        cueIds: rbCues,
      })
    ).toHaveLength(1)
  })

  it('drops a prescription pointing at a cue this module does not grade', () => {
    const out = resolvePrescriptions(
      [{ drill_id: 'line_to_target_step', fixes_cue: 'hip_roll_and_leg_drive', why_this_rep: 'x' }],
      { menu, cueIds }
    )
    expect(out).toEqual([])
  })

  it('does not prescribe the same drill twice', () => {
    const out = resolvePrescriptions(
      [
        { drill_id: 'line_to_target_step', fixes_cue: 'stride_length', why_this_rep: 'a' },
        { drill_id: 'line_to_target_step', fixes_cue: 'base_width', why_this_rep: 'b' },
      ],
      { menu, cueIds }
    )
    expect(out).toHaveLength(1)
  })

  it('renders a coach-facing line naming the cue and the reason', () => {
    const rendered = renderPrescriptions(
      resolvePrescriptions(
        [{ drill_id: 'line_to_target_step', fixes_cue: 'stride_length', why_this_rep: 'Front foot landed closed at 0:02.1.' }],
        { menu, cueIds }
      )
    )
    expect(rendered[0]).toContain('fixes stride length')
    expect(rendered[0]).toContain('Front foot landed closed at 0:02.1.')
  })
})

describe('rendered prompt', () => {
  it('carries the marker and the standard for the tier being graded', () => {
    const varsity = buildRubricPrompt(QBIQ_RUBRIC, 'varsity')
    expect(varsity).toContain('Torso rotation through the middle of the throw')
    expect(varsity).toContain('Throws receivers open')
    expect(varsity).not.toContain('Find #1, else run')

    const youth = buildRubricPrompt(QBIQ_RUBRIC, 'youth')
    expect(youth).toContain('Reads one defender or one picture')
    expect(youth).not.toContain('Throws receivers open')
  })

  it('states the weights and the null-handling rule', () => {
    const prompt = buildRubricPrompt(OLIQ_RUBRIC, 'jv')
    expect(prompt).toContain('PASS_PROTECTION (40% of overall)')
    expect(prompt).toContain('the clip contains no pass attempt at all')
  })

  it('tells the model not to compute the overall score', () => {
    // The score is arithmetic, and arithmetic inside a vision call is where
    // the stated formula quietly stopped being followed on null dimensions.
    const prompt = buildRubricPrompt(OLIQ_RUBRIC, 'varsity')
    expect(prompt).toContain('do NOT return one')
    expect(prompt).toContain('reweighted')
  })

  it('lists only ids the model is allowed to choose', () => {
    const menu = drillMenuFor({ cueIds: allCueIds(RBIQ_RUBRIC), gameType: 'flag', tier: 'youth' })
    const prompt = buildDrillMenuPrompt(menu)
    expect(prompt).toContain('choose from these ids only')
    expect(prompt).not.toContain('finish_through_the_bag')
    expect(prompt).toContain('two_ball_security_carries')
  })
})

describe('module rubric registry', () => {
  it('registers the player modules that grade an individual', () => {
    expect(Object.keys(RUBRICS).sort()).toEqual(['OLIQ', 'QBIQ', 'RBIQ'])
  })
})

describe('defensive drills', () => {
  // There is no defensive rubric, so these are keyed to MISTAKEIQ's mistake
  // categories and the defensive tendency types. Before they existed, every
  // defensive drill a coach read was free-form model invention — the exact
  // failure this catalog was built to end, silently in force for any team
  // being evaluated on defense.
  const MISTAKE_CATEGORIES = [
    'missed_assignment', 'missed_block', 'missed_contain', 'wrong_gap_fit',
    'bad_pursuit_angle', 'poor_tackling_leverage', 'turnover_risk', 'snap_mesh_issue',
    'alignment_error', 'coverage_bust', 'penalty_risk', 'poor_effort', 'clock_situation_error',
  ]
  const DEFENSIVE_TENDENCIES = [
    'overpursuit', 'gap_loss_inside_out', 'soft_edge',
    'motion_coverage_bust', 'tackling_leverage', 'blitz_tendency',
  ]
  const DEFENSIVE_IDS = new Set([...MISTAKE_CATEGORIES, ...DEFENSIVE_TENDENCIES])

  const defensive = DRILLS.filter((d) => d.id.startsWith('def_'))

  it('covers the breakdowns a defense is actually graded on', () => {
    // Not every category — turnover_risk and clock_situation_error are not
    // drill-shaped — but every one a coach would ask "so what do we rep?" of.
    const mustCover = [
      'missed_contain',
      'wrong_gap_fit',
      'bad_pursuit_angle',
      'poor_tackling_leverage',
      'coverage_bust',
      'alignment_error',
      'poor_effort',
      'soft_edge',
      'overpursuit',
      'motion_coverage_bust',
    ]
    for (const cue of mustCover) {
      const menu = drillMenuFor({
        cueIds: new Set([cue]),
        gameType: 'tackle',
        tier: 'youth_9_10' as LevelTier,
      })
      expect(menu.length, `no drill fixes "${cue}"`).toBeGreaterThan(0)
    }
  })

  it('keys every defensive drill to an id something can actually select', () => {
    // A drill keyed to a typo is a drill no menu will ever contain — it looks
    // like coverage and is dead weight.
    for (const drill of defensive) {
      for (const cue of drill.fixes) {
        expect(DEFENSIVE_IDS.has(cue), `${drill.id} fixes unknown id "${cue}"`).toBe(true)
      }
    }
  })

  it('offers a flag team defensive drills, and none of them involve contact', () => {
    const menu = drillMenuFor({
      cueIds: DEFENSIVE_IDS,
      gameType: 'flag',
      tier: 'youth_9_10' as LevelTier,
    })
    expect(menu.length).toBeGreaterThan(0)
    expect(menu.every((d) => d.contact === 'none')).toBe(true)
  })

  it('keeps bag work off a flag team and on a tackle team', () => {
    const bag = defensive.filter((d) => d.contact === 'bag').map((d) => d.id)
    expect(bag.length).toBeGreaterThan(0)

    const flagIds = drillMenuFor({
      cueIds: DEFENSIVE_IDS,
      gameType: 'flag',
      tier: 'youth_9_10' as LevelTier,
    }).map((d) => d.id)
    for (const id of bag) expect(flagIds).not.toContain(id)

    const tackleIds = drillMenuFor({
      cueIds: DEFENSIVE_IDS,
      gameType: 'tackle',
      tier: 'youth_9_10' as LevelTier,
    }).map((d) => d.id)
    expect(tackleIds).toEqual(expect.arrayContaining(bag))
  })

  it('never names a prohibited drill', () => {
    // football-brain rule: Oklahoma, Bull in the Ring and board collision
    // drills are off the menu at every level, forever.
    const banned = /oklahoma|bull in the ring|board drill/i
    for (const drill of DRILLS) {
      expect(banned.test(drill.name)).toBe(false)
      expect(banned.test(drill.cue)).toBe(false)
    }
  })
})
