import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { firstValueFrom } from 'rxjs';
import { environment } from '../../../environments/environment';
import { FileInfo, FolderInfo } from './models';

@Injectable({ providedIn: 'root' })
export class FilesApi {
  private readonly http = inject(HttpClient);
  private readonly baseUrl = environment.apiBaseUrl;

  getGenerated(path = ''): Promise<(FolderInfo | FileInfo)[]> {
    const url = path
      ? `${this.baseUrl}/generated/${path}`
      : `${this.baseUrl}/generated`;
    return firstValueFrom(this.http.get<(FolderInfo | FileInfo)[]>(url));
  }

  async getGeneratedFileContent(path: string): Promise<string> {
    const blob = await firstValueFrom(
      this.http.get(`${this.baseUrl}/generated/${path}`, { responseType: 'blob' }),
    );
    return blob.text();
  }

  getGeneratedFileUrl(path: string): string {
    return `${this.baseUrl}/generated/${path}`;
  }

  getProfileFiles(path = ''): Promise<(FolderInfo | FileInfo)[]> {
    const url = path
      ? `${this.baseUrl}/files/${path}`
      : `${this.baseUrl}/files`;
    return firstValueFrom(this.http.get<(FolderInfo | FileInfo)[]>(url));
  }

  getProfileFileContent(path: string): Promise<string> {
    return firstValueFrom(
      this.http.get(`${this.baseUrl}/files/${path}`, { responseType: 'text' }),
    );
  }

  getProfileFileUrl(path: string): string {
    return `${this.baseUrl}/files/${path}`;
  }
}
