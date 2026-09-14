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
  IRowNode,
  ModuleRegistry,
} from 'ag-grid-community';
import { ApplicationsApi } from '../../core/api/applications.api';
import {
  Application,
  ApplicationPatch,
  ApplicationStats,
  DeclineStatus,
  SentFilter,
  SortableColumn,
  isDeclineStatus,
  ownerReasonLabel,
} from '../../core/api/models';
import { UrlCellRendererComponent } from './cell-renderers/url-cell-renderer.component';
import { FolderCellRendererComponent } from './cell-renderers/folder-cell-renderer.component';
import { SentStatusCellRendererComponent } from './cell-renderers/sent-status-cell-renderer.component';
import {
  AppStatusCellRendererComponent,
  AppStatusCellRendererParams,
} from './cell-renderers/app-status-cell-renderer.component';
import { NewApplicationDialogComponent } from './new-application-dialog/new-application-dialog.component';
import {
  DeclineReasonDialogComponent,
  DeclineReasonDialogData,
  DeclineReasonDialogResult,
} from './decline-reason-dialog/decline-reason-dialog.component';

ModuleRegistry.registerModules([AllCommunityModule]);

const REFRESH_INTERVAL_MS = 30_000;
const SEARCH_DEBOUNCE_MS = 400;
export const COLUMNS_STORAGE_KEY = 'applications.columns';

/** Column identity for the toggle menu / stored-visibility map: most columns
 * are keyed by `field`, but the Reason column has no single backing field
 * (it derives from ownerReason + ownerReasonNote), so it declares `colId`
 * explicitly — fall back to that when present. */
function colKey(def: ColDef<Application>): string {
  return (def.colId ?? (def.field as string)) as string;
}

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
      // Read-only: it's a derived record of the date applied (or — for a
      // deliberate non-apply), not something to hand-edit any more — see
      // docs/APPLICATIONS_STATUS_NOTE_PLAN.md "v2".
      field: 'sent',
      sortable: true,
      headerName: 'Sent',
      headerTooltip: 'Date you applied, or — if not applying. Empty = Unsent.',
      width: 130,
      editable: false,
      cellRenderer: SentStatusCellRendererComponent,
    },
    {
      // Manual status; picking one fills `sent` (and, for some values, the
      // bot's outcome_label) server-side. No grid editor at all — the pill
      // renderer opens a mat-menu on click and reports the choice via
      // onAppStatusSelected(); Skipped/Filter miss route through
      // openDeclineDialog() instead of saving straight away.
      field: 'appStatus',
      headerName: 'My Status',
      headerTooltip: 'Click to set a status — it fills Sent automatically. Skipped/Filter miss ask why.',
      width: 150,
      editable: false,
      cellRenderer: AppStatusCellRendererComponent,
      cellRendererParams: {
        onSelect: (node: IRowNode<Application>, status: string) => this.onAppStatusSelected(node, status),
      } as Pick<AppStatusCellRendererParams, 'onSelect'>,
    },
    {
      // Replaces the round-1 free-text Note column (never shipped api-side)
      // with a read-only view of the structured owner_reason/_note pair —
      // see docs/APPLICATIONS_STATUS_NOTE_PLAN.md "v2". Editing happens only
      // through DeclineReasonDialogComponent, opened by clicking a
      // Skipped/Filter miss row.
      colId: 'reason',
      headerName: 'Reason',
      minWidth: 200,
      flex: 1,
      valueGetter: (p) => (p.data ? this.reasonText(p.data) : ''),
      tooltipValueGetter: (p) => (p.data ? this.reasonText(p.data) : ''),
      onCellClicked: (p) => {
        const status = p.data?.appStatus;
        if (p.data && status && isDeclineStatus(status)) {
          this.openDeclineDialog(p.node, status);
        }
      },
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
    .map((def) => ({ colId: colKey(def), label: def.headerName as string }));

  readonly hiddenColumns = signal<Record<string, boolean>>(
    Object.fromEntries(this.columnToggles.map(({ colId }) => {
      const def = this.columnDefs.find((d) => colKey(d) === colId);
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
    return defs.map((def) => {
      const key = colKey(def);
      return def.headerName && typeof stored[key] === 'boolean' ? { ...def, hide: stored[key] } : def;
    });
  }

  onCellValueChanged(event: CellValueChangedEvent<Application>): void {
    // Sent is read-only and My Status has no grid editor any more — both go
    // through saveRow() (onAppStatusSelected / the decline dialog) instead.
    // To Learn is the only field still edited inline.
    const field = event.colDef.field as keyof Application;
    if (field === 'toLearn' && event.data) {
      void this.patchFromGrid(event);
    }
  }

  private async patchFromGrid(event: CellValueChangedEvent<Application>): Promise<void> {
    const field = event.colDef.field!;
    try {
      const updated = await this.api.patch(event.data!.id, { [field]: event.newValue });
      if (updated && typeof updated === 'object') {
        event.node.setData(updated);
      }
    } catch {
      event.node.setDataValue(field, event.oldValue);
      this.snackBar.open('Failed to save change.', 'Dismiss', { duration: 4000 });
    }
  }

  /** My Status menu callback (AppStatusCellRendererParams.onSelect). Direct
   * statuses save immediately; Skipped/Filter miss ask why first. */
  onAppStatusSelected(node: IRowNode<Application>, status: string): void {
    if (isDeclineStatus(status)) {
      this.openDeclineDialog(node, status);
      return;
    }
    void this.saveRow(node, { appStatus: status });
  }

  /** Opens DeclineReasonDialogComponent for a Skipped/Filter miss row — from
   * the My Status menu (a fresh pick) or a click on the Reason column (an
   * edit of an existing one, pre-filled). Cancel/Esc/backdrop resolves with
   * `undefined`, which must change nothing, not even the status itself. */
  openDeclineDialog(node: IRowNode<Application>, status: DeclineStatus): void {
    const data = node.data;
    this.dialog
      .open<DeclineReasonDialogComponent, DeclineReasonDialogData, DeclineReasonDialogResult | undefined>(
        DeclineReasonDialogComponent,
        {
          data: {
            status,
            reason: data?.ownerReason ?? '',
            note: data?.ownerReasonNote ?? '',
          },
        },
      )
      .afterClosed()
      .subscribe((result) => {
        if (!result) return;
        void this.saveRow(node, {
          appStatus: status,
          ownerReason: result.reason,
          ownerReasonNote: result.note,
        });
      });
  }

  /** Shared save path for the My Status menu and the decline dialog — no
   * optimistic change is made first (unlike patchFromGrid's inline-edit
   * revert dance), so a failure just informs, nothing to undo. */
  async saveRow(node: IRowNode<Application>, patch: ApplicationPatch): Promise<void> {
    const id = node.data?.id;
    if (!id) return;
    try {
      const updated = await this.api.patch(id, patch);
      node.setData(updated);

      if (patch.appStatus !== undefined) {
        this.gridApi?.refreshInfiniteCache();
        void this.loadStats();

        if (
          this.statusFilter() === 'unsent' &&
          typeof updated.sent === 'string' &&
          updated.sent.trim() !== ''
        ) {
          this.snackBar.open('Moved to Filled', undefined, { duration: 3000 });
        }
      }
    } catch {
      this.snackBar.open('Failed to save change.', 'Dismiss', { duration: 4000 });
    }
  }

  /** Reason column text: "<label> — <comment>", label only, or — when empty. */
  reasonText(app: Application): string {
    const reason = app.ownerReason?.trim();
    if (!reason) return '—';
    const label = ownerReasonLabel(reason);
    const note = app.ownerReasonNote?.trim();
    return note ? `${label} — ${note}` : label;
  }
}
