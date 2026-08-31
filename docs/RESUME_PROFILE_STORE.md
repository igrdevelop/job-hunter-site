# Resume Profile Store — site repo work order

Companion of the bot repo's `docs/RESUME_PROFILE_STORE_PLAN.md` (the argument +
M0 measurements) and of `job-hunter-api/docs/RESUME_PROFILE_STORE.md` (the REST
surface + storage; its "Shared contract" section is normative for the API
side). **Contract details are duplicated across the three repos and must stay
in sync — do not change them unilaterally; flag mismatches to the user.**

## Goal

The profile editor: a user uploads their resume, sees everything the parser
extracted as editable fields, and extends it — skills, roles, "и прочее". The
profile is a **superset career bank**, not a resume: the pipeline *cuts*
tailored CVs from it, so fuller is better, and the UI must say so (header
copy: the more complete the profile, the better the tailoring — never "keep it
to one page").

First deliverable (owner priority): the **skills table**, rendered from the
profile document and editable.

## Contract summary (see the api work order for the full version)

- Document shape = bot `hunter/profile_schema.py`, `schema_version: 1`.
  Normative example: bot repo `candidate/profile.example.json` (merged in bot
  PR #238) — byte-copy it here as `src/app/profile-editor/mock/profile.mock.json`
  AND as a spec fixture; a contract test asserts the typed model parses it
  with nothing dropped.
- Key shapes the UI renders:
  - `core.skills: [{ category, items: string[], origin, tracks: string[] }]`
  - `variants: { [track]: { headline, summary, skills: SkillCategory[] } }` —
    a variant with its own `skills` REPLACES the core list for that track.
  - `core.roles: [{ company, title, period, subtitle, description, bullets:
    [{text, origin, tracks}], bullets_by_track: { [track]: string[] },
    title_by_track, subtitle_by_track, stack_line, stack_line_by_track,
    backend, bullets_max, legacy_stack_ok, origin }]`
  - `core.identity / location / languages / employers / education /
    experience / extras / generation_notes`, `leftovers`, `uploads`.
- Endpoints (all JWT):
  `GET /api/profile` (404 = no profile yet), `PUT /api/profile` (full
  document → `{ revision, renderJobId }`, 400 `{ errors }`),
  `POST /api/profile/uploads` (multipart docx/pdf/txt/md ≤ 10 MB →
  `{ jobId }`), `GET /api/profile/jobs/:id` (poll: `pending|running|done|
  error`, `result` = draft profile for parse jobs), `GET /api/profile/
  revisions`, `POST /api/profile/revisions/:rev/restore`.
- Rendering into the pipeline's files happens bot-side within ~a minute of a
  save; the UI copy after save: "Saved — applies to the next generated CV."

## UX rules (decided in the bot plan — not up for local reinterpretation)

1. **No skill proficiency levels** (no stars, no "advanced") — the judge
   pipeline strips such qualifiers; the UI must not collect them. Flat items
   inside categories.
2. **Origin badges**: elements carry `origin: "parsed" | "edited"`. Show a
   subtle "parsed" badge; any user edit flips it to `edited` client-side.
   During a re-upload merge, `edited` elements are NEVER auto-overwritten by
   parser output — that protection is client-side merge logic here.
3. **Track chips only when they matter**: with ≤ 1 variant the whole track UI
   is invisible (a customer sees a plain editor); the owner (several
   variants) gets a track selector + per-element track tags + per-role
   "rewritten for <track>" tabs.
4. **Leftovers bucket**: parser fragments that could not be placed are shown
   in a "Couldn't place this" section — reassign (copy into a field) or
   dismiss. Never silently dropped.
5. **Questionnaire block**: facts no resume contains (home city + aliases,
   hybrid tolerances, work authorization, `languages.disqualify_required`,
   experience label) — a separate card next to the parsed data, or filters
   and the doomed gate run on empty defaults.
6. **Superset messaging** (see Goal).

## Routing decision

> **Amended by `docs/PROFILE_PAGE_TABS.md` (2026-08-31):** `/profile` becomes
> a four-tab page (Uploads / Editor / Rendered files / Test resume) with the
> editor below as the default tab; see that doc for the tab shell, flags and
> the Core-above-variants editor layout. The `/profile/files` move below
> stands for the transition only — it later redirects to `/profile?tab=files`.

`/profile` today is the candidate-FILES browser. The editor becomes the
product surface: `/profile` → the new editor; the file browser moves to
`/profile/files` (redirect old deep links `/profile/<path>` →
`/profile/files/<path>`; templates stay at `/profile/templates`). Editor
sections get `?section=` deep links (house pattern: URL-driven state via
`queryParamMap`, unknown values fall back).

## Phases (one PR each; mock-first, like the Filters page)

### F1 — API layer + read-only editor skeleton

- `ProfileApi` (`core/api/profile.api.ts`) + typed models
  (`profile.models.ts`) matching the contract; `PROFILE_MOCK_FALLBACK_ENABLED`
  flag serving `profile.mock.json` on GET failure with a console.warn — PUT
  never fakes success (exact `FILTERS_MOCK_FALLBACK_ENABLED` semantics).
- Route rework per above. New lazy `profile-editor` page rendering read-only:
  identity card, questionnaire card, **skills table** (category rows ×
  chip-listed items), roles list (company/title/period + bullets), leftovers,
  empty-state for 404 ("Upload your resume or start from scratch" CTA stubs).
- Contract spec: mock parses into models losslessly; component specs for
  render + empty state.

### F2 — Skills table editing (the owner's asked-for slice)

- Editable categories: rename, add, delete, reorder (drag or up/down
  buttons); chip input per category for items (add/remove; Enter/comma to
  commit — same chip UX as the Filters page); origin badge per category,
  flips to `edited` on first change.
- Track handling: chips on a category (`tracks`), and a variant-skills
  editor tab per track when variants exist (variant list replaces core for
  that track — show an explicit "overrides core for <track>" banner with a
  "reset to core" action).
- Dirty tracking + sticky save bar (Save / Discard) → `PUT /api/profile`
  with the WHOLE document (server stores full documents; the editor holds
  the full draft in a signal store from F1). Per-field 400 mapping; success
  snackbar "Saved — applies to the next generated CV". This is the Filters
  page M3 pattern verbatim — reuse, don't reinvent.
- Specs: badge flip, dirty/discard, variant-override banner, PUT payload
  carries untouched sections byte-identical (no accidental normalization —
  serialize from the parsed model, assert deep-equal on untouched parts).

### F3 — Identity + questionnaire editing

Plain Signal Forms over identity/location/languages/experience;
`cv_filename_prefix` with live example ("files will be named
Jane_Doe_CV_…"); required-field errors mirror the server's PUT 400 list.

### F4 — Roles editor

Role cards: header fields, description textarea, bullets as an editable
list (textarea-per-bullet, add/remove/reorder); per-track tabs when
`bullets_by_track` (or any `*_by_track`) exists — core tab + one tab per
override track, with "add a <track> rewrite" / "remove override" actions;
compact display of `backend`/`bullets_max`/`legacy_stack_ok` under an
"advanced" expander (these feed the generation prompt's red lines — hint
text says so). Extras + `generation_notes` (single textarea, "story bank"
hint) land here too.

### F5 — Upload → parse → confirmation screen

- Dropzone card (reuse the templates upload dialog plumbing) →
  `POST /api/profile/uploads` → poll `GET jobs/:id` (interval + timeout UI).
- **Confirmation screen** (the product's core promise): parsed draft on the
  left, current profile on the right (or empty), per-section accept
  controls; merge rules — new elements come in as `parsed`, collisions with
  `edited` elements default to "keep mine" and require an explicit click to
  take the parsed version; role-duplicate heuristic (same normalized company
  + overlapping period) renders a "looks like the same role — merge?"
  prompt, never auto-merges. Result is a normal draft → the F2 save bar
  PUTs it.
- Leftovers from the parse land in the bucket with a "from <filename>" tag.
- Specs: edited-wins default, duplicate-role prompt, poll error → retry UI.

### F6 — Revisions

History panel (`GET revisions`) + restore with confirm; after restore the
editor reloads the document. Undo-after-bad-merge is the reason this exists —
keep it boring.

## Post-F6 gap fix: employers + education cards

None of F1–F6 ever explicitly scoped UI for `core.employers` (protected list +
the one flexible employer) or `core.education` (entries with per-entry origin,
`school_keyword`, `expected_role_count`) — F1's read-only skeleton only listed
identity/questionnaire/skills/roles/leftovers, even though both fields are
part of the contract (see "Key shapes" above) and both already had working
`applyParsedMerge()` logic from F5. Two new cards were added between
Questionnaire and Skills to close the gap, following the established patterns:
protected employers and flexible-employer projects are chip lists (F3/F4 chip
UX, no origin — the schema doesn't track one at that level); education entries
are edited via an Extras-style row (text input + origin badge + remove, F4's
`addExtra`/`updateExtra`/`removeExtra` pattern) since each entry carries its
own `origin` in the schema, unlike a skill item.

## Risks / notes

- **F1–F2 do not block on the API**: mock-first, flag-gated, same as Filters.
  Flip the flag off when api P1 deploys.
- **The document round-trips through the editor** — the single biggest
  correctness risk is the client dropping/normalizing fields it does not
  render. The F1 contract test (lossless parse) + F2's untouched-parts
  deep-equal spec are the guards; keep raw unknown fields in the model
  (`[key: string]: unknown` passthrough) so a newer server field survives an
  older client's PUT.
- **Empty profile UX**: until the owner seeds his profile (api P5), `/profile`
  shows the empty state — the file browser at `/profile/files` keeps serving
  the current workflow, nothing regresses.
- Update `CLAUDE.md` (Pages table, work log) in the same PR as each phase.
