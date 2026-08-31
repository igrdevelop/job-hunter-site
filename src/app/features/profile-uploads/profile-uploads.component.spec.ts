import { ComponentFixture, TestBed } from '@angular/core/testing';
import { HttpErrorResponse, provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting } from '@angular/common/http/testing';
import { provideAnimationsAsync } from '@angular/platform-browser/animations/async';
import { MatDialog, MatDialogRef } from '@angular/material/dialog';
import { of } from 'rxjs';
import { vi } from 'vitest';
import { ProfileUploadsComponent } from './profile-uploads.component';
import { ProfileApi } from '../../core/api/profile.api';
import { ProfileDraftBridgeService } from '../profile-editor/profile-draft-bridge.service';
import { ProfileUploadListEntry } from '../../core/api/models';
import { PROFILE_MOCK } from '../profile-editor/mock/profile.mock';

const UPLOADS: ProfileUploadListEntry[] = [
  { id: 'u1', filename: 'resume.pdf', sha256: 'a', uploadedAt: '2026-08-30T12:00:00Z', jobId: 'j1', jobStatus: 'done' },
  { id: 'u2', filename: 'old.docx', sha256: 'b', uploadedAt: '2026-08-20T12:00:00Z', jobId: 'j2', jobStatus: 'error' },
];

describe('ProfileUploadsComponent', () => {
  let fixture: ComponentFixture<ProfileUploadsComponent>;
  let component: ProfileUploadsComponent;
  let api: ProfileApi;

  async function create(): Promise<void> {
    await TestBed.configureTestingModule({
      imports: [ProfileUploadsComponent],
      providers: [provideHttpClient(), provideHttpClientTesting(), provideAnimationsAsync()],
    }).compileComponents();
    api = TestBed.inject(ProfileApi);
    fixture = TestBed.createComponent(ProfileUploadsComponent);
    component = fixture.componentInstance;
  }

  afterEach(() => vi.restoreAllMocks());

  describe('with uploads available', () => {
    beforeEach(async () => {
      await create();
      vi.spyOn(api, 'listUploads').mockResolvedValue(UPLOADS);
      fixture.detectChanges();
      await fixture.whenStable();
      fixture.detectChanges();
    });

    it('renders each upload with its status label', () => {
      expect(component.uploads()).toEqual(UPLOADS);
      const text = fixture.nativeElement.textContent as string;
      expect(text).toContain('resume.pdf');
      expect(text).toContain('Done');
      expect(text).toContain('old.docx');
    });

    it('marks an error status as terminal with retry copy', () => {
      expect(component.statusLabel('error')).toContain('re-upload to retry');
      expect(component.isTerminalError('error')).toBe(true);
      expect(component.isTerminalError('done')).toBe(false);
    });

    it('is not "unavailable" when the list loads normally', () => {
      expect(component.unavailable()).toBe(false);
    });
  });

  describe('when GET /api/profile/uploads 404s (api T2 not deployed)', () => {
    beforeEach(async () => {
      await create();
      vi.spyOn(api, 'listUploads').mockRejectedValue(
        new HttpErrorResponse({ status: 404, statusText: 'Not Found' }),
      );
      vi.spyOn(console, 'warn').mockImplementation(() => undefined);
      fixture.detectChanges();
      await fixture.whenStable();
      fixture.detectChanges();
    });

    it('shows a calm unavailable state instead of an error', () => {
      expect(component.unavailable()).toBe(true);
      expect(component.errorMessage()).toBeNull();
      expect(fixture.nativeElement.textContent).toContain("isn't available yet");
    });

    it('logs a console.warn (no fabricated rows)', () => {
      expect(console.warn).toHaveBeenCalledWith(expect.stringContaining('/api/profile/uploads'));
      expect(component.uploads()).toEqual([]);
    });

    it('still lets the user upload a resume (the POST endpoint already exists)', () => {
      const button = fixture.nativeElement.querySelector('button');
      expect(button?.textContent).toContain('Upload resume');
      expect(button?.disabled).toBeFalsy();
    });
  });

  describe('when GET /api/profile/uploads fails with a real error', () => {
    beforeEach(async () => {
      await create();
      vi.spyOn(api, 'listUploads').mockRejectedValue(
        new HttpErrorResponse({ status: 500, statusText: 'Server Error' }),
      );
      fixture.detectChanges();
      await fixture.whenStable();
      fixture.detectChanges();
    });

    it('shows a generic error message, not the 404 empty state', () => {
      expect(component.unavailable()).toBe(false);
      expect(component.errorMessage()).toContain('Could not load');
    });
  });

  describe('upload dialog flow', () => {
    beforeEach(async () => {
      await create();
      vi.spyOn(api, 'listUploads').mockResolvedValue([]);
      fixture.detectChanges();
      await fixture.whenStable();
      fixture.detectChanges();
    });

    it('on a completed parse, submits the draft to the bridge, reloads the list, and emits completed', () => {
      const dialog = TestBed.inject(MatDialog);
      const bridge = TestBed.inject(ProfileDraftBridgeService);
      const reloadSpy = vi.spyOn(component['uploadsResource'], 'reload');
      const completedSpy = vi.fn();
      component.completed.subscribe(completedSpy);

      const fakeRef = { afterClosed: () => of(PROFILE_MOCK.profile) } as MatDialogRef<unknown, unknown>;
      vi.spyOn(dialog, 'open').mockReturnValue(fakeRef);

      component.openUploadDialog();

      expect(bridge.pending()).toBe(PROFILE_MOCK.profile);
      expect(reloadSpy).toHaveBeenCalled();
      expect(completedSpy).toHaveBeenCalled();
    });

    it('does nothing when the dialog is dismissed without a result', () => {
      const dialog = TestBed.inject(MatDialog);
      const bridge = TestBed.inject(ProfileDraftBridgeService);
      const completedSpy = vi.fn();
      component.completed.subscribe(completedSpy);

      const fakeRef = { afterClosed: () => of(undefined) } as MatDialogRef<unknown, unknown>;
      vi.spyOn(dialog, 'open').mockReturnValue(fakeRef);

      component.openUploadDialog();

      expect(bridge.pending()).toBeNull();
      expect(completedSpy).not.toHaveBeenCalled();
    });
  });
});
