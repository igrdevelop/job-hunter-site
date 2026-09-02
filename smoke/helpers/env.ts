/** Reads a required env var or throws with a clear message — never returns undefined silently. */
export function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing required env var ${name} — set it before running the smoke suite.`);
  }
  return value;
}

/**
 * Playwright's built-in `baseURL` fixture is typed `string | undefined`
 * (it's undefined only if `use.baseURL` were unset in the config, which
 * smoke/playwright.config.ts always sets). Narrows it with a clear error
 * instead of a `!` assertion at every call site.
 */
export function requireBaseURL(baseURL: string | undefined): string {
  if (!baseURL) {
    throw new Error('baseURL is not set — smoke/playwright.config.ts should always set use.baseURL.');
  }
  return baseURL;
}
