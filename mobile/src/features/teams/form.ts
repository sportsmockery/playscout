import type { GameType, Team } from '@/types/domain';
import type { TeamSettingsInput } from '@/lib/api/types';

export interface TeamFormValues {
  name: string;
  age_group: string;
  season: string;
  level: string;
  game_type: GameType | '';
  league: string;
  state: string;
  offensive_style: string;
  defensive_style: string;
  home_jersey_color: string;
  away_jersey_color: string;
  notes: string;
}

export function emptyTeamForm(): TeamFormValues {
  return {
    name: '',
    age_group: '',
    season: String(new Date().getFullYear()),
    level: '',
    // Deliberately blank: nothing is assumed about whether this team hits.
    game_type: '',
    league: '',
    state: '',
    offensive_style: '',
    defensive_style: '',
    home_jersey_color: '',
    away_jersey_color: '',
    notes: '',
  };
}

/** A null column becomes an empty field, never the string "null". */
export function teamFormFrom(team: Team): TeamFormValues {
  return {
    name: team.name ?? '',
    age_group: team.age_group ?? '',
    season: team.season ?? '',
    level: team.level ?? '',
    game_type: team.game_type ?? '',
    league: team.league ?? '',
    state: team.state ?? '',
    offensive_style: team.offensive_style ?? '',
    defensive_style: team.defensive_style ?? '',
    home_jersey_color: team.home_jersey_color ?? '',
    away_jersey_color: team.away_jersey_color ?? '',
    notes: team.notes ?? '',
  };
}

export function toTeamInput(v: TeamFormValues): TeamSettingsInput {
  return { ...v };
}
