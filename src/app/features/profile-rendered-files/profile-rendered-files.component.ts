import { ChangeDetectionStrategy, Component, computed, effect, inject, resource, signal } from '@angular/core';
import { DatePipe } from '@angular/common';
import { HttpErrorResponse } from '@angular/common/http';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatSnackBar } from '@angular/material/snack-bar';
import { ProfileApi } from '../../core/api/profile.api';
import { ProfileRenderedFile } from '../../core/api/models';
import { safeResourceValue } from '../../core/utils/resource-value';

/**
 * Semantic ordering for the rendered-files list (docs/PROFILE_PAGE_TABS.md
 * UI feedback amendments 2026-08-31): candidate.yaml (the structured facts)
 * reads first, then the free-text career narrative, then every per-track
 * base CV as one group, then the optional local generation-notes tail.
 * Anything unrecognized sorts after all of those, alphabetically.
 */
function renderedFileRank(name: string): number {
  if (name === 'candidate.yaml') return 0;
  if (name === 'candidate_profile.md') return 1;
  if (name.startsWith('base_cv_')) return 2;
  if (name === 'generation_rules.local.md') return 3;
  return 4;
}

/**
 * docs/PROFILE_PAGE_TABS.md tab 3 (Rendered files) — a purpose-built,
 * READ-ONLY view of the whitelisted files the profile renders into
 * (candidate.yaml, base_cv_<track>.md, …). STRICTLY read-only: this
 * component never calls a mutating `ProfileApi` method — the one-way
 * DB → files rule means there is no edit affordance here, ever, unlike the
 * general candidate-file browser still served at `/profile/files`.
 */
@Component({
  selector: 'app-profile-rendered-files',
  imports: [DatePipe, MatButtonModule, MatIconModule, MatProgressSpinnerModule],
  templateUrl: './profile-rendered-files.component.html',
  styleUrl: './profile-rendered-files.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ProfileRenderedFilesComponent {
  private readonly api = inject(ProfileApi);
  private readonly snackBar = inject(MatSnackBar);

  private readonly filesResource = resource({
    loader: () => this.api.listRenderedFiles(),
  });
  private readonly profileResource = resource({
    loader: () => this.api.get(),
  });

  readonly loading = computed(() => this.filesResource.isLoading() || this.profileResource.isLoading());

  /**
   * Order the list by meaning, not alphabet — candidate.yaml (identity/facts)
   * first, then the career narrative, then every per-track base CV
   * (alphabetical within that group), then the optional local generation
   * notes tail. `profile.json` is filtered out entirely (docs/
   * PROFILE_PAGE_TABS.md UI feedback amendments 2026-08-31): nothing
   * consumes it yet — it's internal groundwork for a future direct-structure
   * consumer, not something a user should see in a "your files" list. The
   * API may still serve it; this is a display-only filter/sort, not a
   * whitelist change.
   */
  readonly files = computed<ProfileRenderedFile[]>(() => {
    const all = safeResourceValue(this.filesResource) ?? [];
    return all
      .filter((f) => f.name !== 'profile.json')
      .slice()
      .sort((a, b) => renderedFileRank(a.name) - renderedFileRank(b.name) || a.name.localeCompare(b.name));
  });

  /** `GET /api/profile/files` is api T2 — not deployed yet. A 404 is "not live", not a real error. */
  readonly unavailable = computed(() => {
    const err = this.filesResource.error();
    return err instanceof HttpErrorResponse && err.status === 404;
  });

  readonly errorMessage = computed(() => {
    const err = this.filesResource.error();
    if (!err || this.unavailable()) return null;
    return 'Could not load rendered files. Is the API reachable?';
  });

  /** Never-rendered user: the listing loaded fine, it's just empty. */
  readonly showEmptyState = computed(
    () => this.filesResource.hasValue() && !this.unavailable() && !this.errorMessage() && this.files().length === 0,
  );

  /**
   * "Profile changed since last publish" — derived from `lastRenderJob` vs
   * the profile's own `updatedAt`, only when BOTH are available (per the
   * work order). `lastRenderJob` is also api T2 — absent today, so this
   * never renders until that ships; that is the correct degraded behavior,
   * not a bug.
   */
  readonly stale = computed(() => {
    const profile = safeResourceValue(this.profileResource);
    const lastRenderJob = profile?.lastRenderJob;
    if (!profile || !lastRenderJob) return false;
    return new Date(profile.updatedAt).getTime() > new Date(lastRenderJob.updatedAt).getTime();
  });

  readonly selectedFile = signal<ProfileRenderedFile | null>(null);
  readonly selectedContent = signal<string | null>(null);
  readonly viewerError = signal<string | null>(null);
  readonly viewerLoading = signal(false);

  constructor() {
    effect(() => {
      if (this.unavailable()) {
        console.warn(
          '[ProfileRenderedFilesComponent] GET /api/profile/files returned 404 — rendered files are not available yet.',
        );
      }
    });
  }

  async viewFile(file: ProfileRenderedFile): Promise<void> {
    this.selectedFile.set(file);
    this.selectedContent.set(null);
    this.viewerError.set(null);
    this.viewerLoading.set(true);
    try {
      const content = await this.api.getRenderedFileContent(file.name);
      this.selectedContent.set(content);
    } catch {
      this.viewerError.set(`Could not load ${file.name}.`);
    } finally {
      this.viewerLoading.set(false);
    }
  }

  closeViewer(): void {
    this.selectedFile.set(null);
    this.selectedContent.set(null);
    this.viewerError.set(null);
  }

  async copyContent(): Promise<void> {
    const content = this.selectedContent();
    if (!content) return;
    try {
      await navigator.clipboard.writeText(content);
      this.snackBar.open('Copied to clipboard.', undefined, { duration: 2000 });
    } catch {
      this.snackBar.open('Could not copy — select the text manually.', 'Dismiss', { duration: 4000 });
    }
  }
}
