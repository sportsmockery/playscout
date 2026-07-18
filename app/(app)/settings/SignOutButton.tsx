'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { LogOut } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'

export default function SignOutButton() {
  const router = useRouter()
  const [busy, setBusy] = useState(false)

  async function signOut() {
    setBusy(true)
    await createClient().auth.signOut()
    router.push('/login')
    router.refresh()
  }

  return (
    <button
      onClick={signOut}
      disabled={busy}
      className="inline-flex items-center gap-2 rounded-lg border border-[var(--brand-border)] px-4 py-2 text-sm font-semibold text-[var(--brand-ink)] transition-colors hover:bg-[var(--brand-bg)] disabled:opacity-50"
    >
      <LogOut size={16} />
      {busy ? 'Signing out…' : 'Sign out'}
    </button>
  )
}
