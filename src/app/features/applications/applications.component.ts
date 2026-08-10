import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  effect,
  inject,
  signal,
} from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatIconModule } from '@angular/material/icon';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatMenuModule } from '@angular/material/menu';
import { MatSnackBar } from '@angular/material/snack-bar';
import { MatDialog } from '@angular/material/dialog';
import { AgGridAngular } from 'ag-grid-angular';
import {
  AllCommunityModule,
  CellValueChangedEvent,
  ColDef,
  GridApi,
  GridReadyEvent,
  IDatasource,
  IGetRowsParams,
  ModuleRegistry,
} from 'ag-grid-community';
import { ApplicationsApi } from '../../core/api/applications.api';
import {
  APP_STATUS_OPTIONS,
  Application,
  ApplicationStats,
  SentFilter,
  SortableColumn,
} from '../../core/api/models';
import { UrlCellRendererComponent } from './cell-renderers/url-cell-renderer.component';
import { FolderCellRendererComponent } from './cell-renderers/folder-cell-renderer.component';
import { SentStatusCellRendererComponent } from './cell-renderers/sent-status-cell-renderer.component';
import { NewApplicationDialogComponent } from './new-application-dialog/new-application-dialog.component';

ModuleRegistry.registerModules([AllCommunityModule]);

const REFRESH_INTERVAL_MS = 30_000;
const SEARCH_DEBOUNCE_MS = 400;
export const COLUMNS_STORAGE_KEY = 'applications.columns';

@Component({
  selector: 'app-applications',
  imports: [
    FormsModule,
    MatFormFieldModule,
    MatInputModule,
    MatIconModule,
    MatProgressSpinnerModule,
    MatMenuModule,
    AgGridAngular,
  ],
  templateUrl: './applications.component.html',
  styleUrl: './applications.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ApplicationsComponent {
  private readonly api = inject(ApplicationsApi);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly destroyRef = inject(DestroyRef);
  private readonly snackBar = inject(MatSnackBar);
  private readonly dialog = inject(MatDialog);

  private gridApi?: GridApi<Application>;

  private readonly queryParams = toSignal(this.route.queryParamMap, { requireSync: true });
  /** Filter/search the grid last queried with — guards against redundant refreshes. */
  private lastQuery: { filter: SentFilter; search: string } | null = null;

  readonly limit = signal(50);
  readonly statusFilter = signal<SentFilter>('unsent');
  readonly search = signal('');
  readonly stats = signal<ApplicationStats | null>(null);

  readonly loading = signal(false);
  readonly errorMessage = signal<string | null>(null);

  readonly statusOptions: SentFilter[] = ['all', 'unsent', 'filled'];

  readonly defaultColDef: ColDef = {
    sortable: false,
    resizable: true,
    suppressMovable: true,
  };

  readonly columnDefs: ColDef<Application>[] = this.applyStoredVisibility([
    { field: 'date', sortable: true, headerName: 'Date', width: 118, cellClass: 'cell-date' },
    {
      field: 'company',
      sortable: true,
      headerName: 'Company',
      minWidth: 150,
      flex: 1,
      cellClass: 'cell-company',
    },
    { field: 'title', sortable: true, headerName: 'Job Title', minWidth: 200, flex: 1.4 },
    { field: 'stack', headerName: 'Stack', minWidth: 110, flex: 0.7, cellClass: 'cell-stack' },
    {
      field: 'atsStatus',
      sortable: true,
      headerName: 'ATS %',
      width: 88,
      valueFormatter: (p) => p.value || '—',
      cellClass: 'cell-ats',
    },
    {
      field: 'sent',
      sortable: true,
      headerName: 'Status',
      width: 130,
      editable: true,
      cellRenderer: SentStatusCellRendererComponent,
    },
    {
      // Manual status, independent of `sent` (which drives the Unsent filter/stats).
      field: 'appStatus',
      headerName: 'My Status',
      width: 130,
      editable: true,
      cellEditor: 'agSelectCellEditor',
      cellEditorParams: { values: [...APP_STATUS_OPTIONS] },
      valueFormatter: (p) => p.value || '—',
    },
    { field: 'toLearn', headerName: 'To Learn', minWidth: 120, flex: 0.6, editable: true },
    {
      field: 'reapplication',
      headerName: 'Re-application',
      minWidth: 130,
      flex: 0.6,
      hide: true,
      valueFormatter: (p) => p.value || '—',
    },
    {
      field: 'driveUrl',
      headerName: 'Drive',
      width: 80,
      hide: true,
      cellRenderer: UrlCellRendererComponent,
    },
    {
      field: 'costUsd',
      sortable: true,
      headerName: 'Cost $',
      width: 96,
      hide: true,
      valueFormatter: (p) => (p.value != null ? `$${Number(p.value).toFixed(2)}` : '—'),
    },
    {
      field: 'atsVerdict',
      sortable: true,
      headerName: 'ATS Verdict',
      width: 116,
      hide: true,
      valueFormatter: (p) => (p.value != null ? String(p.value) : '—'),
    },
    { field: 'id', headerName: 'ID', width: 90, hide: true, cellClass: 'cell-date' },
    { field: 'folder', headerName: '', width: 52, cellRenderer: FolderCellRendererComponent },
    { field: 'url', headerName: '', width: 52, cellRenderer: UrlCellRendererComponent, pinned: 'right' },
  ]);

  /** Columns togglable from the toolbar menu (icon-only folder/url excluded). */
  readonly columnToggles = this.columnDefs
    .filter((def) => def.headerName)
    .map((def) => ({ colId: def.field as string, label: def.headerName as string }));

  readonly hiddenColumns = signal<Record<string, boolean>>(
    Object.fromEntries(this.columnToggles.map(({ colId }) => {
      const def = this.columnDefs.find((d) => d.field === colId);
      return [colId, def?.hide === true];
    })),
  );

  readonly datasource: IDatasource = {
    getRows: (params: IGetRowsParams) => {
      const page = Math.floor(params.startRow / this.limit()) + 1;
      const sortModel = params.sortModel[0];

      this.loading.set(true);
      this.errorMessage.set(null);

      this.api
        .getApplications({
          page,
          limit: this.limit(),
          sort: sortModel?.colId as SortableColumn | undefined,
          order: sortModel?.sort as 'asc' | 'desc' | undefined,
          status: this.statusFilter(),
          search: this.search() || undefined,
        })
        .then((result) => {
          params.successCallback(result.data, result.meta.total);
        })
        .catch(() => {
          this.errorMessage.set('Could not load applications. Is the API reachable?');
          params.failCallback();
        })
        .finally(() => {
          this.loading.set(false);
        });
    },
  };

  private searchDebounceHandle?: ReturnType<typeof setTimeout>;

  constructor() {
    this.loadStats();

    // URL → state: covers initial deep links, back/forward and in-app
    // navigation. The toolbar handlers only write the URL; this effect is
    // the single place that applies it and refreshes the grid.
    effect(() => {
      const params = this.queryParams();
      const rawFilter = params.get('filter');
      const filter = this.statusOptions.includes(rawFilter as SentFilter)
        ? (rawFilter as SentFilter)
        : 'unsent';
      const search = params.get('search') ?? '';
      this.statusFilter.set(filter);
      this.search.set(search);
      if (this.lastQuery && filter === this.lastQuery.filter && search === this.lastQuery.search) {
        return;
      }
      this.lastQuery = { filter, search };
      this.gridApi?.setGridOption('datasource', this.datasource);
    });

    const intervalId = setInterval(
      // refreshInfiniteCache keeps current rows visible until new data arrives (no flicker),
      // unlike purgeInfiniteCache which blanks the grid immediately.
      () => this.gridApi?.refreshInfiniteCache(),
      REFRESH_INTERVAL_MS,
    );
    this.destroyRef.onDestroy(() => {
      clearInterval(intervalId);
      clearTimeout(this.searchDebounceHandle);
    });
  }

  async loadStats(): Promise<void> {
    try {
      this.stats.set(await this.api.getStats());
    } catch {
      this.stats.set(null);
    }
  }

  openNewApplication(): void {
    this.dialog
      .open<NewApplicationDialogComponent, void, Application>(NewApplicationDialogComponent)
      .afterClosed()
      .subscribe((created) => {
        if (!created) return;
        this.snackBar.open('Application created.', undefined, { duration: 3000 });
        this.gridApi?.refreshInfiniteCache();
        void this.loadStats();
      });
  }

  onStatusFilterChange(status: SentFilter): void {
    void this.router.navigate([], {
      relativeTo: this.route,
      queryParams: { filter: status === 'unsent' ? null : status },
      queryParamsHandling: 'merge',
    });
  }

  onSearchInput(value: string): void {
    // Keep the input responsive; the URL (and grid) update after the debounce.
    this.search.set(value);
    clearTimeout(this.searchDebounceHandle);
    this.searchDebounceHandle = setTimeout(() => {
      void this.router.navigate([], {
        relativeTo: this.route,
        queryParams: { search: value.trim() ? value : null },
        queryParamsHandling: 'merge',
      });
    }, SEARCH_DEBOUNCE_MS);
  }

  onGridReady(event: GridReadyEvent<Application>): void {
    this.gridApi = event.api;
    this.gridApi.setGridOption('datasource', this.datasource);
  }

  isColumnVisible(colId: string): boolean {
    return !this.hiddenColumns()[colId];
  }

  toggleColumn(colId: string): void {
    const hidden = { ...this.hiddenColumns(), [colId]: this.isColumnVisible(colId) };
    this.hiddenColumns.set(hidden);
    this.gridApi?.setColumnsVisible([colId], !hidden[colId]);
    try {
      localStorage.setItem(COLUMNS_STORAGE_KEY, JSON.stringify(hidden));
    } catch {
      // Persistence is best-effort (private mode / quota); the toggle still applies.
    }
  }

  /** Merge the user's saved show/hide choices over the default `hide` flags. */
  private applyStoredVisibility(defs: ColDef<Application>[]): ColDef<Application>[] {
    let stored: Record<string, boolean>;
    try {
      stored = JSON.parse(localStorage.getItem(COLUMNS_STORAGE_KEY) ?? '{}');
    } catch {
      return defs;
    }
    return defs.map((def) =>
      def.headerName && typeof stored[def.field as string] === 'boolean'
        ? { ...def, hide: stored[def.field as string] }
        : def,
    );
  }

  onCellValueChanged(event: CellValueChangedEvent<Application>): void {
    const field = event.colDef.field as keyof Application;
    if ((field === 'sent' || field === 'toLearn' || field === 'appStatus') && event.data) {
      void this.patchFromGrid(event);
    }
  }

  private async patchFromGrid(event: CellValueChangedEvent<Application>): Promise<void> {
    const field = event.colDef.field!;
    try {
      await this.api.patch(event.data!.id, { [field]: event.newValue });
    } catch {
      event.node.setDataValue(field, event.oldValue);
      this.snackBar.open('Failed to save change.', 'Dismiss', { duration: 4000 });
    }
  }
}
