import { Injectable, inject } from '@angular/core';
import { HttpClient, HttpErrorResponse } from '@angular/common/http';
import { firstValueFrom } from 'rxjs';
import { environment } from '../../../environments/environment';
import { ProfileDocument, ProfileGetResponse, ProfilePutResponse } from './models';
import { cloneProfileMock } from '../../features/profile-editor/mock/profile.mock';

/**
 * Temporary GET 404 → mock fixture bridge while `/api/profile` is undeployed
 * (job-hunter-api P1 not shipped yet). Exact FILTERS_MOCK_FALLBACK_ENABLED
 * semantics: PUT never fakes success.
 * TODO(profile-api): set to `false` (then delete the flag + mock fallback
 * path) once GET /api/profile is live — a real 404 there legitimately means
 * "no profile yet" and must reach the empty state, not this mock.
 */
export const PROFILE_MOCK_FALLBACK_ENABLED = true;

@Injectable({ providedIn: 'root' })
export class ProfileApi {
  private readonly http = inject(HttpClient);
  private readonly baseUrl = environment.apiBaseUrl;

  /**
   * GET /api/profile → { profile, revision, updatedAt }.
   * A real 404 means "no profile yet" → resolves to `null` so the caller
   * renders the empty-state CTA. Optional temporary mock fixture on 404
   * when PROFILE_MOCK_FALLBACK_ENABLED, standing in for the deployed API.
   */
  async get(): Promise<ProfileGetResponse | null> {
    try {
      return await firstValueFrom(
        this.http.get<ProfileGetResponse>(`${this.baseUrl}/profile`),
      );
    } catch (err) {
      if (isNotFound(err)) {
        if (PROFILE_MOCK_FALLBACK_ENABLED) {
          console.warn(
            '[ProfileApi] GET /api/profile returned 404 — serving temporary mock fixture. ' +
              'TODO: disable PROFILE_MOCK_FALLBACK_ENABLED when the endpoint is live.',
          );
          return cloneProfileMock();
        }
        return null;
      }
      throw err;
    }
  }

  /**
   * PUT /api/profile — body = the full document (server stores full
   * documents, not deltas). Never fakes success on 404 (that would hide a
   * missing/broken API). 400 → ProfileErrors body.
   */
  put(profile: ProfileDocument): Promise<ProfilePutResponse> {
    return firstValueFrom(
      this.http.put<ProfilePutResponse>(`${this.baseUrl}/profile`, profile),
    );
  }
}

function isNotFound(err: unknown): boolean {
  return err instanceof HttpErrorResponse && err.status === 404;
}
