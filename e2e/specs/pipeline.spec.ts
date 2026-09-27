import { expect, test } from '../helpers/fixtures';
import { recordSourceRun } from '../helpers/db';
import { OWNER } from '../helpers/users';

/**
 * /pipeline against the real `GET /api/pipeline/snapshot` over the scratch
 * fixture tracker.db. The fixture's own rows are months old, so the harness
 * plays the bot's hunt loop and appends two fresh `source_runs` rows; the Hunt
 * tier's "Found" card must then show their sum — a number only the real API
 * can produce from this run's data (the offline sample would also trip the
 * mock-fallback guard in e2e/helpers/fixtures.ts).
 */
test.use({ storageState: OWNER.storageState });

// Unique per run so a pinned, reused E2E_SCRATCH_DIR can't double-count.
const SOURCES = [`e2e-a-${Date.now()}`, `e2e-b-${Date.now()}`];

test('the owner sees the real snapshot, including this run’s hunt yield', async ({ page }) => {
  recordSourceRun(SOURCES[0], 12);
  recordSourceRun(SOURCES[1], 30);

  const snapshot = page.waitForResponse(
    (res) => new URL(res.url()).pathname === '/api/pipeline/snapshot',
  );
  await page.goto('/pipeline');
  expect((await snapshot).status()).toBe(200);

  await expect(page.getByRole('heading', { name: 'Pipeline', level: 1 })).toBeVisible();
  for (const tier of ['Hunt', 'Apply', 'Result']) {
    await expect(page.getByRole('heading', { name: tier, exact: true })).toBeVisible();
  }

  const huntTier = page.getByRole('region', { name: 'Hunt', exact: true });
  const found = huntTier.locator('app-stat-card').filter({ hasText: 'Found' });
  // At least our 42: other specs never write source_runs, but a pinned scratch
  // dir reused across runs keeps earlier rows inside today's window.
  await expect(found.locator('.value')).toHaveText(/^\s*\d+\s*$/);
  expect(Number(await found.locator('.value').innerText())).toBeGreaterThanOrEqual(42);
  await expect(found).toContainText(/\d+ sources? ran/);

  // Owner-only control bar (isOwner from /auth/me).
  await expect(page.getByRole('region', { name: 'Start the bot' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Hunt everywhere' })).toBeVisible();
  await expect(page.getByRole('alert')).toHaveCount(0);
});
