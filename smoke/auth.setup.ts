import fs from 'node:fs';
import path from 'node:path';
import { test as setup } from './helpers/guarded-fixtures';
import { loginAsSmokeUser } from './helpers/auth';
import { assertSmokeIdentity } from './helpers/interlock';
import { requireBaseURL } from './helpers/env';
import { STORAGE_STATE_PATH } from './config/storage-state';

/**
 * One-time authentication for the whole suite (Playwright's standard "setup
 * project" pattern). Runs in the `setup` project of smoke/playwright.config.ts,
 * which has trace/screenshot/video fully disabled — see the artifact-hygiene
 * comment there and in smoke/helpers/auth.ts. Every other project depends on
 * this one and reuses the saved storageState instead of resubmitting the
 * login form, so the plaintext password touches the network at most once per
 * run, and never inside a traced test.
 */
setup('authenticate as the smoke test user', async ({ page, request, baseURL }) => {
  // loginAsSmokeUser itself waits for the post-login redirect to
  // /applications and throws if it never happens — that IS the "login
  // succeeded" check; nothing here re-asserts the same URL a second time.
  await loginAsSmokeUser(page);

  // Safety interlock BEFORE persisting the session (docs/LIVE_SMOKE_E2E.md):
  // this is the one choke point that catches SMOKE_USER_EMAIL/PASSWORD
  // misconfigured to the owner's own real account, before any downstream
  // test — across every future run that reuses this storageState — ever
  // trusts the saved session. A successful redirect to /applications only
  // proves *a* login worked, not *whose* account it is.
  await assertSmokeIdentity(page, request, requireBaseURL(baseURL));

  fs.mkdirSync(path.dirname(STORAGE_STATE_PATH), { recursive: true });
  await page.context().storageState({ path: STORAGE_STATE_PATH });
});
