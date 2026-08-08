import { Injectable, inject } from '@angular/core';
import { HttpClient, HttpErrorResponse } from '@angular/common/http';
import { firstValueFrom } from 'rxjs';
import { environment } from '../../../environments/environment';
import { FilterOverrides, FiltersPayload } from './models';
import { cloneFiltersMock } from './filters.mock';

/**
 * Temporary GET 404 → mock fixture bridge while `/api/filters` is undeployed.
 * TODO(filters-api): set to `false` (then delete the flag + mock fallback path)
 * once GET /api/filters is live — silent mock on a broken API hides real outages.
 */
export const FILTERS_MOCK_FALLBACK_ENABLED = true;

@Injectable({ providedIn: 'root' })
export class FiltersApi {
  private readonly http = inject(HttpClient);
  private readonly baseUrl = environment.apiBaseUrl;

  /**
   * GET /api/filters → { defaults, overrides, effective, meta }.
   * Optional temporary mock on 404 when FILTERS_MOCK_FALLBACK_ENABLED.
   */
  async get(): Promise<FiltersPayload> {
    try {
      return await firstValueFrom(
        this.http.get<FiltersPayload>(`${this.baseUrl}/filters`),
      );
    } catch (err) {
      if (FILTERS_MOCK_FALLBACK_ENABLED && isNotFound(err)) {
        console.warn(
          '[FiltersApi] GET /api/filters returned 404 — serving temporary mock fixture. ' +
            'TODO: disable FILTERS_MOCK_FALLBACK_ENABLED when the endpoint is live.',
        );
        return cloneFiltersMock();
      }
      throw err;
    }
  }

  /**
   * PUT /api/filters — body = overrides only.
   * Success returns a fresh GET payload. 400 → FiltersErrors body.
   * Never fabricates success on 404 (that would hide a missing/broken API).
   */
  put(overrides: FilterOverrides): Promise<FiltersPayload> {
    return firstValueFrom(
      this.http.put<FiltersPayload>(`${this.baseUrl}/filters`, overrides),
    );
  }
}

function isNotFound(err: unknown): boolean {
  return err instanceof HttpErrorResponse && err.status === 404;
}
