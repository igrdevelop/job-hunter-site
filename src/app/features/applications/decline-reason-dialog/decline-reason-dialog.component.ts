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
      :host {
        display: block;
        width: min(600px, 90vw);
      }
      /* Two columns so all 14–16 reasons and the comment fit without scrolling. */
      .reason-list {
        display: grid;
        grid-template-columns: repeat(2, minmax(0, 1fr));
        column-gap: 16px;
        margin: 4px 0 12px;
      }
      @media (max-width: 600px) {
        .reason-list {
          grid-template-columns: 1fr;
        }
      }
      .reason-option {
        font-size: 13px;
        --mat-radio-touch-target-size: 32px;
        --mat-radio-state-layer-size: 32px;
      }
      /* Material's form-field font token is bare 'Barlow' (no fallback); the
         self-hosted Barlow has no Cyrillic, so Russian comments rendered in a
         serif default. --font-body carries the sans-serif fallbacks. */
      .comment-field {
        width: 100%;
        --mat-form-field-container-text-font: var(--font-body);
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

  // Pre-fill only if the existing reason is actually valid for THIS status —
  // switching a row from Skipped to Filter miss (or vice versa) via the My
  // Status menu passes the row's old ownerReason through unchanged, and a
  // handful of codes (e.g. 'salary') are Skipped-only. Without this guard,
  // no radio would show as selected yet Save would stay enabled (reason is
  // still truthy), and the PATCH would 400.
  reason = this.reasons.some((r) => r.code === this.data.reason) ? this.data.reason : '';
  note = this.data.note;

  save(): void {
    if (!this.reason) return;
    this.dialogRef.close({ reason: this.reason, note: this.note.trim() });
  }

  cancel(): void {
    this.dialogRef.close(undefined);
  }
}
