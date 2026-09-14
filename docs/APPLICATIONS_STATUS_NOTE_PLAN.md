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
