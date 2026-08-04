import { Component, inject, signal } from '@angular/core';
import { MatButtonToggleModule } from '@angular/material/button-toggle';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { ApiService } from '../../core/api/api.service';
import { AnalyticsPeriod, CostSummary, FunnelPoint, SourceStat } from '../../core/api/models';
import { FunnelChartComponent } from './funnel-chart/funnel-chart.component';
import { SourceTableComponent } from './source-table/source-table.component';
import { CostSummaryComponent } from './cost-summary/cost-summary.component';

const PERIODS: AnalyticsPeriod[] = ['7d', '30d', '90d', 'all'];

@Component({
  selector: 'app-stats',
  standalone: true,
  imports: [
    MatButtonToggleModule,
    MatProgressSpinnerModule,
    FunnelChartComponent,
    SourceTableComponent,
    CostSummaryComponent,
  ],
  templateUrl: './stats.component.html',
  styleUrl: './stats.component.scss',
})
export class StatsComponent {
  private readonly api = inject(ApiService);

  readonly period = signal<AnalyticsPeriod>('30d');
  readonly periods = PERIODS;

  readonly funnel = signal<FunnelPoint[]>([]);
  readonly sources = signal<SourceStat[]>([]);
  readonly costSummary = signal<CostSummary | null>(null);

  readonly loading = signal(false);
  readonly errorMessage = signal<string | null>(null);

  constructor() {
    void this.load();
  }

  async load(): Promise<void> {
    this.loading.set(true);
    this.errorMessage.set(null);

    try {
      const [funnel, sources, costSummary] = await Promise.all([
        this.api.getFunnel(this.period()),
        this.api.getSourceStats(this.period()),
        this.api.getCostSummary(),
      ]);
      this.funnel.set(funnel);
      this.sources.set(sources);
      this.costSummary.set(costSummary);
    } catch {
      this.errorMessage.set('Could not load statistics. Is the API reachable?');
    } finally {
      this.loading.set(false);
    }
  }

  onPeriodChange(period: AnalyticsPeriod): void {
    this.period.set(period);
    void this.load();
  }
}
