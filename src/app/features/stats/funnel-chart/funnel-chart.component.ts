import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import { FunnelPoint } from '../../../core/api/models';

interface FunnelBar {
  point: FunnelPoint;
  percent: number;
}

@Component({
  selector: 'app-funnel-chart',
  template: `
    <div class="funnel">
      @for (bar of bars(); track bar.point.stage) {
        <div class="funnel-row">
          <span class="stage">{{ bar.point.stage }}</span>
          <div class="track">
            <div class="fill" [style.width.%]="bar.percent"></div>
          </div>
          <span class="count">{{ bar.point.count }}</span>
        </div>
      }
    </div>
  `,
  styles: [
    `
      .funnel {
        display: flex;
        flex-direction: column;
        gap: var(--space-3);
      }
      .funnel-row {
        display: grid;
        grid-template-columns: 120px 1fr 56px;
        align-items: center;
        gap: var(--space-3);
      }
      .stage {
        font-size: 14px;
        color: var(--color-neutral-700);
      }
      .track {
        background: var(--color-neutral-100);
        border: 1px solid var(--color-neutral-200);
        overflow: hidden;
        height: 20px;
      }
      .fill {
        height: 100%;
        background: var(--color-accent-500);
        transition: width 0.3s ease;
      }
      .count {
        text-align: right;
        font-weight: 600;
        font-family: var(--font-heading);
        font-size: 14px;
      }
    `,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class FunnelChartComponent {
  readonly points = input.required<FunnelPoint[]>();

  readonly bars = computed<FunnelBar[]>(() => {
    const points = this.points();
    const max = Math.max(1, ...points.map((p) => p.count));
    return points.map((point) => ({ point, percent: (point.count / max) * 100 }));
  });
}
