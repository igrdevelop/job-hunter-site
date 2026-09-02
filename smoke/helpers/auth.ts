import { Page } from '@playwright/test';
import { assertApprovedOrigin } from '../config/allowlist';
import { requireEnv } from './env';

/**
 * Logs in through the REAL login form (`src/app/features/login`).
 *
 * Only ever called from smoke/auth.setup.ts, whose Playwright project has
 * trace/screenshot/video fully disabled — see the "artifact hygiene"
 * comment in smoke/playwright.config.ts. Trace capture records full
 * request/response bodies (the POST /auth/login payload includes the
 * plaintext password), not just what a screenshot would show — a password
 * input renders as masked dots on screen, but its raw value can still land
 * in a trace's network log. Every other spec authenticates by reusing that
 * setup's saved storageState instead of calling this again, so the
 * plaintext password is submitted at most once per run, and never inside a
 * traced test.
 */
export async function loginAsSmokeUser(page: Page): Promise<void> {
  const email = requireEnv('SMOKE_USER_EMAIL');
  const password = requireEnv('SMOKE_USER_PASSWORD');

  await page.goto('/login');

  // One check here, not one per field, is enough: this file is only ever
  // used through smoke/helpers/guarded-fixtures.ts's `test`/`setup`, whose
  // context-level `context.route` guard structurally blocks ANY request —
  // including a redirect landing between these two fills — to a
  // non-approved origin, for the whole test, not just at this instant. This
  // assertion is the fast, readable-error check; the route guard is what
  // actually enforces it end-to-end (closes the TOCTOU gap a point-in-time
  // check alone would have).
  assertApprovedOrigin(new URL(page.url()).origin);

  await page.getByLabel('Email').fill(email);
  await page.getByLabel('Password').fill(password);

  await page.getByRole('button', { name: 'Log in' }).click();

  // login.component.ts navigates to /applications on success — this IS the
  // "login succeeded" check; callers should not re-assert the same URL.
  // A pathname predicate, not a glob/regex string: a glob like
  // '**/applications' (or a regex like /\/applications/) matches on the
  // full URL string, so a decoy like "/login?returnTo=/applications" would
  // satisfy it despite the path still being /login.
  await page.waitForURL((url) => url.pathname === '/applications', { timeout: 30_000 });
}
