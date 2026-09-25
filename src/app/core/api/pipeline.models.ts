/**
 * GET /api/pipeline/snapshot?days=1|7 — the served shape, copied (not
 * imported) from job-hunter-api's response builder
 * (`src/pipeline/pipeline-snapshot.ts`), which ports the bot repo's
 * `docs/PIPELINE_SNAPSHOT_CONTRACT.md` minus its "Not in the contract" keys:
 * no `hunt.next_slot`, `hunt.window`, `coverage`,
 * `apply.queue_enabled_local_config`, `apply.failures.next_retry`, no `at`
 * display strings and no `events[].payload`. Every time is a raw UTC `ts`
 * (`…+00:00`); the page formats it itself in Europe/Warsaw.
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
  hunt_runs: HuntRunsBlock | null;
  hunt_runs_unmeasured: string | null;
  source_runs: SourceRunsBlock | null;
  postings_seen: PostingsSeenBlock | null;
  entered_tracker: EnteredTrackerBlock;
  /**
   * Live hunt state (bot `hunt_live` table). `null` when the table does not
   * exist yet. Absent on an API that predates the control PRs — consumers read
   * it with `?? null`.
   */
  live: HuntLive | null;
  /** Scheduler facts (bot `config` KV `bot_state.*`); `null` when never written. */
  next: HuntNext | null;
}

export type HuntLiveStep = 'waiting' | 'fetch' | 'filter' | 'dedup' | 'act' | 'done' | 'error';

export type HuntTrigger = 'scheduled' | 'manual' | 'web' | 'retry';

/** One `hunt_live` row, `sources` parsed. Every timestamp is raw UTC `…+00:00`. */
export interface HuntLiveRow {
  hunt_id: string;
  trigger: HuntTrigger | string;
  sources: string[];
  started_at: string;
  step: HuntLiveStep | string;
  step_started_at: string;
  current_source: string;
  sources_done: number;
  sources_total: number;
  found_so_far: number;
  command_id: string;
  finished_at: string | null;
}

export interface HuntLive {
  /** The hunt running (or waiting for the lock) right now; `null` when idle. */
  active: HuntLiveRow | null;
  /** The newest finished hunt. */
  last: HuntLiveRow | null;
}

export interface NextHunt {
  at: string;
  source: string;
  sources_total: number;
}

export interface NextRetry {
  at: string;
}

export interface HuntNext {
  hunt: NextHunt | null;
  retry: NextRetry | null;
  /** When the bot last wrote its scheduler facts; stale > 5 min ⇒ "bot offline". */
  updated_at: string | null;
}

export type BotCommandKind = 'hunt' | 'retry_failed' | 'check_expired';

export type BotCommandStatus = 'pending' | 'running' | 'done' | 'error' | 'rejected';

/** `hunt` payload: `{"sources": ["linkedin"]}` or `{"sources": null}` (= every source). */
export interface BotCommandPayload {
  sources?: string[] | null;
}

export interface BotCommand {
  id: string;
  kind: BotCommandKind | string;
  payload: BotCommandPayload | null;
  status: BotCommandStatus | string;
  /** The reason for `rejected`, the failure for `error`; '' otherwise. */
  error: string;
  created_at: string;
  started_at: string | null;
  finished_at: string | null;
}

export interface Control {
  /** Source names the bot can hunt (`bot_state.sources`); `null` when never written. */
  sources: string[] | null;
  /** The 10 newest `bot_commands` rows, newest first; `null` when the table is missing. */
  commands: BotCommand[] | null;
}

/** POST /api/pipeline/commands body. */
export interface PostCommandBody {
  kind: BotCommandKind;
  sources?: string[] | null;
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
  /** Raw UTC timestamp of the event. */
  ts: string;
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
  /** Raw UTC timestamp of the round's decision event. */
  ts: string;
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

/**
 * The stable fields of an event's FULL payload, parsed server-side. Each key is
 * present only when the payload had it; numeric keys are passed through as-is
 * (so a consumer still type-checks them), `error` is cut to 200 chars and
 * `reason` to 120.
 */
export interface EventDetails {
  round?: unknown;
  kind?: unknown;
  score?: unknown;
  best?: unknown;
  target?: unknown;
  max_rounds?: unknown;
  verdict_first?: unknown;
  chars?: unknown;
  error?: string;
  reason?: string;
}

export interface PipelineEvent {
  /** Raw UTC timestamp. */
  ts: string;
  stage: string;
  event: string;
  duration_ms: number | null;
  company: string;
  pipeline: string;
  /** `null` for an empty/unparseable payload or one with none of the known keys. */
  details: EventDetails | null;
}

export interface PipelineSnapshot {
  generated_at: string;
  window: PipelineWindow;
  user_id: string;
  hunt: HuntTier;
  apply: ApplyTier;
  result: ResultTier;
  events: PipelineEvent[] | null;
  /** Owner control surface; `null` when the bot has not written it yet. */
  control: Control | null;
}

/** What the page receives: the snapshot plus whether it is the offline sample. */
export interface PipelineSnapshotResult {
  snapshot: PipelineSnapshot;
  /** True when served from the mock fallback, never from the API. */
  sample: boolean;
}
