import { NextResponse } from 'next/server'
import { z } from 'zod'
import { authenticateMobile, mobileError } from '@/lib/mobile/auth'

export const runtime = 'nodejs'

const RegisterSchema = z.object({
  token: z.string().min(1).max(512),
  platform: z.enum(['ios', 'android']),
  deviceName: z.string().max(120).optional(),
})

/**
 * POST /api/mobile/push-tokens — register/refresh this device's push token.
 * Idempotent upsert on (user_id, token); RLS ensures a user only writes rows
 * they own. A token grants no data access — delivery re-checks team access.
 */
export async function POST(req: Request) {
  const auth = await authenticateMobile(req)
  if (auth.error) return auth.error
  const { supabase, userId } = auth.ok

  let body: unknown
  try {
    body = await req.json()
  } catch {
    return mobileError('Invalid request body.', 400)
  }
  const parsed = RegisterSchema.safeParse(body)
  if (!parsed.success) return mobileError('Invalid push token payload.', 400)

  const { error } = await supabase.from('push_tokens').upsert(
    {
      user_id: userId,
      token: parsed.data.token,
      platform: parsed.data.platform,
      device_name: parsed.data.deviceName ?? null,
      last_seen_at: new Date().toISOString(),
    },
    { onConflict: 'user_id,token' },
  )
  if (error) return mobileError('Could not register push token.', 500)
  return NextResponse.json({ ok: true })
}

const DeleteSchema = z.object({ token: z.string().min(1).max(512) })

/**
 * DELETE /api/mobile/push-tokens — remove this device's token on sign-out.
 */
export async function DELETE(req: Request) {
  const auth = await authenticateMobile(req)
  if (auth.error) return auth.error
  const { supabase, userId } = auth.ok

  let body: unknown
  try {
    body = await req.json()
  } catch {
    return mobileError('Invalid request body.', 400)
  }
  const parsed = DeleteSchema.safeParse(body)
  if (!parsed.success) return mobileError('A token is required.', 400)

  const { error } = await supabase
    .from('push_tokens')
    .delete()
    .eq('user_id', userId)
    .eq('token', parsed.data.token)
  if (error) return mobileError('Could not remove push token.', 500)
  return NextResponse.json({ ok: true })
}
