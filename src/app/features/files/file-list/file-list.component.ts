import { Component, computed, input, output } from '@angular/core';
import { MatIconModule } from '@angular/material/icon';
import { MatListModule } from '@angular/material/list';
import { FileEntry } from '../../../core/api/models';

type FileKind = 'pdf' | 'docx' | 'txt' | 'json' | 'other';

const ICONS: Record<FileKind, string> = {
  pdf: 'picture_as_pdf',
  docx: 'description',
  txt: 'article',
  json: 'data_object',
  other: 'insert_drive_file',
};

function kindOf(name: string): FileKind {
  const ext = name.split('.').pop()?.toLowerCase();
  if (ext === 'pdf') return 'pdf';
  if (ext === 'docx') return 'docx';
  if (ext === 'txt') return 'txt';
  if (ext === 'json') return 'json';
  return 'other';
}

function formatSize(bytes: number | null): string {
  if (bytes === null) return '';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

interface FileRow {
  entry: FileEntry;
  kind: FileKind;
  icon: string;
  sizeLabel: string;
}

@Component({
  selector: 'app-file-list',
  standalone: true,
  imports: [MatIconModule, MatListModule],
  template: `
    <mat-nav-list>
      @for (row of rows(); track row.entry.path) {
        <a mat-list-item (click)="handleClick(row)" class="file-row">
          <mat-icon matListItemIcon>{{ row.icon }}</mat-icon>
          <span matListItemTitle>{{ row.entry.name }}</span>
          <span matListItemLine class="size">{{ row.sizeLabel }}</span>
        </a>
      }
    </mat-nav-list>
  `,
  styles: [
    `
      .file-row {
        cursor: pointer;
      }
      .size {
        color: rgba(0, 0, 0, 0.5);
        font-size: 0.75rem;
      }
    `,
  ],
})
export class FileListComponent {
  readonly files = input.required<FileEntry[]>();
  readonly preview = output<FileEntry>();
  readonly view = output<FileEntry>();
  readonly download = output<FileEntry>();

  readonly rows = computed<FileRow[]>(() =>
    this.files().map((entry) => {
      const kind = kindOf(entry.name);
      return { entry, kind, icon: ICONS[kind], sizeLabel: formatSize(entry.sizeBytes) };
    }),
  );

  handleClick(row: FileRow): void {
    if (row.kind === 'pdf') {
      this.preview.emit(row.entry);
    } else if (row.kind === 'txt' || row.kind === 'json') {
      this.view.emit(row.entry);
    } else {
      this.download.emit(row.entry);
    }
  }
}
