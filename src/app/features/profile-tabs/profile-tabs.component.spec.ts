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
import { By } from '@angular/platform-browser';
import { BehaviorSubject } from 'rxjs';
import { vi } from 'vitest';
import { PROFILE_FILES_TAB_ENABLED, ProfileTabsComponent } from './profile-tabs.component';
import { ProfileApi } from '../../core/api/profile.api';
import { AuthService } from '../../core/auth/auth.service';
import { User } from '../../core/auth/user.model';
import { ProfileUploadsComponent } from '../profile-uploads/profile-uploads.component';

const OWNER: User = {
  id: '1',
  email: 'owner@example.com',
  role: 'user',
  emailVerified: true,
  isOwner: true,
};
const NON_OWNER: User = {
  id: '2',
  email: 'other@example.com',
  role: 'user',
  emailVerified: true,
  isOwner: false,
};

describe('ProfileTabsComponent', () => {
  let fixture: ComponentFixture<ProfileTabsComponent>;
  let component: ProfileTabsComponent;
  let router: Router;
  let queryParams$: BehaviorSubject<ParamMap>;

  async function createWith(options: {
    user: User;
    filesTabEnabled?: boolean;
    initialQueryParams?: Record<string, string>;
  }): Promise<void> {
    queryParams$ = new BehaviorSubject(convertToParamMap(options.initialQueryParams ?? {}));
    const routeStub = { queryParamMap: queryParams$.asObservable() };

    await TestBed.configureTestingModule({
      imports: [ProfileTabsComponent],
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        provideRouter([]),
        provideAnimationsAsync(),
        { provide: ActivatedRoute, useValue: routeStub },
        { provide: PROFILE_FILES_TAB_ENABLED, useValue: options.filesTabEnabled ?? true },
      ],
    }).compileComponents();

    const api = TestBed.inject(ProfileApi);
    vi.spyOn(api, 'get').mockResolvedValue(null);
    vi.spyOn(api, 'listUploads').mockResolvedValue([]);
    vi.spyOn(api, 'listRenderedFiles').mockResolvedValue([]);
    vi.spyOn(api, 'listPreviews').mockResolvedValue([]);

    const authService = TestBed.inject(AuthService);
    vi.spyOn(authService, 'currentUser').mockReturnValue(options.user);

    router = TestBed.inject(Router);
    vi.spyOn(router, 'navigate').mockResolvedValue(true);

    fixture = TestBed.createComponent(ProfileTabsComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
  }

  function tabButtons(): HTMLButtonElement[] {
    return Array.from(fixture.nativeElement.querySelectorAll('.filter-pill'));
  }

  function tabLabels(): string[] {
    return tabButtons().map((btn) => btn.textContent?.trim() ?? '');
  }

  afterEach(() => vi.restoreAllMocks());

  describe('as the owner', () => {
    beforeEach(async () => {
      await createWith({ user: OWNER });
    });

    it('defaults to the editor tab when ?tab= is absent', () => {
      expect(component.activeTab()).toBe('editor');
      expect(fixture.nativeElement.querySelector('app-profile-editor')).toBeTruthy();
    });

    it('renders all four tabs, including the owner-only preview tab', () => {
      expect(tabLabels()).toEqual(['Uploads', 'Editor', 'Rendered Files', 'Test Resume']);
    });

    it('switches to the preview tab and updates the URL', () => {
      component.selectTab('preview');
      expect(router.navigate).toHaveBeenCalledWith(
        [],
        expect.objectContaining({
          queryParams: { tab: 'preview' },
          queryParamsHandling: 'merge',
        }),
      );
    });

    it('reflects the ?tab= query param as the active tab', async () => {
      queryParams$.next(convertToParamMap({ tab: 'uploads' }));
      fixture.detectChanges();
      expect(component.activeTab()).toBe('uploads');
      expect(fixture.nativeElement.querySelector('app-profile-editor')).toBeFalsy();
    });

    it('falls back to editor for an unrecognized ?tab= value', async () => {
      queryParams$.next(convertToParamMap({ tab: 'nonsense' }));
      fixture.detectChanges();
      expect(component.activeTab()).toBe('editor');
    });
  });

  describe('as a non-owner', () => {
    beforeEach(async () => {
      await createWith({ user: NON_OWNER });
    });

    it('never renders the preview tab button or its content', () => {
      expect(tabLabels()).toEqual(['Uploads', 'Editor', 'Rendered Files']);
      expect(tabLabels()).not.toContain('Test Resume');
    });

    it('falls back to editor when ?tab=preview is requested directly', async () => {
      queryParams$.next(convertToParamMap({ tab: 'preview' }));
      fixture.detectChanges();
      expect(component.activeTab()).toBe('editor');
      // The preview section must never reach the DOM for a non-owner, not just be hidden.
      expect(fixture.nativeElement.textContent).not.toContain('Test Resume');
    });
  });

  describe('with the files tab flag off', () => {
    beforeEach(async () => {
      await createWith({ user: OWNER, filesTabEnabled: false });
    });

    it('removes the files tab entirely', () => {
      expect(tabLabels()).toEqual(['Uploads', 'Editor', 'Test Resume']);
    });

    it('falls back to editor when ?tab=files is requested directly', async () => {
      queryParams$.next(convertToParamMap({ tab: 'files' }));
      fixture.detectChanges();
      expect(component.activeTab()).toBe('editor');
      expect(fixture.nativeElement.textContent).not.toContain('Rendered Files');
    });
  });

  describe('uploads tab hand-off (docs/PROFILE_PAGE_TABS.md S2)', () => {
    beforeEach(async () => {
      await createWith({ user: OWNER, initialQueryParams: { tab: 'uploads' } });
    });

    it("switches to the editor tab when the uploads tab's dialog completes a parse", () => {
      const uploads = fixture.debugElement.query(By.directive(ProfileUploadsComponent));
      expect(uploads).toBeTruthy();
      uploads.componentInstance.completed.emit();
      expect(router.navigate).toHaveBeenCalledWith(
        [],
        expect.objectContaining({
          queryParams: { tab: 'editor' },
          queryParamsHandling: 'merge',
        }),
      );
    });
  });
});
