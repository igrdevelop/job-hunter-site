import { test as guardedTest, expect } from './guarded-fixtures';
import { assertSmokeIdentity, AuthMePayload } from './interlock';
import { requireBaseURL } from './env';

/**
 * The ONLY sanctioned way to write a mutating (E2-E4) smoke spec.
 *
 * docs/LIVE_SMOKE_E2E.md's safety interlock is a HARD requirement: it must
 * run immediately before every side-effecting phase, not just once at the
 * start of a run. A spec author remembering to call `assertSmokeIdentity`
 * by hand at the top of every mutating test is exactly the kind of rule a
 * future PR quietly drops under review pressure — so this fixture runs it
 * automatically, before the test body executes, making "a mutating spec
 * forgot to check the interlock" a class of bug that cannot happen.
 *
 * A future E2/E3/E4 spec file MUST `import { mutatingTest as test, expect }
 * from '../helpers/mutating-test'` instead of importing `test`/`expect`
 * from '@playwright/test' or from guarded-fixtures.ts directly. The
 * `smokeIdentity` fixture value is the verified `{ email, isOwner: false }`
 * payload, available to the test body if it's ever useful to assert
 * against directly.
 *
 * E1 is entirely read-only and does not use this fixture — it exercises
 * `assertSmokeIdentity` directly, once, as an ordinary test.
 */
export const mutatingTest = guardedTest.extend<{ smokeIdentity: AuthMePayload }>({
  smokeIdentity: async ({ page, request, baseURL }, use) => {
    await page.goto('/');
    const identity = await assertSmokeIdentity(page, request, requireBaseURL(baseURL));
    await use(identity);
  },
});

export { expect };
