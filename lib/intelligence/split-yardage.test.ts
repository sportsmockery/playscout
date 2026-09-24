import { describe, it, expect } from 'vitest'
import {
  deriveSplitGain,
  buildFieldPositionPrompt,
  parseFieldPosition,
  type FieldPositionRead,
} from './split-yardage'

const read = (left: number | null, right: number | null, over: Partial<FieldPositionRead> = {}): FieldPositionRead => ({
  ball_visible: true,
  yards_to_left_goal_line: left,
  yards_to_right_goal_line: right,
  landmarks_used: 'counted from the painted 40',
  confidence: 0.9,
  ...over,
})

describe('the gain comes out of two reads that never met', () => {
  it('derives the real clip: 60 out, into the end zone, attacking left', () => {
    // The coach-confirmed 55-yard touchdown: ball on its own 40 (60 from the
    // left goal line), finishing in the end zone.
    const gain = deriveSplitGain(read(60, 40), read(0, 100))
    expect(gain.yards).toBe(60)
    expect(gain.attacking).toBe('left')
    expect(gain.reachedEndZone).toBe(true)
  })

  it('derives a gain attacking right just as well', () => {
    const gain = deriveSplitGain(read(40, 60), read(52, 48))
    expect(gain.yards).toBe(12)
    expect(gain.attacking).toBe('right')
    expect(gain.reachedEndZone).toBe(false)
  })

  it('marks the direction as assumed when nothing else supplied it', () => {
    expect(deriveSplitGain(read(60, 40), read(0, 100)).directionAssumed).toBe(true)
  })
})

describe('a play that LOST ground', () => {
  // Found by this test before the code ever saw film: deriving the attacking
  // goal line from which way the ball moved assumes the play gained, so a
  // 5-yard sack reads as a 5-yard gain toward the opposite end zone.
  it('reads a sack as a gain the wrong way when direction is only assumed', () => {
    const gain = deriveSplitGain(read(40, 60), read(45, 55))
    expect(gain.yards).toBe(5)
    expect(gain.attacking).toBe('right')
    expect(gain.directionAssumed).toBe(true)
  })

  it('gets the sign right once the caller supplies the direction', () => {
    // Attacking left, and the ball went from the 40 back to the 45.
    const gain = deriveSplitGain(read(40, 60), read(45, 55), { attacking: 'left' })
    expect(gain.yards).toBe(-5)
    expect(gain.attacking).toBe('left')
    expect(gain.directionAssumed).toBe(false)
  })

  it('still measures a real gain correctly when told the direction', () => {
    const gain = deriveSplitGain(read(60, 40), read(0, 100), { attacking: 'left' })
    expect(gain.yards).toBe(60)
    expect(gain.reachedEndZone).toBe(true)
    expect(gain.directionAssumed).toBe(false)
  })
})

describe('a read that disagrees with itself is thrown away, not averaged', () => {
  // Both distances count the same 100 yards of field. If they do not add up,
  // a stripe or a painted number was misread — and a misread number is wrong
  // by ten, which is most of a gain.
  it('refuses a snap read whose ends do not make a field', () => {
    const gain = deriveSplitGain(read(60, 60), read(0, 100))
    expect(gain.yards).toBeNull()
    expect(gain.failure).toBe('field_length_disagrees')
    expect(gain.reason).toContain('120-yard field')
  })

  it('refuses an end read whose ends do not make a field', () => {
    const gain = deriveSplitGain(read(60, 40), read(10, 40))
    expect(gain.yards).toBeNull()
    expect(gain.failure).toBe('field_length_disagrees')
  })

  it('allows one stripe of slack for a ball spotted between markings', () => {
    // 97 and 103 are both inside tolerance; 106 is not.
    expect(deriveSplitGain(read(58, 39), read(0, 100)).yards).toBe(58)
    expect(deriveSplitGain(read(62, 41), read(0, 100)).yards).toBe(62)
    expect(deriveSplitGain(read(62, 44), read(0, 100)).failure).toBe('field_length_disagrees')
  })
})

describe('what it refuses to guess', () => {
  it('returns nothing when the ball was not found at one end', () => {
    const gain = deriveSplitGain(read(60, 40), read(null, null, { ball_visible: false }))
    expect(gain.yards).toBeNull()
    expect(gain.failure).toBe('ball_not_visible')
  })

  it('returns nothing when a read left a goal line uncounted', () => {
    const gain = deriveSplitGain(read(60, null), read(0, 100))
    expect(gain.yards).toBeNull()
    expect(gain.failure).toBe('incomplete_read')
  })

  it('returns nothing when both distances moved the same way', () => {
    // Impossible on one field, so the two reads are not describing one play.
    // Only reachable INSIDE the field-length tolerance — an exact pair of
    // reads summing to 100 each has leftDelta === -rightDelta and can never
    // land here. 100 and 95 both pass the sum check and still move both
    // distances down, which is the gap this branch covers.
    const gain = deriveSplitGain(read(60, 40), read(58, 37))
    expect(gain.yards).toBeNull()
    expect(gain.failure).toBe('no_direction')
  })

  it('returns nothing rather than zero when the ball did not move', () => {
    const gain = deriveSplitGain(read(60, 40), read(60, 40))
    expect(gain.yards).toBeNull()
    expect(gain.failure).toBe('no_direction')
  })

  it('survives a missing read entirely', () => {
    expect(deriveSplitGain(null, read(0, 100)).yards).toBeNull()
    expect(deriveSplitGain(read(60, 40), undefined).yards).toBeNull()
  })
})

describe('the prompt never lets on that a gain is being computed', () => {
  // That silence IS the mechanism. The idea this replaces failed because one
  // call knew the gain and reverse-engineered two positions to produce it;
  // back-filling needs a target, so the prompt must not supply one.
  for (const moment of ['snap', 'end'] as const) {
    const prompt = buildFieldPositionPrompt(moment)

    it(`${moment}: says nothing about gains, yardage gained, or a second read`, () => {
      expect(prompt).not.toMatch(/\bgain(ed|s)?\b/i)
      expect(prompt).not.toMatch(/how far/i)
      expect(prompt).not.toMatch(/other read|second read|first read|subtract/i)
    })

    it(`${moment}: gives the measuring instrument and the self-check`, () => {
      expect(prompt).toContain('every 5 yards')
      expect(prompt).toContain('add up to about 100')
      expect(prompt).toContain('not a stripe you may')
    })

    it(`${moment}: defines left and right as the picture's, not a team's`, () => {
      expect(prompt).toContain('left and right of the picture')
    })
  }

  it('asks each moment for its own moment only', () => {
    expect(buildFieldPositionPrompt('snap')).toContain('SNAP')
    expect(buildFieldPositionPrompt('end')).toContain('END of a football play')
  })
})

describe('parsing', () => {
  it('reads a well-formed answer', () => {
    const r = parseFieldPosition(
      '{"ball_visible":true,"yards_to_left_goal_line":60,"yards_to_right_goal_line":40,"landmarks_used":"the 40","confidence":0.8}'
    )
    expect(r?.yards_to_left_goal_line).toBe(60)
    expect(r?.confidence).toBe(0.8)
  })

  it('turns a non-numeric distance into null rather than NaN', () => {
    const r = parseFieldPosition(
      '{"ball_visible":true,"yards_to_left_goal_line":"about 60","yards_to_right_goal_line":null,"landmarks_used":"","confidence":0.5}'
    )
    expect(r?.yards_to_left_goal_line).toBeNull()
    expect(r?.yards_to_right_goal_line).toBeNull()
  })

  it('returns null on junk instead of throwing', () => {
    expect(parseFieldPosition('not json')).toBeNull()
  })
})
