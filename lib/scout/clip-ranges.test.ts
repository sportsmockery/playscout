import { describe, it, expect } from 'vitest'
import { parseClipRanges } from './clip-ranges'

describe('parseClipRanges', () => {
  it('reads runs and single clips in any separator', () => {
    expect(parseClipRanges('34-36, 41 43–44')).toEqual([34, 35, 36, 41, 43, 44])
    expect(parseClipRanges('#7; 5-#6')).toEqual([5, 6, 7])
    expect(parseClipRanges('39-37')).toEqual([37, 38, 39])
  })

  it('refuses a typo rather than applying part of it', () => {
    expect(parseClipRanges('34-39, forty')).toBeNull()
    expect(parseClipRanges('')).toBeNull()
  })
})
