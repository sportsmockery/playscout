import { describe, it, expect } from 'vitest'
import { resolveLevelTier, isHighSchoolOrAbove, isYouth, levelCalibration } from './levels'

describe('resolveLevelTier', () => {
  it('maps youth age bands', () => {
    expect(resolveLevelTier({ age_group: '6U' })).toBe('youth_early')
    expect(resolveLevelTier({ age_group: '8U' })).toBe('youth_early')
    expect(resolveLevelTier({ age_group: '10U' })).toBe('youth')
    expect(resolveLevelTier({ age_group: '12U' })).toBe('youth_older')
    expect(resolveLevelTier({ age_group: '14U' })).toBe('middle_school')
  })

  it('maps high-school signals from either age_group or level', () => {
    expect(resolveLevelTier({ age_group: 'Varsity' })).toBe('varsity')
    expect(resolveLevelTier({ age_group: 'JV' })).toBe('jv')
    expect(resolveLevelTier({ level: 'High School' })).toBe('varsity')
    expect(resolveLevelTier({ age_group: 'JV', level: 'High School' })).toBe('jv')
    expect(resolveLevelTier({ level: 'College' })).toBe('varsity')
    expect(resolveLevelTier({ age_group: 'Adult' })).toBe('varsity')
  })

  it('returns unknown when nothing usable is provided', () => {
    expect(resolveLevelTier({})).toBe('unknown')
    expect(resolveLevelTier(null)).toBe('unknown')
    expect(resolveLevelTier({ age_group: 'Recreation???' })).toBe('unknown')
  })

  it('classifies youth vs HS helpers correctly', () => {
    expect(isYouth('youth')).toBe(true)
    expect(isYouth('middle_school')).toBe(true)
    expect(isHighSchoolOrAbove('varsity')).toBe(true)
    expect(isHighSchoolOrAbove('jv')).toBe(true)
    expect(isHighSchoolOrAbove('youth')).toBe(false)
  })

  it('varsity calibration invites next-level standards; youth forbids them', () => {
    expect(levelCalibration('varsity')).toMatch(/college-bound|next-level|Elite/i)
    expect(levelCalibration('varsity')).not.toMatch(/never grade a youth player against varsity/i)
    expect(levelCalibration('youth')).toMatch(/Do NOT grade a youth player against varsity/i)
  })
})
