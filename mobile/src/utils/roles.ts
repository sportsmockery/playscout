import type { UserRole } from '@/types/domain';

/** Mirrors server WRITE_ROLES (lib/auth/require-team-member.ts). Viewer is
 * read-only. The server remains authoritative — these gates only decide whether
 * a control is shown, never whether an action is permitted. */
export const WRITE_ROLES: readonly UserRole[] = ['owner', 'admin', 'coach', 'analyst'];
export const ADMIN_ROLES: readonly UserRole[] = ['owner', 'admin'];

export function canWrite(role: UserRole | null | undefined): boolean {
  return role != null && WRITE_ROLES.includes(role);
}

export function isAdmin(role: UserRole | null | undefined): boolean {
  return role != null && ADMIN_ROLES.includes(role);
}

export const ROLE_LABELS: Record<UserRole, string> = {
  owner: 'Owner',
  admin: 'Admin',
  coach: 'Coach',
  analyst: 'Analyst',
  viewer: 'Viewer',
};

export const ROLE_DESCRIPTIONS: Record<UserRole, string> = {
  owner: 'Full control of the organization and its teams.',
  admin: 'Manage members, teams, and all team workflows.',
  coach: 'Upload film, confirm plays, run analysis, and coach the team.',
  analyst: 'Run analysis and review intelligence.',
  viewer: 'Read-only access to film and reports.',
};

/** Copy shown to a viewer when a write control is intentionally unavailable. */
export function writeDeniedReason(role: UserRole | null | undefined): string {
  if (role === 'viewer') {
    return 'Your role is Viewer — you have read-only access. Ask a team admin for coach or analyst access to make changes.';
  }
  return 'You do not have permission to make this change on this team.';
}
