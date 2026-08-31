# Profile Page Tabs — site repo work order

> **Amendment (2026-08-31, S2-S4 content phase):** the shipped UI copy for
> the four tab labels and every placeholder/empty-state string is **English**
> — matching the rest of the site (see the 2026-08-09 Filters-page copy fix
> in CLAUDE.md's work log). The Cyrillic labels below (Загрузки / Редактор /
> Итоговые файлы / Тестовое резюме) and the Russian UX copy throughout this
> doc were the owner's own conversational shorthand while deciding the
> layout, never an instruction to ship Russian strings — S1 (PR #31) copying
> them verbatim into the tab bar was a work-order misreading, caught in
> review of the live site and fixed in the S2-S4 PR. Left as-is below for
> historical record of the decision; do not copy the Cyrillic strings into
> new UI code.

> **UI feedback amendments (2026-08-31, owner review of the deployed S1-S5
> tabs):** a live-site pass over the four tabs found several things that read
> wrong in practice even though they matched the letter of the plan below.
> None of this changes the document semantics or the API contract — layout
> and copy only.
> - **Editor tab:** the page-level `<h1>Profile</h1>` heading is gone — the
>   tab bar already names the context — and the "career bank, not a resume"
>   paragraph is now a compact one-line hint instead of a hero paragraph. The
>   legacy quick-link chip row (Candidate files / Templates / Upload another
>   resume to merge / History) — an F1 relic that predates the tab shell,
>   since Uploads/Rendered Files/Templates are now their own destinations —
>   is removed. **History (revisions) stays reachable**, moved to a small
>   `History` button next to the save-bar area instead of a chip.
> - **"Personas" replaces the "VARIANTS:" chip row.** The always-visible chip
>   row with inline `×` deletes read as removable tags rather than a view
>   switcher. It's now a single closed dropdown labeled **Personas**: **"Full
>   profile"** first (the no-variant Core view — explicitly not itself a
>   persona, it's the superset every persona is a delta from) and selected by
>   default, then one item per variant track, then a divider, then **"+ Add
>   persona…"** (same add-variant flow as before) and **"Manage personas…"**
>   (a small dialog listing every persona with a per-item Delete, carrying the
>   same stale-base-CV warning the old inline `×` used to show). Deletion is
>   no longer exposed as an inline control on the dropdown itself. Everything
>   about variant/persona BEHAVIOR is unchanged: the overlay banner with
>   back-to-Core, inherited-vs-overridden sections, `?track=` URL state
>   (absent = Full profile), and the owner-only + ≥1-variant visibility gate
>   on the whole picker.
> - **Test Resume tab:** intro copy rewritten to state its purpose plainly —
>   "A dress rehearsal for your CV. Generate the exact PDF the system would
>   build from your profile today — no job posting involved. Pick a persona,
>   generate, compare with past previews below." The `core` track chip's
>   DISPLAYED label is now **"Universal (full profile)"**; the value sent to
>   `POST /api/profile/preview` is unchanged (`track: "core"`).
> - **Rendered Files tab:** the list orders by meaning instead of alphabet —
>   `candidate.yaml` first, then `candidate_profile.md`, then every
>   `base_cv_<track>.md` (alphabetical within that group), then
>   `generation_rules.local.md`. **`profile.json` is hidden from the list
>   entirely** — nothing consumes it yet, it's internal groundwork for a
>   future direct-structure consumer, not something a user should see in a
>   "your files" list. This is a display-only filter on the site side; the
>   API may still serve/list it.

Companion of the bot repo's `docs/PROFILE_PAGE_TABS_WORKORDER.md` (the
owner-approved decisions, 2026-08-31) and `job-hunter-api/docs/
PROFILE_PAGE_TABS.md` (the REST additions, phases T1–T3). This is a LAYOUT
increment ON TOP of this repo's `docs/RESUME_PROFILE_STORE.md` — the editor
phases F1–F6 there remain valid and become the content of one tab; nothing in
them is superseded except where this doc says so explicitly. **Contract
details are duplicated across the three repos — do not change them
unilaterally; flag mismatches to the user.**

## Decision: `/profile` is four tabs

```
[ Загрузки ]  [ Редактор ]  [ Итоговые файлы ]  [ Тестовое резюме ]
   tab 1        tab 2 (default)     tab 3              tab 4
```

The page's mental model matches the pipeline: upload → parse → canonical
profile → render. Tab state is URL-driven: `?tab=uploads|editor|files|preview`
(house pattern: `queryParamMap`, unknown value falls back to `editor`). The
`?section=` deep links from RESUME_PROFILE_STORE.md's routing decision apply
WITHIN the editor tab (`?tab=editor&section=skills`).

**Routing reconciliation.** RESUME_PROFILE_STORE.md moved today's candidate-
file browser to `/profile/files`. That stands for the transition; tab 3 is a
purpose-built READ-ONLY view of the rendered profile files (whitelist API),
not a general browser. Once tab 3 ships, `/profile/files` redirects to
`/profile?tab=files` and the old browser page retires. Templates stay at
`/profile/templates` untouched.

## Visibility flags

- **`isOwner`** comes from the API auth payload (api work order T3). It gates:
  - **tab 4** (Test resume) — owner-only for now, built from day one;
  - **the variant chip row** in the editor (see layout below).
  A non-owner sees a three-tab page with a plain editor — whole, not cut down.
- **tab 3** ships visible to ALL users, behind its own site-side flag
  (default ON) so it can be hidden later without rework (owner decision
  2026-08-31). Two flags total, independent.

## Editor layout: Core above, variants below (owner decision — "variant A")

This refines UX rule #3 of RESUME_PROFILE_STORE.md (which already says track
UI is invisible with ≤ 1 variant). For the owner (multiple variants):

```
Профиль (Core)                          ← the page itself; always visible
───────────────────────────────────────
Личности:  [ Angular ] [ React ] [ + ]  ← chip row BELOW Core, owner-only
```

- Core is the foundation, NOT a peer chip — it never sits in the same row as
  the track chips. Default editor view = Core, no chip selected.
- Clicking a chip overlays the editor with that variant's deltas and shows a
  banner: "Ты смотришь личность Angular — показаны её отличия от Core" with a
  "← назад к Core" action. Per-role sections show either "inherited from
  Core" (grayed, read-only) or "overridden for this track" (own full list)
  with override / revert-to-Core actions — wholesale rewrites, never
  per-bullet checkboxes (bot plan M0b finding).
- **Add variant (`+`)**: v1 restricts the key to known track slugs
  (angular / react / ai / fullstack_*) — the key is a `base_cv_<track>.md`
  filename and a filters key bot-side; no free-form names.
- **Delete variant**: warns that the next publish deletes that track's
  rendered base CV (the bot renderer already prunes stale files).
- The chips are an **edit/view context only** — they never switch what the
  bot hunts or generates for (that is automatic per-vacancy + the `/tracks`
  Telegram command; site exposure of it is explicitly deferred). UI copy must
  not imply otherwise.

## Per-tab spec

### Tab 1 — Загрузки (Uploads)

- List via `GET /api/profile/uploads` (api T2): filename, date, parse-job
  status per row (pending / running / done / error; `error` is terminal —
  the retry is a re-upload).
- Upload dropzone (`POST /api/profile/uploads`, exists) + poll
  `GET /api/profile/jobs/:id` — this is F5's upload half relocated here;
  a completed parse opens F5's **confirmation screen**, whose accepted merge
  lands in the editor tab as a normal dirty draft (F2 save bar PUTs it).
- Track-agnostic: parsing always feeds Core + leftovers.

### Tab 2 — Редактор (Editor) — default

- Everything RESUME_PROFILE_STORE.md F1–F6 specifies (skills table first,
  then identity/questionnaire, roles, leftovers, revisions), plus the
  Core-above-variants layout above. Leftovers live HERE (they are profile
  content awaiting placement), each with a "from <filename>" provenance tag.

### Tab 3 — Итоговые файлы (Rendered files) — read-only, own flag

- `GET /api/profile/files` + `GET /api/profile/files/:name` (api T2,
  whitelist-enforced server-side): `candidate.yaml`, `candidate_profile.md`,
  `base_cv_<track>.md`, `generation_rules.local.md`, `profile.json`.
- STRICTLY read-only — no edit affordances, ever (one-way DB → files rule).
- **Staleness banner**: "профиль изменён после последней публикации —
  опубликуй заново" — derived from `GET /api/profile`'s `lastRenderJob`
  vs the profile's own `updatedAt`; the banner's action re-PUTs (which
  enqueues a render).
- Empty state for a never-rendered user: "опубликуй профиль, чтобы увидеть
  итоговые файлы".

### Tab 4 — Тестовое резюме (Test resume) — owner-only

- Purpose: "что система реально сгенерирует из моего профиля" — a generic
  no-vacancy CV PDF, production layout, no watermark.
- Track selector = the same chip row semantics (angular / react / … / core).
- "Сгенерировать превью" → `POST /api/profile/preview { track }` (api T1;
  409 = publish the profile first — show that as the empty state) → poll
  `GET jobs/:id` → on done refresh the history.
- **History list, newest-first** via `GET /api/profile/previews` — date,
  track, files; PDF opens/downloads via the per-file endpoint. No pruning,
  no overwrite (owner decision).
- Deploy note: until the bot's preview drain is live, jobs sit `pending` —
  the poll UI must show a calm "в очереди" state, not an error, and never
  promise "within a minute" until the bot side ships.

## Phases (one PR each; mock-first where the API lags)

### S1 — Tab shell + flags

Tabs container on `/profile` with `?tab=` deep links; `isOwner` consumed from
the auth payload (mock-flag fallback until api T3 deploys); tab 3/4 gating;
the existing editor (whatever F-phase is merged by then) mounts as tab 2;
tabs 1/3/4 render placeholders. Specs: unknown `?tab=` falls back, non-owner
never renders tab 4 or the chip row (assert absence, not just hiding).

### S2 — Uploads tab

The list + upload + poll flow above (relocates/absorbs F5's upload half;
coordinate so F5's confirmation screen work is not duplicated). Specs: status
mapping per job state, terminal-error copy, done → confirmation screen route.

### S3 — Rendered files tab

Files list + content viewer (monospace, copy button; YAML/MD rendered as
plain text — no attempt to pretty-render), staleness banner, empty state,
`/profile/files` redirect + old page retirement. Specs: read-only (no
mutation calls exist in the component), staleness derivation, redirect.

### S4 — Test resume tab

Preview trigger + poll + history + PDF view/download; 409 empty state;
pending-queue copy. Specs: history ordering, poll states incl. long-pending,
owner-only route guard.

### S5 — Variant chips (editor layout)

The Core-above-variants overlay in the editor tab: chip row, variant banner,
inherit/override sections, add (slug-restricted) / delete (with the
stale-file warning) — builds on F2/F4's variant machinery; this phase is the
LAYOUT wrapper, not new document semantics. Specs: chip row absent for
non-owner AND for ≤ 1 variant, override/revert round-trips the document
losslessly.

## Risks / notes

- **Don't fork the editor work**: F1–F6 stay the source of truth for editor
  internals; S-phases only place them into the tab shell and add the three
  non-editor tabs. If an S-phase wants to change editor semantics, that is a
  change to RESUME_PROFILE_STORE.md — flag it, don't fork it.
- **Flag discipline**: `isOwner` gates tab 4 + chips; the tab-3 flag is
  separate and default ON. Don't collapse them into one.
- **Pending-forever previews** (bot drain not deployed) must look calm, not
  broken — copy + a "this can take a while" state after N minutes.
- Update `CLAUDE.md` (Pages table, work log) in the same PR as each phase.
