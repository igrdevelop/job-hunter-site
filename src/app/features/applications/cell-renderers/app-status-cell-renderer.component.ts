import { ChangeDetectionStrategy, ChangeDetectorRef, Component, OnDestroy, inject } from '@angular/core';
import { MatDividerModule } from '@angular/material/divider';
import { MatIconModule } from '@angular/material/icon';
import { MatMenuModule } from '@angular/material/menu';
import { ICellRendererAngularComp } from 'ag-grid-angular';
import { ICellRendererParams, IRowNode } from 'ag-grid-community';
import { Application } from '../../../core/api/models';

export interface AppStatusCellRendererParams extends ICellRendererParams<Application, string> {
  /** Fired with the row node and the chosen status ('' clears it). The host
   * component decides what happens next — a direct save, or (for
   * Skipped/Filter miss) opening DeclineReasonDialogComponent first. */
  onSelect: (node: IRowNode<Application>, status: string) => void;
  /** Fired when the menu opens/closes, so the host can pause its periodic
   * grid refresh while the user is choosing. */
  onMenuOpenChange?: (open: boolean) => void;
}

/**
 * My Status cell renderer — a pill button that opens a mat-menu (a CDK
 * overlay on `document.body`, so it's never clipped by the grid and closes
 * on selection/outside click/Esc for free) on a single click. There is no
 * grid editor for this column at all (`editable: false` in
 * applications.component.ts) — every status change goes through `onSelect`.
 * See docs/APPLICATIONS_STATUS_NOTE_PLAN.md "v2" for why the old
 * agSelectCellEditor was replaced.
 */
@Component({
  selector: 'app-app-status-cell-renderer',
  imports: [MatMenuModule, MatIconModule, MatDividerModule],
  template: `
    <button
      type="button"
      class="status-pill"
      [class.status-pill--empty]="!value"
      [matMenuTriggerFor]="statusMenu"
      (menuOpened)="setMenuOpen(true)"
      (menuClosed)="setMenuOpen(false)"
      aria-label="Set status"
    >
      <span class="status-pill-label">{{ value || 'Set status' }}</span>
      <mat-icon class="status-pill-icon" aria-hidden="true">expand_more</mat-icon>
    </button>
    <mat-menu #statusMenu="matMenu">
      <button mat-menu-item type="button" (click)="select('Sent')">Sent</button>
      <mat-divider></mat-divider>
      <button mat-menu-item type="button" (click)="select('Interview')">Interview</button>
      <button mat-menu-item type="button" (click)="select('Rejected')">Rejected</button>
      <button mat-menu-item type="button" (click)="select('Offer')">Offer</button>
      <button mat-menu-item type="button" (click)="select('Silence')">Silence</button>
      <mat-divider></mat-divider>
      <button mat-menu-item type="button" (click)="select('Skipped')">Skipped…</button>
      <button mat-menu-item type="button" (click)="select('Filter miss')">Filter miss…</button>
      <mat-divider></mat-divider>
      <button mat-menu-item type="button" (click)="select('')">Clear</button>
    </mat-menu>
  `,
  styles: [
    `
      :host {
        display: flex;
        align-items: center;
        height: 100%;
      }
      .status-pill {
        display: inline-flex;
        align-items: center;
        gap: 4px;
        max-width: 100%;
        padding: 4px 8px;
        border: 1px solid var(--color-neutral-300);
        border-radius: var(--radius-pill);
        background: var(--color-surface-2);
        color: var(--color-text);
        font: inherit;
        font-size: 12px;
        font-weight: 600;
        line-height: 1.2;
        cursor: pointer;
      }
      .status-pill:hover {
        border-color: var(--color-neutral-400);
      }
      .status-pill--empty {
        color: var(--color-neutral-600);
        font-weight: 500;
      }
      .status-pill-label {
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
      }
      .status-pill-icon {
        flex-shrink: 0;
        font-size: 16px;
        width: 16px;
        height: 16px;
        color: var(--color-neutral-600);
      }
    `,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AppStatusCellRendererComponent implements ICellRendererAngularComp, OnDestroy {
  private readonly cdr = inject(ChangeDetectorRef);
  private params!: AppStatusCellRendererParams;
  private menuOpen = false;

  value = '';

  setMenuOpen(open: boolean): void {
    if (this.menuOpen === open) return;
    this.menuOpen = open;
    this.params.onMenuOpenChange?.(open);
  }

  ngOnDestroy(): void {
    // A renderer destroyed with its menu open (row scrolled away, grid
    // reloaded) must still release the host's refresh pause.
    this.setMenuOpen(false);
  }

  agInit(params: AppStatusCellRendererParams): void {
    this.params = params;
    this.value = params.value ?? '';
    this.cdr.markForCheck();
  }

  refresh(params: AppStatusCellRendererParams): boolean {
    this.agInit(params);
    return true;
  }

  select(status: string): void {
    this.params.onSelect(this.params.node, status);
  }
}
