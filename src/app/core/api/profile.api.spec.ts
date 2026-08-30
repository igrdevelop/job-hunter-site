import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { vi } from 'vitest';
import { PROFILE_MOCK_FALLBACK_ENABLED, ProfileApi } from './profile.api';
import { PROFILE_MOCK } from '../../features/profile-editor/mock/profile.mock';
import { ProfileGetResponse, ProfilePutResponse } from './models';

describe('ProfileApi', () => {
  let api: ProfileApi;
  let http: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting()],
    });
    api = TestBed.inject(ProfileApi);
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => {
    http.verify();
    vi.restoreAllMocks();
  });

  it('get() GETs /api/profile', async () => {
    const payload: ProfileGetResponse = PROFILE_MOCK;
    const p = api.get();
    const req = http.expectOne('/api/profile');
    expect(req.request.method).toBe('GET');
    req.flush(payload);
    expect(await p).toEqual(payload);
  });

  it('get() falls back to the mock fixture on 404 when PROFILE_MOCK_FALLBACK_ENABLED', async () => {
    expect(PROFILE_MOCK_FALLBACK_ENABLED).toBe(true);
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const p = api.get();
    http.expectOne('/api/profile').flush('missing', { status: 404, statusText: 'Not Found' });
    const result = await p;
    expect(result?.profile.core.identity.full_name).toBe(
      PROFILE_MOCK.profile.core.identity.full_name,
    );
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('temporary mock'));
  });

  it('put() PUTs the full document to /api/profile', async () => {
    const response: ProfilePutResponse = { revision: 2, renderJobId: 'job-1' };
    const p = api.put(PROFILE_MOCK.profile);
    const req = http.expectOne('/api/profile');
    expect(req.request.method).toBe('PUT');
    expect(req.request.body).toEqual(PROFILE_MOCK.profile);
    req.flush(response);
    expect(await p).toEqual(response);
  });

  it('put() does not fake success on 404', async () => {
    const p = api.put(PROFILE_MOCK.profile);
    http.expectOne('/api/profile').flush('missing', { status: 404, statusText: 'Not Found' });
    await expect(p).rejects.toMatchObject({ status: 404 });
  });
});
