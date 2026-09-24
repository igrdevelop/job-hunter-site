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
import { BehaviorSubject } from 'rxjs';
import { MockInstance, vi } from 'vitest';
import { PipelineComponent } from './pipeline.component';
import { PipelineApi } from '../../core/api/pipeline.api';
import { clonePipelineSample } from '../../core/api/pipeline.mock';
import { PipelineSnapshotResult } from '../../core/api/pipeline.models';

describe('PipelineComponent', () => {
  let fixture: ComponentFixture<PipelineComponent>;
  let component: PipelineComponent;
  let api: PipelineApi;
  let queryParams$: BehaviorSubject<ParamMap>;
  let getSnapshot: MockInstance<PipelineApi['getSnapshot']>;

  async function setup(
    params: Record<string, string>,
    result: PipelineSnapshotResult = { snapshot: clonePipelineSample(), sample: false },
  ): Promise<HTMLElement> {
    queryParams$ = new BehaviorSubject(convertToParamMap(params));
    await TestBed.configureTestingModule({
      imports: [PipelineComponent],
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        provideRouter([]),
        { provide: ActivatedRoute, useValue: { queryParamMap: queryParams$.asObservable() } },
      ],
    }).compileComponents();

    api = TestBed.inject(PipelineApi);
    getSnapshot = vi.spyOn(api, 'getSnapshot').mockResolvedValue(result);

    fixture = TestBed.createComponent(PipelineComponent);
    component = fixture.componentInstance;
    await settle();
    return fixture.nativeElement as HTMLElement;
  }

  async function settle(): Promise<void> {
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
  }

  afterEach(() => vi.restoreAllMocks());

  it('loads the 1-day window by default', async () => {
    const el = await setup({});
    expect(component.days()).toBe(1);
    expect(getSnapshot).toHaveBeenCalledWith(1);
    expect(el.querySelector('h1')?.textContent).toContain('Pipeline');
    expect(el.textContent).toContain('Found');
    expect(el.querySelector('[data-testid="sample-banner"]')).toBeNull();
  });

  it('initialises the window from ?days=7 and follows query-param changes', async () => {
    await setup({ days: '7' });
    expect(component.days()).toBe(7);
    expect(getSnapshot).toHaveBeenLastCalledWith(7);

    queryParams$.next(convertToParamMap({}));
    await settle();
    expect(getSnapshot).toHaveBeenLastCalledWith(1);
  });

  it('writes the toggle into ?days= (and drops it for the default)', async () => {
    const el = await setup({});
    const navigate = vi.spyOn(TestBed.inject(Router), 'navigate').mockResolvedValue(true);

    (el.querySelector('[data-days="7"]') as HTMLButtonElement).click();
    expect(navigate).toHaveBeenLastCalledWith(
      [],
      expect.objectContaining({ queryParams: { days: 7 }, queryParamsHandling: 'merge' }),
    );

    queryParams$.next(convertToParamMap({ days: '7' }));
    await settle();
    (el.querySelector('[data-days="1"]') as HTMLButtonElement).click();
    expect(navigate).toHaveBeenLastCalledWith(
      [],
      expect.objectContaining({ queryParams: { days: null } }),
    );
  });

  it('shows the sample banner when the API served the mock fallback', async () => {
    const el = await setup({}, { snapshot: clonePipelineSample(), sample: true });
    expect(el.querySelector('[data-testid="sample-banner"]')?.textContent).toContain(
      'Sample data — API not deployed yet',
    );
  });

  it('renders null blocks as "Not measured yet" instead of zeros', async () => {
    const snapshot = clonePipelineSample();
    snapshot.hunt.hunt_runs = null;
    snapshot.hunt.hunt_runs_unmeasured = 'hunt_runs table missing';
    snapshot.hunt.source_runs = null;
    snapshot.hunt.postings_seen = null;
    snapshot.apply.runs = null;
    snapshot.events = null;
    const el = await setup({}, { snapshot, sample: false });

    expect(el.querySelectorAll('[data-testid="unmeasured"]')).toHaveLength(5);
    expect(el.querySelector('[data-testid="events-unmeasured"]')).not.toBeNull();
  });

  it('shows the LLM pause pill and the running card with its stage strip', async () => {
    const el = await setup({});
    expect(el.querySelector('[data-testid="llm-pill"]')?.textContent).toContain(
      'LLM paused · 30 min left',
    );
    const now = el.querySelector('app-run-card [data-state="now"]');
    expect(now?.textContent?.trim()).toBe('refine 2/5');
    expect(el.querySelectorAll('app-run-card [data-state="done"]')).toHaveLength(8);
  });

  it('says nothing is generating when there is no in-progress card', async () => {
    const snapshot = clonePipelineSample();
    snapshot.apply.in_progress = { count: 0, cards: [] };
    snapshot.apply.llm_outage = { paused: false, remaining_min: 0 };
    const el = await setup({}, { snapshot, sample: false });
    expect(el.textContent).toContain('Nothing is being generated right now');
    expect(el.querySelector('[data-testid="llm-pill"]')?.textContent).toContain('LLM OK');
  });

  it('keeps the last good snapshot and shows an inline error when a refresh fails', async () => {
    const el = await setup({});
    getSnapshot.mockRejectedValueOnce(new Error('offline'));
    await component.load(1);
    await settle();
    expect(component.snapshot()).not.toBeNull();
    expect(el.querySelector('[role="alert"]')?.textContent).toContain('showing the last snapshot');
    expect(el.textContent).toContain('Found');
  });
});
