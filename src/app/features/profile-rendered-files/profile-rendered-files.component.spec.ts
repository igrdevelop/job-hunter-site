import { ComponentFixture, TestBed } from '@angular/core/testing';
import { HttpErrorResponse, provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting } from '@angular/common/http/testing';
import { provideAnimationsAsync } from '@angular/platform-browser/animations/async';
import { vi } from 'vitest';
import { ProfileRenderedFilesComponent } from './profile-rendered-files.component';
import { ProfileApi } from '../../core/api/profile.api';
import { ProfileGetResponse, ProfileRenderedFile } from '../../core/api/models';
import { PROFILE_MOCK } from '../profile-editor/mock/profile.mock';

const FILES: ProfileRenderedFile[] = [
  { name: 'candidate.yaml', size: 512, modifiedAt: '2026-08-30T12:00:00Z' },
  { name: 'base_cv_angular.md', size: 2048, modifiedAt: '2026-08-30T12:00:00Z' },
];

describe('ProfileRenderedFilesComponent', () => {
  let fixture: ComponentFixture<ProfileRenderedFilesComponent>;
  let component: ProfileRenderedFilesComponent;
  let api: ProfileApi;

  async function create(): Promise<void> {
    await TestBed.configureTestingModule({
      imports: [ProfileRenderedFilesComponent],
      providers: [provideHttpClient(), provideHttpClientTesting(), provideAnimationsAsync()],
    }).compileComponents();
    api = TestBed.inject(ProfileApi);
    fixture = TestBed.createComponent(ProfileRenderedFilesComponent);
    component = fixture.componentInstance;
  }

  afterEach(() => vi.restoreAllMocks());

  describe('with files available', () => {
    beforeEach(async () => {
      await create();
      vi.spyOn(api, 'listRenderedFiles').mockResolvedValue(FILES);
      vi.spyOn(api, 'get').mockResolvedValue(PROFILE_MOCK);
      fixture.detectChanges();
      await fixture.whenStable();
      fixture.detectChanges();
    });

    it('renders each file', () => {
      expect(component.files()).toEqual(FILES);
      const text = fixture.nativeElement.textContent as string;
      expect(text).toContain('candidate.yaml');
      expect(text).toContain('base_cv_angular.md');
    });

    it('clicking a file loads and shows its content, monospace', async () => {
      vi.spyOn(api, 'getRenderedFileContent').mockResolvedValue('identity:\n  full_name: Jane Doe\n');
      await component.viewFile(FILES[0]);
      fixture.detectChanges();
      expect(api.getRenderedFileContent).toHaveBeenCalledWith('candidate.yaml');
      expect(component.selectedContent()).toBe('identity:\n  full_name: Jane Doe\n');
      const pre = fixture.nativeElement.querySelector('.viewer-content');
      expect(pre?.textContent).toContain('full_name: Jane Doe');
    });

    it('copyContent() writes to the clipboard', async () => {
      const writeText = vi.fn().mockResolvedValue(undefined);
      Object.assign(navigator, { clipboard: { writeText } });
      vi.spyOn(api, 'getRenderedFileContent').mockResolvedValue('plain text content');
      await component.viewFile(FILES[0]);
      await component.copyContent();
      expect(writeText).toHaveBeenCalledWith('plain text content');
    });

    it('closeViewer() clears the selection', async () => {
      vi.spyOn(api, 'getRenderedFileContent').mockResolvedValue('content');
      await component.viewFile(FILES[0]);
      component.closeViewer();
      expect(component.selectedFile()).toBeNull();
      expect(component.selectedContent()).toBeNull();
    });

    it('shows a viewer error when the file content fails to load', async () => {
      vi.spyOn(api, 'getRenderedFileContent').mockRejectedValue(new Error('boom'));
      await component.viewFile(FILES[1]);
      expect(component.viewerError()).toContain('base_cv_angular.md');
      expect(component.selectedContent()).toBeNull();
    });
  });

  describe('staleness banner', () => {
    it('shows when the profile was edited after the last render job', async () => {
      await create();
      vi.spyOn(api, 'listRenderedFiles').mockResolvedValue(FILES);
      const stale: ProfileGetResponse = {
        ...PROFILE_MOCK,
        updatedAt: '2026-08-31T00:00:00Z',
        lastRenderJob: { id: 'j1', status: 'done', updatedAt: '2026-08-30T00:00:00Z' },
      };
      vi.spyOn(api, 'get').mockResolvedValue(stale);
      fixture.detectChanges();
      await fixture.whenStable();
      fixture.detectChanges();
      expect(component.stale()).toBe(true);
      expect(fixture.nativeElement.textContent).toContain('Profile changed since last publish');
    });

    it('does not show when lastRenderJob is absent (api T2 not deployed)', async () => {
      await create();
      vi.spyOn(api, 'listRenderedFiles').mockResolvedValue(FILES);
      vi.spyOn(api, 'get').mockResolvedValue(PROFILE_MOCK);
      fixture.detectChanges();
      await fixture.whenStable();
      fixture.detectChanges();
      expect(component.stale()).toBe(false);
    });

    it('does not show when the profile is unchanged since the last render', async () => {
      await create();
      vi.spyOn(api, 'listRenderedFiles').mockResolvedValue(FILES);
      const fresh: ProfileGetResponse = {
        ...PROFILE_MOCK,
        updatedAt: '2026-08-30T00:00:00Z',
        lastRenderJob: { id: 'j1', status: 'done', updatedAt: '2026-08-31T00:00:00Z' },
      };
      vi.spyOn(api, 'get').mockResolvedValue(fresh);
      fixture.detectChanges();
      await fixture.whenStable();
      fixture.detectChanges();
      expect(component.stale()).toBe(false);
    });
  });

  describe('empty state (never-rendered user)', () => {
    beforeEach(async () => {
      await create();
      vi.spyOn(api, 'listRenderedFiles').mockResolvedValue([]);
      vi.spyOn(api, 'get').mockResolvedValue(PROFILE_MOCK);
      fixture.detectChanges();
      await fixture.whenStable();
      fixture.detectChanges();
    });

    it('shows the "publish your profile" empty state, not an error', () => {
      expect(component.showEmptyState()).toBe(true);
      expect(component.errorMessage()).toBeNull();
      expect(fixture.nativeElement.textContent).toContain('Publish your profile to see rendered files.');
    });
  });

  describe('when GET /api/profile/files 404s (api T2 not deployed)', () => {
    beforeEach(async () => {
      await create();
      vi.spyOn(api, 'listRenderedFiles').mockRejectedValue(
        new HttpErrorResponse({ status: 404, statusText: 'Not Found' }),
      );
      vi.spyOn(api, 'get').mockResolvedValue(PROFILE_MOCK);
      vi.spyOn(console, 'warn').mockImplementation(() => undefined);
      fixture.detectChanges();
      await fixture.whenStable();
      fixture.detectChanges();
    });

    it('shows a calm unavailable state and logs a console.warn', () => {
      expect(component.unavailable()).toBe(true);
      expect(component.errorMessage()).toBeNull();
      expect(fixture.nativeElement.textContent).toContain("aren't available yet");
      expect(console.warn).toHaveBeenCalledWith(expect.stringContaining('/api/profile/files'));
    });
  });

  describe('when GET /api/profile/files fails with a real error', () => {
    beforeEach(async () => {
      await create();
      vi.spyOn(api, 'listRenderedFiles').mockRejectedValue(
        new HttpErrorResponse({ status: 500, statusText: 'Server Error' }),
      );
      vi.spyOn(api, 'get').mockResolvedValue(PROFILE_MOCK);
      fixture.detectChanges();
      await fixture.whenStable();
      fixture.detectChanges();
    });

    it('shows a generic error message, not the 404 empty state', () => {
      expect(component.unavailable()).toBe(false);
      expect(component.errorMessage()).toContain('Could not load');
    });
  });

  describe('read-only guarantee', () => {
    it('never calls a mutating ProfileApi method while browsing and viewing files', async () => {
      await create();
      vi.spyOn(api, 'listRenderedFiles').mockResolvedValue(FILES);
      vi.spyOn(api, 'get').mockResolvedValue(PROFILE_MOCK);
      vi.spyOn(api, 'getRenderedFileContent').mockResolvedValue('content');
      const put = vi.spyOn(api, 'put');
      const upload = vi.spyOn(api, 'upload');
      const requestPreview = vi.spyOn(api, 'requestPreview');
      const restoreRevision = vi.spyOn(api, 'restoreRevision');

      fixture.detectChanges();
      await fixture.whenStable();
      fixture.detectChanges();
      await component.viewFile(FILES[0]);
      await component.copyContent().catch(() => undefined);
      component.closeViewer();

      expect(put).not.toHaveBeenCalled();
      expect(upload).not.toHaveBeenCalled();
      expect(requestPreview).not.toHaveBeenCalled();
      expect(restoreRevision).not.toHaveBeenCalled();
    });

    it('renders no button implying a save/edit action', async () => {
      await create();
      vi.spyOn(api, 'listRenderedFiles').mockResolvedValue(FILES);
      vi.spyOn(api, 'get').mockResolvedValue(PROFILE_MOCK);
      fixture.detectChanges();
      await fixture.whenStable();
      fixture.detectChanges();
      const buttons: HTMLButtonElement[] = Array.from(fixture.nativeElement.querySelectorAll('button'));
      const labels = buttons.map((b) => b.textContent?.trim().toLowerCase() ?? '');
      expect(labels.some((l) => l.includes('save'))).toBe(false);
      expect(labels.some((l) => l.includes('delete'))).toBe(false);
      expect(labels.some((l) => l.includes('edit'))).toBe(false);
    });
  });
});
