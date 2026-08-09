import type { LevelTier } from '@/types/domain';

/**
 * Client mirror of lib/intelligence/levels.ts resolveLevelTier. Used only for
 * display calibration (labels, expectations copy). The server re-resolves the
 * tier authoritatively from the teams row before any grading — never trust this
 * for anything but presentation.
 */
export function resolveLevelTier(
  team: { age_group?: string | null; level?: string | null } | null | undefined,
): LevelTier {
  if (!team) return 'unknown';
  const level = (team.level ?? '').toLowerCase().trim();
  const age = (team.age_group ?? '').toLowerCase().trim();

  if (level.includes('college') || level.includes('semi')) return 'varsity';
  if (age.includes('varsity') || age.includes('adult')) return 'varsity';
  if (age.includes('jv') || level.includes('jv')) return 'jv';
  if (level === 'high school' || level.includes('high school')) {
    return age.includes('jv') ? 'jv' : 'varsity';
  }

  const bandMatch = age.match(/(\d+)\s*u/);
  if (bandMatch && bandMatch[1] != null) {
    const n = parseInt(bandMatch[1], 10);
    if (n <= 8) return 'youth_early';
    if (n <= 10) return 'youth';
    if (n <= 12) return 'youth_older';
    return 'middle_school';
  }

  if (age.includes('middle')) return 'middle_school';
  return 'unknown';
}

export const TIER_LABELS: Record<LevelTier, string> = {
  youth_early: 'Youth (6U–8U)',
  youth: 'Youth (9U–10U)',
  youth_older: 'Youth (11U–12U)',
  middle_school: 'Middle school',
  jv: 'JV',
  varsity: 'Varsity',
  unknown: 'Level not set',
};

export function tierLabel(tier: LevelTier): string {
  return TIER_LABELS[tier];
}

export function isHighSchoolOrAbove(tier: LevelTier): boolean {
  return tier === 'jv' || tier === 'varsity';
}
