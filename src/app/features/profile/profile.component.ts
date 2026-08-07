import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  resource,
  signal,
} from '@angular/core';
import { MatDialog } from '@angular/material/dialog';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatSnackBar } from '@angular/material/snack-bar';
import { FilesApi } from '../../core/api/files.api';
import { FileInfo, FolderInfo } from '../../core/api/models';
import { AuthService } from '../../core/auth/auth.service';
import { FolderListComponent } from '../../shared/folder-list/folder-list.component';
import { FileListComponent } from '../../shared/file-list/file-list.component';
import { TextPreviewDialogComponent } from '../../shared/text-preview-dialog/text-preview-dialog.component';

function isFolderInfo(entry: FolderInfo | FileInfo): entry is FolderInfo {
  return 'itemCount' in entry;
}

@Component({
  selector: 'app-profile',
  imports: [MatProgressSpinnerModule, FolderListComponent, FileListComponent],
  templateUrl: './profile.component.html',
  styleUrl: './profile.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ProfileComponent {
  private readonly api = inject(FilesApi);
  private readonly dialog = inject(MatDialog);
  private readonly snackBar = inject(MatSnackBar);
  protected readonly authService = inject(AuthService);

  protected readonly initials = computed(() => {
    const email = this.authService.currentUser()?.email ?? '';
    const local = email.split('@')[0] ?? '';
    const parts = local.split(/[._-]+/).filter(Boolean);
    if (parts.length >= 2) {
      return (parts[0][0] + parts[1][0]).toUpperCase();
    }
    return local.slice(0, 2).toUpperCase() || '?';
  });

  /** Optional subpath under candidate/ (shallow tree; no route params). */
  readonly currentPath = signal('');

  private readonly entriesResource = resource({
    params: () => this.currentPath(),
    loader: ({ params: path }) => this.api.getProfileFiles(path),
  });

  readonly entries = computed(() => this.entriesResource.value() ?? []);
  readonly loading = this.entriesResource.isLoading;
  readonly errorMessage = computed(() =>
    this.entriesResource.error()
      ? 'Could not load profile files. Is the API reachable?'
      : null,
  );

  readonly folders = computed(() => this.entries().filter(isFolderInfo));
  readonly files = computed(() =>
    this.entries().filter((e): e is FileInfo => !isFolderInfo(e)),
  );

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

  async downloadFile(entry: FileInfo): Promise<void> {
    try {
      const token = await this.authService.getDownloadToken();
      const url = `${this.api.getProfileFileUrl(this.entryPath(entry))}?dt=${encodeURIComponent(token)}`;
      window.open(url, '_blank', 'noopener');
    } catch {
      this.snackBar.open('Could not download file.', 'Dismiss', { duration: 4000 });
    }
  }

  /** FileList emits preview for PDFs — profile rarely has them; download instead. */
  previewPdf(entry: FileInfo): void {
    void this.downloadFile(entry);
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
