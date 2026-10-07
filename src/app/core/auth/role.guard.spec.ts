import { TestBed } from '@angular/core/testing';
import { Router, UrlTree } from '@angular/router';
import { provideRouter } from '@angular/router';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { vi } from 'vitest';
import { adminGuard } from './role.guard';
import { AuthService } from './auth.service';
import { User } from './user.model';

const ADMIN: User = { id: '1', email: 'a@b.com', role: 'admin', emailVerified: true };
const REGULAR: User = { id: '2', email: 'b@c.com', role: 'user', emailVerified: true };

describe('adminGuard', () => {
  let router: Router;
  let authService: AuthService;
  let httpMock: HttpTestingController;

  function setup(): void {
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting(), provideRouter([])],
    });
    router = TestBed.inject(Router);
    authService = TestBed.inject(AuthService);
    httpMock = TestBed.inject(HttpTestingController);
  }

  const runGuard = () =>
    TestBed.runInInjectionContext(() => adminGuard({} as never, {} as never)) as Promise<
      boolean | UrlTree
    >;

  function expectRedirect(result: boolean | UrlTree): void {
    expect(result).toBeInstanceOf(UrlTree);
    expect(router.serializeUrl(result as UrlTree)).toBe('/applications');
  }

  afterEach(() => {
    httpMock.verify();
    localStorage.removeItem('job-hunter-token');
  });

  describe('user already loaded', () => {
    beforeEach(() => {
      localStorage.removeItem('job-hunter-token');
      setup();
    });

    it('allows an admin', async () => {
      vi.spyOn(authService, 'currentUser').mockReturnValue(ADMIN);
      expect(await runGuard()).toBe(true);
    });

    it('redirects a regular user to /applications', async () => {
      vi.spyOn(authService, 'currentUser').mockReturnValue(REGULAR);
      expectRedirect(await runGuard());
    });

    it('redirects when nobody is logged in, without calling /auth/me', async () => {
      expectRedirect(await runGuard());
      httpMock.expectNone('/auth/me');
    });
  });

  // A direct load of /admin (reload, bookmark): App's constructor has started
  // GET /auth/me, but it has not answered when the guard runs.
  describe('user still loading', () => {
    beforeEach(() => {
      localStorage.setItem('job-hunter-token', 'test-token');
      setup();
    });

    it('waits for the in-flight /auth/me and allows an admin', async () => {
      const appLoad = authService.fetchCurrentUser(); // what App's constructor does
      const result = runGuard();
      // One shared request, not a second one from the guard.
      httpMock.expectOne('/auth/me').flush(ADMIN);
      await appLoad;
      expect(await result).toBe(true);
    });

    it('starts the load itself when nothing is in flight', async () => {
      const result = runGuard();
      httpMock.expectOne('/auth/me').flush(ADMIN);
      expect(await result).toBe(true);
    });

    it('redirects when the load resolves a regular user', async () => {
      const appLoad = authService.fetchCurrentUser();
      const result = runGuard();
      httpMock.expectOne('/auth/me').flush(REGULAR);
      await appLoad;
      expectRedirect(await result);
    });

    it('redirects when the load fails', async () => {
      const appLoad = authService.fetchCurrentUser().catch(() => undefined);
      const result = runGuard();
      httpMock
        .expectOne('/auth/me')
        .flush({ message: 'boom' }, { status: 500, statusText: 'Server Error' });
      await appLoad;
      expectRedirect(await result);
    });
  });
});
