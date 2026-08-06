import { ChangeDetectionStrategy, ChangeDetectorRef, Component, inject } from '@angular/core';
import { ICellRendererAngularComp } from 'ag-grid-angular';
import { ICellRendererParams } from 'ag-grid-community';

@Component({
  selector: 'app-sent-status-cell-renderer',
  template: `
    <span class="status" [class.status--sent]="filled" [class.status--unsent]="!filled">
      <span class="dot" aria-hidden="true"></span>
      {{ label }}
    </span>
  `,
  styles: [
    `
      :host {
        display: flex;
        align-items: center;
        height: 100%;
      }
      .status {
        display: inline-flex;
        align-items: center;
        gap: 8px;
        font-size: 13px;
        font-weight: 500;
        min-width: 0;
      }
      .dot {
        width: 8px;
        height: 8px;
        border-radius: 50%;
        flex-shrink: 0;
      }
      .status--unsent {
        color: var(--color-status-unsent);
      }
      .status--unsent .dot {
        background: var(--color-status-unsent);
      }
      .status--sent {
        color: var(--color-status-sent);
      }
      .status--sent .dot {
        background: var(--color-status-sent);
      }
    `,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class SentStatusCellRendererComponent implements ICellRendererAngularComp {
  private readonly cdr = inject(ChangeDetectorRef);

  filled = false;
  label = 'Unsent';

  agInit(params: ICellRendererParams): void {
    const raw = String(params.value ?? '').trim();
    this.filled = Boolean(raw);
    this.label = this.filled ? raw : 'Unsent';
    this.cdr.markForCheck();
  }

  refresh(params: ICellRendererParams): boolean {
    this.agInit(params);
    return true;
  }
}
