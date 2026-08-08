/**
 * Competition-level resolution. PlayScout serves every level from youth (6U)
 * through high-school varsity, so grading/scheme calibration must key off the
 * team's real level — not a hardcoded youth ceiling. A team carries the level in
 * two places (`age_group` incl. JV/Varsity/Adult, and `level` incl.
 * "High School"/"College"); this collapses both into one canonical tier.
 */

export type LevelTier =
  | 'youth_early'   // 6U–8U
  | 'youth'         // 9U–10U
  | 'youth_older'   // 11U–12U
  | 'middle_school' // 13U–14U
  | 'jv'            // high-school JV
  | 'varsity'       // high-school varsity (College/Semi-Pro/Adult grade here, best-effort)
  | 'unknown'

export function resolveLevelTier(team?: { age_group?: string | null; level?: string | null } | null): LevelTier {
  const age = (team?.age_group ?? '').toLowerCase().trim()
  const level = (team?.level ?? '').toLowerCase().trim()

  // Explicit HS / post-HS signals win.
  if (level.includes('college') || level.includes('semi')) return 'varsity'
  if (age === 'varsity' || age === 'adult') return 'varsity'
  if (age === 'jv') return 'jv'
  if (level === 'high school') return age === 'jv' ? 'jv' : 'varsity'

  // Youth age bands like "6U".."14U".
  const m = age.match(/^(\d+)\s*u$/)
  if (m) {
    const n = parseInt(m[1], 10)
    if (n <= 8) return 'youth_early'
    if (n <= 10) return 'youth'
    if (n <= 12) return 'youth_older'
    return 'middle_school' // 13U–14U
  }

  return 'unknown'
}

export function isHighSchoolOrAbove(tier: LevelTier): boolean {
  return tier === 'jv' || tier === 'varsity'
}

export function isYouth(tier: LevelTier): boolean {
  return tier === 'youth_early' || tier === 'youth' || tier === 'youth_older' || tier === 'middle_school'
}

export function tierLabel(tier: LevelTier): string {
  switch (tier) {
    case 'youth_early': return 'youth (6U–8U)'
    case 'youth': return 'youth (9U–10U)'
    case 'youth_older': return 'youth (11U–12U)'
    case 'middle_school': return 'middle school (13U–14U)'
    case 'jv': return 'high-school JV'
    case 'varsity': return 'high-school varsity'
    case 'unknown': return 'an unspecified level'
  }
}

/**
 * The grading standard + scheme-complexity ceiling + coaching register the model
 * should use for this tier. Injected into every module prompt and the chat so a
 * varsity QB is graded like a varsity QB — never against a 12U column — and a
 * youth QB is never over-graded against varsity/college standards.
 */
export function levelCalibration(tier: LevelTier): string {
  switch (tier) {
    case 'youth_early':
    case 'youth':
    case 'youth_older':
    case 'middle_school':
      return `COMPETITION LEVEL: ${tierLabel(tier)}.
- Grade against age-appropriate ${tierLabel(tier)} fundamentals. Do NOT grade a youth player against varsity, college, or NFL standards — meeting the target for this age is Advanced FOR THIS AGE.
- Prioritize assignment, alignment, leverage, effort, ball security, and tackling angles over advanced scheme nuance.
- Keep scheme/complexity recommendations lean and age-appropriate; more reps, smaller menus.`
    case 'jv':
      return `COMPETITION LEVEL: high-school JV.
- Grade against high-school JV standards — advanced fundamentals and real scheme execution are expected, more than youth but still developing toward varsity.
- Full schemes, situational packages, and multi-read concepts are appropriate; do not clamp to youth-lean menus.`
    case 'varsity':
      return `COMPETITION LEVEL: high-school varsity.
- Grade against high-school varsity standards, with college-bound / next-level technique as the aspirational ceiling. Advanced mechanics (hip-shoulder separation, full-field reads, pass-pro nuance, coverage recognition) are the correct axis — an elite varsity player CAN and SHOULD score in the Elite band for varsity-caliber play.
- Do NOT clamp to youth fundamentals or refuse college-caliber scheme depth; full playbooks, multiple coverages, RPOs, and situational packages are expected.`
    case 'unknown':
      return `COMPETITION LEVEL: not specified.
- Determine the likely level from the film and profile, state the level you assumed, and calibrate to it — anywhere from youth fundamentals to high-school varsity. Do not default to the youngest youth band.`
  }
}
