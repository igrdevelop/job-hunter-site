import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { vi } from 'vitest';
import { PIPELINE_MOCK_FALLBACK_ENABLED, PipelineApi } from './pipeline.api';
import { PIPELINE_SAMPLE_SNAPSHOT, clonePipelineSample } from './pipeline.mock';

describe('PipelineApi', () => {
  let api: PipelineApi;
  let http: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting()],
    });
    api = TestBed.inject(PipelineApi);
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => {
    http.verify();
    vi.restoreAllMocks();
  });

  it('GETs /api/pipeline/snapshot with the days param and marks the result real', async () => {
    const payload = clonePipelineSample();
    payload.user_id = 'real-user';
    const p = api.getSnapshot(7);
    const req = http.expectOne((r) => r.url === '/api/pipeline/snapshot');
    expect(req.request.method).toBe('GET');
    expect(req.request.params.get('days')).toBe('7');
    req.flush(payload);
    expect(await p).toEqual({ snapshot: payload, sample: false });
  });

  it('serves the contract sample, flagged as sample, on a 404 — warning once per session', async () => {
    expect(PIPELINE_MOCK_FALLBACK_ENABLED).toBe(true);
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);

    for (let i = 0; i < 2; i++) {
      const p = api.getSnapshot(1);
      http
        .expectOne((r) => r.url === '/api/pipeline/snapshot')
        .flush('missing', { status: 404, statusText: 'Not Found' });
      const result = await p;
      expect(result.sample).toBe(true);
      expect(result.snapshot).toEqual(PIPELINE_SAMPLE_SNAPSHOT);
      expect(result.snapshot).not.toBe(PIPELINE_SAMPLE_SNAPSHOT);
    }
    expect(warn).toHaveBeenCalledTimes(1);
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('PIPELINE_MOCK_FALLBACK_ENABLED'));
  });

  it('does not fall back on other errors', async () => {
    const p = api.getSnapshot(1);
    http
      .expectOne((r) => r.url === '/api/pipeline/snapshot')
      .flush('boom', { status: 500, statusText: 'Server Error' });
    await expect(p).rejects.toMatchObject({ status: 500 });
  });
});
