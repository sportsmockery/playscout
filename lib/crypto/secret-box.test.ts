import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { randomBytes } from 'node:crypto'
import { seal, open, secretBoxReady, SecretBoxError } from './secret-box'

const KEY = randomBytes(32).toString('base64')
const OTHER_KEY = randomBytes(32).toString('base64')

describe('secret-box', () => {
  beforeEach(() => {
    process.env.HUDL_CREDENTIAL_KEY = KEY
  })
  afterEach(() => {
    delete process.env.HUDL_CREDENTIAL_KEY
  })

  it('round-trips a credential', () => {
    const secret = 'hunter2-with-emoji-🏈-and-a-colon:inside'
    expect(open(seal(secret))).toBe(secret)
  })

  it('never produces the same ciphertext twice for the same input', () => {
    // A fixed IV under one key destroys GCM's guarantees, and identical
    // ciphertexts in a table also tell an attacker which coaches share a
    // password.
    const a = seal('same')
    const b = seal('same')
    expect(a).not.toBe(b)
    expect(open(a)).toBe(open(b))
  })

  it('does not leave the plaintext visible in the stored value', () => {
    const sealed = seal('SuperSecretPassword')
    expect(sealed).not.toContain('SuperSecretPassword')
  })

  it('fails to open a tampered ciphertext rather than returning garbage', () => {
    // The reason this is GCM and not CBC. A silently corrupted password would
    // be typed into a login form and lock the account out.
    const sealed = seal('correct horse battery staple')
    const [version, iv, tag, data] = sealed.split(':')
    const flipped = Buffer.from(data, 'base64')
    flipped[0] ^= 0xff

    expect(() => open([version, iv, tag, flipped.toString('base64')].join(':'))).toThrow(
      SecretBoxError
    )
  })

  it('fails to open when the auth tag has been swapped', () => {
    const sealed = seal('secret')
    const [version, iv, , data] = sealed.split(':')
    const forgedTag = randomBytes(16).toString('base64')
    expect(() => open([version, iv, forgedTag, data].join(':'))).toThrow(SecretBoxError)
  })

  it('fails to open with a different key', () => {
    const sealed = seal('secret')
    process.env.HUDL_CREDENTIAL_KEY = OTHER_KEY
    expect(() => open(sealed)).toThrow(SecretBoxError)
  })

  it('says nothing about which failure it was', () => {
    // Distinguishing "wrong key" from "tampered" for a caller is an oracle.
    const sealed = seal('secret')
    process.env.HUDL_CREDENTIAL_KEY = OTHER_KEY
    expect(() => open(sealed)).toThrow(/different key, or it has been altered/)
  })

  it('rejects a value written by a format this build cannot read', () => {
    expect(() => open('v2:a:b:c')).toThrow(/not in a format/)
    expect(() => open('not-sealed-at-all')).toThrow(/not in a format/)
  })

  it('throws rather than storing plaintext when no key is configured', () => {
    // The failure that matters most: a silent fallback is how a credentials
    // table ends up holding passwords in the clear.
    delete process.env.HUDL_CREDENTIAL_KEY
    expect(() => seal('secret')).toThrow(/HUDL_CREDENTIAL_KEY is not set/)
    expect(() => open('v1:a:b:c')).toThrow(/HUDL_CREDENTIAL_KEY is not set/)
  })

  it('rejects a key of the wrong length instead of padding it', () => {
    process.env.HUDL_CREDENTIAL_KEY = Buffer.from('too short').toString('base64')
    expect(() => seal('secret')).toThrow(/must decode to 32 bytes/)
  })

  it('reports readiness without throwing', () => {
    expect(secretBoxReady()).toBe(true)
    delete process.env.HUDL_CREDENTIAL_KEY
    expect(secretBoxReady()).toBe(false)
  })
})
