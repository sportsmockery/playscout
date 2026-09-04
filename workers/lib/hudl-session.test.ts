import { describe, it, expect } from 'vitest'
import {
  classifyLoginPage,
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
