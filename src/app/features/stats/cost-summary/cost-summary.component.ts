import { ChangeDetectionStrategy, Component, input } from '@angular/core';
import { CostSummary } from '../../../core/api/models';

@Component({
  selector: 'app-cost-summary',
  template: `
    <div class="cards">
      <div class="card blueprint stat">
        <i class="corner tl"></i><i class="corner tr"></i><i class="corner bl"></i><i class="corner br"></i>
        <div class="card-title value">&dollar;{{ summary().totalCostUsd.toFixed(2) }}</div>
        <div class="card-body">Total spend</div>
      </div>
      <div class="card blueprint stat">
        <i class="corner tl"></i><i class="corner tr"></i><i class="corner bl"></i><i class="corner br"></i>
        <div class="card-title value">&dollar;{{ summary().averageCostUsd.toFixed(3) }}</div>
        <div class="card-body">Average per apply</div>
      </div>
      <div class="card blueprint stat">
        <i class="corner tl"></i><i class="corner tr"></i><i class="corner bl"></i><i class="corner br"></i>
        <div class="card-title value">{{ summary().applicationsWithCost }}</div>
        <div class="card-body">Applications with cost</div>
      </div>
    </div>
  `,
  styles: [
    `
      .cards {
        display: grid;
        grid-template-columns: repeat(auto-fit, minmax(160px, 1fr));
        gap: var(--space-3);
      }
      .stat {
        padding: var(--space-3);
      }
      .value {
        font-size: 24px;
      }
    `,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class CostSummaryComponent {
  readonly summary = input.required<CostSummary>();
}
