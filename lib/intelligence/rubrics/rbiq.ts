import type { ModuleRubric } from './types'

/** Sub-cues, markers and benchmarks from IQ_ANALYSIS_KNOWLEDGE_BASE §4.6. */
export const RBIQ_RUBRIC: ModuleRubric = {
  module: 'RBIQ',
  subject: 'a single running back',
  dimensions: [
    {
      key: 'vision_decision',
      weight: 0.4,
      purpose: 'Reading the front and choosing the right lane.',
      nullWhen: 'the back never carries the ball (pass protection or a route only)',
      cues: [
        {
          id: 'reads_the_block',
          name: 'Reads the block / landmark',
          good: 'Eyes on the key block rather than the ball',
          marker: 'From the mesh through the first step',
        },
        {
          id: 'correct_gap',
          name: 'Correct gap',
          good: 'Hits the designed hole',
          marker: 'The attack, read against the line splits',
        },
        {
          id: 'press_then_cut',
          name: 'Press then cut',
          good: 'Presses the hole to hold the defender, then cuts',
          marker: 'The middle of the run',
        },
        {
          id: 'patience_vs_bouncing',
          name: 'Patience vs. bouncing',
          good: 'Stays downhill instead of bouncing everything outside',
          marker: 'The path across the whole run',
        },
        {
          id: 'decisiveness_in_the_lane',
          name: 'Decisiveness once the lane appears',
          good: 'Commits and accelerates rather than hesitating',
          marker: 'The moment the lane opens',
        },
        {
          id: 'follows_lead_blocker',
          name: 'Following the lead',
          good: 'Runs off the lead blocker\'s hip',
          marker: 'While the lead block is being made',
        },
        {
          id: 'finds_the_cutback',
          name: 'Cutback',
          good: 'Finds the backside lane when the frontside is closed',
          marker: 'Late in the run',
        },
      ],
    },
    {
      key: 'ball_security',
      weight: 0.35,
      purpose: 'Protecting the football.',
      nullWhen: 'the back never has the ball in his hands',
      cues: [
        {
          id: 'high_and_tight',
          name: 'High and tight',
          good: 'Ball pinned high against the ribs',
          marker: 'Any carrying moment',
        },
        {
          id: 'correct_arm',
          name: 'Correct arm',
          good: 'Ball in the arm away from the nearest defender',
          marker: 'The carry, read against where the defenders are',
        },
        {
          id: 'two_hands_in_traffic',
          name: 'Two hands in traffic',
          good: 'Covers up entering the pile',
          marker: 'Contact and pile moments',
        },
        {
          id: 'protects_through_contact',
          name: 'Secure through contact',
          good: 'Ball stays secure at the point of contact and after',
          marker: 'Contact through the finish',
        },
        {
          id: 'no_exposure_on_cuts',
          name: 'No exposure',
          good: 'Ball is not swinging loose on cuts or spins',
          marker: 'Each cut and spin — where the ball is relative to his frame',
        },
      ],
    },
    {
      key: 'footwork_contact',
      weight: 0.25,
      purpose: 'How the run is finished.',
      cues: [
        {
          id: 'path_and_landmark',
          name: 'Path and landmark accuracy',
          good: 'Hits the aiming point',
          marker: 'First step through the attack',
        },
        {
          id: 'one_cut_decisiveness',
          name: 'One-cut decisiveness',
          good: 'Plants and goes — no dancing',
          marker: 'The plant foot at the cut, and whether he gathers before it',
        },
        {
          id: 'pad_level_through_contact',
          name: 'Pad level',
          good: 'Runs low, behind his pads',
          marker: 'The moment of first contact, comparing his pad height to the tackler\'s',
        },
        {
          id: 'runs_behind_pads',
          name: 'Running behind the pads',
          good: 'Shoulders lead into contact rather than standing up',
          marker: 'The moment before and during contact',
        },
        {
          id: 'finishes_north_south',
          name: 'Finishing north–south',
          good: 'Falls forward, gains yards after contact',
          marker: 'The last moments of the run, and which way he ends up falling',
        },
        {
          id: 'balance_after_contact',
          name: 'Balance and effort',
          good: 'Stays up through arm tackles',
          marker: 'After first contact',
        },
      ],
    },
  ],
  benchmarks: [
    {
      cue: 'Ball security',
      targets: {
        youth_early: 'High and tight, occasionally loose',
        youth: 'Correct arm, secure in traffic',
        youth_older: 'Secures through contact and the pile',
        middle_school: 'Secure through contact with a second defender arriving',
        jv: 'Switches arms correctly on the field-side run',
        varsity: 'No exposure at any point — including on spins and stiff-arms',
      },
    },
    {
      cue: 'Vision / gap',
      targets: {
        youth_early: 'Follows the hole',
        youth: 'Reads one block, one cut',
        youth_older: 'Presses then cuts, finds the cutback',
        middle_school: 'Reads the second-level defender before committing',
        jv: 'Reads the full front and sets up the block',
        varsity: 'Manipulates the defender with tempo and pace before cutting',
      },
    },
    {
      cue: 'Footwork',
      targets: {
        youth_early: 'North–south, falls forward',
        youth: 'Decisive one-cut',
        youth_older: 'One-cut and finishes through contact',
        middle_school: 'One-cut at speed without losing pad level',
        jv: 'Changes direction without losing ground',
        varsity: 'Cuts at full speed and accelerates out of the cut',
      },
    },
    {
      cue: 'Balls on the ground',
      targets: {
        youth_early: 'None per team period is the target',
        youth: 'Zero per team period',
        youth_older: 'Zero, including through contact',
        middle_school: 'Zero under live tackling',
        jv: 'Zero, including on the second and third effort',
        varsity: 'Zero — ball security is assumed, not coached',
      },
    },
  ],
}
