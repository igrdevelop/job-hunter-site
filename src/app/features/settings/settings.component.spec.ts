import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting } from '@angular/common/http/testing';
import {
  ActivatedRoute,
  ParamMap,
  Router,
  convertToParamMap,
  provideRouter,
} from '@angular/router';
import { provideAnimationsAsync } from '@angular/platform-browser/animations/async';
import { BehaviorSubject } from 'rxjs';
import { vi } from 'vitest';
import { SettingsComponent } from './settings.component';
import { SettingsApi } from '../../core/api/settings.api';
import { AuthService } from '../../core/auth/auth.service';
import { SettingsCategory, UserSettingItem, TelegramStatus } from '../../core/api/models';

const SETTINGS: UserSettingItem[] = [
  { key: 'lang', value: 'en', type: 'string', description: 'Language' },
  { key: 'notify', value: true, type: 'boolean', description: 'Notify' },
];

const TG_STATUS_UNLINKED: TelegramStatus = { linked: false };
const TG_STATUS_LINKED: TelegramStatus = { linked: true, chatId: '777' };

const CATEGORIES: SettingsCategory[] = [
  { name: 'General', icon: 'tune', settings: [] },
  { name: 'LLM', icon: 'psychology', settings: [] },
];

describe('SettingsComponent', () => {
  let fixture: ComponentFixture<SettingsComponent>;
  let component: SettingsComponent;
  let api: SettingsApi;
  let authService: AuthService;
  let queryParams$: BehaviorSubject<ParamMap>;
  let routeStub: Partial<ActivatedRoute>;

  beforeEach(async () => {
    queryParams$ = new BehaviorSubject(convertToParamMap({}));
    routeStub = { queryParamMap: queryParams$.asObservable() };

    await TestBed.configureTestingModule({
      imports: [SettingsComponent],
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        provideRouter([]),
        provideAnimationsAsync(),
        { provide: ActivatedRoute, useValue: routeStub },
      ],
    }).compileComponents();

    api = TestBed.inject(SettingsApi);
    authService = TestBed.inject(AuthService);

    vi.spyOn(api, 'getUserSettings').mockResolvedValue({ settings: SETTINGS });
    vi.spyOn(api, 'getTelegramStatus').mockResolvedValue(TG_STATUS_UNLINKED);
    vi.spyOn(api, 'getGlobalSettings').mockResolvedValue({ categories: [] });
    vi.spyOn(authService, 'currentUser').mockReturnValue(
      { id: '1', email: 'a@b.com', role: 'user', emailVerified: true },
    );

    fixture = TestBed.createComponent(SettingsComponent);
    component = fixture.componentInstance;
    await fixture.whenStable();
    fixture.detectChanges();
  });

  afterEach(() => vi.restoreAllMocks());

  it('loads user settings on init', () => {
    expect(component.userSettings()).toEqual(SETTINGS);
    expect(component.userSettingsLoading()).toBe(false);
  });

  it('builds form controls from settings', () => {
    expect(component.form.get('lang')?.value).toBe('en');
    expect(component.form.get('notify')?.value).toBe(true);
  });

  it('isDirty is false initially', () => {
    expect(component.isDirty()).toBe(false);
  });

  it('isDirty becomes true when form value changes', () => {
    component.form.get('lang')!.setValue('pl');
    expect(component.isDirty()).toBe(true);
  });

  it('save() calls api.updateUserSettings with form values', async () => {
    const spy = vi.spyOn(api, 'updateUserSettings').mockResolvedValue(undefined);
    component.form.get('lang')!.setValue('pl');
    await component.save();
    expect(spy).toHaveBeenCalledWith({ lang: 'pl', notify: true });
  });

  it('save() resets isDirty after success', async () => {
    vi.spyOn(api, 'updateUserSettings').mockResolvedValue(undefined);
    component.form.get('lang')!.setValue('pl');
    await component.save();
    expect(component.isDirty()).toBe(false);
  });

  it('save() does nothing when not dirty', async () => {
    const spy = vi.spyOn(api, 'updateUserSettings');
    await component.save();
    expect(spy).not.toHaveBeenCalled();
  });

  it('save() resets saving to false after error', async () => {
    vi.spyOn(api, 'updateUserSettings').mockRejectedValue(new Error('fail'));
    component.form.get('lang')!.setValue('pl');
    await component.save();
    expect(component.saving()).toBe(false);
  });

  it('loads telegram status on init', () => {
    expect(component.telegramStatus()).toEqual(TG_STATUS_UNLINKED);
  });

  it('connectTelegram() sets telegramLinkCode on success', async () => {
    const code = { code: 'XYZ-123', expiresAt: new Date(Date.now() + 120_000).toISOString(), botHandle: 'bot' };
    vi.spyOn(api, 'generateTelegramLinkCode').mockResolvedValue(code);
    // Prevent infinite polling loop
    vi.spyOn(api, 'getTelegramStatus').mockResolvedValue(TG_STATUS_LINKED);
    await component.connectTelegram();
    expect(component.telegramLinkCode()).toEqual(code);
    expect(component.telegramLoading()).toBe(false);
  });

  it('connectTelegram() resets telegramLoading on error', async () => {
    vi.spyOn(api, 'generateTelegramLinkCode').mockRejectedValue(new Error('fail'));
    await component.connectTelegram();
    expect(component.telegramLoading()).toBe(false);
  });

  it('formatCountdown() formats seconds as MM:SS', () => {
    expect(component.formatCountdown(90)).toBe('01:30');
    expect(component.formatCountdown(5)).toBe('00:05');
    expect(component.formatCountdown(0)).toBe('00:00');
  });

  it('isAdmin is false for regular user', () => {
    expect(component.isAdmin()).toBe(false);
  });

  it('isTruthy() returns true for "true", "1", "yes"', () => {
    expect(component.isTruthy('true')).toBe(true);
    expect(component.isTruthy('1')).toBe(true);
    expect(component.isTruthy('yes')).toBe(true);
    expect(component.isTruthy('false')).toBe(false);
    expect(component.isTruthy(null)).toBe(false);
  });

  describe('when user is admin', () => {
    beforeEach(async () => {
      vi.spyOn(authService, 'currentUser').mockReturnValue(
        { id: '2', email: 'admin@a.com', role: 'admin', emailVerified: true },
      );
      vi.spyOn(api, 'getGlobalSettings').mockResolvedValue({ categories: CATEGORIES });
      fixture = TestBed.createComponent(SettingsComponent);
      component = fixture.componentInstance;
      await fixture.whenStable();
    });

    it('isAdmin is true', () => {
      expect(component.isAdmin()).toBe(true);
    });

    it('activeCategory defaults to the first category without ?category=', () => {
      expect(component.activeCategory()?.name).toBe('General');
    });

    it('activeCategory follows the ?category= query param', () => {
      queryParams$.next(convertToParamMap({ category: 'LLM' }));
      expect(component.activeCategory()?.name).toBe('LLM');
    });

    it('activeCategory falls back to the first category on unknown ?category=', () => {
      queryParams$.next(convertToParamMap({ category: 'Nope' }));
      expect(component.activeCategory()?.name).toBe('General');
    });

    it('selectCategory() writes the category into the query params', () => {
      const navigate = vi.spyOn(TestBed.inject(Router), 'navigate').mockResolvedValue(true);
      component.selectCategory(CATEGORIES[1]);
      expect(navigate).toHaveBeenCalledWith([], {
        relativeTo: routeStub,
        queryParams: { category: 'LLM' },
        queryParamsHandling: 'merge',
      });
    });
  });
});
