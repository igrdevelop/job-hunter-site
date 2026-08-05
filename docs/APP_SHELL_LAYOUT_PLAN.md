# App Shell Layout Plan — Header / Footer / Viewport Fix

> **Status:** planning only (no implementation yet)  
> **Branch / worktree:** `docs/app-shell-layout` @ `D:/LearningProject/job-hunter-site-layout`  
> **Base:** `fix/files-profile-routing` (`c3ad602`) — includes `/profile` + generated files routing  
> **Goal:** fix broken app chrome width/height, extract header & footer into shared components, verify Angular MCP before coding  
> **Do not implement from the main checkout** while another agent works there — use this worktree only

---

## 1. Problem statement

Observed UI issues on the logged-in app:

| Symptom | Likely cause (current code) |
|---------|-----------------------------|
| Header not full width / table wider than header | No app shell constraints; page content (AG Grid columns) expands document width; header is a normal block that follows a narrower flow or looks clipped vs overflowing content |
| Table “runs away” horizontally past the header | `.applications-grid { width: 100% }` but columns have large minWidths; no `min-width: 0` / overflow containment on `main` |
| Footer below the bottom edge of the browser | **No footer component exists today.** Content height (`stats-bar` + page toolbar + `calc(100vh - 240px)` grid + `.app-content` padding) exceeds the viewport, so the bottom of the page sits under the fold. After we add a real footer, without a sticky shell it will also sit below the fold |

### Current structure (relevant files)

```
src/app/app.html          ← mat-toolbar header inline + <main class="app-content">
src/app/app.ts            ← Material imports for toolbar/menu
src/app/app.scss          ← :host min-height 100dvh; .app-content { padding: 16px }
src/styles.scss           ← html, body { height: 100% }
src/app/features/applications/applications.component.scss
                          ← .applications-grid { height: calc(100vh - 240px) }
```

There is **no** `src/app/shared/` folder yet.  
Header visibility: `@if (authService.isLoggedIn())` around the toolbar. Login page is full-viewport centered and should stay chrome-free.

---

## 2. Isolation: worktrees (how we avoid colliding with the other agent)

### Already present

| Path | Branch | Purpose |
|------|--------|---------|
| `D:/LearningProject/job-hunter-site` | `fix/files-profile-routing` | Other agent / main Cursor window — **do not edit** |
| `.../.claude/worktrees/plan-and-progress-61053c` | `feature/frontend-mvp` | Older MVP worktree |
| `.../.claude/worktrees/job-hunter-microservices-6fb06c` | `feature/candidate-files-and-generated` | Other feature worktree |
| `D:/LearningProject/job-hunter-site-layout` | `docs/app-shell-layout` | **This plan + future layout implementation** |

### Rules for this work

1. Open Cursor on `D:/LearningProject/job-hunter-site-layout` only.
2. All file edits, `npm install`, `ng serve`, commits happen in this worktree.
3. Do not checkout / reset / commit on the other worktrees’ branches from here.
4. Use a **different** `ng serve` port if the other agent already holds `4200` (`ng serve --port 4201`).
5. Shared risks only: pushing the same remote branch name, or editing user-global Cursor settings.

### After plan approval — implementation branch strategy

Option A (preferred): rename/reuse this branch for implementation  
`docs/app-shell-layout` → keep name or rename to `fix/app-shell-layout` and implement here.

Option B: create `fix/app-shell-layout` from an updated base after the other agent merges `fix/files-profile-routing`.

Rebase/merge decision: wait until the parallel agent’s PR is merged or stable so we don’t fight over `app.html` / routes / Profile nav.

---

## 3. Prerequisite: Angular MCP (before writing layout code)

### Current state

Project already has Cursor MCP config:

```jsonc
// .vscode/mcp.json
{
  "servers": {
    "angular-cli": {
      "command": "npx",
      "args": ["-y", "@angular/cli", "mcp"]
    }
  }
}
```

Docs: https://angular.dev/ai/mcp  
CLI in this repo: `@angular/cli` ^22 — MCP is supported.

### Checklist (do this first on implementation day)

- [ ] Confirm Angular MCP server appears **enabled** in Cursor Settings → MCP (not just the file on disk).
- [ ] If missing in user MCP catalog, add the same `npx -y @angular/cli mcp` entry (project `.vscode/mcp.json` should be enough for Cursor).
- [ ] Smoke-test tools from the agent:
  - [ ] `list_projects` — sees `job-hunter-site`
  - [ ] `get_best_practices` — returns modern standalone/signals guidance
  - [ ] `search_documentation` (optional, needs network) — e.g. “application shell layout”
- [ ] Prefer generating Header/Footer as **standalone** components with `inject()`, signals, `@if` control flow — match Angular 22 + project conventions.
- [ ] Do **not** enable experimental `-E modernize` unless we explicitly want migration tools that write to disk.

### Out of scope for MCP step

- No need to reinstall `@angular/cli` if `npx` resolves.
- No Claude-only `.mcp.json` unless we also use Claude Code in this folder.

---

## 4. Target architecture

### Layout model

Sticky app shell (logged-in only):

```
┌─────────────────────────────────────────────┐  ← 100dvh flex column
│ Header (full viewport width, flex-shrink:0) │
├─────────────────────────────────────────────┤
│ Main (flex:1; min-width:0; min-height:0;    │
│       overflow:auto)                        │
│   router-outlet → page                      │
├─────────────────────────────────────────────┤
│ Footer (full width, flex-shrink:0)          │  ← pinned to bottom when
└─────────────────────────────────────────────┘     content is short
```

When content is tall, **main** scrolls; header/footer stay at the edges of the viewport (classic sticky shell). Alternative acceptable approach: header sticky + footer at end of document with `margin-top: auto` inside a `min-height: 100dvh` column — prefer viewport-pinned footer for the reported bug.

### Component split

```
src/app/shared/
  header/
    header.component.ts
    header.component.html
    header.component.scss
  footer/
    footer.component.ts
    footer.component.html
    footer.component.scss
```

Optional (only if it clarifies things):

```
src/app/shared/app-shell/
  app-shell.component.*   ← wraps header + ng-content/main + footer
```

**Recommendation:** keep shell composition in `App` (`app.html`) first — fewer abstractions. Extract `AppShellComponent` only if route-level layouts become necessary later.

### `app.html` (target sketch)

```html
@if (authService.isLoggedIn()) {
  <div class="app-shell">
    <app-header />
    <main class="app-content">
      <router-outlet />
    </main>
    <app-footer />
  </div>
} @else {
  <router-outlet />
}
```

Notes:

- Login must **not** render header/footer (current behavior preserved).
- Moving `router-outlet` into two places is fine (only one active). Alternatively keep a single outlet always and hide chrome with CSS/`@if` around header/footer only — **prefer single outlet**:

```html
@if (authService.isLoggedIn()) {
  <app-header />
}
<main class="app-content" [class.app-content--chrome]="authService.isLoggedIn()">
  <router-outlet />
</main>
@if (authService.isLoggedIn()) {
  <app-footer />
}
```

With `:host` as the flex shell when logged in. Pick one approach and stick to it; single-outlet is simpler for Angular router.

### Header responsibilities (move from `app.*`)

- Brand “Job Hunter”
- Nav links: Applications, Files, Templates, Stats, Profile (`routerLink` + `routerLinkActive`)
- User menu: email + logout (`AuthService`)
- Styles currently in `app.scss`: `.toolbar`, `.brand`, `.nav-links`, `.spacer`, `.user-email`

### Footer responsibilities (new)

Minimal first version (confirm with owner before polish):

- Text: `Job Hunter` + short line (e.g. year or “igrflex.work”)
- Full width bar, modest height (~40–48px), Material-compatible colors (primary contrast or subtle surface)
- No cards, no link farms unless requested

**Open decision:** exact copy and whether footer links to anything.

---

## 5. CSS / layout fix (detailed)

### Global / shell (`app.scss` + maybe `styles.scss`)

```scss
:host {
  display: flex;
  flex-direction: column;
  min-height: 100dvh;
  width: 100%;
  max-width: 100%;
  overflow-x: hidden; // last-resort guard; prefer overflow on main
}

.app-content {
  flex: 1 1 auto;
  min-width: 0;      // critical: allow flex child to shrink below content width
  min-height: 0;      // critical: allow flex child to scroll instead of growing page
  overflow: auto;
  padding: 16px;
  box-sizing: border-box;
  width: 100%;
}

// Login: full bleed, no chrome padding constraints
.app-content--bare {
  padding: 0;
  overflow: auto;
}
```

Header / footer components:

```scss
:host {
  display: block;
  width: 100%;
  flex-shrink: 0;
}

// mat-toolbar should stretch; avoid max-width wrappers
.toolbar {
  width: 100%;
  box-sizing: border-box;
}
```

### Applications page (main overflow culprit)

Replace fragile height:

```scss
// BEFORE
.applications-grid {
  width: 100%;
  height: calc(100vh - 240px);
  min-height: 400px;
}
```

With flex fill inside the page:

```scss
.page {
  display: flex;
  flex-direction: column;
  gap: 16px;
  height: 100%;
  min-height: 0;
}

.applications-grid {
  flex: 1 1 auto;
  width: 100%;
  min-width: 0;
  min-height: 280px; // or 400px
}
```

Ensure parent chain passes height: `main.app-content` already has `min-height: 0` + flex; page host needs `height: 100%` or the page root uses `display:flex; flex:1; min-height:0`.

AG Grid: keep infinite row model; horizontal scroll must stay **inside** the grid viewport, not expand `body`.

### Other pages

Quick pass so shell doesn’t break:

| Page | Check |
|------|--------|
| Files | Wide tables/lists don’t expand body; breadcrumbs OK |
| Templates | Card grid wraps; PDF preview dialog unchanged |
| Stats | Tables scroll inside page if needed |
| Profile | Simple list — should be fine |
| Login | Still `min-height: 100vh` centered; no header/footer |

### What not to do

- Don’t wrap the whole app in a centered `max-width` container (that recreates “header not full width”).
- Don’t put horizontal padding on `:host` / shell that shrinks the toolbar relative to the viewport.
- Don’t use `100vw` (scrollbar gutter issues); prefer `100%` / `100dvh`.

---

## 6. Implementation steps (ordered)

### Phase 0 — Prep

1. Open this worktree in Cursor.
2. Verify Angular MCP (Section 3).
3. Confirm base branch is still valid vs parallel agent (rebase if their PR landed).
4. `npm install` if `node_modules` missing in worktree; `npm run build` baseline.

### Phase 1 — Extract Header

1. Generate/create `shared/header` standalone component.
2. Move template + styles + Material imports from `App`.
3. Inject `AuthService` in header (or pass inputs — prefer inject for parity).
4. Update `app.html` / `app.ts` / `app.scss` to use `<app-header />`.
5. Update `app.spec.ts` (toolbar queries may move to header tests).
6. Build + test.

### Phase 2 — Add Footer

1. Create `shared/footer` standalone component with agreed copy.
2. Show only when logged in (same condition as header).
3. Wire into shell; add footer styles (full width, compact).
4. Build + visual check on Applications + Login.

### Phase 3 — Shell CSS + Applications height

1. Apply flex shell on `:host` / main as in Section 5.
2. Fix Applications page flex height; remove `calc(100vh - 240px)`.
3. Verify grid horizontal scroll containment.
4. Spot-check Files / Templates / Stats / Profile.
5. Responsive: narrow width — nav may wrap; header still full width; grid scrolls.

### Phase 4 — Verify & document

1. `npm run build`
2. `npm test`
3. Manual checklist (Section 7)
4. Append Agent Work Log line in `CLAUDE.md` (this worktree / when merging)
5. PR when ready (separate from plan commit if plan was committed alone)

---

## 7. Acceptance criteria

- [ ] Header spans the full browser content width (edge to edge of the app viewport).
- [ ] On `/applications`, AG Grid never makes the **page** wider than the header; horizontal overflow is inside the grid (or main), not a document-level sideways scroll that leaves the header short.
- [ ] Footer is visible at the bottom of the browser window when content is short.
- [ ] When content is tall, header stays at top, footer at bottom of viewport (or agreed sticky behavior), and middle scrolls.
- [ ] `/login` has no header/footer.
- [ ] Nav links still work (including Profile).
- [ ] Logout still works from header menu.
- [ ] `npm run build` and `npm test` pass.
- [ ] Header and footer live under `src/app/shared/`.

---

## 8. Test plan

### Automated

- Update / add unit tests:
  - `HeaderComponent`: renders brand + nav links when created with mocked `AuthService`
  - `FooterComponent`: renders expected text
  - `App`: when logged in, contains `app-header` + `app-footer`; when logged out, neither
- Keep existing `app.spec.ts` green (adjust selectors).

### Manual

1. Login → Applications: header full width; grid fits; footer at bottom.
2. Widen/narrow window: no header/table mismatch.
3. Many columns / zoom 125%: horizontal scroll only in grid/main.
4. Files deep route (`/files/:date/:company`): shell intact.
5. Templates upload dialog / PDF preview: still modal OK.
6. Stats + Profile: footer not covering content awkwardly.
7. Logout → login page clean.

---

## 9. Risks & conflicts

| Risk | Mitigation |
|------|------------|
| Parallel agent edits `app.html` / nav | Implement only in this worktree; rebase onto their branch before PR |
| AG Grid needs explicit `domLayout` | Prefer default normal layout + flex parent height; avoid `domLayout='autoHeight'` (breaks infinite scroll) |
| Sticky header + nested sticky toolbars | Page-level `.toolbar` is a filter bar, not Material toolbar — naming collision only; rename page class to `.filters` if confusing |
| MCP not loading in Cursor | Fall back to coding from this plan + Angular 22 docs; fix MCP config separately |

---

## 10. Out of scope

- Visual redesign / new brand identity (keep current Material indigo-pink).
- Backend or API changes.
- Replacing AG Grid.
- Route-level multi-layout refactor beyond header/footer extraction.
- Cloudflare / Docker / deploy pipeline.

---

## 11. Open questions (answer before Phase 2)

1. **Footer copy:** what text/links? (default proposal: `© 2026 Job Hunter` + optional `job-hunter.igrflex.work`)
2. **Footer sticky mode:** pinned to viewport bottom always vs only when content is short? (plan assumes viewport-pinned shell)
3. **Implementation base:** stay on `docs/app-shell-layout` from `fix/files-profile-routing`, or wait for that PR to merge into `master` first?
4. **Nav overflow on mobile:** keep horizontal wrap, or collapse into a menu later? (default: wrap for now)

---

## 12. Suggested commit sequence (when implementing)

1. `docs: add app shell layout plan` (this file — optional if already committed)
2. `refactor: extract app header into shared component`
3. `feat: add shared footer and app shell flex layout`
4. `fix: contain applications grid overflow within viewport shell`

Or squash to one PR with clear summary.

---

## 13. Quick command reference (this worktree)

```powershell
cd D:\LearningProject\job-hunter-site-layout

# MCP smoke (host-side): ensure Cursor MCP lists angular-cli

npm install
npm run build
npm test
npm run start:proxy -- --port 4201
```

Worktree management:

```powershell
git worktree list
# remove later, after branch is merged/deleted:
# git worktree remove D:\LearningProject\job-hunter-site-layout
```

---

## 14. Agent work log (append when done)

| Date | Agent | Work |
|------|-------|------|
| 2026-08-05 | grok | Created worktree `docs/app-shell-layout` at `D:/LearningProject/job-hunter-site-layout` and wrote this plan. No layout code yet. |
