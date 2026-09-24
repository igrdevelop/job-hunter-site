import { formatEventPayload, groupThousands } from './event-payload';

describe('formatEventPayload', () => {
  it('formats a refine round', () => {
    expect(
      formatEventPayload(
        'refine',
        'accepted',
        '{"round": 2, "kind": "honest", "score": 90, "best": 90, "reason": "x"}',
      ),
    ).toBe('round 2 · honest · 90 (best 90)');
  });

  it('formats a discarded round (score null) without a score', () => {
    expect(
      formatEventPayload(
        'refine',
        'discarded',
        '{"round": 4, "kind": "stretch", "score": null, "best": 90}',
      ),
    ).toBe('round 4 · stretch · (best 90)');
  });

  it('formats a refine start', () => {
    expect(
      formatEventPayload('refine', 'start', '{"target": 95, "max_rounds": 5, "verdict_first": 85}'),
    ).toBe('target 95 · up to 5 rounds · from 85');
  });

  it('reads a refine round out of a payload truncated mid-reason (the API cuts at 80 chars)', () => {
    const cut =
      '{"round": 3, "kind": "stretch", "score": 88, "best": 90, "reason": "keyword gap in';
    expect(formatEventPayload('refine', 'rejected', cut)).toBe('round 3 · stretch · 88 (best 90)');
  });

  it('formats score and chars', () => {
    expect(formatEventPayload('verdict', 'ok', '{"score": 91}')).toBe('score 91');
    expect(formatEventPayload('ats_loop', 'ok', '{"score": 87.5}')).toBe('score 87.5');
    expect(formatEventPayload('fetch', 'ok', '{"chars": 3112}')).toBe('3 112 chars');
    expect(groupThousands(1234567)).toBe('1 234 567');
    expect(groupThousands(42)).toBe('42');
  });

  it('shows the error text truncated to ~80 chars, even from a cut-off payload', () => {
    const long = 'x'.repeat(200);
    const out = formatEventPayload('generate', 'error', JSON.stringify({ error: long }));
    expect(out.length).toBe(80);
    expect(out.endsWith('…')).toBe(true);

    expect(formatEventPayload('fetch', 'error', '{"error": "HTTP 429 Too Many Req')).toBe(
      'HTTP 429 Too Many Req',
    );
  });

  it('falls back to the raw text, truncated, for anything else', () => {
    expect(formatEventPayload('judge', 'ok', '{"violations": 2}')).toBe('{"violations": 2}');
    const raw = `{"foo": "${'y'.repeat(100)}"}`;
    const out = formatEventPayload('judge', 'ok', raw);
    expect(out.length).toBe(60);
    expect(out.startsWith('{"foo": "yyy')).toBe(true);
    expect(formatEventPayload('judge', 'ok', 'not json at all')).toBe('not json at all');
    expect(formatEventPayload('judge', 'ok', '')).toBe('');
  });

  it('does not treat a non-round refine event as a round', () => {
    expect(formatEventPayload('refine', 'start', '{"round": 1}')).toBe('{"round": 1}');
  });
});
