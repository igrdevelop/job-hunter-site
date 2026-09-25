import { Injectable, inject } from '@angular/core';
import { HttpClient, HttpErrorResponse, HttpParams } from '@angular/common/http';
import { firstValueFrom } from 'rxjs';
import { environment } from '../../../environments/environment';
import {
  BotCommand,
  BotCommandKind,
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
 * TODO(pipeline-api): set to `false` (then delete the flag + mock fallback path)
 * once GET /api/pipeline/snapshot is live — a silent sample on a broken API
 * would hide a real outage.
 */
export const PIPELINE_MOCK_FALLBACK_ENABLED = true;

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

  /** GET /api/pipeline/commands/:id — one command's current status (owner-only). */
  getCommand(id: string): Promise<BotCommand> {
    return firstValueFrom(
      this.http.get<BotCommand>(`${this.baseUrl}/pipeline/commands/${encodeURIComponent(id)}`),
    );
  }
}

function isNotFound(err: unknown): boolean {
  return err instanceof HttpErrorResponse && err.status === 404;
}
