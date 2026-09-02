export interface User {
  id: string;
  email: string;
  role: 'admin' | 'user';
  emailVerified: boolean;
  /**
   * Whether this account is the product owner (job-hunter-api work order
   * T3 — deployed; `/auth/me` always sends this field now). Still optional
   * in the type because `AuthService.isOwner` treats an absent/undefined
   * value as fail-closed (NOT the owner) — see that computed signal's own
   * doc comment. There is no site-side fallback anymore: an old bridge
   * that granted owner UI when this field was missing was removed as a
   * CWE-862 fix (CodeRabbit finding on PR #38).
   */
  isOwner?: boolean;
}

export interface LoginResponse {
  accessToken: string;
}

export interface DownloadTokenResponse {
  token: string;
}
