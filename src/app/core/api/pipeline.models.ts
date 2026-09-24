/**
 * GET /api/pipeline/snapshot?days=1|7 — the served shape.
 *
 * Mirrors the bot repo's `docs/PIPELINE_SNAPSHOT_CONTRACT.md` (PIPELINE_VIZ_PLAN
 * M2). Only keys IN the contract are typed here: `hunt.next_slot`, `coverage`,
 * `apply.queue_enabled_local_config` and `apply.failures.next_retry` are local-
 * config diagnostics the API does not serve, so the page never reads them.
 *
 * `null` means UNMEASURED (the table behind that block does not exist on the
 * server's DB yet), never zero — every consumer must render a calm "not measured
 * yet" state for it rather than a 0 presented as a fact.
 */

/** A `Counter.most_common()` result: `[label, count]` pairs, count descending. */
export type CountPairs = [string, number][];

export type PipelineDays = 1 | 7;

export interface PipelineWindow {
  label: string;
  days: number;
  start_utc: string;
  tz: string;
}

export interface HuntRunsLast {
  ts: string;
  /** Display helper — the API may drop it (format from `ts` instead). */
  at?: string;
  trigger: string;
  sources: string[];
  found: number;
  new: number;
}

export interface HuntRunsBlock {
  hunts: number;
  found: number;
  filtered_out: number;
  dup_url: number;
  dup_ct: number;
  dup_cooldown: number;
  new: number;
  capped: number;
  queued: number;
  applied_inline: number;
  duration_ms: number;
  last: HuntRunsLast | null;
  by_trigger: Record<string, number>;
  top_filter_reasons: CountPairs;
}

export interface SourceRunStats {
  runs: number;
  found: number;
  errors: number;
  last_ok: boolean;
}

export interface SourceRunsBlock {
  runs: number;
  found_raw: number;
  sources_ran: number;
  sources_last_run_ok: number;
  errors: number;
  per_source: Record<string, SourceRunStats>;
}

export interface PostingsSeenBlock {
  unique_seen: number;
  new_this_window: number;
  passed: number;
  rejected: number;
  top_reasons: CountPairs;
}

export interface EnteredTrackerBlock {
  rows: number;
  by_status: Record<string, number>;
  by_source: CountPairs;
}

export interface HuntTier {
  /** Duplicate of `window.label`, kept by the tool for its text report. */
  window?: string;
  hunt_runs: HuntRunsBlock | null;
  hunt_runs_unmeasured: string | null;
  source_runs: SourceRunsBlock | null;
  postings_seen: PostingsSeenBlock | null;
  entered_tracker: EnteredTrackerBlock;
}

export interface PendingHeadRow {
  company: string;
  title: string;
  source: string;
  wait_min: number | null;
}

export interface PendingBlock {
  count: number;
  oldest_date: string | null;
  oldest_wait_min: number | null;
  head: PendingHeadRow[];
}

export interface StageEventRef {
  stage: string;
  event: string;
  at?: string;
}

export interface CurrentStage {
  stage: string;
  /** `start event` | `refine round <event>` | `last event was <event>` | `inferred: …` | `no events yet`. */
  basis: string;
}

export interface RefineProgress {
  round: number | null;
  kind: string | null;
  score: number | null;
  best: number | null;
  outcome: string;
  at?: string;
}

export interface InProgressRun {
  run_id: string;
  pipeline: string;
  profile: string;
  elapsed_min: number | null;
  events: number;
  last_event: StageEventRef | null;
  current_stage: CurrentStage;
  stage_started_min_ago: number | null;
  refine_progress: RefineProgress | null;
  /**
   * From this run's own refine `start` event (not config). `null` before the loop
   * starts, when it never runs, or on a pre-M1 run — the page falls back to its
   * display defaults (95 / 5).
   */
  refine_target: number | null;
  refine_max_rounds: number | null;
  verdict_first: number | null;
  verdict_final: number | null;
  refine_rounds: number | null;
  refine_accepted: number | null;
}

export interface InProgressCard {
  company: string;
  title: string;
  source: string;
  claimed_by: string;
  claimed_min_ago: number | null;
  stale: boolean;
  run: InProgressRun | null;
}

export interface InProgressBlock {
  count: number;
  cards: InProgressCard[];
}

export interface RunsBlock {
  started: number;
  outcomes: CountPairs;
  cut_zero_cost: Record<string, number>;
  cut_zero_cost_total: number;
}

export interface SkippedRowsBlock {
  count: number;
  by_reason: CountPairs;
}

export interface FailureLogRecords {
  in_window: number;
  by_outcome: CountPairs;
}

export interface FailuresBlock {
  in_window: number;
  retryable_total: number;
  gave_up_total: number;
  log_records: FailureLogRecords | null;
}

export interface LlmOutage {
  paused: boolean;
  remaining_min: number;
}

export interface ApplyTier {
  queue_mode_observed: boolean;
  pending: PendingBlock;
  in_progress: InProgressBlock;
  runs: RunsBlock | null;
  skipped_rows: SkippedRowsBlock | null;
  failures: FailuresBlock;
  llm_outage: LlmOutage;
}

export interface ReadyBlock {
  count: number;
  produced_in_window: number;
  mean_verdict: number | null;
}

export interface CostBlock {
  total_usd: number;
  priced_rows: number;
  unpriced_rows: number;
  per_priced_row_usd: number | null;
}

export interface ResultTier {
  ready: ReadyBlock;
  sent_in_window: number;
  outcomes_in_window: CountPairs;
  cost: CostBlock;
}

export interface PipelineEvent {
  at?: string;
  ts: string;
  stage: string;
  event: string;
  duration_ms: number | null;
  company: string;
  pipeline: string;
  /** Display string truncated to 80 chars server-side — never parsed as JSON. */
  payload: string;
}

export interface PipelineSnapshot {
  generated_at: string;
  window: PipelineWindow;
  user_id: string;
  hunt: HuntTier;
  apply: ApplyTier;
  result: ResultTier;
  events: PipelineEvent[] | null;
}

/** What the page receives: the snapshot plus whether it is the offline sample. */
export interface PipelineSnapshotResult {
  snapshot: PipelineSnapshot;
  /** True when served from the mock fallback, never from the API. */
  sample: boolean;
}
