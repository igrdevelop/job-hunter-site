import { Component, inject, signal } from '@angular/core';
import { MatIconModule } from '@angular/material/icon';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatTabsModule } from '@angular/material/tabs';
import { ApiService } from '../../core/api/api.service';
import { SettingsCategory, SettingItem } from '../../core/api/models';

@Component({
  selector: 'app-settings',
  standalone: true,
  imports: [MatTabsModule, MatProgressSpinnerModule, MatIconModule],
  templateUrl: './settings.component.html',
  styleUrl: './settings.component.scss',
})
export class SettingsComponent {
  private readonly api = inject(ApiService);

  readonly categories = signal<SettingsCategory[]>([]);
  readonly loading = signal(false);
  readonly errorMessage = signal<string | null>(null);
  readonly selectedTabIndex = signal(0);

  constructor() {
    void this.load();
  }

  async load(): Promise<void> {
    this.loading.set(true);
    this.errorMessage.set(null);
    try {
      const response = await this.api.getSettings();
      this.categories.set(response.categories);
    } catch {
      this.errorMessage.set('Could not load settings. Is the API reachable?');
    } finally {
      this.loading.set(false);
    }
  }

  isTruthy(value: string | null): boolean {
    if (!value) return false;
    return ['true', '1', 'yes'].includes(value.toLowerCase());
  }

  displayValue(item: SettingItem): string {
    if (item.value === null) return '(not set)';
    return item.value;
  }
}
