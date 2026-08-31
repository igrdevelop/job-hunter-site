import { ComponentFixture, TestBed } from '@angular/core/testing';
import { HttpErrorResponse, provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting } from '@angular/common/http/testing';
import { provideAnimationsAsync } from '@angular/platform-browser/animations/async';
import { vi } from 'vitest';
import {
  PROFILE_PREVIEW_POLL_INTERVAL_MS,
  PROFILE_PREVIEW_SLOW_AFTER_MS,
  ProfileTestResumeComponent,
} from './profile-test-resume.component';
import { ProfileApi } from '../../core/api/profile.api';
import { AuthService } from '../../core/auth/auth.service';
import { ProfileJob, ProfilePreviewListItem } from '../../core/api/models';
import { PROFILE_MOCK } from '../profile-editor/mock/profile.mock';

const HISTORY: ProfilePreviewListItem[] = [
  { track: 'angular', timestamp: '2026-08-30T12-00-00Z', files: ['preview.pdf'] },
];

describe('ProfileTestResumeComponent', () => {
  let fixture: ComponentFixture<ProfileTestResumeComponent>;
  let component: ProfileTestResumeComponent;
  let api: ProfileApi;

  async function create(): Promise<void> {
    await TestBed.configureTestingModule({
      imports: [ProfileTestResumeComponent],
      providers: [provideHttpClient(), provideHttpClientTesting(), provideAnimationsAsync()],
    }).compileComponents();
    api = TestBed.inject(ProfileApi);
    fixture = TestBed.createComponent(ProfileTestResumeComponent);
    component = fixture.componentInstance;
  }

  afterEach(() => {
    vi.restoreAllMocks();
    vi.useRealTimers();
  });

  describe('track chips', () => {
    it('derives tracks from the profile document, defaulting to core', async () => {
      await create();
      vi.spyOn(api, 'get').mockResolvedValue(PROFILE_MOCK);
      vi.spyOn(api, 'listPreviews').mockResolvedValue([]);
      fixture.detectChanges();
      await fixture.whenStable();
      fixture.detectChanges();
      expect(component.tracks()).toContain('core');
    });

    it('is just "core" when there is no profile loaded yet', async () => {
      await create();
      vi.spyOn(api, 'get').mockResolvedValue(null);
      vi.spyOn(api, 'listPreviews').mockResolvedValue([]);
      fixture.detectChanges();
      await fixture.whenStable();
      fixture.detectChanges();
      expect(component.tracks()).toEqual(['core']);
      expect(component.selectedTrack()).toBe('core');
    });

    it('selectTrack() updates the selection', async () => {
      await create();
      vi.spyOn(api, 'get').mockResolvedValue(PROFILE_MOCK);
      vi.spyOn(api, 'listPreviews').mockResolvedValue([]);
      fixture.detectChanges();
      await fixture.whenStable();
      component.selectTrack('react');
      expect(component.selectedTrack()).toBe('react');
    });

    it('renders the "core" chip labeled "Universal (full profile)" while keeping the API value "core"', async () => {
      await create();
      vi.spyOn(api, 'get').mockResolvedValue(PROFILE_MOCK);
      vi.spyOn(api, 'listPreviews').mockResolvedValue([]);
      fixture.detectChanges();
      await fixture.whenStable();
      fixture.detectChanges();

      expect(component.trackLabel('core')).toBe('Universal (full profile)');
      expect(component.trackLabel('react')).toBe('react');
      const chips = Array.from(fixture.nativeElement.querySelectorAll('.track-chip')) as HTMLElement[];
      expect(chips.map((el) => el.textContent?.trim())).toContain('Universal (full profile)');
      expect(chips.map((el) => el.textContent?.trim())).not.toContain('core');
    });

    it('selecting the "Universal (full profile)" chip still requests the "core" track', async () => {
      await create();
      vi.spyOn(api, 'get').mockResolvedValue(PROFILE_MOCK);
      vi.spyOn(api, 'listPreviews').mockResolvedValue([]);
      vi.spyOn(api, 'requestPreview').mockResolvedValue({ jobId: 'job-1' });
      fixture.detectChanges();
      await fixture.whenStable();
      fixture.detectChanges();

      component.selectTrack('react');
      const universalChip = Array.from(
        fixture.nativeElement.querySelectorAll('.track-chip') as NodeListOf<HTMLElement>,
      ).find((el) => el.textContent?.trim() === 'Universal (full profile)');
      universalChip?.click();
      fixture.detectChanges();
      expect(component.selectedTrack()).toBe('core');

      await component.generatePreview();
      expect(api.requestPreview).toHaveBeenCalledWith('core');
    });
  });

  describe('generate → poll → done', () => {
    beforeEach(async () => {
      vi.useFakeTimers();
      await create();
      vi.spyOn(api, 'get').mockResolvedValue(PROFILE_MOCK);
      vi.spyOn(api, 'listPreviews').mockResolvedValue([]);
      fixture.detectChanges();
      await Promise.resolve();
      await Promise.resolve();
      fixture.detectChanges();
    });

    it('POSTs the selected track and enters the polling state', async () => {
      vi.spyOn(api, 'requestPreview').mockResolvedValue({ jobId: 'job-1' });
      component.selectTrack('angular');
      await component.generatePreview();
      expect(api.requestPreview).toHaveBeenCalledWith('angular');
      expect(component.state()).toBe('polling');
    });

    it('shows "this can take a while" after the slow threshold, without erroring', async () => {
      vi.spyOn(api, 'requestPreview').mockResolvedValue({ jobId: 'job-1' });
      const pendingJob: ProfileJob = { kind: 'preview', status: 'pending' };
      vi.spyOn(api, 'getJob').mockResolvedValue(pendingJob);

      await component.generatePreview();
      expect(component.isSlow()).toBe(false);

      // Advance well past the slow threshold, one poll interval at a time.
      const ticks = Math.ceil(PROFILE_PREVIEW_SLOW_AFTER_MS / PROFILE_PREVIEW_POLL_INTERVAL_MS) + 1;
      for (let i = 0; i < ticks; i++) {
        await vi.advanceTimersByTimeAsync(PROFILE_PREVIEW_POLL_INTERVAL_MS);
      }

      expect(component.state()).toBe('polling');
      expect(component.isSlow()).toBe(true);
      expect(component.errorMessage()).toBeNull();
    });

    it('on done, refreshes the history and returns to a calm state', async () => {
      vi.spyOn(api, 'requestPreview').mockResolvedValue({ jobId: 'job-1' });
      vi.spyOn(api, 'getJob').mockResolvedValue({ kind: 'preview', status: 'done' });
      const reloadSpy = vi.spyOn(component['historyResource'], 'reload');

      await component.generatePreview();
      await vi.advanceTimersByTimeAsync(PROFILE_PREVIEW_POLL_INTERVAL_MS);

      expect(component.state()).toBe('done');
      expect(reloadSpy).toHaveBeenCalled();
    });

    it('on a job error, shows the error message and stops polling', async () => {
      vi.spyOn(api, 'requestPreview').mockResolvedValue({ jobId: 'job-1' });
      vi.spyOn(api, 'getJob').mockResolvedValue({
        kind: 'preview',
        status: 'error',
        error: 'no-vacancy render failed',
      });

      await component.generatePreview();
      await vi.advanceTimersByTimeAsync(PROFILE_PREVIEW_POLL_INTERVAL_MS);

      expect(component.state()).toBe('error');
      expect(component.errorMessage()).toBe('no-vacancy render failed');
    });

    it('a transient poll network failure keeps polling instead of erroring', async () => {
      vi.spyOn(api, 'requestPreview').mockResolvedValue({ jobId: 'job-1' });
      const getJobSpy = vi
        .spyOn(api, 'getJob')
        .mockRejectedValueOnce(new Error('network blip'))
        .mockResolvedValueOnce({ kind: 'preview', status: 'pending' });

      await component.generatePreview();
      await vi.advanceTimersByTimeAsync(PROFILE_PREVIEW_POLL_INTERVAL_MS);
      expect(component.state()).toBe('polling');
      expect(component.errorMessage()).toBeNull();

      await vi.advanceTimersByTimeAsync(PROFILE_PREVIEW_POLL_INTERVAL_MS);
      expect(getJobSpy).toHaveBeenCalledTimes(2);
      expect(component.state()).toBe('polling');
    });
  });

  describe('409 — no stored profile', () => {
    it('shows the "publish your profile first" empty state instead of the generate control', async () => {
      await create();
      vi.spyOn(api, 'get').mockResolvedValue(PROFILE_MOCK);
      vi.spyOn(api, 'listPreviews').mockResolvedValue([]);
      vi.spyOn(api, 'requestPreview').mockRejectedValue(
        new HttpErrorResponse({ status: 409, statusText: 'Conflict' }),
      );
      fixture.detectChanges();
      await fixture.whenStable();
      fixture.detectChanges();

      await component.generatePreview();
      fixture.detectChanges();

      expect(component.needsPublish()).toBe(true);
      expect(fixture.nativeElement.textContent).toContain('Publish your profile first');
      expect(fixture.nativeElement.textContent).not.toContain('Generate preview');
    });
  });

  describe('429 — throttled', () => {
    it('shows a calm retry-later message, not a hard error', async () => {
      await create();
      vi.spyOn(api, 'get').mockResolvedValue(PROFILE_MOCK);
      vi.spyOn(api, 'listPreviews').mockResolvedValue([]);
      vi.spyOn(api, 'requestPreview').mockRejectedValue(
        new HttpErrorResponse({ status: 429, statusText: 'Too Many Requests' }),
      );
      fixture.detectChanges();
      await fixture.whenStable();
      fixture.detectChanges();

      await component.generatePreview();
      fixture.detectChanges();

      expect(component.throttled()).toBe(true);
      expect(component.state()).toBe('idle');
      expect(fixture.nativeElement.textContent).toContain('too quickly');
    });
  });

  describe('history — newest-first', () => {
    it('renders the history in the order the API returns (already newest-first)', async () => {
      await create();
      vi.spyOn(api, 'get').mockResolvedValue(PROFILE_MOCK);
      vi.spyOn(api, 'listPreviews').mockResolvedValue(HISTORY);
      fixture.detectChanges();
      await fixture.whenStable();
      fixture.detectChanges();

      expect(component.history()).toEqual(HISTORY);
      expect(fixture.nativeElement.textContent).toContain('2026-08-30T12-00-00Z');
      expect(fixture.nativeElement.textContent).toContain('preview.pdf');
    });

    it('shows an empty history message when there are no previews yet', async () => {
      await create();
      vi.spyOn(api, 'get').mockResolvedValue(PROFILE_MOCK);
      vi.spyOn(api, 'listPreviews').mockResolvedValue([]);
      fixture.detectChanges();
      await fixture.whenStable();
      fixture.detectChanges();
      expect(fixture.nativeElement.textContent).toContain('No previews yet');
    });
  });

  describe('downloadPreviewFile()', () => {
    it('fetches a download token and opens the file URL with ?dt=', async () => {
      await create();
      vi.spyOn(api, 'get').mockResolvedValue(PROFILE_MOCK);
      vi.spyOn(api, 'listPreviews').mockResolvedValue(HISTORY);
      const authService = TestBed.inject(AuthService);
      vi.spyOn(authService, 'getDownloadToken').mockResolvedValue('preview-token');
      const openFn = vi.fn();
      vi.stubGlobal('open', openFn);

      fixture.detectChanges();
      await fixture.whenStable();

      await component.downloadPreviewFile('angular', '2026-08-30T12-00-00Z', 'preview.pdf');

      expect(openFn).toHaveBeenCalledWith(
        expect.stringContaining('dt=preview-token'),
        '_blank',
        'noopener',
      );
      vi.unstubAllGlobals();
    });
  });
});
