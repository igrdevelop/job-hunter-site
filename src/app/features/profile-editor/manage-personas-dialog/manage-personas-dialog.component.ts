import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MAT_DIALOG_DATA, MatDialogModule, MatDialogRef } from '@angular/material/dialog';

export interface ManagePersonasDialogData {
  /** The profile's current variant track keys (docs/PROFILE_PAGE_TABS.md UI feedback
   * amendments 2026-08-31: "Manage personas…" replaces the old inline chip × delete). */
  tracks: string[];
}

/** Same stale-base-CV warning the old inline chip delete used — the underlying
 * bot-side consequence of deleting a persona hasn't changed, only where the UI
 * exposes the action. */
function deleteWarning(track: string): string {
  return (
    `Delete the "${track}" persona? The next publish removes its rendered base_cv_${track}.md ` +
    `file. This is a view/edit context only — it does not change what the bot generates for ` +
    `individual vacancies.`
  );
}

/**
 * Small dialog listing every persona (track variant) with a per-item Delete —
 * the replacement for the old always-visible chip-row × delete, which read as
 * "these are removable tags" rather than "this is a view switcher". Confirms
 * each delete in place (native `confirm()`, same warning text as before) and
 * closes with the list of track keys the caller should actually remove via
 * `deleteVariant()` — mirrors AddVariantDialogComponent's division of labor:
 * this dialog only resolves WHICH personas to delete, the caller owns the
 * actual document mutation.
 */
@Component({
  selector: 'app-manage-personas-dialog',
  imports: [MatDialogModule, MatButtonModule],
  template: `
    <h2 mat-dialog-title>Manage personas</h2>
    <mat-dialog-content>
      @if (remaining().length === 0) {
        <p class="empty-state">No personas left.</p>
      } @else {
        <ul class="persona-list">
          @for (track of remaining(); track track) {
            <li class="persona-row">
              <span>{{ track }}</span>
              <button mat-stroked-button type="button" (click)="confirmDelete(track)">Delete</button>
            </li>
          }
        </ul>
      }
    </mat-dialog-content>
    <mat-dialog-actions align="end">
      <button mat-button type="button" (click)="close()">Done</button>
    </mat-dialog-actions>
  `,
  styles: [
    `
      .persona-list {
        list-style: none;
        margin: 0;
        padding: 0;
        display: flex;
        flex-direction: column;
        gap: 8px;
        min-width: min(360px, 80vw);
      }
      .persona-row {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 12px;
        padding: 8px 0;
        border-bottom: 1px solid var(--color-neutral-200);
      }
      .persona-row:last-child {
        border-bottom: none;
      }
      .empty-state {
        color: var(--color-neutral-600);
        margin: 8px 0 0;
      }
    `,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ManagePersonasDialogComponent {
  private readonly dialogRef = inject(MatDialogRef<ManagePersonasDialogComponent, string[]>);
  readonly data = inject<ManagePersonasDialogData>(MAT_DIALOG_DATA);

  readonly remaining = signal<string[]>([...this.data.tracks]);
  private readonly deleted: string[] = [];

  confirmDelete(track: string): void {
    if (!confirm(deleteWarning(track))) return;
    this.deleted.push(track);
    this.remaining.update((list) => list.filter((t) => t !== track));
  }

  close(): void {
    this.dialogRef.close(this.deleted);
  }
}
