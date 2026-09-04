import { describe, it, expect } from 'vitest'
import {
  cookieHeaderFor,
  assertFetchableMediaUrl,
  mediaUrlForLog,
  redactUrls,
  HudlClipError,
  type BrowserCookie,
} from './hudl-clip'

const JAR: BrowserCookie[] = [
  { name: 'session', value: 'abc', domain: '.hudl.com', path: '/', secure: true },
  { name: 'pref', value: 'dark', domain: 'www.hudl.com', path: '/', secure: false },
  { name: 'scoped', value: 'yes', domain: '.hudl.com', path: '/watch', secure: false },
  { name: 'elsewhere', value: 'no', domain: '.example.com', path: '/', secure: false },
]

describe('cookieHeaderFor', () => {
  it('sends only the cookies that belong to the host being fetched', () => {
    // The media host is often a CDN, not the app host. Shipping the whole jar
    // would hand that CDN the coach's Hudl session.
    const header = cookieHeaderFor(JAR, 'https://media.hudl.com/clip/1.mp4')
    expect(header).toContain('session=abc')
    expect(header).not.toContain('elsewhere')
    expect(header).not.toContain('pref=dark')
  })

  it('respects the cookie path', () => {
    expect(cookieHeaderFor(JAR, 'https://www.hudl.com/watch/1')).toContain('scoped=yes')
    expect(cookieHeaderFor(JAR, 'https://www.hudl.com/home')).not.toContain('scoped=yes')
  })

  it('withholds a secure cookie from a plaintext request', () => {
    expect(cookieHeaderFor(JAR, 'http://www.hudl.com/home')).not.toContain('session=abc')
    expect(cookieHeaderFor(JAR, 'https://www.hudl.com/home')).toContain('session=abc')
  })

  it('is empty rather than throwing on a bad url', () => {
    expect(cookieHeaderFor(JAR, 'not a url')).toBe('')
  })
})

describe('assertFetchableMediaUrl', () => {
  it('accepts an ordinary https media url', () => {
    expect(assertFetchableMediaUrl('https://media.hudl.com/a/b.mp4').hostname).toBe(
      'media.hudl.com'
    )
  })

  it('refuses a private or loopback target', () => {
    // The address comes out of Hudl's own payload, but a payload is data, and
    // data that decides what we connect to gets checked.
    expect(() => assertFetchableMediaUrl('http://169.254.169.254/latest/meta-data')).toThrow(
      HudlClipError
    )
    expect(() => assertFetchableMediaUrl('http://127.0.0.1:8080/x.mp4')).toThrow(HudlClipError)
  })

  it('refuses a non-http scheme', () => {
    expect(() => assertFetchableMediaUrl('file:///etc/passwd')).toThrow(HudlClipError)
  })

  it('refuses something that is not a url', () => {
    expect(() => assertFetchableMediaUrl('clip-1')).toThrow(HudlClipError)
  })
})

describe('mediaUrlForLog', () => {
  it('drops the query, where the signed token lives', () => {
    expect(mediaUrlForLog('https://media.hudl.com/a/b.m3u8?Signature=SECRET&Expires=1')).toBe(
      'https://media.hudl.com/a/b.m3u8'
    )
  })
})

describe('redactUrls', () => {
  it('strips the query out of every url ffmpeg quotes back', () => {
    // ffmpeg's stderr is the only thing that says WHY a clip failed, so it is
    // worth logging — but it quotes the signed URL it was handed, and that
    // query string is the credential.
    const stderr =
      "https://media.hudl.com/a/b.m3u8?Policy=eyJhbGc&Signature=SECRET: Server returned 403"
    const clean = redactUrls(stderr)
    expect(clean).not.toContain('SECRET')
    expect(clean).not.toContain('eyJhbGc')
    expect(clean).toContain('https://media.hudl.com/a/b.m3u8')
    expect(clean).toContain('Server returned 403')
  })

  it('leaves a url with no query alone', () => {
    expect(redactUrls('failed on https://media.hudl.com/a.mp4 here')).toContain(
      'https://media.hudl.com/a.mp4 here'
    )
  })

  it('is what the error message carries, while coachMessage stays clean', () => {
    const error = new HudlClipError('Try the import again.', 'open https://m.hudl.com/x?tok=SECRET')
    expect(error.message).not.toContain('SECRET')
    expect(error.coachMessage).toBe('Try the import again.')
  })
})
