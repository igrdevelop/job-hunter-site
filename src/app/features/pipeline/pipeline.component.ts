import {
  ChangeDetectionStrategy,
  Component,
  DOCUMENT,
  DestroyRef,
  computed,
  effect,
  inject,
  signal,
  untracked,
} from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { ActivatedRoute, Router } from '@angular/router';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { PipelineApi } from '../../core/api/pipeline.api';
import { PipelineDays, PipelineSnapshot } from '../../core/api/pipeline.models';
import { StatCardComponent } from './stat-card/stat-card.component';
import { RunCardComponent } from './run-card/run-card.component';
import {
  UNMEASURED_TEXT,
  applyCards,
  eventRows,
  formatMinutes,
  huntCards,
  resultCards,
} from './pipeline.view';

/** Poll cadence while the tab is visible (docs/PIPELINE_VIZ_PLAN.md: 10–15 s). */
export const PIPELINE_POLL_MS = 15_000;

const DAY_OPTIONS: { days: PipelineDays; label: string }[] = [
  { days: 1, label: 'Today' },
  { days: 7, label: '7 days' },
];

/**
 * /pipeline — read-only view of the bot's vacancy pipeline (bot repo
 * docs/PIPELINE_VIZ_PLAN.md M3): Hunt → Apply → Result tiers built from
 * GET /api/pipeline/snapshot. Nothing here changes how the pipeline runs.
 */
@Component({
  selector: 'app-pipeline',
  imports: [MatProgressSpinnerModule, StatCardComponent, RunCardComponent],
  templateUrl: './pipeline.component.html',
  styleUrl: './pipeline.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class PipelineComponent {
  private readonly api = inject(PipelineApi);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly document = inject(DOCUMENT);

  private readonly queryParams = toSignal(this.route.queryParamMap, { requireSync: true });

  /** Window, driven by ?days= (1 = today, the default; 7 = last 7 days). */
  readonly days = computed<PipelineDays>(() => (this.queryParams().get('days') === '7' ? 7 : 1));
  readonly dayOptions = DAY_OPTIONS;

  /** Last GOOD snapshot — a failed poll never clears it. */
  readonly snapshot = signal<PipelineSnapshot | null>(null);
  readonly sample = signal(false);
  readonly refreshError = signal<string | null>(null);
  private readonly loadedDays = signal<PipelineDays | null>(null);
  private readonly lastUpdatedAt = signal<number | null>(null);
  private readonly now = signal(Date.now());

  private loadSeq = 0;
  private inFlight = false;

  readonly unmeasuredText = UNMEASURED_TEXT;
  readonly huntCards = computed(() => mapOrEmpty(this.snapshot(), huntCards));
  readonly applyCards = computed(() => mapOrEmpty(this.snapshot(), applyCards));
  readonly resultCards = computed(() => mapOrEmpty(this.snapshot(), resultCards));
  readonly runCards = computed(() => this.snapshot()?.apply.in_progress.cards ?? []);
  readonly events = computed(() => {
    const events = this.snapshot()?.events;
    return events ? eventRows(events, new Date(this.now())) : null;
  });

  /** The toggle moved but the matching snapshot has not arrived yet. */
  readonly switching = computed(() => {
    const loaded = this.loadedDays();
    return loaded !== null && loaded !== this.days();
  });

  readonly llm = computed(() => {
    const outage = this.snapshot()?.apply.llm_outage;
    if (!outage) return null;
    return outage.paused
      ? { ok: false, text: `LLM paused · ${formatMinutes(outage.remaining_min)} left` }
      : { ok: true, text: 'LLM OK' };
  });

  readonly updatedText = computed(() => {
    const at = this.lastUpdatedAt();
    if (at === null) return null;
    const sec = Math.max(0, Math.floor((this.now() - at) / 1000));
    return sec < 120 ? `updated ${sec} s ago` : `updated ${Math.floor(sec / 60)} min ago`;
  });

  constructor() {
    // Initial load + reload whenever ?days= changes.
    effect(() => {
      const days = this.days();
      untracked(() => void this.load(days));
    });

    const tick = setInterval(() => this.now.set(Date.now()), 1000);
    const poll = setInterval(() => {
      if (!this.document.hidden && !this.inFlight) void this.load(untracked(this.days));
    }, PIPELINE_POLL_MS);
    // Coming back to the tab refreshes at once instead of waiting up to 15 s.
    const onVisibility = () => {
      if (!this.document.hidden && !this.inFlight) void this.load(untracked(this.days));
    };
    this.document.addEventListener('visibilitychange', onVisibility);

    inject(DestroyRef).onDestroy(() => {
      clearInterval(tick);
      clearInterval(poll);
      this.document.removeEventListener('visibilitychange', onVisibility);
    });
  }

  onDaysChange(days: PipelineDays): void {
    if (days === this.days()) return;
    void this.router.navigate([], {
      relativeTo: this.route,
      queryParams: { days: days === 1 ? null : days },
      queryParamsHandling: 'merge',
    });
  }

  /** Fetches one snapshot; a response for a superseded request is dropped. */
  async load(days: PipelineDays): Promise<void> {
    const seq = ++this.loadSeq;
    this.inFlight = true;
    try {
      const result = await this.api.getSnapshot(days);
      if (seq !== this.loadSeq) return;
      this.snapshot.set(result.snapshot);
      this.sample.set(result.sample);
      this.loadedDays.set(days);
      this.lastUpdatedAt.set(Date.now());
      this.now.set(Date.now());
      this.refreshError.set(null);
    } catch {
      if (seq !== this.loadSeq) return;
      this.refreshError.set(
        this.snapshot()
          ? 'Refresh failed — showing the last snapshot.'
          : 'Could not load the pipeline. Is the API reachable?',
      );
    } finally {
      if (seq === this.loadSeq) this.inFlight = false;
    }
  }
}

function mapOrEmpty<T>(s: PipelineSnapshot | null, fn: (s: PipelineSnapshot) => T[]): T[] {
  return s ? fn(s) : [];
}
