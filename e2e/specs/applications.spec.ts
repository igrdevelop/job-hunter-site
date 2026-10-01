import type { Page } from '@playwright/test';
import { expect, test } from '../helpers/fixtures';
import { OWNER, REGULAR } from '../helpers/users';

/**
 * The applications table against the API's fixture tracker.db (a scratch
 * copy): 12 rows, all with Sent = EXPIRED, so the default "Unsent" filter is
 * empty and these tests open ?filter=all. ActDigital is the one fixture row
 * of that company ("Senior Angular Developer", 2026-05-27).
 */
const FIXTURE_ROWS = 12;
const FIXTURE_COMPANY = 'ActDigital';

const totalStat = (page: Page) =>
  page.locator('.stat', { hasText: 'Total' }).locator('.stat-value');

test.describe('owner', () => {
  test.use({ storageState: OWNER.storageState });

  test('the grid shows the real fixture rows', async ({ page }) => {
    await page.goto('/applications?filter=all');

    const row = page
      .getByRole('row')
      .filter({ has: page.getByRole('gridcell', { name: FIXTURE_COMPANY, exact: true }) });
    await expect(row).toHaveCount(1);
    await expect(row).toContainText('Senior Angular Developer');
    await expect(totalStat(page)).toHaveText(String(FIXTURE_ROWS));
  });
});

test.describe('regular user', () => {
  test.use({ storageState: REGULAR.storageState });

  test("does not see the owner's applications", async ({ page }) => {
    await page.goto('/applications?filter=all');

    await expect(totalStat(page)).toHaveText('0');
    await expect(page.getByRole('gridcell', { name: FIXTURE_COMPANY, exact: true })).toHaveCount(0);
  });
});
