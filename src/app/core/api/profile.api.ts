import { Injectable, inject } from '@angular/core';
import { HttpClient, HttpErrorResponse } from '@angular/common/http';
import { firstValueFrom } from 'rxjs';
import { environment } from '../../../environments/environment';
import {
  ProfileDocument,
  ProfileGetResponse,
  ProfileJob,
  ProfilePreviewCreated,
  ProfilePreviewListItem,
  ProfilePutResponse,
  ProfileRenderedFile,
  ProfileRevision,
  ProfileUploadListEntry,
  ProfileUploadResponse,
} from './models';
import { cloneProfileMock } from '../../features/profile-editor/mock/profile.mock';

/**
 * Temporary GET 404 → mock fixture bridge while `/api/profile` is undeployed
 * (job-hunter-api P1 not shipped yet). Exact FILTERS_MOCK_FALLBACK_ENABLED
 * semantics: PUT never fakes success.
 * Gated on `!environment.production` — unlike a plain `true` constant, this
 * can't accidentally keep serving fake "Jane Doe" data to real new users
 * once GET /api/profile deploys to production. A real 404 there legitimately
 * means "no profile yet" and must reach the empty state, not this mock.
 * TODO(profile-api): delete the flag + mock fallback path entirely once
 * GET /api/profile is live in dev too.
 */
export const PROFILE_MOCK_FALLBACK_ENABLED = !environment.production;

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

  /** POST /api/profile/uploads — multipart docx|pdf|txt|md ≤ 10 MB → { jobId }. */
  upload(file: File): Promise<ProfileUploadResponse> {
    const formData = new FormData();
    formData.append('file', file);
    return firstValueFrom(
      this.http.post<ProfileUploadResponse>(`${this.baseUrl}/profile/uploads`, formData),
    );
  }

  /**
   * GET /api/profile/jobs/:id — poll a render/parse job's status.
   *
   * The API's `result` field is a JSON-ENCODED STRING on the wire (the raw
   * `profile_jobs.result` column), not an object — the typed model hid that,
   * and the upload confirmation screen silently rendered empty Skills/Roles
   * for EVERY real upload (TypeError in the console; found live by the E4
   * smoke run, 2026-09-03). Parse it here, once, defensively: a result that
   * isn't valid JSON (or isn't a parse job's document) comes back as
   * undefined rather than poisoning the caller.
   */
  async getJob(jobId: string): Promise<ProfileJob> {
    const raw = await firstValueFrom(
      this.http.get<Omit<ProfileJob, 'result'> & { result?: string }>(
        `${this.baseUrl}/profile/jobs/${jobId}`,
      ),
    );
    let result: ProfileJob['result'];
    if (typeof raw.result === 'string' && raw.result.length > 0) {
      try {
        const parsed: unknown = JSON.parse(raw.result);
        if (parsed !== null && typeof parsed === 'object' && !Array.isArray(parsed)) {
          result = parsed as ProfileJob['result'];
        }
      } catch {
        // Non-JSON result (e.g. a render job's written-file list shape
        // changing) — leave undefined, the dialog's error path handles it.
      }
    }
    return { ...raw, result };
  }

  /** GET /api/profile/revisions — newest first, per the API contract. */
  getRevisions(): Promise<ProfileRevision[]> {
    return firstValueFrom(
      this.http.get<ProfileRevision[]>(`${this.baseUrl}/profile/revisions`),
    );
  }

  /** POST /api/profile/revisions/:rev/restore — same response shape as PUT; the caller re-GETs the document. */
  restoreRevision(rev: number): Promise<ProfilePutResponse> {
    return firstValueFrom(
      this.http.post<ProfilePutResponse>(`${this.baseUrl}/profile/revisions/${rev}/restore`, {}),
    );
  }

  // ── Tab 1 (Uploads) — docs/PROFILE_PAGE_TABS.md T2, not deployed yet ─────

  /**
   * GET /api/profile/uploads — no mock fallback (this is a listing endpoint,
   * not a document GET; faking rows would misrepresent real upload history).
   * The caller is responsible for treating a 404 as "not deployed yet" —
   * same discipline as tab 3's file listing below.
   */
  listUploads(): Promise<ProfileUploadListEntry[]> {
    return firstValueFrom(
      this.http.get<ProfileUploadListEntry[]>(`${this.baseUrl}/profile/uploads`),
    );
  }

  // ── Tab 3 (Rendered files) — docs/PROFILE_PAGE_TABS.md T2, not deployed yet ─

  /** GET /api/profile/files — the rendered files list (whitelist-enforced server-side). */
  listRenderedFiles(): Promise<ProfileRenderedFile[]> {
    return firstValueFrom(
      this.http.get<ProfileRenderedFile[]>(`${this.baseUrl}/profile/files`),
    );
  }

  /** GET /api/profile/files/:name — read-only content viewer. Never a mutation. */
  getRenderedFileContent(name: string): Promise<string> {
    return firstValueFrom(
      this.http.get(`${this.baseUrl}/profile/files/${encodeURIComponent(name)}`, {
        responseType: 'text',
      }),
    );
  }

  // ── Tab 4 (Test resume) — docs/PROFILE_PAGE_TABS.md T1, deployed ─────────

  /**
   * POST /api/profile/preview → 201 { jobId }. Poll via the existing getJob().
   * 409 = no stored profile yet (caller shows the "publish first" empty state);
   * 429 = throttled (10/hour/user).
   */
  requestPreview(track: string): Promise<ProfilePreviewCreated> {
    return firstValueFrom(
      this.http.post<ProfilePreviewCreated>(`${this.baseUrl}/profile/preview`, { track }),
    );
  }

  /** GET /api/profile/previews — newest-first history, per the API contract. */
  listPreviews(): Promise<ProfilePreviewListItem[]> {
    return firstValueFrom(
      this.http.get<ProfilePreviewListItem[]>(`${this.baseUrl}/profile/previews`),
    );
  }

  /** GET /api/profile/previews/:track/:ts/:file — direct URL for the auth-token download pattern. */
  getPreviewFileUrl(track: string, timestamp: string, file: string): string {
    return `${this.baseUrl}/profile/previews/${encodeURIComponent(track)}/${encodeURIComponent(timestamp)}/${encodeURIComponent(file)}`;
  }
}

function isNotFound(err: unknown): boolean {
  return err instanceof HttpErrorResponse && err.status === 404;
}
