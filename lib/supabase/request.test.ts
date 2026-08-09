import { describe, it, expect } from 'vitest'
import { bearerTokenFromRequest, requestHasBearerToken } from './request'

describe('bearerTokenFromRequest', () => {
  it('extracts a Bearer token case-insensitively', () => {
    expect(bearerTokenFromRequest(new Request('https://x', { headers: { Authorization: 'Bearer abc.def.ghi' } }))).toBe(
      'abc.def.ghi',
    )
    expect(bearerTokenFromRequest(new Request('https://x', { headers: { authorization: 'bearer TOKEN' } }))).toBe('TOKEN')
  })

  it('returns null when absent or malformed', () => {
    expect(bearerTokenFromRequest(new Request('https://x'))).toBeNull()
    expect(bearerTokenFromRequest(new Request('https://x', { headers: { Authorization: 'Basic xyz' } }))).toBeNull()
    expect(bearerTokenFromRequest(new Request('https://x', { headers: { Authorization: 'Bearer   ' } }))).toBeNull()
  })

  it('requestHasBearerToken reflects presence', () => {
    expect(requestHasBearerToken(new Request('https://x', { headers: { Authorization: 'Bearer t' } }))).toBe(true)
    expect(requestHasBearerToken(new Request('https://x'))).toBe(false)
  })
})
