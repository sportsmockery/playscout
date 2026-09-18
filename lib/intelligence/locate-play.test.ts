import { describe, it, expect } from 'vitest'
import { playWindow, parseLocatedPlays } from './locate-play'

describe('narrowing the film to the football', () => {
  it('cuts the dead time off the real clip that broke this', () => {
    // MVI_0072: 31.68s, snap at ~6.5s, touchdown at ~22s. The rest is a team
    // lining up and then celebrating — and reading it was why consecutive runs
    // reported different formations for the same snap.
    const window = playWindow([{ snap_seconds: 6.5, end_seconds: 22, confidence: 0.8 }], 31.68)
    expect(window).toEqual({ startOffsetSeconds: 4.5, endOffsetSeconds: 28 })
    // A quarter of the frames were never football, and the tail is generous on
    // purpose — see POST_PLAY_MARGIN.
    expect(28 - 4.5).toBeLessThan(31.68 * 0.85)
  })

  it('keeps a long tail, because a cut tail loses the end of the play', () => {
    // Measured: the locator called this same play's end at 16.8s twice and 21s
    // once. A 2-second tail cut the touchdown off two runs out of three, which
    // cost the yardage and, on one of them, the ball carrier too.
    const short = playWindow([{ snap_seconds: 7.2, end_seconds: 16.8, confidence: 1 }], 31.68)
    const long = playWindow([{ snap_seconds: 7.2, end_seconds: 21, confidence: 1 }], 31.68)
    // Both windows now reach past where the play actually ended (~22s).
    expect(short!.endOffsetSeconds).toBeGreaterThanOrEqual(22)
    expect(long!.endOffsetSeconds).toBeGreaterThanOrEqual(22)
  })

  it('spans every play when the clip holds more than one', () => {
    const window = playWindow(
      [
        { snap_seconds: 5, end_seconds: 12, confidence: 0.8 },
        { snap_seconds: 40, end_seconds: 48, confidence: 0.8 },
      ],
      60
    )
    expect(window).toEqual({ startOffsetSeconds: 3, endOffsetSeconds: 54 })
  })

  it('keeps a pre-snap look rather than starting at the snap', () => {
    // The formation is read before the ball moves, so cutting to the snap
    // would cost the thing step 1 of the charting prompt asks for.
    const window = playWindow([{ snap_seconds: 10, end_seconds: 18, confidence: 0.9 }], 40)
    expect(window!.startOffsetSeconds).toBe(8)
  })

  it('never runs past the end of the film', () => {
    const window = playWindow([{ snap_seconds: 5, end_seconds: 19.5, confidence: 0.8 }], 20)
    expect(window!.endOffsetSeconds).toBe(20)
  })
})

describe('when narrowing would be wrong, it does not narrow', () => {
  it('leaves a clip alone when the saving is not worth it', () => {
    // Trimming 2 seconds off a 30-second clip is not worth a second cache key.
    expect(playWindow([{ snap_seconds: 2, end_seconds: 28, confidence: 0.9 }], 30)).toBeNull()
  })

  it('refuses a "play" too short to be football', () => {
    // A fifth of a second is a shift or a false start, not a snap. Padding it
    // into a plausible window would point the charting pass at four seconds of
    // a minute-long clip and miss the real play entirely.
    expect(playWindow([{ snap_seconds: 10, end_seconds: 10.2, confidence: 0.9 }], 60)).toBeNull()
  })

  it('ignores a locator that found nothing', () => {
    expect(playWindow([], 30)).toBeNull()
  })

  it('ignores nonsense rather than charting the wrong ten seconds', () => {
    expect(playWindow([{ snap_seconds: 20, end_seconds: 5, confidence: 0.9 }], 30)).toBeNull()
    expect(playWindow([{ snap_seconds: -4, end_seconds: -1, confidence: 0.9 }], 30)).toBeNull()
    expect(playWindow([{ snap_seconds: 99, end_seconds: 120, confidence: 0.9 }], 30)).toBeNull()
  })

  it('stands aside for a slice the coach already tagged', () => {
    // A play sequence the staff marked is ground truth; a located window is a
    // model's opinion, and it does not get to overrule them.
    const window = playWindow([{ snap_seconds: 6, end_seconds: 20, confidence: 0.9 }], 31.68, {
      startOffsetSeconds: 2,
      endOffsetSeconds: 30,
    })
    expect(window).toBeNull()
  })

  it('does nothing without a known duration', () => {
    expect(playWindow([{ snap_seconds: 6, end_seconds: 20, confidence: 0.9 }], null)).toBeNull()
  })

  it('survives an unparseable locator response', () => {
    expect(parseLocatedPlays('nonsense')).toEqual([])
    expect(parseLocatedPlays('{"plays":[{"snap_seconds":1,"end_seconds":5,"confidence":1}]}')).toHaveLength(1)
  })
})
