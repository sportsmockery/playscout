import { describe, it, expect } from 'vitest'
import { applyDrillSafetyFilter, scrubProhibitedDrillMentions, guardChatOutput } from './safety'

describe('applyDrillSafetyFilter — prohibited drills', () => {
  it('replaces the Oklahoma drill regardless of game type', () => {
    const { drills, filtered } = applyDrillSafetyFilter(['Oklahoma drill', 'Cone footwork ladder'], 'tackle')
    expect(drills[0]).not.toMatch(/oklahoma/i)
    expect(drills[1]).toBe('Cone footwork ladder')
    expect(filtered).toHaveLength(1)
    expect(filtered[0].reason).toBe('prohibited_drill')
  })

  it('replaces Bull in the Ring under any phrasing', () => {
    const { drills } = applyDrillSafetyFilter(['Bull in the ring circle drill'], 'tackle')
    expect(drills[0]).not.toMatch(/bull.*ring/i)
  })

  it('replaces the nutcracker drill', () => {
    const { drills } = applyDrillSafetyFilter(['Nutcracker drill between two dummies'], 'tackle')
    expect(drills[0]).not.toMatch(/nutcracker/i)
  })

  it('replaces board collision drills', () => {
    const { drills } = applyDrillSafetyFilter(['Board drill for pad level'], 'tackle')
    expect(drills[0]).not.toMatch(/board/i)
  })

  it('leaves safe drills untouched even at tackle level', () => {
    const { drills, filtered } = applyDrillSafetyFilter(['Mirror dodge footwork', 'Bag tackling reps'], 'tackle')
    expect(drills).toEqual(['Mirror dodge footwork', 'Bag tackling reps'])
    expect(filtered).toHaveLength(0)
  })
})

describe('applyDrillSafetyFilter — flag/tackle contact gate', () => {
  it('blocks live/full-contact drills when game type is flag', () => {
    const { drills, filtered } = applyDrillSafetyFilter(['Live tackling circuit', '1-on-1 full contact blocking'], 'flag')
    expect(drills[0]).not.toMatch(/live\s*tackl/i)
    expect(drills[1]).not.toMatch(/full[\s-]?contact/i)
    expect(filtered).toHaveLength(2)
    expect(filtered.every((f) => f.reason === 'contact_at_non_tackle_level')).toBe(true)
  })

  it('blocks contact drills when game type is unspecified (safest default)', () => {
    const { drills } = applyDrillSafetyFilter(['Full contact pursuit drill'], undefined)
    expect(drills[0]).not.toMatch(/full[\s-]?contact/i)
  })

  it('blocks contact drills for rookie_tackle', () => {
    const { filtered } = applyDrillSafetyFilter(['Thud tempo inside run'], 'rookie_tackle')
    expect(filtered).toHaveLength(1)
  })

  it('allows contact drills when game type is tackle', () => {
    const { drills, filtered } = applyDrillSafetyFilter(['Live tackling circuit'], 'tackle')
    expect(drills[0]).toBe('Live tackling circuit')
    expect(filtered).toHaveLength(0)
  })

  it('does not double-flag a drill already caught by the prohibited-drill filter', () => {
    const { filtered } = applyDrillSafetyFilter(['Oklahoma drill'], 'flag')
    expect(filtered).toHaveLength(1)
  })
})

describe('scrubProhibitedDrillMentions', () => {
  it('replaces a prohibited drill mentioned in freeform correction text', () => {
    const result = scrubProhibitedDrillMentions('Have them run the Oklahoma drill twice a week.')
    expect(result).not.toMatch(/oklahoma/i)
  })

  it('leaves safe text unchanged', () => {
    const text = 'Work on footwork with cone drills.'
    expect(scrubProhibitedDrillMentions(text)).toBe(text)
  })
})

describe('guardChatOutput', () => {
  it('redacts an OpenAI/Anthropic-style key', () => {
    const result = guardChatOutput('Here is the key: sk-abcdefghijklmnopqrstuvwxyz123456')
    expect(result.safe).toBe(false)
    expect(result.text).not.toContain('sk-abcdefghijklmnopqrstuvwxyz123456')
    expect(result.text).toContain('[redacted]')
  })

  it('refuses outright when the system prompt appears to have leaked', () => {
    const result = guardChatOutput('You are PlayScout Football Intelligence and here are my rules...')
    expect(result.safe).toBe(false)
    expect(result.text).not.toContain('You are PlayScout Football Intelligence')
  })

  it('passes clean coaching text through unchanged', () => {
    const text = 'Your offense ran outside zone on 60% of first-down plays.'
    const result = guardChatOutput(text)
    expect(result.safe).toBe(true)
    expect(result.text).toBe(text)
  })
})
