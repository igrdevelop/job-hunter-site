import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting } from '@angular/common/http/testing';
import { provideRouter } from '@angular/router';
import { provideAnimationsAsync } from '@angular/platform-browser/animations/async';
import { vi } from 'vitest';
import { AdminComponent } from './admin.component';
import { AdminApi } from '../../core/api/admin.api';
import { AuthService } from '../../core/auth/auth.service';
import { AdminUser } from '../../core/api/models';

const USER_A: AdminUser = {
  id: '1', email: 'alice@a.com', role: 'user', emailVerified: true, disabled: false, createdAt: '2026-01-01T00:00:00Z',
};
const USER_B: AdminUser = {
  id: '2', email: 'bob@b.com', role: 'admin', emailVerified: true, disabled: true, createdAt: '2026-01-01T00:00:00Z',
};

describe('AdminComponent', () => {
  let fixture: ComponentFixture<AdminComponent>;
  let component: AdminComponent;
  let api: AdminApi;
  let authService: AuthService;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [AdminComponent],
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        provideRouter([]),
        provideAnimationsAsync(),
      ],
    }).compileComponents();

    api = TestBed.inject(AdminApi);
    authService = TestBed.inject(AuthService);
    vi.spyOn(api, 'getUsers').mockResolvedValue([USER_A, USER_B]);
    vi.spyOn(authService, 'currentUser').mockReturnValue(
      { id: '99', email: 'admin@a.com', role: 'admin', emailVerified: true },
    );

    fixture = TestBed.createComponent(AdminComponent);
    component = fixture.componentInstance;
    await fixture.whenStable();
    fixture.detectChanges();
  });

  afterEach(() => vi.restoreAllMocks());

  it('loads users on init', () => {
    expect(component.users()).toEqual([USER_A, USER_B]);
  });

  it('actionInProgress starts as null', () => {
    expect(component.actionInProgress()).toBeNull();
  });

  it('toggleDisabled() calls api.setDisabled and reloads', async () => {
    const spy = vi.spyOn(api, 'setDisabled').mockResolvedValue({ ...USER_A, disabled: true });
    vi.spyOn(api, 'getUsers').mockResolvedValue([{ ...USER_A, disabled: true }, USER_B]);
    await component.toggleDisabled(USER_A);
    expect(spy).toHaveBeenCalledWith('1', true);
  });

  it('toggleDisabled() enables a disabled user', async () => {
    const spy = vi.spyOn(api, 'setDisabled').mockResolvedValue({ ...USER_B, disabled: false });
    await component.toggleDisabled(USER_B);
    expect(spy).toHaveBeenCalledWith('2', false);
  });

  it('toggleDisabled() resets actionInProgress after success', async () => {
    vi.spyOn(api, 'setDisabled').mockResolvedValue({ ...USER_A, disabled: true });
    await component.toggleDisabled(USER_A);
    expect(component.actionInProgress()).toBeNull();
  });

  it('toggleDisabled() resets actionInProgress after error', async () => {
    vi.spyOn(api, 'setDisabled').mockRejectedValue(new Error('fail'));
    await component.toggleDisabled(USER_A);
    expect(component.actionInProgress()).toBeNull();
  });

  it('deleteUser() does nothing when confirm is cancelled', async () => {
    vi.stubGlobal('confirm', () => false);
    const spy = vi.spyOn(api, 'deleteUser');
    await component.deleteUser(USER_A);
    expect(spy).not.toHaveBeenCalled();
    vi.unstubAllGlobals();
  });

  it('deleteUser() calls api.deleteUser when confirmed', async () => {
    vi.stubGlobal('confirm', () => true);
    const spy = vi.spyOn(api, 'deleteUser').mockResolvedValue(undefined);
    await component.deleteUser(USER_A);
    expect(spy).toHaveBeenCalledWith('1');
    vi.unstubAllGlobals();
  });

  it('deleteUser() resets actionInProgress after success', async () => {
    vi.stubGlobal('confirm', () => true);
    vi.spyOn(api, 'deleteUser').mockResolvedValue(undefined);
    await component.deleteUser(USER_A);
    expect(component.actionInProgress()).toBeNull();
    vi.unstubAllGlobals();
  });

  it('deleteUser() resets actionInProgress after error', async () => {
    vi.stubGlobal('confirm', () => true);
    vi.spyOn(api, 'deleteUser').mockRejectedValue(new Error('fail'));
    await component.deleteUser(USER_A);
    expect(component.actionInProgress()).toBeNull();
    vi.unstubAllGlobals();
  });
});
