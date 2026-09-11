import type { ModuleKey } from '@/types/domain';

export interface ModuleDef {
  key: ModuleKey;
  name: string;
  /** One-line coach-facing description. */
  blurb: string;
  group: 'position' | 'team' | 'opponent' | 'playbook';
  /** Whether the module grades a single player (needs player selection). */
  perPlayer: boolean;
  /**
   * What this module reads.
   *
   * 'film'     — our own film, through /api/intelligence/analyze.
   * 'opponent' — opponent film; also needs an opponent and their jersey colour,
   *              or the model can grade the wrong side of the ball.
   * 'document' — not a film module at all. PlaybookIQ has its own routes and is
   *              absent from analyze-position's MODULE_MAP, so routing it to
   *              the film preflight produced a generic 500.
   */
  subject: 'film' | 'opponent' | 'document';
}

/**
 * Only server-supported modules appear. WRIQ/DLIQ/LBIQ/DBIQ/PracticeIQ are
 * intentionally omitted — they exist in the type union but the server does not
 * run them, and we never show a module that can't actually produce a result.
 */
export const MODULE_CATALOG: ModuleDef[] = [
  { key: 'QBIQ', name: 'QBIQ', blurb: 'Quarterback mechanics, decisions, and pocket presence.', group: 'position', perPlayer: true, subject: 'film' },
  { key: 'RBIQ', name: 'RBIQ', blurb: 'Running back vision, footwork, and ball security.', group: 'position', perPlayer: true, subject: 'film' },
  { key: 'OLIQ', name: 'OLIQ', blurb: 'Offensive line protection, run blocking, and leverage.', group: 'position', perPlayer: true, subject: 'film' },
  { key: 'TEAMIQ', name: 'TeamIQ', blurb: 'Formations, tendencies, and team patterns from film.', group: 'team', perPlayer: false, subject: 'film' },
  { key: 'MISTAKEIQ', name: 'MistakeIQ', blurb: 'Game-changing mistakes and recurring issues.', group: 'team', perPlayer: false, subject: 'film' },
  { key: 'RANKERIQ', name: 'RankerIQ', blurb: 'Grade and rank every player on your unit in a clip.', group: 'team', perPlayer: false, subject: 'film' },
  { key: 'SCOUTIQ', name: 'ScoutIQ', blurb: 'Scout an opponent’s tendencies and build a game plan.', group: 'opponent', perPlayer: false, subject: 'opponent' },
  { key: 'PLAYBOOKIQ', name: 'PlaybookIQ', blurb: 'Analyze an uploaded playbook and its install order.', group: 'playbook', perPlayer: false, subject: 'document' },
];

export function moduleByKey(key: string): ModuleDef | undefined {
  return MODULE_CATALOG.find((m) => m.key === key);
}
