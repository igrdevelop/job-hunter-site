# Multi-User Update — site repo work order

Self-contained work order for the multi-tenant conversion of `job-hunter-site`.
Companion files exist in the sibling repos (`../api/docs/MULTI_USER_UPDATE.md`,
`../bot/docs/MULTI_USER_UPDATE.md`) — each repo is worked on by its own agent.
**The "Shared contract" section below is duplicated in all three files and must stay
in sync. Do not change contract details unilaterally — flag mismatches to the user.**

⚠️ The real Angular source root is `job-hunter-site/src/app` inside this repo
(`src/` at repo root is empty) — verify against `angular.json` before editing.

## Goal

Full multi-tenant: open self-registration with email verification; every user has
their own candidate files, templates, generated documents, tracker rows, and
settings; Telegram binding via a link code. This repo owns the UI: signup/verify
pages, admin page, editable settings, Telegram-connect card, and the download-token
fix.

## Shared contract (identical in all three repos)

### API surface (server side implemented in the api repo)

```
POST /auth/register {email,password}     # gated by REGISTRATION_ENABLED, sends verify mail
POST /auth/verify {token}                # public
POST /auth/resend {email}                # public
GET  /auth/me                            # → { id, email, role, emailVerified }
GET  /auth/download-token                # → { token } (5-min JWT, aud 'download')
GET/PUT /api/settings                    # per-user editable settings (whitelist schema)
GET  /api/settings/global                # admin-only, masked .env view (old behavior)
POST /api/telegram/link-code             # → { code, expiresAt }
GET  /api/telegram/status                # → { linked: boolean, chatId? }
GET/PATCH/DELETE /api/admin/users[...]   # admin role only
```

All file/generated/template stream endpoints additionally accept
`?dt=<download-token>`. JWT payload becomes `{ sub, email, role }`. Unverified
users get 403 on `/api/*` (show a "verify your email" state, don't logout-loop).

### Per-user vs global settings (whitelist)

Per-user editable on /settings: `AUTO_APPLY`, `MAX_JOBS_PER_RUN`,
`APPLY_DELAY_SEC`, `CANDIDATE_TRACKS`, `CV_GDPR_CLAUSE`, `TELEGRAM_SEND_DOCS`,
source enable toggles, `hunting_enabled`. Global (admin-only read-only section):
bot token, LLM keys, schedule, scraper infrastructure. Sheets/Drive: owner-only.

### Telegram binding UX

User clicks "Connect Telegram" (Settings) → site calls
`POST /api/telegram/link-code` → shows code + bot handle + instruction
"send `/link CODE` to the bot" → poll or refresh `GET /api/telegram/status`.

## Current state in THIS repo (verified 2026-08-06)

- Auth: `core/auth/{auth.service.ts, auth.guard.ts, auth.interceptor.ts,
  user.model.ts}` — signal-based, token in localStorage `'job-hunter-token'`,
  guard on the parent `''` route, interceptor adds Bearer for `/api`/`/auth/me`
  and logs out on 401. `User = { id, email }` — no role.
  `auth.service.ts` expects `{ accessToken }` from login — confirmed correct;
  backend returns camelCase `accessToken`. No mismatch.
- No signup/admin UI at all. Header nav: Applications / Files / Templates / Stats /
  Profile / Settings + avatar menu with logout.
- Domain APIs in `core/api/`: `applications.api.ts`, `files.api.ts` (generated +
  profile trees), `analytics.api.ts`, `templates.api.ts`, `settings.api.ts`;
  `models.ts` synced manually with api DTOs.
- **BUG (fix in Phase S1):** `downloadFile`/`getProfileFileUrl` use `window.open`
  on API URLs — no Authorization header → 401 on real backend.
- `/settings` page is a read-only tabbed view of masked bot .env.
- `/profile` page is a candidate-files browser over `GET /api/files` — this becomes
  the place where a user manages THEIR candidate sources (candidate.yaml,
  candidate_profile.md, base_cv_*.md). Note: `files.service` on the API side
  already supports upload; check what upload UI exists and extend.

## Work phases for this repo

### Phase S1 — models + download fix (small; after api Phase A1 deploys)

1. `models.ts` / `user.model.ts`: `User` gains `role: 'admin' | 'user'` and
   `emailVerified: boolean`.
2. Download-token flow: add `getDownloadToken()` to a core auth/api service;
   replace every `window.open(apiUrl)` (files, generated, templates) with
   fetch-token-then-open (`url + '?dt=' + token`). Applies in `files.api.ts`,
   `templates.api.ts` and their consumers (profile, files, templates pages).
3. Verify a real download of a generated .docx and a template from the deployed
   backend.

### Phase S2 — signup + verification (medium; after api Phase A3)

1. `features/auth/signup` page: email + password (+confirm), posts
   `/auth/register`; success state "check your email". Handle 403 (registration
   disabled) with a friendly message.
2. `features/auth/verify` page at route `/verify`: reads `?token=`, posts
   `/auth/verify`, then redirects to login. "Resend" action.
3. Login page gets a "Create account" link.
4. Unverified-user state: on 403-with-unverified from `/api/*`, show a banner/page
   with "resend verification" instead of the current logout-on-401 behavior.
   Interceptor must distinguish 401 (logout) from 403 (show state).

### Phase S3 — admin page (small-medium)

`/admin` route guarded by `role === 'admin'` (extend authGuard or add roleGuard):
users table (email, created, verified, disabled, per-user cost when the api exposes
it), actions disable/enable/delete with confirm dialog. Hide the nav link for
non-admins.

### Phase S4 — editable settings + Telegram connect (medium; after api Phase A4)

1. `/settings` becomes an editable form driven by the whitelist schema returned by
   `GET /api/settings` (toggle for booleans, number inputs, select for enums like
   `CANDIDATE_TRACKS`), with save via `PUT /api/settings` and dirty-state handling.
   Admin additionally sees the old read-only global section
   (`GET /api/settings/global`).
2. "Connect Telegram" card on /settings: shows link status
   (`GET /api/telegram/status`); button generates a code
   (`POST /api/telegram/link-code`), displays code + bot handle + countdown to
   expiry; refresh/poll status until linked.
3. Optional polish: onboarding checklist (candidate.yaml uploaded → profile.md →
   base CVs → Telegram linked → hunting enabled) on the Applications empty state
   or Profile page.

## Verification

- `npm run build` and `npm test` green after every phase.
- S1: real file downloads work against the deployed api.
- S2: full register → email → verify → login → empty workspace flow with a fresh
  account; the new account must NOT see the owner's data.
- S4: settings round-trip persists; Telegram card reaches "linked" after sending
  /link to the bot.

## Coordination notes

- Each phase depends on the matching api phase being deployed (S1←A1, S2←A3,
  S4←A4). Check with the user before starting a phase whose backend isn't live.
- `models.ts` stays in manual sync with `../api/src/tracker/dto/` and the new auth
  DTOs — mirror exact field names from the api implementation, don't guess.
- Update `CLAUDE.md` (routes table + work log) when phases land.
