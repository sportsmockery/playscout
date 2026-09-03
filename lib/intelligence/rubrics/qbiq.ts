import type { ModuleRubric } from './types'

/** Sub-cues and markers from IQ_ANALYSIS_KNOWLEDGE_BASE §4.1. */
export const QBIQ_RUBRIC: ModuleRubric = {
  module: 'QBIQ',
  subject: 'the quarterback',
  dimensions: [
    {
      key: 'mechanics',
      weight: 0.4,
      purpose: 'The physical throwing and ball-handling craft.',
      cues: [
        {
          id: 'base_width',
          name: 'Base width',
          good: 'Feet about shoulder width, athletic — not narrow, not splayed',
          marker: 'The stance frames just before the throw',
        },
        {
          id: 'weight_transfer',
          name: 'Weight transfer',
          good: 'Back-to-front drive into the throw',
          marker: 'The weight shifting across two or three consecutive moments, not one still',
        },
        {
          id: 'stride_length',
          name: 'Stride length',
          good: 'A directional step toward the target',
          marker: 'Where the front foot lands and where it points',
        },
        {
          id: 'hip_shoulder_separation',
          name: 'Hip–shoulder separation',
          good: 'Hips open before the shoulders, creating torque',
          marker: 'Torso rotation through the middle of the throw',
        },
        {
          id: 'release_point',
          name: 'Release point',
          good: 'Consistent, over-the-top-ish, above the ear',
          marker: 'The moment the ball leaves the hand',
        },
        {
          id: 'follow_through',
          name: 'Follow-through',
          good: 'Hand finishes across the body, thumb down',
          marker: 'Immediately after release',
        },
        {
          id: 'throwing_posture',
          name: 'Throwing posture',
          good: 'Tall base, driving through the throw rather than falling away',
          marker: 'The whole throwing sequence, not a single moment',
        },
        {
          id: 'ball_security_in_action',
          name: 'Ball security in action',
          good: 'Two hands on it until the throw or handoff; high and tight when scrambling',
          marker: 'Any moment he is carrying rather than throwing',
        },
      ],
    },
    {
      key: 'decision_making',
      weight: 0.4,
      purpose: 'Reading the field and choosing well.',
      cues: [
        {
          id: 'pre_snap_recognition',
          name: 'Pre-snap recognition',
          good: 'Eyes and head scanning the defense before the snap',
          marker: 'The pre-snap moments',
        },
        {
          id: 'eye_discipline',
          name: 'Eye discipline',
          good: 'Looking a defender off rather than staring down one target',
          marker: 'Head and eye direction compared with where the ball ends up',
        },
        {
          id: 'progression_evidence',
          name: 'Progression',
          good: 'Head moves through more than one option',
          marker: 'Sequential head turns as the play develops',
        },
        {
          id: 'checkdown_awareness',
          name: 'Checkdown awareness',
          good: 'Takes the safe outlet when nothing is open',
          marker: 'Late in the progression',
        },
        {
          id: 'pressure_response',
          name: 'Pressure response',
          good: 'Steps up or throws it away instead of panicking into a sack',
          marker: 'The moments defenders arrive',
        },
        {
          id: 'forced_throw_avoidance',
          name: 'Avoiding forced throws',
          good: 'Does not throw into coverage or traffic',
          marker: 'The target area compared with defender positions at release',
        },
      ],
    },
    {
      key: 'pocket_presence',
      weight: 0.2,
      purpose: 'Operating from snap to finish.',
      nullWhen: 'the clip contains no dropback or pass attempt at all',
      cues: [
        {
          id: 'snap_exchange',
          name: 'Snap exchange',
          good: 'Clean catch or exchange, no bobble',
          marker: 'The snap itself',
        },
        {
          id: 'mesh_point',
          name: 'Mesh point',
          good: 'Clean ride or clamp on the handoff and fakes',
          marker: 'The backfield mesh',
        },
        {
          id: 'carry_out_fake',
          name: 'Carrying out the fake',
          good: 'Sells it with eyes and belly after the mesh',
          marker: 'Just after the mesh',
        },
        {
          id: 'drop_or_boot_depth',
          name: 'Drop / boot depth',
          good: 'Reaches launch depth without drifting flat',
          marker: 'The dropback',
        },
        {
          id: 'climb_vs_bail',
          name: 'Climb vs. bail',
          good: 'Steps up into clean air rather than bailing backwards',
          marker: 'Movement inside the pocket',
        },
        {
          id: 'escape_with_security',
          name: 'Escaping with the ball secure',
          good: 'Two hands, high and tight, once he leaves the pocket',
          marker: 'The scramble',
        },
      ],
    },
  ],
  benchmarks: [
    {
      cue: 'Snap reception',
      targets: {
        youth_early: '≥ 85% clean',
        youth: '≥ 90% clean',
        youth_older: '≥ 95% clean',
        middle_school: '≥ 97% clean, under center and in gun',
        jv: 'Clean under pressure and on a silent cadence',
        varsity: 'Automatic — a bad snap is a notable event, not a tendency',
      },
    },
    {
      cue: 'Handoff mesh',
      targets: {
        youth_early: 'Rides the back, occasional bobble',
        youth: 'Clean roughly 19 of 20',
        youth_older: 'Clean and sells the fake',
        middle_school: 'Clean, sells the fake, reads the mesh key',
        jv: 'Consistent on zone-read and RPO mesh',
        varsity: 'Mesh is a weapon — holds the read defender before pulling',
      },
    },
    {
      cue: 'Base throw',
      targets: {
        youth_early: 'Steps toward the target, short range',
        youth: 'Consistent to 10–12 yards',
        youth_older: 'Timing throws with a progression',
        middle_school: 'Accurate to the far hash on a rhythm throw',
        jv: 'Drives the ball outside the numbers with anticipation',
        varsity: 'Throws receivers open — placement, not just accuracy',
      },
    },
    {
      cue: 'Reads',
      targets: {
        youth_early: 'Find #1, else run',
        youth: 'Reads one defender or one picture',
        youth_older: 'Full half-field progression',
        middle_school: 'Half-field progression with a pressure answer',
        jv: 'Full-field progression, identifies the leverage defender pre-snap',
        varsity: 'Full-field reads with coverage recognition and a built-in answer',
      },
    },
  ],
}
