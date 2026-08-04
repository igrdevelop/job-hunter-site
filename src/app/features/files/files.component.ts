import { Component, computed, effect, inject, signal } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { MatButtonModule } from '@angular/material/button';
import { MatDialog } from '@angular/material/dialog';
import { MatIconModule } from '@angular/material/icon';
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

function isFolderInfo(entry: FolderInfo | FileInfo): entry is FolderInfo {
  return 'itemCount' in entry;
}

@Component({
  selector: 'app-files',
  standalone: true,
  imports: [
    RouterLink,
    MatButtonModule,
    MatIconModule,
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

  /** Path under candidate/, e.g. "" | "examples" | "notes". */
  readonly currentPath = computed(() => {
    const raw = this.params().get('path');
    return raw ? decodeURIComponent(raw).replace(/^\/+|\/+$/g, '') : '';
  });

  readonly breadcrumbs = computed<Breadcrumb[]>(() => {
    const crumbs: Breadcrumb[] = [{ label: 'Files', path: '/files' }];
    const parts = this.currentPath().split('/').filter(Boolean);
    let acc = '';
    for (const part of parts) {
      acc = acc ? `${acc}/${part}` : part;
      crumbs.push({ label: part, path: `/files/${acc}` });
    }
    return crumbs;
  });

  readonly entries = signal<(FolderInfo | FileInfo)[]>([]);
  readonly loading = signal(false);
  readonly uploading = signal(false);
  readonly errorMessage = signal<string | null>(null);
  readonly previewEntry = signal<FileInfo | null>(null);

  readonly folders = computed(() => this.entries().filter(isFolderInfo));
  readonly files = computed(() => this.entries().filter((e): e is FileInfo => !isFolderInfo(e)));

  constructor() {
    effect(() => {
      this.currentPath();
      void this.reload();
    });
  }

  async reload(): Promise<void> {
    this.loading.set(true);
    this.errorMessage.set(null);
    this.previewEntry.set(null);

    try {
      this.entries.set(await this.api.getFiles(this.currentPath()));
    } catch {
      this.errorMessage.set('Could not load candidate files. Is the API reachable?');
      this.entries.set([]);
    } finally {
      this.loading.set(false);
    }
  }

  openFolder(folder: FolderInfo): void {
    const next = this.currentPath() ? `${this.currentPath()}/${folder.name}` : folder.name;
    void this.router.navigateByUrl(`/files/${next}`);
  }

  previewPdf(entry: FileInfo): void {
    this.previewEntry.set(entry);
  }

  fileUrl(entry: FileInfo): string {
    const path = this.currentPath() ? `${this.currentPath()}/${entry.name}` : entry.name;
    return this.api.getFileUrl(path);
  }

  downloadFile(entry: FileInfo): void {
    window.open(this.fileUrl(entry), '_blank', 'noopener');
  }

  async viewText(entry: FileInfo): Promise<void> {
    try {
      const path = this.currentPath() ? `${this.currentPath()}/${entry.name}` : entry.name;
      const raw = await this.api.getFileContent(path);
      const content =
        entry.name.endsWith('.json') || entry.name.endsWith('.yaml') || entry.name.endsWith('.yml')
          ? this.tryPrettyPrint(raw)
          : raw;
      this.dialog.open(TextPreviewDialogComponent, {
        data: { fileName: entry.name, content },
        width: '720px',
      });
    } catch {
      this.snackBar.open(`Could not load ${entry.name}.`, 'Dismiss', { duration: 4000 });
    }
  }

  async onUpload(event: Event): Promise<void> {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    input.value = '';
    if (!file) return;

    this.uploading.set(true);
    try {
      await this.api.uploadFile(file, this.currentPath() || undefined);
      this.snackBar.open(`Uploaded ${file.name}`, 'Dismiss', { duration: 3000 });
      await this.reload();
    } catch {
      this.snackBar.open('Upload failed.', 'Dismiss', { duration: 4000 });
    } finally {
      this.uploading.set(false);
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
