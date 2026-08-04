import { Component, computed, inject, signal } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { MatDialog } from '@angular/material/dialog';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatSnackBar } from '@angular/material/snack-bar';
import { ApiService } from '../../core/api/api.service';
import { FileEntry } from '../../core/api/models';
import { FolderListComponent } from './folder-list/folder-list.component';
import { FileListComponent } from './file-list/file-list.component';
import { PdfPreviewComponent } from './pdf-preview/pdf-preview.component';
import { TextPreviewDialogComponent } from './text-preview-dialog/text-preview-dialog.component';

interface Breadcrumb {
  label: string;
  path: string | null;
}

@Component({
  selector: 'app-files',
  standalone: true,
  imports: [
    RouterLink,
    MatProgressSpinnerModule,
    FolderListComponent,
    FileListComponent,
    PdfPreviewComponent,
  ],
  templateUrl: './files.component.html',
  styleUrl: './files.component.scss',
})
export class FilesComponent {
  private readonly api = inject(ApiService);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly dialog = inject(MatDialog);
  private readonly snackBar = inject(MatSnackBar);

  private readonly params = toSignal(this.route.paramMap, { requireSync: true });

  readonly date = computed(() => this.params().get('date'));
  readonly company = computed(() => this.params().get('company'));

  readonly currentPath = computed(() => {
    const date = this.date();
    const company = this.company();
    if (date && company) return `${date}/${company}`;
    if (date) return date;
    return '';
  });

  readonly breadcrumbs = computed<Breadcrumb[]>(() => {
    const crumbs: Breadcrumb[] = [{ label: 'Files', path: null }];
    const date = this.date();
    const company = this.company();
    if (date) crumbs.push({ label: date, path: `/files/${date}` });
    if (date && company) crumbs.push({ label: company, path: `/files/${date}/${company}` });
    return crumbs;
  });

  readonly entries = signal<FileEntry[]>([]);
  readonly loading = signal(false);
  readonly errorMessage = signal<string | null>(null);
  readonly previewEntry = signal<FileEntry | null>(null);

  readonly folders = computed(() => this.entries().filter((e) => e.isDirectory));
  readonly files = computed(() => this.entries().filter((e) => !e.isDirectory));

  constructor() {
    void this.reload();
  }

  async reload(): Promise<void> {
    this.loading.set(true);
    this.errorMessage.set(null);
    this.previewEntry.set(null);

    try {
      this.entries.set(await this.api.getFiles(this.currentPath()));
    } catch {
      this.errorMessage.set('Could not load files. Is the API reachable?');
      this.entries.set([]);
    } finally {
      this.loading.set(false);
    }
  }

  openFolder(entry: FileEntry): void {
    this.router.navigate(['/files', ...entry.path.split('/')]);
  }

  previewPdf(entry: FileEntry): void {
    this.previewEntry.set(entry);
  }

  fileUrl(entry: FileEntry): string {
    return this.api.getFileUrl(entry.path);
  }

  downloadFile(entry: FileEntry): void {
    window.open(this.fileUrl(entry), '_blank', 'noopener');
  }

  async viewText(entry: FileEntry): Promise<void> {
    try {
      const raw = await this.api.getFileContent(entry.path);
      const content = entry.name.endsWith('.json') ? this.tryPrettyPrint(raw) : raw;
      this.dialog.open(TextPreviewDialogComponent, {
        data: { fileName: entry.name, content },
        width: '600px',
      });
    } catch {
      this.snackBar.open(`Could not load ${entry.name}.`, 'Dismiss', { duration: 4000 });
    }
  }

  private tryPrettyPrint(raw: string): string {
    try {
      return JSON.stringify(JSON.parse(raw), null, 2);
    } catch {
      return raw;
    }
  }
}
