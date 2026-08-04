import { Injectable, inject } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { firstValueFrom } from 'rxjs';
import { environment } from '../../../environments/environment';
import {
  Application,
  ApplicationPatch,
  ApplicationsQuery,
  ApplicationsStats,
  AnalyticsPeriod,
  CostSummary,
  FileEntry,
  FunnelPoint,
  PaginatedResult,
  SourceStat,
} from './models';

@Injectable({ providedIn: 'root' })
export class ApiService {
  private readonly http = inject(HttpClient);
  private readonly baseUrl = environment.apiBaseUrl;

  getApplications(query: ApplicationsQuery): Promise<PaginatedResult<Application>> {
    let params = new HttpParams()
      .set('page', query.page)
      .set('pageSize', query.pageSize);

    if (query.sortBy) params = params.set('sortBy', query.sortBy);
    if (query.sortDirection) params = params.set('sortDirection', query.sortDirection);
    if (query.status && query.status !== 'all') params = params.set('status', query.status);
    if (query.search) params = params.set('search', query.search);

    return firstValueFrom(
      this.http.get<PaginatedResult<Application>>(`${this.baseUrl}/applications`, { params }),
    );
  }

  getApplicationsStats(): Promise<ApplicationsStats> {
    return firstValueFrom(
      this.http.get<ApplicationsStats>(`${this.baseUrl}/applications/stats`),
    );
  }

  patchApplication(id: string, data: ApplicationPatch): Promise<Application> {
    return firstValueFrom(
      this.http.patch<Application>(`${this.baseUrl}/applications/${id}`, data),
    );
  }

  getFiles(path: string): Promise<FileEntry[]> {
    return firstValueFrom(
      this.http.get<FileEntry[]>(`${this.baseUrl}/files/${path}`),
    );
  }

  getFileContent(path: string): Promise<string> {
    return firstValueFrom(
      this.http.get(`${this.baseUrl}/files/${path}`, { responseType: 'text' }),
    );
  }

  getFileUrl(path: string): string {
    return `${this.baseUrl}/files/${path}`;
  }

  getFunnel(period: AnalyticsPeriod): Promise<FunnelPoint[]> {
    return firstValueFrom(
      this.http.get<FunnelPoint[]>(`${this.baseUrl}/analytics/funnel`, { params: { period } }),
    );
  }

  getSourceStats(period: AnalyticsPeriod): Promise<SourceStat[]> {
    return firstValueFrom(
      this.http.get<SourceStat[]>(`${this.baseUrl}/analytics/sources`, { params: { period } }),
    );
  }

  getCostSummary(): Promise<CostSummary> {
    return firstValueFrom(
      this.http.get<CostSummary>(`${this.baseUrl}/analytics/cost`),
    );
  }
}
