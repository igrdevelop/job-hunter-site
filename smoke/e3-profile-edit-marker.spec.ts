import type { APIRequestContext, Locator, Response } from '@playwright/test';
import { mutatingTest as test, expect } from './helpers/mutating-test';
import { buildRunMarker, MARKER_RE } from './helpers/marker';
import { getStoredAuthToken } from './helpers/token';
import { requireBaseURL } from './helpers/env';
import type { ProfileGetResponse, ProfileJob, ProfilePutResponse } from '../src/app/core/api/models';

/**
 * E3 — Profile edit round-trip with the rotating marker (mutating),
 * docs/LIVE_SMOKE_E2E.md.
 *
 * Saving a profile edit enqueues real bot render work (`profile_jobs`) — a
 * side effect, so this is written the ONLY sanctioned way: `import {
 * mutatingTest as test, expect } from './helpers/mutating-test'`, never
 * `@playwright/test` or guarded-fixtures directly (see
 * smoke/helpers/mutating-test.ts). The `smokeIdentity` fixture runs the
 * safety interlock BEFORE this test body executes.
 *
 * Sentinel choice (verified empirically against hunter/profile_render.py in
 * the bot repo, not assumed): a dedicated `extras` entry with `kind: 'other'`
 * — the work order's other suggested option (a `Smoke` skill category) would
 * ALSO render into `base_cv_<track>.md`, which is more DOM surgery for the
 * same guarantee. `render_profile_md()` (bot repo) renders every non-empty
 * `core.extras[].text` verbatim under an "**Additional**:" heading into
 * `candidate_profile.md` and ONLY that file — `render_base_cv()` and
 * `render_candidate_yaml()` never touch `core.extras` at all — so
 * `candidate_profile.md` is the one rendered file this sentinel can appear
 * in, and it satisfies the work order's "editable through the real editor
 * UI" + "visible in at least one rendered file" pair.
 */

/** The one file `core.extras` renders into (see the module docstring above). */
const RENDERED_SENTINEL_FILE = 'candidate_profile.md';

/**
 * Generous patience, same reasoning and same budget as E2's preview-render
 * poll (docs/LIVE_SMOKE_E2E.md: "generous timeout, >= 3 min" — the bot's
 * profile_jobs drain ticks every ~20s and LibreOffice is slow on a busy
 * VPS). Unlike E2, nothing in the editor UI polls a render job on its own
 * (only the Test Resume tab and the upload-parse dialog do) — Save just
 * PUTs and shows a snackbar — so this phase polls `GET /api/profile/jobs/:id`
 * directly via the `request` fixture instead of riding UI traffic.
 */
const RENDER_JOB_POLL_TIMEOUT_MS = 4 * 60_000;
/** Mirrors the app's own poll cadence (PROFILE_PREVIEW_POLL_INTERVAL_MS, profile-test-resume.component.ts). */
const RENDER_JOB_POLL_INTERVAL_MS = 5_000;
/** Headroom above the poll budget for navigation, the save round-trip, the two extra reads, and Playwright's own bookkeeping. */
const TEST_TIMEOUT_MS = RENDER_JOB_POLL_TIMEOUT_MS + 90_000;

function isProfilePutResponse(res: Response): boolean {
  return res.request().method() === 'PUT' && new URL(res.url()).pathname === '/api/profile';
}

/** Every `.extra-row` text input inside the Extras card, in document (= `core.extras` array) order. */
function extraTextInputs(extrasSection: Locator): Locator {
  return extrasSection.locator('.extra-row input[type="text"]');
}

/**
 * Finds this suite's own sentinel row by its VALUE shape (MARKER_RE), not by
 * a bare `smoke-` prefix — a coincidental hand-written extra must never be
 * mistaken for the sentinel. Throws if more than one match is found: the
 * sentinel is a single entry the suite owns outright, and the profile must
 * never grow a second one (work order: "the profile must not grow").
 */
async function findSentinelRow(extrasSection: Locator): Promise<{ index: number; value: string } | null> {
  const inputs = extraTextInputs(extrasSection);
  const count = await inputs.count();
  const matches: { index: number; value: string }[] = [];
  for (let i = 0; i < count; i++) {
    const value = await inputs.nth(i).inputValue();
    if (MARKER_RE.test(value)) matches.push({ index: i, value });
  }
  if (matches.length > 1) {
    throw new Error(
      `expected at most one smoke marker sentinel in Extras, found ${matches.length}: ` +
        `${JSON.stringify(matches.map((m) => m.value))} — the sentinel must replace itself each run, never grow a second copy.`,
    );
  }
  return matches[0] ?? null;
}

async function fetchProfile(request: APIRequestContext, origin: string, token: string): Promise<ProfileGetResponse> {
  const res = await request.get(`${origin}/api/profile`, { headers: { Authorization: `Bearer ${token}` } });
  if (!res.ok()) {
    throw new Error(`GET /api/profile failed: HTTP ${res.status()}`);
  }
  return (await res.json()) as ProfileGetResponse;
}

/**
 * Polls `GET /api/profile/jobs/:id` directly (not via UI traffic — see the
 * module docstring). On timeout, rethrows with the exact message the work
 * order requires for this failure class ("render job never completed —
 * check the bot container") instead of a bare timeout: the bot drain being
 * dead is a real, actionable finding, not test flakiness.
 */
async function pollRenderJob(
  request: APIRequestContext,
  origin: string,
  token: string,
  jobId: string,
): Promise<ProfileJob> {
  const deadline = Date.now() + RENDER_JOB_POLL_TIMEOUT_MS;
  for (;;) {
    const res = await request.get(`${origin}/api/profile/jobs/${jobId}`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (res.ok()) {
      const job = (await res.json()) as ProfileJob;
      if (job.status === 'done' || job.status === 'error') return job;
    }
    if (Date.now() >= deadline) {
      throw new Error(
        'render job never completed — check the bot container on the VPS ' +
          `(profile render job ${jobId} never reached status "done"/"error" within ` +
          `${RENDER_JOB_POLL_TIMEOUT_MS / 1000}s of polling GET /api/profile/jobs/${jobId}).`,
      );
    }
    await new Promise((resolve) => setTimeout(resolve, RENDER_JOB_POLL_INTERVAL_MS));
  }
}

async function fetchRenderedFile(request: APIRequestContext, origin: string, token: string, name: string): Promise<string> {
  const res = await request.get(`${origin}/api/profile/files/${encodeURIComponent(name)}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok()) {
    throw new Error(`GET /api/profile/files/${name} failed: HTTP ${res.status()}`);
  }
  return res.text();
}

test.describe('E3 — profile edit round-trip with the marker', () => {
  test('replace the sentinel with this run\'s marker, save, and verify read-back + render', async ({
    page,
    request,
    baseURL,
    smokeIdentity,
  }) => {
    // Redundant with the mutatingTest fixture's own guarantee — surfaces the
    // interlock's result in the test report (same pattern as E2).
    expect(smokeIdentity.isOwner).toBe(false);

    test.setTimeout(TEST_TIMEOUT_MS);

    const origin = new URL(requireBaseURL(baseURL)).origin;

    await page.goto('/profile?tab=editor');

    // Same "profile fixture missing" early-out as E1, so a broken fixture
    // fails with a clear message instead of the Extras heading simply never
    // appearing.
    await expect(
      page.getByRole('heading', { name: 'No profile yet' }),
      'the smoke user has no profile (or it failed to load)',
    ).toHaveCount(0);

    const extrasSection = page
      .locator('section.profile-section')
      .filter({ has: page.getByRole('heading', { name: 'Extras', exact: true }) });
    await expect(extrasSection).toBeVisible({ timeout: 15_000 });

    const marker = buildRunMarker();
    const existing = await findSentinelRow(extrasSection);
    const previousMarker = existing?.value ?? null;

    // Surgical edit: touch ONLY the sentinel row's text field — never any
    // other profile field. The PUT below sends the full document (that's
    // how the API is designed), but nothing else in it changes.
    if (existing) {
      await extraTextInputs(extrasSection).nth(existing.index).fill(marker);
    } else {
      const rows = extrasSection.locator('.extra-row');
      const countBefore = await rows.count();
      await extrasSection.getByRole('button', { name: '+ Add extra', exact: true }).click();
      await expect(rows).toHaveCount(countBefore + 1);
      // A freshly added row already defaults to kind: 'other' (addExtra() in
      // profile-editor.component.ts) — nothing to change on the select.
      await extraTextInputs(extrasSection).nth(countBefore).fill(marker);
    }

    const saveButton = page.getByRole('button', { name: 'Save', exact: true });
    await expect(saveButton).toBeEnabled();

    const [putResponse] = await Promise.all([page.waitForResponse(isProfilePutResponse), saveButton.click()]);
    expect(putResponse.status(), 'PUT /api/profile must succeed').toBe(200);
    const putBody = (await putResponse.json()) as ProfilePutResponse;
    expect(putBody.renderJobId, 'PUT /api/profile must return a renderJobId to poll').toBeTruthy();

    await expect(page.getByText('Saved — applies to the next generated CV.')).toBeVisible({ timeout: 10_000 });

    const token = await getStoredAuthToken(page);

    // Verify level 1 (read-back): GET /api/profile via the smoke user's own
    // authenticated context. The sentinel must be REPLACED, not appended —
    // this is what makes the rotation prove freshness (work order).
    const afterSave = await fetchProfile(request, origin, token);
    const extraTexts = afterSave.profile.core.extras.map((e) => e.text);
    expect(extraTexts, "GET /api/profile must show this run's marker in Extras").toContain(marker);
    if (previousMarker) {
      expect(
        extraTexts,
        "the sentinel must be REPLACED, not appended — the previous run's marker must be gone from the profile",
      ).not.toContain(previousMarker);
    }

    // Verify level 2 (render): poll the render job this PUT enqueued, then
    // fetch the rendered file via the smoke user's own JWT — the
    // rendered-files API is plain JWT (only the site TAB is owner-gated), so
    // this non-owner account can verify it directly without going through
    // the (owner-only, absent from this account's DOM) Rendered Files tab.
    const renderJobId = putBody.renderJobId as string;
    const job = await pollRenderJob(request, origin, token, renderJobId);
    if (job.status === 'error') {
      throw new Error(`Profile render job ${renderJobId} finished with status "error": ${job.error ?? '(no error message)'}`);
    }
    expect(job.status).toBe('done');

    const fileText = await fetchRenderedFile(request, origin, token, RENDERED_SENTINEL_FILE);
    expect(fileText, `expected this run's marker in ${RENDERED_SENTINEL_FILE}`).toContain(marker);
    if (previousMarker) {
      expect(fileText, "the previous run's marker must not survive the re-render").not.toContain(previousMarker);
    }
  });
});
