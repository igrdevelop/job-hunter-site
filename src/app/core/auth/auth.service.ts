import { Injectable, computed, inject, signal } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Router } from '@angular/router';
import { firstValueFrom } from 'rxjs';
import { environment } from '../../../environments/environment';
import { DownloadTokenResponse, LoginResponse, User } from './user.model';

const TOKEN_KEY = 'job-hunter-token';

/**
 * Temporary bridge until job-hunter-api ships `isOwner` on the auth payload
 * (api work order T3). Same fallback shape as `PROFILE_MOCK_FALLBACK_ENABLED`
 * / `FILTERS_MOCK_FALLBACK_ENABLED`: used only when the server hasn't sent
 * the real field. Defaults `true` so today's single-real-user deployment
 * keeps showing owner-only profile UI (the Test Resume tab, the variant
 * chip row) — a real `isOwner: false` on a future account, once T3 ships,
 * always wins over this fallback.
 * TODO(profile-tabs): delete this fallback once /auth/me returns isOwner.
 */
export const OWNER_FLAG_FALLBACK_ENABLED = true;

@Injectable({ providedIn: 'root' })
export class AuthService {
  private readonly http = inject(HttpClient);
  private readonly router = inject(Router);

  private readonly token = signal<string | null>(this.readStoredToken());
  private readonly user = signal<User | null>(null);
  readonly needsEmailVerification = signal(false);

  readonly isLoggedIn = computed(() => this.token() !== null);
  readonly currentUser = this.user.asReadonly();

  /**
   * See `OWNER_FLAG_FALLBACK_ENABLED` above for the fallback semantics.
   * Reads through `currentUser` (not the private `user` signal directly) so
   * specs can drive it the same way every other consumer of `currentUser`
   * already does (`vi.spyOn(authService, 'currentUser').mockReturnValue(...)`,
   * see settings.component.spec.ts's `isAdmin` coverage).
   */
  readonly isOwner = computed(() => this.currentUser()?.isOwner ?? OWNER_FLAG_FALLBACK_ENABLED);

  private readStoredToken(): string | null {
    if (typeof localStorage === 'undefined') {
      return null;
    }
    return localStorage.getItem(TOKEN_KEY);
  }

  getToken(): string | null {
    return this.token();
  }

  async login(email: string, password: string): Promise<void> {
    const response = await firstValueFrom(
      this.http.post<LoginResponse>(`${environment.authBaseUrl}/login`, { email, password }),
    );
    localStorage.setItem(TOKEN_KEY, response.accessToken);
    this.token.set(response.accessToken);
    await this.fetchCurrentUser();
  }

  async fetchCurrentUser(): Promise<User | null> {
    if (!this.token()) {
      return null;
    }
    const user = await firstValueFrom(this.http.get<User>(`${environment.authBaseUrl}/me`));
    this.user.set(user);
    return user;
  }

  async register(email: string, password: string): Promise<void> {
    await firstValueFrom(
      this.http.post(`${environment.authBaseUrl}/register`, { email, password }),
    );
  }

  async verifyEmail(token: string): Promise<void> {
    await firstValueFrom(
      this.http.post(`${environment.authBaseUrl}/verify`, { token }),
    );
  }

  async resendVerification(email: string): Promise<void> {
    await firstValueFrom(
      this.http.post(`${environment.authBaseUrl}/resend`, { email }),
    );
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
    this.needsEmailVerification.set(false);
    localStorage.removeItem(TOKEN_KEY);
    this.router.navigate(['/login']);
  }

}
