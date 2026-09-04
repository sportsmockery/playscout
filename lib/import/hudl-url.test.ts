import { describe, it, expect } from 'vitest'
import { parseHudlUrl, hudlTargetKey } from './hudl-url'

// The real link this feature was built for.
const ANALYZE_URL =
  'https://app.hudl.com/watch/team/95968/analyze?v=97226551&team=95968&cx=tm&l=liir0-vdpm0-nvgb0'

describe('parseHudlUrl', () => {
  it('reads the ids out of an analyze link', () => {
    const result = parseHudlUrl(ANALYZE_URL)
    expect(result.ok).toBe(true)
    if (!result.ok) return

    expect(result.target).toEqual({
      kind: 'playlist',
      teamId: '95968',
      videoId: '97226551',
      playlistId: 'liir0-vdpm0-nvgb0',
    })
  })

  it('reads an analyze link with no playlist parameter', () => {
    const result = parseHudlUrl('https://app.hudl.com/watch/team/95968/analyze?v=97226551')
    expect(result.ok).toBe(true)
    if (result.ok) expect(result.target).toMatchObject({ kind: 'playlist', playlistId: undefined })
  })

  it('refuses a Hudl link shape nobody has actually seen', () => {
    // Only the analyze shape is confirmed against a real session. Guessing at
    // /video/ ids would mis-parse and fail deep in the worker rather than here.
    const result = parseHudlUrl('https://www.hudl.com/video/3/95968/97226551')
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.reason).toContain('/watch/team/')
  })

  it('drops tracking parameters so one playlist is one job', () => {
    // `cx` changes with where the coach clicked from. Without this, pasting the
    // same playlist twice pulls fifty clips twice.
    const a = parseHudlUrl(ANALYZE_URL)
    const b = parseHudlUrl(
      'https://app.hudl.com/watch/team/95968/analyze?l=liir0-vdpm0-nvgb0&v=97226551&team=95968&cx=search&utm_source=email'
    )
    expect(a.ok && b.ok).toBe(true)
    if (!a.ok || !b.ok) return
    expect(a.canonicalUrl).toBe(b.canonicalUrl)
    expect(a.canonicalUrl).not.toContain('cx=')
  })

  it('gives the same key for the same playlist', () => {
    const a = parseHudlUrl(ANALYZE_URL)
    const b = parseHudlUrl(ANALYZE_URL.replace('&cx=tm', ''))
    expect(a.ok && b.ok).toBe(true)
    if (!a.ok || !b.ok) return
    expect(hudlTargetKey(a.target)).toBe(hudlTargetKey(b.target))
  })

  describe('rejections a coach can act on', () => {
    it('names the problem when the link is not Hudl', () => {
      const result = parseHudlUrl('https://example.com/watch/team/1/analyze?v=2')
      expect(result.ok).toBe(false)
      if (!result.ok) expect(result.reason).toContain('not a Hudl link')
    })

    it('says what to do when the link points at a team rather than film', () => {
      // The failure mode this prevents: a job that starts, runs, and fails
      // twenty minutes later with nothing useful to say.
      const result = parseHudlUrl('https://app.hudl.com/watch/team/95968/analyze')
      expect(result.ok).toBe(false)
      if (!result.ok) expect(result.reason).toContain('points at a team, not at film')
    })

    it('refuses a URL carrying credentials', () => {
      const result = parseHudlUrl('https://user:pass@app.hudl.com/watch/team/1/analyze?v=2')
      expect(result.ok).toBe(false)
      if (!result.ok) expect(result.reason).toContain('credentials')
    })

    it('refuses a Hudl page it does not understand rather than half-parsing it', () => {
      const result = parseHudlUrl('https://app.hudl.com/home')
      expect(result.ok).toBe(false)
      if (!result.ok) expect(result.reason).toContain('/watch/team/')
    })

    it('refuses something that is not a URL at all', () => {
      expect(parseHudlUrl('paste your link here').ok).toBe(false)
      expect(parseHudlUrl('').ok).toBe(false)
    })

    it('refuses a non-http scheme', () => {
      expect(parseHudlUrl('file:///etc/passwd').ok).toBe(false)
      expect(parseHudlUrl('javascript:alert(1)').ok).toBe(false)
    })
  })

  it('accepts hudl subdomains and tolerates surrounding whitespace', () => {
    expect(parseHudlUrl(`  ${ANALYZE_URL}  `).ok).toBe(true)
    expect(parseHudlUrl('https://fan.hudl.com/watch/team/1/analyze?v=2').ok).toBe(true)
  })
})
