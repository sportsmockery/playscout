import { describe, it, expect } from 'vitest'
import { normalizeHudlSessionPaste } from './hudl-session-paste'

const FAR_FUTURE = Math.floor(Date.now() / 1000) + 60 * 60 * 24 * 30
const PAST = Math.floor(Date.now() / 1000) - 60

/** What a cookie-editor extension actually exports. */
function chromeCookie(over: Record<string, unknown> = {}) {
  return {
    domain: '.hudl.com',
    expirationDate: FAR_FUTURE,
    hostOnly: false,
    httpOnly: true,
    name: 'hudl-session',
    path: '/',
    sameSite: 'no_restriction',
    secure: true,
    session: false,
    storeId: '0',
    value: 'abc123',
    ...over,
  }
}

function parse(result: ReturnType<typeof normalizeHudlSessionPaste>) {
  if (!result.ok) throw new Error(`expected ok, got: ${result.reason}`)
  return JSON.parse(result.storageState) as {
    cookies: Record<string, unknown>[]
    origins: unknown[]
  }
}

describe('normalizeHudlSessionPaste', () => {
  it('reads a bare cookie-editor export', () => {
    const result = normalizeHudlSessionPaste(JSON.stringify([chromeCookie()]))
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.cookieCount).toBe(1)
    expect(parse(result).cookies[0]).toMatchObject({
      name: 'hudl-session',
      value: 'abc123',
      domain: '.hudl.com',
      path: '/',
      httpOnly: true,
      secure: true,
    })
  })

  it('reads a Playwright storageState straight back', () => {
    const state = {
      cookies: [
        {
          name: 'sess',
          value: 'v',
          domain: 'www.hudl.com',
          path: '/',
          expires: FAR_FUTURE,
          httpOnly: true,
          secure: true,
          sameSite: 'Lax',
        },
      ],
      origins: [],
    }
    const result = normalizeHudlSessionPaste(JSON.stringify(state))
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.cookieCount).toBe(1)
  })

  // The field names are where a paste silently half-works: a cookie carried
  // over with the wrong sameSite or no expiry is a session that dies early.
  it('maps expirationDate to expires and no_restriction to None', () => {
    const result = normalizeHudlSessionPaste(JSON.stringify([chromeCookie()]))
    const cookie = parse(result).cookies[0]
    expect(cookie.expires).toBe(FAR_FUTURE)
    expect(cookie.sameSite).toBe('None')
  })

  it('treats an unspecified sameSite as Lax, the browser default', () => {
    const result = normalizeHudlSessionPaste(
      JSON.stringify([chromeCookie({ sameSite: 'unspecified' })])
    )
    expect(parse(result).cookies[0].sameSite).toBe('Lax')
  })

  it('marks a cookie with no expiry as a session cookie rather than expired', () => {
    const result = normalizeHudlSessionPaste(
      JSON.stringify([chromeCookie({ expirationDate: undefined, session: true })])
    )
    expect(result.ok).toBe(true)
    expect(parse(result).cookies[0].expires).toBe(-1)
  })

  // The whole-browser paste. Keeping these would mean presenting a coach's
  // other sites' cookies to whatever host Hudl redirects a download to.
  it('drops every cookie that is not from hudl.com', () => {
    const result = normalizeHudlSessionPaste(
      JSON.stringify([
        chromeCookie(),
        chromeCookie({ domain: '.google.com', name: 'SID' }),
        chromeCookie({ domain: 'mybank.example', name: 'auth' }),
      ])
    )
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.cookieCount).toBe(1)
    expect(result.droppedCount).toBe(2)
    expect(parse(result).cookies.every((c) => String(c.domain).includes('hudl.com'))).toBe(true)
  })

  it('does not mistake a lookalike domain for Hudl', () => {
    const result = normalizeHudlSessionPaste(
      JSON.stringify([chromeCookie({ domain: 'nothudl.com' })])
    )
    expect(result.ok).toBe(false)
  })

  it('refuses an export with no Hudl cookies in it', () => {
    const result = normalizeHudlSessionPaste(JSON.stringify([chromeCookie({ domain: '.google.com' })]))
    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.reason).toMatch(/hudl\.com/i)
  })

  it('refuses an export whose Hudl cookies have all expired', () => {
    const result = normalizeHudlSessionPaste(
      JSON.stringify([chromeCookie({ expirationDate: PAST })])
    )
    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.reason).toMatch(/expired/i)
  })

  it('keeps the live cookies when only some have expired', () => {
    const result = normalizeHudlSessionPaste(
      JSON.stringify([
        chromeCookie({ name: 'stale', expirationDate: PAST }),
        chromeCookie({ name: 'live' }),
      ])
    )
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.cookieCount).toBe(1)
    expect(parse(result).cookies[0].name).toBe('live')
  })

  // A document.cookie copy is missing precisely the HttpOnly cookies that
  // carry the sign-in, so accepting it saves cleanly and fails every import.
  it('refuses a copied document.cookie string by name', () => {
    const result = normalizeHudlSessionPaste('hudl-session=abc123; other=1')
    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.reason).toMatch(/hidden from the page/i)
  })

  it('refuses invalid JSON', () => {
    const result = normalizeHudlSessionPaste('{not json')
    expect(result.ok).toBe(false)
  })

  it('refuses an empty paste', () => {
    expect(normalizeHudlSessionPaste('   ').ok).toBe(false)
  })

  it('refuses a paste with no cookie list in it', () => {
    const result = normalizeHudlSessionPaste(JSON.stringify({ origins: [] }))
    expect(result.ok).toBe(false)
  })

  it('reports the earliest live expiry, ignoring session cookies', () => {
    const sooner = FAR_FUTURE - 60 * 60 * 24 * 10
    const result = normalizeHudlSessionPaste(
      JSON.stringify([
        chromeCookie({ name: 'a' }),
        chromeCookie({ name: 'b', expirationDate: sooner }),
        chromeCookie({ name: 'c', expirationDate: undefined }),
      ])
    )
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.expiresAt?.getTime()).toBe(sooner * 1000)
  })

  // Never a cookie value, in any branch. These strings reach a screen.
  it('never echoes a cookie value back in a rejection', () => {
    const result = normalizeHudlSessionPaste(
      JSON.stringify([chromeCookie({ domain: '.google.com', value: 'SUPER_SECRET_TOKEN' })])
    )
    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.reason).not.toContain('SUPER_SECRET_TOKEN')
  })
})
