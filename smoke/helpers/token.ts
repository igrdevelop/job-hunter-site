import { Page } from '@playwright/test';
import { TOKEN_STORAGE_KEY } from '../../src/app/core/auth/token-storage-key';

/**
 * Reads the bearer JWT the app stores in localStorage after login. Shared by
 * every helper/spec that needs to make its OWN authenticated request outside
 * the app's own HttpClient — smoke/helpers/interlock.ts's direct `/auth/me`
 * call, and E3's direct `GET /api/profile` / `GET /api/profile/jobs/:id` /
 * `GET /api/profile/files/:name` reads (docs/LIVE_SMOKE_E2E.md: the
 * rendered-files API is plain JWT, unlike the owner-gated UI tab, so the
 * non-owner smoke user verifies it by calling the endpoint directly rather
 * than through a tab it doesn't have).
 */
export async function getStoredAuthToken(page: Page): Promise<string> {
  const token = await page.evaluate((key) => localStorage.getItem(key), TOKEN_STORAGE_KEY);
  if (!token) {
    throw new Error('No auth token found in localStorage — is the session established?');
  }
  return token;
}
