import { ChangeDetectionStrategy, Component, input, output } from '@angular/core';
import { FolderInfo } from '../../core/api/models';

@Component({
  selector: 'app-folder-list',
  template: `
    <div class="folder-grid">
      @for (folder of folders(); track folder.name) {
        <button type="button" class="card elev-sm folder-card" (click)="open.emit(folder)">
          <span class="folder-icon-wrap" aria-hidden="true">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
              <path d="M20 20a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2h-7.9a2 2 0 0 1-1.69-.9L9.6 3.9A2 2 0 0 0 7.93 3H4a2 2 0 0 0-2 2v13a2 2 0 0 0 2 2Z" />
            </svg>
          </span>
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
        padding: var(--space-5);
        cursor: pointer;
        font: inherit;
        transition:
          background-color 0.15s ease,
          border-color 0.15s ease;
      }
      .folder-card:hover {
        background: var(--color-neutral-200);
        border-color: var(--color-neutral-400);
      }
      .folder-icon-wrap {
        display: inline-flex;
        align-items: center;
        justify-content: center;
        width: 40px;
        height: 40px;
        border-radius: var(--radius-sm);
        background: rgba(59, 130, 246, 0.15);
        color: var(--color-accent-600);
        margin-bottom: var(--space-3);
      }
    `,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class FolderListComponent {
  readonly folders = input.required<FolderInfo[]>();
  readonly open = output<FolderInfo>();
}
