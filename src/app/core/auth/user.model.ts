export interface User {
  id: string;
  email: string;
  role: 'admin' | 'user';
  emailVerified: boolean;
  /**
   * Whether this account is the product owner (job-hunter-api work order
   * T3 — not deployed yet, so `/auth/me` doesn't send this field today).
   * Optional on purpose: `AuthService.isOwner` falls back to a site-side
   * flag while it's absent. See that flag's own doc comment.
   */
  isOwner?: boolean;
}

export interface LoginResponse {
  accessToken: string;
}

export interface DownloadTokenResponse {
  token: string;
}
