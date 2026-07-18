import Link from 'next/link'
import { redirect } from 'next/navigation'
import { Shield, ChevronRight } from 'lucide-react'
import { getCurrentMembership, isAdminRole, ROLE_LABELS, ROLE_DESCRIPTIONS, type AppRole } from '@/lib/auth/roles'
import SignOutButton from './SignOutButton'

export const metadata = { title: 'Settings' }
export const dynamic = 'force-dynamic'

export default async function SettingsPage() {
  const { user, membership } = await getCurrentMembership()
  if (!user) redirect('/login')

  const role = (membership?.role ?? null) as AppRole | null
  const admin = isAdminRole(role)

  return (
    <div className="mx-auto max-w-2xl px-4 py-8 sm:px-6 lg:px-8">
      <h1 className="text-2xl font-bold text-[var(--brand-navy)]">Settings</h1>
      <p className="mt-1 text-sm text-[var(--brand-muted)]">Your account and organization.</p>

      <div className="mt-6 space-y-4">
        {/* Profile */}
        <section className="glass-card p-5">
          <h2 className="mb-3 font-semibold text-[var(--brand-navy)]">Profile</h2>
          <dl className="space-y-2 text-sm">
            <div className="flex justify-between gap-4">
              <dt className="text-[var(--brand-muted)]">Email</dt>
              <dd className="font-medium text-[var(--brand-ink)]">{user.email ?? '—'}</dd>
            </div>
            <div className="flex justify-between gap-4">
              <dt className="text-[var(--brand-muted)]">Organization</dt>
              <dd className="font-medium text-[var(--brand-ink)]">
                {membership?.organizations?.name ?? 'No organization yet'}
              </dd>
            </div>
            <div className="flex justify-between gap-4">
              <dt className="text-[var(--brand-muted)]">Role</dt>
              <dd className="font-medium text-[var(--brand-ink)]">
                {role ? ROLE_LABELS[role] : '—'}
              </dd>
            </div>
          </dl>
          {role && (
            <p className="mt-3 text-xs text-[var(--brand-muted)]">{ROLE_DESCRIPTIONS[role]}</p>
          )}
        </section>

        {/* Admin entry — only for owners/admins */}
        {admin && (
          <Link
            href="/admin"
            className="glass-card flex items-center gap-3 p-5 transition-colors hover:bg-white/60"
          >
            <span className="flex h-10 w-10 items-center justify-center rounded-lg bg-[var(--brand-navy)]/10 text-[var(--brand-navy)]">
              <Shield size={20} />
            </span>
            <span className="flex-1">
              <span className="block font-semibold text-[var(--brand-navy)]">Users &amp; Roles</span>
              <span className="block text-sm text-[var(--brand-muted)]">Add users and manage who can access what.</span>
            </span>
            <ChevronRight size={18} className="text-[var(--brand-muted)]" />
          </Link>
        )}

        {/* Session */}
        <section className="glass-card p-5">
          <h2 className="mb-3 font-semibold text-[var(--brand-navy)]">Session</h2>
          <SignOutButton />
        </section>
      </div>
    </div>
  )
}
