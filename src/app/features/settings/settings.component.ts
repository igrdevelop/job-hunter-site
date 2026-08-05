import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  resource,
  signal,
} from '@angular/core';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatTabsModule } from '@angular/material/tabs';
import { SettingsApi } from '../../core/api/settings.api';
import { SettingItem } from '../../core/api/models';

@Component({
  selector: 'app-settings',
  imports: [MatTabsModule, MatProgressSpinnerModule],
  templateUrl: './settings.component.html',
  styleUrl: './settings.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class SettingsComponent {
  private readonly api = inject(SettingsApi);

  private readonly settingsResource = resource({
    loader: () => this.api.getSettings(),
  });

  readonly categories = computed(() => this.settingsResource.value()?.categories ?? []);
  readonly loading = this.settingsResource.isLoading;
  readonly errorMessage = computed(() =>
    this.settingsResource.error()
      ? 'Could not load settings. Is the API reachable?'
      : null,
  );
  readonly selectedTabIndex = signal(0);

  isTruthy(value: string | null): boolean {
    if (!value) return false;
    return ['true', '1', 'yes'].includes(value.toLowerCase());
  }

  displayValue(item: SettingItem): string {
    if (item.value === null) return '(not set)';
    return item.value;
  }

  tagClassFor(item: SettingItem): string {
    if (item.isSecret) return 'tag tag-neutral';
    if (item.type === 'boolean') return 'tag tag-accent';
    return 'tag tag-outline';
  }
}
