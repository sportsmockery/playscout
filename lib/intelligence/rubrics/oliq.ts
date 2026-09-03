import type { ModuleRubric } from './types'

/** Sub-cues, phase markers and benchmarks from IQ_ANALYSIS_KNOWLEDGE_BASE §4.2. */
export const OLIQ_RUBRIC: ModuleRubric = {
  module: 'OLIQ',
  subject: 'a single offensive lineman',
  dimensions: [
    {
      key: 'pass_protection',
      weight: 0.4,
      purpose: 'Keeping the rusher off the quarterback.',
      nullWhen: 'the clip contains no pass attempt at all',
      cues: [
        {
          id: 'set_type_and_depth',
          name: 'Set type and depth',
          good: 'The set matches the rush — depth without drifting into the quarterback',
          marker: 'Stance and the first moments after the snap',
        },
        {
          id: 'first_kick_quickness',
          name: 'First kick quickness',
          good: 'The first kick beats the rusher\'s first step',
          marker: 'The first step, before contact',
        },
        {
          id: 'hand_timing_and_placement',
          name: 'Hand timing and placement',
          good: 'Inside hands, thumbs up, landing on time rather than early or late',
          marker: 'The moment of contact',
        },
        {
          id: 'anchor_vs_bull_rush',
          name: 'Anchor vs. bull rush',
          good: 'Hips sink, feet stay under him, ground is not given',
          marker: 'While the rusher is driving through him',
        },
        {
          id: 'mirror_and_redirect',
          name: 'Mirror and redirect',
          good: 'Stays square to counters and games instead of lunging',
          marker: 'When the rusher changes direction',
        },
        {
          id: 'pass_set_posture',
          name: 'Pass-set posture',
          good: 'Knees bent, chest up, weight inside the frame',
          marker: 'Throughout the set',
        },
        {
          id: 'recovery_after_contact',
          name: 'Recovery after contact',
          good: 'Re-fits and keeps working after losing initial position',
          marker: 'After the first loss of leverage',
        },
      ],
    },
    {
      key: 'run_blocking',
      weight: 0.4,
      purpose: 'Moving the defender off the spot.',
      nullWhen: 'the clip contains no run play at all',
      cues: [
        {
          id: 'first_step_explosion',
          name: 'First-step explosion',
          good: 'Short, hard, in the right direction — no false step',
          marker: 'The first step off the snap',
        },
        {
          id: 'pad_level_and_leverage',
          name: 'Pad level and leverage',
          good: 'Pads under the defender\'s — low man wins',
          marker: 'The moment of contact',
        },
        {
          id: 'hand_fit',
          name: 'Hand fit',
          good: 'Hands inside the framework, not outside the shoulders',
          marker: 'Just after contact',
        },
        {
          id: 'hip_roll_and_leg_drive',
          name: 'Hip roll and leg drive',
          good: 'Hips roll through, feet keep driving',
          marker: 'While sustaining the block',
        },
        {
          id: 'aiming_point',
          name: 'Angle and aiming point',
          good: 'Takes the correct track for the scheme — drive, reach or zone',
          marker: 'The path from first step to contact',
        },
        {
          id: 'combo_and_climb_to_linebacker',
          name: 'Combo and climb',
          good: 'Stays on the double long enough, then climbs to the linebacker',
          marker: 'The middle of the rep',
        },
        {
          id: 'finish',
          name: 'Finish',
          good: 'Defender controlled or displaced, block sustained to the whistle',
          marker: 'The end of the rep',
        },
      ],
    },
    {
      key: 'footwork_leverage',
      weight: 0.2,
      purpose: 'The base everything else is built on.',
      cues: [
        {
          id: 'base_width_and_balance',
          name: 'Base width and balance',
          good: 'Feet stay outside the frame, weight centered',
          marker: 'Throughout the rep',
        },
        {
          id: 'staying_square',
          name: 'Staying square',
          good: 'Shoulders square to the line rather than over-extending',
          marker: 'Whenever he has to move laterally',
        },
        {
          id: 'knee_bend',
          name: 'Knee bend and ankle flexion',
          good: 'Bends at the knees, not the waist',
          marker: 'Stance and contact',
        },
        {
          id: 'avoid_crossing_feet',
          name: 'Not crossing over or lunging',
          good: 'Feet never cross; he slides rather than reaching',
          marker: 'Any lateral movement',
        },
        {
          id: 'recovery_and_refit',
          name: 'Recovery and re-fit',
          good: 'Regains position after losing it instead of giving up on the rep',
          marker: 'After a lost first step',
        },
      ],
    },
  ],
  benchmarks: [
    {
      cue: 'Stance / first step',
      targets: {
        youth_early: 'Balanced, correct direction',
        youth: 'Explosive and low',
        youth_older: 'Explosive and landmark-accurate',
        middle_school: 'Explosive, landmark-accurate, consistent under a cadence change',
        jv: 'Consistent against movement fronts and stunts',
        varsity: 'Repeatable at speed against a live twist or blitz look',
      },
    },
    {
      cue: 'Hand fit',
      targets: {
        youth_early: 'Hands inside, some late',
        youth: 'Inside and on time',
        youth_older: 'Inside, timed, re-fits when knocked off',
        middle_school: 'Inside and timed against a defender who moves first',
        jv: 'Wins the hand fight against counters',
        varsity: 'Independent hands — resets the fit mid-rep without losing the block',
      },
    },
    {
      cue: 'Pad level',
      targets: {
        youth_early: 'Understands "low man wins"',
        youth: 'Wins leverage on most reps',
        youth_older: 'Wins leverage and finishes',
        middle_school: 'Wins leverage against a bigger defender',
        jv: 'Sustains leverage through the whistle',
        varsity: 'Leverage plus displacement — moves the defender off the spot',
      },
    },
    {
      cue: 'Assignment busts',
      targets: {
        youth_early: 'Occasional',
        youth: 'Under 10%',
        youth_older: 'Under 5%',
        middle_school: 'Under 5% including on movement fronts',
        jv: 'Under 3%, communicates the call before the snap',
        varsity: 'Effectively none — makes and passes off the protection call',
      },
    },
  ],
}
