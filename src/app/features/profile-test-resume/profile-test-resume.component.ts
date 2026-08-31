import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  computed,
  inject,
  resource,
  signal,
} from '@angular/core';
import { HttpErrorResponse } from '@angular/common/http';
import { MatButtonModule } from '@angular/material/button';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatSnackBar } from '@angular/material/snack-bar';
import { ProfileApi } from '../../core/api/profile.api';
import { ProfilePreviewListItem } from '../../core/api/models';
import { AuthService } from '../../core/auth/auth.service';
import { safeResourceValue } from '../../core/utils/resource-value';

/** Exported so specs can drive polling with `vi.useFakeTimers()` without magic numbers. */
export const PROFILE_PREVIEW_POLL_INTERVAL_MS = 5000;
/** After this long still pending/running, the copy adds "this can take a while" — never an error. */
export const PROFILE_PREVIEW_SLOW_AFTER_MS = 120000;

type PreviewState = 'idle' | 'generating' | 'polling' | 'done' | 'error';

/**
 * docs/PROFILE_PAGE_TABS.md tab 4 (Test resume) — owner-only (gated by the
 * tab shell, not re-checked here). "What will the system actually produce
 * from my profile": generate a no-vacancy preview CV per track and browse
 * past previews. Until the bot's `preview` job drain ships, a queued job
 * just sits `pending` forever — the poll UI must stay calm, never show an
 * error for that, and only hint "this can take a while" after a while.
 */
@Component({
  selector: 'app-profile-test-resume',
  imports: [MatButtonModule, MatProgressSpinnerModule],
  templateUrl: './profile-test-resume.component.html',
  styleUrl: './profile-test-resume.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ProfileTestResumeComponent {
  private readonly api = inject(ProfileApi);
  private readonly authService = inject(AuthService);
  private readonly snackBar = inject(MatSnackBar);
  private readonly destroyRef = inject(DestroyRef);

  private readonly profileResource = resource({
    loader: () => this.api.get(),
  });
  private readonly historyResource = resource({
    loader: () => this.api.listPreviews(),
  });

  readonly historyLoading = this.historyResource.isLoading;
  readonly history = computed<ProfilePreviewListItem[]>(() => safeResourceValue(this.historyResource) ?? []);
  readonly historyUnavailable = computed(() => {
    const err = this.historyResource.error();
    return err instanceof HttpErrorResponse && err.status === 404;
  });

  /** Track chips = 'core' + the profile's variant keys; just 'core' when there are none. */
  readonly tracks = computed(() => {
    const variants = safeResourceValue(this.profileResource)?.profile.variants ?? {};
    return ['core', ...Object.keys(variants)];
  });

  readonly selectedTrack = signal<string>('core');

  selectTrack(track: string): void {
    this.selectedTrack.set(track);
  }

  /** Display label for a track chip — the API value stays 'core', only the
   * shown text changes (docs/PROFILE_PAGE_TABS.md UI feedback amendments
   * 2026-08-31: "core" read as a jargon-y leftover to the owner). */
  trackLabel(track: string): string {
    return track === 'core' ? 'Universal (full profile)' : track;
  }

  readonly state = signal<PreviewState>('idle');
  readonly errorMessage = signal<string | null>(null);
  /** 409 — no stored profile yet: the empty state replaces the generate control entirely. */
  readonly needsPublish = signal(false);
  /** 429 — throttled (10/hour/user): a calm retry-later message, not a hard error. */
  readonly throttled = signal(false);

  private jobId: string | null = null;
  private readonly pollStartedAt = signal<number | null>(null);
  /** Bumped on every poll tick so `isSlow` re-evaluates `Date.now()` reactively. */
  private readonly pollTick = signal(0);
  private pollTimer: ReturnType<typeof setTimeout> | null = null;

  readonly isSlow = computed(() => {
    this.pollTick();
    const started = this.pollStartedAt();
    if (!started) return false;
    return Date.now() - started >= PROFILE_PREVIEW_SLOW_AFTER_MS;
  });

  constructor() {
    this.destroyRef.onDestroy(() => this.clearPollTimer());
  }

  async generatePreview(): Promise<void> {
    if (this.state() === 'generating' || this.state() === 'polling') return;
    this.errorMessage.set(null);
    this.needsPublish.set(false);
    this.throttled.set(false);
    this.state.set('generating');
    try {
      const { jobId } = await this.api.requestPreview(this.selectedTrack());
      this.jobId = jobId;
      this.pollStartedAt.set(Date.now());
      this.pollTick.set(0);
      this.state.set('polling');
      this.schedulePoll();
    } catch (err) {
      this.state.set('idle');
      if (err instanceof HttpErrorResponse && err.status === 409) {
        this.needsPublish.set(true);
      } else if (err instanceof HttpErrorResponse && err.status === 429) {
        this.throttled.set(true);
      } else {
        this.errorMessage.set('Could not start the preview. Please try again.');
      }
    }
  }

  private schedulePoll(): void {
    this.clearPollTimer();
    this.pollTimer = setTimeout(() => void this.pollOnce(), PROFILE_PREVIEW_POLL_INTERVAL_MS);
  }

  private clearPollTimer(): void {
    if (this.pollTimer !== null) {
      clearTimeout(this.pollTimer);
      this.pollTimer = null;
    }
  }

  private async pollOnce(): Promise<void> {
    const jobId = this.jobId;
    if (!jobId) return;
    this.pollTick.update((n) => n + 1);
    try {
      const job = await this.api.getJob(jobId);
      if (job.status === 'done') {
        this.finishPolling();
        this.state.set('done');
        this.historyResource.reload();
        this.snackBar.open('Preview ready — see it in the history below.', undefined, { duration: 3000 });
        return;
      }
      if (job.status === 'error') {
        this.finishPolling();
        this.state.set('error');
        this.errorMessage.set(job.error || 'Preview generation failed.');
        return;
      }
      // 'pending' or 'running' — never an error here, the bot's drain may not
      // be live yet; just keep a calm poll going.
      this.schedulePoll();
    } catch {
      // A transient poll-request failure shouldn't kill an otherwise-queued
      // job — keep trying rather than surfacing an error for it.
      this.schedulePoll();
    }
  }

  private finishPolling(): void {
    this.jobId = null;
    this.pollStartedAt.set(null);
    this.clearPollTimer();
  }

  async downloadPreviewFile(track: string, timestamp: string, file: string): Promise<void> {
    try {
      const token = await this.authService.getDownloadToken();
      const url = `${this.api.getPreviewFileUrl(track, timestamp, file)}?dt=${encodeURIComponent(token)}`;
      window.open(url, '_blank', 'noopener');
    } catch {
      this.snackBar.open('Could not open the file.', 'Dismiss', { duration: 4000 });
    }
  }
}
