import { expect, test } from '../helpers/fixtures';
import { loginThroughForm, submitLoginForm } from '../helpers/auth';
import { OWNER } from '../helpers/users';
import { TOKEN_STORAGE_KEY } from '../../src/app/core/auth/token-storage-key';

// Anonymous by default (the `e2e` project sets no storage state).

const onPath = (path: string) => (url: URL) => url.pathname === path;

test('an anonymous visit to a guarded page redirects to /login', async ({ page }) => {
  await page.goto('/profile');
  await page.waitForURL(onPath('/login'));
  await expect(page.getByRole('button', { name: 'Log in' })).toBeVisible();
});

test('a wrong password is rejected and stays on /login', async ({ page }) => {
  await submitLoginForm(page, OWNER.email, 'definitely-not-the-password');

  await expect(page.getByText('Invalid email or password.')).toBeVisible();
  expect(new URL(page.url()).pathname).toBe('/login');
  expect(await page.evaluate((key) => localStorage.getItem(key), TOKEN_STORAGE_KEY)).toBeNull();
});

test('the right password lands on /applications; logout guards the app again', async ({ page }) => {
  await loginThroughForm(page, OWNER);

  await page.getByRole('button', { name: 'User menu' }).click();
  await expect(page.getByRole('menu')).toContainText(OWNER.email);
  await page.getByRole('menuitem', { name: 'Log out' }).click();
  await page.waitForURL(onPath('/login'));
  expect(await page.evaluate((key) => localStorage.getItem(key), TOKEN_STORAGE_KEY)).toBeNull();

  await page.goto('/applications');
  await page.waitForURL(onPath('/login'));
  await expect(page.getByRole('button', { name: 'Log in' })).toBeVisible();
});
