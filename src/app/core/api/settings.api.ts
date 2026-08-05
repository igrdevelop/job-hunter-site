import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { firstValueFrom } from 'rxjs';
import { environment } from '../../../environments/environment';
import { SettingsResponse } from './models';

@Injectable({ providedIn: 'root' })
export class SettingsApi {
  private readonly http = inject(HttpClient);
  private readonly baseUrl = environment.apiBaseUrl;

  getSettings(): Promise<SettingsResponse> {
    return firstValueFrom(
      this.http.get<SettingsResponse>(`${this.baseUrl}/settings`),
    );
  }
}
