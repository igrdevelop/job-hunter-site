import { Injectable, inject } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { firstValueFrom } from 'rxjs';
import { environment } from '../../../environments/environment';
import { Template, TemplateCategory } from './models';

@Injectable({ providedIn: 'root' })
export class TemplatesApi {
  private readonly http = inject(HttpClient);
  private readonly baseUrl = environment.apiBaseUrl;

  getAll(category?: TemplateCategory): Promise<Template[]> {
    const params = category ? new HttpParams().set('category', category) : undefined;
    return firstValueFrom(
      this.http.get<Template[]>(`${this.baseUrl}/templates`, { params }),
    );
  }

  getContentUrl(id: string): string {
    return `${this.baseUrl}/templates/${id}/content`;
  }

  getContent(id: string): Promise<string> {
    return firstValueFrom(
      this.http.get(this.getContentUrl(id), { responseType: 'text' }),
    );
  }

  upload(
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

  delete(id: string): Promise<void> {
    return firstValueFrom(
      this.http.delete<void>(`${this.baseUrl}/templates/${id}`),
    );
  }
}
