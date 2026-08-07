import { TestBed } from '@angular/core/testing';
import { Router, UrlTree } from '@angular/router';
import { provideRouter } from '@angular/router';
import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting } from '@angular/common/http/testing';
import { vi } from 'vitest';
import { adminGuard } from './role.guard';
import { AuthService } from './auth.service';

describe('adminGuard', () => {
  let router: Router;
  let authService: AuthService;

  beforeEach(() => {
    localStorage.removeItem('job-hunter-token');
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting(), provideRouter([])],
    });
    router = TestBed.inject(Router);
    authService = TestBed.inject(AuthService);
  });

  afterEach(() => localStorage.removeItem('job-hunter-token'));

  it('returns true when currentUser has role admin', () => {
    vi.spyOn(authService, 'currentUser').mockReturnValue(
      { id: '1', email: 'a@b.com', role: 'admin', emailVerified: true },
    );
    const result = TestBed.runInInjectionContext(() => adminGuard({} as never, {} as never));
    expect(result).toBe(true);
  });

  it('returns UrlTree to /applications when role is user', () => {
    vi.spyOn(authService, 'currentUser').mockReturnValue(
      { id: '2', email: 'b@c.com', role: 'user', emailVerified: true },
    );
    const result = TestBed.runInInjectionContext(() => adminGuard({} as never, {} as never));
    expect(result).toBeInstanceOf(UrlTree);
    expect(router.serializeUrl(result as UrlTree)).toBe('/applications');
  });

  it('returns UrlTree to /applications when no user logged in', () => {
    vi.spyOn(authService, 'currentUser').mockReturnValue(null);
    const result = TestBed.runInInjectionContext(() => adminGuard({} as never, {} as never));
    expect(result).toBeInstanceOf(UrlTree);
    expect(router.serializeUrl(result as UrlTree)).toBe('/applications');
  });
});
