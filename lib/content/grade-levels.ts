/**
 * The level vocabulary a coach picks from, shared by every form that asks
 * "what level is this player?".
 *
 * Free text was the old answer, which produced "8th grade", "8th", "13U" and
 * "eighth" for the same kid — unusable for filtering, and useless to grading
 * calibration, which parses these strings (see lib/intelligence/levels.ts).
 * The youth values deliberately match the `NNU` form resolveLevelTier reads,
 * and JV/Varsity match the high-school signals it recognizes.
 */
export const GRADE_LEVEL_GROUPS: { label: string; options: string[] }[] = [
  {
    label: 'Youth',
    options: ['6U', '7U', '8U', '9U', '10U', '11U', '12U', '13U', '14U'],
  },
  {
    label: 'Middle school',
    options: ['6th grade', '7th grade', '8th grade'],
  },
  {
    label: 'High school',
    options: ['Freshman', 'Sophomore', 'Junior', 'Senior', 'JV', 'Varsity'],
  },
]

export const GRADE_LEVELS: string[] = GRADE_LEVEL_GROUPS.flatMap((g) => g.options)
