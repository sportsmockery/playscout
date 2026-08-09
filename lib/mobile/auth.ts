import 'server-only'
import { NextResponse } from 'next/server'
import type { SupabaseClient } from '@supabase/supabase-js'
import { createClientForRequest } from '@/lib/supabase/request'

/**
 * Shared entry point for /api/mobile/* aggregation endpoints.
 *
 * Builds one request-scoped Supabase client (cookie OR bearer token) and
 * verifies the user via auth.getUser(). The returned `supabase` is passed to
 * requireTeamMember(..., { supabase }) and reused for every query in the
 * request, so a single authenticated client governs the whole handler — the
 * same RLS and membership checks as the web app, never a weaker path.
 */
export interface MobileAuth {
  supabase: SupabaseClient
  userId: string
  email?: string
}

export async function authenticateMobile(
  req: Request,
): Promise<{ error: NextResponse; ok?: undefined } | { ok: MobileAuth; error?: undefined }> {
  const supabase = await createClientForRequest(req)
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) {
    return { error: NextResponse.json({ error: 'Not authenticated' }, { status: 401 }) }
  }
  return { ok: { supabase, userId: user.id, email: user.email ?? undefined } }
}

/** Stable error envelope shared by mobile endpoints. Never leaks stack traces. */
export function mobileError(message: string, status: number): NextResponse {
  return NextResponse.json({ error: message }, { status })
}
