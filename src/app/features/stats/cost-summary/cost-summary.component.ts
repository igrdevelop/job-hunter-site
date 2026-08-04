import { Component, input } from '@angular/core';
import { CostSummary } from '../../../core/api/models';

@Component({
  selector: 'app-cost-summary',
  standalone: true,
  template: `
    <div class="cards">
      <div class="card">
        <span class="value">&dollar;{{ summary().totalSpend.toFixed(2) }}</span>
        <span class="label">Total spend</span>
      </div>
      <div class="card">
        <span class="value">&dollar;{{ summary().medianPerApply.toFixed(3) }}</span>
        <span class="label">Median per apply</span>
      </div>
      <div class="card">
        <span class="value">&dollar;{{ summary().last7Days.toFixed(2) }}</span>
        <span class="label">Last 7 days</span>
      </div>
      <div class="card">
        <span class="value">&dollar;{{ summary().last30Days.toFixed(2) }}</span>
        <span class="label">Last 30 days</span>
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
})
export class CostSummaryComponent {
  readonly summary = input.required<CostSummary>();
}
