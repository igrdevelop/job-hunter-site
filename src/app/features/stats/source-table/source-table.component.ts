import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import { MatTableModule } from '@angular/material/table';
import { SourceStats } from '../../../core/api/models';

const COLUMNS = ['source', 'tracked', 'generated', 'sent', 'confirmed', 'answered', 'conversion'];

interface SourceRow extends SourceStats {
  conversion: number;
}

@Component({
  selector: 'app-source-table',
  imports: [MatTableModule],
  template: `
    <table mat-table [dataSource]="rows()" class="source-table">
      <ng-container matColumnDef="source">
        <th mat-header-cell *matHeaderCellDef>Source</th>
        <td mat-cell *matCellDef="let row">{{ row.source }}</td>
      </ng-container>

      <ng-container matColumnDef="tracked">
        <th mat-header-cell *matHeaderCellDef>Tracked</th>
        <td mat-cell *matCellDef="let row">{{ row.tracked }}</td>
      </ng-container>

      <ng-container matColumnDef="generated">
        <th mat-header-cell *matHeaderCellDef>Generated</th>
        <td mat-cell *matCellDef="let row">{{ row.generated }}</td>
      </ng-container>

      <ng-container matColumnDef="sent">
        <th mat-header-cell *matHeaderCellDef>Sent</th>
        <td mat-cell *matCellDef="let row">{{ row.sent }}</td>
      </ng-container>

      <ng-container matColumnDef="confirmed">
        <th mat-header-cell *matHeaderCellDef>Confirmed</th>
        <td mat-cell *matCellDef="let row">{{ row.confirmed }}</td>
      </ng-container>

      <ng-container matColumnDef="answered">
        <th mat-header-cell *matHeaderCellDef>Answered</th>
        <td mat-cell *matCellDef="let row">{{ row.answered }}</td>
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
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class SourceTableComponent {
  readonly sources = input.required<SourceStats[]>();
  readonly columns = COLUMNS;

  readonly rows = computed<SourceRow[]>(() =>
    this.sources().map((s) => ({
      ...s,
      conversion: s.tracked > 0 ? (s.sent / s.tracked) * 100 : 0,
    })),
  );
}
