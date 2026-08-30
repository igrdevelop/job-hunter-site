import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { vi } from 'vitest';
import { PROFILE_MOCK_FALLBACK_ENABLED, ProfileApi } from './profile.api';
import { PROFILE_MOCK } from '../../features/profile-editor/mock/profile.mock';
import {
  ProfileGetResponse,
  ProfileJob,
  ProfilePutResponse,
  ProfileRevision,
  ProfileUploadResponse,
} from './models';

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

  it('upload() POSTs the file as multipart to /api/profile/uploads', async () => {
    const file = new File(['resume content'], 'resume.pdf', { type: 'application/pdf' });
    const response: ProfileUploadResponse = { jobId: 'job-1' };
    const p = api.upload(file);
    const req = http.expectOne('/api/profile/uploads');
    expect(req.request.method).toBe('POST');
    expect(req.request.body).toBeInstanceOf(FormData);
    expect((req.request.body as FormData).get('file')).toBe(file);
    req.flush(response);
    expect(await p).toEqual(response);
  });

  it('getJob() GETs /api/profile/jobs/:id', async () => {
    const job: ProfileJob = { kind: 'parse', status: 'done', result: PROFILE_MOCK.profile };
    const p = api.getJob('job-1');
    const req = http.expectOne('/api/profile/jobs/job-1');
    expect(req.request.method).toBe('GET');
    req.flush(job);
    expect(await p).toEqual(job);
  });

  it('getRevisions() GETs /api/profile/revisions', async () => {
    const revisions: ProfileRevision[] = [
      { rev: 3, createdAt: '2026-08-30T12:00:00Z' },
      { rev: 2, createdAt: '2026-08-29T12:00:00Z' },
    ];
    const p = api.getRevisions();
    const req = http.expectOne('/api/profile/revisions');
    expect(req.request.method).toBe('GET');
    req.flush(revisions);
    expect(await p).toEqual(revisions);
  });

  it('restoreRevision() POSTs to /api/profile/revisions/:rev/restore', async () => {
    const response: ProfilePutResponse = { revision: 4, renderJobId: 'job-2' };
    const p = api.restoreRevision(2);
    const req = http.expectOne('/api/profile/revisions/2/restore');
    expect(req.request.method).toBe('POST');
    req.flush(response);
    expect(await p).toEqual(response);
  });
});
