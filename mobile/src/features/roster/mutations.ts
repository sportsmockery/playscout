import { supabase } from '@/lib/supabase/client';
import type { Player, SideOfBall } from '@/types/domain';

export interface PlayerDraft {
  firstName: string;
  lastName: string;
  jerseyNumber: string;
  primaryPosition: string;
  secondaryPosition: string;
  sideOfBall: SideOfBall | '';
  gradeLevel: string;
  status: string;
}

export const EMPTY_DRAFT: PlayerDraft = {
  firstName: '',
  lastName: '',
  jerseyNumber: '',
  primaryPosition: '',
  secondaryPosition: '',
  sideOfBall: '',
  gradeLevel: '',
  status: 'active',
};

export function draftFromPlayer(p: Player): PlayerDraft {
  return {
    firstName: p.first_name ?? '',
    lastName: p.last_name ?? '',
    jerseyNumber: p.jersey_number ?? '',
    primaryPosition: p.primary_position ?? '',
    secondaryPosition: p.secondary_position ?? '',
    sideOfBall: p.side_of_ball ?? '',
    gradeLevel: p.grade_level ?? '',
    status: p.status ?? 'active',
  };
}

/**
 * Row-level security denies a write by returning ZERO ROWS, not an error. A
 * client that only inspects `error` therefore reports success on a save that
 * never happened — the exact failure CLAUDE.md records against the players
 * table. Every mutation here asserts on the returned rows.
 */
const DENIED =
  "That didn't save — your account doesn't have write access to this team's roster. Ask an owner or admin for coach access.";

function isRlsDenial(err: { code?: string; message?: string } | null): boolean {
  if (!err) return false;
  return err.code === '42501' || /row-level security/i.test(err.message ?? '');
}

function nullIfBlank(v: string): string | null {
  const t = v.trim();
  return t === '' ? null : t;
}

function toRow(draft: PlayerDraft) {
  return {
    first_name: nullIfBlank(draft.firstName),
    last_name: nullIfBlank(draft.lastName),
    // A TEXT column: store what the coach typed. Number matching normalises
    // leading zeros on both sides, so "07" still ties to a model-read "7".
    jersey_number: nullIfBlank(draft.jerseyNumber),
    primary_position: nullIfBlank(draft.primaryPosition),
    secondary_position: nullIfBlank(draft.secondaryPosition),
    side_of_ball: draft.sideOfBall === '' ? null : draft.sideOfBall,
    grade_level: nullIfBlank(draft.gradeLevel),
    status: nullIfBlank(draft.status) ?? 'active',
  };
}

export async function createPlayer(teamId: string, draft: PlayerDraft): Promise<Player> {
  const { data, error } = await supabase
    .from('players')
    .insert({ team_id: teamId, ...toRow(draft) })
    .select()
    .returns<Player[]>();

  if (error) throw new Error(isRlsDenial(error) ? DENIED : error.message);
  const row = data?.[0];
  if (!row) throw new Error(DENIED);
  return row;
}

export async function updatePlayer(playerId: string, draft: PlayerDraft): Promise<Player> {
  const { data, error } = await supabase
    .from('players')
    .update(toRow(draft))
    .eq('id', playerId)
    .select()
    .returns<Player[]>();

  if (error) throw new Error(isRlsDenial(error) ? DENIED : error.message);
  const row = data?.[0];
  // No error and no row means the update matched nothing this user may write.
  if (!row) throw new Error(DENIED);
  return row;
}

export async function deletePlayer(playerId: string): Promise<void> {
  const { data, error } = await supabase
    .from('players')
    .delete()
    .eq('id', playerId)
    .select('id')
    .returns<{ id: string }[]>();

  if (error) throw new Error(isRlsDenial(error) ? DENIED : error.message);
  if (!data?.length) throw new Error(DENIED);
}
