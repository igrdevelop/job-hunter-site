# Frontend Implementation Plan — Job Hunter Web App

> This is the Angular frontend part of the Job Hunter web app.
> The full cross-repo plan lives in the bot repo: `docs/WEB_APP_PLAN.md`.
>
> **This repo:** `job-hunter-site` — Angular 22 SPA
> **Backend repo:** `job-hunter-api` (NestJS, to be created)
> **Bot repo:** `job-hunter` (Python, existing — unchanged in Phase A)
>
> **Domain:** `job-hunter.igrflex.work`
> **Deploy:** NestJS serves Angular dist + API from VPS via Cloudflare Tunnel.
> No more Cloudflare Pages — the `deploy.yml` GitHub Action will be replaced
> with a Docker-based build in `job-hunter-api`.

---

## Context: what the app replaces

| Google product | Web app page | What it shows |
|----------------|-------------|---------------|
| Google Sheets | `/applications` | Tracker table: all applications, inline edit Sent/To Learn/Re-application |
| Google Drive | `/files` | File browser: generated CVs, cover letters, PDFs |
| Telegram `/funnel` | `/stats` | Funnel chart, per-source stats, cost summary |
| — | `/login` | Email + password auth |

The Python bot writes to `tracker.db` (SQLite) and `Applications/` folder.
NestJS reads them and serves a REST API. This Angular app consumes that API.

---

## Prerequisites (done in `job-hunter-api`, not here)

Before starting frontend work, the backend must have:
- [ ] `GET /health` — NestJS running, reachable via tunnel
- [ ] `POST /auth/login`, `POST /auth/register`, `GET /auth/me` — JWT auth
- [ ] `GET /api/applications` — paginated tracker data from tracker.db
- [ ] `PATCH /api/applications/:id` — update Sent, To Learn, Re-application
- [ ] `GET /api/files/*` — list and serve files from Applications/
- [ ] `GET /api/analytics/*` — funnel and cost data

---

## Step 1: Core infrastructure (1 day)

**Goal:** Auth service, HTTP interceptor, route guard, API service.
Everything else builds on this.

### 1.1 Install dependencies
```bash
ng add @angular/material    # or: npm install primeng (decide at start)
```

### 1.2 Create core services

```
src/app/
├── core/
│   ├── auth/
│   │   ├── auth.service.ts        # login(), logout(), isLoggedIn signal
│   │   ├── auth.guard.ts          # canActivate → redirect to /login
│   │   └── auth.interceptor.ts    # attach JWT header to /api/* requests
│   └── api/
│       └── api.service.ts         # base HTTP client, typed methods
```

**auth.service.ts:**
- `login(email, password)` → POST `/auth/login` → store JWT in localStorage
- `logout()` → clear JWT, navigate to `/login`
- `isLoggedIn: Signal<boolean>` — reactive auth state
- `currentUser: Signal<User | null>` — from `/auth/me`

**auth.interceptor.ts:**
- `HttpInterceptorFn` (functional, Angular 19+ style)
- Attach `Authorization: Bearer <token>` to all `/api/*` and `/auth/me` requests
- On 401 → auto-logout, redirect to `/login`

**api.service.ts:**
- Typed wrapper: `getApplications(params)`, `patchApplication(id, data)`,
  `getFiles(path)`, `getAnalytics(type, params)`
- Base URL: `/api` in production (same origin), `http://localhost:3000/api`
  in dev (via `environment.ts`)

### 1.3 Configure routing

```typescript
// app.routes.ts
export const routes: Routes = [
  { path: 'login', loadComponent: () => import('./features/login/login.component') },
  {
    path: '',
    canActivate: [authGuard],
    children: [
      { path: 'applications', loadComponent: () => import('./features/applications/applications.component') },
      { path: 'files', loadComponent: () => import('./features/files/files.component') },
      { path: 'files/:date', loadComponent: () => import('./features/files/files.component') },
      { path: 'files/:date/:company', loadComponent: () => import('./features/files/files.component') },
      { path: 'stats', loadComponent: () => import('./features/stats/stats.component') },
      { path: '', redirectTo: 'applications', pathMatch: 'full' },
    ],
  },
  { path: '**', redirectTo: '' },
];
```

### 1.4 App shell

Simple layout: top nav bar with links (Applications, Files, Stats) + user
menu (email, logout). `<router-outlet>` below.

**Deliverable:** app boots, redirects to `/login`, can log in and see empty
applications page.

---

## Step 2: Login page (0.5 day)

```
src/app/features/login/
└── login.component.ts     # standalone, reactive form
```

- Email + password fields (reactive form, validation)
- Submit → `authService.login()` → redirect to `/applications`
- Error message on 401

Minimal styling — centered card, nothing fancy.

**Deliverable:** user can log in.

---

## Step 3: Applications table (3-4 days)

This is the main page — **replaces Google Sheets**.

```
src/app/features/applications/
├── applications.component.ts       # page: toolbar + table
├── applications.component.html
├── application-edit-dialog/        # or inline edit
│   └── application-edit.component.ts
└── status-badge/
    └── status-badge.component.ts   # colored pill: Applied/Sent/Failed/etc.
```

### 3.1 Data table

Columns (matching tracker.db schema):

| # | Column | Type | Editable | Notes |
|---|--------|------|----------|-------|
| 1 | Date | date | no | Application date |
| 2 | Company | text | no | |
| 3 | Job Title | text | no | |
| 4 | Stack | text | no | |
| 5 | ATS % | badge | no | Status badge or percentage |
| 6 | URL | link | no | Opens in new tab |
| 7 | Folder | link | no | Navigates to `/files/{date}/{company}` |
| 8 | Sent | date | **yes** | Inline edit, saves via PATCH |
| 9 | Re-application | text | **yes** | "+" flag |
| 10 | To Learn | text | **yes** | Skills gap |
| 11 | ATS Verdict | number | no | 0-100 score |
| 12 | Cost $ | number | no | LLM spend |

### 3.2 Features
- **Pagination** — server-side, 50 rows per page
- **Sorting** — click column header → sort param to API
- **Filter by status** — dropdown: All / Applied / Sent / Failed / Expired
- **Search** — text input, searches company + title (server-side)
- **Inline edit** — click Sent/To Learn/Re-application cell → input appears →
  Enter saves (PATCH), Esc cancels. Optimistic UI update.
- **Status badges** — colored pills:
  - Green: Sent (has a date)
  - Blue: Applied (no sent date yet)
  - Red: Failed
  - Grey: Expired
  - Orange: Pending (queue)
- **Stats bar** at the top — total, applied, sent, failed, unsent count
  (from `GET /api/applications/stats`)
- **Auto-refresh** — poll every 30s for new rows (bot applies → row appears)

### 3.3 Responsive
- Desktop: full table with all columns
- Tablet: hide Cost, Stack columns
- Mobile: card layout instead of table (company + title + status + sent)

**Deliverable:** user sees all applications, sorts/filters, edits Sent dates
inline. Functionally replaces Google Sheets.

---

## Step 4: Files browser (2-3 days)

**Replaces Google Drive.**

```
src/app/features/files/
├── files.component.ts              # page: breadcrumbs + file list
├── folder-list/
│   └── folder-list.component.ts    # grid of date/company folders
├── file-list/
│   └── file-list.component.ts      # list of files in a folder
└── pdf-preview/
    └── pdf-preview.component.ts    # inline PDF viewer
```

### 4.1 Navigation

Three levels, driven by route params:
```
/files                    → list of date folders (2026-08-04, 2026-08-03, ...)
/files/2026-08-04         → list of company folders (Billennium, Atruvia, ...)
/files/2026-08-04/Atruvia → list of files (CV.pdf, CL.pdf, content.json, ...)
```

**Breadcrumbs:** `Files > 2026-08-04 > Atruvia` — clickable navigation back up.

### 4.2 File list

Each file shows: name, size (human-readable), type icon.

| Extension | Icon | Action on click |
|-----------|------|-----------------|
| .pdf | 📄 | Inline preview (iframe or pdf.js) |
| .docx | 📝 | Download |
| .txt | 📋 | Show in a modal (plain text) |
| .json | 🔧 | Show in a modal (formatted JSON) |

### 4.3 Entry from Applications table

The "Folder" column in the applications table links to
`/files/{date}/{company}` — clicking it jumps straight to that company's files.

### 4.4 PDF preview

- Embedded `<iframe>` with `src="/api/files/{date}/{company}/{file}"` —
  browsers natively render PDFs in iframes
- Fallback: download link if iframe doesn't work

**Deliverable:** user browses all generated documents, previews PDFs inline,
downloads DOCXs.

---

## Step 5: Statistics page (1-2 days)

**Replaces Telegram `/funnel` command.**

```
src/app/features/stats/
├── stats.component.ts              # page layout
├── funnel-chart/
│   └── funnel-chart.component.ts   # horizontal bar chart
├── source-table/
│   └── source-table.component.ts   # per-source breakdown
└── cost-summary/
    └── cost-summary.component.ts   # cost cards
```

### 5.1 Funnel chart

Horizontal bars or a proper funnel shape:
```
Tracked:    ████████████████████████████ 450
Generated:  █████████████████████       340
Sent:       ██████████████              220
Confirmed:  ████████                    130
Answered:   ████                         65
```

Period selector: 7d / 30d / 90d / all time.

### 5.2 Per-source table

| Source | Tracked | Applied | Sent | Conversion |
|--------|---------|---------|------|------------|
| JustJoin.it | 120 | 45 | 20 | 16.7% |
| NoFluffJobs | 85 | 30 | 15 | 17.6% |
| LinkedIn | 60 | 12 | 5 | 8.3% |

### 5.3 Cost summary

Cards: Total spend, Median per apply, Last 7 days, Last 30 days.

### 5.4 Charts library

Options (decide at implementation time):
- **Chart.js** via `ng2-charts` — simple, lightweight
- **ngx-charts** — Angular-native, SVG-based
- **Recharts-style DIY** — just SVG + Angular signals, no lib

**Deliverable:** user sees application funnel, per-source stats, cost data.

---

## Step 6: Polish + deploy integration (1 day)

1. **Loading states** — skeleton screens while data loads
2. **Error handling** — toast notifications on failed saves
3. **Empty states** — "No applications yet" / "No files" messages
4. **Favicon + title** — "Job Hunter" branding
5. **Remove SSR** — not needed, NestJS serves the static build
   - Remove `@angular/ssr`, `@angular/platform-server`, `express` from deps
   - Remove `app.config.server.ts`, `main.server.ts`, `server.ts`,
     `app.routes.server.ts`
   - Update `angular.json` to only produce `browser/` output
6. **Remove Cloudflare Pages deploy** — delete `.github/workflows/deploy.yml`
   (NestJS Dockerfile handles the build now)
7. **Dev proxy** — `proxy.conf.json` so `ng serve` proxies `/api/*` to
   `localhost:3000` (local NestJS dev server):
   ```json
   {
     "/api": { "target": "http://localhost:3000", "secure": false },
     "/auth": { "target": "http://localhost:3000", "secure": false }
   }
   ```

**Deliverable:** production-ready frontend, clean dev workflow.

---

## Summary

| Step | Days | What |
|------|------|------|
| 1. Core infrastructure | 1 | Auth, interceptor, routing, API service |
| 2. Login page | 0.5 | Email + password form |
| 3. Applications table | 3-4 | Tracker table with inline edit (= Sheets) |
| 4. Files browser | 2-3 | Folder tree + PDF preview (= Drive) |
| 5. Statistics | 1-2 | Funnel, per-source, cost charts |
| 6. Polish + deploy | 1 | Loading states, SSR cleanup, dev proxy |
| **Total** | **8-11** | **Full frontend** |

### Dev workflow

```bash
# Terminal 1: NestJS backend (needs to exist first)
cd ../job-hunter-api && npm run start:dev

# Terminal 2: Angular frontend
cd ../job-hunter-site && ng serve --proxy-config proxy.conf.json
# → http://localhost:4200 (API proxied to :3000)
```

### What to decide at implementation time

1. **UI framework:** Angular Material vs PrimeNG
   - Material: familiar, Google-designed, good table component
   - PrimeNG: richer data table (built-in pagination/sort/filter/inline-edit),
     but larger bundle
2. **Charts library:** Chart.js vs ngx-charts vs DIY SVG
3. **State management:** plain services + signals (enough for Phase A) vs
   NgRx (overkill for 4 pages)
