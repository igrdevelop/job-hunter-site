import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import type { APIRequestContext, Page, Response } from '@playwright/test';
import { mutatingTest as test, expect } from './helpers/mutating-test';
import { buildRunMarker } from './helpers/marker';
import { getStoredAuthToken } from './helpers/token';
import { requireBaseURL } from './helpers/env';
import type {
  ProfileGetResponse,
  ProfileJob,
  ProfileUploadListEntry,
  ProfileUploadResponse,
} from '../src/app/core/api/models';

/**
 * E4 — Upload round-trip (mutating), docs/LIVE_SMOKE_E2E.md.
 *
 * Uploading a resume enqueues a real bot parse job (`profile_jobs`) — a side
 * effect, so this is written the ONLY sanctioned way: `import { mutatingTest
 * as test, expect } from './helpers/mutating-test'`, never `@playwright/test`
 * or guarded-fixtures directly (see smoke/helpers/mutating-test.ts). The
 * `smokeIdentity` fixture runs the safety interlock BEFORE this test body
 * executes.
 *
 * Marker placement + assertion target (documented per the work order's
 * explicit ask): `smoke/fixtures/smoke-resume.txt` ships only a `{{MARKER}}`
 * placeholder (never a real marker committed); this run's copy is written to
 * a temp file under `smoke/test-results/` (gitignored) with the placeholder
 * substituted, then uploaded through the real file input.
 *
 * The work order's own honest-scope note applies here: this proves upload ->
 * queue -> parse-job -> result propagation, NOT successful LLM extraction —
 * the parser's leftover fallback carries the raw fixture text (marker
 * included) even with no LLM call, so a degraded parse is an ACCEPTED pass.
 * Given that, the marker is asserted against the PARSE JOB RESULT
 * (`GET /api/profile/jobs/:id`'s `result`, fetched via the same network
 * traffic the upload dialog's own poll rides) rather than the confirmation
 * screen's DOM: `profile-editor.component.html`'s "Review parsed resume"
 * card only ever renders `parsedSkillProposals()`/`parsedRoleProposals()`
 * (category names, chip items, role title/company/period) — it never
 * renders `parsedDraft().leftovers` at all (leftovers only reach the DOM
 * once merged into the real document, and E4 must never merge — E3 owns
 * profile mutation). Whether the marker lands in a structured field (real
 * LLM parse) or in a leftover fragment (fallback) is exactly the
 * degradation this phase accepts, so asserting against the parsed
 * `ProfileDocument` as a whole (`JSON.stringify(result)`) is the only
 * target that is deterministic under both outcomes. The confirmation
 * screen IS still exercised and asserted separately (its heading becoming
 * visible proves the upload -> dialog-close -> draft-bridge -> editor-tab
 * wiring works end-to-end) — it just isn't where the marker text itself is
 * checked.
 *
 * That choice turned out to matter for a second reason, confirmed live
 * (manual repro against production, outside this automated spec, 2026-09-03):
 * `GET /api/profile/jobs/:id`'s `result` is a JSON-ENCODED STRING on the
 * wire (job-hunter-api's own `ProfileJobResponse.result?: string`), but
 * neither `ProfileApi.getJob()` nor `upload-resume-dialog.component.ts`
 * ever `JSON.parse()`s it before treating it as a `ProfileDocument` — so in
 * production today, `parsedSkillProposals()`/`parsedRoleProposals()` throw
 * (`Cannot read properties of undefined (reading 'skills')`) and the
 * confirmation screen's Skills/Roles sections silently render empty for
 * EVERY real upload. Flagged as a follow-up task (not fixed here — out of
 * this phase's scope, and a real site bug, not a smoke-test bug); see the
 * Agent Work Log. `JSON.stringify(terminal.result)` still contains the
 * marker regardless of this bug (a string re-stringifies to the same
 * escaped text), so this phase's own assertions are unaffected — but it is
 * the reason the confirmation-screen check below only asserts the heading
 * becomes visible, never its Skills/Roles content.
 */

/**
 * Generous patience (work order: "budget >= 3 min... parse involves an LLM
 * call bot-side"), same reasoning and budget as E2/E3's render-job polls —
 * the bot's profile_jobs drain ticks every ~20s.
 */
const JOB_POLL_TIMEOUT_MS = 4 * 60_000;
/** Headroom above the poll budget for navigation, the upload round-trip, the discard, and the uploads-list re-check. */
const TEST_TIMEOUT_MS = JOB_POLL_TIMEOUT_MS + 90_000;
/**
 * One "wait window" per iteration of the retry-driving loop below — mirrors
 * the app's own upload-dialog poll budget (`PROFILE_UPLOAD_POLL_TIMEOUT_MS`,
 * upload-resume-dialog.component.ts: 30 attempts x
 * `PROFILE_UPLOAD_POLL_INTERVAL_MS` (2s) = 60s) plus a small buffer, so a
 * whole dialog cycle gets to run before this loop decides it needs to check
 * for (and click) the dialog's own Retry button. Not imported directly —
 * the component file pulls in the real Angular/Material runtime (decorators
 * with import-time side effects), which Playwright's plain TS loader can't
 * JIT-compile, the same reason E3 hardcodes its own poll-interval mirror
 * (`RENDER_JOB_POLL_INTERVAL_MS`) instead of importing it.
 */
const DIALOG_POLL_CYCLE_MS = 60_000 + 5_000;

function isUploadsListResponse(res: Response): boolean {
  return res.request().method() === 'GET' && new URL(res.url()).pathname === '/api/profile/uploads';
}

function isProfileUploadResponse(res: Response): boolean {
  return res.request().method() === 'POST' && new URL(res.url()).pathname === '/api/profile/uploads';
}

function isJobStatusResponse(res: Response, jobId: string): boolean {
  return res.request().method() === 'GET' && new URL(res.url()).pathname === `/api/profile/jobs/${jobId}`;
}

async function fetchProfile(request: APIRequestContext, origin: string, token: string): Promise<ProfileGetResponse> {
  const res = await request.get(`${origin}/api/profile`, { headers: { Authorization: `Bearer ${token}` } });
  if (!res.ok()) {
    throw new Error(`GET /api/profile failed: HTTP ${res.status()}`);
  }
  return (await res.json()) as ProfileGetResponse;
}

type TerminalJob = Pick<ProfileJob, 'status' | 'result' | 'error'>;

/**
 * Waits for the parse job to reach a terminal status, riding the SAME
 * `GET /api/profile/jobs/:id` traffic the upload dialog's own poll issues
 * ("via the app's authenticated context", same house pattern as E2's
 * `waitForJobCompletion`) — not a hand-rolled request. The dialog polls for
 * at most `PROFILE_UPLOAD_POLL_TIMEOUT_MS` (60s) before showing "Parsing is
 * taking longer than expected." with a Retry button and going quiet; this
 * loop clicks that Retry button whenever it appears so the dialog keeps
 * polling for the job's REAL completion, with THIS function's much more
 * generous `overallTimeoutMs` as the actual authority on how long to wait —
 * a calm pending/running state, or a dialog that needs a nudge to keep
 * asking, is not a failure (docs/LIVE_SMOKE_E2E.md).
 *
 * On its own timeout, rethrows with the exact message the work order
 * requires for this failure class instead of a bare timeout: the bot drain
 * being dead is a real, actionable finding, not test flakiness.
 */
async function waitForParseJobTerminal(
  page: Page,
  request: APIRequestContext,
  origin: string,
  token: string,
  jobId: string,
  overallTimeoutMs: number,
): Promise<TerminalJob> {
  const deadline = Date.now() + overallTimeoutMs;
  for (;;) {
    const remaining = deadline - Date.now();
    if (remaining <= 0) {
      throw new Error(
        'render job never completed — check the bot container on the VPS ' +
          `(resume parse job ${jobId} never reached status "done"/"error" within ` +
          `${overallTimeoutMs / 1000}s of polling GET /api/profile/jobs/${jobId}).`,
      );
    }
    try {
      const res = await page.waitForResponse(
        async (r) => {
          if (!isJobStatusResponse(r, jobId)) return false;
          if (!r.ok()) return false;
          const body = (await r.json().catch(() => null)) as { status?: string } | null;
          return body?.status === 'done' || body?.status === 'error';
        },
        { timeout: Math.min(remaining, DIALOG_POLL_CYCLE_MS) },
      );
      return (await res.json()) as TerminalJob;
    } catch {
      // This window elapsed without a terminal status — either the job is
      // genuinely still pending/running, or the dialog's own internal
      // budget expired first and it's now showing the "taking longer than
      // expected" error with a Retry button (which only resumes polling
      // after that click). Clicking Retry when present is a no-op cost when
      // the dialog is in fact still quietly polling.
      // Review finding (PR #45): a terminal response can land in the gap
      // between this window expiring and the next one being armed (or while
      // the Retry click is mid-flight) — ridden traffic alone can miss it
      // and falsely report "never completed". A direct authenticated read
      // closes the gap authoritatively before the next window.
      const direct = await request
        .get(`${origin}/api/profile/jobs/${jobId}`, { headers: { Authorization: `Bearer ${token}` } })
        .catch(() => null);
      if (direct?.ok()) {
        const body = (await direct.json().catch(() => null)) as TerminalJob | null;
        if (body?.status === 'done' || body?.status === 'error') {
          return body;
        }
      }
      const retryButton = page.getByRole('button', { name: 'Retry', exact: true });
      if (await retryButton.isVisible().catch(() => false)) {
        await retryButton.click();
      }
    }
  }
}

test.describe('E4 — upload round-trip', () => {
  test('upload a fixture resume, verify the parse marker via the job result, discard the draft, and see the upload listed', async ({
    page,
    request,
    baseURL,
    smokeIdentity,
  }) => {
    // Redundant with the mutatingTest fixture's own guarantee — surfaces the
    // interlock's result in the test report (same pattern as E2/E3).
    expect(smokeIdentity.isOwner).toBe(false);

    test.setTimeout(TEST_TIMEOUT_MS);

    const origin = new URL(requireBaseURL(baseURL)).origin;
    const marker = buildRunMarker();

    // Write this run's copy of the committed fixture with the placeholder
    // substituted — the marker itself is never committed. Lives under
    // smoke/test-results/ (gitignored, already the suite's own scratch
    // output dir) and is removed in the `finally` below regardless of
    // outcome.
    const fixtureTemplate = fs.readFileSync(path.join(__dirname, 'fixtures', 'smoke-resume.txt'), 'utf-8');
    const fixtureContent = fixtureTemplate.replace('{{MARKER}}', marker);
    const tempDir = path.join(__dirname, 'test-results');
    fs.mkdirSync(tempDir, { recursive: true });
    const tempFileName = `smoke-resume-${Date.now()}-${Math.random().toString(36).slice(2, 8)}.txt`;
    const tempFilePath = path.join(tempDir, tempFileName);
    fs.writeFileSync(tempFilePath, fixtureContent, 'utf-8');
    // The server computes sha256 over the raw uploaded bytes and keeps
    // reporting it (re-hashed straight off disk) even once the parse job is
    // "done" — unlike filename, see the comment below — so this is a strong,
    // content-derived check that the uploads-list row really is THIS file.
    const expectedSha256 = createHash('sha256').update(fixtureContent, 'utf-8').digest('hex');

    try {
      // Attached before navigating, not after (same reasoning as E2's
      // history capture): the uploads list loads as part of the tab's own
      // bootstrap, so a listener attached post-goto could miss a fast
      // response entirely.
      const initialUploadsPromise = page.waitForResponse(isUploadsListResponse);
      await page.goto('/profile?tab=uploads');
      const initialUploadsResponse = await initialUploadsPromise;
      if (initialUploadsResponse.status() === 404) {
        throw new Error(
          'GET /api/profile/uploads returned 404 — the uploads-list endpoint (api T2) is not deployed ' +
            "on this environment, so E4's uploads-list assertion (work order step 6) cannot run.",
        );
      }
      if (!initialUploadsResponse.ok()) {
        throw new Error(`GET /api/profile/uploads failed: HTTP ${initialUploadsResponse.status()}`);
      }

      await expect(page.getByRole('heading', { name: 'Uploads', exact: true })).toBeVisible({ timeout: 15_000 });

      const token = await getStoredAuthToken(page);

      // Baseline identity read-back BEFORE any mutation — the cheap
      // read-back guard for the "discard means discard" assertion below.
      const before = await fetchProfile(request, origin, token);

      await page.getByRole('button', { name: 'Upload resume', exact: true }).click();
      await expect(page.getByRole('heading', { name: 'Upload your resume', exact: true })).toBeVisible({
        timeout: 10_000,
      });

      // The real upload UI: a native file input, styled hidden behind a
      // "Choose file" button/dropzone (upload-resume-dialog.component.ts) —
      // setInputFiles targets it directly, the same way a real drag/drop or
      // file picker interaction ultimately populates it.
      await page.locator('input[type="file"]').setInputFiles(tempFilePath);
      await expect(page.getByText(tempFileName, { exact: true })).toBeVisible();

      const uploadButton = page.getByRole('button', { name: 'Upload', exact: true });
      await expect(uploadButton).toBeEnabled();

      const [uploadResponse] = await Promise.all([
        page.waitForResponse(isProfileUploadResponse),
        uploadButton.click(),
      ]);
      expect(uploadResponse.ok(), `POST /api/profile/uploads must succeed: HTTP ${uploadResponse.status()}`).toBe(
        true,
      );
      const { jobId } = (await uploadResponse.json()) as ProfileUploadResponse;
      expect(jobId, 'POST /api/profile/uploads must return a jobId to poll').toBeTruthy();

      const terminal = await waitForParseJobTerminal(page, request, origin, token, jobId, JOB_POLL_TIMEOUT_MS);
      if (terminal.status === 'error') {
        throw new Error(`Resume parse job ${jobId} finished with status "error": ${terminal.error ?? '(no error message)'}`);
      }
      expect(terminal.status).toBe('done');
      expect(terminal.result, 'a "done" parse job must return a result document').toBeTruthy();

      // The deterministic assertion (see the module docstring): the marker
      // must survive somewhere in the parsed draft, regardless of whether it
      // landed in a structured field (real LLM parse) or a leftover
      // fragment (the $0 fallback) — both are an accepted pass here.
      expect(
        JSON.stringify(terminal.result),
        "expected this run's marker to survive parsing (in a structured field or a leftover fragment)",
      ).toContain(marker);

      // UI check (secondary, documented above): the dialog's own poll saw
      // the same "done" response and should have closed itself, handed the
      // draft to ProfileEditorComponent via the bridge, and switched the tab
      // — proving the upload -> parse -> confirmation-screen wiring, even
      // though the marker itself isn't visible in this screen's DOM (only
      // Skills/Roles proposals render pre-merge, never leftovers).
      const reviewHeading = page.getByRole('heading', { name: 'Review parsed resume', exact: true });
      await expect(reviewHeading, 'expected the confirmation screen to open after the parse completed').toBeVisible({
        timeout: 20_000,
      });

      // Discard — never merge (E3 owns profile mutation; merging here would
      // grow the profile with fixture junk every run).
      await page.getByRole('button', { name: 'Discard parsed draft', exact: true }).click();
      await expect(reviewHeading).toHaveCount(0);

      // Cheap read-back guard: the profile must be byte-identical to before
      // this test ever touched it — no PUT was ever sent, so the revision
      // alone already proves nothing was saved; the identity check is the
      // human-readable half of the same guard.
      const after = await fetchProfile(request, origin, token);
      expect(after.revision, 'discarding the parsed draft must never save anything (revision must be unchanged)').toBe(
        before.revision,
      );
      expect(after.profile.core.identity.full_name).toBe(before.profile.core.identity.full_name);

      // Uploads list: re-navigate (same "before navigating" pattern as
      // above) and find THIS run's row by jobId — deterministic, unlike
      // matching on filename/date alone.
      const uploadsListPromise = page.waitForResponse(isUploadsListResponse);
      await page.goto('/profile?tab=uploads');
      const uploadsListResponse = await uploadsListPromise;
      expect(uploadsListResponse.ok(), `GET /api/profile/uploads failed: HTTP ${uploadsListResponse.status()}`).toBe(
        true,
      );
      const uploads = (await uploadsListResponse.json()) as ProfileUploadListEntry[];
      const ourIndex = uploads.findIndex((u) => u.jobId === jobId);
      expect(
        ourIndex,
        `expected an uploads-list row for this run's jobId=${jobId}; got ${JSON.stringify(uploads)}`,
      ).toBeGreaterThanOrEqual(0);
      const ourEntry = uploads[ourIndex];
      expect(ourEntry.jobStatus).toBe('done');
      // Content-derived check, not a filename check (see below): the sha256
      // the API reports for a `done` upload is recomputed straight off the
      // file still on disk, so it stays correct after the job finishes —
      // proving this row really is THIS upload's content, not a stray one.
      expect(ourEntry.sha256).toBe(expectedSha256);
      // The task brief for this phase assumed a "PR #27 durable-metadata
      // fix" already made `filename` survive past a `done` job — verified
      // against the live api instead of assumed, and that fix does not
      // exist: `ProfileService.listUploads` (job-hunter-api,
      // src/profile/profile.service.ts) documents this as a KNOWN,
      // currently-accepted cross-repo gap (its own 2026-08-30/08-31 work
      // log entries, and its e2e suite explicitly asserts `filename: null`
      // once a job's `result` column is overwritten by the bot's real parse
      // output) — there is no separate durable store for upload metadata
      // yet. Confirmed live: this run's own row came back with
      // `filename: null` and `jobStatus: "done"`, matching that documented
      // contract exactly, not a regression. Asserting non-null here would
      // be asserting a fix that was never shipped — the sha256 check above
      // is the correct, currently-true content-integrity assertion instead.
      // Also worth flagging separately (not fixed here, per
      // docs/RESUME_PROFILE_STORE.md's "flag mismatches, don't change
      // unilaterally"): this site's own `ProfileUploadListEntry.filename`/
      // `.sha256` model types (`src/app/core/api/models.ts`) are typed as
      // non-nullable `string`, which does not match the api's actual
      // `string | null` contract (`UploadListItem`, profile-files.ts).

      // Same row, visible in the real list UI — located by the confirmed
      // API position (`ourIndex`) since `filename` can legitimately render
      // blank in the DOM per the contract above.
      const ourRow = page.locator('.upload-row').nth(ourIndex);
      await expect(ourRow).toBeVisible({ timeout: 15_000 });
      await expect(ourRow.getByText('Done', { exact: true })).toBeVisible();
    } finally {
      fs.rmSync(tempFilePath, { force: true });
    }
  });
});
