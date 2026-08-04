import { Injectable, computed, inject, signal } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Router } from '@angular/router';
import { firstValueFrom } from 'rxjs';
import { environment } from '../../../environments/environment';
import { LoginResponse, User } from './user.model';

const TOKEN_KEY = 'job-hunter-token';

@Injectable({ providedIn: 'root' })
export class AuthService {
  private readonly http = inject(HttpClient);
  private readonly router = inject(Router);

  private readonly token = signal<string | null>(this.readStoredToken());
  private readonly user = signal<User | null>(null);

  readonly isLoggedIn = computed(() => this.token() !== null);
  readonly currentUser = this.user.asReadonly();

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

  logout(): void {
    this.token.set(null);
    this.user.set(null);
    localStorage.removeItem(TOKEN_KEY);
    this.router.navigate(['/login']);
  }

}
