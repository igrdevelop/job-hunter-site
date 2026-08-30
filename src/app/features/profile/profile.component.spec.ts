import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting } from '@angular/common/http/testing';
import { ActivatedRoute, Router, UrlSegment, provideRouter } from '@angular/router';
import { provideAnimationsAsync } from '@angular/platform-browser/animations/async';
import { of } from 'rxjs';
import { vi } from 'vitest';
import { ProfileComponent } from './profile.component';
import { FilesApi } from '../../core/api/files.api';
import { AuthService } from '../../core/auth/auth.service';
import { FileInfo, FolderInfo } from '../../core/api/models';

function routeAt(...segments: string[]): Partial<ActivatedRoute> {
  return { url: of(segments.map((s) => new UrlSegment(s, {}))) };
}

const FILE_PDF: FileInfo = { name: 'base_cv.pdf', size: 2048, type: 'pdf', modified: '2026-01-01T00:00:00Z' };
const FILE_MD: FileInfo = { name: 'candidate_profile.md', size: 512, type: 'other', modified: '2026-01-01T00:00:00Z' };
const FOLDER: FolderInfo = { name: 'attachments', itemCount: 3, modified: '2026-01-01T00:00:00Z' };

describe('ProfileComponent — download flow', () => {
  let fixture: ComponentFixture<ProfileComponent>;
  let component: ProfileComponent;
  let filesApi: FilesApi;
  let authService: AuthService;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [ProfileComponent],
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        provideRouter([]),
        provideAnimationsAsync(),
        { provide: ActivatedRoute, useValue: routeAt() },
      ],
    }).compileComponents();

    filesApi = TestBed.inject(FilesApi);
    authService = TestBed.inject(AuthService);

    vi.spyOn(filesApi, 'getProfileFiles').mockResolvedValue([FILE_PDF, FILE_MD, FOLDER]);
    vi.spyOn(filesApi, 'getProfileFileUrl').mockImplementation((p) => `/api/files/${p}`);
    vi.spyOn(authService, 'getDownloadToken').mockResolvedValue('profile-token');
    vi.spyOn(authService, 'currentUser').mockReturnValue(
      { id: '1', email: 'alice.bob@example.com', role: 'user', emailVerified: true },
    );

    fixture = TestBed.createComponent(ProfileComponent);
    component = fixture.componentInstance;
    await fixture.whenStable();
    fixture.detectChanges();
  });

  afterEach(() => vi.restoreAllMocks());

  it('loads entries on init', () => {
    expect(component.files()).toEqual([FILE_PDF, FILE_MD]);
    expect(component.folders()).toEqual([FOLDER]);
  });

  it('computes initials from email local part', () => {
    expect(component['initials']()).toBe('AB');
  });

  it('downloadFile() fetches a token and opens URL with ?dt= param', async () => {
    const openFn = vi.fn();
    vi.stubGlobal('open', openFn);
    await component.downloadFile(FILE_PDF);
    expect(authService.getDownloadToken).toHaveBeenCalledTimes(1);
    expect(openFn).toHaveBeenCalledWith(
      expect.stringContaining('dt=profile-token'), '_blank', 'noopener',
    );
    vi.unstubAllGlobals();
  });

  it('downloadFile() does not open window on token error', async () => {
    vi.spyOn(authService, 'getDownloadToken').mockRejectedValue(new Error('fail'));
    const openFn = vi.fn();
    vi.stubGlobal('open', openFn);
    await component.downloadFile(FILE_PDF);
    expect(openFn).not.toHaveBeenCalled();
    vi.unstubAllGlobals();
  });

  it('previewPdf() delegates to downloadFile()', async () => {
    const spy = vi.spyOn(component, 'downloadFile').mockResolvedValue(undefined);
    component.previewPdf(FILE_PDF);
    expect(spy).toHaveBeenCalledWith(FILE_PDF);
  });

  it('openFolder() navigates to the folder URL', () => {
    const navigate = vi.spyOn(TestBed.inject(Router), 'navigate').mockResolvedValue(true);
    component.openFolder(FOLDER);
    expect(navigate).toHaveBeenCalledWith(['/profile', 'files', 'attachments']);
  });

  it('goRoot() navigates back to /profile/files', () => {
    const navigate = vi.spyOn(TestBed.inject(Router), 'navigate').mockResolvedValue(true);
    component.goRoot();
    expect(navigate).toHaveBeenCalledWith(['/profile', 'files']);
  });

  it('shows a Templates shortcut linking to /profile/templates at root', () => {
    const link: HTMLAnchorElement | null =
      fixture.nativeElement.querySelector('a.shortcut-card');
    expect(link).not.toBeNull();
    expect(link!.getAttribute('href')).toBe('/profile/templates');
  });
});

describe('ProfileComponent — URL-driven subfolder', () => {
  let fixture: ComponentFixture<ProfileComponent>;
  let component: ProfileComponent;
  let filesApi: FilesApi;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [ProfileComponent],
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        provideRouter([]),
        provideAnimationsAsync(),
        { provide: ActivatedRoute, useValue: routeAt('examples', 'covers') },
      ],
    }).compileComponents();

    filesApi = TestBed.inject(FilesApi);
    vi.spyOn(filesApi, 'getProfileFiles').mockResolvedValue([FILE_MD]);

    fixture = TestBed.createComponent(ProfileComponent);
    component = fixture.componentInstance;
    await fixture.whenStable();
    fixture.detectChanges();
  });

  afterEach(() => vi.restoreAllMocks());

  it('derives currentPath from the URL and loads that subfolder', () => {
    expect(component.currentPath()).toBe('examples/covers');
    expect(filesApi.getProfileFiles).toHaveBeenCalledWith('examples/covers');
  });

  it('builds cumulative breadcrumb links per segment', () => {
    expect(component.breadcrumbs()).toEqual([
      { label: 'examples', link: ['/profile', 'files', 'examples'] },
      { label: 'covers', link: ['/profile', 'files', 'examples', 'covers'] },
    ]);
  });

  it('openFolder() navigates relative to the current URL path', () => {
    const navigate = vi.spyOn(TestBed.inject(Router), 'navigate').mockResolvedValue(true);
    component.openFolder(FOLDER);
    expect(navigate).toHaveBeenCalledWith(['/profile', 'files', 'examples', 'covers', 'attachments']);
  });

  it('hides the Templates shortcut inside a subfolder', () => {
    expect(fixture.nativeElement.querySelector('a.shortcut-card')).toBeNull();
  });
});
