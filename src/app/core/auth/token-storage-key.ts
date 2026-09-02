/**
 * localStorage key holding the JWT access token. Pulled out of
 * auth.service.ts into its own tiny, framework-free module so the
 * Playwright smoke suite (smoke/helpers/interlock.ts) can import the exact
 * same constant instead of hand-duplicating the string literal — a future
 * rename here now can't silently break the smoke suite's safety interlock.
 */
export const TOKEN_STORAGE_KEY = 'job-hunter-token';
