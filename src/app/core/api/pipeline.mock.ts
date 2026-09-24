import { PipelineSnapshot } from './pipeline.models';

/**
 * Sample snapshot for the /pipeline page while GET /api/pipeline/snapshot is
 * undeployed. Served ONLY when PIPELINE_MOCK_FALLBACK_ENABLED and the GET
 * returns 404, and always flagged `sample: true` so the page shows a
 * "Sample data" banner — never presented as the user's real pipeline.
 *
 * Source: the `expected.json` in the bot repo's
 * `docs/PIPELINE_SNAPSHOT_CONTRACT.md` (fixture DB, clock frozen at
 * 2026-09-22T12:00:00Z, `--days 1 --user u1 --events 10`), with the keys the
 * contract lists as NOT served removed: `hunt.next_slot`, `coverage`,
 * `apply.queue_enabled_local_config`, `apply.failures.next_retry`.
 */
export const PIPELINE_SAMPLE_SNAPSHOT: PipelineSnapshot = {
  generated_at: '2026-09-22T12:00:00+00:00',
  window: { label: 'today', days: 1, start_utc: '2026-09-21T22:00:00+00:00', tz: 'Europe/Warsaw' },
  user_id: 'u1',
  hunt: {
    window: 'today',
    hunt_runs: {
      hunts: 2,
      found: 230,
      filtered_out: 190,
      dup_url: 33,
      dup_ct: 2,
      dup_cooldown: 1,
      new: 4,
      capped: 1,
      queued: 3,
      applied_inline: 0,
      duration_ms: 10000,
      last: {
        ts: '2026-09-22T11:50:00+00:00',
        at: '13:50',
        trigger: 'manual',
        sources: ['pracuj', 'justjoin'],
        found: 110,
        new: 2,
      },
      by_trigger: { scheduled: 1, manual: 1 },
      top_filter_reasons: [
        ['location', 110],
        ['level', 40],
        ['keyword', 40],
      ],
    },
    hunt_runs_unmeasured: null,
    source_runs: {
      runs: 3,
      found_raw: 230,
      sources_ran: 2,
      sources_last_run_ok: 1,
      errors: 1,
      per_source: {
        justjoin: { runs: 2, found: 230, errors: 0, last_ok: true },
        pracuj: { runs: 1, found: 0, errors: 1, last_ok: false },
      },
    },
    postings_seen: {
      unique_seen: 10,
      new_this_window: 10,
      passed: 3,
      rejected: 7,
      top_reasons: [['location', 7]],
    },
    entered_tracker: {
      rows: 12,
      by_status: { APPLIED: 5, EXPIRED: 1, FAIL: 2, IN_PROGRESS: 1, PENDING: 2, SKIP: 1 },
      by_source: [['justjoin', 12]],
    },
  },
  apply: {
    queue_mode_observed: true,
    pending: {
      count: 2,
      oldest_date: '2026-09-22',
      oldest_wait_min: 45,
      head: [
        { company: 'Acme', title: 'Angular Dev', source: 'justjoin', wait_min: 45 },
        { company: 'Beta', title: 'Angular Dev', source: 'justjoin', wait_min: 20 },
      ],
    },
    in_progress: {
      count: 1,
      cards: [
        {
          company: 'Example Corp',
          title: 'Angular Dev',
          source: 'justjoin',
          claimed_by: '',
          claimed_min_ago: 14,
          stale: false,
          run: {
            run_id: 'r_ip',
            pipeline: 'cli',
            profile: '',
            elapsed_min: 14,
            events: 7,
            last_event: { stage: 'refine', event: 'accepted', at: '13:59' },
            current_stage: { stage: 'refine', basis: 'refine round accepted' },
            stage_started_min_ago: 3,
            refine_progress: {
              round: 2,
              kind: 'honest',
              score: 90,
              best: 90,
              outcome: 'accepted',
              at: '13:59',
            },
            refine_target: 95,
            refine_max_rounds: 5,
            verdict_first: 85.0,
            verdict_final: 88.0,
            refine_rounds: 1,
            refine_accepted: null,
          },
        },
      ],
    },
    runs: {
      started: 9,
      outcomes: [
        ['ok', 3],
        ['(open)', 2],
        ['skip_doomed_gate', 1],
        ['expired', 1],
        ['cli_error', 1],
        ['orphan:cli_timeout', 1],
      ],
      cut_zero_cost: { expired: 1, skip_doomed_gate: 1 },
      cut_zero_cost_total: 2,
    },
    skipped_rows: {
      count: 2,
      by_reason: [
        ['EXPIRED', 1],
        ['doomed', 1],
      ],
    },
    failures: { in_window: 2, retryable_total: 1, gave_up_total: 1, log_records: null },
    llm_outage: { paused: true, remaining_min: 30 },
  },
  result: {
    ready: { count: 3, produced_in_window: 5, mean_verdict: 92.3 },
    sent_in_window: 1,
    outcomes_in_window: [],
    cost: { total_usd: 0.81, priced_rows: 2, unpriced_rows: 3, per_priced_row_usd: 0.41 },
  },
  events: [
    ev(
      '11:59:00',
      'refine',
      'accepted',
      'Example Corp',
      '{"round": 2, "kind": "honest", "score": 90, "best": 90}',
    ),
    ev(
      '11:58:00',
      'refine',
      'rejected',
      'Example Corp',
      '{"round": 1, "kind": "honest", "score": 84, "best": 85}',
    ),
    ev(
      '11:57:00',
      'refine',
      'start',
      'Example Corp',
      '{"target": 95, "max_rounds": 5, "verdict_first": 85}',
    ),
    ev('11:56:00', 'verdict', 'ok', 'Example Corp'),
    ev('11:53:00', 'judge', 'ok', 'Example Corp'),
    ev('11:51:00', 'generate', 'ok', 'Example Corp'),
    ev('11:46:00', 'fetch', 'ok', 'Example Corp'),
    ev('10:20:00', 'fetch', 'ok', ''),
    ev('10:20:00', 'fetch', 'ok', 'Lambda'),
    ev('10:20:00', 'fetch', 'ok', 'Kappa'),
  ],
};

function ev(time: string, stage: string, event: string, company: string, payload = '') {
  return {
    ts: `2026-09-22T${time}+00:00`,
    stage,
    event,
    duration_ms: 1000,
    company,
    pipeline: 'cli',
    payload,
  };
}

/** A fresh deep copy, so a consumer can never mutate the shared sample. */
export function clonePipelineSample(): PipelineSnapshot {
  return structuredClone(PIPELINE_SAMPLE_SNAPSHOT);
}
