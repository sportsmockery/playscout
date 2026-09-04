import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto'

/**
 * Authenticated encryption for third-party credentials at rest.
 *
 * PlayScout stores a coach's Hudl login so the worker can pull their film
 * unattended. That makes this the first place the product holds someone else's
 * secret, so the rules are strict and stated here rather than assumed:
 *
 * - AES-256-GCM, not CBC. GCM authenticates, so a tampered ciphertext FAILS to
 *   open instead of decrypting to plausible garbage that then gets typed into
 *   a login form.
 * - A fresh random IV per seal. Reusing an IV under one key is the classic way
 *   to destroy GCM's guarantees entirely.
 * - No key, no fallback. `seal` and `open` throw rather than quietly storing
 *   plaintext — a silent downgrade is exactly how a table like this ends up
 *   holding passwords in the clear without anyone noticing.
 *
 * The key lives in `HUDL_CREDENTIAL_KEY` (32 bytes, base64). Vercel needs it
 * because the bind route encrypts; Railway needs it because the worker
 * decrypts. Nothing else should ever read it.
 */

const ALGORITHM = 'aes-256-gcm'
const KEY_BYTES = 32
const IV_BYTES = 12

/** `v1:<iv>:<authTag>:<ciphertext>`, all base64. Versioned so the format can change. */
const FORMAT_VERSION = 'v1'

export class SecretBoxError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'SecretBoxError'
  }
}

function loadKey(): Buffer {
  const raw = process.env.HUDL_CREDENTIAL_KEY
  if (!raw) {
    throw new SecretBoxError(
      'HUDL_CREDENTIAL_KEY is not set. Credentials cannot be stored or read without it — ' +
        'generate one with `openssl rand -base64 32`.'
    )
  }

  const key = Buffer.from(raw, 'base64')
  if (key.byteLength !== KEY_BYTES) {
    throw new SecretBoxError(
      `HUDL_CREDENTIAL_KEY must decode to ${KEY_BYTES} bytes, got ${key.byteLength}. ` +
        'Generate one with `openssl rand -base64 32`.'
    )
  }
  return key
}

/** True when a key is configured and usable — for a health check that must not throw. */
export function secretBoxReady(): boolean {
  try {
    loadKey()
    return true
  } catch {
    return false
  }
}

export function seal(plaintext: string): string {
  const key = loadKey()
  const iv = randomBytes(IV_BYTES)
  const cipher = createCipheriv(ALGORITHM, key, iv)

  const ciphertext = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()])
  const authTag = cipher.getAuthTag()

  return [
    FORMAT_VERSION,
    iv.toString('base64'),
    authTag.toString('base64'),
    ciphertext.toString('base64'),
  ].join(':')
}

export function open(sealed: string): string {
  const key = loadKey()
  const parts = sealed.split(':')

  if (parts.length !== 4 || parts[0] !== FORMAT_VERSION) {
    throw new SecretBoxError('Stored credential is not in a format this build can read.')
  }

  const [, ivB64, tagB64, dataB64] = parts

  try {
    const decipher = createDecipheriv(ALGORITHM, key, Buffer.from(ivB64, 'base64'))
    decipher.setAuthTag(Buffer.from(tagB64, 'base64'))
    return Buffer.concat([
      decipher.update(Buffer.from(dataB64, 'base64')),
      decipher.final(),
    ]).toString('utf8')
  } catch {
    // Deliberately says nothing about the key or the ciphertext: this fires on
    // a wrong key AND on tampering, and distinguishing them for a caller would
    // be an oracle.
    throw new SecretBoxError(
      'Stored credential could not be decrypted. It was written with a different key, or it has been altered.'
    )
  }
}
