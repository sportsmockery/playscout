import { tally, splitBy, mean, type Frequency, type Split } from './aggregate-defense'
import {
  RUN_PLAY_TYPES,
  PASS_PLAY_TYPES,
  OFFENSIVE_PLAY_TYPE_LABELS,
  type OffensiveSnap,
  type OffensiveFormationRead,
  type QbAlignment,
  type OffensiveMotion,
  type OffensivePlayType,
  type PlayDirection,
} from './offense-structure'
import { EXPLOSIVE_PLAY_YARDS } from './taxonomy'
import type { OffensivePosition } from './positions'

/**
 * Turns charted offensive snaps into what a defensive coordinator plans
 * against. Same rule as aggregate-defense.ts: every number is computed from
 * the snaps, and every rate carries the denominator it was computed over —
 * the snaps where that question was answerable, never all snaps.
 */
export interface OffensiveProfile {
  /** Snaps where the opponent had the ball and something was charted. */
  snaps: number
  formations: { readable: number; distribution: Frequency<OffensiveFormationRead>[] }
  qbAlignment: { readable: number; distribution: Frequency<QbAlignment>[] }
  motion: { readable: number; distribution: Frequency<OffensiveMotion>[] }
  playTypes: { readable: number; distribution: Frequency<OffensivePlayType>[] }
  /** Run vs pass over the snaps whose play type was readable (trick plays excluded). */
  runPass: { readable: number; runs: number; passes: number }
  /** Direction on RUNS only, over the runs whose direction was readable. */
  runDirection: { readable: number; distribution: Frequency<PlayDirection>[] }
  /** Who gets the ball — carries plus targets — over the snaps where it was readable. */
  ballCarriers: { readable: number; distribution: Frequency<OffensivePosition>[] }
  /** Play type by formation: "out of double wing they run power". */
  playTypeByFormation: Split<OffensivePlayType>[]
  /** Run direction by hash: "to the wide side off the hash". */
  runDirectionByHash: Split<PlayDirection>[]
  /** Play type when they motion, by motion kind: the motion tell. */
  playTypeByMotion: Split<OffensivePlayType>[]
  /** Average gain over the snaps where it was measured. */
  gain: { mean: number; measured: number } | null
  /** Plays of EXPLOSIVE_PLAY_YARDS+ (or a touchdown), by play type. */
  explosive: { count: number; byPlayType: Frequency<OffensivePlayType>[] }
  turnovers: number
}

const FORMATION_LABEL = (f: string) => f.replace(/_/g, ' ')
const HASH_LABEL: Record<string, string> = {
  left_hash: 'Ball on the left hash',
  middle: 'Ball in the middle',
  right_hash: 'Ball on the right hash',
}

const isRun = (s: OffensiveSnap) => !!s.play_type && RUN_PLAY_TYPES.includes(s.play_type)
const isPass = (s: OffensiveSnap) => !!s.play_type && PASS_PLAY_TYPES.includes(s.play_type)

export function aggregateOffensiveSnaps(snaps: OffensiveSnap[]): OffensiveProfile {
  const runs = snaps.filter(isRun)
  const passes = snaps.filter(isPass)
  const explosiveSnaps = snaps.filter(
    (s) => s.result === 'touchdown' || (typeof s.gain_yards === 'number' && s.gain_yards >= EXPLOSIVE_PLAY_YARDS)
  )

  return {
    snaps: snaps.length,
    formations: tally(snaps.map((s) => s.formation), ['not_visible']),
    qbAlignment: tally(snaps.map((s) => s.qb_alignment), ['not_visible']),
    motion: tally(snaps.map((s) => s.motion), ['not_visible']),
    playTypes: tally(snaps.map((s) => s.play_type), ['unclear']),
    runPass: { readable: runs.length + passes.length, runs: runs.length, passes: passes.length },
    runDirection: tally(runs.map((s) => s.direction), ['not_visible']),
    ballCarriers: tally(snaps.map((s) => s.ball_carrier), []),
    playTypeByFormation: splitBy<OffensivePlayType, OffensiveSnap>(
      snaps,
      (s) => (s.formation && s.formation !== 'not_visible' ? `Out of ${FORMATION_LABEL(s.formation)}` : null),
      (s) => s.play_type,
      ['unclear']
    ),
    runDirectionByHash: splitBy<PlayDirection, OffensiveSnap>(
      runs,
      (s) => (s.ball_position && HASH_LABEL[s.ball_position]) || null,
      (s) => s.direction,
      ['not_visible']
    ),
    playTypeByMotion: splitBy<OffensivePlayType, OffensiveSnap>(
      snaps,
      (s) =>
        s.motion && s.motion !== 'none' && s.motion !== 'not_visible'
          ? `With ${s.motion.replace(/_/g, ' ')} motion`
          : null,
      (s) => s.play_type,
      ['unclear']
    ),
    gain: mean(snaps.map((s) => s.gain_yards)),
    explosive: {
      count: explosiveSnaps.length,
      byPlayType: tally(explosiveSnaps.map((s) => s.play_type), ['unclear']).distribution,
    },
    turnovers: snaps.filter((s) => s.result === 'interception' || s.result === 'fumble_lost').length,
  }
}

function pct(rate: number): string {
  return `${Math.round(rate * 100)}%`
}

/** The profile as the game-plan model sees it — every figure with its denominator. */
export function renderOffensiveProfile(profile: OffensiveProfile): string {
  const lines: string[] = [`OFFENSIVE SNAPS CHARTED: ${profile.snaps}`]
  if (!profile.snaps) return lines.join('\n')

  const dist = <T extends string>(
    label: string,
    block: { readable: number; distribution: Frequency<T>[] },
    show: (v: T) => string = (v) => v
  ) => {
    if (!block.readable) {
      lines.push(`${label}: never readable on this film (0 of ${profile.snaps} snaps).`)
      return
    }
    lines.push(`${label} — readable on ${block.readable} of ${profile.snaps} snaps:`)
    for (const d of block.distribution) {
      lines.push(`  ${show(d.value)}: ${d.count} of ${block.readable} — ${pct(d.rate)}`)
    }
  }

  dist('FORMATION', profile.formations)
  dist('QB ALIGNMENT', profile.qbAlignment)
  dist('MOTION', profile.motion)
  dist('PLAY TYPE', profile.playTypes, (v) => OFFENSIVE_PLAY_TYPE_LABELS[v] ?? v)
  if (profile.runPass.readable) {
    lines.push(
      `RUN / PASS: ${profile.runPass.runs} runs and ${profile.runPass.passes} passes of ${profile.runPass.readable} readable snaps (${pct(profile.runPass.runs / profile.runPass.readable)} run)`
    )
  }
  dist('RUN DIRECTION (their left/right)', profile.runDirection)
  dist('WHO GETS THE BALL', profile.ballCarriers)

  for (const [label, splits] of [
    ['PLAY TYPE BY FORMATION', profile.playTypeByFormation],
    ['RUN DIRECTION BY HASH', profile.runDirectionByHash],
    ['PLAY TYPE BY MOTION', profile.playTypeByMotion],
  ] as const) {
    if (!splits.length) continue
    lines.push(`${label}:`)
    for (const s of splits) {
      const top = s.top ? `${s.top.value} ${s.top.count}/${s.snaps} (${pct(s.top.rate)})` : 'nothing readable'
      lines.push(`  ${s.key} — ${s.snaps} snaps — most often ${top}`)
    }
  }

  if (profile.gain) {
    lines.push(`AVERAGE GAIN: ${profile.gain.mean} yards over ${profile.gain.measured} measured snaps`)
  }
  lines.push(
    `EXPLOSIVE PLAYS (${EXPLOSIVE_PLAY_YARDS}+ yards or a touchdown): ${profile.explosive.count}${
      profile.explosive.byPlayType.length
        ? ` — ${profile.explosive.byPlayType.map((d) => `${d.value} ${d.count}`).join(', ')}`
        : ''
    }`
  )
  lines.push(`TURNOVERS: ${profile.turnovers}`)
  return lines.join('\n')
}
