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
import { TemplatesComponent } from './features/templates/templates.component';
import { ProfileComponent } from './features/profile/profile.component';

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

  it('still renders ProfileComponent at /profile', async () => {
    const harness = await RouterTestingHarness.create();
    const component = await harness.navigateByUrl('/profile', ProfileComponent);
    expect(component).toBeInstanceOf(ProfileComponent);
  });
});
