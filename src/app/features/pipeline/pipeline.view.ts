import {
  CountPairs,
  InProgressRun,
  PipelineEvent,
  PipelineSnapshot,
} from '../../core/api/pipeline.models';
import { formatEventPayload } from './event-payload';
import { verdictTarget } from './stage-strip';

/**
 * Pure snapshot → view-model mapping for the /pipeline stat cards. Kept out of
 * the component so the null/UNMEASURED rules are unit-testable on their own.
 *
 * A card with `value: null` renders the calm "not measured yet" state — it is
 * how a `null` block from the API reaches the screen. Never substitute 0 for a
 * block that is missing: 0 is a fact, null means the table does not exist yet.
 */
export interface StatCardView {
  label: string;
  value: string | null;
  sub: string | null;
  /** Colours the number: accent for the tier's headline, warn for failures. */
  tone?: 'default' | 'warn' | 'ok';
}

export const UNMEASURED_TEXT = 'Not measured yet';

const ZERO_COST_LABELS: Record<string, string> = {
  expired: 'expired',
  too_short: 'too short',
  skip_react_pre_llm: 'React-only',
  skip_backend_only: 'backend-only',
  skip_doomed_gate: 'doomed gate',
  reused_repost: 're-post reused',
  skip_prescreen: 'prescreen',
};

export function huntCards(s: PipelineSnapshot): StatCardView[] {
  const { hunt_runs: hr, source_runs: sr, postings_seen: ps, hunt_runs_unmeasured: why } = s.hunt;

  const foundValue = hr ? hr.found : (sr?.found_raw ?? null);
  const foundSub = joinParts([
    hr ? plural(hr.hunts, 'hunt') : null,
    sr ? `${sr.sources_ran} ${sr.sources_ran === 1 ? 'source' : 'sources'} ran` : null,
  ]);

  let filtered: StatCardView;
  if (hr) {
    filtered = card('Filtered', hr.filtered_out, topReasons(hr.top_filter_reasons));
  } else if (ps) {
    // Fallback: unique postings, not per-sweep rows — say so.
    filtered = card(
      'Filtered',
      ps.rejected,
      joinParts(['unique postings', topReasons(ps.top_reasons)]),
    );
  } else {
    filtered = unmeasured('Filtered');
  }

  return [
    foundValue === null
      ? unmeasured('Found')
      : { ...card('Found', foundValue, foundSub), tone: 'ok' },
    filtered,
    hr
      ? card(
          'Duplicates',
          hr.dup_url + hr.dup_ct + hr.dup_cooldown,
          `url ${hr.dup_url} · company/title ${hr.dup_ct} · cooldown ${hr.dup_cooldown}`,
        )
      : unmeasured('Duplicates', why),
    hr
      ? {
          label: 'New → queued',
          value: `${hr.new} → ${hr.queued}`,
          sub: joinParts([
            hr.capped > 0 ? `${hr.capped} over the run cap` : null,
            hr.applied_inline > 0 ? `${hr.applied_inline} applied inline` : null,
          ]),
        }
      : unmeasured('New → queued', why),
  ];
}

export function applyCards(s: PipelineSnapshot): StatCardView[] {
  const { pending, in_progress, runs, failures } = s.apply;
  const stale = in_progress.cards.filter((c) => c.stale).length;

  const cutSub = runs
    ? Object.entries(runs.cut_zero_cost)
        .filter(([, n]) => n > 0)
        .sort((a, b) => b[1] - a[1])
        .map(([outcome, n]) => `${ZERO_COST_LABELS[outcome] ?? outcome} ${n}`)
        .join(' · ') || 'nothing cut'
    : null;

  return [
    card(
      'Queued',
      pending.count,
      pending.oldest_wait_min !== null
        ? `oldest waits ${formatMinutes(pending.oldest_wait_min)}`
        : null,
    ),
    card('In progress', in_progress.count, stale > 0 ? `${stale} stale` : null),
    runs ? card('Cut at $0', runs.cut_zero_cost_total, cutSub) : unmeasured('Cut at $0'),
    {
      ...card('Failures', failures.in_window, `${failures.gave_up_total} gave up (all time)`),
      tone: failures.in_window > 0 ? 'warn' : 'default',
    },
  ];
}

export function resultCards(s: PipelineSnapshot): StatCardView[] {
  const { ready, sent_in_window, outcomes_in_window, cost } = s.result;
  const outcomesTotal = outcomes_in_window.reduce((sum, [, n]) => sum + n, 0);

  // A CLI-served run stamps cost 0.0 = UNPRICED, not free: never show it as
  // "$0.00", and never divide the total across unpriced rows.
  const spendValue = cost.priced_rows > 0 ? `$${cost.total_usd.toFixed(2)}` : '—';
  const spendSub = joinParts([
    `${cost.priced_rows} priced`,
    cost.unpriced_rows > 0 ? `${cost.unpriced_rows} unpriced (CLI)` : null,
  ]);

  return [
    {
      ...card(
        'Ready to send',
        ready.count,
        ready.mean_verdict !== null ? `mean verdict ${ready.mean_verdict}` : 'no verdict yet',
      ),
      tone: 'ok',
    },
    card('Sent', sent_in_window, s.window.label),
    card(
      'Outcomes',
      outcomesTotal,
      outcomes_in_window.length
        ? outcomes_in_window.map(([l, n]) => `${l} ${n}`).join(' · ')
        : 'none recorded',
    ),
    { label: 'LLM spend', value: spendValue, sub: spendSub },
  ];
}

export interface EventRow {
  time: string;
  stage: string;
  event: string;
  company: string;
  payload: string;
  tone: 'ok' | 'bad' | 'neutral';
}

export const EVENTS_MAX = 15;

/** Newest first (the API already orders them), capped at 15. */
export function eventRows(events: PipelineEvent[], now: Date): EventRow[] {
  return events.slice(0, EVENTS_MAX).map((e) => ({
    time: formatEventTime(e.ts, now),
    stage: e.stage.replaceAll('_', ' '),
    event: e.event,
    company: e.company || '—',
    payload: formatEventPayload(e.stage, e.event, e.payload),
    tone:
      e.event === 'error' || e.event === 'blocked'
        ? 'bad'
        : e.event === 'ok' || e.event === 'accepted'
          ? 'ok'
          : 'neutral',
  }));
}

/** `HH:MM` for today (browser local time), `MM-DD HH:MM` otherwise, `--:--` if unparseable. */
export function formatEventTime(ts: string, now: Date): string {
  const d = new Date(ts);
  if (Number.isNaN(d.getTime())) return '--:--';
  const hhmm = `${pad(d.getHours())}:${pad(d.getMinutes())}`;
  const sameDay =
    d.getFullYear() === now.getFullYear() &&
    d.getMonth() === now.getMonth() &&
    d.getDate() === now.getDate();
  return sameDay ? hhmm : `${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${hhmm}`;
}

/**
 * The run card's verdict headline: `first → best so far (target N)`.
 * Best so far = `refine_progress.best` while the refine loop is running, else
 * `verdict_final`, else just `first`. The raw `verdict_final` column is stamped
 * only after the loop, so during refine it lags the loop's own best — it never
 * headlines while a round has been decided.
 */
export function verdictHeadline(run: InProgressRun | null): string {
  const target = `(target ${verdictTarget(run)})`;
  const first = run?.verdict_first ?? null;
  const best = run?.refine_progress?.best ?? run?.verdict_final ?? null;
  if (first === null && best === null) return `verdict — ${target}`;
  if (first === null) return `verdict ${fmtVerdict(best)} ${target}`;
  if (best === null) return `verdict ${fmtVerdict(first)} ${target}`;
  return `verdict ${fmtVerdict(first)} → ${fmtVerdict(best)} ${target}`;
}

function fmtVerdict(v: number | null): string {
  return v === null ? '—' : String(Math.round(v));
}

export function formatMinutes(min: number): string {
  if (min < 60) return `${min} min`;
  const h = Math.floor(min / 60);
  const m = min % 60;
  return m ? `${h} h ${m} min` : `${h} h`;
}

function card(label: string, value: number, sub: string | null): StatCardView {
  return { label, value: String(value), sub };
}

function unmeasured(label: string, why: string | null = null): StatCardView {
  return { label, value: null, sub: why };
}

function topReasons(pairs: CountPairs): string | null {
  return pairs.length
    ? pairs
        .slice(0, 3)
        .map(([r, n]) => `${r} ${n}`)
        .join(' · ')
    : null;
}

function plural(n: number, word: string): string {
  return `${n} ${word}${n === 1 ? '' : 's'}`;
}

function joinParts(parts: (string | null)[]): string | null {
  const kept = parts.filter((p): p is string => !!p);
  return kept.length ? kept.join(' · ') : null;
}

function pad(n: number): string {
  return String(n).padStart(2, '0');
}
