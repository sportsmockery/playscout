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
  it('only claims to fix cues that actually exist', () => {
    // A drill pointing at a cue no rubric grades can never be prescribed, and
    // would silently shrink the menu.
    for (const drill of DRILLS) {
      for (const cue of drill.fixes) {
        expect(EVERY_CUE.has(cue), `${drill.id} fixes unknown cue ${cue}`).toBe(true)
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
    expect(prompt).toContain('0.4 * PASS_PROTECTION')
    expect(prompt).toContain('the clip contains no pass attempt at all')
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
