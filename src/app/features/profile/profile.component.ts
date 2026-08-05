import { Component, computed, effect, inject, signal } from '@angular/core';
import { MatDialog } from '@angular/material/dialog';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatSnackBar } from '@angular/material/snack-bar';
import { ApiService } from '../../core/api/api.service';
import { FileInfo, FolderInfo } from '../../core/api/models';
import { FolderListComponent } from '../files/folder-list/folder-list.component';
import { FileListComponent } from '../files/file-list/file-list.component';
import { TextPreviewDialogComponent } from '../files/text-preview-dialog/text-preview-dialog.component';

function isFolderInfo(entry: FolderInfo | FileInfo): entry is FolderInfo {
  return 'itemCount' in entry;
}

@Component({
  selector: 'app-profile',
  standalone: true,
  imports: [MatProgressSpinnerModule, FolderListComponent, FileListComponent],
  templateUrl: './profile.component.html',
  styleUrl: './profile.component.scss',
})
export class ProfileComponent {
  private readonly api = inject(ApiService);
  private readonly dialog = inject(MatDialog);
  private readonly snackBar = inject(MatSnackBar);

  /** Optional subpath under candidate/ (shallow tree; no route params). */
  readonly currentPath = signal('');

  readonly entries = signal<(FolderInfo | FileInfo)[]>([]);
  readonly loading = signal(false);
  readonly errorMessage = signal<string | null>(null);

  readonly folders = computed(() => this.entries().filter(isFolderInfo));
  readonly files = computed(() =>
    this.entries().filter((e): e is FileInfo => !isFolderInfo(e)),
  );

  constructor() {
    effect(() => {
      this.currentPath();
      void this.reload();
    });
  }

  async reload(): Promise<void> {
    this.loading.set(true);
    this.errorMessage.set(null);

    try {
      this.entries.set(await this.api.getProfileFiles(this.currentPath()));
    } catch {
      this.errorMessage.set('Could not load profile files. Is the API reachable?');
      this.entries.set([]);
    } finally {
      this.loading.set(false);
    }
  }

  openFolder(folder: FolderInfo): void {
    const next = this.currentPath()
      ? `${this.currentPath()}/${folder.name}`
      : folder.name;
    this.currentPath.set(next);
  }

  goRoot(): void {
    this.currentPath.set('');
  }

  private entryPath(entry: FileInfo): string {
    return this.currentPath() ? `${this.currentPath()}/${entry.name}` : entry.name;
  }

  downloadFile(entry: FileInfo): void {
    window.open(this.api.getProfileFileUrl(this.entryPath(entry)), '_blank', 'noopener');
  }

  /** FileList emits preview for PDFs — profile rarely has them; download instead. */
  previewPdf(entry: FileInfo): void {
    this.downloadFile(entry);
  }

  async viewText(entry: FileInfo): Promise<void> {
    try {
      const raw = await this.api.getProfileFileContent(this.entryPath(entry));
      const lower = entry.name.toLowerCase();
      const content =
        lower.endsWith('.json') ? this.tryPrettyPrint(raw) : raw;
      this.dialog.open(TextPreviewDialogComponent, {
        data: { fileName: entry.name, content },
        width: '720px',
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
