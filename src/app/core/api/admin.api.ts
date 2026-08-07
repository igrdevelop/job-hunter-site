import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { firstValueFrom } from 'rxjs';
import { environment } from '../../../environments/environment';
import { AdminUser } from './models';

@Injectable({ providedIn: 'root' })
export class AdminApi {
  private readonly http = inject(HttpClient);
  private readonly baseUrl = environment.apiBaseUrl;

  getUsers(): Promise<AdminUser[]> {
    return firstValueFrom(this.http.get<AdminUser[]>(`${this.baseUrl}/admin/users`));
  }

  setDisabled(id: string, disabled: boolean): Promise<AdminUser> {
    return firstValueFrom(
      this.http.patch<AdminUser>(`${this.baseUrl}/admin/users/${id}`, { disabled }),
    );
  }

  deleteUser(id: string): Promise<void> {
    return firstValueFrom(this.http.delete<void>(`${this.baseUrl}/admin/users/${id}`));
  }
}
