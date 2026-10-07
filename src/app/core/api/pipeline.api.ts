import { Injectable, inject } from '@angular/core';
import { HttpClient, HttpErrorResponse, HttpParams } from '@angular/common/http';
import { firstValueFrom } from 'rxjs';
import { environment } from '../../../environments/environment';
import {
  BotCommand,
  BotCommandKind,
  HuntDetail,
  HuntsResponse,
  PipelineDays,
  PipelineSnapshot,
  PipelineSnapshotResult,
  PostCommandBody,
} from './pipeline.models';
import { clonePipelineSample } from './pipeline.mock';

/**
 * Temporary GET 404 → sample-snapshot bridge while `/api/pipeline/snapshot` is
 * undeployed (bot repo docs/PIPELINE_VIZ_PLAN.md M2 ships the endpoint in
 * job-hunter-api). Unlike the filters mock, the sample is never passed off as
 * real data: the result carries `sample: true` and the page shows a banner.
 * Gated on `!environment.production` (same as PROFILE_MOCK_FALLBACK_ENABLED):
 * job-hunter-api ships GET /api/pipeline/snapshot on master, so a production
 * build must show the real error on a 404 instead of a sample — and the local
 * e2e suite (e2e/, production configuration) must never pass on sample data.
 * TODO(pipeline-api): delete the flag + mock fallback path entirely.
 */
export const PIPELINE_MOCK_FALLBACK_ENABLED = !environment.production;

/** One page of the hunts table — prod's whole day (~75 hunts) fits on one. */
export const HUNTS_PAGE = 100;

/** Upper bound for GET /pipeline/commands/:id — below the 3 s fast poll. */
export const COMMAND_LOOKUP_TIMEOUT_MS = 2000;

@Injectable({ providedIn: 'root' })
export class PipelineApi {
  private readonly http = inject(HttpClient);
  private readonly baseUrl = environment.apiBaseUrl;
  /** The page polls every 15 s; the fallback warns once per app session, not per poll. */
  private sampleWarned = false;

  /**
   * GET /api/pipeline/snapshot?days=1|7. Any error other than a 404 with the
   * fallback enabled is rethrown — the page keeps its last good snapshot and
   * shows an inline error.
   */
  async getSnapshot(days: PipelineDays): Promise<PipelineSnapshotResult> {
    const params = new HttpParams().set('days', days);
    try {
      const snapshot = await firstValueFrom(
        this.http.get<PipelineSnapshot>(`${this.baseUrl}/pipeline/snapshot`, { params }),
      );
      return { snapshot, sample: false };
    } catch (err) {
      if (PIPELINE_MOCK_FALLBACK_ENABLED && isNotFound(err)) {
        if (!this.sampleWarned) {
          this.sampleWarned = true;
          console.warn(
            '[PipelineApi] GET /api/pipeline/snapshot returned 404 — serving the contract sample ' +
              'snapshot. TODO: disable PIPELINE_MOCK_FALLBACK_ENABLED when the endpoint is live.',
          );
        }
        return { snapshot: clonePipelineSample(), sample: true };
      }
      throw err;
    }
  }

  /**
   * POST /api/pipeline/commands — owner-only. Resolves to the new command id
   * (201 `{id}`). Errors are rethrown untouched: the page maps 403 (not the
   * owner), 409 (a hunt/retry is live or already queued) and 503 (bot state
   * unavailable) onto its own messages. No mock fallback — a command must never
   * look sent when it was not.
   */
  async postCommand(kind: BotCommandKind, sources?: string[] | null): Promise<string> {
    const body: PostCommandBody = sources === undefined ? { kind } : { kind, sources };
    const res = await firstValueFrom(
      this.http.post<{ id: string }>(`${this.baseUrl}/pipeline/commands`, body),
    );
    return res.id;
  }

  /**
   * GET /api/pipeline/hunts?days=&offset=&limit= — one page of every hunt in
   * the Warsaw calendar-day window (1 = today, 7 = last 7 days). A 404 means the API predates
   * the endpoint: resolves to `null` (the page hides the table) instead of
   * throwing. `{hunts: null}` is the bot not having written any hunt yet.
   */
  async getHunts(
    days: PipelineDays,
    offset = 0,
    limit = HUNTS_PAGE,
  ): Promise<HuntsResponse | null> {
    const params = new HttpParams().set('days', days).set('offset', offset).set('limit', limit);
    try {
      return await firstValueFrom(
        this.http.get<HuntsResponse>(`${this.baseUrl}/pipeline/hunts`, { params }),
      );
    } catch (err) {
      if (isNotFound(err)) return null;
      throw err;
    }
  }

  /** GET /api/pipeline/hunts/:id — one hunt's drill-down; `null` when unknown (404). */
  async getHunt(id: string): Promise<HuntDetail | null> {
    try {
      return await firstValueFrom(
        this.http.get<HuntDetail>(`${this.baseUrl}/pipeline/hunts/${encodeURIComponent(id)}`),
      );
    } catch (err) {
      if (isNotFound(err)) return null;
      throw err;
    }
  }

  /** GET /api/pipeline/commands/:id — one command's current status (owner-only). */
  getCommand(id: string): Promise<BotCommand> {
    return firstValueFrom(
      // Bounded below the 3 s fast poll: load() awaits this lookup, and a stalled
      // one would keep every later poll tick from refreshing the page.
      this.http.get<BotCommand>(`${this.baseUrl}/pipeline/commands/${encodeURIComponent(id)}`, {
        timeout: COMMAND_LOOKUP_TIMEOUT_MS,
      }),
    );
  }
}

function isNotFound(err: unknown): boolean {
  return err instanceof HttpErrorResponse && err.status === 404;
}
