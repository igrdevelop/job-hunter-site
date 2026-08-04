import { Component } from '@angular/core';
import { MatIconModule } from '@angular/material/icon';
import { ICellRendererAngularComp } from 'ag-grid-angular';
import { ICellRendererParams } from 'ag-grid-community';

@Component({
  selector: 'app-url-cell-renderer',
  standalone: true,
  imports: [MatIconModule],
  template: `
    @if (url) {
      <a [href]="url" target="_blank" rel="noopener">
        <mat-icon>open_in_new</mat-icon>
      </a>
    }
  `,
  styles: [
    `
      a {
        display: inline-flex;
        align-items: center;
        color: inherit;
      }
      mat-icon {
        font-size: 20px;
        width: 20px;
        height: 20px;
      }
    `,
  ],
})
export class UrlCellRendererComponent implements ICellRendererAngularComp {
  url = '';

  agInit(params: ICellRendererParams): void {
    this.url = (params.value as string) ?? '';
  }

  refresh(params: ICellRendererParams): boolean {
    this.agInit(params);
    return true;
  }
}
