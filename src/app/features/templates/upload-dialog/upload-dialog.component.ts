import { Component, inject, signal } from '@angular/core';
import {
  FormBuilder,
  ReactiveFormsModule,
  Validators,
} from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatDialogModule, MatDialogRef } from '@angular/material/dialog';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatSelectModule } from '@angular/material/select';
import { ApiService } from '../../../core/api/api.service';
import { Template, TemplateCategory } from '../../../core/api/models';

@Component({
  selector: 'app-upload-dialog',
  standalone: true,
  imports: [
    ReactiveFormsModule,
    MatDialogModule,
    MatFormFieldModule,
    MatInputModule,
    MatSelectModule,
    MatButtonModule,
  ],
  template: `
    <h2 mat-dialog-title>Upload Template</h2>
    <mat-dialog-content>
      <form [formGroup]="form" class="upload-form">
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
            (change)="onFileSelected($event)"
          />
          @if (selectedFile(); as file) {
            <p class="file-name">{{ file.name }}</p>
            <button mat-button type="button" (click)="fileInput.click()">Change file</button>
          } @else {
            <p>Drag & drop a file here, or</p>
            <button mat-stroked-button type="button" (click)="fileInput.click()">
              Choose file
            </button>
          }
        </div>

        <mat-form-field appearance="outline">
          <mat-label>Name</mat-label>
          <input matInput formControlName="name" />
        </mat-form-field>

        <mat-form-field appearance="outline">
          <mat-label>Category</mat-label>
          <mat-select formControlName="category">
            @for (option of categories; track option.value) {
              <mat-option [value]="option.value">{{ option.label }}</mat-option>
            }
          </mat-select>
        </mat-form-field>

        <mat-form-field appearance="outline">
          <mat-label>Description</mat-label>
          <textarea matInput rows="3" formControlName="description"></textarea>
        </mat-form-field>

        @if (errorMessage()) {
          <p class="error">{{ errorMessage() }}</p>
        }
      </form>
    </mat-dialog-content>
    <mat-dialog-actions align="end">
      <button mat-button type="button" mat-dialog-close [disabled]="uploading()">Cancel</button>
      <button
        mat-flat-button
        color="primary"
        type="button"
        [disabled]="form.invalid || !selectedFile() || uploading()"
        (click)="submit()"
      >
        {{ uploading() ? 'Uploading…' : 'Upload' }}
      </button>
    </mat-dialog-actions>
  `,
  styles: [
    `
      .upload-form {
        display: flex;
        flex-direction: column;
        gap: 8px;
        min-width: min(420px, 80vw);
        padding-top: 8px;
      }
      .drop-zone {
        border: 2px dashed rgba(0, 0, 0, 0.24);
        border-radius: 8px;
        padding: 24px;
        text-align: center;
        margin-bottom: 8px;
        background: rgba(0, 0, 0, 0.02);
      }
      .drop-zone.has-file {
        border-color: #1565c0;
        background: rgba(21, 101, 192, 0.04);
      }
      .file-input {
        display: none;
      }
      .file-name {
        font-weight: 500;
        word-break: break-all;
      }
      .error {
        color: #c62828;
        margin: 0;
      }
    `,
  ],
})
export class UploadDialogComponent {
  private readonly api = inject(ApiService);
  private readonly dialogRef = inject(MatDialogRef<UploadDialogComponent, Template>);
  private readonly fb = inject(FormBuilder);

  readonly categories: Array<{ value: TemplateCategory; label: string }> = [
    { value: 'resume', label: 'Resume' },
    { value: 'cover-letter', label: 'Cover Letter' },
    { value: 'portfolio', label: 'Portfolio' },
    { value: 'other', label: 'Other' },
  ];

  readonly selectedFile = signal<File | null>(null);
  readonly uploading = signal(false);
  readonly errorMessage = signal<string | null>(null);

  readonly form = this.fb.nonNullable.group({
    name: ['', Validators.required],
    category: ['resume' as TemplateCategory, Validators.required],
    description: [''],
  });

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

  async submit(): Promise<void> {
    const file = this.selectedFile();
    if (!file || this.form.invalid) return;

    this.uploading.set(true);
    this.errorMessage.set(null);

    const { name, category, description } = this.form.getRawValue();

    try {
      const template = await this.api.uploadTemplate(file, {
        name,
        category,
        description: description.trim() || undefined,
      });
      this.dialogRef.close(template);
    } catch {
      this.errorMessage.set('Upload failed. Please try again.');
    } finally {
      this.uploading.set(false);
    }
  }

  private setFile(file: File): void {
    this.selectedFile.set(file);
    if (!this.form.controls.name.value) {
      this.form.controls.name.setValue(file.name.replace(/\.[^.]+$/, ''));
    }
  }
}
