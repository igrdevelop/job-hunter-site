import { test as base } from '@playwright/test';
import { APPROVED_SMOKE_ORIGINS } from '../config/allowlist';

/**
 * Resource types that can carry credentials (the bearer token, or a
 * cookie) to wherever they're sent — a navigation (the login page itself,
 * or a redirect) and any XHR/fetch call the app makes. Fonts/images/
 * scripts/stylesheets never carry the token and are left alone, so this
 * guard doesn't also have to allowlist fonts.googleapis.com/fonts.gstatic.com
 * (see src/index.html) just to keep the app rendering.
 */
const CREDENTIAL_BEARING_RESOURCE_TYPES = new Set(['document', 'xhr', 'fetch']);

/**
 * Structural origin guard (docs/LIVE_SMOKE_E2E.md, "Target allowlist"):
 * every browser-context request is routed through an allowlist check and
 * ABORTED if it targets a non-approved origin, before it ever leaves the
 * browser. This is a request-layer backstop underneath the manual origin
 * checks in smoke/helpers/auth.ts — it blocks a credential-bearing request
 * to a wrong origin regardless of exactly when a redirect happens (the
 * manual checks are a point-in-time assertion; this guard is unconditional
 * for the whole test), and it also protects requests a manual check simply
 * never runs against (an XHR the app fires on its own).
 *
 * It does NOT cover the standalone `request` fixture (Playwright's
 * APIRequestContext, used for direct API calls outside the browser) —
 * that fixture never goes through `context.route`. `assertSmokeIdentity`
 * (smoke/helpers/interlock.ts) is the equivalent guard for that path: it
 * calls `assertApprovedOrigin` itself before sending the bearer token.
 *
 * Every project in smoke/playwright.config.ts, and every spec file, should
 * import `test`/`expect` from HERE — never directly from
 * '@playwright/test' — so the guard applies uniformly, including during
 * the login form submission in auth.setup.ts.
 */
export const test = base.extend({
  context: async ({ context }, use) => {
    await context.route('**/*', (route) => {
      const request = route.request();
      if (!CREDENTIAL_BEARING_RESOURCE_TYPES.has(request.resourceType())) {
        return route.continue();
      }
      const origin = new URL(request.url()).origin;
      if (APPROVED_SMOKE_ORIGINS.includes(origin)) {
        return route.continue();
      }
      return route.abort('blockedbyclient');
    });
    await use(context);
  },
});

export { expect } from '@playwright/test';
