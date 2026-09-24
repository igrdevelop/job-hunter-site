import { PipelineSnapshot } from '../../core/api/pipeline.models';
import { clonePipelineSample } from '../../core/api/pipeline.mock';
import {
  applyCards,
  eventRows,
  formatEventTime,
  huntCards,
  resultCards,
  verdictHeadline,
} from './pipeline.view';

function byLabel(cards: ReturnType<typeof huntCards>, label: string) {
  const card = cards.find((c) => c.label === label);
  if (!card) throw new Error(`no card ${label}`);
  return card;
}

describe('pipeline view models', () => {
  let s: PipelineSnapshot;
  beforeEach(() => (s = clonePipelineSample()));

  it('maps the contract sample onto the Hunt cards', () => {
    const cards = huntCards(s);
    expect(cards.map((c) => c.label)).toEqual(['Found', 'Filtered', 'Duplicates', 'New → queued']);
    expect(byLabel(cards, 'Found')).toMatchObject({ value: '230', sub: '2 hunts · 2 sources ran' });
    expect(byLabel(cards, 'Filtered')).toMatchObject({
      value: '190',
      sub: 'location 110 · level 40 · keyword 40',
    });
    expect(byLabel(cards, 'Duplicates')).toMatchObject({
      value: '36',
      sub: 'url 33 · company/title 2 · cooldown 1',
    });
    expect(byLabel(cards, 'New → queued')).toMatchObject({
      value: '4 → 3',
      sub: '1 over the run cap',
    });
  });

  it('renders every Hunt card as unmeasured (null value) when all hunt blocks are null', () => {
    s.hunt.hunt_runs = null;
    s.hunt.hunt_runs_unmeasured = 'hunt_runs table missing';
    s.hunt.source_runs = null;
    s.hunt.postings_seen = null;
    const cards = huntCards(s);
    expect(cards.every((c) => c.value === null)).toBe(true);
    expect(byLabel(cards, 'Duplicates').sub).toBe('hunt_runs table missing');
  });

  it('falls back to source_runs / postings_seen when only hunt_runs is null — never to 0', () => {
    s.hunt.hunt_runs = null;
    const cards = huntCards(s);
    expect(byLabel(cards, 'Found')).toMatchObject({ value: '230', sub: '2 sources ran' });
    expect(byLabel(cards, 'Filtered').value).toBe('7');
    expect(byLabel(cards, 'Filtered').sub).toContain('unique postings');
    expect(byLabel(cards, 'Duplicates').value).toBeNull();
  });

  it('maps the Apply cards and marks a null runs block unmeasured', () => {
    const cards = applyCards(s);
    expect(byLabel(cards, 'Queued')).toMatchObject({ value: '2', sub: 'oldest waits 45 min' });
    expect(byLabel(cards, 'In progress').value).toBe('1');
    expect(byLabel(cards, 'Cut at $0')).toMatchObject({
      value: '2',
      sub: 'expired 1 · doomed gate 1',
    });
    expect(byLabel(cards, 'Failures')).toMatchObject({ value: '2', sub: '1 gave up (all time)' });

    s.apply.runs = null;
    s.apply.pending.oldest_wait_min = null;
    const degraded = applyCards(s);
    expect(byLabel(degraded, 'Cut at $0').value).toBeNull();
    expect(byLabel(degraded, 'Queued').sub).toBeNull();
  });

  it('never prints $0.00 for unpriced (CLI) rows', () => {
    expect(byLabel(resultCards(s), 'LLM spend')).toMatchObject({
      value: '$0.81',
      sub: '2 priced · 3 unpriced (CLI)',
    });

    s.result.cost = { total_usd: 0, priced_rows: 0, unpriced_rows: 4, per_priced_row_usd: null };
    const spend = byLabel(resultCards(s), 'LLM spend');
    expect(spend.value).toBe('—');
    expect(spend.sub).toBe('0 priced · 4 unpriced (CLI)');
  });

  it('summarises outcomes and the ready stack', () => {
    const cards = resultCards(s);
    expect(byLabel(cards, 'Ready to send')).toMatchObject({ value: '3', sub: 'mean verdict 92.3' });
    expect(byLabel(cards, 'Outcomes')).toMatchObject({ value: '0', sub: 'none recorded' });

    s.result.outcomes_in_window = [
      ['rejected', 2],
      ['interview', 1],
    ];
    s.result.ready.mean_verdict = null;
    const next = resultCards(s);
    expect(byLabel(next, 'Outcomes')).toMatchObject({
      value: '3',
      sub: 'rejected 2 · interview 1',
    });
    expect(byLabel(next, 'Ready to send').sub).toBe('no verdict yet');
  });

  it('caps the events footer at 15 rows and keeps the API order', () => {
    const many = Array.from({ length: 20 }, (_, i) => ({ ...s.events![0], company: `C${i}` }));
    const rows = eventRows(many, new Date('2026-09-22T12:00:00Z'));
    expect(rows).toHaveLength(15);
    expect(rows[0].company).toBe('C0');
    expect(eventRows(s.events!, new Date())[7].company).toBe('—');
  });

  describe('verdictHeadline', () => {
    const baseRun = () => clonePipelineSample().apply.in_progress.cards[0].run!;

    it("shows first → the refine loop's best so far, not the stale verdict_final column", () => {
      const run = baseRun(); // verdict_final 88, refine_progress.best 90
      expect(verdictHeadline(run)).toBe('verdict 85 → 90 (target 95)');
    });

    it('falls back to verdict_final without refine progress, then to first alone', () => {
      const run = baseRun();
      run.refine_progress = null;
      expect(verdictHeadline(run)).toBe('verdict 85 → 88 (target 95)');
      run.verdict_final = null;
      expect(verdictHeadline(run)).toBe('verdict 85 (target 95)');
      run.verdict_first = null;
      expect(verdictHeadline(run)).toBe('verdict — (target 95)');
      expect(verdictHeadline(null)).toBe('verdict — (target 95)');
    });

    it("uses the run's own refine_target, 95 when null", () => {
      const run = baseRun();
      run.refine_target = 90;
      expect(verdictHeadline(run)).toBe('verdict 85 → 90 (target 90)');
      run.refine_target = null;
      expect(verdictHeadline(run)).toContain('(target 95)');
    });
  });

  it('formats event payloads into human lines in the footer', () => {
    const rows = eventRows(s.events!, new Date());
    expect(rows[0].payload).toBe('round 2 · honest · 90 (best 90)');
    expect(rows[2].payload).toBe('target 95 · up to 5 rounds · from 85');
    expect(rows[3].payload).toBe('');
  });

  it('formats event time as HH:MM today and MM-DD HH:MM otherwise', () => {
    const ts = '2026-09-22T11:59:00+00:00';
    const d = new Date(ts);
    const hhmm = `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
    expect(formatEventTime(ts, d)).toBe(hhmm);
    expect(formatEventTime(ts, new Date(d.getTime() + 3 * 86_400_000))).toMatch(
      /^\d\d-\d\d \d\d:\d\d$/,
    );
    expect(formatEventTime('garbage', d)).toBe('--:--');
  });
});
