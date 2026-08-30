import { ChangeDetectionStrategy, Component, DestroyRef, inject, signal } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatDialogModule, MatDialogRef } from '@angular/material/dialog';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { ProfileApi } from '../../../core/api/profile.api';
import { ProfileDocument } from '../../../core/api/models';

const ALLOWED_EXTENSIONS = ['docx', 'pdf', 'txt', 'md'];
const MAX_FILE_SIZE = 10 * 1024 * 1024;

/** Exported so specs can drive the state machine with `vi.useFakeTimers()` without magic numbers. */
export const PROFILE_UPLOAD_POLL_INTERVAL_MS = 2000;
export const PROFILE_UPLOAD_POLL_TIMEOUT_MS = 60000;

type UploadState = 'idle' | 'uploading' | 'polling' | 'error' | 'done';

@Component({
  selector: 'app-upload-resume-dialog',
  imports: [MatDialogModule, MatButtonModule, MatProgressSpinnerModule],
  template: `
    <h2 mat-dialog-title>Upload your resume</h2>
    <mat-dialog-content>
      <div class="upload-body">
        @if (state() === 'idle') {
          <div
            class="drop-zone"
            [class.has-file]="!!selectedFile()"
            (dragover)="onDragOver($event)"
            (drop)="onDrop($event)"
          >
            <input
              #fileInput
              type="file"
              class="file-input"
              accept=".docx,.pdf,.txt,.md"
              (change)="onFileSelected($event)"
            />
            @if (selectedFile(); as file) {
              <p class="file-name">{{ file.name }}</p>
              <button mat-button type="button" (click)="fileInput.click()">Change file</button>
            } @else {
              <p>Drag &amp; drop your resume here, or</p>
              <button mat-stroked-button type="button" (click)="fileInput.click()">Choose file</button>
              <p class="hint">.docx, .pdf, .txt, or .md — up to 10 MB.</p>
            }
          </div>
        }

        @if (state() === 'uploading') {
          <div class="progress">
            <mat-spinner diameter="24"></mat-spinner>
            <p>Uploading…</p>
          </div>
        }

        @if (state() === 'polling') {
          <div class="progress">
            <mat-spinner diameter="24"></mat-spinner>
            <p>Parsing your resume — this can take up to a minute…</p>
          </div>
        }

        @if (errorMessage()) {
          <p class="error">{{ errorMessage() }}</p>
        }
      </div>
    </mat-dialog-content>
    <mat-dialog-actions align="end">
      @if (state() === 'error') {
        <button mat-button type="button" (click)="cancel()">Cancel</button>
        <button mat-flat-button color="primary" type="button" (click)="retry()">Retry</button>
      } @else {
        <button
          mat-button
          type="button"
          [disabled]="state() === 'uploading' || state() === 'polling'"
          (click)="cancel()"
        >
          Cancel
        </button>
        <button
          mat-flat-button
          color="primary"
          type="button"
          [disabled]="!selectedFile() || state() === 'uploading' || state() === 'polling'"
          (click)="submit()"
        >
          Upload
        </button>
      }
    </mat-dialog-actions>
  `,
  styles: [
    `
      .upload-body {
        display: flex;
        flex-direction: column;
        gap: 8px;
        min-width: min(420px, 80vw);
        padding-top: 8px;
      }
      .drop-zone {
        border: 2px dashed var(--color-neutral-400);
        padding: 24px;
        text-align: center;
        background: var(--color-neutral-050);
      }
      .drop-zone.has-file {
        border-color: var(--color-accent-500);
        background: var(--color-accent-100);
      }
      .file-input {
        display: none;
      }
      .file-name {
        font-weight: 500;
        word-break: break-all;
      }
      .hint {
        margin: 8px 0 0;
        font-size: 12px;
        color: var(--color-neutral-600);
      }
      .progress {
        display: flex;
        align-items: center;
        gap: 12px;
        padding: 16px 0;
      }
      .progress p {
        margin: 0;
      }
      .error {
        color: var(--color-error);
        margin: 0;
      }
    `,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class UploadResumeDialogComponent {
  private readonly api = inject(ProfileApi);
  private readonly dialogRef = inject(MatDialogRef<UploadResumeDialogComponent, ProfileDocument | undefined>);
  private readonly destroyRef = inject(DestroyRef);

  readonly state = signal<UploadState>('idle');
  readonly selectedFile = signal<File | null>(null);
  readonly errorMessage = signal<string | null>(null);

  private jobId: string | null = null;
  private pollAttempts = 0;
  private pollTimer: ReturnType<typeof setTimeout> | null = null;
  private readonly maxPollAttempts = Math.ceil(
    PROFILE_UPLOAD_POLL_TIMEOUT_MS / PROFILE_UPLOAD_POLL_INTERVAL_MS,
  );

  constructor() {
    this.destroyRef.onDestroy(() => this.clearPollTimer());
  }

  onDragOver(event: DragEvent): void {
    event.preventDefault();
  }

  onDrop(event: DragEvent): void {
    event.preventDefault();
    const file = event.dataTransfer?.files?.[0];
    if (file) this.setFile(file);
  }

  onFileSelected(event: Event): void {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    if (file) this.setFile(file);
  }

  private setFile(file: File): void {
    const ext = file.name.split('.').pop()?.toLowerCase() ?? '';
    if (!ALLOWED_EXTENSIONS.includes(ext)) {
      this.errorMessage.set('Unsupported file type — use .docx, .pdf, .txt, or .md.');
      return;
    }
    if (file.size > MAX_FILE_SIZE) {
      this.errorMessage.set('File is too large — the limit is 10 MB.');
      return;
    }
    this.errorMessage.set(null);
    this.selectedFile.set(file);
  }

  async submit(): Promise<void> {
    const file = this.selectedFile();
    if (!file || this.state() === 'uploading' || this.state() === 'polling') return;
    this.state.set('uploading');
    this.errorMessage.set(null);
    try {
      const { jobId } = await this.api.upload(file);
      this.jobId = jobId;
      this.pollAttempts = 0;
      this.state.set('polling');
      this.schedulePoll();
    } catch {
      this.state.set('error');
      this.errorMessage.set('Could not upload the file. Please try again.');
    }
  }

  /** Resumes polling an existing job, or restarts the upload if it never got that far. */
  retry(): Promise<void> {
    if (this.jobId) {
      this.pollAttempts = 0;
      this.state.set('polling');
      return this.pollOnce();
    }
    return this.submit();
  }

  cancel(): void {
    this.clearPollTimer();
    this.dialogRef.close(undefined);
  }

  private schedulePoll(): void {
    this.clearPollTimer();
    this.pollTimer = setTimeout(() => void this.pollOnce(), PROFILE_UPLOAD_POLL_INTERVAL_MS);
  }

  private clearPollTimer(): void {
    if (this.pollTimer !== null) {
      clearTimeout(this.pollTimer);
      this.pollTimer = null;
    }
  }

  private async pollOnce(): Promise<void> {
    const jobId = this.jobId;
    if (!jobId) return;
    this.pollAttempts++;
    try {
      const job = await this.api.getJob(jobId);
      if (job.status === 'done') {
        if (!job.result) {
          // A malformed "done" (no draft) is not a cancel — say so instead of
          // closing the dialog silently as if nothing happened.
          this.state.set('error');
          this.errorMessage.set('The parse finished but returned no data. Please try again.');
          return;
        }
        this.state.set('done');
        this.dialogRef.close(job.result);
        return;
      }
      if (job.status === 'error') {
        this.state.set('error');
        this.errorMessage.set(job.error || 'Parsing failed — please try a different file.');
        return;
      }
      if (this.pollAttempts >= this.maxPollAttempts) {
        this.state.set('error');
        this.errorMessage.set('Parsing is taking longer than expected.');
        return;
      }
      this.schedulePoll();
    } catch {
      this.state.set('error');
      this.errorMessage.set('Could not check parse status.');
    }
  }
}
