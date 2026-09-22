import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import ImportRosterButton from './ImportRosterButton'

/**
 * The preview is the feature, so it is what gets tested.
 *
 * A bad import writes one child's season onto another child's page. The two
 * failures that reach a coach silently are the ones covered hardest here: a
 * duplicate jersey number (which costs BOTH kids every grade, because
 * matchRosterPlayer resolves a number only when exactly one player wears it),
 * and row-level security denying the write by returning zero rows and no
 * error — which without a length check reads as success.
 */

const insert = vi.fn()
const refresh = vi.fn()

vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh }) }))
vi.mock('@/lib/supabase/client', () => ({
  createClient: () => ({ from: () => ({ insert }) }),
}))

/** What PostgREST hands back: { data, error }. */
function resolvesWith(data: { id: string }[] | null, error: unknown = null) {
  insert.mockReturnValue({ select: () => Promise.resolve({ data, error }) })
}

function open(existingJerseys: string[] = []) {
  render(<ImportRosterButton teamId="team-1" existingJerseys={existingJerseys} />)
  fireEvent.click(screen.getByRole('button', { name: /import roster/i }))
  return screen.getByPlaceholderText(/AJ Martino/) as HTMLTextAreaElement
}

function paste(textarea: HTMLTextAreaElement, text: string) {
  fireEvent.change(textarea, { target: { value: text } })
}

const importButton = () => screen.getByRole('button', { name: /^Import \d* ?players?$/i })

beforeEach(() => {
  insert.mockReset()
  refresh.mockReset()
  resolvesWith([{ id: 'p1' }])
})

describe('the preview', () => {
  it('shows what will be written before anything is saved', () => {
    const textarea = open()
    paste(textarea, '3 Carter Burhans QB\n73 Ahmed Ali OL/DL')

    expect(screen.getByText('Carter Burhans')).toBeInTheDocument()
    expect(screen.getByText('Ahmed Ali')).toBeInTheDocument()
    expect(screen.getByText('OL/DL')).toBeInTheDocument()
    expect(insert).not.toHaveBeenCalled()
  })

  it('marks a number already on the roster as skipped', () => {
    const textarea = open(['3'])
    paste(textarea, '3 Carter Burhans QB\n4 Liam Horton')

    expect(screen.getByText(/already on roster/i)).toBeInTheDocument()
    expect(importButton()).toHaveTextContent('Import 1 player')
  })
})

describe('a duplicate number is refused, not warned about', () => {
  it('blocks the import and says what it would cost', () => {
    const textarea = open()
    paste(textarea, '45 Ryan Schmidt\n45 Jacob Connor')

    expect(screen.getByText(/appears on more than one line/i)).toBeInTheDocument()
    expect(screen.getByText(/lose every grade and stat/i)).toBeInTheDocument()
    expect(importButton()).toBeDisabled()
  })

  it('catches a leading zero as the same number', () => {
    const textarea = open()
    paste(textarea, '07 Max Viau\n7 Someone Else')
    expect(importButton()).toBeDisabled()
  })
})

describe('what gets written', () => {
  it('applies the chosen level and keeps a class year as a note', async () => {
    const textarea = open()
    paste(textarea, `3 Carter Burhans QB 2030 - 5'6" 145lbs`)
    fireEvent.change(screen.getByRole('combobox'), { target: { value: 'Freshman' } })
    fireEvent.click(importButton())

    await waitFor(() => expect(insert).toHaveBeenCalled())
    expect(insert.mock.calls[0][0]).toEqual([
      {
        team_id: 'team-1',
        first_name: 'Carter',
        last_name: 'Burhans',
        jersey_number: 3,
        primary_position: 'QB',
        secondary_position: null,
        side_of_ball: 'offense',
        // A graduation year is not a level, and players.grade_level is a level.
        grade_level: 'Freshman',
        status: 'active',
        notes: 'Class of 2030',
      },
    ])
  })

  it('lets a level named on the line beat the one chosen for the paste', async () => {
    const textarea = open()
    paste(textarea, '2 John Reed Sophomore')
    fireEvent.change(screen.getByRole('combobox'), { target: { value: 'Freshman' } })
    fireEvent.click(importButton())

    await waitFor(() => expect(insert).toHaveBeenCalled())
    expect(insert.mock.calls[0][0][0].grade_level).toBe('Sophomore')
  })

  it('leaves out a player whose number the team already has', async () => {
    const textarea = open(['3'])
    paste(textarea, '3 Carter Burhans\n4 Liam Horton')
    fireEvent.click(importButton())

    await waitFor(() => expect(insert).toHaveBeenCalled())
    const payload = insert.mock.calls[0][0] as { last_name: string }[]
    expect(payload.map((p) => p.last_name)).toEqual(['Horton'])
  })
})

describe('a denied write is not reported as a save', () => {
  it('treats zero returned rows as the permission failure it is', async () => {
    // RLS denies by returning no rows and no error. Checking only `error`
    // reports success on a save that never happened.
    resolvesWith([])
    const textarea = open()
    paste(textarea, '4 Liam Horton')
    fireEvent.click(importButton())

    expect(await screen.findByText(/doesn't have write access/i)).toBeInTheDocument()
    expect(screen.queryByText(/player added/i)).not.toBeInTheDocument()
    expect(refresh).not.toHaveBeenCalled()
  })

  it('explains a row-level-security error in a coach\'s words', async () => {
    resolvesWith(null, { code: '42501', message: 'new row violates row-level security policy' })
    const textarea = open()
    paste(textarea, '4 Liam Horton')
    fireEvent.click(importButton())

    expect(await screen.findByText(/don't have permission to add players/i)).toBeInTheDocument()
  })

  it('confirms and refreshes only on a real save', async () => {
    resolvesWith([{ id: 'p1' }, { id: 'p2' }])
    const textarea = open()
    paste(textarea, '4 Liam Horton\n5 Tyler McCarthy')
    fireEvent.click(importButton())

    expect(await screen.findByText(/2 players added/i)).toBeInTheDocument()
    expect(refresh).toHaveBeenCalled()
  })
})
