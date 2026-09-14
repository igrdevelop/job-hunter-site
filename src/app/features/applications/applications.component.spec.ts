import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting } from '@angular/common/http/testing';
import {
  ActivatedRoute,
  ParamMap,
  Router,
  convertToParamMap,
  provideRouter,
} from '@angular/router';
import { provideAnimationsAsync } from '@angular/platform-browser/animations/async';
import { MatSnackBar } from '@angular/material/snack-bar';
import { BehaviorSubject } from 'rxjs';
import { vi } from 'vitest';
import { ApplicationsComponent, COLUMNS_STORAGE_KEY } from './applications.component';
import { ApplicationsApi } from '../../core/api/applications.api';
import { APP_STATUS_OPTIONS, Application } from '../../core/api/models';

function baseApplication(overrides: Partial<Application> = {}): Application {
  return {
    id: '42',
    date: '2026-09-01',
    company: 'Acme',
    title: 'Engineer',
    stack: 'Angular',
    atsStatus: '',
    url: '',
    folder: '',
    sent: '',
    toLearn: '',
    costUsd: null,
    atsVerdict: null,
    ...overrides,
  };
}

describe('ApplicationsComponent — URL-driven filter and search', () => {
  let fixture: ComponentFixture<ApplicationsComponent>;
  let component: ApplicationsComponent;
  let queryParams$: BehaviorSubject<ParamMap>;
  let routeStub: Partial<ActivatedRoute>;

  async function setup(initialParams: Record<string, string>): Promise<void> {
    queryParams$ = new BehaviorSubject(convertToParamMap(initialParams));
    routeStub = { queryParamMap: queryParams$.asObservable() };

    await TestBed.configureTestingModule({
      imports: [ApplicationsComponent],
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        provideRouter([]),
        provideAnimationsAsync(),
        { provide: ActivatedRoute, useValue: routeStub },
      ],
    }).compileComponents();

    const api = TestBed.inject(ApplicationsApi);
    vi.spyOn(api, 'getApplications').mockResolvedValue({
      data: [],
      meta: { total: 0, page: 1, limit: 50, totalPages: 0 },
    });
    vi.spyOn(api, 'getStats').mockResolvedValue({ total: 0, unsent: 0, filled: 0 });

    fixture = TestBed.createComponent(ApplicationsComponent);
    component = fixture.componentInstance;
    await fixture.whenStable();
    fixture.detectChanges();
  }

  afterEach(() => vi.restoreAllMocks());

  it('defaults to the unsent filter and empty search without query params', async () => {
    await setup({});
    expect(component.statusFilter()).toBe('unsent');
    expect(component.search()).toBe('');
  });

  it('initializes filter and search from query params', async () => {
    await setup({ filter: 'filled', search: 'acme' });
    expect(component.statusFilter()).toBe('filled');
    expect(component.search()).toBe('acme');
  });

  it('falls back to unsent on an unknown ?filter= value', async () => {
    await setup({ filter: 'bogus' });
    expect(component.statusFilter()).toBe('unsent');
  });

  it('applies query-param changes (browser back/forward) to the state', async () => {
    await setup({});
    queryParams$.next(convertToParamMap({ filter: 'all', search: 'angular' }));
    fixture.detectChanges();
    expect(component.statusFilter()).toBe('all');
    expect(component.search()).toBe('angular');
  });

  it('onStatusFilterChange() writes the filter into the query params', async () => {
    await setup({});
    const navigate = vi.spyOn(TestBed.inject(Router), 'navigate').mockResolvedValue(true);
    component.onStatusFilterChange('filled');
    expect(navigate).toHaveBeenCalledWith([], {
      relativeTo: routeStub,
      queryParams: { filter: 'filled' },
      queryParamsHandling: 'merge',
    });
  });

  it('onStatusFilterChange("unsent") clears the filter query param', async () => {
    await setup({ filter: 'all' });
    const navigate = vi.spyOn(TestBed.inject(Router), 'navigate').mockResolvedValue(true);
    component.onStatusFilterChange('unsent');
    expect(navigate).toHaveBeenCalledWith([], {
      relativeTo: routeStub,
      queryParams: { filter: null },
      queryParamsHandling: 'merge',
    });
  });

  it('onSearchInput() debounces before writing the search query param', async () => {
    await setup({});
    const navigate = vi.spyOn(TestBed.inject(Router), 'navigate').mockResolvedValue(true);
    vi.useFakeTimers();
    component.onSearchInput('acme');
    expect(component.search()).toBe('acme');
    expect(navigate).not.toHaveBeenCalled();
    vi.advanceTimersByTime(400);
    expect(navigate).toHaveBeenCalledWith([], {
      relativeTo: routeStub,
      queryParams: { search: 'acme' },
      queryParamsHandling: 'merge',
    });
    vi.useRealTimers();
  });

  it('onSearchInput("") clears the search query param after the debounce', async () => {
    await setup({ search: 'acme' });
    const navigate = vi.spyOn(TestBed.inject(Router), 'navigate').mockResolvedValue(true);
    vi.useFakeTimers();
    component.onSearchInput('');
    vi.advanceTimersByTime(400);
    expect(navigate).toHaveBeenCalledWith([], {
      relativeTo: routeStub,
      queryParams: { search: null },
      queryParamsHandling: 'merge',
    });
    vi.useRealTimers();
  });

  describe('column visibility', () => {
    afterEach(() => localStorage.removeItem(COLUMNS_STORAGE_KEY));

    function colDef(field: string) {
      return component.columnDefs.find((d) => d.field === field);
    }

    it('adds the sheet columns hidden by default', async () => {
      await setup({});
      for (const field of ['reapplication', 'driveUrl', 'costUsd', 'atsVerdict', 'id']) {
        expect(colDef(field)?.hide, field).toBe(true);
      }
    });

    it('shows My Status by default as a select-editor column', async () => {
      await setup({});
      const def = colDef('appStatus');
      expect(def?.hide).toBeUndefined();
      expect(def?.editable).toBe(true);
      expect(def?.cellEditor).toBe('agSelectCellEditor');
    });

    it('renames the sent column header to "Sent"', async () => {
      await setup({});
      expect(colDef('sent')?.headerName).toBe('Sent');
    });

    it('shows an editable Note column by default with a popup large-text editor', async () => {
      await setup({});
      const def = colDef('note');
      expect(def?.headerName).toBe('Note');
      expect(def?.hide).toBeUndefined();
      expect(def?.editable).toBe(true);
      expect(def?.cellEditor).toBe('agLargeTextCellEditor');
      expect(def?.cellEditorPopup).toBe(true);
      expect(def?.cellEditorParams).toMatchObject({ maxLength: 2000 });
      expect(def?.tooltipField).toBe('note');
    });

    it('excludes icon-only folder/url columns from the toggle menu', async () => {
      await setup({});
      const ids = component.columnToggles.map((t) => t.colId);
      expect(ids).not.toContain('folder');
      expect(ids).not.toContain('url');
      expect(ids).toContain('driveUrl');
    });

    it('toggleColumn flips visibility and persists it to localStorage', async () => {
      await setup({});
      expect(component.isColumnVisible('costUsd')).toBe(false);
      component.toggleColumn('costUsd');
      expect(component.isColumnVisible('costUsd')).toBe(true);
      const stored = JSON.parse(localStorage.getItem(COLUMNS_STORAGE_KEY)!);
      expect(stored['costUsd']).toBe(false);
    });

    it('restores stored visibility choices on init', async () => {
      localStorage.setItem(
        COLUMNS_STORAGE_KEY,
        JSON.stringify({ costUsd: false, stack: true }),
      );
      await setup({});
      expect(colDef('costUsd')?.hide).toBe(false);
      expect(colDef('stack')?.hide).toBe(true);
      expect(component.isColumnVisible('costUsd')).toBe(true);
      expect(component.isColumnVisible('stack')).toBe(false);
    });
  });

  describe('inline edit PATCH guard', () => {
    function gridNode() {
      return { setData: vi.fn(), setDataValue: vi.fn() };
    }

    it('patches appStatus edits through the API', async () => {
      await setup({});
      const api = TestBed.inject(ApplicationsApi);
      const patch = vi.spyOn(api, 'patch').mockResolvedValue(baseApplication());
      component.onCellValueChanged({
        colDef: { field: 'appStatus' },
        data: { id: '42' },
        newValue: 'Rejected',
        node: gridNode(),
      } as never);
      expect(patch).toHaveBeenCalledWith('42', { appStatus: 'Rejected' });
    });

    it('patches note edits through the API', async () => {
      await setup({});
      const api = TestBed.inject(ApplicationsApi);
      const patch = vi.spyOn(api, 'patch').mockResolvedValue(baseApplication());
      component.onCellValueChanged({
        colDef: { field: 'note' },
        data: { id: '42' },
        newValue: 'not a fit',
        node: gridNode(),
      } as never);
      expect(patch).toHaveBeenCalledWith('42', { note: 'not a fit' });
    });

    it('does not patch non-editable fields', async () => {
      await setup({});
      const api = TestBed.inject(ApplicationsApi);
      const patch = vi.spyOn(api, 'patch').mockResolvedValue(baseApplication());
      component.onCellValueChanged({
        colDef: { field: 'company' },
        data: { id: '42' },
        newValue: 'Acme',
        node: gridNode(),
      } as never);
      expect(patch).not.toHaveBeenCalled();
    });
  });

  describe('save flow', () => {
    function gridNode() {
      return { setData: vi.fn(), setDataValue: vi.fn() };
    }

    function fakeGridApi() {
      return { refreshInfiniteCache: vi.fn(), setGridOption: vi.fn() };
    }

    it('applies the PATCH response to the row via setData', async () => {
      await setup({});
      const api = TestBed.inject(ApplicationsApi);
      const updated = baseApplication({ appStatus: 'Sent', sent: '2026-09-14' });
      vi.spyOn(api, 'patch').mockResolvedValue(updated);
      const node = gridNode();
      await component['patchFromGrid']({
        colDef: { field: 'appStatus' },
        data: { id: '42' },
        newValue: 'Sent',
        node,
      } as never);
      expect(node.setData).toHaveBeenCalledWith(updated);
    });

    it('refreshes the grid and reloads stats after a sent edit', async () => {
      await setup({});
      const api = TestBed.inject(ApplicationsApi);
      const getStats = vi.spyOn(api, 'getStats');
      vi.spyOn(api, 'patch').mockResolvedValue(baseApplication({ sent: '2026-09-14' }));
      const gridApi = fakeGridApi();
      component.onGridReady({ api: gridApi } as never);
      await component['patchFromGrid']({
        colDef: { field: 'sent' },
        data: { id: '42' },
        newValue: '2026-09-14',
        node: gridNode(),
      } as never);
      expect(gridApi.refreshInfiniteCache).toHaveBeenCalled();
      expect(getStats).toHaveBeenCalled();
    });

    it('refreshes the grid and reloads stats after an appStatus edit', async () => {
      await setup({});
      const api = TestBed.inject(ApplicationsApi);
      const getStats = vi.spyOn(api, 'getStats');
      vi.spyOn(api, 'patch').mockResolvedValue(
        baseApplication({ appStatus: 'Skipped', sent: '—' }),
      );
      const gridApi = fakeGridApi();
      component.onGridReady({ api: gridApi } as never);
      await component['patchFromGrid']({
        colDef: { field: 'appStatus' },
        data: { id: '42' },
        newValue: 'Skipped',
        node: gridNode(),
      } as never);
      expect(gridApi.refreshInfiniteCache).toHaveBeenCalled();
      expect(getStats).toHaveBeenCalled();
    });

    it('does not refresh the grid or reload stats after a toLearn edit', async () => {
      await setup({});
      const api = TestBed.inject(ApplicationsApi);
      // setup()'s constructor call to loadStats() already used this spy once.
      const getStats = vi.spyOn(api, 'getStats').mockClear();
      vi.spyOn(api, 'patch').mockResolvedValue(baseApplication({ toLearn: 'RxJS' }));
      const gridApi = fakeGridApi();
      component.onGridReady({ api: gridApi } as never);
      await component['patchFromGrid']({
        colDef: { field: 'toLearn' },
        data: { id: '42' },
        newValue: 'RxJS',
        node: gridNode(),
      } as never);
      expect(gridApi.refreshInfiniteCache).not.toHaveBeenCalled();
      expect(getStats).not.toHaveBeenCalled();
    });

    it('does not refresh the grid or reload stats after a note edit', async () => {
      await setup({});
      const api = TestBed.inject(ApplicationsApi);
      // setup()'s constructor call to loadStats() already used this spy once.
      const getStats = vi.spyOn(api, 'getStats').mockClear();
      vi.spyOn(api, 'patch').mockResolvedValue(baseApplication({ note: 'not a fit' }));
      const gridApi = fakeGridApi();
      component.onGridReady({ api: gridApi } as never);
      await component['patchFromGrid']({
        colDef: { field: 'note' },
        data: { id: '42' },
        newValue: 'not a fit',
        node: gridNode(),
      } as never);
      expect(gridApi.refreshInfiniteCache).not.toHaveBeenCalled();
      expect(getStats).not.toHaveBeenCalled();
    });

    it('shows "Moved to Filled" when a row leaves the unsent filter', async () => {
      await setup({ filter: 'unsent' });
      const api = TestBed.inject(ApplicationsApi);
      vi.spyOn(api, 'patch').mockResolvedValue(baseApplication({ sent: '2026-09-14' }));
      const snackBar = TestBed.inject(MatSnackBar);
      const open = vi.spyOn(snackBar, 'open');
      component.onGridReady({ api: fakeGridApi() } as never);
      await component['patchFromGrid']({
        colDef: { field: 'appStatus' },
        data: { id: '42' },
        newValue: 'Sent',
        node: gridNode(),
      } as never);
      expect(open).toHaveBeenCalledWith('Moved to Filled', undefined, { duration: 3000 });
    });

    it('does not show "Moved to Filled" outside the unsent filter', async () => {
      await setup({ filter: 'all' });
      const api = TestBed.inject(ApplicationsApi);
      vi.spyOn(api, 'patch').mockResolvedValue(baseApplication({ sent: '2026-09-14' }));
      const snackBar = TestBed.inject(MatSnackBar);
      const open = vi.spyOn(snackBar, 'open');
      component.onGridReady({ api: fakeGridApi() } as never);
      await component['patchFromGrid']({
        colDef: { field: 'appStatus' },
        data: { id: '42' },
        newValue: 'Sent',
        node: gridNode(),
      } as never);
      expect(open).not.toHaveBeenCalledWith('Moved to Filled', undefined, { duration: 3000 });
    });

    it('reverts the cell and shows an error snackbar on a failed PATCH', async () => {
      await setup({});
      const api = TestBed.inject(ApplicationsApi);
      vi.spyOn(api, 'patch').mockRejectedValue(new Error('boom'));
      const snackBar = TestBed.inject(MatSnackBar);
      const open = vi.spyOn(snackBar, 'open');
      const node = gridNode();
      await component['patchFromGrid']({
        colDef: { field: 'note' },
        data: { id: '42' },
        newValue: 'not a fit',
        oldValue: '',
        node,
      } as never);
      expect(node.setDataValue).toHaveBeenCalledWith('note', '');
      expect(open).toHaveBeenCalledWith('Failed to save change.', 'Dismiss', { duration: 4000 });
    });
  });

  describe('APP_STATUS_OPTIONS', () => {
    it('includes Silence alongside the other outcome labels', () => {
      expect(APP_STATUS_OPTIONS).toContain('Silence');
    });
  });
});
