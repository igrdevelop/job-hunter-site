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
import { MatDialog } from '@angular/material/dialog';
import { BehaviorSubject, of } from 'rxjs';
import { vi } from 'vitest';
import { ApplicationsComponent, COLUMNS_STORAGE_KEY } from './applications.component';
import { ApplicationsApi } from '../../core/api/applications.api';
import { APP_STATUS_OPTIONS, Application } from '../../core/api/models';
import { DeclineReasonDialogComponent } from './decline-reason-dialog/decline-reason-dialog.component';

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

    it('shows My Status by default as a non-editable pill-renderer column with no grid editor', async () => {
      await setup({});
      const def = colDef('appStatus');
      expect(def?.hide).toBeUndefined();
      expect(def?.editable).toBe(false);
      expect(def?.cellEditor).toBeUndefined();
      expect(def?.cellRenderer).toBeDefined();
      expect(def?.cellRendererParams?.onSelect).toBeInstanceOf(Function);
    });

    it('makes the Sent column read-only', async () => {
      await setup({});
      const def = colDef('sent');
      expect(def?.headerName).toBe('Sent');
      expect(def?.editable).toBe(false);
    });

    it('shows a read-only Reason column by default, replacing Note', async () => {
      await setup({});
      expect(colDef('note')).toBeUndefined();
      const def = component.columnDefs.find((d) => d.colId === 'reason');
      expect(def?.headerName).toBe('Reason');
      expect(def?.hide).toBeUndefined();
      expect(def?.editable).toBeFalsy();
      expect(def?.valueGetter).toBeInstanceOf(Function);
      expect(def?.tooltipValueGetter).toBeInstanceOf(Function);
      expect(def?.onCellClicked).toBeInstanceOf(Function);
    });

    it('excludes icon-only folder/url columns from the toggle menu', async () => {
      await setup({});
      const ids = component.columnToggles.map((t) => t.colId);
      expect(ids).not.toContain('folder');
      expect(ids).not.toContain('url');
      expect(ids).toContain('driveUrl');
      expect(ids).toContain('reason');
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

    it('patches toLearn edits through the API', async () => {
      await setup({});
      const api = TestBed.inject(ApplicationsApi);
      const patch = vi.spyOn(api, 'patch').mockResolvedValue(baseApplication());
      component.onCellValueChanged({
        colDef: { field: 'toLearn' },
        data: { id: '42' },
        newValue: 'RxJS',
        node: gridNode(),
      } as never);
      expect(patch).toHaveBeenCalledWith('42', { toLearn: 'RxJS' });
    });

    it('does not patch appStatus through onCellValueChanged (no grid editor any more)', async () => {
      await setup({});
      const api = TestBed.inject(ApplicationsApi);
      const patch = vi.spyOn(api, 'patch').mockResolvedValue(baseApplication());
      component.onCellValueChanged({
        colDef: { field: 'appStatus' },
        data: { id: '42' },
        newValue: 'Rejected',
        node: gridNode(),
      } as never);
      expect(patch).not.toHaveBeenCalled();
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

  describe('patchFromGrid (toLearn inline edit)', () => {
    function gridNode() {
      return { setData: vi.fn(), setDataValue: vi.fn() };
    }

    it('applies the PATCH response to the row via setData', async () => {
      await setup({});
      const api = TestBed.inject(ApplicationsApi);
      const updated = baseApplication({ toLearn: 'RxJS' });
      vi.spyOn(api, 'patch').mockResolvedValue(updated);
      const node = gridNode();
      await component['patchFromGrid']({
        colDef: { field: 'toLearn' },
        data: { id: '42' },
        newValue: 'RxJS',
        node,
      } as never);
      expect(node.setData).toHaveBeenCalledWith(updated);
    });

    it('reverts the cell and shows an error snackbar on a failed PATCH', async () => {
      await setup({});
      const api = TestBed.inject(ApplicationsApi);
      vi.spyOn(api, 'patch').mockRejectedValue(new Error('boom'));
      const snackBar = TestBed.inject(MatSnackBar);
      const open = vi.spyOn(snackBar, 'open');
      const node = gridNode();
      await component['patchFromGrid']({
        colDef: { field: 'toLearn' },
        data: { id: '42' },
        newValue: 'RxJS',
        oldValue: '',
        node,
      } as never);
      expect(node.setDataValue).toHaveBeenCalledWith('toLearn', '');
      expect(open).toHaveBeenCalledWith('Failed to save change.', 'Dismiss', { duration: 4000 });
    });
  });

  describe('saveRow (My Status menu + decline dialog)', () => {
    function gridNode(data: Partial<Application> = { id: '42' }) {
      return { data, setData: vi.fn() };
    }

    function fakeGridApi() {
      return { refreshInfiniteCache: vi.fn(), setGridOption: vi.fn() };
    }

    it('applies the PATCH response to the row via setData, without an optimistic change first', async () => {
      await setup({});
      const api = TestBed.inject(ApplicationsApi);
      const updated = baseApplication({ appStatus: 'Sent', sent: '2026-09-14' });
      const patch = vi.spyOn(api, 'patch').mockResolvedValue(updated);
      const node = gridNode();

      await component.saveRow(node as never, { appStatus: 'Sent' });

      expect(patch).toHaveBeenCalledWith('42', { appStatus: 'Sent' });
      expect(node.setData).toHaveBeenCalledWith(updated);
    });

    it('refreshes the grid and reloads stats when the patch includes appStatus', async () => {
      await setup({});
      const api = TestBed.inject(ApplicationsApi);
      const getStats = vi.spyOn(api, 'getStats');
      vi.spyOn(api, 'patch').mockResolvedValue(baseApplication({ appStatus: 'Skipped', sent: '—' }));
      const gridApi = fakeGridApi();
      component.onGridReady({ api: gridApi } as never);

      await component.saveRow(gridNode() as never, { appStatus: 'Skipped', ownerReason: 'stack', ownerReasonNote: '' });

      expect(gridApi.refreshInfiniteCache).toHaveBeenCalled();
      expect(getStats).toHaveBeenCalled();
    });

    it('shows "Moved to Filled" when a row leaves the unsent filter', async () => {
      await setup({ filter: 'unsent' });
      const api = TestBed.inject(ApplicationsApi);
      vi.spyOn(api, 'patch').mockResolvedValue(baseApplication({ sent: '2026-09-14' }));
      const snackBar = TestBed.inject(MatSnackBar);
      const open = vi.spyOn(snackBar, 'open');
      component.onGridReady({ api: fakeGridApi() } as never);

      await component.saveRow(gridNode() as never, { appStatus: 'Sent' });

      expect(open).toHaveBeenCalledWith('Moved to Filled', undefined, { duration: 3000 });
    });

    it('does not show "Moved to Filled" outside the unsent filter', async () => {
      await setup({ filter: 'all' });
      const api = TestBed.inject(ApplicationsApi);
      vi.spyOn(api, 'patch').mockResolvedValue(baseApplication({ sent: '2026-09-14' }));
      const snackBar = TestBed.inject(MatSnackBar);
      const open = vi.spyOn(snackBar, 'open');
      component.onGridReady({ api: fakeGridApi() } as never);

      await component.saveRow(gridNode() as never, { appStatus: 'Sent' });

      expect(open).not.toHaveBeenCalledWith('Moved to Filled', undefined, { duration: 3000 });
    });

    it('shows an error snackbar on a failed PATCH, with no optimistic state to revert', async () => {
      await setup({});
      const api = TestBed.inject(ApplicationsApi);
      vi.spyOn(api, 'patch').mockRejectedValue(new Error('boom'));
      const snackBar = TestBed.inject(MatSnackBar);
      const open = vi.spyOn(snackBar, 'open');
      const node = gridNode();

      await component.saveRow(node as never, { appStatus: 'Sent' });

      expect(node.setData).not.toHaveBeenCalled();
      expect(open).toHaveBeenCalledWith('Failed to save change.', 'Dismiss', { duration: 4000 });
    });
  });

  describe('onAppStatusSelected (My Status menu callback)', () => {
    function gridNode(data: Partial<Application> = { id: '42' }) {
      return { data, setData: vi.fn() };
    }

    it('saves a direct status immediately, without opening a dialog', async () => {
      await setup({});
      const api = TestBed.inject(ApplicationsApi);
      const patch = vi.spyOn(api, 'patch').mockResolvedValue(baseApplication({ appStatus: 'Interview' }));
      const dialog = TestBed.inject(MatDialog);
      const openSpy = vi.spyOn(dialog, 'open');

      component.onAppStatusSelected(gridNode() as never, 'Interview');
      await Promise.resolve();

      expect(patch).toHaveBeenCalledWith('42', { appStatus: 'Interview' });
      expect(openSpy).not.toHaveBeenCalled();
    });

    it('clears a status directly (no dialog) when "Clear" is chosen', async () => {
      await setup({});
      const api = TestBed.inject(ApplicationsApi);
      const patch = vi.spyOn(api, 'patch').mockResolvedValue(baseApplication({ appStatus: '' }));

      component.onAppStatusSelected(gridNode() as never, '');
      await Promise.resolve();

      expect(patch).toHaveBeenCalledWith('42', { appStatus: '' });
    });

    it('opens the decline dialog for Skipped instead of saving directly', async () => {
      await setup({});
      const dialog = TestBed.inject(MatDialog);
      const openSpy = vi.spyOn(dialog, 'open').mockReturnValue({
        afterClosed: () => of(undefined),
      } as unknown as ReturnType<MatDialog['open']>);
      const api = TestBed.inject(ApplicationsApi);
      const patch = vi.spyOn(api, 'patch');

      component.onAppStatusSelected(gridNode() as never, 'Skipped');

      expect(openSpy).toHaveBeenCalledWith(DeclineReasonDialogComponent, expect.anything());
      expect(patch).not.toHaveBeenCalled();
    });

    it('opens the decline dialog for Filter miss instead of saving directly', async () => {
      await setup({});
      const dialog = TestBed.inject(MatDialog);
      const openSpy = vi.spyOn(dialog, 'open').mockReturnValue({
        afterClosed: () => of(undefined),
      } as unknown as ReturnType<MatDialog['open']>);

      component.onAppStatusSelected(gridNode() as never, 'Filter miss');

      expect(openSpy).toHaveBeenCalledWith(DeclineReasonDialogComponent, expect.anything());
    });
  });

  describe('openDeclineDialog', () => {
    function gridNode(data: Partial<Application> = { id: '42' }) {
      return { data, setData: vi.fn() };
    }

    it('pre-fills the dialog data from the row\'s existing reason when editing', async () => {
      await setup({});
      const dialog = TestBed.inject(MatDialog);
      const openSpy = vi.spyOn(dialog, 'open').mockReturnValue({
        afterClosed: () => of(undefined),
      } as unknown as ReturnType<MatDialog['open']>);
      const node = gridNode({ id: '42', ownerReason: 'stack', ownerReasonNote: 'React only' });

      component.openDeclineDialog(node as never, 'Skipped');

      expect(openSpy).toHaveBeenCalledWith(
        DeclineReasonDialogComponent,
        expect.objectContaining({
          data: { status: 'Skipped', reason: 'stack', note: 'React only' },
        }),
      );
    });

    it('does not change anything when the dialog is cancelled', async () => {
      await setup({});
      const dialog = TestBed.inject(MatDialog);
      vi.spyOn(dialog, 'open').mockReturnValue({
        afterClosed: () => of(undefined),
      } as unknown as ReturnType<MatDialog['open']>);
      const api = TestBed.inject(ApplicationsApi);
      const patch = vi.spyOn(api, 'patch');

      component.openDeclineDialog(gridNode() as never, 'Skipped');
      await Promise.resolve();

      expect(patch).not.toHaveBeenCalled();
    });

    it('saves the chosen reason and comment when the dialog is confirmed', async () => {
      await setup({});
      const dialog = TestBed.inject(MatDialog);
      vi.spyOn(dialog, 'open').mockReturnValue({
        afterClosed: () => of({ reason: 'location', note: '3 days in Kraków' }),
      } as unknown as ReturnType<MatDialog['open']>);
      const api = TestBed.inject(ApplicationsApi);
      const patch = vi
        .spyOn(api, 'patch')
        .mockResolvedValue(baseApplication({ appStatus: 'Skipped', sent: '—' }));

      component.openDeclineDialog(gridNode() as never, 'Skipped');
      await Promise.resolve();
      await Promise.resolve();

      expect(patch).toHaveBeenCalledWith('42', {
        appStatus: 'Skipped',
        ownerReason: 'location',
        ownerReasonNote: '3 days in Kraków',
      });
    });
  });

  describe('Reason column', () => {
    function reasonColDef() {
      return component.columnDefs.find((d) => d.colId === 'reason')!;
    }

    it('reasonText() formats label + comment, label only, or — when empty', () => {
      expect(component.reasonText(baseApplication({ ownerReason: 'location', ownerReasonNote: '3 days' }))).toBe(
        'Location / onsite / hybrid — 3 days',
      );
      expect(component.reasonText(baseApplication({ ownerReason: 'stack', ownerReasonNote: '' }))).toBe(
        'Wrong stack',
      );
      expect(component.reasonText(baseApplication({}))).toBe('—');
    });

    it('onCellClicked opens the decline dialog for a Skipped row', () => {
      const openSpy = vi.spyOn(component, 'openDeclineDialog').mockImplementation(() => {});
      const node = { data: { appStatus: 'Skipped' } } as never;
      reasonColDef().onCellClicked!({ data: { appStatus: 'Skipped' }, node } as never);
      expect(openSpy).toHaveBeenCalledWith(node, 'Skipped');
    });

    it('onCellClicked opens the decline dialog for a Filter miss row', () => {
      const openSpy = vi.spyOn(component, 'openDeclineDialog').mockImplementation(() => {});
      const node = { data: { appStatus: 'Filter miss' } } as never;
      reasonColDef().onCellClicked!({ data: { appStatus: 'Filter miss' }, node } as never);
      expect(openSpy).toHaveBeenCalledWith(node, 'Filter miss');
    });

    it('onCellClicked does nothing for a non-decline row', () => {
      const openSpy = vi.spyOn(component, 'openDeclineDialog').mockImplementation(() => {});
      const node = { data: { appStatus: 'Sent' } } as never;
      reasonColDef().onCellClicked!({ data: { appStatus: 'Sent' }, node } as never);
      expect(openSpy).not.toHaveBeenCalled();
    });

    it('onCellClicked does nothing for a row with no status set', () => {
      const openSpy = vi.spyOn(component, 'openDeclineDialog').mockImplementation(() => {});
      const node = { data: { appStatus: '' } } as never;
      reasonColDef().onCellClicked!({ data: { appStatus: '' }, node } as never);
      expect(openSpy).not.toHaveBeenCalled();
    });
  });

  describe('APP_STATUS_OPTIONS', () => {
    it('includes Silence alongside the other outcome labels', () => {
      expect(APP_STATUS_OPTIONS).toContain('Silence');
    });

    it('includes Skipped and Filter miss, the two decline statuses', () => {
      expect(APP_STATUS_OPTIONS).toContain('Skipped');
      expect(APP_STATUS_OPTIONS).toContain('Filter miss');
    });
  });
});
