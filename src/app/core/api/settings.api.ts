import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { firstValueFrom } from 'rxjs';
import { environment } from '../../../environments/environment';
import { SettingsResponse, TelegramLinkCode, TelegramStatus, UserSettingsResponse } from './models';

@Injectable({ providedIn: 'root' })
export class SettingsApi {
  private readonly http = inject(HttpClient);
  private readonly baseUrl = environment.apiBaseUrl;

  getUserSettings(): Promise<UserSettingsResponse> {
    return firstValueFrom(this.http.get<UserSettingsResponse>(`${this.baseUrl}/settings`));
  }

  updateUserSettings(data: Record<string, unknown>): Promise<void> {
    return firstValueFrom(this.http.put<void>(`${this.baseUrl}/settings`, data));
  }

  getGlobalSettings(): Promise<SettingsResponse> {
    return firstValueFrom(
      this.http.get<SettingsResponse>(`${this.baseUrl}/settings/global`),
    );
  }

  getTelegramStatus(): Promise<TelegramStatus> {
    return firstValueFrom(
      this.http.get<TelegramStatus>(`${this.baseUrl}/telegram/status`),
    );
  }

  generateTelegramLinkCode(): Promise<TelegramLinkCode> {
    return firstValueFrom(
      this.http.post<TelegramLinkCode>(`${this.baseUrl}/telegram/link-code`, {}),
    );
  }
}
