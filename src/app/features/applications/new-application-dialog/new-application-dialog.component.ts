import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { form, FormField } from '@angular/forms/signals';
import { MatButtonModule } from '@angular/material/button';
import { MatDialogModule, MatDialogRef } from '@angular/material/dialog';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { ApplicationsApi } from '../../../core/api/applications.api';
import { Application } from '../../../core/api/models';

@Component({
  selector: 'app-new-application-dialog',
  imports: [
    FormField,
    MatDialogModule,
    MatFormFieldModule,
    MatInputModule,
    MatButtonModule,
  ],
  template: `
    <h2 mat-dialog-title>New Application</h2>
    <mat-dialog-content>
      <form class="new-app-form">
        <mat-form-field appearance="outline">
          <mat-label>Job URL</mat-label>
          <input matInput [formField]="applicationForm.url" placeholder="https://…" />
        </mat-form-field>

        <mat-form-field appearance="outline">
          <mat-label>Vacancy text</mat-label>
          <textarea
            matInput
            rows="8"
            [formField]="applicationForm.text"
            placeholder="Paste the job description here…"
          ></textarea>
        </mat-form-field>

        <p class="hint">Provide a link, the vacancy text, or both.</p>

        @if (errorMessage()) {
          <p class="error">{{ errorMessage() }}</p>
        }
      </form>
    </mat-dialog-content>
    <mat-dialog-actions align="end">
      <button mat-button type="button" mat-dialog-close [disabled]="saving()">Cancel</button>
      <button
        mat-flat-button
        color="primary"
        type="button"
        [disabled]="!hasInput() || saving()"
        (click)="submit()"
      >
        {{ saving() ? 'Creating…' : 'Create' }}
      </button>
    </mat-dialog-actions>
  `,
  styles: [
    `
      .new-app-form {
        display: flex;
        flex-direction: column;
        gap: 8px;
        min-width: min(480px, 80vw);
        padding-top: 8px;
      }
      .hint {
        margin: 0;
        font-size: 12px;
        color: var(--color-neutral-600);
      }
      .error {
        color: var(--color-error);
        margin: 0;
      }
    `,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class NewApplicationDialogComponent {
  private readonly api = inject(ApplicationsApi);
  private readonly dialogRef = inject(
    MatDialogRef<NewApplicationDialogComponent, Application>,
  );

  readonly saving = signal(false);
  readonly errorMessage = signal<string | null>(null);

  private readonly model = signal({ url: '', text: '' });
  readonly applicationForm = form(this.model);

  readonly hasInput = computed(() => {
    const { url, text } = this.model();
    return !!(url.trim() || text.trim());
  });

  async submit(): Promise<void> {
    const { url, text } = this.model();
    if (!url.trim() && !text.trim()) return;

    this.saving.set(true);
    this.errorMessage.set(null);

    try {
      const application = await this.api.create({
        url: url.trim() || undefined,
        text: text.trim() || undefined,
      });
      this.dialogRef.close(application);
    } catch {
      this.errorMessage.set('Could not create the application. The API may not support this yet.');
    } finally {
      this.saving.set(false);
    }
  }
}
