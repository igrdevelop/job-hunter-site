/**
 * Approved production origins the smoke suite is allowed to run against.
 *
 * docs/LIVE_SMOKE_E2E.md, "Target allowlist" (review finding): a
 * misconfigured or hostile `SMOKE_BASE_URL` must never receive the smoke
 * test-account credentials. The suite must abort before any navigation, not
 * just refuse to submit the login form — so this is checked both at
 * playwright.config.ts load time (before a browser even opens) and again
 * right before the password is typed in smoke/helpers/auth.ts.
 *
 * Extend this list if a second approved environment (e.g. a staging origin)
 * is ever added deliberately — never widen it to accept an arbitrary origin.
 */
export const APPROVED_SMOKE_ORIGINS: readonly string[] = ['https://job-hunter.igrflex.work'];

export function assertApprovedOrigin(origin: string): void {
  if (!APPROVED_SMOKE_ORIGINS.includes(origin)) {
    throw new Error(
      `Refusing to run the smoke suite against "${origin}" — it is not in the approved ` +
        `target allowlist (${APPROVED_SMOKE_ORIGINS.join(', ')}). This check exists so a ` +
        'misconfigured or hostile SMOKE_BASE_URL never receives the smoke test-account credentials.',
    );
  }
}
