import path from 'node:path';
import { defineConfig, devices } from '@playwright/test';
import { assertApprovedOrigin } from './config/allowlist';
import { STORAGE_STATE_PATH } from './config/storage-state';

const DEFAULT_BASE_URL = 'https://job-hunter.igrflex.work';
const baseURL = process.env.SMOKE_BASE_URL?.trim() || DEFAULT_BASE_URL;

// Target allowlist (docs/LIVE_SMOKE_E2E.md, review finding): abort BEFORE
// any browser opens or any navigation happens if SMOKE_BASE_URL isn't an
// approved production origin. Throwing here, at config-evaluation time,
// fails the whole `playwright test` invocation before a single test
// (including the auth setup) runs.
assertApprovedOrigin(new URL(baseURL).origin);

export default defineConfig({
  testDir: '.',
  timeout: 60_000,
  // Safe-by-default, inverted on purpose (docs/LIVE_SMOKE_E2E.md): retrying
  // a whole spec is only safe for a non-mutating phase — retrying E2-E4
  // after a request succeeded but its own poll failed would double-submit
  // a preview / save / upload. The top-level default is therefore NO
  // retries; the read-only `e1` project below opts INTO retry explicitly.
  // A future E2/E3/E4 project then inherits this safe default automatically
  // — its author has to deliberately add `retries` to get anything other
  // than 0, instead of remembering to override a permissive top-level
  // default.
  retries: 0,
  // Kept intentionally serial rather than parallelized: the coming
  // mutating phases (E2-E4) share one rotating marker sentinel on the
  // smoke user's single profile (docs/LIVE_SMOKE_E2E.md) — two tests
  // touching it at once would race and produce false negatives.
  // Reshuffling this once E3 lands is worse than a few serial seconds now.
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  workers: 1,
  // Both output paths pinned under smoke/ (not resolved relative to
  // whatever directory `npm run smoke` happens to be invoked from) so
  // report + trace/screenshot artifacts always land in one predictable
  // place, matching what .gitignore and the workflow's upload-artifact
  // step both expect.
  outputDir: path.join(__dirname, 'test-results'),
  reporter: [
    ['list'],
    ['html', { open: 'never', outputFolder: path.join(__dirname, 'playwright-report') }],
  ],
  use: {
    baseURL,
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    video: 'off',
  },
  projects: [
    {
      name: 'setup',
      testMatch: /auth\.setup\.ts/,
      // Artifact hygiene (docs/LIVE_SMOKE_E2E.md, "Secret hygiene" risk):
      // this is the ONLY project that submits the real login form, so it's
      // the only place the plaintext password ever touches traffic
      // Playwright could capture. A screenshot only shows masked dots for
      // a password field, but Playwright's trace also records full
      // request/response bodies — including the POST /auth/login payload
      // — so trace must be off here too, not just screenshot/video. Every
      // other project depends on this one and reuses its saved session
      // instead of re-submitting the form.
      use: { ...devices['Desktop Chrome'], trace: 'off', screenshot: 'off', video: 'off' },
    },
    {
      name: 'e1',
      testMatch: /e1-.*\.spec\.ts/,
      dependencies: ['setup'],
      // Explicit opt-in: E1 is entirely read-only, so a whole-test retry
      // after live-site flakiness is safe here. Do NOT copy this onto a
      // mutating phase's project — see the top-level `retries` comment.
      retries: process.env.CI ? 1 : 0,
      use: { ...devices['Desktop Chrome'], storageState: STORAGE_STATE_PATH },
    },
  ],
});
