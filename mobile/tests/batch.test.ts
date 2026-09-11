import { isAnalyzable } from '../src/utils/status';
import { SUPPORTED_MODULES } from '../src/types/domain';
import { MODULE_CATALOG, moduleByKey } from '../src/features/intelligence/modules';

describe('isAnalyzable', () => {
  it('accepts every status whose frames exist', () => {
    expect(isAnalyzable('ready_for_review')).toBe(true);
    expect(isAnalyzable('analysis_complete')).toBe(true);
    expect(isAnalyzable('partially_ready')).toBe(true);
  });

  it('rejects film with no frames yet, so it is queued rather than run inline', () => {
    expect(isAnalyzable('uploaded')).toBe(false);
    expect(isAnalyzable('processing')).toBe(false);
    expect(isAnalyzable('failed')).toBe(false);
  });

  it('treats a missing status as not analyzable rather than throwing', () => {
    expect(isAnalyzable(null)).toBe(false);
    expect(isAnalyzable(undefined)).toBe(false);
  });
});

describe('module catalog', () => {
  it('only offers modules the server actually runs', () => {
    for (const m of MODULE_CATALOG) {
      expect(SUPPORTED_MODULES).toContain(m.key);
    }
  });

  it('offers every supported module — a module the server runs but the app hides is dead capability', () => {
    const offered = new Set(MODULE_CATALOG.map((m) => m.key));
    for (const key of SUPPORTED_MODULES) {
      expect(offered.has(key)).toBe(true);
    }
  });

  it('includes RANKERIQ, which grades every player on the unit', () => {
    expect(moduleByKey('RANKERIQ')).toBeDefined();
    // It grades a whole unit, so it must not demand a single player selection.
    expect(moduleByKey('RANKERIQ')?.perPlayer).toBe(false);
  });

  it('never offers an unbuilt module', () => {
    for (const key of ['WRIQ', 'DLIQ', 'LBIQ', 'DBIQ', 'PRACTICEIQ']) {
      expect(moduleByKey(key)).toBeUndefined();
    }
  });
});
