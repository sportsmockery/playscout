import type { GameType } from '@/types/domain';

/**
 * Request shapes, kept apart from endpoints.ts so pure modules (and their
 * tests) can name them without importing the API client — which reaches the
 * Supabase client, and through it native storage.
 */
export interface TeamSettingsInput {
  name?: string;
  age_group?: string;
  season?: string;
  level?: string;
  game_type?: GameType | '';
  league?: string;
  state?: string;
  offensive_style?: string;
  defensive_style?: string;
  home_jersey_color?: string;
  away_jersey_color?: string;
  notes?: string;
}
