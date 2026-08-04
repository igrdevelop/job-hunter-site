import { Component, computed, input } from '@angular/core';
import { ApplicationStatus } from '../../../core/api/models';

const LABELS: Record<ApplicationStatus, string> = {
  sent: 'Sent',
  applied: 'Applied',
  failed: 'Failed',
  expired: 'Expired',
  pending: 'Pending',
};

@Component({
  selector: 'app-status-badge',
  standalone: true,
  template: `<span class="badge" [class]="status()">{{ label() }}</span>`,
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
    `,
  ],
})
export class StatusBadgeComponent {
  readonly status = input.required<ApplicationStatus>();
  readonly label = computed(() => LABELS[this.status()]);
}
