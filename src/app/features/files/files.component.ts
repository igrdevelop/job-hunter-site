import { Component, computed, effect, inject, signal } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { MatDialog } from '@angular/material/dialog';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatSnackBar } from '@angular/material/snack-bar';
import { ApiService } from '../../core/api/api.service';
import { FileInfo, FolderInfo } from '../../core/api/models';
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

  // The API returns date/company folders as FolderInfo[] and, once inside a
  // company folder, a flat FileInfo[] (which may itself include folder-typed
  // "shadow" entries) — never a mix of both shapes in one response.
  private readonly atFileLevel = computed(() => this.company() !== null);

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

  readonly entries = signal<(FolderInfo | FileInfo)[]>([]);
  readonly loading = signal(false);
  readonly errorMessage = signal<string | null>(null);
  readonly previewEntry = signal<FileInfo | null>(null);

  /** Ignores stale responses when the user navigates before a prior load finishes. */
  private loadSeq = 0;

  readonly folders = computed<FolderInfo[]>(() =>
    this.atFileLevel() ? [] : (this.entries() as FolderInfo[]),
  );
  readonly files = computed<FileInfo[]>(() =>
    this.atFileLevel() ? (this.entries() as FileInfo[]) : [],
  );

  constructor() {
    effect(() => {
      this.currentPath();
      void this.reload();
    });
  }

  async reload(): Promise<void> {
    const seq = ++this.loadSeq;
    this.loading.set(true);
    this.errorMessage.set(null);
    this.previewEntry.set(null);

    try {
      const entries = await this.api.getGenerated(this.currentPath());
      if (seq !== this.loadSeq) return;
      this.entries.set(entries);
    } catch {
      if (seq !== this.loadSeq) return;
      this.errorMessage.set('Could not load files. Is the API reachable?');
      this.entries.set([]);
    } finally {
      if (seq === this.loadSeq) this.loading.set(false);
    }
  }

  openFolder(folder: FolderInfo): void {
    const date = this.date();
    if (!date) {
      this.router.navigate(['/files', folder.name]);
      return;
    }
    this.router.navigate(['/files', date, folder.name]);
  }

  previewPdf(entry: FileInfo): void {
    this.previewEntry.set(entry);
  }

  fileUrl(entry: FileInfo): string {
    return this.api.getGeneratedFileUrl(`${this.currentPath()}/${entry.name}`);
  }

  downloadFile(entry: FileInfo): void {
    window.open(this.fileUrl(entry), '_blank', 'noopener');
  }

  async viewText(entry: FileInfo): Promise<void> {
    try {
      const raw = await this.api.getGeneratedFileContent(`${this.currentPath()}/${entry.name}`);
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
