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
- **Current state:** all 6 frontend steps built on branch `claude/plan-and-progress-61053c`
  (uncommitted worktree) — auth, applications table, files browser, stats. Not yet merged
  to master, and untested against a real backend (`job-hunter-api` doesn't exist yet).
  Implementation plan in `docs/IMPLEMENTATION_PLAN.md`.
- **Backend:** `job-hunter-api` (NestJS, separate repo — to be created)
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

| Route | What it replaces | Description |
|-------|-----------------|-------------|
| `/login` | — | Email + password auth |
| `/applications` | Google Sheets | Tracker table, inline edit Sent/To Learn/Re-application |
| `/files` | Google Drive | Browse + download generated CVs, cover letters, PDFs |
| `/stats` | Telegram `/funnel` | Funnel chart, per-source stats, cost summary |

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

**Domain:** `job-hunter.igrflex.work` — DNS currently points to Cloudflare Pages
(default starter page). Will be switched to the Cloudflare Tunnel CNAME when the
app goes live. Domain managed in the `igrflex@gmail.com` Cloudflare account
(Account ID `69db525dd53f363bb99b1e429fe52ca2`).

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
