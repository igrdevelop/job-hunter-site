import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import { SourceStats } from '../../../core/api/models';

interface SourceRow extends SourceStats {
  conversion: number;
}

@Component({
  selector: 'app-source-table',
  template: `
    <table class="table">
      <thead>
        <tr>
          <th>Source</th>
          <th>Tracked</th>
          <th>Generated</th>
          <th>Sent</th>
          <th>Confirmed</th>
          <th>Answered</th>
          <th>Conversion</th>
        </tr>
      </thead>
      <tbody>
        @for (row of rows(); track row.source) {
          <tr>
            <td>{{ row.source }}</td>
            <td>{{ row.tracked }}</td>
            <td>{{ row.generated }}</td>
            <td>{{ row.sent }}</td>
            <td>{{ row.confirmed }}</td>
            <td>{{ row.answered }}</td>
            <td>{{ row.conversion.toFixed(1) }}%</td>
          </tr>
        }
      </tbody>
    </table>
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class SourceTableComponent {
  readonly sources = input.required<SourceStats[]>();

  readonly rows = computed<SourceRow[]>(() =>
    this.sources().map((s) => ({
      ...s,
      conversion: s.tracked > 0 ? (s.sent / s.tracked) * 100 : 0,
    })),
  );
}
