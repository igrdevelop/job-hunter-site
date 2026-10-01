import path from 'node:path';

/**
 * The two test accounts of the local e2e suite. These exist ONLY in the
 * per-run scratch app.sqlite (see e2e/scratch.ts) — never against prod.
 *
 * - OWNER is seeded by the API itself on first boot (SEED_USER_EMAIL /
 *   SEED_USER_PASSWORD → role='admin', email_verified=1, isOwner=true).
 * - REGULAR is created through the real POST /auth/register flow in
 *   e2e/setup/users.setup.ts and verified through the real POST /auth/verify.
 */
export interface TestUser {
  readonly email: string;
  readonly password: string;
  /** Storage state saved by the setup project, reused by every spec. */
  readonly storageState: string;
}

const AUTH_DIR = path.join(__dirname, '..', '.auth');

export const OWNER: TestUser = {
  email: 'owner@e2e.test',
  password: 'owner-e2e-password-1',
  storageState: path.join(AUTH_DIR, 'owner.json'),
};

export const REGULAR: TestUser = {
  email: 'user@e2e.test',
  password: 'user-e2e-password-1',
  storageState: path.join(AUTH_DIR, 'user.json'),
};
