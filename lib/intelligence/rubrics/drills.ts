import type { Drill, ContactLevel } from './types'
import type { GameType } from '../football-brain'
import { isYouth, type LevelTier } from '../levels'

/**
 * The drill catalog.
 *
 * Until now the only drill knowledge in the system was NEGATIVE — the
 * prohibited list in safety.ts and football-brain (Oklahoma, Bull in the Ring,
 * board collision). Every drill a coach read was free-form invention, which is
 * where "work on his footwork" comes from. These are the libraries from
 * IQ_ANALYSIS_KNOWLEDGE_BASE §4.1/§4.2/§4.6 and FOOTBALL_KNOWLEDGE_BASE's
 * per-position sections, keyed to the cues they actually fix.
 *
 * `contact` is what makes the catalog safe to hand a model wholesale: the menu
 * is filtered before the prompt is built, so a flag team is never shown a
 * live-contact drill in the first place. safety.ts still runs on the output as
 * a backstop.
 */

export const DRILLS: Drill[] = [
  // ── Quarterback ────────────────────────────────────────────────────────
  {
    id: 'qb_center_exchange',
    name: 'QB–C exchange circuit',
    fixes: ['snap_exchange'],
    cue: 'Soft hands, eyes up — take the ball, don\'t catch it',
    contact: 'none',
  },
  {
    id: 'net_target_throws',
    name: 'Net/target accuracy throws',
    fixes: ['release_point', 'follow_through', 'throwing_posture'],
    cue: 'Finish across the body, thumb down',
    contact: 'none',
  },
  {
    id: 'three_step_to_hitch',
    name: 'Three-step-to-hitch timing',
    fixes: ['drop_or_boot_depth', 'weight_transfer'],
    cue: 'Get to depth, then throw on the hitch — not before',
    contact: 'none',
  },
  {
    id: 'boot_rollout_throws',
    name: 'Boot/rollout throws on the move',
    fixes: ['drop_or_boot_depth', 'escape_with_security', 'throwing_posture'],
    cue: 'Shoulders around, throw with your feet under you',
    contact: 'none',
  },
  {
    id: 'line_to_target_step',
    name: 'Line-to-target step drill',
    fixes: ['stride_length', 'base_width', 'hip_shoulder_separation'],
    cue: 'Front foot points at the target — step down the line',
    contact: 'none',
  },
  {
    id: 'eyes_off_progression',
    name: '"Eyes-off" progression walk-through',
    fixes: ['eye_discipline', 'progression_evidence', 'checkdown_awareness', 'pre_snap_recognition'],
    cue: 'Look him off, then come back to it',
    contact: 'none',
  },
  {
    id: 'pocket_climb_ladder',
    name: 'Pocket climb ladder (spot drill)',
    fixes: ['climb_vs_bail', 'pressure_response', 'forced_throw_avoidance'],
    cue: 'Step up into the clean air — never drift backwards',
    contact: 'none',
  },
  {
    id: 'mesh_ride_and_clamp',
    name: 'Mesh ride-and-clamp reps',
    fixes: ['mesh_point', 'carry_out_fake', 'ball_security_in_action'],
    cue: 'Eyes through the mesh, ride the back, sell the empty hand',
    contact: 'none',
  },

  // ── Offensive line ─────────────────────────────────────────────────────
  {
    id: 'stance_and_start_mirror',
    name: 'Stance-and-start mirror',
    fixes: ['first_step_explosion', 'base_width_and_balance', 'set_type_and_depth'],
    cue: 'Weight off the hands — first step short and hard',
    contact: 'none',
  },
  {
    id: 'fit_and_freeze_bags',
    name: 'Fit-and-freeze on bags',
    fixes: ['hand_fit', 'hand_timing_and_placement', 'pad_level_and_leverage'],
    cue: 'Hands inside, thumbs up, pads under his',
    contact: 'bag',
  },
  {
    id: 'sled_shield_drive',
    name: 'Sled/shield drive',
    fixes: ['hip_roll_and_leg_drive', 'finish', 'pad_level_and_leverage'],
    cue: 'Roll the hips, keep the feet alive to the whistle',
    contact: 'bag',
  },
  {
    id: 'short_set_pass_pro',
    name: 'Short-set pass protection',
    fixes: ['first_kick_quickness', 'anchor_vs_bull_rush', 'pass_set_posture'],
    cue: 'Kick, don\'t reach — sink the hips and anchor',
    contact: 'none',
  },
  {
    id: 'mirror_redirect_wave',
    name: 'Mirror/redirect wave drill',
    fixes: ['mirror_and_redirect', 'staying_square', 'recovery_after_contact', 'recovery_and_refit'],
    cue: 'Stay square, slide — don\'t lunge at him',
    contact: 'none',
  },
  {
    id: 'pull_skip_pathway',
    name: 'Pull/skip pathway',
    fixes: ['aiming_point', 'avoid_crossing_feet', 'combo_and_climb_to_linebacker'],
    cue: 'Open, skip-pull, get your eyes to the landmark',
    contact: 'none',
  },
  {
    id: 'board_line_footwork',
    name: 'Board/line footwork (technique only, no collision)',
    fixes: ['avoid_crossing_feet', 'base_width_and_balance', 'knee_bend'],
    cue: 'Feet outside the board — never cross over',
    contact: 'none',
  },

  // ── Running back ───────────────────────────────────────────────────────
  {
    id: 'mesh_ladder',
    name: 'Mesh ladder',
    fixes: ['path_and_landmark', 'reads_the_block'],
    cue: 'Pocket open, ride it, clamp it, cover it',
    contact: 'none',
  },
  {
    id: 'cone_off_tackle_entries',
    name: 'Cone off-tackle entries',
    fixes: ['path_and_landmark', 'one_cut_decisiveness', 'correct_gap'],
    cue: 'Hit the landmark, one cut, get north',
    contact: 'none',
  },
  {
    id: 'two_ball_security_carries',
    name: 'Two-ball security carries',
    fixes: ['high_and_tight', 'correct_arm', 'no_exposure_on_cuts'],
    cue: 'High and tight, away from the defender',
    contact: 'none',
  },
  {
    id: 'traffic_gauntlet',
    name: 'Traffic gauntlet (cover-up, no collisions at young ages)',
    fixes: ['two_hands_in_traffic', 'protects_through_contact'],
    cue: 'Two hands on it before you get to the pile',
    contact: 'bag',
  },
  {
    id: 'press_and_cut_read',
    name: 'Press-and-cut read drill',
    fixes: ['press_then_cut', 'patience_vs_bouncing', 'decisiveness_in_the_lane', 'finds_the_cutback'],
    cue: 'Press it to hold him, then cut — don\'t bounce it',
    contact: 'none',
  },
  {
    id: 'finish_through_the_bag',
    name: 'Finish-through-the-bag',
    fixes: ['pad_level_through_contact', 'runs_behind_pads', 'finishes_north_south', 'balance_after_contact'],
    cue: 'Run behind your pads and fall forward',
    contact: 'bag',
  },
  {
    id: 'lead_block_track',
    name: 'Lead-block tracking (walk-through)',
    fixes: ['follows_lead_blocker', 'reads_the_block'],
    cue: 'Run off his hip — let him clear it for you',
    contact: 'none',
  },
]

const BY_ID = new Map(DRILLS.map((d) => [d.id, d]))

export function drillById(id: string): Drill | undefined {
  return BY_ID.get(id)
}

/**
 * The contact a team is allowed to run. Flag football has no legal contact at
 * all; rookie tackle and any unstated game type get bag work at most. This is
 * why the catalog is filtered before the prompt rather than after the model
 * answers — a menu that never lists a live drill cannot have one picked from it.
 */
export function allowedContact(gameType: GameType | string | null | undefined, tier: LevelTier): ContactLevel[] {
  if (gameType === 'tackle') {
    // Live collision drills stay off the youth menu regardless (football-brain
    // rule 13); the catalog carries none today, but the gate is the rule.
    return isYouth(tier) ? ['none', 'bag'] : ['none', 'bag', 'live']
  }
  if (gameType === 'flag') return ['none']
  // rookie_tackle, or unstated — default to the safest reading.
  return ['none', 'bag']
}

/** The drills this team may be shown, restricted to those fixing cues in this module. */
export function drillMenuFor(opts: {
  cueIds: Set<string>
  gameType?: GameType | string | null
  tier: LevelTier
}): Drill[] {
  const allowed = new Set(allowedContact(opts.gameType, opts.tier))
  return DRILLS.filter(
    (d) => allowed.has(d.contact) && d.fixes.some((cue) => opts.cueIds.has(cue))
  )
}

export interface DrillPrescription {
  drill_id: string
  fixes_cue: string
  why_this_rep: string
  /** Filled in from the catalog after validation — never taken from the model. */
  name?: string
  coaching_cue?: string
}

/**
 * Keeps only prescriptions naming a drill on THIS team's menu and a cue in
 * this module's rubric, then fills the name and coaching cue from the catalog.
 *
 * The prompt lists the allowed ids, but a prompt is a request, not a
 * guarantee: a hallucinated drill id would otherwise reach a coach as a
 * confident prescription, and on a flag team it could be a contact drill.
 */
export function resolvePrescriptions(
  raw: DrillPrescription[] | undefined,
  opts: { menu: Drill[]; cueIds: Set<string> }
): DrillPrescription[] {
  const allowed = new Map(opts.menu.map((d) => [d.id, d]))
  const seen = new Set<string>()

  return (raw ?? []).flatMap((p) => {
    const drill = allowed.get(p.drill_id)
    if (!drill) return []
    if (!opts.cueIds.has(p.fixes_cue)) return []
    // One drill prescribed twice is one drill.
    if (seen.has(drill.id)) return []
    seen.add(drill.id)

    return [{ ...p, name: drill.name, coaching_cue: drill.cue }]
  })
}

/**
 * The coach-facing sentence for each prescription, so `drills` stays a plain
 * string array for the existing UI and safety filter while being derived from
 * the catalog rather than invented.
 */
export function renderPrescriptions(prescriptions: DrillPrescription[]): string[] {
  return prescriptions.map((p) => {
    const cue = p.fixes_cue.replace(/_/g, ' ')
    return `${p.name} — fixes ${cue}. ${p.why_this_rep} Coaching cue: "${p.coaching_cue}"`
  })
}
