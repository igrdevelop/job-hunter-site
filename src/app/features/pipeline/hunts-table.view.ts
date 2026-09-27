import {
  HuntDetail,
  HuntJob,
  HuntJobState,
  HuntListRow,
  HuntVacancies,
  InProgressRun,
} from '../../core/api/pipeline.models';
import { formatElapsed } from './hunt-stepper';
import { formatMinutes, formatSnapshotTime, verdictHeadline } from './pipeline.view';

/**
 * Pure mapping of GET /api/pipeline/hunts rows and one hunt's drill-down onto
 * the hunts table (bot repo docs/HUNT_DRILLDOWN_PLAN.md). Every time is
 * computed against the `now` the caller passes (the page's server-clock
 * estimate) and formatted in Europe/Warsaw.
 */

export type Tone = 'ok' | 'bad' | 'live' | 'muted' | 'neutral';

const TRIGGER_SHORT: Record<string, string> = {
  scheduled: 'schedule',
  manual: '/hunt',
  web: 'site',
  retry: 'retry',
};

/** Short label + tone per vacancy state, in the order the chips list them. */
const STATE_META: Record<HuntJobState, { label: string; tone: Tone }> = {
  generating: { label: 'generating', tone: 'live' },
  queued: { label: 'in queue', tone: 'live' },
  ready: { label: 'ready', tone: 'ok' },
  sent: { label: 'sent', tone: 'ok' },
  declined: { label: 'declined', tone: 'muted' },
  skipped: { label: 'skipped', tone: 'muted' },
  failed: { label: 'failed', tone: 'bad' },
  expired: { label: 'expired', tone: 'muted' },
  manual: { label: 'manual', tone: 'neutral' },
  awaiting_decision: { label: 'awaiting you', tone: 'neutral' },
  capped: { label: 'capped', tone: 'muted' },
  not_acted: { label: 'not acted', tone: 'muted' },
  no_record: { label: 'no record', tone: 'muted' },
  duplicate: { label: 'dup', tone: 'muted' },
};

const STATE_ORDER = Object.keys(STATE_META) as HuntJobState[];

/** States that change without a new hunt — while any is present, keep polling the detail. */
const MOVING_STATES: readonly string[] = ['generating', 'queued'];

export interface Chip {
  label: string;
  count: number;
  tone: Tone;
}

export interface HuntRowView {
  id: string;
  time: string;
  trigger: string;
  sources: string;
  status: { text: string; tone: Tone };
  /** `found 57 → passed 10 → new 9 → queued 8`; `null` when there is nothing to show. */
  funnel: string | null;
  /** Vacancy states, most urgent first; `null` when the bot does not record them yet. */
  chips: Chip[] | null;
  duration: string | null;
  /** The hunt or one of its vacancies is still moving. */
  moving: boolean;
}

export function huntRowView(row: HuntListRow, now: Date, allSources: number | null): HuntRowView {
  const moving = row.status === 'waiting' || row.status === 'running' || hasMoving(row.vacancies);
  return {
    id: row.hunt_id,
    time: formatSnapshotTime(row.started_at, now),
    trigger: TRIGGER_SHORT[row.trigger] ?? row.trigger,
    sources: sourcesLabel(row.sources ?? [], allSources),
    status: statusView(row),
    funnel: funnelText(row),
    chips: row.vacancies ? vacancyChips(row.vacancies) : null,
    duration:
      row.duration_sec !== null
        ? formatElapsed(row.duration_sec * 1000)
        : row.status === 'running'
          ? formatElapsed(now.getTime() - Date.parse(row.started_at))
          : null,
    moving,
  };
}

export function sourcesLabel(sources: string[], allSources: number | null): string {
  if (sources.length === 0) return '—';
  if (sources.length === 1) return sources[0];
  if (allSources !== null && allSources > 0 && sources.length >= allSources) return 'all sources';
  return `${sources.length} sources`;
}

function statusView(row: HuntListRow): { text: string; tone: Tone } {
  if (row.status === 'waiting') return { text: 'waiting', tone: 'live' };
  if (row.status === 'running') {
    if (row.step === 'fetch' && row.sources_total > 0) {
      return { text: `fetch ${row.sources_done}/${row.sources_total}`, tone: 'live' };
    }
    return { text: row.step === 'act' ? 'queueing' : row.step, tone: 'live' };
  }
  if (row.status === 'error') return { text: 'failed', tone: 'bad' };
  return { text: 'done', tone: 'ok' };
}

function funnelText(row: HuntListRow): string | null {
  const c = row.counts;
  if (c) {
    const parts = [`found ${c.found}`, `passed ${c.found - c.filtered_out}`, `new ${c.new}`];
    if (c.queued) parts.push(`queued ${c.queued}`);
    if (c.applied_inline) parts.push(`applied ${c.applied_inline}`);
    return parts.join(' → ');
  }
  if (row.status === 'running' || row.status === 'waiting') {
    return row.found_so_far ? `found ${row.found_so_far} so far` : null;
  }
  return null;
}

export function vacancyChips(v: HuntVacancies): Chip[] {
  return STATE_ORDER.filter((s) => (v.by_state[s] ?? 0) > 0).map((s) => ({
    label: STATE_META[s].label,
    count: v.by_state[s] ?? 0,
    tone: STATE_META[s].tone,
  }));
}

function hasMoving(v: HuntVacancies | null): boolean {
  return !!v && MOVING_STATES.some((s) => (v.by_state[s as HuntJobState] ?? 0) > 0);
}

// ── One hunt's drill-down ─────────────────────────────────────────────────────

export interface FunnelStep {
  label: string;
  /** `null` = not measured (a retry pass, a running hunt, an older bot). */
  value: number | null;
  sub: string | null;
}

/** Found → passed the filter → duplicates → new, each with its breakdown. */
export function funnelSteps(d: HuntDetail): FunnelStep[] {
  const c = d.hunt.counts;
  if (!c) {
    return [
      { label: 'Found', value: d.hunt.found_so_far ?? null, sub: null },
      { label: 'Passed filter', value: null, sub: null },
      { label: 'Duplicates', value: null, sub: null },
      { label: 'New', value: null, sub: null },
    ];
  }
  const perSource = d.per_source
    ? Object.entries(d.per_source)
        .map(([name, n]) => `${name} ${n}`)
        .join(' · ')
    : null;
  const reasons = (d.filter_reasons ?? [])
    .slice(0, 3)
    .map(([r, n]) => `${r} ${n}`)
    .join(' · ');
  const dups = [
    c.dup_url ? `url ${c.dup_url}` : null,
    c.dup_ct ? `company+title ${c.dup_ct}` : null,
    c.dup_cooldown ? `cooldown ${c.dup_cooldown}` : null,
  ].filter((p): p is string => !!p);
  const act = [
    c.queued ? `queued ${c.queued}` : null,
    c.applied_inline ? `applied ${c.applied_inline}` : null,
    c.capped ? `capped ${c.capped}` : null,
  ].filter((p): p is string => !!p);
  return [
    { label: 'Found', value: c.found, sub: perSource || null },
    {
      label: 'Passed filter',
      value: c.found - c.filtered_out,
      sub: c.filtered_out ? `cut ${c.filtered_out}${reasons ? ': ' + reasons : ''}` : null,
    },
    {
      label: 'Duplicates',
      value: c.dup_url + c.dup_ct + c.dup_cooldown,
      sub: dups.join(' · ') || null,
    },
    { label: 'New', value: c.new, sub: act.join(' · ') || null },
  ];
}

export interface JobRowView {
  title: string;
  company: string;
  source: string;
  url: string;
  state: { label: string; tone: Tone };
  detail: string | null;
  /** The open run behind a `generating` row, for the stage strip. */
  live: InProgressRun | null;
  link: { href: string; label: string } | null;
}

const DUP_LABELS: Record<string, string> = {
  dup_url: 'same URL',
  dup_ct: 'same company + title',
  dup_cooldown: 'company cooldown',
};

const DUP_WHERE: Record<string, string> = {
  tracker: 'already in the tracker',
  'same hunt': 'twice in this hunt',
  fuzzy: 'fuzzy title match',
};

export function jobRowView(job: HuntJob, now: Date): JobRowView {
  const meta = STATE_META[job.state as HuntJobState] ?? { label: job.state, tone: 'neutral' };
  const t = job.tracker;
  const live = job.state === 'generating' ? (job.run?.live ?? null) : null;
  let detail: string | null = null;
  let link: JobRowView['link'] = null;
  switch (job.state) {
    case 'queued':
      detail = [
        t?.queue_position ? `#${t.queue_position} in queue` : null,
        t?.wait_min !== null && t?.wait_min !== undefined
          ? `waiting ${formatMinutes(t.wait_min)}`
          : null,
      ]
        .filter(Boolean)
        .join(' · ');
      break;
    case 'generating':
      detail = live ? verdictHeadline(live) : 'no generation metrics yet';
      break;
    case 'ready':
    case 'sent':
      detail = [
        t?.ats_verdict !== null && t?.ats_verdict !== undefined
          ? `ATS ${Math.round(t.ats_verdict)}`
          : null,
        job.state === 'sent' && t?.sent ? `sent ${t.sent}` : null,
      ]
        .filter(Boolean)
        .join(' · ');
      if (t?.drive_url) link = { href: t.drive_url, label: 'Drive' };
      break;
    case 'skipped':
      detail = t?.skip_reason || null;
      break;
    case 'failed':
      detail = job.run?.outcome ? `last run: ${job.run.outcome}` : null;
      break;
    case 'duplicate':
      detail = [
        DUP_LABELS[job.fate] ?? job.fate,
        DUP_WHERE[job.fate_detail] ?? (job.fate_detail || null),
      ]
        .filter(Boolean)
        .join(' · ');
      break;
    case 'capped':
      detail = 'cut by the per-hunt cap';
      break;
    case 'not_acted':
      detail = 'apply was paused or not ready — returns next hunt';
      break;
    case 'awaiting_decision':
      detail = 'Telegram card, waiting for Apply / Skip';
      break;
    case 'no_record':
      detail = 'no tracker row';
      break;
  }
  if (job.run?.finished_at && job.state !== 'generating' && !detail) {
    detail = `finished ${formatSnapshotTime(job.run.finished_at, now)}`;
  }
  return {
    title: job.title || '—',
    company: job.company || '—',
    source: job.source,
    url: job.url,
    state: meta,
    detail: detail || null,
    live,
    link,
  };
}

/** Keep refreshing an open detail only while something in it can still change. */
export function detailMoving(d: HuntDetail): boolean {
  if (d.hunt.status === 'waiting' || d.hunt.status === 'running') return true;
  return (d.jobs ?? []).some((j) => MOVING_STATES.includes(j.state));
}
