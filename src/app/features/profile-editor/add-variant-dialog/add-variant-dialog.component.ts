import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MAT_DIALOG_DATA, MatDialogModule, MatDialogRef } from '@angular/material/dialog';

export interface AddVariantDialogData {
  /** Known track slugs not already present in `variants` — the only choices
   * offered (docs/PROFILE_PAGE_TABS.md S5: "v1 restricts the key to known
   * track slugs (angular / react / ai / fullstack_*) — the key is a
   * base_cv_<track>.md filename and a filters key bot-side; no free-form
   * names"). */
  availableTracks: string[];
}

/** Mirrors the bot's `base_cv_<track>.md` filename / filters-key format. A
 * belt-and-suspenders check — the dialog only ever offers known slugs from
 * `availableTracks`, this just guards against anything unexpected slipping
 * through the select binding. */
const TRACK_SLUG_RE = /^[a-z][a-z0-9_]*$/;

/**
 * Small dialog for docs/PROFILE_PAGE_TABS.md S5's "+" chip: pick one unused
 * known track slug and close with it, or cancel with `undefined`. Creating
 * the variant itself (a normal dirty edit) is the caller's job — this dialog
 * only resolves which slug to use, same division of labor as
 * RevisionsHistoryDialogComponent resolving "restore or not" and leaving the
 * reload to its caller.
 */
@Component({
  selector: 'app-add-variant-dialog',
  imports: [MatDialogModule, MatButtonModule, FormsModule],
  template: `
    <h2 mat-dialog-title>Add a track variant</h2>
    <mat-dialog-content>
      <p class="hint">
        A track is an edit/view context only — it never switches what the bot hunts or
        generates for. That happens automatically per-vacancy (the <code>/tracks</code>
        Telegram command).
      </p>
      @if (data.availableTracks.length === 0) {
        <p class="empty-state">Every known track already has a variant.</p>
      } @else {
        <label class="field">
          <span>Track</span>
          <select class="input" [(ngModel)]="selected">
            <option value="" disabled>Choose a track…</option>
            @for (track of data.availableTracks; track track) {
              <option [value]="track">{{ track }}</option>
            }
          </select>
        </label>
      }
      @if (error()) {
        <p class="error">{{ error() }}</p>
      }
    </mat-dialog-content>
    <mat-dialog-actions align="end">
      <button mat-button type="button" (click)="cancel()">Cancel</button>
      <button mat-flat-button type="button" [disabled]="!selected" (click)="confirm()">Add</button>
    </mat-dialog-actions>
  `,
  styles: [
    `
      .field {
        display: flex;
        flex-direction: column;
        gap: 4px;
        margin-top: 8px;
        min-width: min(320px, 80vw);
      }
      .field span {
        font-size: 11px;
        font-weight: 600;
        letter-spacing: 0.05em;
        text-transform: uppercase;
        color: var(--color-neutral-600);
      }
      .hint {
        margin: 0 0 8px;
        font-size: 13px;
        color: var(--color-neutral-600);
      }
      .error {
        color: var(--color-error);
        margin: 8px 0 0;
        font-size: 13px;
      }
      .empty-state {
        color: var(--color-neutral-600);
        margin: 0;
      }
    `,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AddVariantDialogComponent {
  private readonly dialogRef = inject(MatDialogRef<AddVariantDialogComponent, string | undefined>);
  readonly data = inject<AddVariantDialogData>(MAT_DIALOG_DATA);

  selected = '';
  readonly error = signal<string | null>(null);

  confirm(): void {
    const track = this.selected.trim();
    if (!TRACK_SLUG_RE.test(track) || !this.data.availableTracks.includes(track)) {
      this.error.set('Choose one of the listed tracks.');
      return;
    }
    this.dialogRef.close(track);
  }

  cancel(): void {
    this.dialogRef.close(undefined);
  }
}
