import { expect, test } from '../helpers/fixtures';
import { REGULAR } from '../helpers/users';

/**
 * The Job Filters editor (src/app/features/filters) against the real API.
 * The regular user starts on the shared builtin defaults (no filters.yaml in
 * the scratch users/ root); flipping one boolean knob and saving must write an
 * override through `PUT /api/filters` that is still there after a reload.
 */
test.use({ storageState: REGULAR.storageState });

const KNOB = 'Skip jobs that require German';

test('a changed filter is saved and survives a reload', async ({ page }) => {
  await page.goto('/filters');

  const checkbox = page.getByRole('checkbox', { name: KNOB, exact: true });
  await expect(checkbox).toBeVisible();
  const before = await checkbox.isChecked();

  await checkbox.setChecked(!before);
  await expect(page.getByRole('region', { name: 'Unsaved filter changes' })).toBeVisible();

  const put = page.waitForResponse(
    (res) => res.request().method() === 'PUT' && new URL(res.url()).pathname === '/api/filters',
  );
  await page.getByRole('button', { name: 'Save', exact: true }).click();
  expect((await put).status()).toBe(200);
  await expect(page.getByText('Saved. Changes apply on the next hunt cycle.')).toBeVisible();

  await page.reload();

  await expect(page.getByRole('checkbox', { name: KNOB, exact: true })).toBeChecked({
    checked: !before,
  });
  await expect(page.locator('[data-key="exclude_german_language_required"]')).toContainText(
    'modified',
  );
});
