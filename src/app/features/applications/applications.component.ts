import { Component, DestroyRef, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { BreakpointObserver } from '@angular/cdk/layout';
import { toSignal } from '@angular/core/rxjs-interop';
import { map } from 'rxjs';
import { MatTableModule } from '@angular/material/table';
import { MatSortModule, Sort } from '@angular/material/sort';
import { MatPaginatorModule, PageEvent } from '@angular/material/paginator';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatSelectModule } from '@angular/material/select';
import { MatIconModule } from '@angular/material/icon';
import { MatButtonModule } from '@angular/material/button';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatSnackBar } from '@angular/material/snack-bar';
import { ApiService } from '../../core/api/api.service';
import {
  Application,
  ApplicationStats,
  ApplicationStatus,
  SortableColumn,
} from '../../core/api/models';
import { StatusBadgeComponent } from './status-badge/status-badge.component';
import { InlineEditCellComponent } from './inline-edit-cell/inline-edit-cell.component';

const REFRESH_INTERVAL_MS = 30_000;
const SEARCH_DEBOUNCE_MS = 400;

const ALL_COLUMNS = [
  'date',
  'company',
  'title',
  'stack',
  'atsStatus',
  'status',
  'url',
  'folder',
  'sent',
  'toLearn',
  'atsVerdict',
  'costUsd',
] as const;

const TABLET_HIDDEN = new Set(['stack', 'costUsd']);

@Component({
  selector: 'app-applications',
  standalone: true,
  imports: [
    FormsModule,
    RouterLink,
    MatTableModule,
    MatSortModule,
    MatPaginatorModule,
    MatFormFieldModule,
    MatInputModule,
    MatSelectModule,
    MatIconModule,
    MatButtonModule,
    MatProgressSpinnerModule,
    StatusBadgeComponent,
    InlineEditCellComponent,
  ],
  templateUrl: './applications.component.html',
  styleUrl: './applications.component.scss',
})
export class ApplicationsComponent {
  private readonly api = inject(ApiService);
  private readonly destroyRef = inject(DestroyRef);
  private readonly breakpointObserver = inject(BreakpointObserver);
  private readonly snackBar = inject(MatSnackBar);

  private readonly isMobile = toSignal(
    this.breakpointObserver.observe('(max-width: 599px)').pipe(map((r) => r.matches)),
    { initialValue: false },
  );
  private readonly isTablet = toSignal(
    this.breakpointObserver.observe('(max-width: 900px)').pipe(map((r) => r.matches)),
    { initialValue: false },
  );

  readonly displayedColumns = computed(() => {
    if (this.isTablet()) {
      return ALL_COLUMNS.filter((c) => !TABLET_HIDDEN.has(c));
    }
    return [...ALL_COLUMNS];
  });
  readonly cardLayout = this.isMobile;

  readonly applications = signal<Application[]>([]);
  readonly total = signal(0);
  readonly page = signal(0);
  readonly limit = signal(50);
  readonly sort = signal<SortableColumn | undefined>(undefined);
  readonly order = signal<'asc' | 'desc' | undefined>(undefined);
  readonly statusFilter = signal<ApplicationStatus | 'all'>('all');
  readonly search = signal('');
  readonly stats = signal<ApplicationStats | null>(null);

  readonly loading = signal(false);
  readonly errorMessage = signal<string | null>(null);

  readonly statusOptions: Array<ApplicationStatus | 'all'> = [
    'all',
    'applied',
    'sent',
    'failed',
    'expired',
    'pending',
  ];

  private searchDebounceHandle?: ReturnType<typeof setTimeout>;

  constructor() {
    this.load();
    this.loadStats();

    const intervalId = setInterval(() => this.load({ silent: true }), REFRESH_INTERVAL_MS);
    this.destroyRef.onDestroy(() => {
      clearInterval(intervalId);
      clearTimeout(this.searchDebounceHandle);
    });
  }

  async load(opts: { silent?: boolean } = {}): Promise<void> {
    if (!opts.silent) {
      this.loading.set(true);
    }
    this.errorMessage.set(null);

    try {
      const result = await this.api.getApplications({
        page: this.page() + 1,
        limit: this.limit(),
        sort: this.sort(),
        order: this.order(),
        status: this.statusFilter(),
        search: this.search() || undefined,
      });
      this.applications.set(result.data);
      this.total.set(result.meta.total);
    } catch {
      this.errorMessage.set('Could not load applications. Is the API reachable?');
    } finally {
      this.loading.set(false);
    }
  }

  async loadStats(): Promise<void> {
    try {
      this.stats.set(await this.api.getApplicationStats());
    } catch {
      this.stats.set(null);
    }
  }

  onSortChange(sort: Sort): void {
    this.sort.set(sort.direction ? (sort.active as SortableColumn) : undefined);
    this.order.set(sort.direction || undefined);
    this.load();
  }

  onPageChange(event: PageEvent): void {
    this.page.set(event.pageIndex);
    this.limit.set(event.pageSize);
    this.load();
  }

  onStatusFilterChange(status: ApplicationStatus | 'all'): void {
    this.statusFilter.set(status);
    this.page.set(0);
    this.load();
  }

  onSearchInput(value: string): void {
    this.search.set(value);
    clearTimeout(this.searchDebounceHandle);
    this.searchDebounceHandle = setTimeout(() => {
      this.page.set(0);
      this.load();
    }, SEARCH_DEBOUNCE_MS);
  }

  async onSentChange(app: Application, value: string): Promise<void> {
    await this.patch(app, { sent: value });
  }

  async onToLearnChange(app: Application, value: string): Promise<void> {
    await this.patch(app, { toLearn: value });
  }

  private async patch(app: Application, changes: Partial<Application>): Promise<void> {
    const previous = { ...app };
    this.applications.update((items) =>
      items.map((a) => (a.id === app.id ? { ...a, ...changes } : a)),
    );

    try {
      await this.api.patchApplication(app.id, changes);
    } catch {
      this.applications.update((items) =>
        items.map((a) => (a.id === app.id ? previous : a)),
      );
      this.snackBar.open('Failed to save change.', 'Dismiss', { duration: 4000 });
    }
  }
}
