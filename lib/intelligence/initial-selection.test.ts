import { describe, it, expect } from 'vitest'
import { resolveInitialVideoIds } from './initial-selection'
import type { Video } from '@/lib/db/types'

const video = (id: string, folderId?: string): Video =>
  ({ id, team_id: 't1', title: id, folder_id: folderId ?? null, created_at: '' }) as Video

const library = [video('a', 'f1'), video('b', 'f1'), video('c'), video('d', 'f2')]

describe('resolveInitialVideoIds', () => {
  it('resolves the legacy single ?videoId= deep link', () => {
    expect(resolveInitialVideoIds({ videoId: 'c' }, library)).toEqual(['c'])
  })

  it('resolves a comma-separated selection handed over from the film library', () => {
    expect(resolveInitialVideoIds({ videoIds: 'a, d' }, library)).toEqual(['a', 'd'])
  })

  it('expands a folder to every clip filed in it', () => {
    expect(resolveInitialVideoIds({ folderId: 'f1' }, library)).toEqual(['a', 'b'])
  })

  it('merges sources without duplicating a clip named twice', () => {
    expect(resolveInitialVideoIds({ videoId: 'a', videoIds: 'a,b', folderId: 'f1' }, library)).toEqual(['a', 'b'])
  })

  it('drops ids that are not in this team library', () => {
    expect(resolveInitialVideoIds({ videoIds: 'a,other-team-video' }, library)).toEqual(['a'])
  })

  it('returns nothing when no selection params are present', () => {
    expect(resolveInitialVideoIds({}, library)).toEqual([])
  })
})
