import { preflightBlock, runsInline } from '@/features/intelligence/preflight';
import { moduleByKey } from '@/features/intelligence/modules';

const QBIQ = moduleByKey('QBIQ')!;
const TEAMIQ = moduleByKey('TEAMIQ')!;
const SCOUTIQ = moduleByKey('SCOUTIQ')!;

const BASE = {
  writable: true,
  videoIds: ['v1'],
  playerId: null,
  opponentId: null,
  jerseyColor: '',
};

describe('preflightBlock', () => {
  it('blocks a read-only role before anything else', () => {
    expect(preflightBlock(TEAMIQ, { ...BASE, writable: false })).toBe('read_only');
  });

  it('requires film', () => {
    expect(preflightBlock(TEAMIQ, { ...BASE, videoIds: [] })).toBe('no_film');
  });

  it('requires a player for a per-player module, but not for a team module', () => {
    expect(preflightBlock(QBIQ, BASE)).toBe('no_player');
    expect(preflightBlock(TEAMIQ, BASE)).toBeNull();
  });

  describe('scouting', () => {
    it('requires an opponent', () => {
      expect(preflightBlock(SCOUTIQ, BASE)).toBe('no_opponent');
    });

    /**
     * The important one. Without a jersey colour ScoutIQ does not fail — it
     * writes a confident report about whichever team it happened to follow.
     */
    it('refuses to run without a jersey colour', () => {
      expect(preflightBlock(SCOUTIQ, { ...BASE, opponentId: 'o1' })).toBe('no_jersey_color');
      expect(preflightBlock(SCOUTIQ, { ...BASE, opponentId: 'o1', jerseyColor: '   ' })).toBe(
        'no_jersey_color',
      );
    });

    it('runs once both are set', () => {
      expect(
        preflightBlock(SCOUTIQ, { ...BASE, opponentId: 'o1', jerseyColor: 'white' }),
      ).toBeNull();
    });
  });
});

describe('runsInline', () => {
  const ready = new Set(['ready1']);

  it('runs one already-processed clip immediately', () => {
    expect(runsInline(['ready1'], ready)).toBe(true);
  });

  it('queues a clip that is still processing rather than blocking on it', () => {
    expect(runsInline(['pending'], ready)).toBe(false);
  });

  it('queues anything with more than one clip, however ready', () => {
    expect(runsInline(['ready1', 'ready1'], ready)).toBe(false);
  });

  it('never runs an empty selection', () => {
    expect(runsInline([], ready)).toBe(false);
  });
});
