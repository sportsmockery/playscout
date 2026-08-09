import { formatTimecode, parseTimecode, formatBytes, relativeTime } from '@/utils/time';

describe('formatTimecode', () => {
  it('formats minutes and seconds with zero padding', () => {
    expect(formatTimecode(0)).toBe('0:00');
    expect(formatTimecode(65)).toBe('1:05');
    expect(formatTimecode(3661)).toBe('1:01:01');
  });
  it('guards bad input', () => {
    expect(formatTimecode(null)).toBe('0:00');
    expect(formatTimecode(-4)).toBe('0:00');
  });
});

describe('parseTimecode', () => {
  it('parses M:SS and H:MM:SS', () => {
    expect(parseTimecode('1:05')).toBe(65);
    expect(parseTimecode('1:01:01')).toBe(3661);
    expect(parseTimecode('42')).toBe(42);
  });
  it('rejects invalid input and out-of-range parts', () => {
    expect(parseTimecode('')).toBeNull();
    expect(parseTimecode('a:b')).toBeNull();
    expect(parseTimecode('1:75')).toBeNull();
  });
  it('round-trips with formatTimecode', () => {
    const secs = parseTimecode('12:34');
    expect(secs).toBe(754);
    expect(formatTimecode(secs!)).toBe('12:34');
  });
});

describe('formatBytes', () => {
  it('scales units', () => {
    expect(formatBytes(0)).toBe('0 B');
    expect(formatBytes(1024)).toBe('1.0 KB');
    expect(formatBytes(1024 * 1024 * 1024)).toBe('1.0 GB');
  });
});

describe('relativeTime', () => {
  it('is deterministic with an injected now', () => {
    const now = new Date('2026-08-09T12:00:00Z');
    expect(relativeTime('2026-08-09T11:59:59Z', now)).toBe('just now');
    expect(relativeTime('2026-08-06T12:00:00Z', now)).toBe('3 days ago');
  });
});
