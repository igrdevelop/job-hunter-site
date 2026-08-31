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

/**
 * Site-side feature flag for tab 3 (Rendered files) — default ON per the
 * work order (docs/PROFILE_PAGE_TABS.md: "ships visible to ALL users,
 * behind its own site-side flag (default ON) so it can be hidden later
 * without rework"). Independent of `AuthService.isOwner`, which gates tab 4
 * — see PROFILE_PAGE_TABS.md's "Flag discipline" note: don't collapse the
 * two into one flag.
 * An InjectionToken rather than a bare `export const` (unlike
 * `PROFILE_MOCK_FALLBACK_ENABLED`/`FILTERS_MOCK_FALLBACK_ENABLED`, which are
 * fixed for a whole build): this flag needs to flip per-render for tests
 * ("tab-3 flag OFF removes the tab") and is the one the doc says may need
 * pulling back independently later, so it's provided/overridable like any
 * other Angular config value.
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

/** Labels are the exact Russian copy from the owner-approved work order (docs/PROFILE_PAGE_TABS.md). */
const ALL_TABS: ProfileTabDef[] = [
  { key: 'uploads', label: 'Загрузки' },
  { key: 'editor', label: 'Редактор' },
  { key: 'files', label: 'Итоговые файлы' },
  { key: 'preview', label: 'Тестовое резюме' },
];

const DEFAULT_TAB: ProfileTabKey = 'editor';

@Component({
  selector: 'app-profile-tabs',
  imports: [ProfileEditorComponent],
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
   * Tabs whose gate currently passes. `uploads`/`editor` are always visible;
   * `files` follows the site-side flag above, `preview` follows `isOwner` —
   * a non-owner must never have tab 4 (or its content) reach the DOM, not
   * just have it hidden by CSS.
   */
  readonly visibleTabs = computed<ProfileTabDef[]>(() =>
    ALL_TABS.filter((tab) => {
      if (tab.key === 'files') return this.filesTabEnabled;
      if (tab.key === 'preview') return this.authService.isOwner();
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
