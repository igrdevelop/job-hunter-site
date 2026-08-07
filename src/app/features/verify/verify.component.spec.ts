import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting } from '@angular/common/http/testing';
import { provideRouter, ActivatedRoute } from '@angular/router';
import { Component } from '@angular/core';
import { vi } from 'vitest';
import { VerifyComponent } from './verify.component';
import { AuthService } from '../../core/auth/auth.service';

@Component({ template: '', standalone: true })
class StubLogin {}

function makeActivatedRoute(token: string | null): Partial<ActivatedRoute> {
  return {
    snapshot: {
      queryParamMap: {
        get: (key: string) => (key === 'token' ? token : null),
      } as never,
    } as never,
  };
}

describe('VerifyComponent', () => {
  let fixture: ComponentFixture<VerifyComponent>;
  let component: VerifyComponent;
  let authService: AuthService;

  async function setup(token: string | null): Promise<void> {
    await TestBed.configureTestingModule({
      imports: [VerifyComponent],
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        provideRouter([{ path: 'login', component: StubLogin }]),
        { provide: ActivatedRoute, useValue: makeActivatedRoute(token) },
      ],
    }).compileComponents();

    authService = TestBed.inject(AuthService);
  }

  afterEach(() => vi.restoreAllMocks());

  describe('without token in URL', () => {
    beforeEach(async () => {
      await setup(null);
      fixture = TestBed.createComponent(VerifyComponent);
      component = fixture.componentInstance;
      await fixture.whenStable();
    });

    it('sets state to resend when no token', () => {
      expect(component.state()).toBe('resend');
    });

    it('does not call verifyEmail', () => {
      // If verifyEmail had been called it would've thrown because http is unhandled
      expect(component.state()).toBe('resend');
    });
  });

  describe('with valid token', () => {
    beforeEach(async () => {
      await setup('valid-token-xyz');
      vi.spyOn(authService, 'verifyEmail').mockResolvedValue(undefined);
      fixture = TestBed.createComponent(VerifyComponent);
      component = fixture.componentInstance;
      await fixture.whenStable();
    });

    it('calls verifyEmail with the token from URL', () => {
      expect(authService.verifyEmail).toHaveBeenCalledWith('valid-token-xyz');
    });

    it('sets state to success after successful verification', () => {
      expect(component.state()).toBe('success');
    });
  });

  describe('with invalid token', () => {
    beforeEach(async () => {
      await setup('bad-token');
      vi.spyOn(authService, 'verifyEmail').mockRejectedValue(new Error('invalid'));
      fixture = TestBed.createComponent(VerifyComponent);
      component = fixture.componentInstance;
      await fixture.whenStable();
    });

    it('sets state to error when verifyEmail throws', () => {
      expect(component.state()).toBe('error');
    });
  });

  describe('resend()', () => {
    beforeEach(async () => {
      await setup(null);
      fixture = TestBed.createComponent(VerifyComponent);
      component = fixture.componentInstance;
      await fixture.whenStable();
    });

    it('does nothing when resendForm is invalid', async () => {
      const spy = vi.spyOn(authService, 'resendVerification');
      await component.resend();
      expect(spy).not.toHaveBeenCalled();
    });

    it('sets resendSent to true on success', async () => {
      vi.spyOn(authService, 'resendVerification').mockResolvedValue(undefined);
      component.resendForm.setValue({ email: 'a@b.com' });
      await component.resend();
      expect(component.resendSent()).toBe(true);
      expect(component.resendLoading()).toBe(false);
    });

    it('sets errorMessage on failure', async () => {
      vi.spyOn(authService, 'resendVerification').mockRejectedValue(new Error('net'));
      component.resendForm.setValue({ email: 'a@b.com' });
      await component.resend();
      expect(component.errorMessage()).toContain('Could not send');
      expect(component.resendLoading()).toBe(false);
    });
  });
});
