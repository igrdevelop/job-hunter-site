import { ChangeDetectionStrategy, Component, computed, inject, resource, signal } from '@angular/core';
import { HttpErrorResponse } from '@angular/common/http';
import { MatButtonModule } from '@angular/material/button';
import { MatDialogModule, MatDialogRef } from '@angular/material/dialog';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { ProfileApi } from '../../../core/api/profile.api';

/**
 * Undo-after-bad-merge is the only reason this exists — keep it boring
 * (docs/RESUME_PROFILE_STORE.md, F6). Closes with `true` once a restore
 * succeeds so the caller knows to reload the document; `false`/undefined
 * on a plain Close/backdrop dismiss.
 */
@Component({
  selector: 'app-revisions-history-dialog',
  imports: [MatDialogModule, MatButtonModule, MatProgressSpinnerModule],
  template: `
    <h2 mat-dialog-title>History</h2>
    <mat-dialog-content>
      <div class="history-body">
        @if (loading()) {
          <mat-spinner diameter="24"></mat-spinner>
        }
        @if (notAvailable()) {
          <p class="hint">History isn't available yet — the API doesn't support this yet.</p>
        }
        @if (errorMessage()) {
          <p class="error">{{ errorMessage() }}</p>
        }
        @if (restoreError()) {
          <p class="error">{{ restoreError() }}</p>
        }
        @if (!loading() && !notAvailable() && !errorMessage() && revisions().length === 0) {
          <p class="empty-state">No revisions yet.</p>
        }
        <ul class="revisions-list">
          @for (rev of revisions(); track rev.rev) {
            <li class="revision-row">
              <span>Revision {{ rev.rev }} — {{ formatDate(rev.createdAt) }}</span>
              <button
                mat-stroked-button
                type="button"
                [disabled]="restoring() !== null"
                (click)="restore(rev.rev)"
              >
                {{ restoring() === rev.rev ? 'Restoring…' : 'Restore' }}
              </button>
            </li>
          }
        </ul>
      </div>
    </mat-dialog-content>
    <mat-dialog-actions align="end">
      <button mat-button type="button" (click)="close()">Close</button>
    </mat-dialog-actions>
  `,
  styles: [
    `
      .history-body {
        display: flex;
        flex-direction: column;
        gap: 8px;
        min-width: min(420px, 80vw);
        padding-top: 8px;
      }
      .revisions-list {
        list-style: none;
        margin: 0;
        padding: 0;
        display: flex;
        flex-direction: column;
        gap: 8px;
      }
      .revision-row {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 12px;
        padding: 8px 0;
        border-bottom: 1px solid var(--color-neutral-200);
      }
      .revision-row:last-child {
        border-bottom: none;
      }
      .hint {
        margin: 0;
        font-size: 13px;
        color: var(--color-neutral-600);
      }
      .error {
        color: var(--color-error);
        margin: 0;
      }
      .empty-state {
        color: var(--color-neutral-600);
        margin: 0;
      }
    `,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class RevisionsHistoryDialogComponent {
  private readonly api = inject(ProfileApi);
  private readonly dialogRef = inject(MatDialogRef<RevisionsHistoryDialogComponent, boolean>);

  private readonly revisionsResource = resource({
    loader: () => this.api.getRevisions(),
  });

  readonly loading = this.revisionsResource.isLoading;
  readonly revisions = computed(() =>
    this.revisionsResource.hasValue() ? this.revisionsResource.value() : [],
  );

  readonly notAvailable = computed(() => {
    const err = this.revisionsResource.error();
    return err instanceof HttpErrorResponse && err.status === 404;
  });
  readonly errorMessage = computed(() => {
    if (this.notAvailable()) return null;
    return this.revisionsResource.error() ? 'Could not load revision history.' : null;
  });

  readonly restoring = signal<number | null>(null);
  readonly restoreError = signal<string | null>(null);

  formatDate(iso: string): string {
    const date = new Date(iso);
    return Number.isNaN(date.getTime()) ? iso : date.toLocaleString();
  }

  async restore(rev: number): Promise<void> {
    const ok = confirm(`Restore revision ${rev}? This replaces your current draft with that saved version.`);
    if (!ok) return;
    this.restoring.set(rev);
    this.restoreError.set(null);
    try {
      await this.api.restoreRevision(rev);
      this.dialogRef.close(true);
    } catch {
      this.restoreError.set('Could not restore this revision. Please try again.');
    } finally {
      this.restoring.set(null);
    }
  }

  close(): void {
    this.dialogRef.close(false);
  }
}
