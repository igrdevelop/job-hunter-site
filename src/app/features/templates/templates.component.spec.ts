import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting } from '@angular/common/http/testing';
import { provideRouter } from '@angular/router';
import { provideAnimationsAsync } from '@angular/platform-browser/animations/async';
import { vi } from 'vitest';
import { TemplatesComponent } from './templates.component';
import { TemplatesApi } from '../../core/api/templates.api';
import { AuthService } from '../../core/auth/auth.service';
import { Template } from '../../core/api/models';

const T_PDF: Template = {
  id: 'pdf-1', name: 'CV Template', category: 'resume', fileType: 'pdf',
  size: 2048, modified: '2026-01-01T00:00:00Z',
};
const T_TXT: Template = {
  id: 'txt-1', name: 'Cover Letter', category: 'cover-letter', fileType: 'txt',
  size: 512, modified: '2026-01-01T00:00:00Z',
};
const T_MD: Template = {
  id: 'md-1', name: 'Portfolio', category: 'portfolio', fileType: 'other',
  size: 256, modified: '2026-01-01T00:00:00Z',
};

describe('TemplatesComponent', () => {
  let fixture: ComponentFixture<TemplatesComponent>;
  let component: TemplatesComponent;
  let api: TemplatesApi;
  let authService: AuthService;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [TemplatesComponent],
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        provideRouter([]),
        provideAnimationsAsync(),
      ],
    }).compileComponents();

    api = TestBed.inject(TemplatesApi);
    authService = TestBed.inject(AuthService);
    vi.spyOn(api, 'getAll').mockResolvedValue([T_PDF, T_TXT, T_MD]);
    vi.spyOn(api, 'getContentUrl').mockImplementation((id) => `/api/templates/${id}/content`);
    vi.spyOn(authService, 'getDownloadToken').mockResolvedValue('tmpl-token');

    fixture = TestBed.createComponent(TemplatesComponent);
    component = fixture.componentInstance;
    await fixture.whenStable();
    fixture.detectChanges();
  });

  afterEach(() => vi.restoreAllMocks());

  it('loads all templates on init', () => {
    expect(component.templates()).toEqual([T_PDF, T_TXT, T_MD]);
  });

  it('filteredTemplates shows all when category is "all"', () => {
    expect(component.filteredTemplates()).toHaveLength(3);
  });

  it('filteredTemplates filters by category', () => {
    component.onCategoryChange('resume');
    expect(component.filteredTemplates()).toEqual([T_PDF]);
  });

  it('onDelete() does nothing when confirm cancelled', async () => {
    vi.stubGlobal('confirm', () => false);
    const spy = vi.spyOn(api, 'delete');
    await component.onDelete(T_PDF);
    expect(spy).not.toHaveBeenCalled();
    vi.unstubAllGlobals();
  });

  it('onDelete() calls api.delete when confirmed', async () => {
    vi.stubGlobal('confirm', () => true);
    const spy = vi.spyOn(api, 'delete').mockResolvedValue(undefined);
    await component.onDelete(T_PDF);
    expect(spy).toHaveBeenCalledWith('pdf-1');
    vi.unstubAllGlobals();
  });

  it('onDelete() clears previewPdf if the deleted template was previewed', async () => {
    vi.stubGlobal('confirm', () => true);
    vi.spyOn(api, 'delete').mockResolvedValue(undefined);
    component.previewPdf.set(T_PDF);
    await component.onDelete(T_PDF);
    expect(component.previewPdf()).toBeNull();
    vi.unstubAllGlobals();
  });

  it('onDownload() fetches a token and opens URL with ?dt= param', async () => {
    const openFn = vi.fn();
    vi.stubGlobal('open', openFn);
    await component.onDownload(T_MD);
    expect(authService.getDownloadToken).toHaveBeenCalledTimes(1);
    expect(openFn).toHaveBeenCalledWith(
      expect.stringContaining('dt=tmpl-token'), '_blank', 'noopener',
    );
    vi.unstubAllGlobals();
  });

  it('onDownload() does not open window on token error', async () => {
    vi.spyOn(authService, 'getDownloadToken').mockRejectedValue(new Error('fail'));
    const openFn = vi.fn();
    vi.stubGlobal('open', openFn);
    await component.onDownload(T_MD);
    expect(openFn).not.toHaveBeenCalled();
    vi.unstubAllGlobals();
  });

  it('onPreview() for PDF fetches a token and sets previewUrl with ?dt= param', async () => {
    await component.onPreview(T_PDF);
    expect(authService.getDownloadToken).toHaveBeenCalledTimes(1);
    expect(component.previewUrl()).toContain('dt=tmpl-token');
    expect(component.previewPdf()).toEqual(T_PDF);
  });

  it('onPreview() for txt loads text content', async () => {
    vi.spyOn(api, 'getContent').mockResolvedValue('cover letter text');
    await component.onPreview(T_TXT);
    expect(api.getContent).toHaveBeenCalledWith('txt-1');
  });

  it('onPreview() for non-pdf/txt calls onDownload', async () => {
    const spy = vi.spyOn(component, 'onDownload').mockResolvedValue(undefined);
    await component.onPreview(T_MD);
    expect(spy).toHaveBeenCalledWith(T_MD);
  });

  it('closePdfPreview() clears both previewPdf and previewUrl', async () => {
    await component.onPreview(T_PDF);
    expect(component.previewPdf()).not.toBeNull();
    component.closePdfPreview();
    expect(component.previewPdf()).toBeNull();
    expect(component.previewUrl()).toBeNull();
  });

  it('formatSize() formats bytes, KB, MB correctly', () => {
    expect(component.formatSize(500)).toBe('500 B');
    expect(component.formatSize(1536)).toBe('1.5 KB');
    expect(component.formatSize(2 * 1024 * 1024)).toBe('2.0 MB');
  });

  it('categoryLabel() returns human-readable label', () => {
    expect(component.categoryLabel('resume')).toBe('Resume');
    expect(component.categoryLabel('cover-letter')).toBe('Cover Letter');
  });
});
