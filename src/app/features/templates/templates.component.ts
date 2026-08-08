import { DatePipe } from '@angular/common';
import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  resource,
  signal,
} from '@angular/core';
import { MatChipsModule } from '@angular/material/chips';
import { MatDialog, MatDialogModule } from '@angular/material/dialog';
import { MatIconModule } from '@angular/material/icon';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatSnackBar } from '@angular/material/snack-bar';
import { RouterLink } from '@angular/router';
import { TemplatesApi } from '../../core/api/templates.api';
import { AuthService } from '../../core/auth/auth.service';
import { Template, TemplateCategory } from '../../core/api/models';
import { PdfPreviewComponent } from '../../shared/pdf-preview/pdf-preview.component';
import { TextPreviewDialogComponent } from '../../shared/text-preview-dialog/text-preview-dialog.component';
import { UploadDialogComponent } from './upload-dialog/upload-dialog.component';

type CategoryFilter = TemplateCategory | 'all';

@Component({
  selector: 'app-templates',
  imports: [
    DatePipe,
    MatChipsModule,
    MatIconModule,
    MatProgressSpinnerModule,
    MatDialogModule,
    PdfPreviewComponent,
    RouterLink,
  ],
  templateUrl: './templates.component.html',
  styleUrl: './templates.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class TemplatesComponent {
  private readonly api = inject(TemplatesApi);
  private readonly auth = inject(AuthService);
  private readonly dialog = inject(MatDialog);
  private readonly snackBar = inject(MatSnackBar);

  private readonly templatesResource = resource({
    loader: () => this.api.getAll(),
  });

  readonly templates = computed(() => this.templatesResource.value() ?? []);
  readonly loading = this.templatesResource.isLoading;
  readonly selectedCategory = signal<CategoryFilter>('all');
  readonly errorMessage = computed(() =>
    this.templatesResource.error()
      ? 'Could not load templates. Is the API reachable?'
      : null,
  );
  readonly previewPdf = signal<Template | null>(null);
  readonly previewUrl = signal<string | null>(null);

  readonly categoryFilters: Array<{ value: CategoryFilter; label: string }> = [
    { value: 'all', label: 'All' },
    { value: 'resume', label: 'Resume' },
    { value: 'cover-letter', label: 'Cover Letter' },
    { value: 'portfolio', label: 'Portfolio' },
    { value: 'other', label: 'Other' },
  ];

  readonly filteredTemplates = computed(() => {
    const category = this.selectedCategory();
    const items = this.templates();
    if (category === 'all') return items;
    return items.filter((t) => t.category === category);
  });

  onCategoryChange(category: CategoryFilter): void {
    this.selectedCategory.set(category);
  }

  onUpload(): void {
    const ref = this.dialog.open(UploadDialogComponent, { width: '480px' });
    ref.afterClosed().subscribe((result: Template | undefined) => {
      if (result) this.templatesResource.reload();
    });
  }

  async onDelete(template: Template): Promise<void> {
    if (!confirm(`Delete ${template.name}?`)) return;

    try {
      await this.api.delete(template.id);
      if (this.previewPdf()?.id === template.id) {
        this.previewPdf.set(null);
      }
      this.templatesResource.reload();
    } catch {
      this.snackBar.open('Failed to delete template.', 'Dismiss', { duration: 4000 });
    }
  }

  async onPreview(template: Template): Promise<void> {
    if (template.fileType === 'pdf') {
      try {
        const token = await this.auth.getDownloadToken();
        const url = `${this.api.getContentUrl(template.id)}?dt=${encodeURIComponent(token)}`;
        this.previewUrl.set(url);
        this.previewPdf.set(template);
      } catch {
        this.snackBar.open('Could not open preview.', 'Dismiss', { duration: 4000 });
      }
      return;
    }

    if (template.fileType === 'txt' || template.fileType === 'json') {
      try {
        const content = await this.api.getContent(template.id);
        this.dialog.open(TextPreviewDialogComponent, {
          width: '720px',
          data: { fileName: template.name, content },
        });
      } catch {
        this.snackBar.open('Failed to load preview.', 'Dismiss', { duration: 4000 });
      }
      return;
    }

    await this.onDownload(template);
  }

  async onDownload(template: Template): Promise<void> {
    try {
      const token = await this.auth.getDownloadToken();
      const url = `${this.api.getContentUrl(template.id)}?dt=${encodeURIComponent(token)}`;
      window.open(url, '_blank', 'noopener');
    } catch {
      this.snackBar.open('Could not download template.', 'Dismiss', { duration: 4000 });
    }
  }

  closePdfPreview(): void {
    this.previewPdf.set(null);
    this.previewUrl.set(null);
  }

  categoryLabel(category: TemplateCategory): string {
    return this.categoryFilters.find((c) => c.value === category)?.label ?? category;
  }

  formatSize(bytes: number): string {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  }
}
