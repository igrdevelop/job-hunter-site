import { ChangeDetectionStrategy, Component, computed, input, output } from '@angular/core';
import { MatIconModule } from '@angular/material/icon';
import { FileInfo, FileType } from '../../core/api/models';

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
  imports: [MatIconModule],
  template: `
    <div class="file-list card">
      @for (row of rows(); track row.entry.name) {
        <a
          class="file-row"
          [class.clickable]="row.clickable"
          (click)="row.clickable && handleClick(row)"
        >
          <mat-icon class="file-icon">{{ row.icon }}</mat-icon>
          <span class="file-name">{{ row.entry.name }}</span>
          <span class="size">{{ row.sizeLabel }}</span>
        </a>
      }
    </div>
  `,
  styles: [
    `
      .file-list {
        display: flex;
        flex-direction: column;
        overflow: hidden;
      }
      .file-row {
        display: flex;
        align-items: center;
        gap: var(--space-3);
        padding: var(--space-3) var(--space-4);
        border-bottom: 1px solid var(--color-neutral-200);
        color: var(--color-text);
        text-decoration: none;

        &:last-child {
          border-bottom: none;
        }
      }
      .clickable {
        cursor: pointer;

        &:hover {
          background: var(--color-neutral-200);
        }
      }
      .file-icon {
        color: var(--color-accent-600);
        flex-shrink: 0;
      }
      .file-name {
        flex: 1 1 auto;
        min-width: 0;
        font-size: 14px;
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
      }
      .size {
        color: var(--color-neutral-500);
        font-size: 12px;
        flex-shrink: 0;
      }
    `,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
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
    } else if (isTextPreviewable(row.entry)) {
      this.view.emit(row.entry);
    } else {
      this.download.emit(row.entry);
    }
  }
}

function isTextPreviewable(entry: FileInfo): boolean {
  if (entry.type === 'txt' || entry.type === 'json') return true;
  const name = entry.name.toLowerCase();
  return (
    name.endsWith('.md') ||
    name.endsWith('.yaml') ||
    name.endsWith('.yml') ||
    name.endsWith('.txt') ||
    name.endsWith('.json')
  );
}
