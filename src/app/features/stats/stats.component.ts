import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  resource,
} from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { ActivatedRoute, Router } from '@angular/router';
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
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);

  private readonly queryParams = toSignal(this.route.queryParamMap, { requireSync: true });

  /** Analytics period, driven by the ?period= query param (default 30d). */
  readonly period = computed<AnalyticsPeriod>(() => {
    const raw = this.queryParams().get('period');
    return PERIODS.includes(raw as AnalyticsPeriod) ? (raw as AnalyticsPeriod) : '30d';
  });
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
    void this.router.navigate([], {
      relativeTo: this.route,
      queryParams: { period: period === '30d' ? null : period },
      queryParamsHandling: 'merge',
    });
  }
}
