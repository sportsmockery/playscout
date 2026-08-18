import { describe, it, expect } from 'vitest'
import {
  validateRemoteVideoUrl,
  isPrivateHost,
  guessVideoExtension,
  titleFromUrl,
  isAcceptableVideoContentType,
} from './remote-source'

describe('isPrivateHost', () => {
  it('rejects loopback and localhost', () => {
    expect(isPrivateHost('localhost')).toBe(true)
    expect(isPrivateHost('127.0.0.1')).toBe(true)
    expect(isPrivateHost('::1')).toBe(true)
  })

  it('rejects the cloud metadata endpoint and other link-local addresses', () => {
    expect(isPrivateHost('169.254.169.254')).toBe(true)
    expect(isPrivateHost('fe80::1')).toBe(true)
  })

  it('rejects RFC1918 and unique-local ranges', () => {
    expect(isPrivateHost('10.1.2.3')).toBe(true)
    expect(isPrivateHost('172.16.0.1')).toBe(true)
    expect(isPrivateHost('172.31.255.254')).toBe(true)
    expect(isPrivateHost('192.168.1.10')).toBe(true)
    expect(isPrivateHost('fd00::abcd')).toBe(true)
  })

  it('rejects IPv4-mapped IPv6 that hides a private address', () => {
    expect(isPrivateHost('::ffff:10.0.0.1')).toBe(true)
    expect(isPrivateHost('[::ffff:169.254.169.254]')).toBe(true)
  })

  it('rejects internal-looking hostnames', () => {
    expect(isPrivateHost('films.internal')).toBe(true)
    expect(isPrivateHost('nas.local')).toBe(true)
  })

  it('allows ordinary public hosts', () => {
    expect(isPrivateHost('films.yourschool.org')).toBe(false)
    expect(isPrivateHost('172.32.0.1')).toBe(false)
    expect(isPrivateHost('8.8.8.8')).toBe(false)
  })
})

describe('validateRemoteVideoUrl', () => {
  it('accepts a direct https link to a film file', () => {
    const result = validateRemoteVideoUrl('https://films.yourschool.org/week3.mp4')
    expect(result.ok).toBe(true)
  })

  it('rejects non-http protocols', () => {
    expect(validateRemoteVideoUrl('file:///etc/passwd').ok).toBe(false)
    expect(validateRemoteVideoUrl('ftp://films.example.com/game.mp4').ok).toBe(false)
  })

  it('rejects credentials embedded in the URL', () => {
    const result = validateRemoteVideoUrl('https://user:secret@films.example.com/game.mp4')
    expect(result).toMatchObject({ ok: false })
  })

  it('rejects private and internal targets', () => {
    expect(validateRemoteVideoUrl('http://169.254.169.254/latest/meta-data/').ok).toBe(false)
    expect(validateRemoteVideoUrl('http://localhost:3000/video.mp4').ok).toBe(false)
    expect(validateRemoteVideoUrl('http://192.168.0.5/game.mp4').ok).toBe(false)
  })

  it('rejects streaming watch pages by name, explaining what to paste instead', () => {
    const result = validateRemoteVideoUrl('https://www.youtube.com/live/K5O7VDmpdn8?feature=shared')
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.reason).toContain('YouTube')
  })

  it('rejects session-gated film hosts with their own message', () => {
    const result = validateRemoteVideoUrl('https://www.hudl.com/video/3/12345/abcdef')
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.reason).toContain('Hudl')
  })

  it('rejects an empty or malformed link', () => {
    expect(validateRemoteVideoUrl('').ok).toBe(false)
    expect(validateRemoteVideoUrl('not a url').ok).toBe(false)
  })
})

describe('guessVideoExtension', () => {
  it('reads the extension from the path', () => {
    expect(guessVideoExtension('https://films.example.org/week3.mov')).toBe('mov')
  })

  it('falls back to the content type for signed links with no filename', () => {
    expect(guessVideoExtension('https://s3.example.com/abc123?sig=xyz', 'video/quicktime')).toBe('mov')
    expect(guessVideoExtension('https://s3.example.com/abc123?sig=xyz', 'video/webm')).toBe('webm')
  })

  it('defaults to mp4 when nothing is knowable', () => {
    expect(guessVideoExtension('https://s3.example.com/abc123')).toBe('mp4')
  })
})

describe('titleFromUrl', () => {
  it('turns a file name into a readable title', () => {
    expect(titleFromUrl('https://films.example.org/week3-vs-wildcats.mp4')).toBe('week3 vs wildcats')
  })

  it('falls back when the path has no file name', () => {
    expect(titleFromUrl('https://films.example.org/')).toBe('Film from link')
  })
})

describe('isAcceptableVideoContentType', () => {
  it('accepts video types and octet-stream, and a missing type', () => {
    expect(isAcceptableVideoContentType('video/mp4').ok).toBe(true)
    expect(isAcceptableVideoContentType('application/octet-stream').ok).toBe(true)
    expect(isAcceptableVideoContentType(null).ok).toBe(true)
  })

  it('rejects an HTML page — the "that was a share link" case', () => {
    const result = isAcceptableVideoContentType('text/html; charset=utf-8')
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.reason).toContain('web page')
  })
})
