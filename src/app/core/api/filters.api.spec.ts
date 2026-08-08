import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { vi } from 'vitest';
import { FILTERS_MOCK_FALLBACK_ENABLED, FiltersApi } from './filters.api';
import { FILTERS_MOCK_PAYLOAD } from './filters.mock';
import { FiltersPayload } from './models';

describe('FiltersApi', () => {
  let api: FiltersApi;
  let http: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting()],
    });
    api = TestBed.inject(FiltersApi);
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => {
    http.verify();
    vi.restoreAllMocks();
  });

  it('get() GETs /api/filters', async () => {
    const payload = FILTERS_MOCK_PAYLOAD;
    const p = api.get();
    const req = http.expectOne('/api/filters');
    expect(req.request.method).toBe('GET');
    req.flush(payload);
    expect(await p).toEqual(payload);
  });

  it('get() falls back to mock on 404 when FILTERS_MOCK_FALLBACK_ENABLED', async () => {
    expect(FILTERS_MOCK_FALLBACK_ENABLED).toBe(true);
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const p = api.get();
    http.expectOne('/api/filters').flush('missing', {
      status: 404,
      statusText: 'Not Found',
    });
    const result = await p;
    expect(result.defaults.title_keywords).toEqual(
      FILTERS_MOCK_PAYLOAD.defaults.title_keywords,
    );
    expect(result.meta['exclude_companies']?.merge).toBe('extend_only');
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('temporary mock'));
  });

  it('put() PUTs overrides to /api/filters', async () => {
    const overrides = { title_keywords: ['vue'] };
    const response: FiltersPayload = {
      ...FILTERS_MOCK_PAYLOAD,
      overrides,
      effective: { ...FILTERS_MOCK_PAYLOAD.defaults, ...overrides },
    };
    const p = api.put(overrides);
    const req = http.expectOne('/api/filters');
    expect(req.request.method).toBe('PUT');
    expect(req.request.body).toEqual(overrides);
    req.flush(response);
    expect(await p).toEqual(response);
  });

  it('put() does not fake success on 404', async () => {
    const p = api.put({ title_keywords: ['svelte'] });
    http.expectOne('/api/filters').flush('missing', {
      status: 404,
      statusText: 'Not Found',
    });
    await expect(p).rejects.toMatchObject({ status: 404 });
  });
});
