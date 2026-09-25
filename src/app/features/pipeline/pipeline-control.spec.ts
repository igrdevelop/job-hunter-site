import { HttpErrorResponse } from '@angular/common/http';
import { PipelineSnapshot } from '../../core/api/pipeline.models';
import { clonePipelineSample } from '../../core/api/pipeline.mock';
import {
  PIPELINE_FAST_POLL_MS,
  PIPELINE_POLL_MS,
  TrackedCommand,
  commandErrorMessage,
  commandLabel,
  commandRows,
  controlDisabled,
  mergeTracked,
  pollIntervalMs,
  terminalMessage,
} from './pipeline-control';

/** The sample with nothing live: no active hunt, no in-flight command, no apply run. */
function idle(): PipelineSnapshot {
  const s = clonePipelineSample();
  if (s.hunt.live) s.hunt.live.active = null;
  s.control = { sources: ['linkedin'], commands: [] };
  s.apply.in_progress = { count: 0, cards: [] };
  return s;
}

function tracked(status: string, kind: TrackedCommand['kind'] = 'hunt'): TrackedCommand {
  return { id: 'c1', kind, sources: null, status, error: '' };
}

describe('control bar disable rules', () => {
  it('enables everything when nothing is live', () => {
    expect(controlDisabled(idle(), null, false)).toEqual({
      hunt: null,
      retry: null,
      checkExpired: null,
    });
  });

  it('disables hunt and retry (not check expired) while a hunt is live', () => {
    const d = controlDisabled(clonePipelineSample(), null, false);
    expect(d.hunt).toContain('A hunt is running');
    expect(d.retry).toBe(d.hunt);
    // The sample's only in-flight command is the running hunt.
    expect(d.checkExpired).toBeNull();
  });

  it('says "retry" when the live row is a retry', () => {
    const s = clonePipelineSample();
    if (s.hunt.live?.active) s.hunt.live.active.trigger = 'retry';
    expect(controlDisabled(s, null, false).hunt).toContain('Failed rows are being retried');
  });

  it.each(['pending', 'running'])(
    'disables hunt and retry while a hunt/retry command is %s',
    (status) => {
      for (const kind of ['hunt', 'retry_failed'] as const) {
        const s = idle();
        s.control?.commands?.push({
          id: 'x',
          kind,
          payload: {},
          status,
          error: '',
          created_at: s.generated_at,
          started_at: null,
          finished_at: null,
        });
        const d = controlDisabled(s, null, false);
        expect(d.hunt).toContain('already waiting for the bot');
        expect(d.retry).toBe(d.hunt);
        expect(d.checkExpired).toBeNull();
      }
    },
  );

  it('counts the locally tracked command before the snapshot shows it', () => {
    expect(controlDisabled(idle(), tracked('pending'), false).hunt).not.toBeNull();
    expect(controlDisabled(idle(), tracked('done'), false).hunt).toBeNull();
  });

  it('disables only check expired while a check_expired command is in flight', () => {
    const d = controlDisabled(idle(), tracked('running', 'check_expired'), false);
    expect(d.checkExpired).toContain('expired-check');
    expect(d.hunt).toBeNull();
    expect(d.retry).toBeNull();
  });

  it('ignores terminal commands in the snapshot', () => {
    const s = clonePipelineSample();
    if (s.hunt.live) s.hunt.live.active = null;
    // Sample commands: running hunt, rejected hunt, done check_expired.
    s.control?.commands?.shift();
    expect(controlDisabled(s, null, false)).toEqual({
      hunt: null,
      retry: null,
      checkExpired: null,
    });
  });

  it('disables everything while a POST is on its way', () => {
    const d = controlDisabled(idle(), null, true);
    expect(d.hunt).toBe('Sending a command…');
    expect(d.checkExpired).toBe('Sending a command…');
  });

  it('tolerates a snapshot from an API without the control keys', () => {
    const s = idle() as Partial<PipelineSnapshot> as PipelineSnapshot;
    delete (s as { control?: unknown }).control;
    delete (s.hunt as { live?: unknown }).live;
    expect(controlDisabled(s, null, false).hunt).toBeNull();
    expect(pollIntervalMs(s, null)).toBe(PIPELINE_POLL_MS);
  });
});

describe('adaptive polling', () => {
  it('polls every 15 s when idle and before the first snapshot', () => {
    expect(PIPELINE_POLL_MS).toBe(15_000);
    expect(PIPELINE_FAST_POLL_MS).toBe(3_000);
    expect(pollIntervalMs(idle(), null)).toBe(PIPELINE_POLL_MS);
    expect(pollIntervalMs(null, null)).toBe(PIPELINE_POLL_MS);
  });

  it('polls every 3 s while a hunt is live', () => {
    const s = idle();
    s.hunt.live = clonePipelineSample().hunt.live;
    expect(pollIntervalMs(s, null)).toBe(PIPELINE_FAST_POLL_MS);
  });

  it('polls every 3 s while an apply run is in progress, but not for a stale one', () => {
    const s = idle();
    s.apply.in_progress = clonePipelineSample().apply.in_progress;
    expect(pollIntervalMs(s, null)).toBe(PIPELINE_FAST_POLL_MS);
    s.apply.in_progress.cards[0].stale = true;
    expect(pollIntervalMs(s, null)).toBe(PIPELINE_POLL_MS);
  });

  it('polls every 3 s while a command is pending or running (snapshot or tracked)', () => {
    expect(pollIntervalMs(idle(), tracked('pending'))).toBe(PIPELINE_FAST_POLL_MS);
    expect(pollIntervalMs(null, tracked('running'))).toBe(PIPELINE_FAST_POLL_MS);
    expect(pollIntervalMs(idle(), tracked('rejected'))).toBe(PIPELINE_POLL_MS);

    const s = idle();
    s.control = clonePipelineSample().control;
    expect(pollIntervalMs(s, null)).toBe(PIPELINE_FAST_POLL_MS);
  });
});

describe('command following', () => {
  it('merges a fresher row with the same id only', () => {
    const t = tracked('pending');
    expect(mergeTracked(t, { id: 'other', status: 'done', error: '' })).toBe(t);
    expect(mergeTracked(t, null)).toBe(t);
    expect(mergeTracked(t, { id: 'c1', status: 'pending', error: '' })).toBe(t);
    expect(
      mergeTracked(t, { id: 'c1', status: 'rejected', error: 'hunt already running' }),
    ).toEqual({ ...t, status: 'rejected', error: 'hunt already running' });
  });

  it('labels commands', () => {
    expect(commandLabel('hunt', null)).toBe('Hunt everywhere');
    expect(commandLabel('hunt', [])).toBe('Hunt everywhere');
    expect(commandLabel('hunt', ['linkedin'])).toBe('Hunt linkedin');
    expect(commandLabel('retry_failed', undefined)).toBe('Retry failed');
    expect(commandLabel('check_expired', null)).toBe('Check expired');
  });

  it('turns a terminal status into one snackbar line', () => {
    expect(
      terminalMessage({
        ...tracked('rejected'),
        sources: ['linkedin'],
        error: 'hunt already running',
      }),
    ).toBe('Hunt linkedin: rejected by the bot — hunt already running');
    expect(terminalMessage({ ...tracked('error', 'retry_failed'), error: 'boom' })).toBe(
      'Retry failed failed — boom',
    );
    expect(terminalMessage(tracked('done', 'check_expired'))).toBe('Check expired: done.');
    expect(terminalMessage(tracked('running'))).toBeNull();
  });

  it('maps POST failures onto what the owner can do', () => {
    const err = (status: number) => new HttpErrorResponse({ status });
    expect(commandErrorMessage(err(403))).toContain('Only the owner');
    expect(commandErrorMessage(err(409))).toContain('Busy');
    expect(commandErrorMessage(err(503))).toContain('may be offline');
    expect(commandErrorMessage(err(404))).toContain('not deployed');
    expect(commandErrorMessage(err(500))).toBe('Could not send the command.');
    expect(commandErrorMessage(new Error('x'))).toBe('Could not send the command.');
  });

  it('renders the recent commands with a tone per status', () => {
    const s = clonePipelineSample();
    const rows = commandRows(s.control?.commands ?? null, new Date(s.generated_at));
    expect(rows.map((r) => [r.label, r.status, r.tone, r.time])).toEqual([
      ['Hunt everywhere', 'running', 'live', '13:57'],
      ['Hunt linkedin', 'rejected', 'bad', '13:21'],
      ['Check expired', 'done', 'ok', '11:00'],
    ]);
    expect(rows[1].error).toBe('hunt already running');
    expect(commandRows(null, new Date())).toEqual([]);
  });
});
