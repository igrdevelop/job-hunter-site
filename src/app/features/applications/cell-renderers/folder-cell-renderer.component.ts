import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { Router } from '@angular/router';
import { ICellRendererAngularComp } from 'ag-grid-angular';
import { ICellRendererParams } from 'ag-grid-community';
import { Application } from '../../../core/api/models';

@Component({
  selector: 'app-folder-cell-renderer',
  template: `
    <button type="button" class="btn btn-ghost btn-icon" aria-label="Open folder" (click)="openFolder()">
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
        <path d="M20 20a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2h-7.9a2 2 0 0 1-1.69-.9L9.6 3.9A2 2 0 0 0 7.93 3H4a2 2 0 0 0-2 2v13a2 2 0 0 0 2 2Z" />
      </svg>
    </button>
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class FolderCellRendererComponent implements ICellRendererAngularComp {
  private readonly router = inject(Router);
  private data?: Application;

  agInit(params: ICellRendererParams<Application>): void {
    this.data = params.data;
  }

  refresh(params: ICellRendererParams<Application>): boolean {
    this.agInit(params);
    return true;
  }

  openFolder(): void {
    if (!this.data) return;
    void this.router.navigate(['/files', this.data.date, this.data.company]);
  }
}
