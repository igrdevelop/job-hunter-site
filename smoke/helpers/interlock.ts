import { APIRequestContext, Page } from '@playwright/test';
import { requireEnv } from './env';
import { assertApprovedOrigin } from '../config/allowlist';
import { getStoredAuthToken } from './token';
import type { User } from '../../src/app/core/auth/user.model';

/**
 * Only the fields the safety interlock actually reads from GET /auth/me
 * (the full shape is src/app/core/auth/user.model.ts::User) — narrowed on
 * purpose so an unused field can't silently drift out of sync with the API.
 */
export type AuthMePayload = Pick<User, 'email' | 'isOwner'>;

/**
 * The safety interlock (docs/LIVE_SMOKE_E2E.md, hard requirement): before
 * ANY side-effecting step, confirm the logged-in identity really is the
 * dedicated smoke test account and NOT the owner. Reads the bearer token
 * straight out of localStorage and calls /auth/me directly — deliberately
 * its OWN request rather than reusing whatever the app's bootstrap already
 * fetched, since an independent verification is the whole point of a
 * safety interlock: it must never trust something the page merely rendered
 * (which could be stale, cached, or simply wrong).
 *
 * `baseURL` is taken as an explicit parameter (Playwright's built-in
 * `baseURL` fixture — the same, already-allowlisted origin every test
 * navigates against) rather than derived from `page.url()`: the bearer
 * token is a live session credential and deserves the same "never send it
 * to an unapproved origin" protection the password gets in
 * smoke/helpers/auth.ts, so this asserts the origin itself before sending
 * anything. This call goes through Playwright's standalone `request`
 * fixture (APIRequestContext), which — unlike `page` — is NOT covered by
 * the `context.route` structural guard in guarded-fixtures.ts, so this
 * check is the only thing protecting this specific request.
 *
 * E1 calls this once as a read-only check (it performs no mutations
 * itself). Future mutating phases (E2-E4) MUST call it again immediately
 * before every side-effecting phase, not just once at the start of the
 * run — a mismatch must abort before a single write, every time.
 */
export async function assertSmokeIdentity(
  page: Page,
  request: APIRequestContext,
  baseURL: string,
): Promise<AuthMePayload> {
  const expectedEmail = requireEnv('SMOKE_USER_EMAIL');

  const origin = new URL(baseURL).origin;
  assertApprovedOrigin(origin);

  let token: string;
  try {
    token = await getStoredAuthToken(page);
  } catch (err) {
    throw new Error(
      `Safety interlock: ${err instanceof Error ? err.message : String(err)} — cannot verify identity.`,
    );
  }

  const res = await request.get(`${origin}/auth/me`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok()) {
    throw new Error(`Safety interlock: /auth/me returned HTTP ${res.status()} — cannot verify identity.`);
  }
  const me = (await res.json()) as AuthMePayload;

  // Strict `!== false` on purpose (not a falsy check, not an `isOwner ===
  // true` check inverted): `undefined` must abort exactly like `true`
  // does. Fail-safe by design — an api regression that stops sending the
  // field must never be silently reinterpreted as "not the owner". The two
  // branches below only split the error MESSAGE so a real misconfiguration
  // is easy to tell apart from an api contract change.
  if (me.isOwner === undefined) {
    throw new Error(
      'SAFETY INTERLOCK FAILED: /auth/me did not return an isOwner field at all — refusing to proceed. ' +
        "A missing field must never be treated as \"not the owner\" by assumption; check the api's " +
        '/auth/me response shape (see src/app/core/auth/user.model.ts::User).',
    );
  }
  if (me.isOwner !== false || me.email !== expectedEmail) {
    throw new Error(
      `SAFETY INTERLOCK FAILED: logged in as the wrong user — email=${me.email ?? '?'} ` +
        `isOwner=${String(me.isOwner)}; expected email=${expectedEmail} isOwner=false. ` +
        "Refusing to proceed — this run must never touch the owner's real profile.",
    );
  }

  return me;
}
