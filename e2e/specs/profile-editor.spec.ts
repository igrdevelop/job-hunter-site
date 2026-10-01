import type { Page } from '@playwright/test';
import { deleteProfile } from '../helpers/db';
import { expect, test } from '../helpers/fixtures';
import { OWNER } from '../helpers/users';

/**
 * The profile editor (src/app/features/profile-editor) against the real API:
 * the owner starts with no profile (a fresh scratch app.sqlite; the
 * beforeEach clears one a pinned E2E_SCRATCH_DIR kept), so the owner sees the empty
 * state, starts a blank profile, fills the three required identity fields
 * (REQUIRED_IDENTITY_FIELDS) and saves through `PUT /api/profile`.
 *
 * The save also enqueues a render job for the bot; no bot runs in e2e, so the
 * job stays pending — nothing here asserts on render completion.
 */
test.use({ storageState: OWNER.storageState });

test.beforeEach(() => deleteProfile(OWNER.email));

const IDENTITY = {
  fullName: 'E2E Owner',
  contact: 'owner@e2e.test | +48 000 000 000',
  cvPrefix: 'E2E_Owner',
};

// Each identity input sits inside a <label> whose first text is the field
// name; an error line may follow it, so match the start of the name.
const field = (page: Page, name: string) =>
  page.getByRole('textbox', { name: new RegExp(`^${name}`) });

test('owner creates a profile from scratch and it survives a reload', async ({ page }) => {
  await page.goto('/profile');

  await expect(page.getByRole('heading', { name: 'No profile yet' })).toBeVisible();
  await page.getByRole('button', { name: 'Start from scratch' }).click();

  const saveButton = page.getByRole('button', { name: 'Save', exact: true });
  await expect(page.getByRole('heading', { name: 'Identity', exact: true })).toBeVisible();

  await field(page, 'Full name').fill(IDENTITY.fullName);
  await field(page, 'Contact').fill(IDENTITY.contact);
  await field(page, 'CV filename prefix').fill(IDENTITY.cvPrefix);
  await expect(page.getByText('Fix the identity errors above before saving.')).toHaveCount(0);

  const put = page.waitForResponse(
    (res) => res.request().method() === 'PUT' && new URL(res.url()).pathname === '/api/profile',
  );
  await saveButton.click();
  expect((await put).status()).toBe(200);
  await expect(page.getByText('Saved — applies to the next generated CV.')).toBeVisible();
  await expect(page.getByText('● Unsaved changes')).toHaveCount(0);

  await page.reload();

  await expect(page.getByRole('heading', { name: 'Identity', exact: true })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'No profile yet' })).toHaveCount(0);
  await expect(field(page, 'Full name')).toHaveValue(IDENTITY.fullName);
  await expect(field(page, 'Contact')).toHaveValue(IDENTITY.contact);
  await expect(field(page, 'CV filename prefix')).toHaveValue(IDENTITY.cvPrefix);
});
