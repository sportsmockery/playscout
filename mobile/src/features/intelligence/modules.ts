import type { ModuleKey } from '@/types/domain';

export interface ModuleDef {
  key: ModuleKey;
  name: string;
  /** One-line coach-facing description. */
  blurb: string;
  group: 'position' | 'team' | 'opponent' | 'playbook';
  /** Whether the module grades a single player (needs player selection). */
  perPlayer: boolean;
}

/**
 * Only server-supported modules appear. WRIQ/DLIQ/LBIQ/DBIQ/PracticeIQ are
 * intentionally omitted — they exist in the type union but the server does not
 * run them, and we never show a module that can't actually produce a result.
 */
export const MODULE_CATALOG: ModuleDef[] = [
  { key: 'QBIQ', name: 'QBIQ', blurb: 'Quarterback mechanics, decisions, and pocket presence.', group: 'position', perPlayer: true },
  { key: 'RBIQ', name: 'RBIQ', blurb: 'Running back vision, footwork, and ball security.', group: 'position', perPlayer: true },
  { key: 'OLIQ', name: 'OLIQ', blurb: 'Offensive line protection, run blocking, and leverage.', group: 'position', perPlayer: true },
  { key: 'TEAMIQ', name: 'TeamIQ', blurb: 'Formations, tendencies, and team patterns from film.', group: 'team', perPlayer: false },
  { key: 'MISTAKEIQ', name: 'MistakeIQ', blurb: 'Game-changing mistakes and recurring issues.', group: 'team', perPlayer: false },
  { key: 'SCOUTIQ', name: 'ScoutIQ', blurb: 'Scout an opponent’s tendencies and build a game plan.', group: 'opponent', perPlayer: false },
  { key: 'PLAYBOOKIQ', name: 'PlaybookIQ', blurb: 'Analyze an uploaded playbook and its install order.', group: 'playbook', perPlayer: false },
];

export function moduleByKey(key: string): ModuleDef | undefined {
  return MODULE_CATALOG.find((m) => m.key === key);
}
