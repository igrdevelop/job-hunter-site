# Live Smoke E2E — post-deploy checks with the test user

**Status:** work order, owner-approved direction 2026-09-02 — not started.
**Repo:** this one (job-hunter-site) owns the Playwright suite and the workflow;
no api/bot code changes are expected.

## Why

Both live incidents of 2026-09-01 — the preview download 401 ("Could not open
the file": the api endpoint didn't accept the site's `?dt=` flow) and the
vanished Test Resume tab (the deploy workflow wiped the hand-set
`OWNER_USER_ID` from the VPS `.env`) — were invisible to every existing test.
The site's unit specs and the api's e2e each run inside their own repo against
mocks/temp DBs; what broke both times was the **deployed composition**: site ↔
api contract details and server configuration. A post-deploy smoke run against
the live site is the only test tier that can see that class of failure.

The dedicated test account exists precisely for this: a real, non-owner user
(`role='user'`) whose profile is a copy of the owner's — safe to mutate,
representative in shape, and doubling as a check of the customer-facing view.

## Owner decisions (2026-09-02)

1. **Mutations are in scope, not just reads.** Profile edits (PUT round-trip)
   and resume uploads are important pieces and must be exercised every run.
2. **Rotating markers prove freshness.** Each run writes a deterministic
   marker derived from the run moment — e.g. the weekday baked into a company
   name, or the run hour encoded as a count in a role description — so a
   passing check proves *this run's* write round-tripped, never that stale
   data from a previous run happens to look right.

## Test account

- The smoke user's email/password live in GitHub Actions secrets
  (`SMOKE_USER_EMAIL` / `SMOKE_USER_PASSWORD`) — never in the repo.
- **Safety interlock (hard requirement):** before ANY mutating step, the suite
  asserts the logged-in identity is the expected smoke user — `/auth/me`
  returns `isOwner: false` AND the email equals `SMOKE_USER_EMAIL`. Any
  mismatch aborts the whole run before a single write. Misconfigured secrets
  must never let the suite edit the owner's real profile.

## The marker scheme

- One run-scoped marker string: `smoke-<YYYYMMDD>-<HH>-<weekday>` (UTC),
  e.g. `smoke-20260902-14-wed`. Deterministic within a run, different across
  runs (the rotation the owner asked for — weekday/hour variants of one
  scheme, not several ad-hoc schemes).
- **Where it is written (one sentinel location, not scattered):** a dedicated
  entry the suite owns outright and overwrites every run — recommended: one
  `extras` entry (kind `other`) whose text is exactly the marker, or a
  dedicated skill item inside a `Smoke` category. Implementation picks
  whichever of the two is (a) editable through the real editor UI and
  (b) visible in at least one rendered file. The sentinel REPLACES its
  previous value each run — the profile must not grow.
- **Verification depth:** the marker must be observed at TWO levels —
  1. read-back: `GET /api/profile` returns the new marker (DB round-trip);
  2. render: after the save's render job completes, the marker appears in a
     rendered file fetched via `GET /api/profile/files/:name` with the smoke
     user's own JWT (DB → profile_jobs queue → bot drain → rendered file —
     the full pipeline, including the bot container being alive). The
     rendered-files API is plain JWT (only the site TAB is owner-gated), so
     the non-owner smoke user can verify this directly.

## Suite (Playwright, one spec file per phase)

### E1 — Infra + login + role gating (read-only)

- Playwright added as a devDependency (its own config; unit tests untouched);
  `npm run smoke` targets `SMOKE_BASE_URL` (default the prod origin).
- Login via the real login form. Assert exactly three tabs for the smoke
  user: Uploads / Editor / Test Resume; `Rendered Files` absent from the DOM
  (live check of the 2026-09-01 gating swap + fail-closed `isOwner`).
- Editor tab shows real profile data (a known-stable field, e.g. the
  identity name — not the marker, which E3 owns).
- The safety interlock above runs here and gates E3/E4.

### E2 — Preview flow (the 2026-09-01 bug class)

- Test Resume tab → Generate preview → poll until the run appears in History
  (generous timeout, ≥ 3 min: the bot drain ticks every ~20 s and LibreOffice
  is slow on a busy VPS; a calm "queued" state is not a failure).
- Download the PDF link (the `?dt=` flow — exactly yesterday's 401) and
  assert an HTTP 200 with `application/pdf` and a non-trivial byte size.
- Preview history grows by design (dated folders, no pruning per the parent
  work order); the smoke cadence (a few runs/day) adds ~1 small folder per
  run to the TEST user only. Accepted for v1; revisit retention if it ever
  matters.

### E3 — Profile edit round-trip with the marker (mutating)

- Through the editor UI: set the sentinel to this run's marker, Save via the
  real save bar, expect the success snackbar.
- Verify level 1 (read-back) immediately; verify level 2 (render) by polling
  the render job / re-fetching the rendered file until the marker shows up
  (same generous timeout as E2).
- Also assert the PREVIOUS run's marker is gone from the profile (the
  sentinel was replaced, not appended) — this is what makes rotation prove
  freshness.

### E4 — Upload round-trip (mutating)

- Upload a tiny fixture resume (txt/md, committed in the repo) whose body
  contains this run's marker; poll the parse job to `done`; assert the parse
  result / confirmation screen surfaces the marker (the parser round-trip,
  LLM included — its leftover fallback still carries the raw text, so the
  assertion holds even when the model call degrades).
- **Discard** the draft — never merge it into the profile (E3 owns profile
  mutation; merging every run would grow the profile with junk roles).
- Uploaded files accumulate under the test user's `uploads/`; small and
  bounded by cadence — accepted for v1, note it in the workflow summary.

### Workflow

- `.github/workflows/smoke.yml`: runs on `workflow_dispatch` and after the
  deploy job completes (on `workflow_run` of Build and Deploy, success only).
  A failed smoke does NOT roll anything back — it notifies (the job fails
  loudly; a Telegram hook can ride the bot's existing alert path later, out
  of scope here).
- One run at a time (`concurrency` group) — two concurrent runs would fight
  over the sentinel and produce false negatives.
- E2E against prod means occasional flakiness; the workflow retries a failed
  spec once before declaring failure.

## Non-goals

- No mutations of anything but the smoke user's own data; no owner-account
  scenarios (an owner-view smoke needs owner credentials in CI — deliberately
  not stored; the owner checks his own view by eye).
- No load/perf testing; a few runs a day, one at a time.
- No bot-repo or api-repo changes; if a smoke check needs an api affordance
  that doesn't exist, that's a finding to surface, not a thing to build here.
- Not a replacement for repo-level tests — this tier is small on purpose
  (minutes, not an exhaustive matrix).

## Risks

- **Prod writes**: confined to the smoke account by the safety interlock;
  the sentinel replaces itself; uploads/previews accumulate slowly (accepted,
  revisit if it matters).
- **Flakiness**: generous polls, one retry, calm-pending semantics copied
  from the site's own UI rules.
- **Secret hygiene**: creds only in Actions secrets; the suite refuses to
  run mutations when the interlock fails; logs must never print the password.
- **The bot drain is a dependency**: E2/E3's render/preview waits fail if the
  bot container is down — that is a real finding (the pipeline is dead), not
  a false positive, but the failure message must say "render job never
  completed — check the bot container" rather than a bare timeout.
