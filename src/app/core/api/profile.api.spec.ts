import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { vi } from 'vitest';
import { PROFILE_MOCK_FALLBACK_ENABLED, ProfileApi } from './profile.api';
import { PROFILE_MOCK } from '../../features/profile-editor/mock/profile.mock';
import {
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

  it('getJob() GETs /api/profile/jobs/:id and JSON.parses the wire-string result', async () => {
    // The API sends `result` as a JSON-ENCODED STRING (the raw DB column).
    // The old spec flushed an object here — a lying mock that let the
    // confirmation screen ship broken for every real upload (live bug found
    // by the E4 smoke run). The mock now matches the real wire shape.
    const p = api.getJob('job-1');
    const req = http.expectOne('/api/profile/jobs/job-1');
    expect(req.request.method).toBe('GET');
    req.flush({ kind: 'parse', status: 'done', result: JSON.stringify(PROFILE_MOCK.profile) });
    const job = await p;
    expect(job.status).toBe('done');
    expect(job.result).toEqual(PROFILE_MOCK.profile);
  });

  it('getJob() returns result: undefined for a non-JSON or non-object result', async () => {
    const p1 = api.getJob('job-2');
    http.expectOne('/api/profile/jobs/job-2').flush({ kind: 'parse', status: 'error', result: 'not json {' });
    expect((await p1).result).toBeUndefined();

    const p2 = api.getJob('job-3');
    // A render job's result is a JSON ARRAY (written-file list) — not a document.
    http.expectOne('/api/profile/jobs/job-3').flush({ kind: 'render', status: 'done', result: '["a.md"]' });
    expect((await p2).result).toBeUndefined();

    const p3 = api.getJob('job-4');
    http.expectOne('/api/profile/jobs/job-4').flush({ kind: 'parse', status: 'pending' });
    expect((await p3).result).toBeUndefined();
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

  it('listUploads() GETs /api/profile/uploads', async () => {
    const entries: ProfileUploadListEntry[] = [
      { id: 'u1', filename: 'resume.pdf', sha256: 'abc', uploadedAt: '2026-08-30T12:00:00Z', jobId: 'job-1', jobStatus: 'done' },
    ];
    const p = api.listUploads();
    const req = http.expectOne('/api/profile/uploads');
    expect(req.request.method).toBe('GET');
    req.flush(entries);
    expect(await p).toEqual(entries);
  });

  it('listUploads() rejects (not faked) on 404', async () => {
    const p = api.listUploads();
    http.expectOne('/api/profile/uploads').flush('missing', { status: 404, statusText: 'Not Found' });
    await expect(p).rejects.toMatchObject({ status: 404 });
  });

  it('listRenderedFiles() GETs /api/profile/files', async () => {
    const files: ProfileRenderedFile[] = [
      { name: 'candidate.yaml', size: 512, modifiedAt: '2026-08-30T12:00:00Z' },
    ];
    const p = api.listRenderedFiles();
    const req = http.expectOne('/api/profile/files');
    expect(req.request.method).toBe('GET');
    req.flush(files);
    expect(await p).toEqual(files);
  });

  it('getRenderedFileContent() GETs /api/profile/files/:name as text', async () => {
    const p = api.getRenderedFileContent('candidate.yaml');
    const req = http.expectOne('/api/profile/files/candidate.yaml');
    expect(req.request.method).toBe('GET');
    expect(req.request.responseType).toBe('text');
    req.flush('identity:\n  full_name: Jane Doe\n');
    expect(await p).toBe('identity:\n  full_name: Jane Doe\n');
  });

  it('getRenderedFileContent() URL-encodes the file name', async () => {
    void api.getRenderedFileContent('base_cv_ai.md');
    const req = http.expectOne('/api/profile/files/base_cv_ai.md');
    req.flush('');
  });

  it('requestPreview() POSTs { track } to /api/profile/preview', async () => {
    const response: ProfilePreviewCreated = { jobId: 'job-3' };
    const p = api.requestPreview('angular');
    const req = http.expectOne('/api/profile/preview');
    expect(req.request.method).toBe('POST');
    expect(req.request.body).toEqual({ track: 'angular' });
    req.flush(response, { status: 201, statusText: 'Created' });
    expect(await p).toEqual(response);
  });

  it('requestPreview() rejects with the 409 when no stored profile exists', async () => {
    const p = api.requestPreview('core');
    http.expectOne('/api/profile/preview').flush('no profile', { status: 409, statusText: 'Conflict' });
    await expect(p).rejects.toMatchObject({ status: 409 });
  });

  it('listPreviews() GETs /api/profile/previews', async () => {
    const items: ProfilePreviewListItem[] = [
      { track: 'angular', timestamp: '2026-08-30T12-00-00Z', files: ['preview.pdf'] },
    ];
    const p = api.listPreviews();
    const req = http.expectOne('/api/profile/previews');
    expect(req.request.method).toBe('GET');
    req.flush(items);
    expect(await p).toEqual(items);
  });

  it('getPreviewFileUrl() builds the per-file download URL', () => {
    expect(api.getPreviewFileUrl('angular', '2026-08-30T12-00-00Z', 'preview.pdf')).toBe(
      '/api/profile/previews/angular/2026-08-30T12-00-00Z/preview.pdf',
    );
  });
});
