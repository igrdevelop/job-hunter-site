import { ChangeDetectionStrategy, ChangeDetectorRef, Component, inject } from '@angular/core';
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

// Applied/Sent read as forward progress (accent), Failed reads as stopped
// (neutral/dark), everything else is an in-between/waiting state (outline).
const TAG_CLASS: Record<ApplicationStatus, string> = {
  applied: 'tag tag-accent',
  sent: 'tag tag-accent',
  failed: 'tag tag-neutral',
  expired: 'tag tag-outline',
  pending: 'tag tag-outline',
  unsent: 'tag tag-outline',
};

@Component({
  selector: 'app-status-cell-renderer',
  template: `<span [class]="tagClass">{{ label }}</span>`,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class StatusCellRendererComponent implements ICellRendererAngularComp {
  private readonly cdr = inject(ChangeDetectorRef);

  status: ApplicationStatus = 'pending';
  label = '';
  tagClass = '';

  agInit(params: ICellRendererParams): void {
    this.status = params.value as ApplicationStatus;
    this.label = LABELS[this.status] ?? String(params.value ?? '');
    this.tagClass = TAG_CLASS[this.status] ?? 'tag tag-outline';
    this.cdr.markForCheck();
  }

  refresh(params: ICellRendererParams): boolean {
    this.agInit(params);
    return true;
  }
}
