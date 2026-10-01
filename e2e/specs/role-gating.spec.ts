import type { Page } from '@playwright/test';
import { expect, test } from '../helpers/fixtures';
import { OWNER, REGULAR } from '../helpers/users';

/**
 * Who sees what. The fixture tracker rows belong to the owner (the API's
 * owner backfill hands them to the seeded admin at boot); a regular user must see none of them, must be turned
 * away from /admin (adminGuard → /applications), and must not get the
 * owner-only "Rendered Files" profile tab (profile-tabs.component.ts: it
 * exposes internal pipeline formats and needs isOwner) nor the pipeline
 * control bar.
 */

// A few of the fixture's companies (api test/fixtures/tracker.db).
const FIXTURE_COMPANIES = ['ActDigital', 'Lumicode', 'Feedzai', 'Accenture', 'IN4GE'];

const onPath = (path: string) => (url: URL) => url.pathname === path;

/**
 * page.goto that also waits for the app's own GET /auth/me: the role-gated
 * UI renders nothing owner-only until the current user is known, so an
 * absence check made before that answer would pass for any role.
 */
async function gotoAfterMe(page: Page, path: string): Promise<void> {
  const me = page.waitForResponse((res) => new URL(res.url()).pathname === '/auth/me');
  await page.goto(path);
  expect((await me).status()).toBe(200);
}

test.describe('regular user', () => {
  test.use({ storageState: REGULAR.storageState });

  test('has an empty applications list with none of the fixture companies', async ({ page }) => {
    const list = page.waitForResponse((res) => new URL(res.url()).pathname === '/api/applications');
    await page.goto('/applications?filter=all');
    const body = (await (await list).json()) as { data: unknown[]; meta: { total: number } };
    // The API itself returns nothing for this user, not just the grid.
    expect(body.meta.total).toBe(0);
    expect(body.data).toEqual([]);

    await expect(page.locator('.stat', { hasText: 'Total' }).locator('.stat-value')).toHaveText(
      '0',
    );
    for (const company of FIXTURE_COMPANIES) {
      await expect(page.getByText(company, { exact: true })).toHaveCount(0);
    }
  });

  test('is redirected from /admin to /applications and has no Admin link', async ({ page }) => {
    await gotoAfterMe(page, '/admin');
    await page.waitForURL(onPath('/applications'));
    await expect(page.getByRole('heading', { name: 'Admin', exact: true })).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'User menu' })).toBeVisible();
    await expect(page.getByRole('link', { name: 'Admin', exact: true })).toHaveCount(0);
  });

  test('does not get the owner-only profile tab or the pipeline controls', async ({ page }) => {
    await gotoAfterMe(page, '/profile');
    const tabs = page.getByRole('tablist', { name: 'Profile sections' });
    await expect(tabs.getByRole('tab', { name: 'Editor' })).toBeVisible();
    await expect(tabs.getByRole('tab', { name: 'Test Resume' })).toBeVisible();
    await expect(tabs.getByRole('tab', { name: 'Rendered Files' })).toHaveCount(0);

    // A deep link to the owner-only tab falls back to the editor.
    await gotoAfterMe(page, '/profile?tab=files');
    await expect(tabs.getByRole('tab', { name: 'Editor' })).toHaveAttribute(
      'aria-selected',
      'true',
    );
    await expect(tabs.getByRole('tab', { name: 'Rendered Files' })).toHaveCount(0);

    await gotoAfterMe(page, '/pipeline');
    await expect(page.getByRole('heading', { name: 'Apply', exact: true })).toBeVisible();
    await expect(page.getByRole('region', { name: 'Start the bot' })).toHaveCount(0);
  });
});

test.describe('owner', () => {
  test.use({ storageState: OWNER.storageState });

  test('gets the Rendered Files tab and can open /admin', async ({ page }) => {
    await page.goto('/profile');
    const tabs = page.getByRole('tablist', { name: 'Profile sections' });
    await expect(tabs.getByRole('tab', { name: 'Rendered Files' })).toBeVisible();

    // Through the header link (the direct load is the next test).
    await page.getByRole('link', { name: 'Admin', exact: true }).click();
    await page.waitForURL(onPath('/admin'));
    await expect(page.getByRole('heading', { name: 'Admin', level: 1 })).toBeVisible();
    await expect(page.getByRole('cell', { name: OWNER.email, exact: true })).toBeVisible();
    await expect(page.getByRole('cell', { name: REGULAR.email, exact: true })).toBeVisible();
  });

  // Regression: adminGuard used to read currentUser() synchronously, and on a
  // hard page load the user is only being fetched by App's constructor
  // (GET /auth/me, async), so the guard saw null and bounced the owner to
  // /applications — a reload or bookmark of /admin never worked. The guard
  // now awaits that same in-flight request.
  test('a hard load of /admin opens the admin page for the owner', async ({ page }) => {
    const meCalls: string[] = [];
    page.on('request', (req) => {
      if (new URL(req.url()).pathname === '/auth/me') meCalls.push(req.url());
    });
    await page.goto('/admin');
    await expect(page.getByRole('heading', { name: 'Admin', level: 1 })).toBeVisible();
    expect(new URL(page.url()).pathname).toBe('/admin');
    // The guard reuses App's request instead of issuing its own (/auth/* is
    // rate-limited per IP).
    expect(meCalls).toHaveLength(1);
  });
});
