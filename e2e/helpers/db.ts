import { DatabaseSync } from 'node:sqlite';
import { readRunState } from '../scratch';

/**
 * Direct access to the per-run scratch SQLite files the API under test uses
 * (paths from e2e/.state/run.json). Built-in `node:sqlite` — no native
 * dependency to compile. Harness-only: it plays roles outside the site's
 * contract (the mail inbox, the bot), never replaces something a test should
 * drive through the UI or the API.
 *
 * Same busy discipline as the API (busy_timeout 5000) since both processes
 * touch the same WAL-mode files.
 */
function open(path: string): DatabaseSync {
  const db = new DatabaseSync(path);
  db.exec('PRAGMA busy_timeout = 5000');
  return db;
}

function withDb<T>(path: string, fn: (db: DatabaseSync) => T): T {
  const db = open(path);
  try {
    return fn(db);
  } finally {
    db.close();
  }
}

function appDb<T>(fn: (db: DatabaseSync) => T): T {
  return withDb(readRunState().appDbPath, fn);
}

function trackerDb<T>(fn: (db: DatabaseSync) => T): T {
  return withDb(readRunState().trackerDbPath, fn);
}

interface UserRow {
  id: string;
  email_verified: number;
  role: string;
}

export function findUser(email: string): UserRow | undefined {
  return appDb(
    (db) =>
      db.prepare('SELECT id, email_verified, role FROM users WHERE email = ?').get(email) as
        | UserRow
        | undefined,
  );
}

function requireUser(email: string): UserRow {
  const user = findUser(email);
  if (!user) {
    throw new Error(
      `e2e db: no user ${email} in ${readRunState().appDbPath}. If the API was reused ` +
        `(reuseExistingServer), it is probably running on a different scratch dir — ` +
        `stop it or pin E2E_SCRATCH_DIR to the dir it uses.`,
    );
  }
  return user;
}

/**
 * The newest unexpired verification token for `email` — what the
 * verification mail would carry (SMTP is unset in e2e, so the API only logs
 * the link). Table: app.sqlite `email_verification_tokens`.
 */
export function getVerificationToken(email: string): string | null {
  const user = requireUser(email);
  const row = appDb(
    (db) =>
      db
        .prepare(
          `SELECT token FROM email_verification_tokens
            WHERE user_id = ? AND expires_at > ?
            ORDER BY expires_at DESC LIMIT 1`,
        )
        .get(user.id, new Date().toISOString()) as { token: string } | undefined,
  );
  return row?.token ?? null;
}

/** Flips `users.email_verified` directly, for tests that don't exercise the verify flow. */
export function verifyEmail(email: string): void {
  const result = appDb((db) =>
    db.prepare('UPDATE users SET email_verified = 1 WHERE email = ?').run(email),
  );
  if (Number(result.changes) !== 1) {
    requireUser(email);
    throw new Error(`e2e db: verifyEmail(${email}) updated ${result.changes} rows`);
  }
}

/**
 * Hands the fixture tracker rows that still have no owner (`user_id = ''`) to
 * `email`'s account. Returns how many rows it claimed.
 *
 * The fixture copy reaches the API with `user_id` already added and blank
 * (see preAddUserIdColumn in e2e/scratch.ts — the API's own migration crashes
 * on its fixture), so the API's owner backfill never runs; this plays that
 * backfill. It would be needed even without that workaround: TrackerService
 * runs the backfill in its CONSTRUCTOR, before AuthService.onModuleInit seeds
 * the admin, so on a fresh app.sqlite the backfill runs with an empty owner
 * id and the seeded owner never gets the rows.
 */
export function claimUnownedApplications(email: string): number {
  const user = requireUser(email);
  const result = trackerDb((db) =>
    db.prepare(`UPDATE applications SET user_id = ? WHERE user_id = ''`).run(user.id),
  );
  return Number(result.changes);
}

export function countApplications(email: string): number {
  const user = requireUser(email);
  const row = trackerDb(
    (db) =>
      db.prepare('SELECT COUNT(*) AS c FROM applications WHERE user_id = ?').get(user.id) as {
        c: number;
      },
  );
  return Number(row.c);
}

/**
 * Appends one `source_runs` row stamped now — what the bot's hunt loop writes
 * after each `source.search()` (hunter/source_health.py). The fixture's own
 * rows are months old, so without this every window of the pipeline page is
 * empty. `ts` uses the bot's format (UTC seconds, `+00:00`), which the API
 * compares as text against its window start.
 */
export function recordSourceRun(source: string, found: number): void {
  const ts = new Date().toISOString().slice(0, 19) + '+00:00';
  trackerDb((db) =>
    db
      .prepare('INSERT INTO source_runs (source, ts, yield, ok, error) VALUES (?, ?, ?, 1, ?)')
      .run(source, ts, found, ''),
  );
}
