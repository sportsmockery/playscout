import type { CueCatalog } from '../breakdown'

/**
 * The closed cue lists each player module grades against.
 *
 * These are transcribed from the sub-cue tables in IQ_ANALYSIS_KNOWLEDGE_BASE
 * §4.1 (QBIQ), §4.2 (OLIQ) and §4.6 (RBIQ) — 954 lines of rubric that no code
 * ever loaded. `grep -rn IQ_ANALYSIS_KNOWLEDGE_BASE --include=*.ts` returned
 * nothing; what actually reached the model was one comma-separated line per
 * dimension ("Evaluate: base width, weight transfer, stride length…"), with
 * the two columns that make a grade mean something — what good looks like,
 * and the marker you read it from — left in the document.
 *
 * Cue ids are stable identifiers, not prose: they key the breakdown, and in a
 * later pass they key the per-tier standard and the drill that fixes each one.
 */

export const QBIQ_CUES: CueCatalog = {
  mechanics: [
    'base_width',
    'weight_transfer',
    'stride_length',
    'hip_shoulder_separation',
    'release_point',
    'follow_through',
    'throwing_posture',
    'ball_security_in_action',
  ],
  decision_making: [
    'pre_snap_recognition',
    'eye_discipline',
    'progression_evidence',
    'checkdown_awareness',
    'pressure_response',
    'forced_throw_avoidance',
  ],
  pocket_presence: [
    'snap_exchange',
    'mesh_point',
    'carry_out_fake',
    'drop_or_boot_depth',
    'climb_vs_bail',
    'escape_with_security',
  ],
}

export const OLIQ_CUES: CueCatalog = {
  pass_protection: [
    'set_type_and_depth',
    'first_kick_quickness',
    'hand_timing_and_placement',
    'anchor_vs_bull_rush',
    'mirror_and_redirect',
    'pass_set_posture',
    'recovery_after_contact',
  ],
  run_blocking: [
    'first_step_explosion',
    'pad_level_and_leverage',
    'hand_fit',
    'hip_roll_and_leg_drive',
    'aiming_point',
    'combo_and_climb_to_linebacker',
    'finish',
  ],
  footwork_leverage: [
    'base_width_and_balance',
    'staying_square',
    'knee_bend',
    'avoid_crossing_feet',
    'recovery_and_refit',
  ],
}

export const RBIQ_CUES: CueCatalog = {
  vision_decision: [
    'reads_the_block',
    'correct_gap',
    'press_then_cut',
    'patience_vs_bouncing',
    'decisiveness_in_the_lane',
    'follows_lead_blocker',
    'finds_the_cutback',
  ],
  ball_security: [
    'high_and_tight',
    'correct_arm',
    'two_hands_in_traffic',
    'protects_through_contact',
    'no_exposure_on_cuts',
  ],
  footwork_contact: [
    'path_and_landmark',
    'one_cut_decisiveness',
    'pad_level_through_contact',
    'runs_behind_pads',
    'finishes_north_south',
    'balance_after_contact',
  ],
}
