import { ComponentFixture, TestBed } from '@angular/core/testing';
import { HttpErrorResponse, provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting } from '@angular/common/http/testing';
import { provideRouter } from '@angular/router';
import { provideAnimationsAsync } from '@angular/platform-browser/animations/async';
import { MatSnackBar } from '@angular/material/snack-bar';
import { vi } from 'vitest';
import { FiltersComponent, FILTER_SECTIONS } from './filters.component';
import { FiltersApi } from '../../core/api/filters.api';
import { FILTERS_MOCK_PAYLOAD } from '../../core/api/filters.mock';
import { EXCLUDE_LEVEL_GROUPS } from './exclude-level-groups';

describe('FiltersComponent', () => {
  let fixture: ComponentFixture<FiltersComponent>;
  let component: FiltersComponent;
  let api: FiltersApi;
  let snackBar: MatSnackBar;

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
    snackBar = TestBed.inject(MatSnackBar);
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
    expect(component.draft()).toEqual(FILTERS_MOCK_PAYLOAD.overrides);
    expect(component.baseline()).toEqual(FILTERS_MOCK_PAYLOAD.overrides);
  });

  it('renders all seven section headers', () => {
    const text = fixture.nativeElement.textContent as string;
    for (const section of FILTER_SECTIONS) {
      expect(text).toContain(section.title);
    }
    expect(FILTER_SECTIONS).toHaveLength(7);
  });

  describe('override badge + reset (M3)', () => {
    it('shows override badge for keys in draft and hides after reset', () => {
      expect(component.isOverridden('title_keywords')).toBe(true);
      fixture.detectChanges();
      const row = fixture.nativeElement.querySelector('[data-key="title_keywords"]');
      expect(row?.classList.contains('overridden')).toBe(true);
      expect(row?.querySelector('.badge')?.textContent?.trim()).toBe('изменено');

      component.resetField('title_keywords');
      fixture.detectChanges();
      expect(component.isOverridden('title_keywords')).toBe(false);
      expect(component.draft()).not.toHaveProperty('title_keywords');
      expect(row?.classList.contains('overridden')).toBe(false);
      expect(row?.querySelector('.badge')).toBeNull();
    });

    it('reset removes the key from the draft (does not copy the default)', () => {
      expect(component.draft()).toHaveProperty('exclude_patterns');
      component.resetField('exclude_patterns');
      expect(Object.prototype.hasOwnProperty.call(component.draft(), 'exclude_patterns')).toBe(
        false,
      );
      // Display falls back to defaults without writing them into draft.
      expect(component.listValue('exclude_patterns')).toEqual(
        FILTERS_MOCK_PAYLOAD.defaults.exclude_patterns,
      );
    });

    it('badge appears when a default field is edited', () => {
      expect(component.isOverridden('require_title_terms')).toBe(false);
      component.setChipDraft('require_title_terms', 'react');
      component.addChip('require_title_terms');
      fixture.detectChanges();
      expect(component.isOverridden('require_title_terms')).toBe(true);
      const row = fixture.nativeElement.querySelector('[data-key="require_title_terms"]');
      expect(row?.querySelector('.badge')?.textContent?.trim()).toBe('изменено');
    });
  });

  describe('extend_only locked chips (M3)', () => {
    it('cannot remove a builtin extend_only chip', () => {
      const before = component.listValue('exclude_companies');
      expect(component.isChipLocked('exclude_companies', 'micro1')).toBe(true);
      component.removeChip('exclude_companies', 'micro1');
      expect(component.listValue('exclude_companies')).toEqual(before);

      const lockedChip = Array.from(
        fixture.nativeElement.querySelectorAll('[data-key="exclude_companies"] .chip.locked'),
      ).find((el) => (el as HTMLElement).textContent?.includes('micro1'));
      expect(lockedChip).toBeTruthy();
      expect((lockedChip as HTMLElement).querySelector('.chip-x')).toBeNull();
    });

    it('can remove a user-added extend_only chip', () => {
      expect(component.isChipLocked('exclude_companies', 'local-staffing-co')).toBe(false);
      component.removeChip('exclude_companies', 'local-staffing-co');
      expect(component.listValue('exclude_companies')).not.toContain('local-staffing-co');
    });
  });

  describe('indeterminate group states (M3)', () => {
    it('reports checked / unchecked / indeterminate for exclude_levels groups', () => {
      const junior = EXCLUDE_LEVEL_GROUPS[0];
      expect(component.groupState(junior)).toBe('checked');

      // Hand-remove one word from the group → indeterminate.
      component.removeChip('exclude_levels', 'junior');
      expect(component.groupState(junior)).toBe('indeterminate');

      component.toggleGroup(junior);
      expect(component.groupState(junior)).toBe('checked');

      component.toggleGroup(junior);
      expect(component.groupState(junior)).toBe('unchecked');
    });

    it('marks the group checkbox indeterminate in the DOM', () => {
      const junior = EXCLUDE_LEVEL_GROUPS[0];
      component.removeChip('exclude_levels', 'junior');
      fixture.detectChanges();
      const input = fixture.nativeElement.querySelector(
        '.group-toggle input',
      ) as HTMLInputElement;
      expect(input.indeterminate).toBe(true);
      expect(input.checked).toBe(false);
    });
  });

  describe('save flow (M3)', () => {
    it('is not dirty until draft diverges from baseline', () => {
      expect(component.isDirty()).toBe(false);
      component.resetField('title_keywords');
      expect(component.isDirty()).toBe(true);
      expect(component.dirtyCount()).toBeGreaterThan(0);
    });

    it('discard restores baseline overrides', () => {
      component.resetField('title_keywords');
      component.discard();
      expect(component.draft()).toEqual(FILTERS_MOCK_PAYLOAD.overrides);
      expect(component.isDirty()).toBe(false);
    });

    it('resetAll clears every override in the draft', () => {
      component.resetAll();
      expect(component.draft()).toEqual({});
      expect(component.isDirty()).toBe(true);
    });

    it('save() PUTs draft and shows next-hunt-cycle snackbar', async () => {
      const response = structuredClone(FILTERS_MOCK_PAYLOAD);
      response.overrides = { title_keywords: ['vue'] };
      response.effective = { ...response.defaults, ...response.overrides };
      const put = vi.spyOn(api, 'put').mockResolvedValue(response);
      const open = vi.spyOn(snackBar, 'open');

      component.resetField('exclude_patterns');
      const toSave = structuredClone(component.draft());
      await component.save();

      expect(put).toHaveBeenCalledWith(toSave);
      // After success, baseline matches response overrides.
      expect(component.baseline()).toEqual(response.overrides);
      expect(component.isDirty()).toBe(false);
      expect(open).toHaveBeenCalledWith(
        'Сохранено. Применится со следующего цикла охоты.',
        undefined,
        expect.any(Object),
      );
    });

    it('save() maps PUT 400 errors onto fields', async () => {
      component.setChipDraft('exclude_patterns', '(');
      component.addChip('exclude_patterns');
      vi.spyOn(api, 'put').mockRejectedValue(
        new HttpErrorResponse({
          status: 400,
          error: {
            errors: { 'exclude_patterns[3]': 'invalid regex: unbalanced parenthesis' },
          },
        }),
      );
      await component.save();
      expect(component.fieldError('exclude_patterns')).toContain('exclude_patterns[3]');
      expect(component.saveError()).toContain('Исправьте ошибки');
    });

    it('save() shows API-not-ready message on 404', async () => {
      component.resetField('title_keywords');
      vi.spyOn(api, 'put').mockRejectedValue(
        new HttpErrorResponse({ status: 404, statusText: 'Not Found' }),
      );
      await component.save();
      expect(component.saveError()).toContain('API ещё нет');
    });
  });
});
