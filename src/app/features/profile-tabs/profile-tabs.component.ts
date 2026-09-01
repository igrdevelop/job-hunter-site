import {
  ChangeDetectionStrategy,
  Component,
  InjectionToken,
  computed,
  inject,
} from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { ActivatedRoute, Router } from '@angular/router';
import { AuthService } from '../../core/auth/auth.service';
import { ProfileEditorComponent } from '../profile-editor/profile-editor.component';
import { ProfileUploadsComponent } from '../profile-uploads/profile-uploads.component';
import { ProfileRenderedFilesComponent } from '../profile-rendered-files/profile-rendered-files.component';
import { ProfileTestResumeComponent } from '../profile-test-resume/profile-test-resume.component';

/**
 * Site-side feature flag for tab 3 (Rendered files). Owner decision
 * 2026-09-01 (live-site review) SWAPPED the tab gating: Test Resume is
 * useful to every user ("what CV would the system build for me") and is now
 * ungated, while Rendered Files exposes internal pipeline formats
 * (candidate.yaml, base CVs) and is now the owner-only tab — so this flag
 * now works IN ADDITION to `isOwner` (both must pass). Kept as an
 * InjectionToken so tests can flip it per-render, as before.
 */
export const PROFILE_FILES_TAB_ENABLED = new InjectionToken<boolean>('PROFILE_FILES_TAB_ENABLED', {
  providedIn: 'root',
  factory: () => true,
});

export type ProfileTabKey = 'uploads' | 'editor' | 'files' | 'preview';

interface ProfileTabDef {
  key: ProfileTabKey;
  label: string;
}

/**
 * English UI copy, matching the rest of the site (see the 2026-08-09 filters
 * copy fix). The work order (docs/PROFILE_PAGE_TABS.md) used Russian labels
 * in its own conversational text — that was never meant as the shipped UI
 * string, and S1 (PR #31) copying it verbatim was a work-order mistake,
 * caught in review of the live site. See that doc's amendment note.
 */
const ALL_TABS: ProfileTabDef[] = [
  { key: 'uploads', label: 'Uploads' },
  { key: 'editor', label: 'Editor' },
  { key: 'files', label: 'Rendered Files' },
  { key: 'preview', label: 'Test Resume' },
];

const DEFAULT_TAB: ProfileTabKey = 'editor';

@Component({
  selector: 'app-profile-tabs',
  imports: [
    ProfileEditorComponent,
    ProfileUploadsComponent,
    ProfileRenderedFilesComponent,
    ProfileTestResumeComponent,
  ],
  templateUrl: './profile-tabs.component.html',
  styleUrl: './profile-tabs.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ProfileTabsComponent {
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly authService = inject(AuthService);
  private readonly filesTabEnabled = inject(PROFILE_FILES_TAB_ENABLED);

  private readonly queryParams = toSignal(this.route.queryParamMap, { requireSync: true });

  /**
   * Tabs whose gate currently passes. `uploads`/`editor`/`preview` are
   * visible to every user (gating swap, owner decision 2026-09-01: Test
   * Resume is a customer-facing feature, Rendered Files is the internal
   * one); `files` requires BOTH `isOwner` and the site-side flag above —
   * a non-owner must never have it (or its content) reach the DOM, not
   * just have it hidden by CSS.
   */
  readonly visibleTabs = computed<ProfileTabDef[]>(() =>
    ALL_TABS.filter((tab) => {
      if (tab.key === 'files') return this.authService.isOwner() && this.filesTabEnabled;
      return true;
    }),
  );

  /**
   * Active tab, driven by `?tab=`. Falls back to `editor` when the param is
   * absent, unrecognized, or names a tab that isn't currently visible (e.g.
   * `?tab=preview` for a non-owner, or `?tab=files` while the flag is off) —
   * same house pattern as Settings' `?category=` (queryParamMap → computed,
   * unknown value falls back to the first/default entry).
   */
  readonly activeTab = computed<ProfileTabKey>(() => {
    const requested = this.queryParams().get('tab');
    const match = this.visibleTabs().find((tab) => tab.key === requested);
    return match?.key ?? DEFAULT_TAB;
  });

  selectTab(key: ProfileTabKey): void {
    void this.router.navigate([], {
      relativeTo: this.route,
      queryParams: { tab: key },
      queryParamsHandling: 'merge',
    });
  }
}
