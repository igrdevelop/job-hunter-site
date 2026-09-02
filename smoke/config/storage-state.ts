import path from 'node:path';

/**
 * Where smoke/auth.setup.ts saves the authenticated session, and where
 * smoke/playwright.config.ts's `e1` project reads it back from. Pulled out
 * into its own module (rather than exported from auth.setup.ts itself) so
 * the config file never imports a file that calls Playwright's `test()`/
 * `setup()` registration functions at module scope — Playwright refuses to
 * load a config that does that.
 */
export const STORAGE_STATE_PATH = path.join(__dirname, '..', '.auth', 'smoke-user.json');
