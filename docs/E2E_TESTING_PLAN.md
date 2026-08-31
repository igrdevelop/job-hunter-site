# E2E Testing Plan — real browser, real API, test users

**Status:** approved to build (owner decision 2026-08-31: "нам надо полноценные
e2e тесты на этот сайт... прям серьезно надо делать"). Not started.
**Owner motivation:** full end-to-end coverage of the site against a real
backend with seeded test users — not more unit specs, not manual "opened it in
a browser and looked".

## Problem

Today the stack has three test layers and a hole exactly where users live:

1. **Site:** Vitest component/unit specs (~317). jsdom, no browser, no real
   API. The `*_MOCK_FALLBACK_ENABLED` flags mean a dead API can render a
   green-looking page from mocks with only a console.warn.
2. **API:** jest+supertest e2e (real Nest app, temp SQLite) — honest, but the
   browser and the Angular app are not in the loop.
3. **Manual:** work-log entries say "E2E-verified against local api" — a human
   with a browser and `proxy.local.json`. Not repeatable, not in CI.

The failure class nothing catches automatically: *unit tests green, API tests
green, the deployed site broken* — a renamed field the mock still carries, a
guard redirect loop, an AG Grid column reading a property the API stopped
sending, a tab that only breaks with a real 401 → refresh → retry sequence.

## Existing foundation (build on this, do not reinvent)

- **`job-hunter-api/docker-compose.test.yml`** already builds THIS repo's
  frontend + the API into one image (nginx-less, Nest serves it) and runs it
  against fixture data (`test/fixtures/tracker.db`, fixture `Applications/`),
  with a **seed user** provisioned from `SEED_USER_EMAIL`/`SEED_USER_PASSWORD`
  env. This is 80% of the harness.
- `REGISTRATION_ENABLED` env flag exists API-side.
- `proxy.local.json` + scratch-DB local-api workflow (work log 2026-08-10)
  proves the local full-stack loop works on a dev machine.
- The bot is NOT part of this loop — `profile_jobs` rows created during e2e
  stay `pending` unless the harness resolves them (see "Job lifecycle" below).

## Decisions

1. **Playwright** (`@playwright/test`), Chromium-only in v1. Tests live in
   this repo under `e2e/` (own tsconfig, excluded from `ng build`/Vitest).
2. **Test the BUILT app against the REAL API** — the
   `docker-compose.test.yml` image, not `ng serve` + mocks. What runs in e2e
   is what deploys.
3. **Mock fallbacks OFF in e2e.** The harness env must disable every
   `*_MOCK_FALLBACK_ENABLED`-style flag (build-time config or env-driven) —
   an e2e suite that can silently pass on mock data is worse than none.
   If a flag turns out to be compile-time-only, making it env-overridable is
   part of E1.
4. **Test users are seeded, never registered against prod.** Two users
   minimum: an **owner-flagged** user (sees tab 4 + variant chips once api T3
   ships `isOwner`) and a **regular** user (must NOT see them — absence
   assertions). Registration flow itself gets one test behind
   `REGISTRATION_ENABLED=true` in the harness only.
5. **Fresh state per run:** the harness copies the fixture `tracker.db` (and
   a writable `users/` scratch) to a temp dir before `up`, mounts the copies,
   and destroys them after. Fixtures in git stay pristine; tests may mutate
   freely; no ordering coupling between tests beyond per-user data they
   themselves create.
6. **Job lifecycle without the bot:** flows that create `profile_jobs`
   (save→render, upload→parse, preview) are tested in two halves:
   - the *pending* half for real (row created, calm "в очереди" UI, poll
     keeps polling);
   - the *done/error* half via a **drain stub** — a harness helper that
     writes `status='done'` + a fixture `result` (or `status='error'`)
     directly into the mounted SQLite, playing the bot's role. This is
     honest scope: the site's contract is the API + job lifecycle, not the
     bot's rendering quality (the bot repo tests that itself).
   Implementation: `better-sqlite3` as an e2e-only devDependency operating on
   the host-mounted DB copy — no test hooks in production API code.
7. **One spec file per page/flow**, Playwright fixtures for login (storage
   state per user, created once per run), retries=1 in CI, trace+screenshot
   on failure uploaded as CI artifacts. A test that flakes twice gets a
   `@quarantine` tag and an issue — never a sleep.

## E0 — Inventory (½ day, $0, before writing any test)

Enumerate every user-reachable flow from the routes + CLAUDE.md Pages table
and rank: (a) breaks silently if the API drifts, (b) touched by recent work,
(c) pure display. Deliverable: a scenario table in this doc (flow → priority
→ phase). Also scan the three repos' work logs for real past стык-breakages
to seed the regression list (known candidates: the AG Grid theming gotcha,
the fictional-status-field fix #10, the `POST /api/applications` 404
uncertainty noted 2026-08-07).
Decision rule: E2/E3 scenario lists below are DRAFTS until E0 confirms them;
E0 may reorder but the phase structure stands.

## Phases (one PR each)

### E1 — Harness + smoke

- `e2e/` skeleton: Playwright config (baseURL from env), `global-setup`
  (compose up with temp fixture copies, wait-for-healthy, seed the second
  user, login both users once → storage states), teardown (compose down,
  temp cleanup). npm scripts: `e2e`, `e2e:ui`, `e2e:local` (reuse an
  already-running stack for fast iteration).
- Harness changes on the api side (companion, small): parameterize
  `docker-compose.test.yml` for a writable scratch DB path + a SECOND seed
  user (or a tiny seed script the harness runs) + env passthrough for the
  mock-fallback kill-switch. Flag these in the api repo, do not fork its
  compose file here.
- Smoke tests: login (bad password rejected, good password lands on
  applications), applications table renders REAL fixture rows (assert on a
  known fixture company name, not "some rows"), logout, guard redirect for
  an anonymous visit.

### E2 — Core pages

- **Applications:** filter/search via URL params (`?filter=unsent`), inline
  edit of Sent persists across reload (real PATCH → real DB), column chooser
  persistence, create-application dialog (against the real endpoint — this
  settles the 2026-08-07 "unverified 404" note), stats bar numbers match
  fixture counts.
- **Files browser:** folder navigation via URL segments, breadcrumbs,
  PDF/text preview opens.
- **Templates:** upload (real multipart) → appears in list → delete.
- **Settings / Stats:** render + URL-driven tab/period state.

### E3 — Profile (the reason this plan exists now)

- **Editor:** GET renders the seeded profile; skills chip edit → save bar →
  PUT → reload → edit survived (full round-trip through the real DB);
  required-field 400 surfaces on the right field; revision restore.
- **Tabs shell:** `?tab=` deep links, unknown falls back to editor; owner
  sees tab 4, regular user's DOM contains neither tab 4 nor the chip row
  (absence, not hiding); tab-3 flag OFF removes the tab.
- **Upload → parse → confirmation:** upload a fixture .docx → job row
  created → pending UI → drain-stub marks it done with a fixture draft →
  confirmation screen renders parsed vs current → "edited wins" default →
  accepted merge lands in the editor draft → save.
- **Preview (tab 4):** trigger → 409 empty-state when no profile → pending
  state → drain-stub completes with a fixture PDF path → history lists it
  newest-first → PDF download responds 200; cross-check the regular user
  cannot reach any of it.
- **Variant chips (after site S5):** switch to a track, override a role's
  bullets, revert to Core — document round-trips losslessly (assert via GET).

### E4 — CI

- GitHub Actions workflow in THIS repo: on PR — build the site, build/pull
  the api image, run the harness, upload traces/screenshots on failure.
- **Version skew policy:** PR runs use the api's `master` image built from
  source (checkout `job-hunter-api@master` as the compose build context —
  the compose file already does exactly this in reverse). Plus a **nightly
  scheduled run** against the LIVE prod image tags, so drift between
  deployed versions surfaces off the PR critical path instead of blocking
  unrelated site PRs.
- Budget gate: the suite must stay under ~10 min wall-clock in CI; if it
  grows past that, split into smoke-on-PR + full-nightly rather than
  slowing every PR.

### E5 — Prod smoke (separate decision, deliberately last)

A dedicated **prod test user** (seeded once by the owner, isOwner=false,
erasable via the existing admin deletion) + a ≤10-test read-mostly suite
against https://job-hunter.igrflex.work after each deploy: login, pages
render, profile GET, one preview trigger (the bot's drain is deterministic
and $0 — acceptable), NO uploads (parse costs LLM cents and pollutes
nothing-but-still), NO application edits. Runs post-deploy or manually.
**Not started until E1–E4 are stable** — prod smoke on top of a flaky local
suite is noise. Requires an owner decision on where credentials live (repo
secrets) before building.

## Risks

- **Flakiness is the death of e2e suites.** Mitigations are structural, not
  aspirational: Playwright auto-waiting only (no sleeps), storage-state login
  (no UI login per test), per-run fresh DB (no inter-test coupling), poll-UI
  tests drive the drain stub rather than racing timers, retries=1 + trace
  artifacts + the quarantine rule.
- **SQLite concurrency:** the app and the drain stub touch the same file;
  better-sqlite3 with the same busy-timeout discipline the api uses, and the
  stub only writes states the bot legitimately writes.
- **Maintenance cost:** every new page/flow phase in other work orders
  (PROFILE_PAGE_TABS S-phases, future features) must add/extend its e2e
  scenario in the SAME PR once E1 lands — add this line to those docs'
  checklists; an e2e suite that only this plan feeds goes stale in a month.
- **Harness drift vs prod:** the compose image serves the SPA from Nest, prod
  serves it from nginx with its own SPA fallback. Accepted for v1 (the
  Angular app is identical); the nginx layer is covered by E5's prod smoke.
- **api repo coupling:** E1's companion changes land in the api repo first;
  coordinate the same way as the profile-store work orders (contract stays in
  sync, no unilateral edits).

## Non-goals (v1)

- Cross-browser matrix (Chromium only; WebKit/Firefox later if ever).
- Visual regression / screenshot diffing.
- Load/performance testing.
- Testing the bot's rendering/generation quality (bot repo owns that).
- Mobile viewports beyond one basic responsive smoke check.

## Cost

- E0 ½ day; E1 ~1–2 days (harness is the real work); E2+E3 ~1 day each;
  E4 ~½–1 day; E5 ~½ day plus the credentials decision.
- CI minutes: one full run ≈ 5–10 min per PR + nightly.
- $0 LLM anywhere in E1–E4 (drain stub replaces the bot; parse is stubbed).
