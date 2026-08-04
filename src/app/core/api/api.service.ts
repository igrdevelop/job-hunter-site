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
  Template,
  TemplateCategory,
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

  /** List candidate/ (personal assets). Empty path = root. */
  getFiles(path = ''): Promise<(FolderInfo | FileInfo)[]> {
    const url = path
      ? `${this.baseUrl}/files/${path}`
      : `${this.baseUrl}/files`;
    return firstValueFrom(this.http.get<(FolderInfo | FileInfo)[]>(url));
  }

  getFileContent(path: string): Promise<string> {
    return firstValueFrom(
      this.http.get(`${this.baseUrl}/files/${path}`, { responseType: 'text' }),
    );
  }

  getFileUrl(path: string): string {
    return `${this.baseUrl}/files/${path}`;
  }

  uploadFile(file: File, path?: string): Promise<FileInfo> {
    const formData = new FormData();
    formData.append('file', file);
    const url = path
      ? `${this.baseUrl}/files/${path}`
      : `${this.baseUrl}/files`;
    return firstValueFrom(this.http.post<FileInfo>(url, formData));
  }

  /** Browse Applications/{date}/{company}/ generated docs. */
  getGenerated(path = ''): Promise<(FolderInfo | FileInfo)[]> {
    const url = path
      ? `${this.baseUrl}/generated/${path}`
      : `${this.baseUrl}/generated`;
    return firstValueFrom(this.http.get<(FolderInfo | FileInfo)[]>(url));
  }

  getGeneratedContent(path: string): Promise<string> {
    return firstValueFrom(
      this.http.get(`${this.baseUrl}/generated/${path}`, { responseType: 'text' }),
    );
  }

  getGeneratedUrl(path: string): string {
    return `${this.baseUrl}/generated/${path}`;
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

  getTemplates(category?: TemplateCategory): Promise<Template[]> {
    const params = category ? new HttpParams().set('category', category) : undefined;
    return firstValueFrom(
      this.http.get<Template[]>(`${this.baseUrl}/templates`, { params }),
    );
  }

  getTemplateContentUrl(id: string): string {
    return `${this.baseUrl}/templates/${id}/content`;
  }

  getTemplateContent(id: string): Promise<string> {
    return firstValueFrom(
      this.http.get(this.getTemplateContentUrl(id), { responseType: 'text' }),
    );
  }

  uploadTemplate(
    file: File,
    meta: { name: string; category: TemplateCategory; description?: string },
  ): Promise<Template> {
    const formData = new FormData();
    formData.append('file', file);
    formData.append('name', meta.name);
    formData.append('category', meta.category);
    if (meta.description) formData.append('description', meta.description);
    return firstValueFrom(
      this.http.post<Template>(`${this.baseUrl}/templates`, formData),
    );
  }

  deleteTemplate(id: string): Promise<void> {
    return firstValueFrom(
      this.http.delete<void>(`${this.baseUrl}/templates/${id}`),
    );
  }
}
