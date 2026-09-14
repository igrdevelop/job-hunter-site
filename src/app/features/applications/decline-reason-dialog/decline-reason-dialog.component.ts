import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MAT_DIALOG_DATA, MatDialogModule, MatDialogRef } from '@angular/material/dialog';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatRadioModule } from '@angular/material/radio';
import { DeclineStatus, OwnerReason, ownerReasonsForStatus } from '../../../core/api/models';

export interface DeclineReasonDialogData {
  status: DeclineStatus;
  /** Existing reason code when editing an already-declined row; '' for a fresh pick. */
  reason: string;
  /** Existing free-text comment when editing; '' for a fresh pick. */
  note: string;
}

export interface DeclineReasonDialogResult {
  reason: string;
  note: string;
}

const MAX_NOTE_LENGTH = 500;

/**
 * "Why skipped?" / "Which filter should have caught it?" dialog, modeled on
 * NewApplicationDialogComponent and AddVariantDialogComponent: a reason list
 * filtered by status plus an optional comment. Cancel/Esc/backdrop resolve
 * `afterClosed()` with `undefined` (MatDialog's default when `close()` was
 * never called) — the caller must treat that as "no change at all", not even
 * to the status.
 */
@Component({
  selector: 'app-decline-reason-dialog',
  imports: [
    FormsModule,
    MatDialogModule,
    MatButtonModule,
    MatFormFieldModule,
    MatInputModule,
    MatRadioModule,
  ],
  template: `
    <h2 mat-dialog-title>{{ title }}</h2>
    <mat-dialog-content>
      <mat-radio-group class="reason-list" [(ngModel)]="reason" aria-label="Reason">
        @for (r of reasons; track r.code) {
          <mat-radio-button class="reason-option" [value]="r.code">{{ r.label }}</mat-radio-button>
        }
      </mat-radio-group>

      <mat-form-field appearance="outline" class="comment-field">
        <mat-label>Comment (optional)</mat-label>
        <textarea
          matInput
          rows="3"
          [(ngModel)]="note"
          [maxlength]="maxNoteLength"
          placeholder="Any extra detail…"
        ></textarea>
        <mat-hint align="end">{{ note.length }}/{{ maxNoteLength }}</mat-hint>
      </mat-form-field>
    </mat-dialog-content>
    <mat-dialog-actions align="end">
      <button mat-button type="button" (click)="cancel()">Cancel</button>
      <button mat-flat-button color="primary" type="button" [disabled]="!reason" (click)="save()">
        Save
      </button>
    </mat-dialog-actions>
  `,
  styles: [
    `
      .reason-list {
        display: flex;
        flex-direction: column;
        gap: 6px;
        min-width: min(360px, 80vw);
        margin: 8px 0 16px;
      }
      .reason-option {
        font-size: 13px;
      }
      .comment-field {
        width: 100%;
      }
    `,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class DeclineReasonDialogComponent {
  private readonly dialogRef = inject(
    MatDialogRef<DeclineReasonDialogComponent, DeclineReasonDialogResult | undefined>,
  );
  readonly data = inject<DeclineReasonDialogData>(MAT_DIALOG_DATA);

  readonly maxNoteLength = MAX_NOTE_LENGTH;
  readonly reasons: OwnerReason[] = ownerReasonsForStatus(this.data.status);
  readonly title = this.data.status === 'Skipped' ? 'Why skipped?' : 'Which filter should have caught it?';

  reason = this.data.reason;
  note = this.data.note;

  save(): void {
    if (!this.reason) return;
    this.dialogRef.close({ reason: this.reason, note: this.note.trim() });
  }

  cancel(): void {
    this.dialogRef.close(undefined);
  }
}
