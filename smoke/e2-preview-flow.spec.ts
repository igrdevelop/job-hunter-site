import type { Page, Response } from '@playwright/test';
import { mutatingTest as test, expect } from './helpers/mutating-test';
import type { ProfilePreviewListItem } from '../src/app/core/api/models';
import { assertApprovedOrigin } from './config/allowlist';

/**
 * E2 — Preview flow (the 2026-09-01 bug class), docs/LIVE_SMOKE_E2E.md.
 *
 * Generating a preview creates history + real render work on the bot's
 * `profile_jobs` queue — a side effect, so this is the ONLY sanctioned way
 * to write it: `import { mutatingTest as test, expect } from
 * './helpers/mutating-test'`, never `@playwright/test` or guarded-fixtures
 * directly (see smoke/helpers/mutating-test.ts). The `smokeIdentity` fixture
 * runs the safety interlock BEFORE this test body executes; the assertion
 * on it below is redundant with that guarantee but makes the interlock's
 * result visible in the test report rather than only implicit in a fixture.
 */

/**
 * "Generous patience: up to 4 minutes" (work order): the bot's profile_jobs
 * drain ticks every ~20s and LibreOffice rendering can be slow on a busy
 * VPS. A calm pending/running state for a while is not a failure — only a
 * job that never reaches "done"/"error" within this budget is.
 */
const JOB_POLL_TIMEOUT_MS = 4 * 60_000;
/**
 * Headroom above JOB_POLL_TIMEOUT_MS for navigation, the initial history
 * fetch, the download round-trip, and Playwright's own bookkeeping around
 * the poll itself. Set as this spec's own test timeout — the suite-wide
 * default in smoke/playwright.config.ts (60s) is sized for the read-only E1
 * phase, not this one.
 */
const TEST_TIMEOUT_MS = JOB_POLL_TIMEOUT_MS + 60_000;
/** work order step 5: "a non-trivial byte length (> 10 KB)". */
const MIN_PDF_BYTES = 10 * 1024;

/**
 * Pathname-based checks throughout this file, never a glob/regex over the
 * full URL string — same reasoning as e1's `waitForURL` pathname predicate
 * (smoke/helpers/auth.ts): a decoy query string must not produce a false
 * match on a request we're trying to pin to one specific run's job.
 */
function isPreviewsListResponse(res: Response): boolean {
  return res.request().method() === 'GET' && new URL(res.url()).pathname === '/api/profile/previews';
}

function isPreviewCreateResponse(res: Response): boolean {
  return res.request().method() === 'POST' && new URL(res.url()).pathname === '/api/profile/preview';
}

function isJobStatusResponse(res: Response, jobId: string): boolean {
  return res.request().method() === 'GET' && new URL(res.url()).pathname === `/api/profile/jobs/${jobId}`;
}

/**
 * The `?dt=` download-token flow — exactly the 2026-09-01 401 bug this
 * phase exists to catch. `pathname.startsWith` (not `===`) because the path
 * carries the track/timestamp/file segments; `dt` presence in the query
 * distinguishes this from any other request under `/profile/previews/*`.
 */
function isPreviewDownloadResponse(res: Response): boolean {
  const url = new URL(res.url());
  return url.pathname.startsWith('/api/profile/previews/') && url.searchParams.has('dt');
}

function historyKey(item: ProfilePreviewListItem): string {
  return `${item.track}::${item.timestamp}`;
}

/**
 * Waits for the poll GET matching this run's own `jobId` to report a
 * terminal status. The UI (profile-test-resume.component.ts) already polls
 * `GET /api/profile/jobs/:id` every 5s on its own — this rides that same
 * traffic instead of re-implementing polling, which is also what "via the
 * app's authenticated context" in the work order means: the browser's own
 * session, not a hand-rolled request.
 *
 * On timeout, rethrows with the exact message the work order requires
 * ("render job never completed — check the bot container on the VPS")
 * instead of Playwright's generic timeout text — the bot drain being dead
 * is a real, actionable finding, not a flaky test.
 */
async function waitForJobCompletion(page: Page, jobId: string): Promise<Response> {
  try {
    return await page.waitForResponse(
      async (res) => {
        if (!isJobStatusResponse(res, jobId)) return false;
        if (!res.ok()) return false;
        const body = (await res.json().catch(() => null)) as { status?: string } | null;
        return body?.status === 'done' || body?.status === 'error';
      },
      { timeout: JOB_POLL_TIMEOUT_MS },
    );
  } catch (err) {
    throw new Error(
      'render job never completed — check the bot container on the VPS ' +
        `(preview job ${jobId} never reached status "done"/"error" within ` +
        `${JOB_POLL_TIMEOUT_MS / 1000}s of polling GET /api/profile/jobs/${jobId}). ` +
        `Original error: ${err instanceof Error ? err.message : String(err)}`,
    );
  }
}

test.describe('E2 — preview flow', () => {
  test('generate a preview, poll this run\'s own job to completion, and download the rendered PDF', async ({
    page,
    context,
    smokeIdentity,
  }) => {
    // Redundant with the mutatingTest fixture's own guarantee (it already
    // ran assertSmokeIdentity before this body started) — asserting on the
    // value here just surfaces the interlock's result in the test report.
    expect(smokeIdentity.isOwner).toBe(false);

    test.setTimeout(TEST_TIMEOUT_MS);

    // Attached before navigating, not after: the history load fires as
    // part of the page's own bootstrap, so a listener attached post-goto
    // could miss it entirely and hang.
    const initialHistoryPromise = page.waitForResponse(isPreviewsListResponse);
    await page.goto('/profile?tab=preview');
    const initialHistory = (await (await initialHistoryPromise).json()) as ProfilePreviewListItem[];
    const initialKeys = new Set(initialHistory.map(historyKey));

    const generateButton = page.getByRole('button', { name: 'Generate preview' });
    await expect(generateButton).toBeEnabled();

    // Bind every subsequent assertion to THIS run's job (work order review
    // finding): capture jobId from the POST response itself, not from
    // whatever the UI happens to render afterward.
    const [previewCreatedResponse] = await Promise.all([
      page.waitForResponse(isPreviewCreateResponse),
      generateButton.click(),
    ]);
    expect(previewCreatedResponse.status()).toBe(201);
    const { jobId } = (await previewCreatedResponse.json()) as { jobId: string };
    expect(jobId, 'POST /api/profile/preview must return a jobId to poll').toBeTruthy();

    // Registered now, well before the job can possibly reach "done": the
    // component calls historyResource.reload() the instant its own poll
    // sees a terminal status, so this must be listening before that happens
    // rather than being set up only after we already know it's done.
    const reloadHistoryPromise = page.waitForResponse(isPreviewsListResponse);

    const jobResponse = await waitForJobCompletion(page, jobId);
    const job = (await jobResponse.json()) as { status: string; error?: string };
    if (job.status === 'error') {
      throw new Error(`Preview render job ${jobId} finished with status "error": ${job.error ?? '(no error message)'}`);
    }
    expect(job.status).toBe('done');

    const updatedHistory = (await (await reloadHistoryPromise).json()) as ProfilePreviewListItem[];
    const newEntry = updatedHistory.find((item) => !initialKeys.has(historyKey(item)));
    expect(
      newEntry,
      'expected a NEW History entry for this run\'s job (jobId=' +
        jobId +
        ') — got only entries already present before the run. ' +
        `before=${JSON.stringify(initialHistory)} after=${JSON.stringify(updatedHistory)}`,
    ).toBeTruthy();
    // Default selected track is 'core' (component.ts selectedTrack signal) —
    // confirms the new row really is this run's, not merely unseen before.
    expect(newEntry?.track).toBe('core');

    const pdfFile = newEntry?.files.find((f) => f.toLowerCase().endsWith('.pdf'));
    expect(pdfFile, `expected a .pdf file in the new preview entry: ${JSON.stringify(newEntry)}`).toBeTruthy();

    const newRow = page.locator('.history-row').filter({ hasText: newEntry!.timestamp });
    await expect(newRow.first()).toBeVisible({ timeout: 30_000 });
    const pdfButton = newRow.first().getByRole('button', { name: pdfFile!, exact: true });
    await expect(pdfButton).toBeVisible();

    // Download exactly the way the UI does: downloadPreviewFile() fetches a
    // short-lived token (GET /auth/download-token) then window.open()s the
    // file URL with `?dt=<token>` appended — precisely the 2026-09-01 401
    // regression. Asserting on the `context`-level 'response' event (rather
    // than chasing the popup page) works regardless of whether Chromium
    // renders the result as a navigation or triggers a native download.
    const [downloadResponse] = await Promise.all([
      context.waitForEvent('response', isPreviewDownloadResponse),
      pdfButton.click(),
    ]);

    expect(
      downloadResponse.status(),
      'preview PDF download must succeed via the real ?dt= token flow (2026-09-01 regression)',
    ).toBe(200);
    const contentType = downloadResponse.headers()['content-type'] ?? '';
    expect(contentType.toLowerCase()).toContain('application/pdf');
    // The browser turned the PDF response into a navigation/download, so its
    // body is not readable via CDP afterwards ("navigated away from"). Re-GET
    // the exact observed URL (its ?dt= token is still valid for ~5 min)
    // through the context's API request — same origin (assert it), no
    // navigation, reliable body.
    assertApprovedOrigin(new URL(downloadResponse.url()).origin);
    const apiResponse = await context.request.get(downloadResponse.url());
    expect(apiResponse.status()).toBe(200);
    expect((await apiResponse.body()).length).toBeGreaterThan(MIN_PDF_BYTES);
  });
});
