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
import { HttpErrorResponse } from '@angular/common/http';
import { MatSnackBar } from '@angular/material/snack-bar';
import { MockInstance, vi } from 'vitest';
import { PipelineComponent } from './pipeline.component';
import { PipelineApi } from '../../core/api/pipeline.api';
import { clonePipelineSample } from '../../core/api/pipeline.mock';
import {
  BotCommand,
  PipelineSnapshot,
  PipelineSnapshotResult,
} from '../../core/api/pipeline.models';
import { AuthService } from '../../core/auth/auth.service';
import { User } from '../../core/auth/user.model';

describe('PipelineComponent', () => {
  let fixture: ComponentFixture<PipelineComponent>;
  let component: PipelineComponent;
  let api: PipelineApi;
  let queryParams$: BehaviorSubject<ParamMap>;
  let getSnapshot: MockInstance<PipelineApi['getSnapshot']>;

  async function setup(
    params: Record<string, string>,
    result: PipelineSnapshotResult = { snapshot: clonePipelineSample(), sample: false },
    owner = false,
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
    vi.spyOn(TestBed.inject(AuthService), 'currentUser').mockReturnValue(
      owner ? ({ id: 'u1', email: 'o@x', isOwner: true } as unknown as User) : null,
    );

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
    expect(now?.getAttribute('title')).toBe('2 of 5 rounds decided');
    expect(now?.getAttribute('aria-label')).toBe('refine: 2 of 5 rounds decided');
    expect(el.querySelector('app-run-card')?.textContent).toContain('verdict 85 → 90 (target 95)');
    expect(el.querySelector('[data-testid="last-event"]')?.textContent).toMatch(
      /^last: refine accepted · (09-22 )?13:59$/,
    );
    expect(el.querySelectorAll('app-run-card [data-state="done"]')).toHaveLength(8);
  });

  it('renders the footer with details lines, and nothing after the name when details is null', async () => {
    const el = await setup({});
    const rows = el.querySelectorAll('.events .event');
    expect(rows).toHaveLength(10);
    expect(rows[0].querySelector('.details')?.textContent).toBe('round 2 · honest · 90 (best 90)');
    expect(rows[3].querySelector('.details')).toBeNull();
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

  describe('owner control bar', () => {
    /** Nothing live: no active hunt, no in-flight command, no apply run. */
    function idle(): PipelineSnapshot {
      const snapshot = clonePipelineSample();
      if (snapshot.hunt.live) snapshot.hunt.live.active = null;
      if (snapshot.control) snapshot.control.commands = [];
      snapshot.apply.in_progress = { count: 0, cards: [] };
      return snapshot;
    }

    function cmd(id: string, status: string, error = ''): BotCommand {
      return {
        id,
        kind: 'hunt',
        payload: { sources: null },
        status,
        error,
        created_at: '2026-09-22T11:59:59+00:00',
        started_at: null,
        finished_at: null,
      };
    }

    function button(el: HTMLElement, id: string): HTMLButtonElement {
      const b = el.querySelector(`[data-testid="${id}"]`) as HTMLButtonElement | null;
      if (!b) throw new Error(`no button ${id}`);
      return b;
    }

    it('is hidden for a non-owner', async () => {
      const el = await setup({});
      expect(el.querySelector('[data-testid="control-bar"]')).toBeNull();
    });

    it('disables hunt + retry during the sample web hunt, keeps check expired enabled', async () => {
      const el = await setup({}, undefined, true);
      expect(button(el, 'hunt-all').disabled).toBe(true);
      expect(button(el, 'hunt-source').disabled).toBe(true);
      expect(button(el, 'retry-failed').disabled).toBe(true);
      expect(button(el, 'check-expired').disabled).toBe(false);
      expect(el.querySelector('.control-bar .why')?.textContent).toContain('A hunt is running');
      expect(el.querySelectorAll('.control-bar .commands li')).toHaveLength(3);
    });

    it('ignores the fake live hunt in the offline sample: buttons enabled, idle poll', async () => {
      const el = await setup({}, { snapshot: clonePipelineSample(), sample: true }, true);
      expect(button(el, 'hunt-all').disabled).toBe(false);
      expect(button(el, 'retry-failed').disabled).toBe(false);
      expect(button(el, 'check-expired').disabled).toBe(false);
      expect(component.pollMs()).toBe(15000);
    });

    it('drops a command lookup that a newer load has overtaken', async () => {
      await setup({}, { snapshot: idle(), sample: false }, true);
      vi.spyOn(api, 'postCommand').mockResolvedValue('cmd7');
      const get = vi.spyOn(api, 'getCommand').mockResolvedValue(cmd('cmd7', 'pending'));
      await component.send('check_expired');
      await settle();
      expect(component.tracked()?.status).toBe('pending');

      let resolveSlow: (c: ReturnType<typeof cmd>) => void = () => undefined;
      get.mockReset();
      get
        .mockReturnValueOnce(new Promise((r) => (resolveSlow = r)))
        .mockResolvedValue(cmd('cmd7', 'running'));
      const slow = component.load(1);
      // The slow load is parked inside getCommand before the newer one starts.
      await vi.waitFor(() => expect(get).toHaveBeenCalledTimes(1));
      await component.load(1);
      expect(component.tracked()?.status).toBe('running');
      resolveSlow(cmd('cmd7', 'pending'));
      await slow;
      expect(get).toHaveBeenCalledTimes(2);
      expect(component.tracked()?.status).toBe('running');
    });

    it('sends "hunt everywhere", shows the waiting line, then reports a rejection', async () => {
      const el = await setup({}, { snapshot: idle(), sample: false }, true);
      const post = vi.spyOn(api, 'postCommand').mockResolvedValue('cmd1');
      const open = vi.spyOn(TestBed.inject(MatSnackBar), 'open');

      const pending = idle();
      pending.control?.commands?.push(cmd('cmd1', 'pending'));
      getSnapshot.mockResolvedValueOnce({ snapshot: pending, sample: false });

      button(el, 'hunt-all').click();
      await settle();
      expect(post).toHaveBeenCalledWith('hunt', null);
      expect(el.querySelector('[data-testid="tracked-command"]')?.textContent).toContain(
        'Hunt everywhere: sent, waiting for the bot…',
      );
      expect(button(el, 'hunt-all').disabled).toBe(true);
      expect(component.pollMs()).toBe(3000);

      const rejected = idle();
      rejected.control?.commands?.push(cmd('cmd1', 'rejected', 'hunt already running'));
      getSnapshot.mockResolvedValueOnce({ snapshot: rejected, sample: false });
      await component.load(1);
      await settle();
      expect(open).toHaveBeenCalledWith(
        'Hunt everywhere: rejected by the bot — hunt already running',
        'Dismiss',
        expect.anything(),
      );
      expect(component.tracked()).toBeNull();
      expect(el.querySelector('[data-testid="tracked-command"]')).toBeNull();
      expect(button(el, 'hunt-all').disabled).toBe(false);
      expect(component.pollMs()).toBe(15000);
    });

    it('falls back to GET /commands/:id when the snapshot does not list the command', async () => {
      await setup({}, { snapshot: idle(), sample: false }, true);
      vi.spyOn(api, 'postCommand').mockResolvedValue('cmd9');
      const get = vi.spyOn(api, 'getCommand').mockResolvedValue(cmd('cmd9', 'running'));
      await component.send('check_expired');
      await settle();
      expect(get).toHaveBeenCalledWith('cmd9');
      expect(component.tracked()?.status).toBe('running');
    });

    it('hunts one source from the menu', async () => {
      const el = await setup({}, { snapshot: idle(), sample: false }, true);
      const post = vi.spyOn(api, 'postCommand').mockResolvedValue('cmd2');
      button(el, 'hunt-source').click();
      await settle();
      const item = document.querySelector('[data-source="linkedin"]') as HTMLButtonElement | null;
      expect(item).not.toBeNull();
      item?.click();
      await settle();
      expect(post).toHaveBeenCalledWith('hunt', ['linkedin']);
    });

    it('shows a clear message on 409 and keeps the buttons usable', async () => {
      const el = await setup({}, { snapshot: idle(), sample: false }, true);
      vi.spyOn(api, 'postCommand').mockRejectedValue(new HttpErrorResponse({ status: 409 }));
      const open = vi.spyOn(TestBed.inject(MatSnackBar), 'open');
      button(el, 'retry-failed').click();
      await settle();
      expect(open).toHaveBeenCalledWith(
        expect.stringContaining('Busy'),
        'Dismiss',
        expect.anything(),
      );
      expect(component.tracked()).toBeNull();
      expect(button(el, 'retry-failed').disabled).toBe(false);
    });
  });

  describe('live loaders and next run', () => {
    it('shows the hunt stepper with a spinner on fetch and its live numbers', async () => {
      const el = await setup({});
      const now = el.querySelector('app-hunt-stepper [data-state="now"]');
      expect(now?.getAttribute('data-step')).toBe('fetch');
      expect(now?.querySelector('[data-testid="hunt-step-spinner"]')).not.toBeNull();
      expect(now?.querySelector('[data-testid="hunt-step-detail"]')?.textContent).toBe(
        'linkedin · 3/25 · found 41',
      );
      expect(el.querySelectorAll('app-hunt-stepper [data-state="done"]')).toHaveLength(1);
      expect(el.querySelector('[data-testid="last-hunt"]')).toBeNull();
      expect(component.pollMs()).toBe(3000);
    });

    it('shows the last finished hunt when nothing is running', async () => {
      const snapshot = clonePipelineSample();
      if (snapshot.hunt.live) snapshot.hunt.live.active = null;
      const el = await setup({}, { snapshot, sample: false });
      expect(el.querySelector('app-hunt-stepper')).toBeNull();
      expect(el.querySelector('[data-testid="last-hunt"]')?.textContent).toContain(
        'Last hunt 13:22 · scheduled · pracuj · found 18',
      );
    });

    it('puts spinners on the busy stat cards and the current apply stage', async () => {
      const el = await setup({});
      expect(el.querySelectorAll('[data-testid="card-busy"]')).toHaveLength(2);
      expect(
        el.querySelector('app-run-card [data-state="now"] [data-testid="stage-spinner"]'),
      ).not.toBeNull();
    });

    it('shows the next hunt and retry in the header, measured on the server clock', async () => {
      const el = await setup({});
      const line = el.querySelector('[data-testid="next-run"]')?.textContent ?? '';
      expect(line).toMatch(/Next hunt 14:40 · justjoin \(in 40 min\)/);
      expect(line).toContain('Next retry 09-23 02:45');
      expect(el.querySelector('[data-testid="bot-offline"]')).toBeNull();
    });

    it('says "bot offline" when the scheduler facts are missing', async () => {
      const snapshot = clonePipelineSample();
      snapshot.hunt.next = null;
      const el = await setup({}, { snapshot, sample: false });
      expect(el.querySelector('[data-testid="bot-offline"]')?.textContent).toBe('bot offline');
    });
  });
});
