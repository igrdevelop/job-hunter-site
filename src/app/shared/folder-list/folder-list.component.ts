import { ChangeDetectionStrategy, Component, input, output } from '@angular/core';
import { MatIconModule } from '@angular/material/icon';
import { FolderInfo } from '../../core/api/models';

@Component({
  selector: 'app-folder-list',
  imports: [MatIconModule],
  template: `
    <div class="folder-grid">
      @for (folder of folders(); track folder.name) {
        <button type="button" class="folder-card" (click)="open.emit(folder)">
          <mat-icon>folder</mat-icon>
          <span>{{ folder.name }}</span>
        </button>
      }
    </div>
  `,
  styles: [
    `
      .folder-grid {
        display: grid;
        grid-template-columns: repeat(auto-fill, minmax(140px, 1fr));
        gap: 12px;
      }
      .folder-card {
        display: flex;
        flex-direction: column;
        align-items: center;
        gap: 8px;
        padding: 16px 8px;
        border: 1px solid rgba(0, 0, 0, 0.12);
        border-radius: 8px;
        background: none;
        cursor: pointer;
        font: inherit;
      }
      .folder-card:hover {
        background: rgba(0, 0, 0, 0.04);
      }
      .folder-card mat-icon {
        font-size: 32px;
        width: 32px;
        height: 32px;
        color: #f9a825;
      }
      .folder-card span {
        text-align: center;
        word-break: break-word;
        font-size: 0.875rem;
      }
    `,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class FolderListComponent {
  readonly folders = input.required<FolderInfo[]>();
  readonly open = output<FolderInfo>();
}
