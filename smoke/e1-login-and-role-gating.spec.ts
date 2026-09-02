import { test, expect } from './helpers/guarded-fixtures';
import { assertSmokeIdentity } from './helpers/interlock';
import { requireEnv, requireBaseURL } from './helpers/env';

/**
 * E1 — Infra + login + role gating (read-only), docs/LIVE_SMOKE_E2E.md.
 *
 * The real login-form submission happens exactly once for the whole run, in
 * smoke/auth.setup.ts, inside a Playwright project with trace/screenshot/
 * video fully disabled (see smoke/playwright.config.ts). Every test below
 * runs in the `e1` project, which depends on that setup and reuses its
 * saved storageState — so these tests never touch the password, and their
 * failures can carry a full trace/screenshot safely.
 *
 * `test`/`expect` come from ./helpers/guarded-fixtures, not
 * '@playwright/test' directly — its `context.route` guard structurally
 * blocks any request to a non-approved origin for the whole test.
 */

test.describe('E1 — infra, login, role gating', () => {
  test.beforeEach(async ({ page }) => {
    // '/profile' with no query defaults to the editor tab
    // (profile-tabs.component.ts DEFAULT_TAB), which is what every test
    // below needs — no test has to repeat this navigation itself.
    await page.goto('/profile');
  });

  test('login succeeds: the authenticated session loads a protected route', async ({ page }) => {
    // authGuard redirects an unauthenticated visitor to /login (see
    // src/app/core/auth/auth.guard.ts) — landing on /profile without being
    // bounced proves the session established by the real login form
    // (smoke/auth.setup.ts) is valid. Polls the parsed pathname (not a
    // regex/glob against the full URL string), so a decoy query string
    // like "?next=/login" can't produce a false pass.
    await expect.poll(() => new URL(page.url()).pathname).not.toBe('/login');
    await expect(page.getByRole('tab', { name: 'Editor' })).toBeVisible();
  });

  test('safety interlock: logged-in identity is the smoke user, not the owner', async ({
    page,
    request,
    baseURL,
  }) => {
    const me = await assertSmokeIdentity(page, request, requireBaseURL(baseURL));

    expect(me.isOwner).toBe(false);
    expect(me.email).toBe(requireEnv('SMOKE_USER_EMAIL'));
  });

  test('profile shows exactly Uploads / Editor / Test Resume — Rendered Files absent from the DOM', async ({
    page,
  }) => {
    // Live check of the 2026-09-01 gating swap (profile-tabs.component.ts):
    // Rendered Files is owner-only and must be absent from the DOM
    // entirely for a non-owner — not merely hidden by CSS.
    const tabs = page.getByRole('tab');
    await expect(tabs).toHaveCount(3);
    await expect(page.getByRole('tab', { name: 'Uploads' })).toBeVisible();
    await expect(page.getByRole('tab', { name: 'Editor' })).toBeVisible();
    await expect(page.getByRole('tab', { name: 'Test Resume' })).toBeVisible();

    // toHaveCount(3) above already proves no 4th tab exists at all; this is
    // the one explicit check that the excluded tab specifically is the one
    // missing (as opposed to, say, "Uploads" silently having been dropped
    // instead).
    await expect(page.getByRole('tab', { name: 'Rendered Files' })).toHaveCount(0);
  });

  test('editor tab renders real profile data', async ({ page }) => {
    // Assert the "no profile yet" empty state is NOT showing first — if the
    // smoke user's profile fixture is missing/unprovisioned, this fails
    // with a clear "profile fixture missing" message instead of an opaque
    // 15s timeout waiting for a field that was never going to appear.
    await expect(
      page.getByRole('heading', { name: 'No profile yet' }),
      'the smoke user has no profile (or it failed to load) — see profile-editor.component.html showEmptyState()',
    ).toHaveCount(0);

    // A known-stable field (identity full name) must be non-empty — proving
    // the tab loaded the smoke user's real profile via the API rather than
    // an empty/mock/error state. Deliberately not asserting a literal value:
    // this repo is public and the smoke user's real data must never be
    // hardcoded into a committed spec.
    const fullName = page.getByLabel('Full name');
    await expect(fullName).toBeVisible({ timeout: 15_000 });
    await expect(fullName).not.toHaveValue('', { timeout: 15_000 });
  });
});
