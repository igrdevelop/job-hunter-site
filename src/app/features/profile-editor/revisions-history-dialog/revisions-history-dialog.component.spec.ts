import { ComponentFixture, TestBed } from '@angular/core/testing';
import { HttpErrorResponse, provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting } from '@angular/common/http/testing';
import { MAT_DIALOG_DATA, MatDialogRef } from '@angular/material/dialog';
import { provideAnimationsAsync } from '@angular/platform-browser/animations/async';
import { vi } from 'vitest';
import { RevisionsHistoryDialogComponent } from './revisions-history-dialog.component';
import { ProfileApi } from '../../../core/api/profile.api';
import { ProfileRevision } from '../../../core/api/models';

describe('RevisionsHistoryDialogComponent', () => {
  let fixture: ComponentFixture<RevisionsHistoryDialogComponent>;
  let component: RevisionsHistoryDialogComponent;
  let api: ProfileApi;
  let dialogRef: { close: ReturnType<typeof vi.fn> };

  const REVISIONS: ProfileRevision[] = [
    { rev: 3, createdAt: '2026-08-30T12:00:00Z' },
    { rev: 2, createdAt: '2026-08-29T12:00:00Z' },
  ];

  async function createWith(
    getRevisionsImpl: () => Promise<ProfileRevision[]>,
    hasUnsavedEdits = false,
  ): Promise<void> {
    dialogRef = { close: vi.fn() };
    await TestBed.configureTestingModule({
      imports: [RevisionsHistoryDialogComponent],
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        provideAnimationsAsync(),
        { provide: MatDialogRef, useValue: dialogRef },
        { provide: MAT_DIALOG_DATA, useValue: { hasUnsavedEdits } },
      ],
    }).compileComponents();

    api = TestBed.inject(ProfileApi);
    vi.spyOn(api, 'getRevisions').mockImplementation(getRevisionsImpl);

    fixture = TestBed.createComponent(RevisionsHistoryDialogComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
  }

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it('loads and exposes the revisions as returned by the API', async () => {
    await createWith(() => Promise.resolve(REVISIONS));
    expect(component.revisions()).toEqual(REVISIONS);
  });

  it('renders one row per revision with a formatted date', async () => {
    await createWith(() => Promise.resolve(REVISIONS));
    const rows = fixture.nativeElement.querySelectorAll('.revision-row');
    expect(rows.length).toBe(2);
    expect((rows[0] as HTMLElement).textContent).toContain('Revision 3');
  });

  it('shows a not-available hint on 404, distinct from a generic error', async () => {
    await createWith(() => Promise.reject(new HttpErrorResponse({ status: 404 })));
    expect(component.notAvailable()).toBe(true);
    expect(component.errorMessage()).toBeNull();
    expect(fixture.nativeElement.textContent).toContain("isn't available yet");
  });

  it('shows a generic error on a non-404 failure', async () => {
    await createWith(() => Promise.reject(new HttpErrorResponse({ status: 500 })));
    expect(component.notAvailable()).toBe(false);
    expect(component.errorMessage()).toContain('Could not load');
  });

  it('restore() does nothing if the user cancels the confirmation', async () => {
    await createWith(() => Promise.resolve(REVISIONS));
    vi.stubGlobal('confirm', () => false);
    const restoreSpy = vi.spyOn(api, 'restoreRevision');

    await component.restore(2);

    expect(restoreSpy).not.toHaveBeenCalled();
    expect(dialogRef.close).not.toHaveBeenCalled();
  });

  it('restore() calls restoreRevision and closes with true on success', async () => {
    await createWith(() => Promise.resolve(REVISIONS));
    vi.stubGlobal('confirm', () => true);
    const restoreSpy = vi
      .spyOn(api, 'restoreRevision')
      .mockResolvedValue({ revision: 4, renderJobId: 'job-2' });

    await component.restore(2);

    expect(restoreSpy).toHaveBeenCalledWith(2);
    expect(dialogRef.close).toHaveBeenCalledWith(true);
  });

  it('restore() shows an error and does not close on failure', async () => {
    await createWith(() => Promise.resolve(REVISIONS));
    vi.stubGlobal('confirm', () => true);
    vi.spyOn(api, 'restoreRevision').mockRejectedValue(new Error('fail'));

    await component.restore(2);

    expect(component.restoreError()).toContain('Could not restore');
    expect(dialogRef.close).not.toHaveBeenCalled();
  });

  it('close() closes with false', async () => {
    await createWith(() => Promise.resolve(REVISIONS));
    component.close();
    expect(dialogRef.close).toHaveBeenCalledWith(false);
  });

  it('shows no unsaved-edits warning when the caller has nothing unsaved', async () => {
    await createWith(() => Promise.resolve(REVISIONS), false);
    expect(fixture.nativeElement.querySelector('.warning')).toBeNull();
  });

  it('warns about unsaved edits, both in the banner and the confirm prompt, when the caller is dirty', async () => {
    await createWith(() => Promise.resolve(REVISIONS), true);
    expect(fixture.nativeElement.querySelector('.warning')?.textContent).toContain('unsaved edits');

    const confirmSpy = vi.fn(() => true);
    vi.stubGlobal('confirm', confirmSpy);
    vi.spyOn(api, 'restoreRevision').mockResolvedValue({ revision: 4, renderJobId: null });

    await component.restore(2);

    expect(confirmSpy).toHaveBeenCalledWith(expect.stringContaining('unsaved edits'));
  });
});
