import { TestBed } from '@angular/core/testing';
import { Component } from '@angular/core';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { provideRouter } from '@angular/router';
import { AuthService } from './auth.service';

@Component({ template: '', standalone: true })
class StubComponent {}

const PROVIDERS = [
  provideHttpClient(),
  provideHttpClientTesting(),
  provideRouter([{ path: 'login', component: StubComponent }]),
];
const TOKEN_KEY = 'job-hunter-token';

describe('AuthService', () => {
  describe('without stored token', () => {
    let service: AuthService;
    let http: HttpTestingController;

    beforeEach(() => {
      localStorage.removeItem(TOKEN_KEY);
      TestBed.configureTestingModule({ providers: PROVIDERS });
      service = TestBed.inject(AuthService);
      http = TestBed.inject(HttpTestingController);
    });

    afterEach(() => localStorage.removeItem(TOKEN_KEY));

    it('isLoggedIn() is false', () => expect(service.isLoggedIn()).toBe(false));
    it('needsEmailVerification starts false', () => expect(service.needsEmailVerification()).toBe(false));
    it('currentUser starts null', () => expect(service.currentUser()).toBeNull());

    it('login() POSTs credentials and stores the access token', async () => {
      const p = service.login('a@b.com', 'secret');
      http.expectOne('/auth/login').flush({ accessToken: 'jwt-abc' });
      await Promise.resolve(); // let fetchCurrentUser() be called
      http.expectOne('/auth/me').flush({ id: '1', email: 'a@b.com', role: 'user', emailVerified: true });
      await p;
      expect(localStorage.getItem(TOKEN_KEY)).toBe('jwt-abc');
      expect(service.isLoggedIn()).toBe(true);
    });

    it('login() sets currentUser role and emailVerified from /auth/me', async () => {
      const p = service.login('a@b.com', 'secret');
      http.expectOne('/auth/login').flush({ accessToken: 'tok' });
      await Promise.resolve(); // let fetchCurrentUser() be called
      http.expectOne('/auth/me').flush({ id: '42', email: 'a@b.com', role: 'admin', emailVerified: false });
      await p;
      expect(service.currentUser()?.role).toBe('admin');
      expect(service.currentUser()?.emailVerified).toBe(false);
    });

    it('register() POSTs to /auth/register with email and password', async () => {
      const p = service.register('new@user.com', 'pass1234');
      const req = http.expectOne('/auth/register');
      expect(req.request.method).toBe('POST');
      expect(req.request.body).toEqual({ email: 'new@user.com', password: 'pass1234' });
      req.flush({});
      await p;
    });

    it('verifyEmail() POSTs token to /auth/verify', async () => {
      const p = service.verifyEmail('verify-token-xyz');
      const req = http.expectOne('/auth/verify');
      expect(req.request.method).toBe('POST');
      expect(req.request.body).toEqual({ token: 'verify-token-xyz' });
      req.flush({});
      await p;
    });

    it('resendVerification() POSTs email to /auth/resend', async () => {
      const p = service.resendVerification('a@b.com');
      const req = http.expectOne('/auth/resend');
      expect(req.request.method).toBe('POST');
      expect(req.request.body).toEqual({ email: 'a@b.com' });
      req.flush({});
      await p;
    });

    it('getDownloadToken() GETs /auth/download-token and returns the string', async () => {
      const p = service.getDownloadToken();
      http.expectOne('/auth/download-token').flush({ token: 'dl-tok' });
      expect(await p).toBe('dl-tok');
    });

    it('fetchCurrentUser() returns null and makes no request when not logged in', async () => {
      const result = await service.fetchCurrentUser();
      http.expectNone('/auth/me');
      expect(result).toBeNull();
    });

    it('logout() resets needsEmailVerification', () => {
      service.needsEmailVerification.set(true);
      service.logout();
      expect(service.needsEmailVerification()).toBe(false);
    });
  });

  describe('with stored token', () => {
    let service: AuthService;
    let http: HttpTestingController;

    beforeEach(() => {
      localStorage.setItem(TOKEN_KEY, 'existing-token');
      TestBed.configureTestingModule({ providers: PROVIDERS });
      service = TestBed.inject(AuthService);
      http = TestBed.inject(HttpTestingController);
    });

    afterEach(() => localStorage.removeItem(TOKEN_KEY));

    it('isLoggedIn() is true', () => expect(service.isLoggedIn()).toBe(true));

    it('fetchCurrentUser() GETs /auth/me and updates user signal', async () => {
      const p = service.fetchCurrentUser();
      http.expectOne('/auth/me').flush({ id: '5', email: 'x@y.com', role: 'user', emailVerified: true });
      await p;
      expect(service.currentUser()?.email).toBe('x@y.com');
    });

    it('logout() sets isLoggedIn to false and removes token from storage', () => {
      service.logout();
      expect(service.isLoggedIn()).toBe(false);
      expect(localStorage.getItem(TOKEN_KEY)).toBeNull();
    });

    it('logout() clears currentUser', async () => {
      const p = service.fetchCurrentUser();
      http.expectOne('/auth/me').flush({ id: '1', email: 'a@b.com', role: 'user', emailVerified: true });
      await p;
      expect(service.currentUser()).not.toBeNull();
      service.logout();
      expect(service.currentUser()).toBeNull();
    });
  });
});
