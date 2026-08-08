import {
  ChangeDetectionStrategy,
  Component,
  OnInit,
  computed,
  inject,
  resource,
  signal,
} from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { FormControl, FormGroup, ReactiveFormsModule } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import { MatIconModule } from '@angular/material/icon';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatSelectModule } from '@angular/material/select';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatSnackBar } from '@angular/material/snack-bar';
import { SettingsApi } from '../../core/api/settings.api';
import { AuthService } from '../../core/auth/auth.service';
import {
  SettingItem,
  SettingsCategory,
  TelegramLinkCode,
  TelegramStatus,
  UserSettingItem,
} from '../../core/api/models';

@Component({
  selector: 'app-settings',
  imports: [
    ReactiveFormsModule,
    MatIconModule,
    MatProgressSpinnerModule,
    MatSelectModule,
    MatFormFieldModule,
    MatInputModule,
  ],
  templateUrl: './settings.component.html',
  styleUrl: './settings.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class SettingsComponent implements OnInit {
  private readonly api = inject(SettingsApi);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly snackBar = inject(MatSnackBar);
  protected readonly authService = inject(AuthService);

  // ── User editable settings ────────────────────────────────────────────────

  readonly userSettingsLoading = signal(true);
  readonly userSettingsError = signal<string | null>(null);
  readonly userSettings = signal<UserSettingItem[]>([]);
  readonly form = new FormGroup<Record<string, FormControl>>({});
  readonly saving = signal(false);
  private originalValues: Record<string, unknown> = {};

  readonly isDirty = signal(false);

  // ── Telegram ──────────────────────────────────────────────────────────────

  readonly telegramStatus = signal<TelegramStatus | null>(null);
  readonly telegramLinkCode = signal<TelegramLinkCode | null>(null);
  readonly telegramLoading = signal(false);
  readonly telegramCountdown = signal(0);
  private countdownInterval: ReturnType<typeof setInterval> | null = null;

  // ── Admin: global settings ────────────────────────────────────────────────

  readonly isAdmin = computed(() => this.authService.currentUser()?.role === 'admin');
  private readonly globalResource = resource({
    params: () => this.isAdmin(),
    loader: ({ params: admin }) =>
      admin ? this.api.getGlobalSettings() : Promise.resolve(null),
  });

  readonly globalCategories = computed(() => this.globalResource.value()?.categories ?? []);
  readonly globalLoading = this.globalResource.isLoading;
  readonly globalError = computed(() =>
    this.globalResource.error() ? 'Could not load global settings.' : null,
  );
  private readonly queryParams = toSignal(this.route.queryParamMap, { requireSync: true });

  /** Active global-settings category, driven by the ?category= query param. */
  readonly activeCategory = computed(() => {
    const list = this.globalCategories();
    const requested = this.queryParams().get('category');
    return list.find((c) => c.name === requested) ?? list[0] ?? null;
  });

  selectCategory(category: SettingsCategory): void {
    void this.router.navigate([], {
      relativeTo: this.route,
      queryParams: { category: category.name },
      queryParamsHandling: 'merge',
    });
  }

  async ngOnInit(): Promise<void> {
    await Promise.all([this.loadUserSettings(), this.loadTelegramStatus()]);
  }

  private async loadUserSettings(): Promise<void> {
    this.userSettingsLoading.set(true);
    this.userSettingsError.set(null);
    try {
      const res = await this.api.getUserSettings();
      this.userSettings.set(res.settings);
      this.buildForm(res.settings);
    } catch {
      this.userSettingsError.set('Could not load settings.');
    } finally {
      this.userSettingsLoading.set(false);
    }
  }

  private buildForm(settings: UserSettingItem[]): void {
    settings.forEach((s) => {
      const ctrl = new FormControl(s.value ?? null);
      this.form.addControl(s.key, ctrl);
      this.originalValues[s.key] = s.value ?? null;
    });
    this.form.valueChanges.subscribe(() => {
      const current = this.form.getRawValue();
      const dirty = Object.keys(current).some(
        (k) => current[k] !== this.originalValues[k],
      );
      this.isDirty.set(dirty);
    });
  }

  async save(): Promise<void> {
    if (this.saving() || !this.isDirty()) return;
    this.saving.set(true);
    try {
      await this.api.updateUserSettings(this.form.getRawValue());
      this.originalValues = { ...this.form.getRawValue() };
      this.isDirty.set(false);
      this.snackBar.open('Settings saved.', undefined, { duration: 3000 });
    } catch {
      this.snackBar.open('Could not save settings.', 'Dismiss', { duration: 4000 });
    } finally {
      this.saving.set(false);
    }
  }

  // ── Telegram ──────────────────────────────────────────────────────────────

  private async loadTelegramStatus(): Promise<void> {
    try {
      const status = await this.api.getTelegramStatus();
      this.telegramStatus.set(status);
    } catch {
      // non-fatal; Telegram card will show an error state
    }
  }

  async connectTelegram(): Promise<void> {
    if (this.telegramLoading()) return;
    this.telegramLoading.set(true);
    try {
      const code = await this.api.generateTelegramLinkCode();
      this.telegramLinkCode.set(code);
      this.startCountdown(code.expiresAt);
      void this.pollTelegramStatus();
    } catch {
      this.snackBar.open('Could not generate Telegram link code.', 'Dismiss', { duration: 4000 });
    } finally {
      this.telegramLoading.set(false);
    }
  }

  private startCountdown(expiresAt: string): void {
    if (this.countdownInterval) clearInterval(this.countdownInterval);
    const tick = () => {
      const remaining = Math.max(0, Math.floor((new Date(expiresAt).getTime() - Date.now()) / 1000));
      this.telegramCountdown.set(remaining);
      if (remaining === 0 && this.countdownInterval) {
        clearInterval(this.countdownInterval);
        this.countdownInterval = null;
        this.telegramLinkCode.set(null);
      }
    };
    tick();
    this.countdownInterval = setInterval(tick, 1000);
  }

  private async pollTelegramStatus(): Promise<void> {
    // Poll every 4 s while the link code is active
    while (this.telegramLinkCode() && this.telegramCountdown() > 0) {
      await new Promise((r) => setTimeout(r, 4000));
      try {
        const status = await this.api.getTelegramStatus();
        this.telegramStatus.set(status);
        if (status.linked) {
          this.telegramLinkCode.set(null);
          if (this.countdownInterval) clearInterval(this.countdownInterval);
          this.snackBar.open('Telegram connected!', undefined, { duration: 4000 });
          break;
        }
      } catch {
        break;
      }
    }
  }

  // ── Global settings helpers ───────────────────────────────────────────────

  isTruthy(value: string | null): boolean {
    if (!value) return false;
    return ['true', '1', 'yes'].includes(value.toLowerCase());
  }

  displayValue(item: SettingItem): string {
    return item.value ?? '(not set)';
  }

  tagClassFor(item: SettingItem): string {
    if (item.isSecret) return 'tag tag-neutral';
    if (item.type === 'boolean') return 'tag tag-boolean';
    return 'tag tag-outline';
  }

  formatCountdown(secs: number): string {
    const m = Math.floor(secs / 60).toString().padStart(2, '0');
    const s = (secs % 60).toString().padStart(2, '0');
    return `${m}:${s}`;
  }
}
