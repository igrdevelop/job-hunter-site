import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { SettingsApi } from './settings.api';

describe('SettingsApi', () => {
  let api: SettingsApi;
  let http: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({ providers: [provideHttpClient(), provideHttpClientTesting()] });
    api = TestBed.inject(SettingsApi);
    http = TestBed.inject(HttpTestingController);
  });

  it('getUserSettings() GETs /api/settings', async () => {
    const payload = { settings: [{ key: 'lang', value: 'en', type: 'string' as const, description: 'Language' }] };
    const p = api.getUserSettings();
    const req = http.expectOne('/api/settings');
    expect(req.request.method).toBe('GET');
    req.flush(payload);
    expect(await p).toEqual(payload);
  });

  it('updateUserSettings() PUTs to /api/settings with data', async () => {
    const data = { lang: 'pl', notify: true };
    const p = api.updateUserSettings(data);
    const req = http.expectOne('/api/settings');
    expect(req.request.method).toBe('PUT');
    expect(req.request.body).toEqual(data);
    req.flush(null, { status: 204, statusText: 'No Content' });
    await p;
  });

  it('getGlobalSettings() GETs /api/settings/global', async () => {
    const payload = { settings: [{ key: 'MAX_APPS', value: '100', type: 'string' as const, description: 'Max' }] };
    const p = api.getGlobalSettings();
    const req = http.expectOne('/api/settings/global');
    expect(req.request.method).toBe('GET');
    req.flush(payload);
    expect(await p).toEqual(payload);
  });

  it('getTelegramStatus() GETs /api/telegram/status', async () => {
    const payload = { linked: true, chatId: '123456' };
    const p = api.getTelegramStatus();
    const req = http.expectOne('/api/telegram/status');
    expect(req.request.method).toBe('GET');
    req.flush(payload);
    expect(await p).toEqual(payload);
  });

  it('generateTelegramLinkCode() POSTs to /api/telegram/link-code', async () => {
    const payload = { code: 'ABC-123', expiresAt: '2026-08-07T10:00:00Z', botHandle: 'my_bot' };
    const p = api.generateTelegramLinkCode();
    const req = http.expectOne('/api/telegram/link-code');
    expect(req.request.method).toBe('POST');
    req.flush(payload);
    expect(await p).toEqual(payload);
  });
});
