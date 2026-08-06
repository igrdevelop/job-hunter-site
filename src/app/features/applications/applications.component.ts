import { ChangeDetectionStrategy, Component, DestroyRef, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatIconModule } from '@angular/material/icon';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatSnackBar } from '@angular/material/snack-bar';
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
  private readonly destroyRef = inject(DestroyRef);
  private readonly snackBar = inject(MatSnackBar);

  private gridApi?: GridApi<Application>;

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
    { field: 'date', sortable: true, headerName: 'Date', width: 110 },
    { field: 'company', sortable: true, headerName: 'Company', minWidth: 140 },
    { field: 'title', sortable: true, headerName: 'Job Title', minWidth: 180, flex: 1 },
    { field: 'stack', headerName: 'Stack', minWidth: 120 },
    {
      field: 'atsStatus',
      sortable: true,
      headerName: 'ATS %',
      width: 90,
      valueFormatter: (p) => p.value || '—',
    },
    { field: 'url', headerName: 'URL', width: 70, cellRenderer: UrlCellRendererComponent },
    { field: 'folder', headerName: 'Folder', width: 80, cellRenderer: FolderCellRendererComponent },
    { field: 'sent', sortable: true, headerName: 'Sent', width: 130, editable: true },
    { field: 'toLearn', headerName: 'To Learn', width: 140, editable: true },
    {
      field: 'atsVerdict',
      sortable: true,
      headerName: 'ATS Verdict',
      width: 110,
      valueFormatter: (p) => p.value ?? '—',
    },
    {
      field: 'costUsd',
      sortable: true,
      headerName: 'Cost $',
      width: 90,
      valueFormatter: (p) => p.value ?? '—',
    },
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

    const intervalId = setInterval(
      () => this.gridApi?.purgeInfiniteCache(),
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

  onStatusFilterChange(status: SentFilter): void {
    this.statusFilter.set(status);
    this.gridApi?.setGridOption('datasource', this.datasource);
  }

  onSearchInput(value: string): void {
    this.search.set(value);
    clearTimeout(this.searchDebounceHandle);
    this.searchDebounceHandle = setTimeout(() => {
      this.gridApi?.setGridOption('datasource', this.datasource);
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
