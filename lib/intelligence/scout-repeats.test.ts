import { describe, it, expect } from 'vitest'
import { countRepeats, isNonFinding, countNonFindings, jaccard, contentWords } from './aggregate-batch'

/**
 * Every string in this file is copied from a REAL 113-clip opponent scouting
 * report that a coach rejected, correctly, as untrustworthy. It said:
 *
 *   "Only a handful of patterns appeared in more than one clip."
 *
 * over 113 clips of film, and its number one RECURRING FLAW TO ATTACK was
 * "Insufficient evidence from this single, short run play to identify a clear
 * weakness" — the model's own non-finding, promoted to the top of the list.
 *
 * Both failures have the same cause: clustering was purely lexical, so
 * templated boilerplate merged perfectly while real football observations —
 * worded freshly in every clip — never did.
 */

/** The four pairs from the report, each obviously one coaching point. */
const SAME_POINT: [string, string, string][] = [
  [
    'dropback_pass',
    'Highly susceptible to screen passes due to aggressive, undisciplined pass rush from the defensive ends',
    'Vulnerable to screen passes due to aggressive upfield rush from the defensive line and slow recognition from linebackers',
  ],
  [
    'dropback_pass',
    'Corners play soft off-coverage, giving up easy access throws on the perimeter',
    'Boundary corner plays with a large cushion and concedes the quick hitch',
  ],
  [
    'perimeter_run',
    'Team pursuit is poor; players take shallow angles to the ball on the perimeter, creating big-play opportunities',
    'Linebackers and secondary take poor pursuit angles in space',
  ],
  [
    'perimeter_run',
    'Defensive end lost contain on the perimeter',
    'Playside DE was reached and lost edge contain',
  ],
]

/** Category lookup of the kind rankAttackPoints builds from the clip rows. */
function keyed(pairs: [string, string, string][]) {
  const map = new Map<string, string>()
  for (const [cat, a, b] of pairs) {
    map.set(a, cat)
    map.set(b, cat)
  }
  return (text: string) => map.get(text.trim())
}

describe('the failure the report exposed', () => {
  it('splits every one of the four pairs without a category key', () => {
    // Reproduces the shipped behaviour, so the fix below is measured against
    // the real thing rather than a strawman.
    for (const [, a, b] of SAME_POINT) {
      expect(jaccard(contentWords(a), contentWords(b))).toBeLessThan(0.5)
      expect(countRepeats([[a], [b]])).toHaveLength(2)
    }
  })

  it('merges three of the four once the category gates the comparison', () => {
    const keyOf = keyed(SAME_POINT)
    const merged = SAME_POINT.filter(
      ([, a, b]) => countRepeats([[a], [b]], 8, { keyOf }).length === 1
    )
    expect(merged).toHaveLength(3)
  })

  it('does NOT reach the corners pair, and that is deliberate', () => {
    // The known limit of lexical matching, pinned so nobody "fixes" it by
    // lowering the threshold. These two share only "corner" and "play" —
    // 0.133 — while pairs that must never merge score 0.111. Nine thousandths
    // is a coincidence, not a rule. The real fix is a closed weakness
    // vocabulary, not a smaller number.
    const [, a, b] = SAME_POINT[1]
    expect(jaccard(contentWords(a), contentWords(b))).toBeCloseTo(0.133, 2)
    expect(countRepeats([[a], [b]], 8, { keyOf: keyed(SAME_POINT) })).toHaveLength(2)
  })

  it('keeps a real margin over points that must stay apart', () => {
    for (const [a, b] of [
      ['Corners play soft off-coverage on the perimeter', 'Defensive end lost contain on the perimeter'],
      ['Linebackers over-pursue the initial action', 'Safety is slow to rotate over the top'],
    ]) {
      const keyOf = () => 'perimeter_run'
      expect(countRepeats([[a], [b]], 8, { keyOf })).toHaveLength(2)
    }
  })

  it('counts one weakness across many clips instead of many one-offs', () => {
    const keyOf = keyed(SAME_POINT)
    const [, screensA, screensB] = SAME_POINT[0]
    // Six clips, one real weakness, worded two different ways throughout.
    const lists = [[screensA], [screensB], [screensA], [screensB], [screensA], [screensB]]
    const out = countRepeats(lists, 8, { keyOf })
    expect(out).toHaveLength(1)
    // Was six separate 1-clip fragments. This is the whole bug in one number.
    expect(out[0].clips).toBe(6)
  })
})

describe('the category lowers the bar, and never raises it', () => {
  // The category is itself a model judgment, and a noisier one than the text.
  // Gating strictly on it split a cluster where three clips described one soft
  // edge and one filed it under a different heading — caught by the existing
  // scoutiq-aggregate suite. So a differing key leaves the ordinary threshold
  // in place rather than blocking the merge.
  it('still merges across differing categories when the wording is close', () => {
    const a = 'Soft edge'
    const b = 'Soft edge to the field'
    const keyOf = (t: string) => (t === a ? 'situational' : 'perimeter_run')
    expect(countRepeats([[a], [b]], 8, { keyOf })).toHaveLength(1)
  })

  it('never produces more clusters than the unkeyed behaviour would', () => {
    const keyOf = keyed(SAME_POINT)
    const lists = SAME_POINT.flatMap(([, a, b]) => [[a], [b]])
    expect(countRepeats(lists, 40, { keyOf }).length).toBeLessThanOrEqual(
      countRepeats(lists, 40).length
    )
  })

  it('still refuses genuinely unrelated points inside one category', () => {
    const keyOf = () => 'perimeter_run'
    const out = countRepeats(
      [['Defensive end lost contain on the perimeter'], ['Punt returner fields the ball inside the ten']],
      8,
      { keyOf }
    )
    expect(out).toHaveLength(2)
  })

  it('leaves uncategorised points on the old threshold', () => {
    // Rows saved before categories existed must rank exactly as they do today.
    const [, a, b] = SAME_POINT[0]
    expect(countRepeats([[a], [b]], 8, { keyOf: () => undefined })).toHaveLength(2)
  })
})

describe('a non-finding is a denominator, never a tendency', () => {
  const REAL_NON_FINDINGS = [
    'Insufficient evidence from this single, short run play to identify a clear weakness',
    'Insufficient evidence from a single short run play to identify a clear weakness',
    'No clear weakness was visible on this clip',
    'Could not determine the coverage from this angle',
    'Unable to identify a specific mismatch',
    'Their base power/zone runs were clean but unremarkable',
    'Nothing notable on this snap',
  ]

  it.each(REAL_NON_FINDINGS)('recognises %s', (text) => {
    expect(isNonFinding(text)).toBe(true)
  })

  it.each([
    'Defensive end lost contain on the perimeter',
    'Corners play soft off-coverage, giving up easy access throws',
    'Linebackers over-pursue the initial action, making them vulnerable to cutbacks',
    'Safety is slow to rotate over the top',
  ])('does not mistake the real finding %s for one', (text) => {
    expect(isNonFinding(text)).toBe(false)
  })

  it('keeps the report\'s top "recurring flaw" out of the ranking entirely', () => {
    // It appeared in 3 clips and outranked everything a coach could use.
    const boilerplate = 'Insufficient evidence from this single, short run play to identify a clear weakness'
    const real = 'Defensive end lost contain on the perimeter'
    const out = countRepeats([[boilerplate], [boilerplate], [boilerplate], [real]])
    expect(out.map((o) => o.text)).toEqual([real])
  })

  it('counts the clips that could not be read, so the coach sees the denominator', () => {
    const lists = [
      ['Insufficient evidence from this single, short run play to identify a clear weakness'],
      ['Nothing notable on this snap'],
      ['Defensive end lost contain on the perimeter'],
      // Mixed: one real finding is enough for the clip to have been read.
      ['No clear weakness was visible on this clip', 'Corners play soft off-coverage'],
    ]
    expect(countNonFindings(lists)).toBe(2)
  })

  it('does not count an empty clip as unreadable', () => {
    // Nothing reported at all is a different fact from "I looked and could not tell".
    expect(countNonFindings([[], ['']])).toBe(0)
  })
})
