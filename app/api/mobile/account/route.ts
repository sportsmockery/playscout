import { NextResponse } from 'next/server'
import { authenticateMobile, mobileError } from '@/lib/mobile/auth'
import { createAdminClient } from '@/lib/supabase/admin'

export const runtime = 'nodejs'

/**
 * DELETE /api/mobile/account — permanent account deletion (App Store / Play
 * Store requirement).
 *
 * The caller is verified via their own session (authenticateMobile). We only
 * ever delete the authenticated user's OWN id — the id comes from the verified
 * token, never from the request body — so the service-role admin client cannot
 * be steered at another account. Push tokens are removed first; the auth user
 * delete cascades org membership, team assignments, and other user-owned rows.
 */
export async function DELETE(req: Request) {
  const auth = await authenticateMobile(req)
  if (auth.error) return auth.error
  const { supabase, userId } = auth.ok

  // Best-effort: drop this user's push tokens under their own RLS first.
  await supabase.from('push_tokens').delete().eq('user_id', userId)

  let admin
  try {
    admin = createAdminClient()
  } catch {
    return mobileError('Account deletion is not available right now.', 503)
  }

  const { error } = await admin.auth.admin.deleteUser(userId)
  if (error) return mobileError('Could not delete your account. Please contact support.', 500)

  return NextResponse.json({ ok: true })
}
