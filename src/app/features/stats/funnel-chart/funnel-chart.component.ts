import { Component, computed, input } from '@angular/core';
import { FunnelPoint } from '../../../core/api/models';

interface FunnelBar {
  point: FunnelPoint;
  percent: number;
}

@Component({
  selector: 'app-funnel-chart',
  standalone: true,
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
        gap: 10px;
      }
      .funnel-row {
        display: grid;
        grid-template-columns: 120px 1fr 56px;
        align-items: center;
        gap: 12px;
      }
      .stage {
        font-size: 0.875rem;
        color: rgba(0, 0, 0, 0.7);
      }
      .track {
        background: rgba(0, 0, 0, 0.06);
        border-radius: 4px;
        overflow: hidden;
        height: 20px;
      }
      .fill {
        height: 100%;
        background: #1565c0;
        border-radius: 4px;
        transition: width 0.3s ease;
      }
      .count {
        text-align: right;
        font-weight: 600;
        font-size: 0.875rem;
      }
    `,
  ],
})
export class FunnelChartComponent {
  readonly points = input.required<FunnelPoint[]>();

  readonly bars = computed<FunnelBar[]>(() => {
    const points = this.points();
    const max = Math.max(1, ...points.map((p) => p.count));
    return points.map((point) => ({ point, percent: (point.count / max) * 100 }));
  });
}
