import { expect, test } from '../helpers/fixtures';
import { findUser, getVerificationToken } from '../helpers/db';

/**
 * Self-registration end to end through the UI: /signup → the verification
 * link (SMTP is unset in e2e, so the harness reads the token the mail would
 * carry from the scratch app.sqlite) → /verify → /login → /applications.
 * A fresh address per run, so a reused scratch dir never hits "already
 * registered".
 */
const onPath = (path: string) => (url: URL) => url.pathname === path;

test('a new user signs up, verifies the email and logs in', async ({ page }) => {
  const email = `signup-${Date.now()}@e2e.test`;
  const password = 'signup-e2e-password-1';

  await page.goto('/signup');
  await page.getByLabel('Email').fill(email);
  await page.getByLabel('Password', { exact: true }).fill(password);
  await page.getByLabel('Confirm password').fill(password);
  await page.getByRole('button', { name: 'Create account' }).click();

  await expect(page.getByText('Check your email')).toContainText(email);
  expect(findUser(email)?.email_verified).toBe(0);
  const token = getVerificationToken(email);
  expect(token, 'registration should have stored a verification token').not.toBeNull();

  await page.goto(`/verify?token=${encodeURIComponent(token ?? '')}`);
  await expect(page.getByText('Email verified!')).toBeVisible();
  expect(findUser(email)?.email_verified).toBe(1);
  expect(findUser(email)?.role).toBe('user');

  // The page moves on to /login by itself.
  await page.waitForURL(onPath('/login'));
  await page.getByLabel('Email').fill(email);
  await page.getByLabel('Password').fill(password);
  await page.getByRole('button', { name: 'Log in' }).click();

  await page.waitForURL(onPath('/applications'));
  await expect(page.getByRole('button', { name: 'User menu' })).toBeVisible();
  await page.getByRole('button', { name: 'User menu' }).click();
  await expect(page.getByRole('menu')).toContainText(email);
});
