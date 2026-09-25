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

  it('POSTs a hunt command with its sources and resolves to the new id', async () => {
    const p = api.postCommand('hunt', ['linkedin']);
    const req = http.expectOne('/api/pipeline/commands');
    expect(req.request.method).toBe('POST');
    expect(req.request.body).toEqual({ kind: 'hunt', sources: ['linkedin'] });
    req.flush({ id: 'cmd1' }, { status: 201, statusText: 'Created' });
    expect(await p).toBe('cmd1');
  });

  it('sends sources: null for "hunt everywhere" and no sources key for other kinds', async () => {
    const all = api.postCommand('hunt', null);
    const allReq = http.expectOne('/api/pipeline/commands');
    expect(allReq.request.body).toEqual({ kind: 'hunt', sources: null });
    allReq.flush({ id: 'a' });
    await all;

    const retry = api.postCommand('retry_failed');
    const retryReq = http.expectOne('/api/pipeline/commands');
    expect(retryReq.request.body).toEqual({ kind: 'retry_failed' });
    retryReq.flush({ id: 'b' });
    await retry;
  });

  it('rethrows POST errors — no mock fallback for commands, not even on 404', async () => {
    for (const status of [409, 404]) {
      const p = api.postCommand('check_expired');
      http.expectOne('/api/pipeline/commands').flush('no', { status, statusText: 'x' });
      await expect(p).rejects.toMatchObject({ status });
    }
  });

  it('GETs one command by id', async () => {
    const p = api.getCommand('c/1');
    const req = http.expectOne('/api/pipeline/commands/c%2F1');
    expect(req.request.method).toBe('GET');
    const row = {
      id: 'c/1',
      kind: 'hunt',
      payload: { sources: null },
      status: 'running',
      error: '',
      created_at: '2026-09-22T11:57:58+00:00',
      started_at: '2026-09-22T11:58:00+00:00',
      finished_at: null,
    };
    req.flush(row);
    expect(await p).toEqual(row);
  });
});
