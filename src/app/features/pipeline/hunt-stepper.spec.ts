import { HuntLiveRow, HuntNext } from '../../core/api/pipeline.models';
import { clonePipelineSample } from '../../core/api/pipeline.mock';
import {
  BOT_STATE_STALE_MS,
  buildHuntStepper,
  formatElapsed,
  lastHuntSummary,
  nextRunView,
} from './hunt-stepper';

/** The sample is frozen at 2026-09-22T12:00:00Z (Warsaw 14:00). */
const NOW = new Date('2026-09-22T12:00:00+00:00');

function activeRow(): HuntLiveRow {
  const row = clonePipelineSample().hunt.live?.active;
  if (!row) throw new Error('sample has no active hunt');
  return row;
}

function states(row: HuntLiveRow): string[] {
  return buildHuntStepper(row, NOW).items.map((i) => `${i.key}:${i.state}`);
}

describe('hunt stepper mapping', () => {
  it('maps the sample web hunt in fetch: waiting done, fetch now with live numbers', () => {
    const view = buildHuntStepper(activeRow(), NOW, 25);
    expect(view.items.map((i) => i.label)).toEqual([
      'waiting',
      'fetch',
      'filter',
      'dedup',
      'queue',
      'done',
    ]);
    expect(states(activeRow())).toEqual([
      'waiting:done',
      'fetch:now',
      'filter:pending',
      'dedup:pending',
      'act:pending',
      'done:pending',
    ]);
    const fetch = view.items[1];
    expect(fetch.detail).toBe('linkedin · 3/25 · found 41');
    expect(fetch.elapsed).toBe('1 min 55 s');
    expect(view.items.filter((i) => i.elapsed !== null)).toHaveLength(1);
    expect(view.heading).toBe('started from the site · all sources');
    // Without the bot's full count, a hunt's own sources_total never claims "all".
    expect(buildHuntStepper(activeRow(), NOW).heading).toBe('started from the site · 25 sources');
    expect(view.elapsed).toBe('2 min 00 s');
    expect(view.failed).toBe(false);
  });

  it('walks every step: earlier ones done, the current one now', () => {
    const row = activeRow();
    row.step = 'dedup';
    expect(states(row)).toEqual([
      'waiting:done',
      'fetch:done',
      'filter:done',
      'dedup:now',
      'act:pending',
      'done:pending',
    ]);
    const view = buildHuntStepper(row, NOW);
    expect(view.items[1].detail).toBe('25 sources · found 41');
    expect(view.items[1].elapsed).toBeNull();

    row.step = 'waiting';
    expect(states(row)[0]).toBe('waiting:now');
    expect(buildHuntStepper(row, NOW).items[1].detail).toBeNull();
  });

  it('marks every step done for step=done, and none as running', () => {
    const row = activeRow();
    row.step = 'done';
    const view = buildHuntStepper(row, NOW);
    expect(view.items.every((i) => i.state === 'done')).toBe(true);
    expect(view.items.every((i) => i.elapsed === null)).toBe(true);
  });

  it('claims no position for an error or unknown step', () => {
    const row = activeRow();
    row.step = 'error';
    const view = buildHuntStepper(row, NOW);
    expect(view.failed).toBe(true);
    expect(view.items.every((i) => i.state === 'pending')).toBe(true);
  });

  it('names a single-source and a retry hunt', () => {
    const row = activeRow();
    row.sources = ['linkedin'];
    row.sources_total = 1;
    expect(buildHuntStepper(row, NOW).heading).toBe('started from the site · linkedin');
    row.trigger = 'retry';
    row.sources = [];
    expect(buildHuntStepper(row, NOW).heading).toBe('retry failed');
  });

  it('summarises the last finished hunt in one line', () => {
    const last = clonePipelineSample().hunt.live?.last;
    if (!last) throw new Error('sample has no last hunt');
    expect(lastHuntSummary(last, NOW)).toBe(
      'Last hunt 13:22 · scheduled · pracuj · found 18 · took 2 min 10 s · done',
    );
    last.step = 'error';
    expect(lastHuntSummary(last, NOW)).toMatch(/· failed$/);
  });

  it('formats elapsed time and clamps clock skew to 0 s', () => {
    expect(formatElapsed(-5000)).toBe('0 s');
    expect(formatElapsed(42_000)).toBe('42 s');
    expect(formatElapsed(185_000)).toBe('3 min 05 s');
    expect(formatElapsed(62 * 60_000)).toBe('1 h 2 min');
  });
});

describe('next run header', () => {
  function sampleNext(): HuntNext {
    const next = clonePipelineSample().hunt.next;
    if (!next) throw new Error('sample has no next');
    return next;
  }

  it('shows the next hunt and retry in Warsaw time', () => {
    const view = nextRunView(sampleNext(), NOW);
    expect(view).toEqual({
      hunt: 'Next hunt 14:40 · justjoin (in 40 min)',
      retry: 'Next retry 09-23 02:45',
      offline: false,
    });
  });

  it('says "due now" once the slot has passed', () => {
    const view = nextRunView(sampleNext(), new Date('2026-09-22T12:41:00+00:00'));
    expect(view.hunt).toContain('(due now)');
  });

  it('is offline when bot_state is older than 5 minutes, missing, or never written', () => {
    const next = sampleNext();
    const updated = Date.parse(next.updated_at ?? '');
    expect(nextRunView(next, new Date(updated + BOT_STATE_STALE_MS)).offline).toBe(false);
    expect(nextRunView(next, new Date(updated + BOT_STATE_STALE_MS + 1000)).offline).toBe(true);
    expect(nextRunView(null, NOW)).toEqual({ hunt: null, retry: null, offline: true });
    expect(nextRunView({ ...next, updated_at: null }, NOW).offline).toBe(true);
  });

  it('drops a missing hunt or retry slot without inventing one', () => {
    const view = nextRunView({ ...sampleNext(), hunt: null, retry: null }, NOW);
    expect(view).toEqual({ hunt: null, retry: null, offline: false });
  });
});
