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
import { BehaviorSubject } from 'rxjs';
import { vi } from 'vitest';
import { ApplicationsComponent } from './applications.component';
import { ApplicationsApi } from '../../core/api/applications.api';

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
});
