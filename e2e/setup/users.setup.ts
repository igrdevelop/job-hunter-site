import fs from 'node:fs';
import path from 'node:path';
import type { Browser } from '@playwright/test';
import { expect, test as setup } from '../helpers/fixtures';
import { countApplications, findUser, getVerificationToken } from '../helpers/db';
import { loginThroughForm } from '../helpers/auth';
import { OWNER, REGULAR, TestUser } from '../helpers/users';

/**
 * One-time user setup for the whole run; every spec reuses the storage
 * states saved here instead of logging in again (the /auth/* routes are
 * throttled at 30 requests/min per IP).
 */

async function saveLoggedInState(browser: Browser, user: TestUser): Promise<void> {
  const context = await browser.newContext();
  const page = await context.newPage();
  await loginThroughForm(page, user);
  fs.mkdirSync(path.dirname(user.storageState), { recursive: true });
  await context.storageState({ path: user.storageState });
  await context.close();
}

setup('owner: seeded admin owns the fixture applications and logs in', async ({ browser }) => {
  const owner = findUser(OWNER.email);
  expect(owner, 'the API should seed SEED_USER_EMAIL on first boot').toBeDefined();
  expect(owner?.role).toBe('admin');

  // The API's own owner backfill hands the fixture rows to the seeded admin
  // (TrackerService.onApplicationBootstrap, after the seed).
  expect(countApplications(OWNER.email)).toBeGreaterThan(0);

  await saveLoggedInState(browser, OWNER);
});

setup('regular user: registers, verifies email and logs in', async ({ browser, request }) => {
  const register = await request.post('/auth/register', {
    data: { email: REGULAR.email, password: REGULAR.password },
  });
  // 409 = already registered: a pinned E2E_SCRATCH_DIR reused across runs.
  expect([201, 409], await register.text()).toContain(register.status());

  if (!findUser(REGULAR.email)?.email_verified) {
    const token = getVerificationToken(REGULAR.email);
    expect(token, 'registration should have stored a verification token').not.toBeNull();
    // The real verification endpoint — what the mailed link's page calls.
    const verify = await request.post('/auth/verify', { data: { token } });
    expect(verify.status(), await verify.text()).toBe(201);
  }
  expect(findUser(REGULAR.email)?.email_verified).toBe(1);
  expect(findUser(REGULAR.email)?.role).toBe('user');

  await saveLoggedInState(browser, REGULAR);
});
