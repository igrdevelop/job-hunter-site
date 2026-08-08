# CLAUDE.md — Project Context for AI Agents

Single source of truth for any agent working on this repo. Read it fully before making
changes. Update it when something here changes.

---

## What This Is

**job-hunter-site** — the Angular frontend for the Job Hunter web application.
Replaces Google Sheets (applications tracker table) and Google Drive (file browser)
with a self-hosted web UI.

- **Owner:** Ihar Petrasheuski — Senior Frontend Developer (Angular, 10+ yrs), Wrocław, PL.
- **Live URL:** https://job-hunter.igrflex.work
- **Current state:** all 6 frontend steps plus the subsequent feature/refactor/design PRs are
  merged to `master` (see Agent Work Log for the full history). `job-hunter-api` is deployed
  and reachable — confirmed 2026-08-06 via `curl https://job-hunter.igrflex.work/api/applications`,
  which returns `401 Unauthorized` from a live Express-based server (not a 404/timeout), so
  the routing + backend container are up. No valid credentials/token were available in that
  session to verify a real (authenticated) response shape, so treat response shapes as
  best-effort until confirmed against real data. Implementation plan in
  `docs/IMPLEMENTATION_PLAN.md`.
- **Backend:** `job-hunter-api` (NestJS, separate repo) — deployed and live at `/api/*`, `/auth/*`
  on the domain above (see note above on unverified response shapes).
- **Bot:** `job-hunter` (Python, separate repo — unchanged, writes tracker.db + Applications/)

---

## Architecture

```
Browser → job-hunter.igrflex.work → Cloudflare Tunnel (path routing)
         │
         ├── /api/*, /auth/* → job-hunter-api container (NestJS, :3000)
         └── everything else → job-hunter-frontend container (nginx, :80)
```

Frontend and backend are separate containers, separate images, separate CI
pipelines — each repo builds and deploys independently. Same hostname, same
origin (no CORS) via Cloudflare Tunnel path-based routing. The Angular app
still calls `/api/*` and `/auth/*` on the same origin as always.

### Pages

| Route | API endpoint | What it replaces | Description |
|-------|-------------|-----------------|-------------|
| `/login` | `/auth/*` | — | Email + password auth |
| `/applications` | `/api/applications` | Google Sheets | Tracker table (AG Grid), inline edit Sent/To Learn, default Unsent filter |
| `/files` | `/api/generated` | Google Drive | Browse + download generated CVs, cover letters, PDFs (Applications/{date}/{company}/) |
| `/files/:date` | `/api/generated/:date` | — | Company folders under a date |
| `/files/:date/:company` | `/api/generated/:date/:company` | — | Files in a company folder |
| `/profile` | `/api/files` | — | Candidate base files (base_cv_*.md, candidate_profile.md, candidate.yaml); subfolders are URL-addressable (`/profile/<path>`) |
| `/profile/templates` | `/api/templates` | — | Upload/browse resume & cover-letter templates (legacy `/templates` redirects here); `?category=` filter |
| `/settings` | `/api/settings`, `/api/settings/global`, `/api/telegram/*` | bot `.env` | Editable per-user settings form + Telegram connect card; admin sees global read-only section |
| `/filters` | `/api/filters` | bot `filters.yaml` / code FILTER | Job Filters editor (draft overrides, locked extend_only chips, tri-state level groups, dirty save bar → PUT); temporary GET mock fallback via `FILTERS_MOCK_FALLBACK_ENABLED`; plan in `docs/FILTERS_PAGE_PLAN.md` (§8 preview = v2) |
| `/stats` | `/api/analytics/*` | Telegram `/funnel` | Funnel chart, per-source stats, cost summary |
| `/signup` | `/auth/register` | — | Self-registration form; success state "check email"; 403 = disabled |
| `/verify` | `/auth/verify`, `/auth/resend` | — | Email verification + resend form |
| `/admin` | `/api/admin/users` | — | Admin-only: user table, disable/enable/delete |

---

## Tech Stack

- **Angular 22** (standalone components, signals, lazy loading)
- **Tests:** Vitest (`ng test`). TypeScript ~6.0.
- Node: Angular 22 requires `^22.22.3 || ^24.15.0 || >=26`.
- **UI framework:** Angular Material (decided during implementation — mat-table has
  built-in sort/paginator hooks that fit the server-side pattern used here)

---

## Commands

| Command | What it does |
|---|---|
| `npm start` | Dev server at http://localhost:4200 |
| `npm run build` | Production build → `dist/job-hunter-site/browser/` |
| `npm test` | Vitest unit tests |

For local dev with the backend:
```bash
ng serve --proxy-config proxy.conf.json
# Proxies /api/* and /auth/* to localhost:3000 (NestJS dev server)
```

---

## Deployment

**Production:** this repo builds its own Docker image (`Dockerfile`: `npm run
build` → nginx serving `dist/job-hunter-site/browser/`), pushes to
`ghcr.io/igrdevelop/job-hunter-site`, and deploys via `.github/workflows/deploy.yml`
on push to `master`. Deploy only touches the `frontend` service in the shared
`docker-compose.prod.yml` on the VPS (178.105.131.107) — it does not rewrite
that file; `job-hunter-api`'s CI owns it. Exposed via Cloudflare Tunnel path
routing on `job-hunter.igrflex.work` (catch-all → this container; `/api`,
`/auth` → `job-hunter-api`).

**No Cloudflare Pages** — not used.

**Domain:** `job-hunter.igrflex.work` — per earlier entries in this file, DNS was pointed at the
Cloudflare Pages default starter page pending cutover to the Cloudflare Tunnel CNAME. Confirmed
2026-08-06 that the cutover has happened: `/` returns this repo's real built `index.html`
(title "Job Hunter", `<base href="/">`) with HTTP 200, and `/api/*` responds live (401 from a
real backend) — both routes are live in production, not the Pages starter page or a DNS/timeout
failure. Domain managed in the `igrflex@gmail.com` Cloudflare account (Account ID
`69db525dd53f363bb99b1e429fe52ca2`).

---

## Accounts

- **Cloudflare:** `igrflex@gmail.com` — owns `igrflex.work` domain + DNS zone.
- **GitHub:** `igr.develop@gmail.com` (user `igrdevelop`) — owns this repo.
  git identity: name "Ihar Petrasheuski", email `igr.develop@gmail.com`.

---

## Conventions

- Active branch: **`master`** (push here = production).
- Before pushing: `npm run build` to catch errors.
- Don't commit `dist/`, `node_modules/`, `.angular/`.
- Standalone components, lazy-loaded routes, signals over BehaviorSubject.

---

## Related repos

- **`job-hunter-api`** (NestJS backend) — serves this Angular app + REST API.
  Reads tracker.db and Applications/ from the Python bot.
- **`job-hunter`** (Python bot) — scraping + LLM pipeline. Writes tracker.db
  and generates files in Applications/. Unchanged by this web app.

Full cross-repo plan: `docs/WEB_APP_PLAN.md` in the bot repo.
Frontend-specific plan: `docs/IMPLEMENTATION_PLAN.md` in this repo.

---

## Agent Work Log

> Append a dated entry after significant work. Format: `YYYY-MM-DD | agent | what`

| Date | Agent | Work |
|------|-------|------|
| 2026-06-15 | opus | Project bootstrapped: scaffolded Angular 22 app, deployed to Cloudflare Pages, attached `igrflex.work` (HTTPS auto), set up GitHub Actions auto-deploy on push to master. |
| 2026-08-04 | opus | Rewrote CLAUDE.md for new web app direction (replace Google Sheets/Drive). Created `docs/IMPLEMENTATION_PLAN.md` — 6-step frontend plan (auth, table, files, stats). Deployment model changed from Cloudflare Pages to NestJS-served static files via Cloudflare Tunnel on VPS. |
| 2026-08-04 | sonnet | Implemented all 6 steps of `docs/IMPLEMENTATION_PLAN.md` on branch `claude/plan-and-progress-61053c` (worktree, uncommitted): Angular Material, core auth (service/guard/interceptor) + typed `ApiService`, login page, applications table (sort/filter/search/inline-edit/stats/auto-refresh/responsive), files browser (breadcrumbs/folders/PDF preview/text-JSON modal), stats page (funnel/source table/cost cards, no chart lib — DIY SVG bars). Pulled SSR removal forward from Step 6 (removed `@angular/ssr`/`platform-server`/`express`) because the client-only JWT-in-localStorage auth guard doesn't work under SSR — guard always redirected to `/login` on first paint. Removed `.github/workflows/deploy.yml` (Cloudflare Pages) per plan. Added `proxy.conf.json` + `npm run start:proxy`. No backend exists yet, so all API calls are unverified against a real server — verified only via build/tests/mocked-fetch in browser. |
| 2026-08-04 | sonnet | Split from combined-image deploy into a standalone containerized frontend: added `Dockerfile` (node build → nginx serve, SPA fallback via `nginx.conf`) and `.github/workflows/deploy.yml` (build+push to `ghcr.io/igrdevelop/job-hunter-site`, deploy only the `frontend` service on the VPS — does not own `docker-compose.prod.yml`, `job-hunter-api`'s CI does). Companion change in `job-hunter-api`: dropped the named-Docker-build-context checkout of this repo and its `ServeStaticModule`/SPA-fallback middleware. See `job-hunter-api/CLAUDE.md` for the compose/Cloudflare Tunnel routing side. |
| 2026-08-04 | grok | Implemented 3 features from `implementation-prompt.md` on branch `claude/relaxed-swanson-ff067c`: (1) `unsent` status + default filter + stats bar; (2) replaced mat-table with AG Grid Community infinite-row model (cell renderers for status/url/folder, editable Sent/To Learn); (3) Templates page (`/templates`) with upload dialog, category chips, preview/download/delete + API methods. `npm run build` and `npm test` pass. |
| 2026-08-05 | grok | Implemented `docs/FIX_URL_ROUTING.md`: `/files` now calls `/api/generated` (Applications tree); added `/profile` page for `/api/files` (candidate assets); Profile nav link; text preview via blob for generated files; `.md`/`.yaml` click-to-preview in file list. |
| 2026-08-05 | grok | App shell layout on `docs/app-shell-layout` worktree: plan in `docs/APP_SHELL_LAYOUT_PLAN.md`; extracted `shared/header` + `shared/footer`; flex `100dvh` shell so header/footer are full width and footer sits at viewport bottom; Applications AG Grid fills main instead of `calc(100vh - 240px)`. |
| 2026-08-05 | grok | Added Settings page (`/settings`): Material tabs by category, key/value/description with type badges, boolean icons, masked secrets; `ApiService.getSettings()` → `GET /api/settings`. |
| 2026-08-05 | grok | Implemented `docs/STRUCTURE_REFACTOR_PLAN.md` steps 1–6: dropped redundant `standalone: true`, OnPush everywhere, moved file-browsing widgets to `shared/`, split `ApiService` into domain APIs (`applications`/`files`/`analytics`/`templates`/`settings`), consolidated `/files` route loaders, replaced manual loading with `resource()` (`params` API). Skipped optional zoneless (step 7). |
| 2026-08-06 | sonnet | Applied the "Industry" design refresh from `Design/README.md` + `Design/JobHunter.dc.html` across all screens, on branch `claude/design-update-bbec01`. Added `src/styles/{_colors,_mixins,_tokens}.scss` (steel-blue accent + neutral ramps, spacing/shadow scale, `.card`/`.tag`/`.btn`/`.field`/`.blueprint` corner-mark classes) and self-hosted Barlow/Barlow Condensed (`public/assets/fonts/`) instead of Google Fonts. Retargeted Angular Material to the design via M3 system-token overrides (`mat.theme()` + `--mat-sys-*` in `styles.scss`) rather than replacing Material components. Restyled nav/footer, Applications (stat cards, filter bar, status tags, AG Grid retheme), Files/Profile (folder/file cards — Profile's copy was adapted since this repo already turned it into a candidate-file browser, not the editable form in the mock), Templates, Settings (tabs + setting rows), and Stats. Fixed an AG Grid 36 gotcha: it silently applies its new JS Theming API (Quartz) over an imported legacy CSS theme unless `[theme]="'legacy'"` is set, and even then duplicates the theme class onto an internal `.ag-styled-root` wrapper that needs its own `::ng-deep` override. Verified visually in-browser against a throwaway local mock API (no real backend exists yet, consistent with prior entries). `npm run build` and `npm test` pass. |
| 2026-08-06 | sonnet | Merged `master` into `claude/design-update-bbec01` to pick up #10 (`fix: remove fictional status field, filter by sent column instead`), resolving conflicts by keeping the corrected `SentFilter` (`all`/`unsent`/`filled`) data model and reapplying the Industry `.card.blueprint` treatment to 3 stat cards instead of the old 7-status layout; deleted the now-unused `status-cell-renderer.component.ts`. While re-verifying, discovered the "no real backend exists yet" / "DNS points to Cloudflare Pages starter page" notes above were stale: `curl https://job-hunter.igrflex.work/` returns this repo's real built `index.html` (200) and `/api/applications` returns a live `401` from an Express-based backend — `job-hunter-api` is deployed and the domain cutover already happened. Updated the "Current state"/"Backend"/"Domain" sections accordingly. Did not attempt to authenticate against the live API (no credentials available, and brute-forcing/bypassing auth on a production service is out of bounds) — response shapes there remain unverified against real data. |
| 2026-08-06 | grok | Dark dashboard redesign on `feature/dark-redesign` from attached dark mockups (Industry light already shipped in #11). Near-black ground + blue/purple ambient glows, rounded surfaces (`--radius: 12px`), accent `#3b82f6`, gradient avatar initials in header/profile. Applications: pill `SentFilter` instead of select; Settings: category sidebar + boolean toggles; Templates/Files/Stats/Login restyled; blueprint corners hidden. Kept real data models (3 sent stats, Profile file browser, live Stats charts). `npm run build` and `npm test` pass. |
| 2026-08-07 | fable | Mockup-alignment fixes from `Design/design_handoff_jobhunter` (`REDESIGN-v2.md`, dark v2 — note: that folder is untracked, exists only in the main working dir) on `claude/design-layout-files-search-2c0470`: header content constrained to the same 1440px column as pages (logo/avatar no longer hug viewport edges), nav items left-grouped next to the wordmark (56px bar, 15px wordmark, 30px avatar), Applications toolbar recomposed (search fixed at 280px, segmented filter beside it, new "+ New application" gradient button right-aligned) with a create dialog posting to `POST /api/applications` via `ApplicationsApi.create()` — backend support for that endpoint is unverified, dialog shows an error if it 404s. Stat-tile unsent tint aligned to mockup (`#98989d`), AG Grid typography per mockup (52px rows, 12px uppercase headers, 14px/600 company, muted date/stack). Deliberately skipped (user's choice): 1280px column, footer removal, glass pagination restyle. Also applied the branding package from `Design/design_handoff_jobhunter/logo/PROMPT.md`: SVG favicon + apple-touch-icon in `public/` (old `favicon.ico` deleted), "Pipeline" mark SVGs in `public/assets/`, inline mark + wordmark lockup in the header, and product name renamed to "Jobhunter" (one word) in header/title/footer/login/settings/README — the handoff's promised `favicon.svg` was missing, so `favicon-16.svg` (same mark, thickened, unmodified) serves as `public/favicon.svg`. New-application dialog later reworked to url/text-only fields on Angular 22 Signal Forms (`form()` + `[formField]`). Verified in-browser against a throwaway local mock API; `npm run build` and `npm test` (111) pass. |
| 2026-08-08 | fable | URL-driven navigation across tabs on `feature/profile-url-navigation` (one feature per commit, tests in each): (1) Templates moved under Profile — route nested at `/profile/templates`, top-nav link removed, Templates shortcut card on Profile, Profile breadcrumb on Templates, legacy `/templates` redirects; (2) Profile folder browsing driven by URL segments (wildcard child route `/profile/**`, openFolder navigates, cumulative breadcrumb links — bookmarkable, back button works); (3) Templates `?category=`, (4) Settings admin global `?category=` (by name, replaces tab index), (5) Applications `?filter=`/`?search=` (single constructor effect applies URL state to the AG Grid; defaults omitted from URL), (6) Stats `?period=` — all via query params with unknown-value fallbacks. Pattern: toolbar handlers only `router.navigate` with `queryParamsHandling: 'merge'`; state derives from `toSignal(route.queryParamMap)`. 141 tests pass (was 111), `npm run build` clean. Related backlog doc: `../bot/docs/TEMPLATES_TO_GENERATION_PLAN.md` (wiring Templates into CV generation — not started). |
| 2026-08-08 | grok | Filters page M1 (`docs/FILTERS_PAGE_PLAN.md`): `FiltersApi` GET/PUT + models (`FiltersPayload`/`FilterMeta`/`FiltersErrors`) + plan-shaped mock fixture behind `FILTERS_MOCK_FALLBACK_ENABLED` (console.warn on use; PUT never fakes success); lazy `/filters` route + "Job Filters" nav; read-only skeleton rendering 7 mockup sections (no §8 preview — v2). Specs for api + component. |
| 2026-08-08 | grok | Filters page M2: editable controls on draft overrides — chip inputs with `extend_only` locked chips from `meta.merge`+defaults, checkboxes, `exclude_stacks_without` selects, derived Profile info cards, override badges + per-field reset; tri-state `EXCLUDE_LEVEL_GROUPS` over `exclude_levels` (fixture-pinned). |
| 2026-08-08 | grok | Filters page M3: dirty tracking + sticky save bar (Save/Discard/Reset all), PUT with per-field 400 mapping, 404 → “API not available yet”, snackbar “applies on next hunt cycle”. Specs: badge appear/disappear, reset removes draft key, extend_only chip immovable, indeterminate groups. |
| 2026-08-09 | grok | Filters page copy: UI strings switched from Russian mockup wording to English to match the rest of the app (labels, hints, save bar, snackbars). Filter data words like `техлид`/`тимлид` kept. |
| 2026-08-07 | sonnet | Multi-user update (Phases S1–S4) on `claude/multi-user-update-docs-87ee1e`: S1 — `User` model gains `role`/`emailVerified`, `getDownloadToken()` in AuthService, all `window.open` on API URLs replaced with fetch-token-then-open (`?dt=`) in files/profile/templates. S2 — `AuthService.register/verifyEmail/resendVerification`, interceptor 403→`needsEmailVerification` signal instead of logout, `/signup` page, `/verify` page, "Create account" link on login, unverified-email banner in app shell. S3 — `AdminApi`, `adminGuard`, `/admin` page (users table + disable/enable/delete), Admin nav link visible only to admins. S4 — `SettingsApi` extended (user settings CRUD + Telegram endpoints), settings page fully rebuilt: editable form (boolean toggles, number inputs, selects), Telegram connect card with countdown + status polling, admin-only global read-only section. All phases build clean (`npm run build`). Backend deps: S1←A1, S2←A3, S4←A4 — frontend code is ready, verification against live API pending deploy of those phases. |