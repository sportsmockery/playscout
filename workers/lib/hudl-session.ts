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
import { chromium, type Browser, type BrowserContext, type Locator, type Page } from 'playwright'
import type { SupabaseClient } from '@supabase/supabase-js'
import { open, seal, secretBoxReady } from '../../lib/crypto/secret-box'

export type HudlFailure =
  | 'not_connected'
  | 'encryption_unavailable'
  | 'invalid_credentials'
  | 'challenge_required'
  | 'sso_required'
  | 'session_expired'
  | 'browser_unavailable'
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
  /**
   * Where the sign-in got to, in redacted breadcrumbs.
   *
   * Without this a `login_failed` says nothing about WHICH step broke, and
   * iterating on selectors against a site you cannot see is blind guessing.
   * Paths only — never a query string, never page text.
   */
  readonly diagnostics: string[]

  constructor(failure: HudlFailure, coachMessage: string, diagnostics: string[] = []) {
    super(`hudl session failed: ${failure}`)
    this.name = 'HudlSessionError'
    this.failure = failure
    this.coachMessage = coachMessage
    this.diagnostics = diagnostics
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

export type LoginOutcome = 'signed_in' | 'challenge' | 'rejected' | 'sso' | 'unknown'

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

/**
 * The page is asking us to sign in through an identity provider we cannot
 * drive. Google blocks automated browsers outright, and attempting it would
 * risk the coach's Google account rather than just failing — so this is
 * detected and reported, never worked around.
 */
const SSO_MARKERS = [
  'continue with google',
  'sign in with google',
  'log in with google',
  'accounts.google.com',
  'choose an account',
  'use your google account',
  'continue with apple',
  'single sign-on',
  'sign in with sso',
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
  const lowerUrl = url.toLowerCase()

  // Checked first, and against the URL as well as the text: landing on
  // Google's own domain is unambiguous, and a coach who signs in with Google
  // needs a different instruction from every other failure here.
  if (lowerUrl.includes('accounts.google.com') || lowerUrl.includes('appleid.apple.com')) {
    return 'sso'
  }
  if (CHALLENGE_MARKERS.some((marker) => text.includes(marker))) return 'challenge'
  if (REJECTION_MARKERS.some((marker) => text.includes(marker))) return 'rejected'
  if (!isLoginUrl(url)) return 'signed_in'
  // Only once we know we are still stuck on a login page does an SSO button on
  // it mean anything — Hudl shows "Continue with Google" beside a perfectly
  // usable password form, so its mere presence is not a diagnosis.
  if (SSO_MARKERS.some((marker) => text.includes(marker))) return 'sso'
  return 'unknown'
}

/**
 * Tells a missing browser apart from a real sign-in problem.
 *
 * This distinction is the whole point: Chromium not being installed on the
 * worker produced the message "PlayScout could not sign in to Hudl. Their
 * sign-in page may have changed", which sends a coach to re-check a password
 * that was fine over a deployment problem someone else has to fix. Nothing
 * that fails before a page loads is a sign-in failure.
 */
export function classifyLaunchError(error: unknown): HudlFailure {
  const message = error instanceof Error ? error.message : String(error)
  if (/executable doesn'?t exist|please run the following command to download/i.test(message)) {
    return 'browser_unavailable'
  }
  // Every other launch failure — a missing shared library, no /dev/shm, the
  // sandbox refusing to start — is equally a deployment problem, and equally
  // not something a coach can act on by touching their Hudl account.
  return 'browser_unavailable'
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
    case 'sso_required':
      return 'That Hudl account signs in through Google, which PlayScout cannot do on your behalf. Either paste your Hudl session in team settings instead of a password, or set a Hudl password on the account (Hudl → Account → Password, or use "Forgot password"). Signing in with Google still works for you normally.'
    case 'session_expired':
      return 'The Hudl session you pasted has expired, and this connection has no password to sign in with. Open Hudl in your browser, export the session again, and paste the new one in team settings.'
    case 'browser_unavailable':
      return 'The film import service has no browser installed, so it never reached Hudl. This is a PlayScout deployment problem, not a problem with your Hudl account — nothing needs changing in team settings.'
    case 'login_failed':
      return 'PlayScout could not sign in to Hudl. Their sign-in page may have changed — the breakdown paste still works in the meantime.'
  }
}

// ---------------------------------------------------------------------------
// Credentials
// ---------------------------------------------------------------------------

export interface HudlCredentials {
  email: string
  /**
   * Null for a session-only connection — a Google/SSO account has no Hudl
   * password to give. Everything below must treat "cannot sign in" as a
   * distinct outcome from "sign-in was rejected".
   */
  password: string | null
  /** Playwright storage state from the last successful login, if any. */
  storageState: string | null
}

interface CredentialRow {
  hudl_email: string
  sealed_password: string | null
  sealed_session: string | null
  auth_mode: string | null
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
    .select('hudl_email, sealed_password, sealed_session, auth_mode')
    .eq('team_id', teamId)
    .maybeSingle<CredentialRow>()

  if (!data) throw new HudlSessionError('not_connected', coachMessageFor('not_connected'))

  let password: string | null = null
  if (data.sealed_password) {
    try {
      password = open(data.sealed_password)
    } catch {
      // Sealed with a key this deployment no longer has. Treat it as "reconnect",
      // not as a crash: the coach's fix is the same either way.
      throw new HudlSessionError('encryption_unavailable', coachMessageFor('encryption_unavailable'))
    }
  }

  let storageState: string | null = null
  if (data.sealed_session) {
    // A session that will not unseal is not fatal when there is a password to
    // fall back on — we just log in again. On a session-only connection it is
    // the whole credential, and the check below is what catches that.
    try {
      storageState = open(data.sealed_session)
    } catch {
      storageState = null
    }
  }

  // Neither half usable. The database constraint makes "the row has neither"
  // impossible, so in practice this is a session-only connection whose sealed
  // session was written under a key this deployment no longer has.
  if (!password && !storageState) {
    throw new HudlSessionError('encryption_unavailable', coachMessageFor('encryption_unavailable'))
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

/** How long a login field gets to appear before we call it missing. */
const FIELD_TIMEOUT_MS = Number(process.env.HUDL_FIELD_TIMEOUT_MS ?? 15_000)

/**
 * Waits for any of these selectors to become visible, then returns the match
 * highest in the priority list.
 *
 * The first version checked `count()` the instant the page fired
 * domcontentloaded. Hudl's sign-in is client-rendered, so the form did not
 * exist yet, every selector matched nothing, and a perfectly healthy login
 * page was reported as "PlayScout could not sign in to Hudl". Waiting is the
 * whole fix.
 *
 * The wait is on the selectors COMBINED (so any one of them ends it) but the
 * pick is in list order, because `locator('a, b').first()` resolves in DOM
 * order — which would happily choose the wrong button.
 */
async function firstVisible(
  page: Page,
  selectors: string[],
  timeout = FIELD_TIMEOUT_MS
): Promise<Locator | null> {
  try {
    await page.locator(selectors.join(', ')).first().waitFor({ state: 'visible', timeout })
  } catch {
    return null
  }
  for (const selector of selectors) {
    const candidate = page.locator(selector).first()
    if (await candidate.isVisible().catch(() => false)) return candidate
  }
  return null
}

async function fillFirst(page: Page, selectors: string[], value: string): Promise<boolean> {
  const field = await firstVisible(page, selectors)
  if (!field) return false
  // `fill` is used rather than `type` so the value never appears in a
  // keystroke-level trace if tracing is ever turned on for debugging.
  await field.fill(value)
  return true
}

async function clickFirst(page: Page, selectors: string[]): Promise<boolean> {
  const button = await firstVisible(page, selectors)
  if (!button) return false
  await button.click()
  return true
}

/** The page we are on, safe to store: origin and path, never the query. */
function whereWeAre(page: Page): string {
  try {
    const url = new URL(page.url())
    return `${url.origin}${url.pathname}`
  } catch {
    return '(unparseable url)'
  }
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
  // Breadcrumbs, kept whether or not we fail. Paths and outcomes only — no
  // page text, no query strings, nothing typed into a field.
  const trail: string[] = []
  const fail = (failure: HudlFailure): never => {
    throw new HudlSessionError(failure, coachMessageFor(failure), trail)
  }

  await page.goto(HUDL_LOGIN, { waitUntil: 'domcontentloaded', timeout: NAV_TIMEOUT_MS })
  // The sign-in form is client-rendered; without settling first there is
  // nothing in the DOM to fill.
  await page.waitForLoadState('networkidle', { timeout: NAV_TIMEOUT_MS }).catch(() => {})
  trail.push(`login page: ${whereWeAre(page)}`)

  if (!(await fillFirst(page, EMAIL_SELECTORS, email))) {
    trail.push('email field: none of the selectors became visible')
    fail('login_failed')
  }
  trail.push('email field: filled')

  // Hudl has used both a single form and an email-then-password two-step. If
  // no password field is present yet, advancing the form is what reveals it.
  if (!(await fillFirst(page, PASSWORD_SELECTORS, password))) {
    trail.push('password field: not on the first screen, advancing')
    if (!(await clickFirst(page, SUBMIT_SELECTORS))) {
      trail.push('submit button: none of the selectors became visible')
      fail('login_failed')
    }
    await page.waitForLoadState('networkidle', { timeout: NAV_TIMEOUT_MS }).catch(() => {})
    trail.push(`after advancing: ${whereWeAre(page)}`)

    if (!(await fillFirst(page, PASSWORD_SELECTORS, password))) {
      // Could be a challenge or an SSO hand-off sitting between the two steps
      // rather than a markup change, so classify before blaming the selectors.
      const outcome = classifyLoginPage(page.url(), await visibleText(page))
      trail.push(`password field: still absent, page reads as "${outcome}"`)
      if (outcome === 'challenge') fail('challenge_required')
      if (outcome === 'sso') fail('sso_required')
      fail('login_failed')
    }
  }
  trail.push('password field: filled')

  if (!(await clickFirst(page, SUBMIT_SELECTORS))) {
    trail.push('submit button: none of the selectors became visible')
    fail('login_failed')
  }

  // The redirect after a successful login is several hops; waiting for the
  // network to settle is more reliable than waiting for any one URL.
  await page.waitForLoadState('networkidle', { timeout: NAV_TIMEOUT_MS }).catch(() => {})

  const outcome = classifyLoginPage(page.url(), await visibleText(page))
  trail.push(`after submit: ${whereWeAre(page)} reads as "${outcome}"`)

  if (outcome === 'signed_in') return
  if (outcome === 'challenge') fail('challenge_required')
  if (outcome === 'sso') fail('sso_required')
  if (outcome === 'rejected') fail('invalid_credentials')
  // 'unknown' — still on a login URL with nothing recognisable said about why.
  // Failing here is deliberate: continuing would scrape the login page.
  fail('login_failed')
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
    try {
      browser = await chromium.launch({
        headless: true,
        executablePath: process.env.PLAYWRIGHT_CHROMIUM_PATH || undefined,
        // Containers give a small /dev/shm; without this Chromium crashes part
        // way through a long session rather than at launch, which reads as a
        // Hudl problem when it is not one.
        args: ['--disable-dev-shm-usage'],
      })
    } catch (launchError) {
      // Classified on its own rather than falling through to the catch below,
      // which would report a missing browser as a failed Hudl sign-in. The
      // Playwright message is logged, never surfaced — it names the path it
      // looked in, and coach-facing strings stay hand-written.
      const failure = classifyLaunchError(launchError)
      console.error(
        '[hudl] chromium failed to launch:',
        launchError instanceof Error ? launchError.message : launchError
      )
      throw new HudlSessionError(failure, coachMessageFor(failure))
    }

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
      // A session-only connection has nothing to fall back on. Saying so is
      // the whole point: "sign in again in your browser and re-paste" is a
      // different instruction from "your password is wrong", and a coach who
      // pasted a session precisely BECAUSE they have no password must not be
      // sent to re-enter one.
      if (!credentials.password) {
        throw new HudlSessionError('session_expired', coachMessageFor('session_expired'))
      }
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
      if (error.diagnostics.length) {
        console.error('[hudl] sign-in trail:', error.diagnostics.join(' | '))
      }
      throw error
    }
    // Anything else — a Playwright timeout, a launch failure — is reduced to a
    // coach-readable message here. Playwright's own messages quote the URL it
    // was on, and Hudl's URLs carry session tokens.
    await recordHudlError(supabase, teamId, coachMessageFor('login_failed'))
    throw new HudlSessionError('login_failed', coachMessageFor('login_failed'))
  }
}
