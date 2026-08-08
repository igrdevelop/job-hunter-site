# FILTERS_PAGE Plan — "Job Filters" settings page

**Status:** draft
**Date:** 2026-08-08
**Motivation:** the bot is extracting its job-intake filter policy (what
vacancies it takes vs skips) from Python code into per-user
`filters.yaml` files, and the api repo adds `GET/PUT /api/filters` to edit
them. This page is the UI. Read the companion plans FIRST — they define
everything this page renders:

- bot repo `docs/FILTERS_YAML_PLAN.md` — file format, merge model, knob
  semantics, and the authoritative page-layout spec (section "M5");
- api repo `docs/FILTERS_API_PLAN.md` — endpoint shapes + validation.

**Visual mockup: [`docs/filters-page-mockup.html`](filters-page-mockup.html)**
(plain HTML, open in a browser) — approved by the owner 2026-08-08. It shows
every section, the override badges, the locked chips and the save bar.
Restyle to the app's dark Material theme; do not redesign the structure.

## What the page is

Route `/filters`, nav entry "Job Filters" (next to the existing Settings).
Eight sections of checkboxes / chip inputs / selects editing the user's
filter overrides. Core semantics (details in the bot plan's M5 — do not
re-derive them, just implement):

1. **GET** `/api/filters` → `{ defaults, overrides, effective, meta }`.
   Render from `defaults` + `overrides`; `meta[key].merge` tells which
   chips are locked (`extend_only` → builtin entries non-removable),
   `meta[key].derived` marks read-only info cards (home city, languages —
   link to Profile, never editable here).
2. **Override visibility:** a control whose key is present in `overrides`
   gets a marker (badge + accent border) and a per-field "reset to
   default"; reset REMOVES the key from the draft (it does not write a
   copy of the default). Page-level "reset all" clears every override.
3. **PUT** sends the draft overrides object only — never `effective`,
   never keys equal to their default.
4. **Dirty-state save bar** (sticky bottom): Save / Discard / Reset all +
   unsaved-changes counter; `400` from PUT maps per-field errors
   (`errors["exclude_patterns[3]"]`) onto the matching control inline.
5. **Group checkboxes** over `exclude_levels` (junior/intern,
   lead/management, part-time) are UI-only shortcuts over the flat word
   list — tri-state: checked = all group words present, unchecked = none,
   **indeterminate** = user hand-removed part of the group via chips.
   Clicking an indeterminate box re-adds the full group. The group→words
   mapping is a frontend constant; the file/API only ever see the flat
   list.
6. **Section 8 ("Проверить на вакансии") is v2** — its endpoint needs the
   bot's Python classifier and does not exist yet. Ship the page without
   it (or render it disabled with a "coming soon" note).
7. After save, show "применится со следующего цикла охоты" — the bot picks
   the file up on its next hunt cycle, nothing is re-filtered
   retroactively.

## Implementation shape (follow existing conventions)

- `src/app/features/filters/` — standalone component, signals,
  `inject()`, MatSnackBar for save feedback — mirror
  `features/settings/settings.component.ts` (the closest existing page:
  it already does load → edit → dirty → PUT for `/api/settings`).
- `src/app/core/api/filters.api.ts` — typed client for GET/PUT +
  interfaces (`FiltersPayload`, `FilterMeta`, `FiltersErrors`) in
  `core/api/models.ts`.
- Reusable pieces worth extracting as they appear (not up front):
  chip-list input with locked entries; tri-state group checkbox.
- Route: lazy `loadComponent` under the authed shell, like `settings`.
- Tab state / deep links: none needed in v1 (single page, no tabs).

## Milestones

- **M1** — `filters.api.ts` + models + route + skeleton page rendering
  section headers and raw values from GET (read-only). Spec test with a
  mocked api client.
- **M2** — controls: chip inputs (incl. locked-chip rendering from
  `meta.merge`), checkboxes, the two selects, derived info cards,
  override badges + per-field reset. Tri-state group checkboxes.
- **M3** — save flow: dirty tracking, PUT, per-field 400 mapping,
  discard/reset-all, snackbar + "next hunt cycle" note. Component tests
  for: override badge appears/disappears, reset removes key from draft,
  extend_only chip cannot be removed, indeterminate group states.

## Risks

- **Semantics drift vs the bot** → this page never computes merge results
  itself; it renders what GET returns and submits raw overrides. All
  merge/validation intelligence stays server-side.
- **Group-checkbox mapping drifting from `exclude_levels` defaults** →
  the mapping is cosmetic; words it doesn't know simply stay as loose
  chips. A unit test pins the mapping to the fixture defaults.
- **Locked chips only cosmetically locked** → true — the API's
  extend_only validation is the real guard; the UI just avoids offering
  the footgun.
