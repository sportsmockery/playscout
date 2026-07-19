'use client'

import { useState } from 'react'
import { UserPlus, Copy, Check, Trash2, ShieldCheck, ChevronDown } from 'lucide-react'

export interface TeamOption {
  id: string
  name: string
}

export interface Member {
  userId: string
  role: string
  email: string
  lastSignInAt: string | null
  isSelf: boolean
  allTeams: boolean
  teamIds: string[]
}

const ASSIGNABLE = ['admin', 'coach', 'analyst', 'viewer'] as const
const ROLE_LABEL: Record<string, string> = {
  owner: 'Owner',
  admin: 'Admin',
  coach: 'Coach',
  analyst: 'Analyst',
  viewer: 'Viewer',
}
const isAdmin = (role: string) => role === 'owner' || role === 'admin'

/** All-teams toggle + specific team chips. */
function AccessControl({
  teams,
  allTeams,
  teamIds,
  onChange,
}: {
  teams: TeamOption[]
  allTeams: boolean
  teamIds: string[]
  onChange: (allTeams: boolean, teamIds: string[]) => void
}) {
  const chip = (on: boolean) =>
    'rounded-full border px-3 py-1 text-xs font-medium transition-colors ' +
    (on
      ? 'border-[var(--brand-navy)] bg-[var(--brand-navy)] text-white'
      : 'border-[var(--brand-border)] bg-white text-[var(--brand-ink)] hover:border-[var(--brand-navy)]')
  return (
    <div className="flex flex-wrap items-center gap-2">
      <button type="button" onClick={() => onChange(!allTeams, teamIds)} className={chip(allTeams)}>
        {allTeams ? '✓ ' : ''}All teams (whole org)
      </button>
      <span className="text-xs text-[var(--brand-muted)]">or</span>
      {teams.length === 0 ? (
        <span className="text-xs text-[var(--brand-muted)]">no teams yet — ones a user creates appear here</span>
      ) : (
        teams.map((t) => {
          const on = !allTeams && teamIds.includes(t.id)
          return (
            <button
              key={t.id}
              type="button"
              disabled={allTeams}
              onClick={() => onChange(false, teamIds.includes(t.id) ? teamIds.filter((x) => x !== t.id) : [...teamIds, t.id])}
              className={chip(on) + (allTeams ? ' opacity-40' : '')}
            >
              {on ? '✓ ' : ''}
              {t.name}
            </button>
          )
        })
      )}
    </div>
  )
}

export default function AdminUsersClient({
  initialMembers,
  teams,
  currentUserRole,
  loadError,
}: {
  initialMembers: Member[]
  teams: TeamOption[]
  currentUserRole: string
  loadError: string | null
}) {
  const [members, setMembers] = useState<Member[]>(initialMembers)
  const [email, setEmail] = useState('')
  const [role, setRole] = useState<(typeof ASSIGNABLE)[number]>('coach')
  const [newAllTeams, setNewAllTeams] = useState(false)
  const [newTeamIds, setNewTeamIds] = useState<string[]>([])
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [created, setCreated] = useState<{ email: string; tempPassword: string | null } | null>(null)
  const [copied, setCopied] = useState(false)
  const [expanded, setExpanded] = useState<string | null>(null)

  const canManage = isAdmin(currentUserRole)
  const teamName = (id: string) => teams.find((t) => t.id === id)?.name ?? 'team'

  async function refresh() {
    const res = await fetch('/api/admin/members')
    if (res.ok) setMembers((await res.json()).members)
  }

  async function saveAccess(userId: string, allTeams: boolean, teamIds: string[]) {
    const res = await fetch('/api/admin/team-access', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ userId, allTeams, teamIds }),
    })
    if (!res.ok) {
      setError((await res.json()).error || 'Failed to update team access')
      return false
    }
    return true
  }

  async function addUser(e: React.FormEvent) {
    e.preventDefault()
    setBusy(true)
    setError(null)
    setCreated(null)
    try {
      const res = await fetch('/api/admin/members', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, role }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Failed to add user')
      // Assign access (only meaningful for non-admin roles — admins see all).
      if (!isAdmin(role) && data.userId && (newAllTeams || newTeamIds.length)) {
        await saveAccess(data.userId, newAllTeams, newTeamIds)
      }
      setCreated({ email: data.email, tempPassword: data.tempPassword })
      setEmail('')
      setNewAllTeams(false)
      setNewTeamIds([])
      await refresh()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to add user')
    } finally {
      setBusy(false)
    }
  }

  async function changeRole(userId: string, newRole: string) {
    setError(null)
    const res = await fetch('/api/admin/members', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ userId, role: newRole }),
    })
    if (!res.ok) {
      setError((await res.json()).error || 'Failed to change role')
      return
    }
    setMembers((m) => m.map((x) => (x.userId === userId ? { ...x, role: newRole } : x)))
  }

  async function updateAccess(m: Member, allTeams: boolean, teamIds: string[]) {
    const prev = { allTeams: m.allTeams, teamIds: m.teamIds }
    setMembers((list) => list.map((x) => (x.userId === m.userId ? { ...x, allTeams, teamIds } : x)))
    const ok = await saveAccess(m.userId, allTeams, teamIds)
    if (!ok) setMembers((list) => list.map((x) => (x.userId === m.userId ? { ...x, ...prev } : x)))
  }

  async function removeUser(userId: string, memberEmail: string) {
    if (!confirm(`Remove ${memberEmail} from this organization? Their login is kept but they lose access.`)) return
    setError(null)
    const res = await fetch('/api/admin/members', {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ userId }),
    })
    if (!res.ok) {
      setError((await res.json()).error || 'Failed to remove user')
      return
    }
    setMembers((m) => m.filter((x) => x.userId !== userId))
  }

  function copyTemp(pw: string) {
    navigator.clipboard.writeText(pw)
    setCopied(true)
    setTimeout(() => setCopied(false), 1500)
  }

  function summary(m: Member): string {
    if (isAdmin(m.role)) return 'Access to all teams'
    if (m.allTeams) return 'Access to all teams (whole org)'
    if (m.teamIds.length) return `${m.teamIds.length} team${m.teamIds.length > 1 ? 's' : ''}: ${m.teamIds.map(teamName).join(', ')}`
    return 'No teams assigned'
  }

  return (
    <div className="space-y-6">
      {loadError && (
        <div className="rounded-lg border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-800">
          {loadError}
        </div>
      )}

      {/* Add user */}
      <div className="glass-card p-5">
        <div className="mb-3 flex items-center gap-2">
          <UserPlus size={18} className="text-[var(--brand-navy)]" />
          <h2 className="font-semibold text-[var(--brand-navy)]">Add a user</h2>
        </div>
        <form onSubmit={addUser} className="space-y-3">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
            <label className="flex-1 text-sm">
              <span className="mb-1 block font-medium text-[var(--brand-ink)]">Email</span>
              <input
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="coach@team.com"
                className="w-full rounded-lg border border-[var(--brand-border)] px-3 py-2 text-sm outline-none focus:border-[var(--brand-navy)]"
              />
            </label>
            <label className="text-sm sm:w-44">
              <span className="mb-1 block font-medium text-[var(--brand-ink)]">Role</span>
              <select
                value={role}
                onChange={(e) => setRole(e.target.value as (typeof ASSIGNABLE)[number])}
                className="w-full rounded-lg border border-[var(--brand-border)] bg-white px-3 py-2 text-sm outline-none focus:border-[var(--brand-navy)]"
              >
                {ASSIGNABLE.map((r) => (
                  <option key={r} value={r}>
                    {ROLE_LABEL[r]}
                  </option>
                ))}
              </select>
            </label>
            <button
              type="submit"
              disabled={busy}
              className="rounded-lg bg-[var(--brand-navy)] px-4 py-2 text-sm font-semibold text-white transition-opacity hover:opacity-90 disabled:opacity-50"
            >
              {busy ? 'Adding…' : 'Add user'}
            </button>
          </div>

          {/* Team access — admins already see everything, so only offer for others */}
          {!isAdmin(role) && (
            <div>
              <span className="mb-1.5 block text-sm font-medium text-[var(--brand-ink)]">Team access</span>
              <AccessControl
                teams={teams}
                allTeams={newAllTeams}
                teamIds={newTeamIds}
                onChange={(a, ids) => {
                  setNewAllTeams(a)
                  setNewTeamIds(ids)
                }}
              />
            </div>
          )}
        </form>
        {error && <p className="mt-3 text-sm text-red-600">{error}</p>}
        {created && (
          <div className="mt-4 rounded-lg border border-[var(--brand-border)] bg-[var(--brand-bg)] p-4 text-sm">
            <p className="font-medium text-[var(--brand-navy)]">✓ {created.email} added.</p>
            {created.tempPassword ? (
              <div className="mt-2">
                <p className="text-[var(--brand-muted)]">
                  Share this one-time password with them — they can change it after signing in:
                </p>
                <div className="mt-2 flex items-center gap-2">
                  <code className="rounded bg-white px-2 py-1 font-mono text-[var(--brand-ink)] ring-1 ring-[var(--brand-border)]">
                    {created.tempPassword}
                  </code>
                  <button
                    onClick={() => created.tempPassword && copyTemp(created.tempPassword)}
                    className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-[var(--brand-navy)] hover:bg-white"
                  >
                    {copied ? <Check size={14} /> : <Copy size={14} />}
                    {copied ? 'Copied' : 'Copy'}
                  </button>
                </div>
              </div>
            ) : (
              <p className="mt-1 text-[var(--brand-muted)]">
                They already had a PlayScout login — it&apos;s now attached to your organization.
              </p>
            )}
          </div>
        )}
      </div>

      {/* Members */}
      <div className="glass-card overflow-hidden">
        <div className="border-b border-[var(--brand-border)] px-5 py-3">
          <h2 className="font-semibold text-[var(--brand-navy)]">
            Members <span className="text-[var(--brand-muted)]">({members.length})</span>
          </h2>
        </div>
        <div className="divide-y divide-[var(--brand-border)]">
          {members.map((m) => {
            const memberIsAdmin = isAdmin(m.role)
            const open = expanded === m.userId
            return (
              <div key={m.userId} className="px-5 py-3">
                <div className="flex flex-wrap items-center gap-3">
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-medium text-[var(--brand-ink)]">
                      {m.email}
                      {m.isSelf && <span className="ml-2 text-xs text-[var(--brand-muted)]">(you)</span>}
                    </p>
                    <p className="text-xs text-[var(--brand-muted)]">{summary(m)}</p>
                  </div>

                  {m.role === 'owner' || m.isSelf || !canManage ? (
                    <span className="inline-flex items-center gap-1 rounded-full bg-[var(--brand-bg)] px-3 py-1 text-xs font-semibold text-[var(--brand-navy)]">
                      {m.role === 'owner' && <ShieldCheck size={13} />}
                      {ROLE_LABEL[m.role] ?? m.role}
                    </span>
                  ) : (
                    <select
                      value={m.role}
                      onChange={(e) => changeRole(m.userId, e.target.value)}
                      className="rounded-lg border border-[var(--brand-border)] bg-white px-2 py-1 text-sm outline-none focus:border-[var(--brand-navy)]"
                    >
                      {ASSIGNABLE.map((r) => (
                        <option key={r} value={r}>
                          {ROLE_LABEL[r]}
                        </option>
                      ))}
                    </select>
                  )}

                  {canManage && !memberIsAdmin && (
                    <button
                      onClick={() => setExpanded(open ? null : m.userId)}
                      className="inline-flex items-center gap-1 rounded-lg border border-[var(--brand-border)] px-2.5 py-1 text-xs font-medium text-[var(--brand-navy)] hover:bg-[var(--brand-bg)]"
                    >
                      Teams
                      <ChevronDown size={13} className={open ? 'rotate-180 transition-transform' : 'transition-transform'} />
                    </button>
                  )}

                  {canManage && !m.isSelf && m.role !== 'owner' && (
                    <button
                      onClick={() => removeUser(m.userId, m.email)}
                      className="rounded-md p-2 text-[var(--brand-muted)] hover:bg-red-50 hover:text-red-600"
                      aria-label={`Remove ${m.email}`}
                    >
                      <Trash2 size={16} />
                    </button>
                  )}
                </div>

                {open && canManage && !memberIsAdmin && (
                  <div className="mt-3 rounded-lg bg-[var(--brand-bg)] p-3">
                    <p className="mb-2 text-xs font-medium text-[var(--brand-ink)]">
                      Which teams can {m.email} access?
                    </p>
                    <AccessControl
                      teams={teams}
                      allTeams={m.allTeams}
                      teamIds={m.teamIds}
                      onChange={(a, ids) => updateAccess(m, a, ids)}
                    />
                  </div>
                )}
              </div>
            )
          })}
          {members.length === 0 && !loadError && (
            <p className="px-5 py-6 text-sm text-[var(--brand-muted)]">No members yet.</p>
          )}
        </div>
      </div>
    </div>
  )
}
