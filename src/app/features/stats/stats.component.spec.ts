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
import { StatsComponent } from './stats.component';
import { AnalyticsApi } from '../../core/api/analytics.api';

const FUNNEL = { tracked: 10, generated: 8, sent: 5, confirmed: 2, answered: 1 };
const COSTS = { totalCostUsd: 4.2, averageCostUsd: 0.42, applicationsWithCost: 10 };

describe('StatsComponent — URL-driven period', () => {
  let fixture: ComponentFixture<StatsComponent>;
  let component: StatsComponent;
  let api: AnalyticsApi;
  let queryParams$: BehaviorSubject<ParamMap>;
  let routeStub: Partial<ActivatedRoute>;

  async function setup(initialParams: Record<string, string>): Promise<void> {
    queryParams$ = new BehaviorSubject(convertToParamMap(initialParams));
    routeStub = { queryParamMap: queryParams$.asObservable() };

    await TestBed.configureTestingModule({
      imports: [StatsComponent],
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        provideRouter([]),
        provideAnimationsAsync(),
        { provide: ActivatedRoute, useValue: routeStub },
      ],
    }).compileComponents();

    api = TestBed.inject(AnalyticsApi);
    vi.spyOn(api, 'getFunnel').mockResolvedValue(FUNNEL);
    vi.spyOn(api, 'getSourceStats').mockResolvedValue([]);
    vi.spyOn(api, 'getCostSummary').mockResolvedValue(COSTS);

    fixture = TestBed.createComponent(StatsComponent);
    component = fixture.componentInstance;
    await fixture.whenStable();
    fixture.detectChanges();
  }

  afterEach(() => vi.restoreAllMocks());

  it('defaults to the 30d period without a query param', async () => {
    await setup({});
    expect(component.period()).toBe('30d');
    expect(api.getFunnel).toHaveBeenCalledWith(30);
  });

  it('initializes the period from ?period=', async () => {
    await setup({ period: '7d' });
    expect(component.period()).toBe('7d');
    expect(api.getFunnel).toHaveBeenCalledWith(7);
  });

  it('falls back to 30d on an unknown ?period= value', async () => {
    await setup({ period: 'forever' });
    expect(component.period()).toBe('30d');
  });

  it('follows query-param changes (browser back/forward)', async () => {
    await setup({});
    queryParams$.next(convertToParamMap({ period: 'all' }));
    expect(component.period()).toBe('all');
  });

  it('onPeriodChange() writes the period into the query params', async () => {
    await setup({});
    const navigate = vi.spyOn(TestBed.inject(Router), 'navigate').mockResolvedValue(true);
    component.onPeriodChange('90d');
    expect(navigate).toHaveBeenCalledWith([], {
      relativeTo: routeStub,
      queryParams: { period: '90d' },
      queryParamsHandling: 'merge',
    });
  });

  it('onPeriodChange("30d") clears the period query param', async () => {
    await setup({ period: '7d' });
    const navigate = vi.spyOn(TestBed.inject(Router), 'navigate').mockResolvedValue(true);
    component.onPeriodChange('30d');
    expect(navigate).toHaveBeenCalledWith([], {
      relativeTo: routeStub,
      queryParams: { period: null },
      queryParamsHandling: 'merge',
    });
  });
});
