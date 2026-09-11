import type { GameType } from '@/types/domain';

/** Matches the web's team settings options exactly — a team edited on one
 *  surface must not come back looking invalid on the other. */
export const AGE_GROUPS = [
  '6U', '7U', '8U', '9U', '10U', '11U', '12U',
  '13U', '14U', 'JV', 'Varsity', 'Adult',
] as const;

export const LEVELS = [
  'Recreation', 'Travel', 'High School', 'College', 'Semi-Pro', 'Other',
] as const;

/**
 * Drives the contact-drill safety gate in analysis, so it is a closed set:
 * flag = no contact ever, tackle = live contact where level-appropriate,
 * rookie_tackle = modified. Getting this wrong recommends a contact drill to a
 * flag team, which is the one thing the knowledge base forbids outright.
 */
export const GAME_TYPES: { value: GameType; label: string; hint: string }[] = [
  { value: 'flag', label: 'Flag', hint: 'No contact — contact drills are never recommended.' },
  { value: 'tackle', label: 'Tackle', hint: 'Full contact where age-appropriate.' },
  { value: 'rookie_tackle', label: 'Rookie', hint: 'Modified / reduced contact.' },
];
