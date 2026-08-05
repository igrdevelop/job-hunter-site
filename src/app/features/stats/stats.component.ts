import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  resource,
  signal,
} from '@angular/core';
import { MatButtonToggleModule } from '@angular/material/button-toggle';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { AnalyticsApi } from '../../core/api/analytics.api';
import { AnalyticsPeriod, periodToDays } from '../../core/api/models';
import { FunnelChartComponent } from './funnel-chart/funnel-chart.component';
import { SourceTableComponent } from './source-table/source-table.component';
import { CostSummaryComponent } from './cost-summary/cost-summary.component';

const PERIODS: AnalyticsPeriod[] = ['7d', '30d', '90d', 'all'];

const STAGE_LABELS: Record<string, string> = {
  tracked: 'Tracked',
  generated: 'Generated',
  sent: 'Sent',
  confirmed: 'Confirmed',
  answered: 'Answered',
};
const STAGE_ORDER = ['tracked', 'generated', 'sent', 'confirmed', 'answered'];

@Component({
  selector: 'app-stats',
  imports: [
    MatButtonToggleModule,
    MatProgressSpinnerModule,
    FunnelChartComponent,
    SourceTableComponent,
    CostSummaryComponent,
  ],
  templateUrl: './stats.component.html',
  styleUrl: './stats.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class StatsComponent {
  private readonly api = inject(AnalyticsApi);

  readonly period = signal<AnalyticsPeriod>('30d');
  readonly periods = PERIODS;

  private readonly analyticsResource = resource({
    params: () => periodToDays(this.period()),
    loader: async ({ params: days }) => {
      const [funnel, sources, costSummary] = await Promise.all([
        this.api.getFunnel(days),
        this.api.getSourceStats(days),
        this.api.getCostSummary(days),
      ]);
      return {
        funnel: STAGE_ORDER.map((stage) => ({
          stage: STAGE_LABELS[stage],
          count: funnel[stage as keyof typeof funnel],
        })),
        sources,
        costSummary,
      };
    },
  });

  readonly funnel = computed(() => this.analyticsResource.value()?.funnel ?? []);
  readonly sources = computed(() => this.analyticsResource.value()?.sources ?? []);
  readonly costSummary = computed(() => this.analyticsResource.value()?.costSummary ?? null);
  readonly loading = this.analyticsResource.isLoading;
  readonly errorMessage = computed(() =>
    this.analyticsResource.error()
      ? 'Could not load statistics. Is the API reachable?'
      : null,
  );

  onPeriodChange(period: AnalyticsPeriod): void {
    this.period.set(period);
  }
}
