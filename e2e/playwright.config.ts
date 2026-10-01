import path from 'node:path';
import { defineConfig, devices } from '@playwright/test';
import { OWNER } from './helpers/users';
import { API_PORT, SITE_PORT, SITE_ROOT, scratchForConfig } from './scratch';

/**
 * Local full-stack e2e suite (docs/E2E_TESTING_PLAN.md, E1): the REAL
 * job-hunter-api (built from API_DIR, default ../api) on :3100 with its own
 * scratch SQLite, and the site served with the production configuration on
 * :4300, proxying /api + /auth to that API. Nothing here talks to prod — the
 * live smoke suite (smoke/) does that and has its own config/allowlist.
 *
 * Production configuration on purpose: every *_MOCK_FALLBACK_ENABLED flag is
 * `!environment.production`, so a 404 surfaces as a failure instead of mock
 * data; e2e/helpers/fixtures.ts additionally fails a test that logs a
 * mock-fallback warning or shows the pipeline "Sample data" banner.
 */
const state = scratchForConfig();
const isCI = !!process.env['CI'];

// Fixed, throwaway secret for the scratch API only.
const JWT_SECRET = 'e2e-only-jwt-secret-not-for-any-real-deployment-000000';

// `E2E_SKIP_API_BUILD=1` skips `nest build` when you know dist/ is current.
const apiCommand =
  process.env['E2E_SKIP_API_BUILD'] === '1' ? 'node dist/main' : 'npm run build && node dist/main';

export default defineConfig({
  testDir: '.',
  timeout: 60_000,
  expect: { timeout: 10_000 },
  fullyParallel: false,
  forbidOnly: isCI,
  workers: 1,
  retries: isCI ? 1 : 0,
  outputDir: path.join(__dirname, 'test-results'),
  reporter: [
    ['list'],
    ['html', { open: 'never', outputFolder: path.join(__dirname, 'playwright-report') }],
  ],
  use: {
    baseURL: state.siteUrl,
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  webServer: [
    {
      name: 'api',
      command: apiCommand,
      cwd: state.apiDir,
      url: `${state.apiUrl}/health`,
      reuseExistingServer: !isCI,
      timeout: 180_000,
      stdout: 'ignore',
      stderr: 'pipe',
      env: {
        PORT: String(API_PORT),
        JWT_SECRET,
        APP_DB_PATH: state.appDbPath,
        TRACKER_DB_PATH: state.trackerDbPath,
        USERS_ROOT: state.usersRoot,
        BOT_ENV_PATH: path.join(state.scratchDir, 'bot.env'),
        REGISTRATION_ENABLED: 'true',
        SEED_USER_EMAIL: OWNER.email,
        SEED_USER_PASSWORD: OWNER.password,
        APP_BASE_URL: state.siteUrl,
        // Never inherit a developer's real mail/owner/log settings.
        SMTP_HOST: '',
        OWNER_USER_ID: '',
        APPLY_FAILURES_LOG_PATH: '',
      },
    },
    {
      name: 'site',
      command: `npx ng serve --configuration production --port ${SITE_PORT} --proxy-config e2e/proxy.e2e.json`,
      cwd: SITE_ROOT,
      url: state.siteUrl,
      reuseExistingServer: !isCI,
      // A cold production build under ng serve takes a while.
      timeout: 300_000,
      stdout: 'ignore',
      stderr: 'pipe',
    },
  ],
  projects: [
    {
      name: 'setup',
      testDir: './setup',
      testMatch: /.*\.setup\.ts/,
      use: { ...devices['Desktop Chrome'] },
    },
    {
      // Specs start anonymous; a spec that needs a user opts in with
      // `test.use({ storageState: OWNER.storageState })` (e2e/helpers/users.ts).
      name: 'e2e',
      testDir: './specs',
      testMatch: /.*\.spec\.ts/,
      dependencies: ['setup'],
      use: { ...devices['Desktop Chrome'] },
    },
  ],
});
