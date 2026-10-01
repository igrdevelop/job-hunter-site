import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

/**
 * Per-run scratch data for the local e2e suite: a fresh temp dir holding the
 * API's app.sqlite, its users/ root and a COPY of the API's fixture
 * tracker.db (the fixture in the api repo stays pristine; tests may mutate
 * the copy freely).
 *
 * Why this runs at config-load time and not in `globalSetup`: Playwright 1.62
 * starts `webServer` BEFORE `globalSetup` (runner `createGlobalSetupTasks`:
 * plugin setup tasks — the web servers — come first), and the API needs these
 * paths in its env when it boots. The config module is also re-evaluated in
 * every worker process, so the dir is created only once — in the runner
 * process — and handed down through `E2E_SCRATCH_DIR`, which workers inherit.
 *
 * Pinning `E2E_SCRATCH_DIR` yourself reuses that dir (e.g. to point the suite
 * at a stack you left running with `reuseExistingServer`); the db helpers
 * must look at the same files the running API uses.
 */
export interface RunState {
  scratchDir: string;
  appDbPath: string;
  trackerDbPath: string;
  usersRoot: string;
  apiDir: string;
  apiUrl: string;
  siteUrl: string;
}

export const SITE_ROOT = path.resolve(__dirname, '..');
export const STATE_FILE = path.join(__dirname, '.state', 'run.json');
export const API_PORT = 3100;
export const SITE_PORT = 4300;

const SCRATCH_PREFIX = 'jh-e2e-';
const STALE_AFTER_MS = 24 * 60 * 60 * 1000;

export function resolveApiDir(): string {
  const fromEnv = process.env['API_DIR']?.trim();
  return path.resolve(SITE_ROOT, fromEnv || path.join('..', 'api'));
}

/** Best-effort cleanup of scratch dirs left behind by earlier runs. */
function pruneStaleScratchDirs(keep: string): void {
  const tmp = os.tmpdir();
  let entries: string[] = [];
  try {
    entries = fs.readdirSync(tmp).filter((name) => name.startsWith(SCRATCH_PREFIX));
  } catch {
    return;
  }
  for (const name of entries) {
    const dir = path.join(tmp, name);
    if (dir === keep) continue;
    try {
      if (Date.now() - fs.statSync(dir).mtimeMs > STALE_AFTER_MS) {
        fs.rmSync(dir, { recursive: true, force: true });
      }
    } catch {
      // Still locked by a running API (Windows) or already gone — ignore.
    }
  }
}

export function prepareScratch(): RunState {
  const apiDir = resolveApiDir();
  const fixture = path.join(apiDir, 'test', 'fixtures', 'tracker.db');
  if (!fs.existsSync(fixture)) {
    throw new Error(
      `e2e: API fixture not found at ${fixture}. Set API_DIR to a job-hunter-api checkout ` +
        `(default: ../api next to this repo).`,
    );
  }

  const pinned = process.env['E2E_SCRATCH_DIR']?.trim();
  const scratchDir = pinned
    ? path.resolve(pinned)
    : fs.mkdtempSync(path.join(os.tmpdir(), SCRATCH_PREFIX));
  process.env['E2E_SCRATCH_DIR'] = scratchDir;

  const state: RunState = {
    scratchDir,
    appDbPath: path.join(scratchDir, 'app.sqlite'),
    trackerDbPath: path.join(scratchDir, 'tracker.db'),
    usersRoot: path.join(scratchDir, 'users'),
    apiDir,
    apiUrl: `http://localhost:${API_PORT}`,
    siteUrl: `http://localhost:${SITE_PORT}`,
  };

  fs.mkdirSync(state.usersRoot, { recursive: true });
  if (!fs.existsSync(state.trackerDbPath)) {
    // Only the main file: the fixture's committed data lives there, and a
    // -wal/-shm left next to the fixture by some other local process must
    // never leak into the copy.
    fs.copyFileSync(fixture, state.trackerDbPath);
  }

  fs.mkdirSync(path.dirname(STATE_FILE), { recursive: true });
  fs.writeFileSync(STATE_FILE, JSON.stringify(state, null, 2));

  if (!pinned) pruneStaleScratchDirs(scratchDir);
  return state;
}

/**
 * Called from config load. In the runner process (no scratch dir yet) it
 * prepares one; in worker processes it just re-derives the same state.
 */
export function scratchForConfig(): RunState {
  if (process.env['E2E_SCRATCH_DIR'] && fs.existsSync(STATE_FILE)) {
    const state = JSON.parse(fs.readFileSync(STATE_FILE, 'utf8')) as RunState;
    if (state.scratchDir === path.resolve(process.env['E2E_SCRATCH_DIR'])) {
      return state;
    }
  }
  return prepareScratch();
}

/** For helpers running inside tests. */
export function readRunState(): RunState {
  if (!fs.existsSync(STATE_FILE)) {
    throw new Error(`e2e: ${STATE_FILE} missing — run the suite via e2e/playwright.config.ts.`);
  }
  return JSON.parse(fs.readFileSync(STATE_FILE, 'utf8')) as RunState;
}
