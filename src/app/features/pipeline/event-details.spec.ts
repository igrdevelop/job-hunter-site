import { formatEventDetails, groupThousands } from './event-details';

describe('formatEventDetails', () => {
  it('shows nothing for null details', () => {
    expect(formatEventDetails('verdict', 'ok', null)).toBe('');
  });

  it('formats a refine round', () => {
    expect(
      formatEventDetails('refine', 'accepted', { round: 2, kind: 'honest', score: 90, best: 90 }),
    ).toBe('round 2 · honest · 90 (best 90)');
  });

  it('formats a discarded round (score null) without a score', () => {
    expect(
      formatEventDetails('refine', 'discarded', {
        round: 4,
        kind: 'stretch',
        score: null,
        best: 90,
        reason: 'judge flagged a fabrication',
      }),
    ).toBe('round 4 · stretch · (best 90)');
  });

  it('formats a refine start', () => {
    expect(
      formatEventDetails('refine', 'start', { target: 95, max_rounds: 5, verdict_first: 85 }),
    ).toBe('target 95 · up to 5 rounds · from 85');
  });

  it('formats score and chars', () => {
    expect(formatEventDetails('verdict', 'ok', { score: 91 })).toBe('score 91');
    expect(formatEventDetails('ats_loop', 'ok', { score: 87.5 })).toBe('score 87.5');
    expect(formatEventDetails('fetch', 'ok', { chars: 3112 })).toBe('3 112 chars');
    expect(groupThousands(1234567)).toBe('1 234 567');
    expect(groupThousands(42)).toBe('42');
  });

  it('shows the error text cut to ~80 chars', () => {
    const out = formatEventDetails('generate', 'error', { error: 'x'.repeat(200) });
    expect(out.length).toBe(80);
    expect(out.endsWith('…')).toBe(true);
    expect(formatEventDetails('fetch', 'error', { error: 'HTTP 429' })).toBe('HTTP 429');
  });

  it('falls back to reason alone, and ignores values of the wrong type', () => {
    expect(formatEventDetails('judge', 'blocked', { reason: 'fabricated employer' })).toBe(
      'fabricated employer',
    );
    expect(formatEventDetails('verdict', 'ok', { score: '91' })).toBe('');
    expect(formatEventDetails('refine', 'accepted', { round: 'two', kind: 'honest' })).toBe('');
  });
});
