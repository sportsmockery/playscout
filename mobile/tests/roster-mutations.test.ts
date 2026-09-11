/**
 * RLS denies a write by returning zero rows and NO error. A client that checks
 * only `error` therefore reports success on a save that never happened — the
 * failure CLAUDE.md records against the players table. These tests pin that
 * every mutation treats "no error, no rows" as a denial.
 */
import { createPlayer, updatePlayer, deletePlayer, EMPTY_DRAFT } from '@/features/roster/mutations';

const result = { data: null as unknown, error: null as unknown };

jest.mock('@/lib/supabase/client', () => {
  // One chainable stub standing in for the PostgREST builder. Every terminal
  // call resolves to whatever `result` currently holds.
  const builder: Record<string, unknown> = {};
  for (const m of ['insert', 'update', 'delete', 'eq', 'select', 'returns']) {
    builder[m] = jest.fn(() => builder);
  }
  builder.then = (resolve: (v: unknown) => unknown) => Promise.resolve(result).then(resolve);
  return { supabase: { from: jest.fn(() => builder) } };
});

const DRAFT = { ...EMPTY_DRAFT, firstName: 'Sam', jerseyNumber: '07' };

beforeEach(() => {
  result.data = null;
  result.error = null;
});

describe('a write RLS silently refused', () => {
  it('createPlayer rejects when no row comes back', async () => {
    result.data = [];
    await expect(createPlayer('team-1', DRAFT)).rejects.toThrow(/write access/i);
  });

  it('updatePlayer rejects when no row comes back', async () => {
    result.data = [];
    await expect(updatePlayer('player-1', DRAFT)).rejects.toThrow(/write access/i);
  });

  it('deletePlayer rejects when no row comes back', async () => {
    result.data = [];
    await expect(deletePlayer('player-1')).rejects.toThrow(/write access/i);
  });
});

describe('an explicit RLS error', () => {
  it('is reported as a permission problem, not a raw Postgres code', async () => {
    result.error = { code: '42501', message: 'new row violates row-level security policy' };
    await expect(createPlayer('team-1', DRAFT)).rejects.toThrow(/coach access/i);
  });

  it('passes other database errors through rather than mislabelling them', async () => {
    result.error = { code: '23505', message: 'duplicate key value' };
    await expect(createPlayer('team-1', DRAFT)).rejects.toThrow(/duplicate key/i);
  });
});

describe('a write that really happened', () => {
  it('returns the saved row', async () => {
    result.data = [{ id: 'p1', team_id: 'team-1', first_name: 'Sam', created_at: 'now' }];
    await expect(createPlayer('team-1', DRAFT)).resolves.toMatchObject({ id: 'p1' });
  });

  it('deletePlayer resolves when a row was removed', async () => {
    result.data = [{ id: 'p1' }];
    await expect(deletePlayer('p1')).resolves.toBeUndefined();
  });
});
