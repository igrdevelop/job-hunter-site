import { Injectable, inject } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { firstValueFrom } from 'rxjs';
import { environment } from '../../../environments/environment';
import {
  Application,
  ApplicationPatch,
  ApplicationsQuery,
  ApplicationStats,
  CostSummary,
  FileInfo,
  FolderInfo,
  FunnelData,
  PaginatedResult,
  SourceStats,
} from './models';

@Injectable({ providedIn: 'root' })
export class ApiService {
  private readonly http = inject(HttpClient);
  private readonly baseUrl = environment.apiBaseUrl;

  getApplications(query: ApplicationsQuery): Promise<PaginatedResult<Application>> {
    let params = new HttpParams()
      .set('page', query.page)
      .set('limit', query.limit);

    if (query.sort) params = params.set('sort', query.sort);
    if (query.order) params = params.set('order', query.order);
    if (query.status && query.status !== 'all') params = params.set('status', query.status);
    if (query.search) params = params.set('search', query.search);

    return firstValueFrom(
      this.http.get<PaginatedResult<Application>>(`${this.baseUrl}/applications`, { params }),
    );
  }

  getApplicationStats(): Promise<ApplicationStats> {
    return firstValueFrom(
      this.http.get<ApplicationStats>(`${this.baseUrl}/applications/stats`),
    );
  }

  patchApplication(id: string, data: ApplicationPatch): Promise<Application> {
    return firstValueFrom(
      this.http.patch<Application>(`${this.baseUrl}/applications/${id}`, data),
    );
  }

  getFiles(path: string): Promise<(FolderInfo | FileInfo)[]> {
    return firstValueFrom(
      this.http.get<(FolderInfo | FileInfo)[]>(`${this.baseUrl}/files/${path}`),
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
