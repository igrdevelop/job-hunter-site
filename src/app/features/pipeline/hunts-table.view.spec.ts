import { describe, expect, it } from 'vitest';
import { HuntDetail, HuntJob, HuntListRow } from '../../core/api/pipeline.models';
import {
  detailMoving,
  funnelSteps,
  huntRowView,
  jobRowView,
  sourcesLabel,
  vacancyChips,
} from './hunts-table.view';

const NOW = new Date('2026-09-27T10:00:00+00:00');

function row(over: Partial<HuntListRow> = {}): HuntListRow {
  return {
    hunt_id: 'h1',
    trigger: 'scheduled',
    sources: ['justjoin', 'pracuj'],
    started_at: '2026-09-27T08:00:00+00:00',
    step: 'done',
    step_started_at: '2026-09-27T08:01:30+00:00',
    current_source: '',
    sources_done: 2,
    sources_total: 2,
    found_so_far: 57,
    command_id: '',
    finished_at: '2026-09-27T08:01:30+00:00',
    status: 'done',
    duration_sec: 90,
    counts: {
      found: 57,
      filtered_out: 47,
      dup_url: 1,
      dup_ct: 1,
      dup_cooldown: 0,
      new: 9,
      capped: 1,
      queued: 8,
      applied_inline: 0,
      duration_ms: 90000,
    },
    vacancies: { total: 3, by_state: { ready: 1, queued: 1, duplicate: 1 } },
    ...over,
  };
}

function job(over: Partial<HuntJob> = {}): HuntJob {
  return {
    url: 'https://ex.com/j1',
    url_norm: 'ex.com/j1',
    source: 'justjoin',
    title: 'Angular Dev',
    company: 'Acme',
    fate: 'queued',
    fate_detail: '',
    tracker: null,
    run: null,
    state: 'no_record',
    ...over,
  };
}

const tracker = (over: Partial<NonNullable<HuntJob['tracker']>> = {}) => ({
  status: 'PENDING',
  sent: '',
  queue_position: null,
  wait_min: null,
  skip_reason: '',
  folder: '',
  drive_url: '',
  ats_verdict: null,
  cost_usd: null,
  ...over,
});

describe('huntRowView', () => {
  it('a finished hunt: Warsaw time, funnel, chips, duration', () => {
    const v = huntRowView(row(), NOW, 25);
    expect(v.time).toBe('10:00'); // 08:00 UTC = 10:00 CEST
    expect(v.trigger).toBe('schedule');
    expect(v.sources).toBe('2 sources');
    expect(v.status).toEqual({ text: 'done', tone: 'ok' });
    expect(v.funnel).toBe('found 57 → passed 10 → new 9 → queued 8');
    expect(v.duration).toBe('1 min 30 s');
    expect(v.chips?.map((c) => c.label)).toEqual(['in queue', 'ready', 'dup']);
    expect(v.moving).toBe(true); // one vacancy is still queued
  });

  it('a hunt fetching now has no counts yet', () => {
    const v = huntRowView(
      row({
        status: 'running',
        step: 'fetch',
        finished_at: null,
        duration_sec: null,
        sources_done: 1,
        found_so_far: 30,
        counts: null,
        vacancies: { total: 0, by_state: {} },
      }),
      NOW,
      25,
    );
    expect(v.status).toEqual({ text: 'fetch 1/2', tone: 'live' });
    expect(v.funnel).toBe('found 30 so far');
    expect(v.duration).toBe('2 h');
    expect(v.moving).toBe(true);
  });

  it('a failed hunt, and an old bot without hunt_jobs', () => {
    const v = huntRowView(row({ status: 'error', step: 'error', vacancies: null }), NOW, 25);
    expect(v.status.tone).toBe('bad');
    expect(v.chips).toBeNull();
    expect(v.moving).toBe(false);
  });

  it('sourcesLabel', () => {
    expect(sourcesLabel([], 25)).toBe('—');
    expect(sourcesLabel(['linkedin'], 25)).toBe('linkedin');
    expect(sourcesLabel(['a', 'b'], 2)).toBe('all sources');
    expect(sourcesLabel(['a', 'b'], null)).toBe('2 sources');
  });

  it('vacancyChips keeps the fixed order and drops zeros', () => {
    expect(vacancyChips({ total: 3, by_state: { duplicate: 2, generating: 1, sent: 0 } })).toEqual([
      { label: 'generating', count: 1, tone: 'live' },
      { label: 'dup', count: 2, tone: 'muted' },
    ]);
  });
});

function detail(over: Partial<HuntDetail> = {}): HuntDetail {
  const { vacancies: _v, ...hunt } = row();
  return {
    hunt,
    per_source: { justjoin: 57, pracuj: 'ERR' },
    filter_reasons: [
      ['level', 30],
      ['location', 17],
    ],
    vacancies: { total: 1, by_state: { queued: 1 } },
    jobs: [job({ state: 'queued' })],
    ...over,
  };
}

describe('funnelSteps', () => {
  it('breaks each step down', () => {
    expect(funnelSteps(detail())).toEqual([
      { label: 'Found', value: 57, sub: 'justjoin 57 · pracuj ERR' },
      { label: 'Passed filter', value: 10, sub: 'cut 47: level 30 · location 17' },
      { label: 'Duplicates', value: 2, sub: 'url 1 · company+title 1' },
      { label: 'New', value: 9, sub: 'queued 8 · capped 1' },
    ]);
  });

  it('no counts: only what the live row knows', () => {
    const d = detail();
    d.hunt = { ...d.hunt, counts: null, found_so_far: 12 };
    expect(funnelSteps(d).map((s) => s.value)).toEqual([12, null, null, null]);
  });
});

describe('jobRowView', () => {
  it('queued: position and wait', () => {
    const v = jobRowView(
      job({ state: 'queued', tracker: tracker({ queue_position: 2, wait_min: 119 }) }),
      NOW,
    );
    expect(v.state.label).toBe('in queue');
    expect(v.detail).toBe('#2 in queue · waiting 1 h 59 min');
  });

  it('ready: verdict and Drive link', () => {
    const v = jobRowView(
      job({
        state: 'ready',
        tracker: tracker({ status: 'APPLIED', ats_verdict: 93, drive_url: 'https://drive.test/g' }),
      }),
      NOW,
    );
    expect(v.detail).toBe('ATS 93');
    expect(v.link).toEqual({ href: 'https://drive.test/g', label: 'Drive' });
  });

  it('generating: verdict headline from the open run', () => {
    const v = jobRowView(
      job({
        state: 'generating',
        run: {
          run_id: 'g2',
          pipeline: 'api',
          started_at: '2026-09-27T09:40:00+00:00',
          finished_at: null,
          outcome: null,
          verdict_first: 85,
          verdict_final: null,
          refine_rounds: null,
          cost_usd: null,
          live: {
            run_id: 'g2',
            pipeline: 'api',
            profile: '',
            elapsed_min: 20,
            events: 4,
            last_event: null,
            current_stage: { stage: 'refine', basis: 'refine round accepted' },
            stage_started_min_ago: 10,
            refine_progress: {
              round: 2,
              kind: 'honest',
              score: 90,
              best: 90,
              outcome: 'accepted',
              ts: '2026-09-27T09:55:00+00:00',
            },
            refine_target: 95,
            refine_max_rounds: 5,
            verdict_first: 85,
            verdict_final: null,
            refine_rounds: null,
            refine_accepted: null,
          },
        },
      }),
      NOW,
    );
    expect(v.detail).toBe('verdict 85 → 90 (target 95)');
    expect(v.live?.current_stage.stage).toBe('refine');
  });

  it('duplicate: what and where', () => {
    const v = jobRowView(job({ state: 'duplicate', fate: 'dup_ct', fate_detail: 'fuzzy' }), NOW);
    expect(v.detail).toBe('same company + title · fuzzy title match');
    expect(v.state.tone).toBe('muted');
  });

  it('skipped shows the reason', () => {
    const v = jobRowView(
      job({
        state: 'skipped',
        tracker: tracker({ status: 'SKIP', skip_reason: 'doomed:pl_onsite' }),
      }),
      NOW,
    );
    expect(v.detail).toBe('doomed:pl_onsite');
  });
});

describe('detailMoving', () => {
  it('moves while a vacancy is queued or generating, or the hunt runs', () => {
    expect(detailMoving(detail())).toBe(true);
    expect(detailMoving(detail({ jobs: [job({ state: 'sent' })] }))).toBe(false);
    const running = detail({ jobs: [] });
    running.hunt = { ...running.hunt, status: 'running' };
    expect(detailMoving(running)).toBe(true);
  });
});
