import { ChangeDetectionStrategy, Component, input, output } from '@angular/core';
import { FolderInfo } from '../../core/api/models';

@Component({
  selector: 'app-folder-list',
  template: `
    <div class="folder-grid">
      @for (folder of folders(); track folder.name) {
        <button type="button" class="card blueprint elev-sm folder-card" (click)="open.emit(folder)">
          <i class="corner tl"></i><i class="corner tr"></i><i class="corner bl"></i><i class="corner br"></i>
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" class="folder-icon">
            <path d="M20 20a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2h-7.9a2 2 0 0 1-1.69-.9L9.6 3.9A2 2 0 0 0 7.93 3H4a2 2 0 0 0-2 2v13a2 2 0 0 0 2 2Z" />
          </svg>
          <div class="card-title">{{ folder.name }}</div>
          <div class="card-body">{{ folder.itemCount }} files</div>
        </button>
      }
    </div>
  `,
  styles: [
    `
      .folder-grid {
        display: grid;
        grid-template-columns: repeat(auto-fill, minmax(220px, 1fr));
        gap: var(--space-4);
      }
      .folder-card {
        display: flex;
        flex-direction: column;
        align-items: flex-start;
        text-align: left;
        padding: var(--space-4);
        cursor: pointer;
        font: inherit;
      }
      .folder-card:hover {
        background: var(--color-neutral-050);
      }
      .folder-icon {
        color: var(--color-accent-700);
        margin-bottom: var(--space-2);
      }
    `,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class FolderListComponent {
  readonly folders = input.required<FolderInfo[]>();
  readonly open = output<FolderInfo>();
}
