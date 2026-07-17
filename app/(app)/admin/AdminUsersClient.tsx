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

export default function AdminUsersClient({
  initialMembers,
  teams,
  currentUserId,
  currentUserRole,
  loadError,
}: {
  initialMembers: Member[]
  teams: TeamOption[]
  currentUserId: string
  currentUserRole: string
  loadError: string | null
}) {
  const [members, setMembers] = useState<Member[]>(initialMembers)
  const [email, setEmail] = useState('')
  const [role, setRole] = useState<(typeof ASSIGNABLE)[number]>('coach')
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

  async function saveTeamAccess(userId: string, teamIds: string[]) {
    const res = await fetch('/api/admin/team-access', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ userId, teamIds }),
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
      // Assign selected teams (only meaningful for non-admin roles).
      if (!isAdmin(role) && newTeamIds.length && data.userId) {
        await saveTeamAccess(data.userId, newTeamIds)
      }
      setCreated({ email: data.email, tempPassword: data.tempPassword })
      setEmail('')
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

  async function toggleTeam(m: Member, teamId: string) {
    const has = m.teamIds.includes(teamId)
    const next = has ? m.teamIds.filter((t) => t !== teamId) : [...m.teamIds, teamId]
    setMembers((list) => list.map((x) => (x.userId === m.userId ? { ...x, teamIds: next } : x)))
    const ok = await saveTeamAccess(m.userId, next)
    if (!ok) {
      // revert
      setMembers((list) => list.map((x) => (x.userId === m.userId ? { ...x, teamIds: m.teamIds } : x)))
    }
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

  function TeamPicker({
    selected,
    onToggle,
  }: {
    selected: string[]
    onToggle: (id: string) => void
  }) {
    if (teams.length === 0) {
      return <p className="text-xs text-[var(--brand-muted)]">No teams yet. Teams a user creates will appear here.</p>
    }
    return (
      <div className="flex flex-wrap gap-2">
        {teams.map((t) => {
          const on = selected.includes(t.id)
          return (
            <button
              key={t.id}
              type="button"
              onClick={() => onToggle(t.id)}
              className={
                'rounded-full border px-3 py-1 text-xs font-medium transition-colors ' +
                (on
                  ? 'border-[var(--brand-navy)] bg-[var(--brand-navy)] text-white'
                  : 'border-[var(--brand-border)] bg-white text-[var(--brand-ink)] hover:border-[var(--brand-navy)]')
              }
            >
              {on ? '✓ ' : ''}
              {t.name}
            </button>
          )
        })}
      </div>
    )
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

          {/* Team access — admins see everything, so only offer this for others */}
          {!isAdmin(role) && (
            <div>
              <span className="mb-1.5 block text-sm font-medium text-[var(--brand-ink)]">Team access</span>
              <TeamPicker
                selected={newTeamIds}
                onToggle={(id) =>
                  setNewTeamIds((ids) => (ids.includes(id) ? ids.filter((x) => x !== id) : [...ids, id]))
                }
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
                    <p className="text-xs text-[var(--brand-muted)]">
                      {memberIsAdmin
                        ? 'Access to all teams'
                        : m.teamIds.length
                          ? `${m.teamIds.length} team${m.teamIds.length > 1 ? 's' : ''}: ${m.teamIds.map(teamName).join(', ')}`
                          : 'No teams assigned'}
                    </p>
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
                    <TeamPicker selected={m.teamIds} onToggle={(id) => toggleTeam(m, id)} />
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
