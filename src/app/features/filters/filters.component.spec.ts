import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting } from '@angular/common/http/testing';
import { provideRouter } from '@angular/router';
import { provideAnimationsAsync } from '@angular/platform-browser/animations/async';
import { vi } from 'vitest';
import { FiltersComponent, FILTER_SECTIONS } from './filters.component';
import { FiltersApi } from '../../core/api/filters.api';
import { FILTERS_MOCK_PAYLOAD } from '../../core/api/filters.mock';
import { EXCLUDE_LEVEL_GROUPS } from './exclude-level-groups';

describe('FiltersComponent (M2 controls)', () => {
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

  it('loads defaults and draft overrides from FiltersApi.get()', () => {
    expect(api.get).toHaveBeenCalled();
    expect(component.ready()).toBe(true);
    expect(component.defaults()?.title_keywords).toEqual(
      FILTERS_MOCK_PAYLOAD.defaults.title_keywords,
    );
    expect(component.draft()).toEqual(FILTERS_MOCK_PAYLOAD.overrides);
  });

  it('renders all seven section headers', () => {
    const text = fixture.nativeElement.textContent as string;
    for (const section of FILTER_SECTIONS) {
      expect(text).toContain(section.title);
    }
    expect(FILTER_SECTIONS).toHaveLength(7);
  });

  it('shows chip inputs and locked extend_only chips', () => {
    const text = fixture.nativeElement.textContent as string;
    expect(text).toContain('Ключевые слова в заголовке');
    expect(text).toContain('micro1');
    const locked = fixture.nativeElement.querySelectorAll('.chip.locked');
    expect(locked.length).toBeGreaterThan(0);
  });

  it('renders tri-state group checkboxes for exclude_levels', () => {
    const toggles = fixture.nativeElement.querySelectorAll('.group-toggle input');
    expect(toggles.length).toBe(EXCLUDE_LEVEL_GROUPS.length);
    expect(component.groupState(EXCLUDE_LEVEL_GROUPS[0])).toBe('checked');
  });

  it('shows error when GET fails', async () => {
    vi.spyOn(api, 'get').mockRejectedValue(new Error('network'));
    fixture = TestBed.createComponent(FiltersComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
    expect(component.errorMessage()).toBe('Could not load filters.');
  });
});
