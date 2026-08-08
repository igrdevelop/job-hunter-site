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

@Component({
  selector: 'app-applications',
  imports: [
    FormsModule,
    MatFormFieldModule,
    MatInputModule,
    MatIconModule,
    MatProgressSpinnerModule,
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

  readonly columnDefs: ColDef<Application>[] = [
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
    { field: 'toLearn', headerName: 'To Learn', minWidth: 120, flex: 0.6, editable: true },
    { field: 'folder', headerName: '', width: 52, cellRenderer: FolderCellRendererComponent },
    { field: 'url', headerName: '', width: 52, cellRenderer: UrlCellRendererComponent, pinned: 'right' },
  ];

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

  onCellValueChanged(event: CellValueChangedEvent<Application>): void {
    const field = event.colDef.field as keyof Application;
    if ((field === 'sent' || field === 'toLearn') && event.data) {
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
