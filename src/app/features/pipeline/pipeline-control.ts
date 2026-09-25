import { HttpErrorResponse } from '@angular/common/http';
import {
  BotCommand,
  BotCommandKind,
  BotCommandStatus,
  PipelineSnapshot,
} from '../../core/api/pipeline.models';
import { formatSnapshotTime } from './pipeline.view';

/**
 * Pure rules for the owner control bar: which buttons are disabled and why,
 * how fast the page polls, and how a sent command's status is followed.
 */

/** Idle poll cadence while the tab is visible (docs/PIPELINE_VIZ_PLAN.md: 10–15 s). */
export const PIPELINE_POLL_MS = 15_000;
/** While a hunt, an apply run or a command is live — the bot drains commands every 3 s. */
export const PIPELINE_FAST_POLL_MS = 3_000;

/** A command this page sent, followed until it reaches a terminal status. */
export interface TrackedCommand {
  id: string;
  kind: BotCommandKind;
  sources: string[] | null;
  status: BotCommandStatus | string;
  error: string;
}

export function isInFlight(status: string): boolean {
  return status === 'pending' || status === 'running';
}

export function isTerminal(status: string): boolean {
  return status === 'done' || status === 'error' || status === 'rejected';
}

/** Hunt and retry share the bot's hunt lock, so they share the busy rule. */
function usesHuntLock(kind: string): boolean {
  return kind === 'hunt' || kind === 'retry_failed';
}

function inFlightCommands(
  s: PipelineSnapshot | null,
  tracked: TrackedCommand | null,
): { kind: string }[] {
  const out: { kind: string }[] = (s?.control?.commands ?? []).filter((c) => isInFlight(c.status));
  if (tracked && isInFlight(tracked.status)) out.push(tracked);
  return out;
}

export interface ControlDisabled {
  /** Tooltip text when disabled, `null` when enabled. Applies to every hunt button. */
  hunt: string | null;
  retry: string | null;
  checkExpired: string | null;
}

/**
 * Hunt/retry: disabled while a hunt is live or a hunt/retry command is pending
 * or running (the owner's "disable, don't queue" decision — the API answers 409
 * and the bot rejects it anyway). Check expired: only while a check_expired
 * command is in flight. Everything: while a POST is on its way.
 */
export function controlDisabled(
  s: PipelineSnapshot | null,
  tracked: TrackedCommand | null,
  posting: boolean,
): ControlDisabled {
  if (posting) {
    const why = 'Sending a command…';
    return { hunt: why, retry: why, checkExpired: why };
  }
  const inFlight = inFlightCommands(s, tracked);
  const active = s?.hunt.live?.active ?? null;

  let lockReason: string | null = null;
  if (active) {
    lockReason =
      active.trigger === 'retry'
        ? 'Failed rows are being retried right now — wait for it to finish.'
        : 'A hunt is running right now — wait for it to finish.';
  } else if (inFlight.some((c) => usesHuntLock(c.kind))) {
    lockReason = 'A hunt or retry command is already waiting for the bot.';
  }

  const expiredReason = inFlight.some((c) => c.kind === 'check_expired')
    ? 'An expired-check is already queued or running.'
    : null;

  return { hunt: lockReason, retry: lockReason, checkExpired: expiredReason };
}

/**
 * 3 s while anything visibly moves — a live hunt, a (non-stale) apply run, a
 * command in flight — else the idle 15 s.
 */
export function pollIntervalMs(s: PipelineSnapshot | null, tracked: TrackedCommand | null): number {
  if (tracked && isInFlight(tracked.status)) return PIPELINE_FAST_POLL_MS;
  if (!s) return PIPELINE_POLL_MS;
  if (s.hunt.live?.active) return PIPELINE_FAST_POLL_MS;
  if (s.apply.in_progress.cards.some((c) => !c.stale)) return PIPELINE_FAST_POLL_MS;
  if ((s.control?.commands ?? []).some((c) => isInFlight(c.status))) return PIPELINE_FAST_POLL_MS;
  return PIPELINE_POLL_MS;
}

/** Updates the tracked command from a fresher server row (same id); otherwise unchanged. */
export function mergeTracked(
  tracked: TrackedCommand,
  row: Pick<BotCommand, 'id' | 'status' | 'error'> | null | undefined,
): TrackedCommand {
  if (!row || row.id !== tracked.id) return tracked;
  if (row.status === tracked.status && (row.error ?? '') === tracked.error) return tracked;
  return { ...tracked, status: row.status, error: row.error ?? '' };
}

export function findCommand(s: PipelineSnapshot | null, id: string): BotCommand | undefined {
  return (s?.control?.commands ?? []).find((c) => c.id === id);
}

/** "Hunt everywhere" / "Hunt linkedin" / "Retry failed" / "Check expired". */
export function commandLabel(kind: string, sources: string[] | null | undefined): string {
  switch (kind) {
    case 'hunt':
      return sources && sources.length ? `Hunt ${sources.join(', ')}` : 'Hunt everywhere';
    case 'retry_failed':
      return 'Retry failed';
    case 'check_expired':
      return 'Check expired';
    default:
      return kind;
  }
}

/** Snackbar text once a tracked command ends; `null` for a silent end. */
export function terminalMessage(t: TrackedCommand): string | null {
  const label = commandLabel(t.kind, t.sources);
  if (t.status === 'rejected')
    return `${label}: rejected by the bot — ${t.error || 'no reason given'}`;
  if (t.status === 'error') return `${label} failed — ${t.error || 'no details'}`;
  if (t.status === 'done') return `${label}: done.`;
  return null;
}

/** Maps a failed POST onto what the owner can do about it. */
export function commandErrorMessage(err: unknown): string {
  const status = err instanceof HttpErrorResponse ? err.status : null;
  switch (status) {
    case 403:
      return 'Only the owner can start the bot from here.';
    case 409:
      return 'Busy — a hunt or retry is already running or waiting. Try again when it finishes.';
    case 503:
      return 'Bot state is unavailable — the bot may be offline. Try again later.';
    case 404:
      return 'Starting the bot from the site is not deployed on the API yet.';
    case 0:
      return 'Could not reach the API.';
    default:
      return 'Could not send the command.';
  }
}

export interface CommandRow {
  id: string;
  label: string;
  status: string;
  tone: 'ok' | 'bad' | 'live' | 'neutral';
  time: string;
  error: string;
}

/** The recent-commands line under the buttons (newest first, the API already orders them). */
export function commandRows(commands: BotCommand[] | null, now: Date, max = 5): CommandRow[] {
  return (commands ?? []).slice(0, max).map((c) => ({
    id: c.id,
    label: commandLabel(c.kind, c.payload?.sources ?? null),
    status: c.status,
    tone:
      c.status === 'done'
        ? 'ok'
        : c.status === 'error' || c.status === 'rejected'
          ? 'bad'
          : isInFlight(c.status)
            ? 'live'
            : 'neutral',
    time: formatSnapshotTime(c.created_at, now),
    error: c.error ?? '',
  }));
}
