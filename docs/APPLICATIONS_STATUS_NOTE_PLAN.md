# Applications table: My Status drives Sent, Note column, instant refresh

Status: approved by owner 2026-09-14. Repos: `job-hunter-api` (A1–A4), `job-hunter-site` (S1–S5).
Bot (`job-hunter`): **no code change** — see "Bot" below.

## Problem (owner report, 2026-09-14)

1. Owner picked **My Status = Sent** on a row in the Unsent view; the row stayed. Cause: two
   look-alike columns. `Status` (field `sent`, free text, double-click to type) is the ONLY
   thing the Unsent/Filled filter and the stat cards read (`TRIM(sent) = ''` = Unsent).
   `My Status` (field `appStatus`, dropdown) is a web-only field that affects nothing.
2. Even a correct edit of `Status` only leaves the Unsent view on the 30 s auto-refresh, and the
   stat cards (Total / Unsent / Filled) never refresh until a page reload.
3. No place to write **why** the owner is not applying. Historically that reason went into the
   Sent cell itself ("не тот стек"), which pollutes the funnel: api `getFunnel` and bot
   `funnel._is_sent` count any Sent text other than `''/—/–/-/expired` as a sent application.

## Facts the plan relies on (verified in code, 2026-09-14)

- api `src/tracker/tracker.service.ts`: `UNSENT_SQL = TRIM(sent) = ''`; `updateField()` sets
  `sheets_dirty = 1` only for `SHEETS_MIRRORED_COLUMNS` (`sent`, `to_learn`, `reapplication`) and
  only when `sheets_row IS NOT NULL`. `app_status` is api-owned, added by
  `src/db/tracker-migrations.ts` (idempotent `ALTER TABLE ... DEFAULT ''`), never dirtied.
- api `PATCH /api/applications/:id` applies each present field separately, returns
  `getApplicationById()`.
- bot `hunter/sent_parse.py::classify()`: ISO `YYYY-MM-DD` parses as `applied`; `-`/`—`/`–` are
  `blank` (not applied). So an auto-written date must be ISO `YYYY-MM-DD`, a not-applying marker
  must be `—` (U+2014) — the same marker the bot stamps on SKIP/FAIL rows (`db.py`).
- bot (origin/master) already owns `outcome_label TEXT NOT NULL DEFAULT ''` + `outcome_at TEXT`
  on `applications` (docs/improvement-2026-09/08-DATA_EVAL_PLAN.md M1). Labels:
  `interview | rejected | offer | silence` (`tracker.OUTCOME_LABELS`). Written by Telegram
  `/outcome` via `tracker.set_outcome()` = `UPDATE ... SET outcome_label=?, outcome_at=<UTC ISO
  seconds>, sheets_dirty=1`. `gsheets_sync.resync_dirty()` writes column O for dirty rows, but a
  **blank label is never written by resync**, and the Sheet-pull (`_merge_outcomes`) lets a valid
  Sheet label win over a clean DB row. ⇒ the api may SET an outcome, but must NEVER try to CLEAR
  one (the clear would be silently undone by the next pull). Clearing stays `/outcome <id> clear`.
- bot funnel `_is_answered()` reads `outcome_label`; today web "Interview/Offer/Rejected" in
  My Status are invisible to it — this plan fixes that as a side effect.
- site `ApplicationsComponent.patchFromGrid()` ignores the PATCH response, does not refresh the
  grid cache or `loadStats()`.

## Design

### Status → Sent / outcome mapping (single source of truth: the api)

`APP_STATUS_OPTIONS` (both repos, keep identical, order = dropdown order):
`'' | 'Sent' | 'Interview' | 'Rejected' | 'Offer' | 'Silence' | 'Skipped' | 'Filter miss'`
(`Silence` is new — parity with the bot's outcome vocabulary.)

| appStatus | kind | effect on `sent` | effect on `outcome_label` |
|---|---|---|---|
| `''` | none | nothing | nothing (never clear) |
| `Sent` | applied | if `TRIM(sent)` ∈ {`''`,`-`,`—`,`–`} → today `YYYY-MM-DD` | nothing |
| `Interview` / `Rejected` / `Offer` / `Silence` | applied | same as `Sent` | set to lowercase label + `outcome_at` if it differs |
| `Skipped` / `Filter miss` | not applying | if `TRIM(sent) = ''` → `—` | nothing |

Rules:
- Derivation runs **only if the same PATCH body does not contain `sent`** (an explicit Sent edit
  always wins; lets a client restore both fields exactly).
- A non-empty, non-dash `sent` (a date, `EXPIRED`, an old free-text reason) is never overwritten.
- Derived writes go through the same dirty rules as a manual edit: `sent` dirties the Sheet row
  (when `sheets_row IS NOT NULL`); `outcome_label`/`outcome_at` also set
  `sheets_dirty = CASE WHEN sheets_row IS NOT NULL THEN 1 ELSE sheets_dirty END` so resync writes
  column O. (Bot's `set_outcome` dirties unconditionally; we keep the api's existing "never
  resurrect a sheet-deleted row" guard.)
- `outcome_label` write is skipped entirely when the column does not exist (PRAGMA check) — the
  bot owns that migration; the api must not crash on an older tracker.db and must not add it.
- "Today" = the date in the bot's timezone. Check `TZ` for the api and bot services in the VPS
  compose file / Dockerfiles; if they can differ, compute the date explicitly in the bot's zone
  (`Intl.DateTimeFormat('en-CA', { timeZone })`), default `Europe/Warsaw`. Document the choice.
- Whole PATCH (all fields + derivation) runs in ONE `db.transaction()`.

### Note column

`note TEXT NOT NULL DEFAULT ''`, api-owned (same precedent as `app_status`): added by the api's
idempotent migration, NOT mirrored to Sheets (never dirties), bot never reads/writes it.
Max 2000 chars (DTO validation). Free text: reason for not applying, or any remark.

## job-hunter-api tasks

- **A1 migration** — `src/db/tracker-migrations.ts`: add `note` exactly like `app_status`
  (guarded by `cols.length > 0 && !cols.includes('note')`), with a comment.
- **A2 read + write note** — `APPLICATION_COLUMNS` gains `note`; `Application` DTO gains
  `note: string`; `UpdateApplicationDto.note?: string` (`@IsOptional @IsString @MaxLength(2000)`);
  `UpdatableColumn` union gains `'note'` (not in `SHEETS_MIRRORED_COLUMNS`); controller applies it.
- **A3 derivation** — new exported constants (e.g. `src/tracker/app-status.ts`):
  `APP_STATUS_OPTIONS`, `APPLIED_STATUSES`, `NOT_APPLYING_STATUSES`, `OUTCOME_BY_STATUS`,
  `DASH_MARKERS`. `UpdateApplicationDto.appStatus` gets `@IsIn(APP_STATUS_OPTIONS)`.
  Move the controller's field-by-field calls into ONE service method, e.g.
  `updateApplication(userId, id, dto)`, transactional, implementing the mapping table above.
  404 behavior unchanged (unknown id / other user's row → `NotFoundException`, nothing written).
- **A4 tests** — `src/tracker/tracker.service.spec.ts` (in-memory schema there must gain `note`,
  `outcome_label`, `outcome_at`): note round-trip + never dirties; each status kind vs blank /
  dash / date / `EXPIRED` sent; explicit `sent` in the same body suppresses derivation; outcome set
  + `outcome_at` stamped + dirty only with `sheets_row`; outcome never cleared when status moves
  back to `''`/`Sent`; outcome skipped (no crash) on a schema without `outcome_label`;
  `@IsIn` rejects an unknown status; migration idempotent (run twice). Other user's row untouched.
- Docs: api `CLAUDE.md` work log entry; `.coderabbit.yaml` / `.claude/commands/pr.md` mention the
  writable-column list ("Sent / To Learn / Re-application / app_status") — add `note` and the
  derived `outcome_label` there.
- Gates: `npm run build`, `npm test`, `npm run lint` (fix only files you touched).

## job-hunter-site tasks

- **S1 models** — `core/api/models.ts`: `Application.note?: string` (optional until api deploy);
  `ApplicationPatch` gains `'note'`; `APP_STATUS_OPTIONS` = the list above (add `Silence`, keep
  order); update the comment: My Status now fills Sent server-side.
- **S2 columns** (`applications.component.ts`):
  - `sent` column: `headerName: 'Sent'` (was "Status" — it IS the sent date), `headerTooltip`
    "Date you applied, or — if not applying. Empty = Unsent."
  - `appStatus` column: `headerTooltip` "Picking a status fills Sent automatically".
  - New `note` column right after My Status: `headerName: 'Note'`, `editable: true`,
    `cellEditor: 'agLargeTextCellEditor'`, `cellEditorPopup: true`,
    `cellEditorParams: { maxLength: 2000, rows: 6, cols: 50 }`, `tooltipField: 'note'`,
    `minWidth: 160, flex: 1`, `valueFormatter` → `'—'` when empty, visible by default.
    Stored column-visibility in localStorage keeps working (unknown key → default).
  - Verify AG Grid Community 36 supports `agLargeTextCellEditor` + tooltips with
    `AllCommunityModule` (it should); if tooltips need `tooltipShowDelay`, set a small one.
- **S3 save flow** — `onCellValueChanged` also handles `note`. `patchFromGrid`:
  - on success, if the response is a row → `event.node.setData(updated)` (shows the auto-filled
    Sent immediately);
  - if the edited field is `sent` or `appStatus` → `gridApi.refreshInfiniteCache()` and
    `loadStats()` so the row leaves Unsent and the cards update right away;
  - if the current filter is `unsent` and `updated.sent.trim() !== ''` → snackbar
    "Moved to Filled" (3 s). No undo in this round.
  - failure path unchanged (revert cell + "Failed to save change.").
- **S4 tests** — `applications.component.spec.ts`: Note column exists/editable; header renamed;
  PATCH response applied via `setData`; `refreshInfiniteCache` + `getStats` called after
  `sent`/`appStatus` edits but NOT after `toLearn`/`note`; "Moved to Filled" snackbar only in the
  unsent filter; `APP_STATUS_OPTIONS` includes `Silence`.
- **S5 docs** — copy this plan to `docs/APPLICATIONS_STATUS_NOTE_PLAN.md`; `CLAUDE.md` work log
  entry.
- Gates: `npm run build`, `npm test`.

## Bot (job-hunter)

No change. `note` and `app_status` are api-owned and invisible to the bot; `outcome_label` is
written with the bot's own vocabulary and dirty semantics, so `/outcome`, the funnel and the
Sheet column-O mirror pick web outcomes up for free. Web edits of Sent reach the Sheet via the
existing `sheets_dirty` → `resync_dirty()` path.

## Rollout

1. api PR merged + deployed first (site tolerates a missing `note`; before the api deploy a
   Note edit may 400 and simply reverts with the existing snackbar).
2. site PR.
3. Manual check on prod: Unsent view → My Status = Skipped → row leaves, Unsent card −1, Filled
   +1, Sent shows `—`; Note saves and survives reload; Interview → Telegram `/outcome` lists it
   as recorded.

## Out of scope / follow-ups

- Undo for a row that vanished from the Unsent view.
- Clearing an outcome from the web (needs a bot-side change so resync/pull can carry a blank).
- `POST /api/applications` (New application dialog) — the api controller has no POST handler.

## v2 (owner review 2026-09-14)

The owner clicked through the round-1 build above (same day) and reported five problems, worked
into a full plan at `C:\Users\IGR\.claude\plans\lovely-fluttering-pond.md` (Context / Design "UI" /
Execution "site" / Verification sections) — that file is the authoritative plan for this round;
this section is a summary of what the site half actually implemented, for anyone who only has this
repo checked out.

**Problems fixed:**

1. Sent was still inline-editable (a legacy Sheets-era carryover) even though it's a derived value
   now. → `editable: false`, renderer unchanged.
2. My Status needed a double-click to open its `agSelectCellEditor`, then the list was clipped/
   taller than the grid. → replaced with a pill button that opens a `mat-menu` (a CDK overlay on
   `document.body`) on a single click; no grid editor for this column at all.
3. Popup editors (My Status, Note) were hard to close — they stayed open. → the mat-menu closes on
   selection/outside-click/Esc for free (CDK overlay behavior); the grid also gained
   `stopEditingWhenCellsLoseFocus: true` so the one remaining inline editor (To Learn) commits on
   outside click too.
4. Note was really "why I didn't send" recorded as free text, which doesn't support analysis
   (grouping "wrong stack" vs "seniority" vs "location", etc.). → replaced with a fixed reason-code
   + optional-comment pair (`ownerReason`/`ownerReasonNote`), picked from a status-filtered list in
   a new dialog. The round-1 `note` field was never deployed api-side, so nothing needed migrating.
5. There was no way to flag "the bot should have filtered this" (as opposed to "the bot was right
   to let it through, I decided not to apply"), which is exactly the label a future filter-tuning
   pass would need. → two decline statuses, `Skipped` and `Filter miss`, both open the same reason
   dialog; `Filter miss` hides two reasons (`salary`, `not_interesting`) that only make sense as a
   personal decision, never as something the bot's filters could have detected.

**Site implementation, in one paragraph** (full narrative in the CLAUDE.md work-log entry dated
2026-09-14 "v2"): `models.ts` drops `Application.note`/`ApplicationPatch.note` and adds
`ownerReason?`/`ownerReasonNote?`, plus `DeclineStatus`, `isDeclineStatus()`, `OwnerReason`,
`OWNER_REASONS` (16 codes, labels, and per-status allowance — mirrors the api's
`src/tracker/app-status.ts`, kept identical by hand since there's no shared package), and
`ownerReasonsForStatus()`/`ownerReasonLabel()` helpers. New `AppStatusCellRendererComponent`
(`cell-renderers/`) renders the pill + menu (`Sent` · divider · `Interview`/`Rejected`/`Offer`/
`Silence` · divider · `Skipped…`/`Filter miss…` · divider · `Clear`) and reports the choice via an
`onSelect(node, status)` callback passed through `cellRendererParams`, the AG Grid standard pattern
for a custom renderer that needs to call back into its host. New `DeclineReasonDialogComponent`
(`decline-reason-dialog/`, modeled on `new-application-dialog/` and `profile-editor/
add-variant-dialog/`) asks "Why skipped?" / "Which filter should have caught it?", lists reasons
filtered by status via `mat-radio-group`, takes an optional 500-char comment, disables Save until a
reason is picked, and — since Cancel/Esc/backdrop all resolve `afterClosed()` with `undefined` by
MatDialog's own default — the caller treats a falsy result as "no change at all, not even the
status". `applications.component.ts` gained one shared save path, `saveRow(node, patch)`: PATCH →
`node.setData(updated)` on success (deliberately no optimistic write first, so failure has nothing
to revert, just a "Failed to save change." snackbar) → `refreshInfiniteCache()` + `loadStats()` +
a 3s "Moved to Filled" snackbar in the unsent view whenever the patch carries `appStatus`.
`onAppStatusSelected()` routes Skipped/Filter miss to `openDeclineDialog()` (pre-filled from the
row's current `ownerReason`/`ownerReasonNote` when re-editing an already-declined row) and saves
every other status directly. The Reason column (replacing Note) has no single backing `field` — it
derives from two — so it's declared with `colId: 'reason'` instead, which meant teaching
`columnToggles`/`hiddenColumns`/`applyStoredVisibility` (all previously keyed on `field`) to fall
back to `colId`; it renders `"<label> — <comment>"`, the label alone, or `—`, the same text serving
as both the cell value and the tooltip, and its `onCellClicked` reopens the dialog only when the
row's `appStatus` is Skipped or Filter miss. `onCellValueChanged` now only reacts to `toLearn` — the
only field still edited inline in the grid.

**Deviations / judgment calls (no api or AG Grid surprises forced anything drastic):**

- The plan describes the reason list as "a radio/chip list" — implemented as a Material
  `mat-radio-group` (single-select, matches "pick one category" better than a chip multi-select
  UI, and keeps parity with the api's single `ownerReason` field, not an array).
- `saveRow`'s refresh/stats/snackbar guard is keyed on `patch.appStatus !== undefined` rather than
  unconditionally, even though every current caller (the menu, the dialog) always includes
  `appStatus` — kept as an explicit guard so a future caller that reuses `saveRow` for a
  non-status field doesn't get a spurious grid refresh.
- `AppStatusCellRendererComponent` and `DeclineReasonDialogComponent` were not wired into a live
  grid/dialog interaction test against a running AG Grid instance (out of scope per the work
  order — no dev server, no browser verification this round); their specs mount the components
  directly via TestBed and assert DOM/callback behavior, plus `applications.component.spec.ts`
  covers the colDef wiring (`cellRenderer`, `cellRendererParams.onSelect`, `onCellClicked`) and the
  save/dialog flow by calling the component's own methods. The coordinator's own browser pass
  (against the real, parallel-in-progress api change) is the first end-to-end check.

### Review follow-ups (2026-09-14, code review pass on PR #49)

Six findings from a code-review pass on the v2 PR, all fixed with specs, same day:

1. **Decline dialog pre-fill bug.** `openDeclineDialog()` always passed the row's current
   `ownerReason` through to the dialog, even when switching status (e.g. Skipped → Filter miss).
   A handful of reason codes (`salary`, `not_interesting`) are Skipped-only, so re-opening with an
   invalid carried-over code left no radio selected while Save stayed enabled (`reason` was still
   truthy) — Save then 400'd. Fixed in `DeclineReasonDialogComponent` itself: `reason` now
   pre-fills only when `ownerReasonsForStatus(status)` actually contains the incoming code, else
   `''`.
2. **a11y: static `aria-label`.** The status pill's `aria-label="Set status"` was static, so a
   screen reader never announced the actual current status. Now
   `[attr.aria-label]="'My status: ' + (value || 'not set')"`.
3. **Reason column tooltip on empty cells.** `tooltipValueGetter` reused `reasonText()`, which
   returns `'—'` for an empty reason — so hovering an empty cell showed a `'—'` tooltip. It now
   checks `ownerReason` directly and returns `undefined` (no tooltip) when there's nothing to show.
4. **Refresh-pause test gap.** The existing specs only asserted `isUserInteracting()`, never that
   the periodic refresh itself actually skips/fires. Added a spec that spies on `setInterval` to
   capture the constructor's real tick callback and invokes it directly while a status menu is
   open vs. closed — asserting `refreshInfiniteCache` is skipped then called. (`vi.useFakeTimers()`
   around the whole component-creation flow was tried first per the review's own suggestion, but
   deadlocked TestBed's fixture stabilization — Angular's scheduler needs real timers — so the
   spy-and-invoke approach was used instead; it exercises the identical callback.)
5. **Focus after the decline dialog closes — investigated, real bug, fixed.** The dialog opens
   synchronously from inside a mat-menu item's click handler. Reading Angular Material's own
   source (`node_modules/@angular/material/fesm2022/menu.mjs`, `@angular/cdk/fesm2022/dialog.mjs`)
   confirmed: MatDialog's initial autofocus-into-the-dialog is deferred via `afterNextRender`, so
   it always wins over the menu's own (synchronous) close-time focus restore — opening the dialog
   is fine. But `CdkDialogContainer` also captures "the element focused right before I opened" for
   its own close-time `restoreFocus`, and that capture happens *before* the menu has finished
   closing — so it grabs the **menu item**, not the pill. The menu detaches that item from the DOM
   within its close animation, long before the user finishes the dialog, so when the dialog
   eventually closes, `restoreFocus` calls `.focus()` on a detached element (a no-op) and focus is
   lost to `<body>` — a real, confirmed accessibility regression on every Skipped/Filter miss save
   or cancel. Fixed by threading the pill's own DOM element through
   `AppStatusCellRendererParams.onSelect(node, status, triggerElement)` (via a `#trigger` template
   ref + a static `ViewChild` in the renderer) to `onAppStatusSelected()` → `openDeclineDialog()`,
   which now passes `restoreFocus: triggerElement ?? true` to `dialog.open()` — an explicit,
   still-alive element MatDialog can always refocus, instead of relying on its own (here, stale)
   automatic capture. The Reason-column click path (not opened from a menu) keeps the harmless
   default (`true`).
6. **Api behavior change coming in job-hunter-api#34** (Clear now resets `sent` from `—` back to
   `''`, so the row returns to Unsent). Verified `saveRow`'s refresh/stats guard
   (`patch.appStatus !== undefined`) already covers Clear (`appStatus: ''` is not `undefined`), and
   that the "Moved to Filled" snackbar's own guard (`updated.sent.trim() !== ''`) already stays
   silent for a Clear, since the api response's `sent` comes back empty — both locked in with new
   specs, no logic change needed. Reworded the My Status header tooltip to mention it: "Clear
   undoes Skipped/Filter miss and returns the row to Unsent."

`npm test`: 450 → 463 (13 new specs across the three touched files); `npm run build` stays clean.
This is the final total for the v2 PR (identity/dialog/menu work plus this review-follow-ups
pass); the "415 → 444" total once printed here was the pre-follow-ups checkpoint from the same
work and is superseded by the line above, not a separate scope — removed to stop the two numbers
from reading as contradictory.

### CodeRabbit review follow-ups (2026-09-14, PR #49)

Three findings from CodeRabbit's automated review, all verified against the actual code before
fixing:

1. **Stale test totals (this file, was line 284).** Confirmed against `git show` that "Tests: 415
   → 444" was the pre-follow-ups checkpoint from the commit just before the "Review follow-ups"
   section above was added, left dangling at the end of the file once that section's own "450 →
   463" total was inserted above it. Replaced with a note explaining the superseded number instead
   of a second, contradicting total.
2. **Reason column had no keyboard activation.** Confirmed: the `colId: 'reason'` colDef only
   defined `onCellClicked`, so a keyboard user tabbed to the cell had no way to open the decline
   dialog — Enter did nothing and Space triggered AG Grid's default row selection instead (checked
   against `node_modules/ag-grid-community`: `suppressKeyboardEvent` on the colDef is what gates
   the grid's own default per-key handling, verified in the bundled source). Fixed by adding
   `suppressKeyboardEvent` to the colDef (claims Enter/Space so the grid's own Space-selects-row
   default never runs) plus a new `(cellKeyDown)` grid output wired to `onCellKeyDown()`, which
   applies the same Skipped/Filter-miss guard as `onCellClicked` before calling
   `openDeclineDialog()`. Mouse behavior is unchanged.
3. **Same-row status saves were not serialized.** Confirmed: `onAppStatusSelected` and the decline
   dialog both call `void saveRow(...)`, and `saveRow` had no ordering guarantee — two quick status
   picks on one row started two independent PATCHes, and whichever response resolved last won via
   `node.setData(updated)`, regardless of which pick was more recent. Fixed with a
   `Map<string, Promise<void>>` (`pendingSaves`, keyed by application id): `saveRow` now chains its
   work behind whatever's already pending for that id, so a later pick's PATCH isn't even sent
   until the earlier one has fully resolved (or failed) and applied its own response — the last
   pick made is always the last one applied. Saves for different rows are unaffected (separate map
   entries, run concurrently as before).

`npm test`: 463 → 472 (9 new specs: keyboard activation + suppressKeyboardEvent on the Reason
column, same-row save serialization with a deferred-promise spec proving the second PATCH isn't
sent until the first resolves, and a same-id-only-across-different-rows spec); `npm run build`
stays clean.
