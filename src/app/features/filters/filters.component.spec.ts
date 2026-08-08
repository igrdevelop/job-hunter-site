import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting } from '@angular/common/http/testing';
import { provideRouter } from '@angular/router';
import { provideAnimationsAsync } from '@angular/platform-browser/animations/async';
import { vi } from 'vitest';
import { FiltersComponent, FILTER_SECTIONS } from './filters.component';
import { FiltersApi } from '../../core/api/filters.api';
import { FILTERS_MOCK_PAYLOAD } from '../../core/api/filters.mock';

describe('FiltersComponent', () => {
  let fixture: ComponentFixture<FiltersComponent>;
  let component: FiltersComponent;
  let api: FiltersApi;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [FiltersComponent],
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        provideRouter([]),
        provideAnimationsAsync(),
      ],
    }).compileComponents();

    api = TestBed.inject(FiltersApi);
    vi.spyOn(api, 'get').mockResolvedValue(structuredClone(FILTERS_MOCK_PAYLOAD));

    fixture = TestBed.createComponent(FiltersComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
  });

  afterEach(() => vi.restoreAllMocks());

  it('loads filters via FiltersApi.get()', () => {
    expect(api.get).toHaveBeenCalled();
    expect(component.payload()).toEqual(FILTERS_MOCK_PAYLOAD);
    expect(component.loading()).toBe(false);
  });

  it('renders all seven section headers (no preview §8)', () => {
    const text = fixture.nativeElement.textContent as string;
    for (const section of FILTER_SECTIONS) {
      expect(text).toContain(section.title);
    }
    expect(text).toContain('deferred to v2');
    expect(FILTER_SECTIONS).toHaveLength(7);
    expect(FILTER_SECTIONS.every((s) => s.id !== 8)).toBe(true);
  });

  it('shows raw effective values from the mock payload', () => {
    const text = fixture.nativeElement.textContent as string;
    expect(text).toContain('title_keywords');
    expect(text).toContain('react');
    expect(text).toContain('exclude_companies');
    expect(text).toContain('micro1');
    expect(text).toContain('local-staffing-co');
  });

  it('marks overridden keys with the изменено badge', () => {
    expect(component.isOverridden('title_keywords')).toBe(true);
    expect(component.isOverridden('require_title_terms')).toBe(false);
    const badges = fixture.nativeElement.querySelectorAll('.badge');
    expect(badges.length).toBeGreaterThan(0);
    expect((badges[0] as HTMLElement).textContent?.trim()).toBe('изменено');
  });

  it('shows error when GET fails', async () => {
    vi.spyOn(api, 'get').mockRejectedValue(new Error('network'));
    fixture = TestBed.createComponent(FiltersComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
    expect(component.errorMessage()).toBe('Could not load filters.');
    expect(fixture.nativeElement.textContent).toContain('Could not load filters.');
  });
});
