import { describe, it, expect } from 'vitest'
import {
  classifyLoginPage,
  classifyLaunchError,
  isLoginUrl,
  coachMessageFor,
  earliestCookieExpiry,
  HudlSessionError,
} from './hudl-session'

const SIGNED_IN = 'https://www.hudl.com/home'
const LOGIN = 'https://identity.hudl.com/u/login?state=abc'

describe('isLoginUrl', () => {
  it('recognises the identity host and the login paths', () => {
    expect(isLoginUrl(LOGIN)).toBe(true)
    expect(isLoginUrl('https://www.hudl.com/login')).toBe(true)
    expect(isLoginUrl('https://www.hudl.com/sign-in')).toBe(true)
    expect(isLoginUrl(SIGNED_IN)).toBe(false)
    expect(isLoginUrl('https://app.hudl.com/watch/team/95968/analyze?v=97226551')).toBe(false)
  })
})

describe('classifyLoginPage', () => {
  it('calls it signed in once we are off the login host', () => {
    expect(classifyLoginPage(SIGNED_IN, 'Your teams')).toBe('signed_in')
  })

  it('reads a rejected password', () => {
    expect(classifyLoginPage(LOGIN, 'Your email or password is incorrect. Try again.')).toBe(
      'rejected'
    )
  })

  it('reads a verification screen as a challenge, not a bad password', () => {
    // The distinction that matters: telling a coach their password is wrong
    // when Hudl only wanted a code sends them to reset a password that is fine.
    expect(
      classifyLoginPage(LOGIN, "We don't recognize this device. Enter the code we sent you.")
    ).toBe('challenge')
    expect(classifyLoginPage(LOGIN, 'Enter your two-factor authentication code')).toBe('challenge')
  })

  it('prefers challenge over rejection when a page says both', () => {
    // Verification screens routinely also carry "try again" / "incorrect
    // password" copy from a previous attempt.
    const text = 'Incorrect password. We sent a code to your email — enter the code to continue.'
    expect(classifyLoginPage(LOGIN, text)).toBe('challenge')
  })

  it('says unknown rather than guessing when still on the login page', () => {
    // The caller treats this as a failure. Assuming success here is how a job
    // scrapes the login page into fifty empty clips.
    expect(classifyLoginPage(LOGIN, 'Log in to Hudl')).toBe('unknown')
  })

  it('is not confused by capitalisation', () => {
    expect(classifyLoginPage(LOGIN, 'VERIFICATION CODE REQUIRED')).toBe('challenge')
  })
})

describe('coachMessageFor', () => {
  it('gives every failure a sentence a coach can act on', () => {
    const failures = [
      'not_connected',
      'encryption_unavailable',
      'invalid_credentials',
      'challenge_required',
      'sso_required',
      'browser_unavailable',
      'login_failed',
    ] as const

    for (const failure of failures) {
      const message = coachMessageFor(failure)
      expect(message.length).toBeGreaterThan(30)
      // No jargon leaking into a coach's screen.
      expect(message).not.toMatch(/playwright|selector|undefined|stack/i)
    }
  })

  it('never names a credential in the message', () => {
    // These strings land on a database row and a screen. Nothing about the
    // stored password may travel with them.
    const error = new HudlSessionError('invalid_credentials', coachMessageFor('invalid_credentials'))
    expect(error.message).not.toContain('password:')
    expect(error.coachMessage).toContain('Re-enter them')
  })
})

describe('Google / SSO sign-in', () => {
  it('recognises being handed off to Google', () => {
    // The account signs in with Google. PlayScout cannot drive that, and
    // saying "Hudl rejected that email and password" would send the coach to
    // reset a password that may not even exist on the account.
    expect(
      classifyLoginPage('https://accounts.google.com/o/oauth2/v2/auth?client_id=hudl', 'Choose an account')
    ).toBe('sso')
  })

  it('recognises an SSO-only login page by its text', () => {
    expect(classifyLoginPage(LOGIN, 'Continue with Google to access your team')).toBe('sso')
  })

  it('does NOT call it SSO just because a Google button sits beside the form', () => {
    // Hudl shows "Continue with Google" next to a perfectly usable password
    // form. Treating that as SSO-only would break every password account.
    expect(classifyLoginPage(SIGNED_IN, 'Continue with Google')).toBe('signed_in')
    expect(
      classifyLoginPage(LOGIN, 'Incorrect password. Or continue with Google.')
    ).toBe('rejected')
  })

  it('still prefers a challenge over SSO when both appear', () => {
    expect(
      classifyLoginPage(LOGIN, 'Enter the code we sent you. Or continue with Google.')
    ).toBe('challenge')
  })

  it('tells the coach to set a Hudl password rather than blaming their account', () => {
    const message = coachMessageFor('sso_required')
    expect(message).toMatch(/set a hudl password/i)
    expect(message).not.toMatch(/rejected|incorrect/i)
  })
})

describe('classifyLaunchError', () => {
  it('calls a missing Chromium a browser problem, not a sign-in problem', () => {
    // Observed for real: the Railway build skipped the Playwright install, and
    // the coach was told PlayScout "could not sign in to Hudl" — sending them
    // to re-check a password that was fine.
    const error = new Error(
      "browserType.launch: Executable doesn't exist at /root/.cache/ms-playwright/chromium-1200/chrome-linux/chrome"
    )
    expect(classifyLaunchError(error)).toBe('browser_unavailable')
  })

  it('treats any other launch failure the same way', () => {
    // A missing shared library or a dead /dev/shm is equally a deployment
    // problem, and equally not something a coach can fix in team settings.
    expect(classifyLaunchError(new Error('error while loading shared libraries: libnss3.so'))).toBe(
      'browser_unavailable'
    )
    expect(classifyLaunchError('something else entirely')).toBe('browser_unavailable')
  })

  it('produces a message that blames the deployment, not the account', () => {
    const message = coachMessageFor(classifyLaunchError(new Error("Executable doesn't exist")))
    expect(message).toMatch(/deployment/i)
    expect(message).not.toMatch(/password|credential|verify/i)
  })
})

describe('earliestCookieExpiry', () => {
  const future = (seconds: number) => Math.floor(Date.now() / 1000) + seconds

  it('takes the soonest real expiry', () => {
    const state = JSON.stringify({
      cookies: [{ expires: future(7200) }, { expires: future(600) }, { expires: future(99999) }],
    })
    const expiry = earliestCookieExpiry(state)!
    expect(expiry.getTime()).toBeGreaterThan(Date.now())
    expect(expiry.getTime()).toBeLessThan(Date.now() + 700 * 1000)
  })

  it('ignores session cookies and already-expired ones', () => {
    const state = JSON.stringify({
      cookies: [{ expires: -1 }, {}, { expires: future(-100) }],
    })
    expect(earliestCookieExpiry(state)).toBeNull()
  })

  it('returns null rather than throwing on junk', () => {
    expect(earliestCookieExpiry('not json')).toBeNull()
    expect(earliestCookieExpiry('{}')).toBeNull()
  })
})

describe('sign-in diagnostics', () => {
  it('carries a redacted trail so a failed login says where it stopped', () => {
    // The first real run failed with "could not sign in to Hudl" and nothing
    // else — no way to tell a markup change from a page that had not rendered
    // yet. The trail is what makes the second attempt informed.
    const error = new HudlSessionError('login_failed', coachMessageFor('login_failed'), [
      'login page: https://identity.hudl.com/u/login',
      'email field: none of the selectors became visible',
    ])
    expect(error.diagnostics).toHaveLength(2)
    expect(error.diagnostics.join(' ')).not.toContain('?')
  })

  it('defaults to an empty trail rather than undefined', () => {
    expect(new HudlSessionError('not_connected', 'x').diagnostics).toEqual([])
  })
})
