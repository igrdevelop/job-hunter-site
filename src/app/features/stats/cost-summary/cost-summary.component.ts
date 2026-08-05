import { ChangeDetectionStrategy, Component, input } from '@angular/core';
import { CostSummary } from '../../../core/api/models';

@Component({
  selector: 'app-cost-summary',
  template: `
    <div class="cards">
      <div class="card">
        <span class="value">&dollar;{{ summary().totalCostUsd.toFixed(2) }}</span>
        <span class="label">Total spend</span>
      </div>
      <div class="card">
        <span class="value">&dollar;{{ summary().averageCostUsd.toFixed(3) }}</span>
        <span class="label">Average per apply</span>
      </div>
      <div class="card">
        <span class="value">{{ summary().applicationsWithCost }}</span>
        <span class="label">Applications with cost</span>
      </div>
    </div>
  `,
  styles: [
    `
      .cards {
        display: grid;
        grid-template-columns: repeat(auto-fit, minmax(140px, 1fr));
        gap: 12px;
      }
      .card {
        display: flex;
        flex-direction: column;
        gap: 4px;
        padding: 16px;
        border-radius: 8px;
        background: rgba(0, 0, 0, 0.04);
      }
      .value {
        font-size: 1.5rem;
        font-weight: 600;
      }
      .label {
        font-size: 0.75rem;
        color: rgba(0, 0, 0, 0.6);
      }
    `,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class CostSummaryComponent {
  readonly summary = input.required<CostSummary>();
}
