import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting } from '@angular/common/http/testing';
import { MatDialogRef } from '@angular/material/dialog';
import { provideAnimationsAsync } from '@angular/platform-browser/animations/async';
import { vi } from 'vitest';
import {
  PROFILE_UPLOAD_POLL_INTERVAL_MS,
  UploadResumeDialogComponent,
} from './upload-resume-dialog.component';
import { ProfileApi } from '../../../core/api/profile.api';
import { PROFILE_MOCK } from '../mock/profile.mock';

describe('UploadResumeDialogComponent', () => {
  let fixture: ComponentFixture<UploadResumeDialogComponent>;
  let component: UploadResumeDialogComponent;
  let api: ProfileApi;
  let dialogRef: { close: ReturnType<typeof vi.fn> };

  function pdfFile(name = 'resume.pdf', size = 1024): File {
    const file = new File([new Uint8Array(size)], name, { type: 'application/pdf' });
    return file;
  }

  function selectFile(file: File): void {
    const input = document.createElement('input');
    input.type = 'file';
    Object.defineProperty(input, 'files', { value: [file] });
    component.onFileSelected({ target: input } as unknown as Event);
  }

  beforeEach(async () => {
    dialogRef = { close: vi.fn() };
    await TestBed.configureTestingModule({
      imports: [UploadResumeDialogComponent],
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        provideAnimationsAsync(),
        { provide: MatDialogRef, useValue: dialogRef },
      ],
    }).compileComponents();

    api = TestBed.inject(ProfileApi);
    fixture = TestBed.createComponent(UploadResumeDialogComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.useRealTimers();
  });

  it('rejects an unsupported file extension', () => {
    selectFile(pdfFile('resume.exe'));
    expect(component.errorMessage()).toContain('Unsupported file type');
    expect(component.selectedFile()).toBeNull();
  });

  it('rejects a file over the 10 MB limit', () => {
    selectFile(pdfFile('resume.pdf', 11 * 1024 * 1024));
    expect(component.errorMessage()).toContain('too large');
    expect(component.selectedFile()).toBeNull();
  });

  it('accepts a valid file', () => {
    selectFile(pdfFile());
    expect(component.selectedFile()?.name).toBe('resume.pdf');
    expect(component.errorMessage()).toBeNull();
  });

  it('submit() uploads then polls until done, closing the dialog with the parsed draft', async () => {
    vi.useFakeTimers();
    selectFile(pdfFile());
    vi.spyOn(api, 'upload').mockResolvedValue({ jobId: 'job-1' });
    vi.spyOn(api, 'getJob').mockResolvedValue({
      kind: 'parse',
      status: 'done',
      result: PROFILE_MOCK.profile,
    });

    await component.submit();
    expect(component.state()).toBe('polling');

    await vi.advanceTimersByTimeAsync(PROFILE_UPLOAD_POLL_INTERVAL_MS);

    expect(dialogRef.close).toHaveBeenCalledWith(PROFILE_MOCK.profile);
  });

  it('keeps polling while the job is pending, then closes once it flips to done', async () => {
    vi.useFakeTimers();
    selectFile(pdfFile());
    vi.spyOn(api, 'upload').mockResolvedValue({ jobId: 'job-1' });
    const getJob = vi
      .spyOn(api, 'getJob')
      .mockResolvedValueOnce({ kind: 'parse', status: 'pending' })
      .mockResolvedValueOnce({ kind: 'parse', status: 'running' })
      .mockResolvedValueOnce({ kind: 'parse', status: 'done', result: PROFILE_MOCK.profile });

    await component.submit();
    await vi.advanceTimersByTimeAsync(PROFILE_UPLOAD_POLL_INTERVAL_MS);
    expect(component.state()).toBe('polling');
    await vi.advanceTimersByTimeAsync(PROFILE_UPLOAD_POLL_INTERVAL_MS);
    expect(component.state()).toBe('polling');
    await vi.advanceTimersByTimeAsync(PROFILE_UPLOAD_POLL_INTERVAL_MS);

    expect(getJob).toHaveBeenCalledTimes(3);
    expect(dialogRef.close).toHaveBeenCalledWith(PROFILE_MOCK.profile);
  });

  it('shows an error and does not close the dialog when upload fails', async () => {
    selectFile(pdfFile());
    vi.spyOn(api, 'upload').mockRejectedValue(new Error('network down'));

    await component.submit();

    expect(component.state()).toBe('error');
    expect(component.errorMessage()).toContain('Could not upload');
    expect(dialogRef.close).not.toHaveBeenCalled();
  });

  it('shows an error when the job itself reports status "error"', async () => {
    vi.useFakeTimers();
    selectFile(pdfFile());
    vi.spyOn(api, 'upload').mockResolvedValue({ jobId: 'job-1' });
    vi.spyOn(api, 'getJob').mockResolvedValue({
      kind: 'parse',
      status: 'error',
      error: 'Could not read this file.',
    });

    await component.submit();
    await vi.advanceTimersByTimeAsync(PROFILE_UPLOAD_POLL_INTERVAL_MS);

    expect(component.state()).toBe('error');
    expect(component.errorMessage()).toBe('Could not read this file.');
    expect(dialogRef.close).not.toHaveBeenCalled();
  });

  it('shows an error instead of closing silently when a "done" job carries no result', async () => {
    vi.useFakeTimers();
    selectFile(pdfFile());
    vi.spyOn(api, 'upload').mockResolvedValue({ jobId: 'job-1' });
    vi.spyOn(api, 'getJob').mockResolvedValue({ kind: 'parse', status: 'done' });

    await component.submit();
    await vi.advanceTimersByTimeAsync(PROFILE_UPLOAD_POLL_INTERVAL_MS);

    expect(component.state()).toBe('error');
    expect(component.errorMessage()).toContain('returned no data');
    expect(dialogRef.close).not.toHaveBeenCalled();
  });

  it('a poll network error surfaces a retry-able error state without closing', async () => {
    vi.useFakeTimers();
    selectFile(pdfFile());
    vi.spyOn(api, 'upload').mockResolvedValue({ jobId: 'job-1' });
    vi.spyOn(api, 'getJob').mockRejectedValue(new Error('network down'));

    await component.submit();
    await vi.advanceTimersByTimeAsync(PROFILE_UPLOAD_POLL_INTERVAL_MS);

    expect(component.state()).toBe('error');
    expect(component.errorMessage()).toContain('Could not check parse status');
    expect(dialogRef.close).not.toHaveBeenCalled();
  });

  it('retry() re-polls the existing job without re-uploading the file', async () => {
    vi.useFakeTimers();
    selectFile(pdfFile());
    const upload = vi.spyOn(api, 'upload').mockResolvedValue({ jobId: 'job-1' });
    const getJob = vi.spyOn(api, 'getJob').mockRejectedValueOnce(new Error('network down'));

    await component.submit();
    await vi.advanceTimersByTimeAsync(PROFILE_UPLOAD_POLL_INTERVAL_MS);
    expect(component.state()).toBe('error');

    getJob.mockResolvedValueOnce({ kind: 'parse', status: 'done', result: PROFILE_MOCK.profile });
    await component.retry();

    expect(upload).toHaveBeenCalledTimes(1);
    expect(dialogRef.close).toHaveBeenCalledWith(PROFILE_MOCK.profile);
  });

  it('retry() restarts the upload when it never produced a job id', async () => {
    selectFile(pdfFile());
    const upload = vi
      .spyOn(api, 'upload')
      .mockRejectedValueOnce(new Error('network down'))
      .mockResolvedValueOnce({ jobId: 'job-1' });
    vi.spyOn(api, 'getJob').mockResolvedValue({
      kind: 'parse',
      status: 'done',
      result: PROFILE_MOCK.profile,
    });

    await component.submit();
    expect(component.state()).toBe('error');

    vi.useFakeTimers();
    await component.retry();
    await vi.advanceTimersByTimeAsync(PROFILE_UPLOAD_POLL_INTERVAL_MS);

    expect(upload).toHaveBeenCalledTimes(2);
    expect(dialogRef.close).toHaveBeenCalledWith(PROFILE_MOCK.profile);
  });

  it('cancel() closes the dialog without a result', () => {
    component.cancel();
    expect(dialogRef.close).toHaveBeenCalledWith(undefined);
  });
});
