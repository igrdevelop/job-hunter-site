import { Injectable, inject } from '@angular/core';
import { HttpClient, HttpErrorResponse, HttpParams } from '@angular/common/http';
import { firstValueFrom } from 'rxjs';
import { environment } from '../../../environments/environment';
import { PipelineDays, PipelineSnapshot, PipelineSnapshotResult } from './pipeline.models';
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
}

function isNotFound(err: unknown): boolean {
  return err instanceof HttpErrorResponse && err.status === 404;
}
