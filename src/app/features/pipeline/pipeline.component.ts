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
import { MatButtonModule } from '@angular/material/button';
import { MatMenuModule } from '@angular/material/menu';
import { MatTooltipModule } from '@angular/material/tooltip';
import { MatSnackBar } from '@angular/material/snack-bar';
import { PipelineApi } from '../../core/api/pipeline.api';
import { BotCommandKind, PipelineDays, PipelineSnapshot } from '../../core/api/pipeline.models';
import { AuthService } from '../../core/auth/auth.service';
import { StatCardComponent } from './stat-card/stat-card.component';
import { RunCardComponent } from './run-card/run-card.component';
import { HuntStepperComponent } from './hunt-stepper/hunt-stepper.component';
import { lastHuntSummary, nextRunView } from './hunt-stepper';
import {
  TrackedCommand,
  commandErrorMessage,
  commandLabel,
  commandRows,
  controlDisabled,
  findCommand,
  isInFlight,
  isTerminal,
  mergeTracked,
  pollIntervalMs,
  terminalMessage,
} from './pipeline-control';
import {
  UNMEASURED_TEXT,
  applyCards,
  eventRows,
  formatMinutes,
  huntCards,
  resultCards,
} from './pipeline.view';

export { PIPELINE_FAST_POLL_MS, PIPELINE_POLL_MS } from './pipeline-control';

const DAY_OPTIONS: { days: PipelineDays; label: string }[] = [
  { days: 1, label: 'Today' },
  { days: 7, label: '7 days' },
];

/**
 * /pipeline — view of the bot's vacancy pipeline (bot repo
 * docs/PIPELINE_VIZ_PLAN.md M3): Hunt → Apply → Result tiers built from
 * GET /api/pipeline/snapshot, plus an owner-only control bar that asks the bot
 * to hunt / retry failed / check expired (POST /api/pipeline/commands — the bot
 * drains its `bot_commands` table; the page never runs anything itself).
 */
@Component({
  selector: 'app-pipeline',
  imports: [
    MatProgressSpinnerModule,
    MatButtonModule,
    MatMenuModule,
    MatTooltipModule,
    StatCardComponent,
    RunCardComponent,
    HuntStepperComponent,
  ],
  templateUrl: './pipeline.component.html',
  styleUrl: './pipeline.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class PipelineComponent {
  private readonly api = inject(PipelineApi);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly document = inject(DOCUMENT);
  private readonly auth = inject(AuthService);
  private readonly snackBar = inject(MatSnackBar);

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
  /** When the last load started (success or not) — the adaptive poll counts from here. */
  private lastAttemptAt = 0;

  /** A command this page sent and still follows; cleared at a terminal status. */
  readonly tracked = signal<TrackedCommand | null>(null);
  /** A POST is on its way. */
  readonly posting = signal(false);

  readonly isOwner = this.auth.isOwner;

  readonly unmeasuredText = UNMEASURED_TEXT;
  readonly huntCards = computed(() => mapOrEmpty(this.snapshot(), huntCards));
  readonly applyCards = computed(() => mapOrEmpty(this.snapshot(), applyCards));
  readonly resultCards = computed(() => mapOrEmpty(this.snapshot(), resultCards));
  readonly runCards = computed(() => this.snapshot()?.apply.in_progress.cards ?? []);
  readonly events = computed(() => {
    const events = this.snapshot()?.events;
    return events ? eventRows(events, new Date(this.now())) : null;
  });

  /**
   * The server clock, estimated: the snapshot's `generated_at` plus the time
   * since it arrived. Live durations and the "bot offline" rule are measured
   * against it, so a skewed browser clock never shows a negative elapsed time.
   */
  readonly serverNow = computed(() => {
    const generated = Date.parse(this.snapshot()?.generated_at ?? '');
    const received = this.lastUpdatedAt();
    const now = this.now();
    return new Date(
      Number.isNaN(generated) || received === null ? now : generated + (now - received),
    );
  });

  readonly liveHunt = computed(() => this.snapshot()?.hunt.live?.active ?? null);
  readonly lastHuntText = computed(() => {
    const last = this.snapshot()?.hunt.live?.last ?? null;
    return last ? lastHuntSummary(last, this.serverNow()) : null;
  });
  /** `null` until a snapshot arrived — the header says nothing rather than "offline". */
  readonly nextRun = computed(() => {
    const s = this.snapshot();
    return s ? nextRunView(s.hunt.next ?? null, this.serverNow()) : null;
  });

  readonly control = computed(() => this.snapshot()?.control ?? null);
  readonly sources = computed(() => this.control()?.sources ?? []);
  readonly disabled = computed(() =>
    controlDisabled(this.snapshot(), this.tracked(), this.posting()),
  );
  readonly commandRows = computed(() =>
    commandRows(this.control()?.commands ?? null, this.serverNow()),
  );
  /** "Hunt linkedin: sent, waiting for the bot…" / "…: running…" for the tracked command. */
  readonly trackedText = computed(() => {
    const t = this.tracked();
    if (!t || !isInFlight(t.status)) return null;
    const label = commandLabel(t.kind, t.sources);
    return t.status === 'pending' ? `${label}: sent, waiting for the bot…` : `${label}: running…`;
  });

  readonly pollMs = computed(() => pollIntervalMs(this.snapshot(), this.tracked()));

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

    // One 1 s tick drives both the clock and the adaptive poll: 3 s while
    // something is live (a hunt, an apply run, a command in flight), else 15 s.
    const tick = setInterval(() => {
      this.now.set(Date.now());
      const due = Date.now() - this.lastAttemptAt >= untracked(this.pollMs);
      if (due && !this.document.hidden && !this.inFlight) void this.load(untracked(this.days));
    }, 1000);
    // Coming back to the tab refreshes at once instead of waiting for the next poll.
    const onVisibility = () => {
      if (!this.document.hidden && !this.inFlight) void this.load(untracked(this.days));
    };
    this.document.addEventListener('visibilitychange', onVisibility);

    inject(DestroyRef).onDestroy(() => {
      clearInterval(tick);
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

  /**
   * Owner control: asks the bot to run one command. The page only POSTs; the
   * bot claims the `bot_commands` row within ~3 s and the snapshot shows it.
   */
  async send(kind: BotCommandKind, sources?: string[] | null): Promise<void> {
    if (this.posting()) return;
    this.posting.set(true);
    try {
      const id = await this.api.postCommand(kind, sources);
      this.tracked.set({ id, kind, sources: sources ?? null, status: 'pending', error: '' });
      void this.load(untracked(this.days));
    } catch (err) {
      this.snackBar.open(commandErrorMessage(err), 'Dismiss', { duration: 6000 });
    } finally {
      this.posting.set(false);
    }
  }

  /** Fetches one snapshot; a response for a superseded request is dropped. */
  async load(days: PipelineDays): Promise<void> {
    const seq = ++this.loadSeq;
    this.inFlight = true;
    this.lastAttemptAt = Date.now();
    try {
      const result = await this.api.getSnapshot(days);
      if (seq !== this.loadSeq) return;
      this.snapshot.set(result.snapshot);
      this.sample.set(result.sample);
      this.loadedDays.set(days);
      this.lastUpdatedAt.set(Date.now());
      this.now.set(Date.now());
      this.refreshError.set(null);
      await this.followTracked(result.snapshot);
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

  /**
   * Advances the tracked command from the snapshot's `control.commands`, or —
   * when it is not among them (an older API, or pushed out of the 10 newest) —
   * from GET /pipeline/commands/:id. A failed lookup keeps the current status;
   * the next poll tries again. Terminal: one snackbar, then stop following.
   */
  private async followTracked(snapshot: PipelineSnapshot): Promise<void> {
    const t = this.tracked();
    if (!t || isTerminal(t.status)) return;
    let row = findCommand(snapshot, t.id);
    if (!row) {
      try {
        row = await this.api.getCommand(t.id);
      } catch {
        return;
      }
    }
    // A newer send may have replaced the tracked command while we waited.
    if (this.tracked()?.id !== t.id) return;
    const next = mergeTracked(t, row);
    if (!isTerminal(next.status)) {
      this.tracked.set(next);
      return;
    }
    this.tracked.set(null);
    const message = terminalMessage(next);
    if (message) this.snackBar.open(message, 'Dismiss', { duration: 8000 });
  }
}

function mapOrEmpty<T>(s: PipelineSnapshot | null, fn: (s: PipelineSnapshot) => T[]): T[] {
  return s ? fn(s) : [];
}
