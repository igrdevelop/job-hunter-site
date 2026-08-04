import { Component, inject } from '@angular/core';
import { Router } from '@angular/router';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { ICellRendererAngularComp } from 'ag-grid-angular';
import { ICellRendererParams } from 'ag-grid-community';
import { Application } from '../../../core/api/models';

@Component({
  selector: 'app-folder-cell-renderer',
  standalone: true,
  imports: [MatIconModule, MatButtonModule],
  template: `
    <button mat-icon-button type="button" aria-label="Open folder" (click)="openFolder()">
      <mat-icon>folder</mat-icon>
    </button>
  `,
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
