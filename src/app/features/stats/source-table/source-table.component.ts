import { Component, input } from '@angular/core';
import { MatTableModule } from '@angular/material/table';
import { SourceStat } from '../../../core/api/models';

const COLUMNS = ['source', 'tracked', 'applied', 'sent', 'conversion'];

@Component({
  selector: 'app-source-table',
  standalone: true,
  imports: [MatTableModule],
  template: `
    <table mat-table [dataSource]="sources()" class="source-table">
      <ng-container matColumnDef="source">
        <th mat-header-cell *matHeaderCellDef>Source</th>
        <td mat-cell *matCellDef="let row">{{ row.source }}</td>
      </ng-container>

      <ng-container matColumnDef="tracked">
        <th mat-header-cell *matHeaderCellDef>Tracked</th>
        <td mat-cell *matCellDef="let row">{{ row.tracked }}</td>
      </ng-container>

      <ng-container matColumnDef="applied">
        <th mat-header-cell *matHeaderCellDef>Applied</th>
        <td mat-cell *matCellDef="let row">{{ row.applied }}</td>
      </ng-container>

      <ng-container matColumnDef="sent">
        <th mat-header-cell *matHeaderCellDef>Sent</th>
        <td mat-cell *matCellDef="let row">{{ row.sent }}</td>
      </ng-container>

      <ng-container matColumnDef="conversion">
        <th mat-header-cell *matHeaderCellDef>Conversion</th>
        <td mat-cell *matCellDef="let row">{{ row.conversion.toFixed(1) }}%</td>
      </ng-container>

      <tr mat-header-row *matHeaderRowDef="columns"></tr>
      <tr mat-row *matRowDef="let row; columns: columns"></tr>
    </table>
  `,
  styles: [
    `
      .source-table {
        width: 100%;
      }
    `,
  ],
})
export class SourceTableComponent {
  readonly sources = input.required<SourceStat[]>();
  readonly columns = COLUMNS;
}
