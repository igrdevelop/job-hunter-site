import { Component, computed, input, output } from '@angular/core';
import { MatIconModule } from '@angular/material/icon';
import { MatListModule } from '@angular/material/list';
import { FileInfo, FileType } from '../../../core/api/models';

const ICONS: Record<FileType, string> = {
  pdf: 'picture_as_pdf',
  docx: 'description',
  txt: 'article',
  json: 'data_object',
  other: 'insert_drive_file',
  folder: 'folder',
};

function formatSize(bytes: number, isFolder: boolean): string {
  if (isFolder) return '';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

interface FileRow {
  entry: FileInfo;
  icon: string;
  sizeLabel: string;
  clickable: boolean;
}

@Component({
  selector: 'app-file-list',
  standalone: true,
  imports: [MatIconModule, MatListModule],
  template: `
    <mat-nav-list>
      @for (row of rows(); track row.entry.name) {
        <a
          mat-list-item
          [class.clickable]="row.clickable"
          (click)="row.clickable && handleClick(row)"
        >
          <mat-icon matListItemIcon>{{ row.icon }}</mat-icon>
          <span matListItemTitle>{{ row.entry.name }}</span>
          <span matListItemLine class="size">{{ row.sizeLabel }}</span>
        </a>
      }
    </mat-nav-list>
  `,
  styles: [
    `
      .clickable {
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
  readonly files = input.required<FileInfo[]>();
  readonly preview = output<FileInfo>();
  readonly view = output<FileInfo>();
  readonly download = output<FileInfo>();

  readonly rows = computed<FileRow[]>(() =>
    this.files().map((entry) => ({
      entry,
      icon: ICONS[entry.type],
      sizeLabel: formatSize(entry.size, entry.type === 'folder'),
      clickable: entry.type !== 'folder',
    })),
  );

  handleClick(row: FileRow): void {
    if (row.entry.type === 'pdf') {
      this.preview.emit(row.entry);
    } else if (row.entry.type === 'txt' || row.entry.type === 'json') {
      this.view.emit(row.entry);
    } else {
      this.download.emit(row.entry);
    }
  }
}
