import { HuntLiveRow, HuntNext } from '../../core/api/pipeline.models';
import { formatMinutes, formatSnapshotTime } from './pipeline.view';

/**
 * Pure mapping of a `hunt_live` row onto the hunt stepper, plus the header's
 * next-run line. Every time is computed against a `now` the caller passes in
 * (the page uses its estimate of the SERVER clock, so a skewed browser clock
 * never shows a negative elapsed time).
 */
export const HUNT_STEPS = ['waiting', 'fetch', 'filter', 'dedup', 'act', 'done'] as const;

export type HuntStepKey = (typeof HUNT_STEPS)[number];

const HUNT_STEP_LABELS: Record<HuntStepKey, string> = {
  waiting: 'waiting',
  fetch: 'fetch',
  filter: 'filter',
  dedup: 'dedup',
  act: 'queue',
  done: 'done',
};

const TRIGGER_LABELS: Record<string, string> = {
  scheduled: 'scheduled',
  manual: 'Telegram /hunt',
  web: 'started from the site',
  retry: 'retry failed',
};

export type HuntStepState = 'done' | 'now' | 'pending';

export interface HuntStepItem {
  key: HuntStepKey;
  label: string;
  state: HuntStepState;
  /** fetch: current source · k/N · found so far (numbers once finished too). */
  detail: string | null;
  /** Time on the active step; `null` on every other step. */
  elapsed: string | null;
}

export interface HuntStepperView {
  items: HuntStepItem[];
  /** "started from the site · linkedin" — who started it and on what. */
  heading: string;
  /** Total time since the hunt row was written. */
  elapsed: string;
  /** The row says `error` (the bot stamped a failure while it was still active). */
  failed: boolean;
}

export function buildHuntStepper(row: HuntLiveRow, now: Date): HuntStepperView {
  const index = (HUNT_STEPS as readonly string[]).indexOf(row.step);
  const failed = row.step === 'error';
  const finished = row.step === 'done';

  const items = HUNT_STEPS.map((key, i): HuntStepItem => {
    const state: HuntStepState =
      index < 0 ? 'pending' : finished || i < index ? 'done' : i === index ? 'now' : 'pending';
    return {
      key,
      label: HUNT_STEP_LABELS[key],
      state,
      detail: key === 'fetch' ? fetchDetail(row, state) : null,
      elapsed: state === 'now' && !finished ? elapsedSince(row.step_started_at, now) : null,
    };
  });

  return {
    items,
    heading: huntHeading(row),
    elapsed: elapsedSince(row.started_at, now) ?? '',
    failed,
  };
}

/** One compact line for the newest finished hunt when nothing is running. */
export function lastHuntSummary(row: HuntLiveRow, now: Date): string {
  const parts = [
    `Last hunt ${formatSnapshotTime(row.finished_at ?? row.started_at, now)}`,
    huntHeading(row),
    `found ${row.found_so_far}`,
  ];
  const took = row.finished_at ? durationBetween(row.started_at, row.finished_at) : null;
  if (took) parts.push(`took ${took}`);
  parts.push(row.step === 'error' ? 'failed' : 'done');
  return parts.join(' · ');
}

function huntHeading(row: HuntLiveRow): string {
  const who = TRIGGER_LABELS[row.trigger] ?? row.trigger;
  const sources = row.sources ?? [];
  const what =
    sources.length === 0
      ? null
      : sources.length === 1
        ? sources[0]
        : row.sources_total > 0 && sources.length >= row.sources_total
          ? 'all sources'
          : `${sources.length} sources`;
  return what ? `${who} · ${what}` : who;
}

function fetchDetail(row: HuntLiveRow, state: HuntStepState): string | null {
  if (state === 'pending') return null;
  if (state === 'done') {
    return `${row.sources_total} ${row.sources_total === 1 ? 'source' : 'sources'} · found ${row.found_so_far}`;
  }
  const parts = [
    row.current_source || null,
    row.sources_total > 0 ? `${row.sources_done}/${row.sources_total}` : null,
    `found ${row.found_so_far}`,
  ];
  return parts.filter((p): p is string => !!p).join(' · ');
}

function elapsedSince(iso: string, now: Date): string | null {
  const t = Date.parse(iso);
  if (Number.isNaN(t)) return null;
  return formatElapsed(now.getTime() - t);
}

function durationBetween(fromIso: string, toIso: string): string | null {
  const from = Date.parse(fromIso);
  const to = Date.parse(toIso);
  if (Number.isNaN(from) || Number.isNaN(to)) return null;
  return formatElapsed(to - from);
}

/** `42 s`, `3 min 05 s`, `1 h 2 min`; negative (clock skew) clamps to 0 s. */
export function formatElapsed(ms: number): string {
  const sec = Math.max(0, Math.floor(ms / 1000));
  if (sec < 60) return `${sec} s`;
  const min = Math.floor(sec / 60);
  if (min < 60) return `${min} min ${String(sec % 60).padStart(2, '0')} s`;
  return formatMinutes(min);
}

/** The bot rewrites `bot_state.*` every 60 s; older than this means it stopped. */
export const BOT_STATE_STALE_MS = 5 * 60_000;

export interface NextRunView {
  /** "Next hunt 13:40 · linkedin (in 23 min)"; `null` when unknown. */
  hunt: string | null;
  /** "Next retry 02:45"; `null` when unknown. */
  retry: string | null;
  /** No scheduler facts, or they are older than 5 minutes. */
  offline: boolean;
}

export function nextRunView(next: HuntNext | null, now: Date): NextRunView {
  const updated = next?.updated_at ? Date.parse(next.updated_at) : NaN;
  const offline = !next || Number.isNaN(updated) || now.getTime() - updated > BOT_STATE_STALE_MS;
  if (!next) return { hunt: null, retry: null, offline };

  let hunt: string | null = null;
  if (next.hunt) {
    const at = Date.parse(next.hunt.at);
    if (!Number.isNaN(at)) {
      const inMin = Math.ceil((at - now.getTime()) / 60_000);
      const when = inMin <= 0 ? 'due now' : `in ${formatMinutes(inMin)}`;
      const source = next.hunt.source ? ` · ${next.hunt.source}` : '';
      hunt = `Next hunt ${formatSnapshotTime(next.hunt.at, now)}${source} (${when})`;
    }
  }
  const retry =
    next.retry && !Number.isNaN(Date.parse(next.retry.at))
      ? `Next retry ${formatSnapshotTime(next.retry.at, now)}`
      : null;
  return { hunt, retry, offline };
}
