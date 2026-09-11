import type { ModuleDef } from './modules';

export interface PreflightSelection {
  writable: boolean;
  videoIds: string[];
  playerId: string | null;
  opponentId: string | null;
  /** The colour actually in force: the coach's edit, else what's on file. */
  jerseyColor: string;
}

export type PreflightBlock =
  | 'read_only'
  | 'no_film'
  | 'no_player'
  | 'no_opponent'
  | 'no_jersey_color'
  | null;

/**
 * Why a module can't run yet, or null when it can.
 *
 * Kept pure and separate from the screen because the scouting rules are the
 * kind that quietly stop being enforced during a refactor: ScoutIQ without a
 * jersey colour doesn't fail, it produces a confident report about the WRONG
 * TEAM. Returns the first blocker in the order a coach would fix them.
 */
export function preflightBlock(mod: ModuleDef, sel: PreflightSelection): PreflightBlock {
  if (!sel.writable) return 'read_only';
  if (mod.subject === 'opponent') {
    if (!sel.opponentId) return 'no_opponent';
    if (sel.jerseyColor.trim() === '') return 'no_jersey_color';
  }
  if (sel.videoIds.length === 0) return 'no_film';
  if (mod.perPlayer && !sel.playerId) return 'no_player';
  return null;
}

export const PREFLIGHT_BLOCK_COPY: Record<NonNullable<PreflightBlock>, string> = {
  read_only: 'Your role is read-only on this team.',
  no_film: 'Choose at least one clip.',
  no_player: 'Choose which player to grade.',
  no_opponent: 'Choose which opponent you’re scouting.',
  no_jersey_color: 'Add the opponent’s jersey colour so the right team gets graded.',
};

/**
 * Whether a selection runs now or queues.
 *
 * Exactly one already-processed clip is a report a coach can read immediately.
 * Anything else — more clips, or film still being processed — queues, because
 * holding a phone on a spinner through 40 vision calls is not a workflow.
 */
export function runsInline(videoIds: string[], readyNow: ReadonlySet<string>): boolean {
  return videoIds.length === 1 && !!videoIds[0] && readyNow.has(videoIds[0]);
}
