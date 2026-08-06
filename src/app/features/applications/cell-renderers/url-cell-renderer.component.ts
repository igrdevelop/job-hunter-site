import { ChangeDetectionStrategy, ChangeDetectorRef, Component, inject } from '@angular/core';
import { ICellRendererAngularComp } from 'ag-grid-angular';
import { ICellRendererParams } from 'ag-grid-community';

@Component({
  selector: 'app-url-cell-renderer',
  template: `
    @if (url) {
      <a [href]="url" target="_blank" rel="noopener" class="btn btn-ghost btn-icon" aria-label="Open listing">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
          <path d="M15 3h6v6" />
          <path d="M10 14 21 3" />
          <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" />
        </svg>
      </a>
    }
  `,
  styles: [
    `
      a {
        text-decoration: none;
      }
    `,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class UrlCellRendererComponent implements ICellRendererAngularComp {
  private readonly cdr = inject(ChangeDetectorRef);

  url = '';

  agInit(params: ICellRendererParams): void {
    this.url = (params.value as string) ?? '';
    this.cdr.markForCheck();
  }

  refresh(params: ICellRendererParams): boolean {
    this.agInit(params);
    return true;
  }
}
