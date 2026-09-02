import { TestBed } from '@angular/core/testing';
import { provideHttpClient, withInterceptors, HttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { provideRouter } from '@angular/router';
import { vi } from 'vitest';
import { authInterceptor } from './auth.interceptor';
import { AuthService } from './auth.service';

const PROVIDERS = [
  provideHttpClient(withInterceptors([authInterceptor])),
  provideHttpClientTesting(),
  provideRouter([]),
];

describe('authInterceptor', () => {
  describe('without stored token', () => {
    let http: HttpClient;
    let httpMock: HttpTestingController;

    beforeEach(() => {
      localStorage.removeItem('job-hunter-token');
      TestBed.configureTestingModule({ providers: PROVIDERS });
      http = TestBed.inject(HttpClient);
      httpMock = TestBed.inject(HttpTestingController);
    });

    afterEach(() => localStorage.removeItem('job-hunter-token'));

    it('does NOT add Authorization header to /api/* when no token', () => {
      http.get('/api/applications').subscribe();
      const req = httpMock.expectOne('/api/applications');
      expect(req.request.headers.has('Authorization')).toBe(false);
      req.flush([]);
    });
  });

  describe('with stored token', () => {
    let http: HttpClient;
    let httpMock: HttpTestingController;
    let authService: AuthService;

    beforeEach(() => {
      localStorage.setItem('job-hunter-token', 'my-token');
      TestBed.configureTestingModule({ providers: PROVIDERS });
      http = TestBed.inject(HttpClient);
      httpMock = TestBed.inject(HttpTestingController);
      authService = TestBed.inject(AuthService);
    });

    afterEach(() => localStorage.removeItem('job-hunter-token'));

    it('adds Authorization header to /api/* requests', () => {
      http.get('/api/applications').subscribe();
      const req = httpMock.expectOne('/api/applications');
      expect(req.request.headers.get('Authorization')).toBe('Bearer my-token');
      req.flush([]);
    });

    it('adds Authorization header to /auth/me', () => {
      http.get('/auth/me').subscribe();
      const req = httpMock.expectOne('/auth/me');
      expect(req.request.headers.get('Authorization')).toBe('Bearer my-token');
      req.flush({});
    });

    it('adds Authorization header to /auth/download-token (regression: missing since 2026-08-04, every ?dt= download 401ed — found by the E2 live smoke)', () => {
      http.get('/auth/download-token').subscribe();
      const req = httpMock.expectOne('/auth/download-token');
      expect(req.request.headers.get('Authorization')).toBe('Bearer my-token');
      req.flush({});
    });

    it('does NOT add Authorization to /auth/register (public route)', () => {
      http.post('/auth/register', {}).subscribe();
      const req = httpMock.expectOne('/auth/register');
      expect(req.request.headers.has('Authorization')).toBe(false);
      req.flush({});
    });

    it('does NOT add Authorization to external URLs', () => {
      http.get('https://example.com/data').subscribe();
      const req = httpMock.expectOne('https://example.com/data');
      expect(req.request.headers.has('Authorization')).toBe(false);
      req.flush({});
    });

    it('calls authService.logout() on 401 from /api/*', () => {
      const logoutSpy = vi.spyOn(authService, 'logout').mockImplementation(() => undefined);
      http.get('/api/applications').subscribe({ error: () => undefined });
      httpMock.expectOne('/api/applications').flush('Unauthorized', { status: 401, statusText: 'Unauthorized' });
      expect(logoutSpy).toHaveBeenCalledTimes(1);
    });

    it('does NOT call logout() on 401 from external URL', () => {
      const logoutSpy = vi.spyOn(authService, 'logout').mockImplementation(() => undefined);
      http.get('https://other.com/resource').subscribe({ error: () => undefined });
      httpMock.expectOne('https://other.com/resource').flush('Unauthorized', { status: 401, statusText: 'Unauthorized' });
      expect(logoutSpy).not.toHaveBeenCalled();
    });

    it('sets needsEmailVerification on 403 from /api/*', () => {
      expect(authService.needsEmailVerification()).toBe(false);
      http.get('/api/applications').subscribe({ error: () => undefined });
      httpMock.expectOne('/api/applications').flush('Forbidden', { status: 403, statusText: 'Forbidden' });
      expect(authService.needsEmailVerification()).toBe(true);
    });

    it('does NOT set needsEmailVerification on 403 from external URL', () => {
      http.get('https://other.com/resource').subscribe({ error: () => undefined });
      httpMock.expectOne('https://other.com/resource').flush('Forbidden', { status: 403, statusText: 'Forbidden' });
      expect(authService.needsEmailVerification()).toBe(false);
    });

    it('does NOT call logout() on 403', () => {
      const logoutSpy = vi.spyOn(authService, 'logout').mockImplementation(() => undefined);
      http.get('/api/something').subscribe({ error: () => undefined });
      httpMock.expectOne('/api/something').flush('Forbidden', { status: 403, statusText: 'Forbidden' });
      expect(logoutSpy).not.toHaveBeenCalled();
    });

    it('propagates 500 errors without triggering logout or unverified flag', () => {
      const logoutSpy = vi.spyOn(authService, 'logout').mockImplementation(() => undefined);
      let caught = false;
      http.get('/api/something').subscribe({ error: () => { caught = true; } });
      httpMock.expectOne('/api/something').flush('Error', { status: 500, statusText: 'Server Error' });
      expect(logoutSpy).not.toHaveBeenCalled();
      expect(authService.needsEmailVerification()).toBe(false);
      expect(caught).toBe(true);
    });
  });
});
