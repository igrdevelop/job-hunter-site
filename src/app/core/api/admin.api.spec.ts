import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { AdminApi } from './admin.api';
import { AdminUser } from './models';

const STUB: AdminUser = {
  id: '1', email: 'a@b.com', role: 'user', emailVerified: true, disabled: false, createdAt: '2026-01-01T00:00:00Z',
};

describe('AdminApi', () => {
  let api: AdminApi;
  let http: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({ providers: [provideHttpClient(), provideHttpClientTesting()] });
    api = TestBed.inject(AdminApi);
    http = TestBed.inject(HttpTestingController);
  });

  it('getUsers() GETs /api/admin/users', async () => {
    const p = api.getUsers();
    const req = http.expectOne('/api/admin/users');
    expect(req.request.method).toBe('GET');
    req.flush([STUB]);
    expect(await p).toEqual([STUB]);
  });

  it('setDisabled() PATCHes /api/admin/users/:id with { disabled }', async () => {
    const updated: AdminUser = { ...STUB, disabled: true };
    const p = api.setDisabled('1', true);
    const req = http.expectOne('/api/admin/users/1');
    expect(req.request.method).toBe('PATCH');
    expect(req.request.body).toEqual({ disabled: true });
    req.flush(updated);
    expect(await p).toEqual(updated);
  });

  it('setDisabled() re-enables a user by passing disabled: false', async () => {
    const p = api.setDisabled('2', false);
    const req = http.expectOne('/api/admin/users/2');
    expect(req.request.body).toEqual({ disabled: false });
    req.flush({ ...STUB, id: '2', disabled: false });
    expect((await p).disabled).toBe(false);
  });

  it('deleteUser() DELETEs /api/admin/users/:id', async () => {
    const p = api.deleteUser('42');
    const req = http.expectOne('/api/admin/users/42');
    expect(req.request.method).toBe('DELETE');
    req.flush(null);
    await expect(p).resolves.toBeNull();
  });
});
