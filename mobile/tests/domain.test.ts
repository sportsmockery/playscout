import { scoreBand, confidenceView, sampleSizeLabel } from '@/utils/score';
import { videoStatusView, stepLabel } from '@/utils/status';
import { canWrite, isAdmin, writeDeniedReason } from '@/utils/roles';
import { resolveLevelTier, isHighSchoolOrAbove } from '@/utils/levels';
import { makeStoragePath } from '@/features/uploads/paths';

describe('scoreBand', () => {
  it('maps scores to verbal bands', () => {
    expect(scoreBand(95)?.label).toBe('Elite');
    expect(scoreBand(82)?.label).toBe('Advanced');
    expect(scoreBand(74)?.label).toBe('Solid');
    expect(scoreBand(63)?.label).toBe('Developing');
    expect(scoreBand(40)?.label).toBe('Beginner');
    expect(scoreBand(null)).toBeNull();
  });
});

describe('confidenceView', () => {
  it('is distinct from the score and carries a word + percent', () => {
    expect(confidenceView(0.8)).toEqual({ pct: 80, label: 'High confidence', tone: 'high' });
    expect(confidenceView(0.6)?.tone).toBe('medium');
    expect(confidenceView(0.3)?.tone).toBe('low');
    expect(confidenceView(undefined)).toBeNull();
  });
});

describe('sampleSizeLabel', () => {
  it('flags limited evidence', () => {
    expect(sampleSizeLabel(0)).toBe('No plays observed');
    expect(sampleSizeLabel(1)).toBe('1 play — limited evidence');
    expect(sampleSizeLabel(3)).toBe('3 plays — limited evidence');
    expect(sampleSizeLabel(14)).toBe('14 plays');
  });
});

describe('videoStatusView', () => {
  it('only marks in-progress states active (poll only those)', () => {
    expect(videoStatusView('processing', 'extract_frames')).toEqual({
      label: 'Extracting frames',
      tone: 'active',
      isActive: true,
    });
    expect(videoStatusView('analysis_complete').isActive).toBe(false);
    expect(videoStatusView('failed')).toEqual({ label: 'Needs attention', tone: 'error', isActive: false });
  });
  it('humanizes unknown steps', () => {
    expect(stepLabel('some_new_step')).toBe('some new step');
  });
});

describe('role gates', () => {
  it('mirrors server WRITE_ROLES (viewer is read-only)', () => {
    expect(canWrite('coach')).toBe(true);
    expect(canWrite('analyst')).toBe(true);
    expect(canWrite('viewer')).toBe(false);
    expect(canWrite(null)).toBe(false);
    expect(isAdmin('admin')).toBe(true);
    expect(isAdmin('coach')).toBe(false);
  });
  it('explains a denied write to a viewer', () => {
    expect(writeDeniedReason('viewer')).toMatch(/read-only/i);
  });
});

describe('resolveLevelTier', () => {
  it('parses youth age bands and high-school levels', () => {
    expect(resolveLevelTier({ age_group: '8U' })).toBe('youth_early');
    expect(resolveLevelTier({ age_group: '10U' })).toBe('youth');
    expect(resolveLevelTier({ age_group: '12U' })).toBe('youth_older');
    expect(resolveLevelTier({ age_group: '14U' })).toBe('middle_school');
    expect(resolveLevelTier({ level: 'high school', age_group: 'JV' })).toBe('jv');
    expect(resolveLevelTier({ level: 'high school', age_group: 'Varsity' })).toBe('varsity');
    expect(resolveLevelTier(null)).toBe('unknown');
  });
  it('treats college/semi-pro as varsity (no youth ceiling reintroduced)', () => {
    expect(resolveLevelTier({ level: 'college' })).toBe('varsity');
    expect(isHighSchoolOrAbove(resolveLevelTier({ level: 'college' }))).toBe(true);
  });
});

describe('makeStoragePath', () => {
  it('is deterministic per upload id so retries never duplicate the object', () => {
    const a = makeStoragePath('team1', 'up_123', 'Bulldogs vs Wildcats.MP4');
    const b = makeStoragePath('team1', 'up_123', 'Bulldogs vs Wildcats.MP4');
    expect(a).toBe(b);
    expect(a).toBe('team1/up_123.mp4');
  });
  it('falls back to mp4 when no extension', () => {
    expect(makeStoragePath('t', 'u', 'clip')).toBe('t/u.mp4');
  });
});
