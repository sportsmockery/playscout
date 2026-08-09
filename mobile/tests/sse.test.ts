import { parseSSEBuffer } from '@/lib/api/sse';

describe('parseSSEBuffer', () => {
  it('parses a delta frame and keeps the incomplete remainder', () => {
    const { frames, remainder } = parseSSEBuffer('data: {"type":"delta","text":"Hi"}\n\ndata: {"type":"del');
    expect(frames).toEqual([{ type: 'delta', text: 'Hi' }]);
    expect(remainder).toBe('data: {"type":"del');
  });

  it('concatenates deltas across chunk boundaries', () => {
    const first = parseSSEBuffer('data: {"type":"delta","text":"Hel');
    expect(first.frames).toHaveLength(0);
    const second = parseSSEBuffer(first.remainder + 'lo"}\n\n');
    expect(second.frames).toEqual([{ type: 'delta', text: 'Hello' }]);
  });

  it('handles done, redacted, and error frames', () => {
    const { frames } = parseSSEBuffer(
      'data: {"type":"redacted","text":"[removed]"}\n\ndata: {"type":"done"}\n\ndata: {"type":"error","message":"boom"}\n\n',
    );
    expect(frames).toEqual([
      { type: 'redacted', text: '[removed]' },
      { type: 'done' },
      { type: 'error', message: 'boom' },
    ]);
  });

  it('treats a bare [DONE] payload as a done frame', () => {
    const { frames } = parseSSEBuffer('data: [DONE]\n\n');
    expect(frames).toEqual([{ type: 'done' }]);
  });

  it('ignores malformed JSON without throwing', () => {
    const { frames } = parseSSEBuffer('data: {not json}\n\n');
    expect(frames).toEqual([]);
  });
});
