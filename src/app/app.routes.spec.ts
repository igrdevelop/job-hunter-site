import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting } from '@angular/common/http/testing';
import { Router, provideRouter } from '@angular/router';
import { RouterTestingHarness } from '@angular/router/testing';
import { provideAnimationsAsync } from '@angular/platform-browser/animations/async';
import { vi } from 'vitest';
import { routes } from './app.routes';
import { AuthService } from './core/auth/auth.service';
import { TemplatesApi } from './core/api/templates.api';
import { FilesApi } from './core/api/files.api';
import { ProfileApi } from './core/api/profile.api';
import { TemplatesComponent } from './features/templates/templates.component';
import { ProfileComponent } from './features/profile/profile.component';
import { ProfileTabsComponent } from './features/profile-tabs/profile-tabs.component';

describe('app routes — Templates under Profile', () => {
  let router: Router;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        provideRouter(routes),
        provideAnimationsAsync(),
      ],
    });

    router = TestBed.inject(Router);
    vi.spyOn(TestBed.inject(AuthService), 'isLoggedIn').mockReturnValue(true);
    vi.spyOn(TestBed.inject(TemplatesApi), 'getAll').mockResolvedValue([]);
    vi.spyOn(TestBed.inject(FilesApi), 'getProfileFiles').mockResolvedValue([]);
    vi.spyOn(TestBed.inject(ProfileApi), 'get').mockResolvedValue(null);
  });

  afterEach(() => vi.restoreAllMocks());

  it('renders TemplatesComponent at /profile/templates', async () => {
    const harness = await RouterTestingHarness.create();
    const component = await harness.navigateByUrl('/profile/templates', TemplatesComponent);
    expect(component).toBeInstanceOf(TemplatesComponent);
    expect(router.url).toBe('/profile/templates');
  });

  it('redirects legacy /templates to /profile/templates', async () => {
    const harness = await RouterTestingHarness.create();
    await harness.navigateByUrl('/templates');
    expect(router.url).toBe('/profile/templates');
  });

  it('renders ProfileTabsComponent at /profile, with the editor tab mounted by default', async () => {
    const harness = await RouterTestingHarness.create();
    const component = await harness.navigateByUrl('/profile', ProfileTabsComponent);
    expect(component).toBeInstanceOf(ProfileTabsComponent);
    expect(component.activeTab()).toBe('editor');
    expect(harness.routeNativeElement?.querySelector('app-profile-editor')).toBeTruthy();
  });

  it('renders ProfileComponent (file browser) at /profile/files', async () => {
    const harness = await RouterTestingHarness.create();
    const component = await harness.navigateByUrl('/profile/files', ProfileComponent);
    expect(component).toBeInstanceOf(ProfileComponent);
  });

  it('renders ProfileComponent for nested candidate-file paths under /profile/files', async () => {
    const harness = await RouterTestingHarness.create();
    const component = await harness.navigateByUrl(
      '/profile/files/examples/covers',
      ProfileComponent,
    );
    expect(component).toBeInstanceOf(ProfileComponent);
    expect(component.currentPath()).toBe('examples/covers');
  });

  it('redirects legacy /profile/<path> deep links to /profile/files/<path>', async () => {
    const harness = await RouterTestingHarness.create();
    await harness.navigateByUrl('/profile/examples/covers');
    expect(router.url).toBe('/profile/files/examples/covers');
  });

  it('preserves query params and fragment on the legacy /profile/<path> redirect', async () => {
    const harness = await RouterTestingHarness.create();
    await harness.navigateByUrl('/profile/examples/covers?highlight=abc#section');
    expect(router.url).toBe('/profile/files/examples/covers?highlight=abc#section');
  });
});
