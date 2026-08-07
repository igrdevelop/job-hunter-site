import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting } from '@angular/common/http/testing';
import { provideRouter } from '@angular/router';
import { vi } from 'vitest';
import { SignupComponent } from './signup.component';
import { AuthService } from '../../core/auth/auth.service';

describe('SignupComponent', () => {
  let fixture: ComponentFixture<SignupComponent>;
  let component: SignupComponent;
  let authService: AuthService;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [SignupComponent],
      providers: [provideHttpClient(), provideHttpClientTesting(), provideRouter([])],
    }).compileComponents();

    fixture = TestBed.createComponent(SignupComponent);
    component = fixture.componentInstance;
    authService = TestBed.inject(AuthService);
    fixture.detectChanges();
  });

  it('starts with submitted=false, loading=false, no error', () => {
    expect(component.submitted()).toBe(false);
    expect(component.loading()).toBe(false);
    expect(component.errorMessage()).toBeNull();
  });

  it('form starts invalid (empty)', () => {
    expect(component.form.valid).toBe(false);
  });

  it('passwordsMismatch validator triggers when passwords differ', () => {
    component.form.setValue({ email: 'a@b.com', password: 'pass1234', confirm: 'other' });
    expect(component.form.hasError('passwordsMismatch')).toBe(true);
  });

  it('form is valid when email, password ≥8 chars, and passwords match', () => {
    component.form.setValue({ email: 'a@b.com', password: 'pass1234', confirm: 'pass1234' });
    expect(component.form.valid).toBe(true);
  });

  it('submit() does nothing when form is invalid', async () => {
    const spy = vi.spyOn(authService, 'register');
    await component.submit();
    expect(spy).not.toHaveBeenCalled();
  });

  it('submit() calls authService.register and sets submitted on success', async () => {
    vi.spyOn(authService, 'register').mockResolvedValue(undefined);
    component.form.setValue({ email: 'a@b.com', password: 'pass1234', confirm: 'pass1234' });
    await component.submit();
    expect(component.submitted()).toBe(true);
    expect(component.loading()).toBe(false);
  });

  it('submit() sets error message on 403', async () => {
    vi.spyOn(authService, 'register').mockRejectedValue({ status: 403 });
    component.form.setValue({ email: 'a@b.com', password: 'pass1234', confirm: 'pass1234' });
    await component.submit();
    expect(component.errorMessage()).toContain('disabled');
    expect(component.loading()).toBe(false);
  });

  it('submit() sets error message on 409', async () => {
    vi.spyOn(authService, 'register').mockRejectedValue({ status: 409 });
    component.form.setValue({ email: 'a@b.com', password: 'pass1234', confirm: 'pass1234' });
    await component.submit();
    expect(component.errorMessage()).toContain('already exists');
  });

  it('submit() sets generic error message on unexpected errors', async () => {
    vi.spyOn(authService, 'register').mockRejectedValue({ status: 500 });
    component.form.setValue({ email: 'a@b.com', password: 'pass1234', confirm: 'pass1234' });
    await component.submit();
    expect(component.errorMessage()).toContain('went wrong');
  });

  it('loading resets to false after error', async () => {
    vi.spyOn(authService, 'register').mockRejectedValue({ status: 500 });
    component.form.setValue({ email: 'a@b.com', password: 'pass1234', confirm: 'pass1234' });
    await component.submit();
    expect(component.loading()).toBe(false);
  });
});
