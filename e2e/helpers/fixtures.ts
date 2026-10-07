import { test as base, expect } from '@playwright/test';

/**
 * `test`/`expect` for every e2e spec — import from HERE, not from
 * '@playwright/test', so the mock-fallback guard applies everywhere.
 *
 * The site has temporary GET-404 → mock bridges (`*_MOCK_FALLBACK_ENABLED` in
 * src/app/core/api/{filters,pipeline,profile}.api.ts). They are all
 * `!environment.production` and e2e serves the production configuration, so
 * they should never fire here — but a suite that can pass on mock data is
 * worse than none (docs/E2E_TESTING_PLAN.md decision 3), so this guard fails
 * the test if one does anyway: each bridge logs a console.warn naming its flag,
 * and the pipeline one also shows a "Sample data" banner.
 */
const MOCK_FALLBACK_WARNING = /_MOCK_FALLBACK_ENABLED/;
const SAMPLE_BANNER_TEXT = 'Sample data — API not deployed yet';

export const test = base.extend<{ mockFallbackGuard: void }>({
  mockFallbackGuard: [
    async ({ page }, use) => {
      const hits: string[] = [];
      page.on('console', (msg) => {
        if (msg.type() === 'warning' && MOCK_FALLBACK_WARNING.test(msg.text())) {
          hits.push(msg.text());
        }
      });

      await use();

      expect(hits, 'the site served mock data instead of the real API').toEqual([]);
      if (!page.isClosed()) {
        await expect(
          page.getByText(SAMPLE_BANNER_TEXT),
          'the pipeline page is showing its offline sample, not the real API',
        ).toHaveCount(0);
      }
    },
    { auto: true },
  ],
});

export { expect };
