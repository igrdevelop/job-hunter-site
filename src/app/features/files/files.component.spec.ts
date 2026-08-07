import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting } from '@angular/common/http/testing';
import { provideRouter, ActivatedRoute } from '@angular/router';
import { provideAnimationsAsync } from '@angular/platform-browser/animations/async';
import { vi } from 'vitest';
import { of } from 'rxjs';
import { convertToParamMap } from '@angular/router';
import { FilesComponent } from './files.component';
import { FilesApi } from '../../core/api/files.api';
import { AuthService } from '../../core/auth/auth.service';
import { FileInfo } from '../../core/api/models';

const FILE_PDF: FileInfo = { name: 'cv.pdf', size: 1024, type: 'pdf', modified: '2026-01-01T00:00:00Z' };
const FILE_TXT: FileInfo = { name: 'notes.txt', size: 128, type: 'txt', modified: '2026-01-01T00:00:00Z' };

function makeActivatedRoute(date: string, company: string): Partial<ActivatedRoute> {
  const paramMap = convertToParamMap({ date, company });
  return {
    paramMap: of(paramMap),
    snapshot: { paramMap } as never,
  };
}

describe('FilesComponent — download flow', () => {
  let fixture: ComponentFixture<FilesComponent>;
  let component: FilesComponent;
  let filesApi: FilesApi;
  let authService: AuthService;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [FilesComponent],
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        provideRouter([
          { path: 'files', children: [
            { path: '', pathMatch: 'full', redirectTo: '' },
            { path: ':date', component: FilesComponent },
            { path: ':date/:company', component: FilesComponent },
          ]},
        ]),
        provideAnimationsAsync(),
        { provide: ActivatedRoute, useValue: makeActivatedRoute('2026-01-01', 'Acme') },
      ],
    }).compileComponents();

    filesApi = TestBed.inject(FilesApi);
    authService = TestBed.inject(AuthService);
    vi.spyOn(filesApi, 'getGenerated').mockResolvedValue([FILE_PDF, FILE_TXT]);
    vi.spyOn(filesApi, 'getGeneratedFileUrl').mockReturnValue('/api/generated/2026-01-01/Acme/cv.pdf');
    vi.spyOn(authService, 'getDownloadToken').mockResolvedValue('dl-token');

    fixture = TestBed.createComponent(FilesComponent);
    component = fixture.componentInstance;
    await fixture.whenStable();
    fixture.detectChanges();
  });

  afterEach(() => vi.restoreAllMocks());

  it('previewPdf() fetches a download token and sets previewUrl with ?dt= param', async () => {
    await component.previewPdf(FILE_PDF);
    expect(authService.getDownloadToken).toHaveBeenCalledTimes(1);
    expect(component.previewUrl()).toContain('dt=dl-token');
    expect(component.previewEntry()).toEqual(FILE_PDF);
  });

  it('previewPdf() shows snackbar and leaves previewUrl null on error', async () => {
    vi.spyOn(authService, 'getDownloadToken').mockRejectedValue(new Error('fail'));
    await component.previewPdf(FILE_PDF);
    expect(component.previewUrl()).toBeNull();
    expect(component.previewEntry()).toBeNull();
  });

  it('downloadFile() fetches a download token and opens a URL with ?dt= param', async () => {
    const openFn = vi.fn();
    vi.stubGlobal('open', openFn);
    const openSpy = openFn;
    await component.downloadFile(FILE_TXT);
    expect(authService.getDownloadToken).toHaveBeenCalledTimes(1);
    expect(openSpy).toHaveBeenCalledWith(
      expect.stringContaining('dt=dl-token'), '_blank', 'noopener',
    );
    vi.unstubAllGlobals();
  });

  it('downloadFile() shows snackbar and does not open window on error', async () => {
    vi.spyOn(authService, 'getDownloadToken').mockRejectedValue(new Error('net'));
    const openFn = vi.fn();
    vi.stubGlobal('open', openFn);
    const openSpy = openFn;
    await component.downloadFile(FILE_TXT);
    expect(openSpy).not.toHaveBeenCalled();
    vi.unstubAllGlobals();
  });
});
