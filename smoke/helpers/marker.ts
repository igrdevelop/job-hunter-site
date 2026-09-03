/**
 * The rotating marker scheme (docs/LIVE_SMOKE_E2E.md, "The marker scheme"):
 * one run-scoped string, `smoke-<YYYYMMDD>-<HH>-<weekday>-<runId>` (UTC), that
 * E3 writes into its sentinel and REPLACES every run. The date/hour/weekday
 * part is the owner's rotation scheme; the trailing runId is
 * `GITHUB_RUN_ID.GITHUB_RUN_ATTEMPT` in CI (a random nonce locally) so two
 * runs in the same UTC hour — including a re-run of the same workflow — can
 * never share a marker and pass against each other's stale data (review
 * finding on the work order's own PR).
 */

const WEEKDAYS = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'] as const;

function pad2(n: number): string {
  return String(n).padStart(2, '0');
}

function runId(): string {
  const { GITHUB_RUN_ID, GITHUB_RUN_ATTEMPT } = process.env;
  if (GITHUB_RUN_ID && GITHUB_RUN_ATTEMPT) {
    return `${GITHUB_RUN_ID}.${GITHUB_RUN_ATTEMPT}`;
  }
  // Local run: a random nonce so two local runs (or a local run racing a CI
  // run) never collide either.
  return `local-${Math.random().toString(36).slice(2, 10)}`;
}

/** Builds this run's marker. `now` is injectable for tests; defaults to the real clock. */
export function buildRunMarker(now: Date = new Date()): string {
  const y = now.getUTCFullYear();
  const m = pad2(now.getUTCMonth() + 1);
  const d = pad2(now.getUTCDate());
  const h = pad2(now.getUTCHours());
  const weekday = WEEKDAYS[now.getUTCDay()];
  return `smoke-${y}${m}${d}-${h}-${weekday}-${runId()}`;
}

/**
 * Recognizes ANY marker this scheme could have produced — this run's or a
 * previous one's — so the sentinel can be found regardless of when it was
 * last written. Deliberately a shape check, not a bare `smoke-` prefix check:
 * a coincidental "smoke-tested this at the interview" extra the owner wrote
 * by hand must never be mistaken for the suite's own sentinel and overwritten.
 */
export const MARKER_RE = /^smoke-\d{8}-\d{2}-(?:sun|mon|tue|wed|thu|fri|sat)-\S+$/;
