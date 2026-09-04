/**
 * Signs in to Hudl as the coach, and nothing else.
 *
 * Hudl publishes no API for pulling your own cut-ups, so this drives their web
 * app in a headless browser. That means it reads live markup and can break on
 * any redesign — the breakdown-paste path stays as the fallback for when it
 * does.
 *
 * Handling rules, here because they are easy to violate later:
 *
 *   - A credential is NEVER logged, never written to `error_message`, never
 *     put in a thrown message, and never sent to a model. Errors carry a
 *     `coachMessage` written for a person; that is the only string that is
 *     allowed to reach a database row or a screen.
 *   - The browser context is disposed per job. No persistent profile is left
 *     on disk, so a compromised worker filesystem holds no live session.
 *   - The session is cached (sealed) so the password is used rarely rather
 *     than on every job. Logging in fifty times an hour is how an account gets
 *     flagged.
 *
 * The parts of this file that can be tested without a Hudl account are the
 * classifiers at the top. Everything below `openHudlSession` depends on their
 * live markup, and the first real run is where it gets proven.
 */
import { chromium, type Browser, type BrowserContext, type Page } from 'playwright'
import type { SupabaseClient } from '@supabase/supabase-js'
import { open, seal, secretBoxReady } from '../../lib/crypto/secret-box'

export type HudlFailure =
  | 'not_connected'
  | 'encryption_unavailable'
  | 'invalid_credentials'
  | 'challenge_required'
  | 'login_failed'

/**
 * A login failure with something a coach can act on.
 *
 * `message` is for logs and carries no secret; `coachMessage` is what the UI
 * and the credential row show. Both are written by hand — a raw Playwright
 * error is never surfaced, because its messages embed the URL it was on and
 * Hudl's URLs carry session tokens.
 */
export class HudlSessionError extends Error {
  readonly failure: HudlFailure
  readonly coachMessage: string

  constructor(failure: HudlFailure, coachMessage: string) {
    super(`hudl session failed: ${failure}`)
    this.name = 'HudlSessionError'
    this.failure = failure
    this.coachMessage = coachMessage
  }
}

// ---------------------------------------------------------------------------
// Classifiers — pure, and the only part of this file that is unit-testable.
// ---------------------------------------------------------------------------

/** Hudl's sign-in lives on its own identity host, and has moved before. */
const LOGIN_URL_MARKERS = ['identity.hudl.com', '/login', '/signin', '/sign-in', '/auth/']

export function isLoginUrl(url: string): boolean {
  const lower = url.toLowerCase()
  return LOGIN_URL_MARKERS.some((marker) => lower.includes(marker))
}

export type LoginOutcome = 'signed_in' | 'challenge' | 'rejected' | 'unknown'

/**
 * A challenge is checked BEFORE a rejection. Verification screens routinely
 * contain the word "try again", and mistaking "Hudl wants a code" for "your
 * password is wrong" sends the coach off to reset a password that was fine.
 */
const CHALLENGE_MARKERS = [
  'verification code',
  'verify your identity',
  "verify it's you",
  'verify its you',
  'two-factor',
  'two factor',
  'two-step',
  'authenticator',
  'security code',
  'enter the code',
  'we sent a code',
  "didn't recognize",
  "don't recognize this device",
  'captcha',
  'are you a robot',
]

const REJECTION_MARKERS = [
  'incorrect password',
  'password is incorrect',
  'invalid email or password',
  'email or password is incorrect',
  "couldn't find an account",
  'could not find an account',
  'no account found',
  'account has been locked',
  'too many attempts',
]

/**
 * Decides what happened after submitting the login form, from the URL we
 * landed on and the visible page text.
 *
 * `unknown` is a real answer and is treated as a failure by the caller. The
 * alternative — assuming success and continuing — produces a job that scrapes
 * a login page into fifty empty clips.
 */
export function classifyLoginPage(url: string, visibleText: string): LoginOutcome {
  const text = visibleText.toLowerCase()

  if (CHALLENGE_MARKERS.some((marker) => text.includes(marker))) return 'challenge'
  if (REJECTION_MARKERS.some((marker) => text.includes(marker))) return 'rejected'
  if (!isLoginUrl(url)) return 'signed_in'
  return 'unknown'
}

/** The coach-facing sentence for each way this can fail. */
export function coachMessageFor(failure: HudlFailure): string {
  switch (failure) {
    case 'not_connected':
      return 'No Hudl account is connected for this team. Add one in team settings.'
    case 'encryption_unavailable':
      return 'Credential encryption is not configured on this deployment, so the saved Hudl login cannot be read.'
    case 'invalid_credentials':
      return 'Hudl rejected that email and password. Re-enter them in team settings.'
    case 'challenge_required':
      return 'Hudl is asking you to verify this sign-in. Sign in to Hudl once in your own browser, then try again.'
    case 'login_failed':
      return 'PlayScout could not sign in to Hudl. Their sign-in page may have changed — the breakdown paste still works in the meantime.'
  }
}

// ---------------------------------------------------------------------------
// Credentials
// ---------------------------------------------------------------------------

export interface HudlCredentials {
  email: string
  password: string
  /** Playwright storage state from the last successful login, if any. */
  storageState: string | null
}

interface CredentialRow {
  hudl_email: string
  sealed_password: string
  sealed_session: string | null
}

/**
 * Reads and unseals a team's Hudl login. Service role only — the table has no
 * SELECT policy for any client role, by design.
 */
export async function loadHudlCredentials(
  supabase: SupabaseClient,
  teamId: string
): Promise<HudlCredentials> {
  if (!secretBoxReady()) {
    throw new HudlSessionError('encryption_unavailable', coachMessageFor('encryption_unavailable'))
  }

  const { data } = await supabase
    .from('hudl_credentials')
    .select('hudl_email, sealed_password, sealed_session')
    .eq('team_id', teamId)
    .maybeSingle<CredentialRow>()

  if (!data) throw new HudlSessionError('not_connected', coachMessageFor('not_connected'))

  let password: string
  try {
    password = open(data.sealed_password)
  } catch {
    // Sealed with a key this deployment no longer has. Treat it as "reconnect",
    // not as a crash: the coach's fix is the same either way.
    throw new HudlSessionError('encryption_unavailable', coachMessageFor('encryption_unavailable'))
  }

  let storageState: string | null = null
  if (data.sealed_session) {
    // A session that will not unseal is not fatal — we just log in again.
    try {
      storageState = open(data.sealed_session)
    } catch {
      storageState = null
    }
  }

  return { email: data.hudl_email, password, storageState }
}

/**
 * Persists the session so the next job skips the login entirely.
 *
 * `session_expires_at` is stored for display only. It is the earliest cookie
 * expiry we were given, and Hudl can invalidate a session long before that, so
 * nothing in this file trusts it — every run probes instead.
 */
export async function saveHudlSession(
  supabase: SupabaseClient,
  teamId: string,
  storageState: string,
  expiresAt: Date | null
): Promise<void> {
  await supabase
    .from('hudl_credentials')
    .update({
      sealed_session: seal(storageState),
      session_expires_at: expiresAt?.toISOString() ?? null,
      last_verified_at: new Date().toISOString(),
      last_error: null,
      updated_at: new Date().toISOString(),
    })
    .eq('team_id', teamId)
}

/** Records why a run could not sign in, in words written for a coach. */
export async function recordHudlError(
  supabase: SupabaseClient,
  teamId: string,
  coachMessage: string
): Promise<void> {
  await supabase
    .from('hudl_credentials')
    .update({ last_error: coachMessage, updated_at: new Date().toISOString() })
    .eq('team_id', teamId)
}

/**
 * Earliest expiry among the stored cookies, for display. Session cookies (no
 * expiry, or a negative sentinel) are skipped.
 */
export function earliestCookieExpiry(storageState: string): Date | null {
  let parsed: { cookies?: { expires?: number }[] }
  try {
    parsed = JSON.parse(storageState)
  } catch {
    return null
  }
  const now = Date.now() / 1000
  const future = (parsed.cookies ?? [])
    .map((c) => c.expires ?? -1)
    .filter((expires) => expires > now)
  if (!future.length) return null
  return new Date(Math.min(...future) * 1000)
}

// ---------------------------------------------------------------------------
// The browser
// ---------------------------------------------------------------------------

const HUDL_HOME = 'https://www.hudl.com/home'
const HUDL_LOGIN = 'https://www.hudl.com/login'
const NAV_TIMEOUT_MS = Number(process.env.HUDL_NAV_TIMEOUT_MS ?? 45_000)

/**
 * Selector candidates, most specific first. Hudl has changed these before and
 * will again; a list costs nothing and turns a redesign into "the second
 * selector matched" instead of a failed import.
 */
const EMAIL_SELECTORS = [
  'input[name="username"]',
  'input[type="email"]',
  'input[name="email"]',
  '#email',
]
const PASSWORD_SELECTORS = ['input[name="password"]', 'input[type="password"]', '#password']
const SUBMIT_SELECTORS = [
  'button[type="submit"]',
  'button[data-qa-id="log-in"]',
  'input[type="submit"]',
]

export interface HudlSession {
  page: Page
  context: BrowserContext
  /** Seals and stores the current session so the next job can skip the login. */
  persist(): Promise<void>
  /** Always call this — there is no persistent profile, so nothing survives it. */
  dispose(): Promise<void>
}

async function fillFirst(page: Page, selectors: string[], value: string): Promise<boolean> {
  for (const selector of selectors) {
    const field = page.locator(selector).first()
    if ((await field.count()) === 0) continue
    // `fill` is used rather than `type` so the value never appears in a
    // keystroke-level trace if tracing is ever turned on for debugging.
    await field.fill(value)
    return true
  }
  return false
}

async function clickFirst(page: Page, selectors: string[]): Promise<boolean> {
  for (const selector of selectors) {
    const button = page.locator(selector).first()
    if ((await button.count()) === 0) continue
    await button.click()
    return true
  }
  return false
}

async function visibleText(page: Page): Promise<string> {
  try {
    return (await page.locator('body').innerText({ timeout: 5_000 })) ?? ''
  } catch {
    return ''
  }
}

/** True when the restored cookies still get us to a signed-in page. */
async function sessionIsLive(page: Page): Promise<boolean> {
  try {
    await page.goto(HUDL_HOME, { waitUntil: 'domcontentloaded', timeout: NAV_TIMEOUT_MS })
  } catch {
    return false
  }
  return !isLoginUrl(page.url())
}

async function signIn(page: Page, email: string, password: string): Promise<void> {
  await page.goto(HUDL_LOGIN, { waitUntil: 'domcontentloaded', timeout: NAV_TIMEOUT_MS })

  if (!(await fillFirst(page, EMAIL_SELECTORS, email))) {
    throw new HudlSessionError('login_failed', coachMessageFor('login_failed'))
  }

  // Hudl has used both a single form and an email-then-password two-step. If
  // no password field is present yet, advancing the form is what reveals it.
  if (!(await fillFirst(page, PASSWORD_SELECTORS, password))) {
    await clickFirst(page, SUBMIT_SELECTORS)
    await page.waitForLoadState('domcontentloaded', { timeout: NAV_TIMEOUT_MS }).catch(() => {})
    if (!(await fillFirst(page, PASSWORD_SELECTORS, password))) {
      // Could be a challenge sitting between the two steps rather than a
      // markup change, so classify before blaming the selectors.
      const outcome = classifyLoginPage(page.url(), await visibleText(page))
      if (outcome === 'challenge') {
        throw new HudlSessionError('challenge_required', coachMessageFor('challenge_required'))
      }
      throw new HudlSessionError('login_failed', coachMessageFor('login_failed'))
    }
  }

  if (!(await clickFirst(page, SUBMIT_SELECTORS))) {
    throw new HudlSessionError('login_failed', coachMessageFor('login_failed'))
  }

  // The redirect after a successful login is several hops; waiting for the
  // network to settle is more reliable than waiting for any one URL.
  await page.waitForLoadState('networkidle', { timeout: NAV_TIMEOUT_MS }).catch(() => {})

  const outcome = classifyLoginPage(page.url(), await visibleText(page))
  if (outcome === 'signed_in') return
  if (outcome === 'challenge') {
    throw new HudlSessionError('challenge_required', coachMessageFor('challenge_required'))
  }
  if (outcome === 'rejected') {
    throw new HudlSessionError('invalid_credentials', coachMessageFor('invalid_credentials'))
  }
  // 'unknown' — still on a login URL with nothing recognisable said about why.
  // Failing here is deliberate: continuing would scrape the login page.
  throw new HudlSessionError('login_failed', coachMessageFor('login_failed'))
}

/**
 * Opens a signed-in Hudl browser session for a team.
 *
 * Reuses the cached session when it is still live and spends a login only when
 * it is not. The caller must always `dispose()`, and should call `persist()`
 * after a successful run so the next job starts from a live session.
 */
export async function openHudlSession(
  supabase: SupabaseClient,
  teamId: string
): Promise<HudlSession> {
  const credentials = await loadHudlCredentials(supabase, teamId)

  let browser: Browser | null = null
  let context: BrowserContext | null = null

  const dispose = async () => {
    await context?.close().catch(() => {})
    await browser?.close().catch(() => {})
  }

  try {
    browser = await chromium.launch({
      headless: true,
      executablePath: process.env.PLAYWRIGHT_CHROMIUM_PATH || undefined,
      // Containers give a small /dev/shm; without this Chromium crashes part
      // way through a long session rather than at launch, which reads as a
      // Hudl problem when it is not one.
      args: ['--disable-dev-shm-usage'],
    })

    context = await browser.newContext({
      // A default headless UA is the fastest way to look like a scraper.
      userAgent:
        process.env.HUDL_USER_AGENT ??
        'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Safari/537.36',
      viewport: { width: 1440, height: 900 },
      storageState: credentials.storageState ? JSON.parse(credentials.storageState) : undefined,
    })
    context.setDefaultTimeout(NAV_TIMEOUT_MS)

    const page = await context.newPage()

    if (!credentials.storageState || !(await sessionIsLive(page))) {
      await signIn(page, credentials.email, credentials.password)
    }

    const boundContext = context
    return {
      page,
      context: boundContext,
      persist: async () => {
        const state = JSON.stringify(await boundContext.storageState())
        await saveHudlSession(supabase, teamId, state, earliestCookieExpiry(state))
      },
      dispose,
    }
  } catch (error) {
    await dispose()
    if (error instanceof HudlSessionError) {
      await recordHudlError(supabase, teamId, error.coachMessage)
      throw error
    }
    // Anything else — a Playwright timeout, a launch failure — is reduced to a
    // coach-readable message here. Playwright's own messages quote the URL it
    // was on, and Hudl's URLs carry session tokens.
    await recordHudlError(supabase, teamId, coachMessageFor('login_failed'))
    throw new HudlSessionError('login_failed', coachMessageFor('login_failed'))
  }
}
