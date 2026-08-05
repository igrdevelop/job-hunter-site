import { Injectable, inject } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { firstValueFrom } from 'rxjs';
import { environment } from '../../../environments/environment';
import { CostSummary, FunnelData, SourceStats } from './models';

@Injectable({ providedIn: 'root' })
export class AnalyticsApi {
  private readonly http = inject(HttpClient);
  private readonly baseUrl = environment.apiBaseUrl;

  getFunnel(days?: number): Promise<FunnelData> {
    const params = days ? new HttpParams().set('days', days) : undefined;
    return firstValueFrom(
      this.http.get<FunnelData>(`${this.baseUrl}/analytics/funnel`, { params }),
    );
  }

  getSourceStats(days?: number): Promise<SourceStats[]> {
    const params = days ? new HttpParams().set('days', days) : undefined;
    return firstValueFrom(
      this.http.get<SourceStats[]>(`${this.baseUrl}/analytics/sources`, { params }),
    );
  }

  getCostSummary(days?: number): Promise<CostSummary> {
    const params = days ? new HttpParams().set('days', days) : undefined;
    return firstValueFrom(
      this.http.get<CostSummary>(`${this.baseUrl}/analytics/cost`, { params }),
    );
  }
}
