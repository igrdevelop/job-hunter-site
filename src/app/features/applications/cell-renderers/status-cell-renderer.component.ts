import { Component } from '@angular/core';
import { ICellRendererAngularComp } from 'ag-grid-angular';
import { ICellRendererParams } from 'ag-grid-community';
import { ApplicationStatus } from '../../../core/api/models';

const LABELS: Record<ApplicationStatus, string> = {
  sent: 'Sent',
  applied: 'Applied',
  failed: 'Failed',
  expired: 'Expired',
  pending: 'Pending',
  unsent: 'Unsent',
};

@Component({
  selector: 'app-status-cell-renderer',
  standalone: true,
  template: `<span class="badge" [class]="status">{{ label }}</span>`,
  styles: [
    `
      .badge {
        display: inline-block;
        padding: 2px 10px;
        border-radius: 12px;
        font-size: 0.75rem;
        font-weight: 600;
        color: white;
        white-space: nowrap;
      }
      .sent { background: #2e7d32; }
      .applied { background: #1565c0; }
      .failed { background: #c62828; }
      .expired { background: #757575; }
      .pending { background: #ef6c00; }
      .unsent { background: #9e9e9e; }
    `,
  ],
})
export class StatusCellRendererComponent implements ICellRendererAngularComp {
  status: ApplicationStatus = 'pending';
  label = '';

  agInit(params: ICellRendererParams): void {
    this.status = params.value as ApplicationStatus;
    this.label = LABELS[this.status] ?? String(params.value ?? '');
  }

  refresh(params: ICellRendererParams): boolean {
    this.agInit(params);
    return true;
  }
}
