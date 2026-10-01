import { Injectable, computed, inject, signal } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Router } from '@angular/router';
import { firstValueFrom } from 'rxjs';
import { environment } from '../../../environments/environment';
import { DownloadTokenResponse, LoginResponse, User } from './user.model';
import { TOKEN_STORAGE_KEY } from './token-storage-key';

// The S1-era `OWNER_FLAG_FALLBACK_ENABLED = true` bridge (owner UI shown
// while the api didn't send `isOwner` yet) is GONE: api T3 is deployed, the
// field is always present, and after the 2026-09-01 gating swap the
// owner-only tab exposes internal files — an absent field must fail CLOSED
// (CodeRabbit finding on PR #38, CWE-862: the old fallback made a missing
// field grant owner UI to everyone).

@Injectable({ providedIn: 'root' })
export class AuthService {
  private readonly http = inject(HttpClient);
  private readonly router = inject(Router);

  private readonly token = signal<string | null>(this.readStoredToken());
  private readonly user = signal<User | null>(null);
  readonly needsEmailVerification = signal(false);
  private pendingMe: Promise<User | null> | null = null;

  readonly isLoggedIn = computed(() => this.token() !== null);
  readonly currentUser = this.user.asReadonly();

  /**
   * Fail-closed: an absent/undefined `isOwner` field means NOT the owner
   * (see the note above). Reads through `currentUser` (not the private
   * `user` signal directly) so specs can drive it the same way every other
   * consumer of `currentUser` already does
   * (`vi.spyOn(authService, 'currentUser').mockReturnValue(...)`,
   * see settings.component.spec.ts's `isAdmin` coverage).
   */
  readonly isOwner = computed(() => this.currentUser()?.isOwner === true);

  private readStoredToken(): string | null {
    if (typeof localStorage === 'undefined') {
      return null;
    }
    return localStorage.getItem(TOKEN_STORAGE_KEY);
  }

  getToken(): string | null {
    return this.token();
  }

  async login(email: string, password: string): Promise<void> {
    const response = await firstValueFrom(
      this.http.post<LoginResponse>(`${environment.authBaseUrl}/login`, { email, password }),
    );
    localStorage.setItem(TOKEN_STORAGE_KEY, response.accessToken);
    this.token.set(response.accessToken);
    // A new session: drop a user or an in-flight /auth/me that belongs to the
    // previous token (e.g. the startup load still running when /login is
    // submitted), or fetchCurrentUser() would hand back the old account.
    this.pendingMe = null;
    this.user.set(null);
    await this.fetchCurrentUser();
  }

  /**
   * GET /auth/me and store the result. Concurrent callers share ONE in-flight
   * request (`pendingMe`): App's constructor starts the load on a fresh page
   * and route guards (`adminGuard`) await the same promise instead of issuing
   * a second request — /auth/* is rate-limited per IP.
   */
  fetchCurrentUser(): Promise<User | null> {
    if (!this.token()) {
      return Promise.resolve(null);
    }
    if (this.pendingMe) {
      return this.pendingMe;
    }
    const request = firstValueFrom(this.http.get<User>(`${environment.authBaseUrl}/me`))
      .then((user) => {
        // A logout while the request was in flight dropped `pendingMe`;
        // don't resurrect the user it cleared.
        if (this.pendingMe === request) {
          this.user.set(user);
        }
        return user;
      })
      .finally(() => {
        if (this.pendingMe === request) {
          this.pendingMe = null;
        }
      });
    this.pendingMe = request;
    return request;
  }

  /**
   * The current user once it is known, for code that must not act on the
   * transient `null` of a fresh page load (route guards). Resolves at once
   * when the user is already loaded, otherwise waits for — or starts — the
   * shared /auth/me load. Never rejects: no token or a failed load (401 is
   * logged out by the interceptor) resolves `null`.
   */
  async resolveCurrentUser(): Promise<User | null> {
    const loaded = this.currentUser();
    if (loaded) {
      return loaded;
    }
    try {
      await this.fetchCurrentUser();
    } catch {
      return null;
    }
    return this.currentUser();
  }

  async register(email: string, password: string): Promise<void> {
    await firstValueFrom(
      this.http.post(`${environment.authBaseUrl}/register`, { email, password }),
    );
  }

  async verifyEmail(token: string): Promise<void> {
    await firstValueFrom(this.http.post(`${environment.authBaseUrl}/verify`, { token }));
  }

  async resendVerification(email: string): Promise<void> {
    await firstValueFrom(this.http.post(`${environment.authBaseUrl}/resend`, { email }));
  }

  async getDownloadToken(): Promise<string> {
    const res = await firstValueFrom(
      this.http.get<DownloadTokenResponse>(`${environment.authBaseUrl}/download-token`),
    );
    return res.token;
  }

  logout(): void {
    this.token.set(null);
    this.user.set(null);
    this.pendingMe = null;
    this.needsEmailVerification.set(false);
    localStorage.removeItem(TOKEN_STORAGE_KEY);
    this.router.navigate(['/login']);
  }
}
