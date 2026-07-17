'use client'

import { useState } from 'react'
import { UserPlus, Copy, Check, Trash2, ShieldCheck } from 'lucide-react'

export interface Member {
  userId: string
  role: string
  email: string
  lastSignInAt: string | null
  isSelf: boolean
}

const ASSIGNABLE = ['admin', 'coach', 'analyst', 'viewer'] as const
const ROLE_LABEL: Record<string, string> = {
  owner: 'Owner',
  admin: 'Admin',
  coach: 'Coach',
  analyst: 'Analyst',
  viewer: 'Viewer',
}

export default function AdminUsersClient({
  initialMembers,
  currentUserId,
  currentUserRole,
  loadError,
}: {
  initialMembers: Member[]
  currentUserId: string
  currentUserRole: string
  loadError: string | null
}) {
  const [members, setMembers] = useState<Member[]>(initialMembers)
  const [email, setEmail] = useState('')
  const [role, setRole] = useState<(typeof ASSIGNABLE)[number]>('coach')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [created, setCreated] = useState<{ email: string; tempPassword: string | null } | null>(null)
  const [copied, setCopied] = useState(false)

  async function refresh() {
    const res = await fetch('/api/admin/members')
    if (res.ok) setMembers((await res.json()).members)
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
      setCreated({ email: data.email, tempPassword: data.tempPassword })
      setEmail('')
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

  function copyTemp() {
    if (!created?.tempPassword) return
    navigator.clipboard.writeText(created.tempPassword)
    setCopied(true)
    setTimeout(() => setCopied(false), 1500)
  }

  const canManage = currentUserRole === 'owner' || currentUserRole === 'admin'

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
        <form onSubmit={addUser} className="flex flex-col gap-3 sm:flex-row sm:items-end">
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
                    onClick={copyTemp}
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
          {members.map((m) => (
            <div key={m.userId} className="flex flex-wrap items-center gap-3 px-5 py-3">
              <div className="min-w-0 flex-1">
                <p className="truncate font-medium text-[var(--brand-ink)]">
                  {m.email}
                  {m.isSelf && <span className="ml-2 text-xs text-[var(--brand-muted)]">(you)</span>}
                </p>
                <p className="text-xs text-[var(--brand-muted)]">
                  {m.lastSignInAt ? `Last sign-in ${new Date(m.lastSignInAt).toLocaleDateString()}` : 'Not signed in yet'}
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
          ))}
          {members.length === 0 && !loadError && (
            <p className="px-5 py-6 text-sm text-[var(--brand-muted)]">No members yet.</p>
          )}
        </div>
      </div>
    </div>
  )
}
