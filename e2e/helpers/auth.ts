import { Page, expect } from '@playwright/test';
import type { TestUser } from './users';

/** Fills and submits the real login form (src/app/features/login). */
export async function submitLoginForm(page: Page, email: string, password: string): Promise<void> {
  await page.goto('/login');
  await page.getByLabel('Email').fill(email);
  await page.getByLabel('Password').fill(password);
  await page.getByRole('button', { name: 'Log in' }).click();
}

/**
 * Logs `user` in through the form and waits for the post-login redirect.
 * A pathname predicate, not a glob: "/login?returnTo=/applications" must not
 * count as having landed on /applications.
 */
export async function loginThroughForm(page: Page, user: TestUser): Promise<void> {
  await submitLoginForm(page, user.email, user.password);
  await page.waitForURL((url) => url.pathname === '/applications');
  await expect(page.getByRole('button', { name: 'User menu' })).toBeVisible();
}
